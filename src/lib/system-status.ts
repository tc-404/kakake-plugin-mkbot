// ---------------------------------------------------------------------------
// 系统状态采集（「运行状态」卡片数据源）
// 全异步实现：不使用 execSync，也不用子进程 Start-Sleep，
// 采集期间不会阻塞事件循环；所有外部命令都带超时、maxBuffer 与并发保护。
// ---------------------------------------------------------------------------

import os from 'os';
import { execFile } from 'child_process';
import { readFile } from 'fs/promises';
import type { MkLogger } from '../types';

/** 单个磁盘（Windows 逻辑盘 / Unix 挂载点） */
export interface MkDiskVolume {
  /** 盘符或挂载点，如 C: 或 / */
  name: string;
  /** 卷标或文件系统名，可能为空 */
  label: string;
  total: number;
  free: number;
  used: number;
  usagePercent: string;
}

export interface MkDiskInfo {
  total: number;
  free: number;
  used: number;
  usagePercent: string;
  /** 各磁盘明细（取不到时为空数组，调用方需兜底） */
  volumes: MkDiskVolume[];
}

export interface MkSystemInfo {
  platform: string;
  type: string;
  arch: string;
  hostname: string;
  cpuCount: number;
  cpuModel: string;
  cpuUsagePercent: string;
  totalMemory: number;
  freeMemory: number;
  usedMemory: number;
  memoryUsagePercent: string;
  systemUptime: number;
  processUptime: number;
  processMemory: number;
  nodeVersion: string;
  disk: MkDiskInfo;
}

export interface MkProcessInfo {
  pid: string;
  name: string;
  memory: number;
  memoryMB: string;
  cpuPercent: string;
  /**
   * 完整命令行（Linux `ps args` / Windows Win32_Process.CommandLine）。
   * 协议框架多以 `node /opt/napcat/napcat.mjs` 启动，comm 只有 "node"，
   * 只按进程名匹配必然漏判，所以识别时同时看 name 与 cmdline。
   */
  cmdline?: string;
}

/** 关键进程：宿主框架 / QQ / 协议框架（MKbot 与宿主同进程，不单独列） */
export interface MkKeyProcessInfo {
  key: 'host' | 'qq' | 'protocol';
  /** 展示名（宿主框架名可由调用方覆盖） */
  label: string;
  /** 实际进程名或说明文字 */
  name: string;
  pid: string;
  memoryMB: string;
  cpuPercent: string;
  running: boolean;
}

/** 网络流量：累计收发 + 实时上下行速率 */
export interface MkNetworkInfo {
  /** 主网卡展示名 */
  interfaceName: string;
  /** 累计接收字节（网卡计数器，通常自开机起算） */
  rxTotal: number;
  /** 累计发送字节 */
  txTotal: number;
  /** 实时下行速率（字节/秒） */
  rxRate: number;
  /** 实时上行速率（字节/秒） */
  txRate: number;
  /** 速率采样窗口（毫秒） */
  sampleMs: number;
  /** 是否成功取到计数器 */
  available: boolean;
}

export interface MkSystemStatusSnapshot {
  systemInfo: MkSystemInfo;
  /** 按内存降序的前 20 条，供进程排行榜展示 */
  processes: MkProcessInfo[];
  /** 完整进程表：关键进程要按「最新协议身份」重新解析，不能只看 top 20 */
  processPool: MkProcessInfo[];
  keyProcesses: MkKeyProcessInfo[];
  network: MkNetworkInfo;
}

/** CPU 使用率采样间隔（纯 JS 定时器，不阻塞） */
const CPU_SAMPLE_INTERVAL_MS = 250;
/** 进程 CPU 占比两次采样的间隔；太短会因 CPU 秒数精度导致全 0 */
const PROCESS_SAMPLE_INTERVAL_MS = 800;
/** 单条外部命令超时；超时后子进程被杀掉，绝不会挂住 */
const EXEC_TIMEOUT_MS = 8000;
const EXEC_MAX_BUFFER = 8 * 1024 * 1024;
/** 快照缓存时长：短时间内重复触发直接复用，避免子进程风暴 */
const SNAPSHOT_TTL_MS = 3000;
/** 进程排行榜保留条数 */
const PROCESS_KEEP = 20;

const EMPTY_DISK: MkDiskInfo = { total: 0, free: 0, used: 0, usagePercent: '0.00', volumes: [] };
/** 磁盘明细保留上限：渲染端最多展示 5 条，这里多留一些让「其余合并」有数据 */
const DISK_VOLUME_KEEP = 32;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function warn(logger: MkLogger | null | undefined, msg: string, ...args: unknown[]): void {
  try {
    logger?.warn?.(msg, ...args);
  } catch {
    /* logger 不可用时忽略 */
  }
}

/** 运行外部命令：不走 shell、带超时与输出上限，失败返回 null 而不抛 */
function runCommand(file: string, args: string[], timeoutMs = EXEC_TIMEOUT_MS): Promise<string | null> {
  return new Promise((resolve) => {
    try {
      execFile(
        file,
        args,
        {
          encoding: 'utf-8',
          timeout: timeoutMs,
          maxBuffer: EXEC_MAX_BUFFER,
          windowsHide: true,
        },
        (error, stdout) => {
          if (error) {
            resolve(null);
            return;
          }
          resolve(String(stdout ?? ''));
        },
      );
    } catch {
      resolve(null);
    }
  });
}

function runPowerShell(script: string, timeoutMs = EXEC_TIMEOUT_MS): Promise<string | null> {
  // PowerShell 默认按控制台代码页（中文系统是 GBK）输出，Node 按 utf-8 解码会乱码；
  // 先把输出编码切成 UTF-8，网卡名之类的中文才不会变成问号。
  const wrapped = `try { [Console]::OutputEncoding = [System.Text.Encoding]::UTF8 } catch {} ; ${script}`;
  return runCommand(
    'powershell.exe',
    ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', wrapped],
    timeoutMs,
  );
}

function clampPercent(value: number): string {
  if (!Number.isFinite(value) || value < 0) return '0.00';
  return Math.min(100, value).toFixed(2);
}

// ================== CPU 使用率 ==================

function readCpuTimes(): { idle: number; total: number } {
  let idle = 0;
  let total = 0;
  for (const cpu of os.cpus() || []) {
    const t = cpu?.times;
    if (!t) continue;
    idle += t.idle;
    total += t.user + t.nice + t.sys + t.idle + t.irq;
  }
  return { idle, total };
}

/**
 * 跨平台 CPU 使用率：两次读取 os.cpus() 的累计时间做差。
 * 零子进程、零阻塞，Windows / Linux / macOS 通用。
 */
async function measureCpuUsagePercent(): Promise<number | null> {
  const first = readCpuTimes();
  if (first.total <= 0) return null;
  await sleep(CPU_SAMPLE_INTERVAL_MS);
  const second = readCpuTimes();
  const totalDelta = second.total - first.total;
  const idleDelta = second.idle - first.idle;
  if (!(totalDelta > 0)) return null;
  const used = ((totalDelta - idleDelta) / totalDelta) * 100;
  return Number.isFinite(used) ? used : null;
}

/** Windows 兜底：os.cpus() 差值异常时用 CIM 读取负载百分比 */
async function readWindowsCpuUsagePercent(): Promise<number | null> {
  const out = await runPowerShell(
    '(Get-CimInstance Win32_Processor | Measure-Object -Property LoadPercentage -Average).Average',
  );
  if (out == null) return null;
  const v = parseFloat(String(out).trim());
  return Number.isFinite(v) ? v : null;
}

async function resolveCpuUsagePercent(logger?: MkLogger | null): Promise<string> {
  let v = await measureCpuUsagePercent();
  if (v == null && os.platform() === 'win32') {
    v = await readWindowsCpuUsagePercent();
  }
  if (v == null) {
    warn(logger, '[系统状态] 获取 CPU 使用率失败，已显示 0.00%');
    return '0.00';
  }
  return clampPercent(v);
}

// ================== 磁盘 ==================

/** 由各磁盘明细汇总出总量；volumes 已按展示顺序排好 */
function summarizeVolumes(volumes: MkDiskVolume[]): MkDiskInfo | null {
  const list = volumes.filter((v) => v.total > 0).slice(0, DISK_VOLUME_KEEP);
  if (!list.length) return null;
  const total = list.reduce((s, v) => s + v.total, 0);
  const free = list.reduce((s, v) => s + v.free, 0);
  const used = Math.max(0, total - free);
  return { total, free, used, usagePercent: ((used / total) * 100).toFixed(2), volumes: list };
}

function makeVolume(name: string, label: string, total: number, free: number): MkDiskVolume {
  const t = Math.max(0, total);
  const f = Math.max(0, Math.min(t, free));
  const used = Math.max(0, t - f);
  return {
    name,
    label,
    total: t,
    free: f,
    used,
    usagePercent: t > 0 ? ((used / t) * 100).toFixed(2) : '0.00',
  };
}

/** Windows：逐个逻辑盘取容量（DriveType=3 即本地固定磁盘），再汇总 */
async function readWindowsDiskInfo(): Promise<MkDiskInfo | null> {
  const out = await runPowerShell(
    'Get-CimInstance Win32_LogicalDisk -Filter "DriveType=3" | Select-Object DeviceID,VolumeName,Size,FreeSpace | ConvertTo-Json -Compress',
  );
  if (out == null) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(String(out).trim() || '[]');
  } catch {
    return null;
  }
  const list = Array.isArray(parsed) ? parsed : parsed ? [parsed] : [];
  const volumes: MkDiskVolume[] = [];
  for (const raw of list) {
    const d = raw as { DeviceID?: unknown; VolumeName?: unknown; Size?: unknown; FreeSpace?: unknown };
    const name = String(d.DeviceID ?? '').trim();
    const total = Number(d.Size ?? 0) || 0;
    if (!name || total <= 0) continue;
    volumes.push(makeVolume(name, String(d.VolumeName ?? '').trim(), total, Number(d.FreeSpace ?? 0) || 0));
  }
  volumes.sort((a, b) => a.name.localeCompare(b.name));
  return summarizeVolumes(volumes);
}

/** 伪文件系统：不算真实磁盘 */
const PSEUDO_FS = /^(tmpfs|devtmpfs|devfs|squashfs|ramfs|proc|sysfs|cgroup|overlay|aufs|udev|none|map\b)/i;

/** Unix：`df -kP` 全量挂载点，过滤伪文件系统并按设备去重 */
function parseDfAllOutput(output: string): MkDiskVolume[] {
  const lines = String(output || '')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  const volumes: MkDiskVolume[] = [];
  const seen = new Set<string>();
  for (const line of lines.slice(1)) {
    const parts = line.split(/\s+/);
    if (parts.length < 6) continue;
    const fs = parts[0];
    const totalKb = Number(parts[1]);
    const freeKb = Number(parts[3]);
    const mount = parts.slice(5).join(' ');
    if (!Number.isFinite(totalKb) || totalKb <= 0) continue;
    if (mount !== '/' && (PSEUDO_FS.test(fs) || /^\/(proc|sys|dev|run|snap)(\/|$)/.test(mount))) continue;
    if (seen.has(fs)) continue;
    seen.add(fs);
    volumes.push(makeVolume(mount, fs, totalKb * 1024, (Number.isFinite(freeKb) ? freeKb : 0) * 1024));
  }
  // 根分区排在最前，其余按挂载点排序
  volumes.sort((a, b) => (a.name === '/' ? -1 : b.name === '/' ? 1 : a.name.localeCompare(b.name)));
  return volumes;
}

/** 解析 `df -k /` 输出；兼容设备名过长导致的折行 */
function parseDfOutput(output: string): MkDiskInfo | null {
  const lines = String(output || '')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length < 2) return null;
  const parts = lines[lines.length - 1].split(/\s+/);
  const offset = /^\d+$/.test(parts[0] || '') ? 0 : 1;
  const totalKb = Number(parts[offset]);
  const usedKb = Number(parts[offset + 1]);
  const freeKb = Number(parts[offset + 2]);
  if (!Number.isFinite(totalKb) || totalKb <= 0) return null;
  const total = totalKb * 1024;
  const used = Number.isFinite(usedKb) ? usedKb * 1024 : 0;
  const free = Number.isFinite(freeKb) ? freeKb * 1024 : Math.max(0, total - used);
  return {
    total,
    used,
    free,
    usagePercent: ((used / total) * 100).toFixed(2),
    volumes: [makeVolume('/', parts[offset - 1] || '', total, free)],
  };
}

async function resolveDiskInfo(logger?: MkLogger | null): Promise<MkDiskInfo> {
  try {
    if (os.platform() === 'win32') {
      const info = await readWindowsDiskInfo();
      if (info) return info;
    } else {
      // -k / -P 为 POSIX 选项，busybox / macOS 均可用（-B1 仅 GNU 支持）
      const all = await runCommand('df', ['-kP']);
      const multi = all == null ? null : summarizeVolumes(parseDfAllOutput(all));
      if (multi) return multi;
      const out = await runCommand('df', ['-k', '/']);
      const info = out == null ? null : parseDfOutput(out);
      if (info) return info;
    }
  } catch (error) {
    warn(logger, '[系统状态] 获取磁盘信息失败:', error);
    return { ...EMPTY_DISK };
  }
  warn(logger, '[系统状态] 获取磁盘信息失败，已显示 0');
  return { ...EMPTY_DISK };
}

// ================== 进程列表 ==================

interface WinProcSample {
  pid: number;
  name: string;
  cpuSec: number;
  ws: number;
}

async function sampleWindowsProcesses(): Promise<Map<number, WinProcSample> | null> {
  const out = await runPowerShell(
    'Get-Process | Select-Object Id,ProcessName,CPU,WorkingSet64 | ConvertTo-Json -Compress',
  );
  if (out == null) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(out || '[]');
  } catch {
    return null;
  }
  const list = Array.isArray(parsed) ? parsed : parsed ? [parsed] : [];
  const map = new Map<number, WinProcSample>();
  for (const raw of list) {
    const p = raw as { Id?: unknown; ProcessName?: unknown; CPU?: unknown; WorkingSet64?: unknown };
    const pid = Number(p?.Id);
    if (!Number.isFinite(pid)) continue;
    map.set(pid, {
      pid,
      name: `${String(p?.ProcessName || 'Unknown')}.exe`,
      cpuSec: Number(p?.CPU) || 0,
      ws: Number(p?.WorkingSet64) || 0,
    });
  }
  return map;
}

async function readWindowsProcessList(logger?: MkLogger | null): Promise<MkProcessInfo[]> {
  const t1 = Date.now();
  const first = await sampleWindowsProcesses();
  if (!first) {
    warn(logger, '[系统状态] 获取进程列表失败（Get-Process 无输出）');
    return [];
  }
  await sleep(PROCESS_SAMPLE_INTERVAL_MS);
  const t2 = Date.now();
  const second = await sampleWindowsProcesses();
  if (!second) {
    // 第二次采样失败：退化为只报内存，CPU 占比按 0 显示，不整体丢数据
    warn(logger, '[系统状态] 进程 CPU 采样失败，仅显示内存占用');
    return [...first.values()].map((p) => ({
      pid: String(p.pid),
      name: p.name,
      memory: p.ws,
      memoryMB: (p.ws / 1024 / 1024).toFixed(2),
      cpuPercent: '0.0',
    }));
  }

  const dtSec = Math.max(0.2, (t2 - t1) / 1000);
  const cores = Math.max(1, os.cpus().length);
  const processes: MkProcessInfo[] = [];
  for (const [pid, p2] of second.entries()) {
    const p1 = first.get(pid);
    const cpuDelta = p2.cpuSec - (p1?.cpuSec || 0);
    // 单进程最多占用 cores*100%，归一化到 0~100
    const cpuPercent = Math.max(0, (cpuDelta / dtSec) * 100 / cores);
    processes.push({
      pid: String(pid),
      name: p2.name,
      memory: p2.ws,
      memoryMB: (p2.ws / 1024 / 1024).toFixed(2),
      cpuPercent: cpuPercent.toFixed(1),
    });
  }
  return processes;
}

/** 解析 `ps -eo pid=,rss=,pcpu=,comm=` 的定制输出 */
function parsePsFormatted(output: string): MkProcessInfo[] {
  const processes: MkProcessInfo[] = [];
  for (const line of String(output || '').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const parts = trimmed.split(/\s+/);
    if (parts.length < 4) continue;
    const memoryKb = parseInt(parts[1] || '0', 10) || 0;
    processes.push({
      pid: parts[0] || 'N/A',
      name: parts.slice(3).join(' ') || 'Unknown',
      memory: memoryKb * 1024,
      memoryMB: (memoryKb / 1024).toFixed(2),
      cpuPercent: parts[2] || '0',
    });
  }
  return processes;
}

/** 解析 `ps aux` 的位置输出（兜底） */
function parsePsAux(output: string): MkProcessInfo[] {
  const processes: MkProcessInfo[] = [];
  const lines = String(output || '')
    .split(/\r?\n/)
    .slice(1)
    .filter((l) => l.trim());
  for (const line of lines) {
    const parts = line.trim().split(/\s+/);
    if (parts.length < 11) continue;
    const memoryKb = parseInt(parts[5] || '0', 10) || 0;
    processes.push({
      pid: parts[1] || 'N/A',
      name: parts[10] || 'Unknown',
      memory: memoryKb * 1024,
      memoryMB: (memoryKb / 1024).toFixed(2),
      cpuPercent: parts[2] || '0',
      // ps aux 从第 11 列起就是完整命令行，顺手带上，省掉一次额外 ps
      cmdline: parts.slice(10).join(' ').trim() || undefined,
    });
  }
  return processes;
}

async function readUnixProcessList(logger?: MkLogger | null): Promise<MkProcessInfo[]> {
  const formatted = await runCommand('ps', ['-eo', 'pid=,rss=,pcpu=,comm=']);
  if (formatted != null) {
    const list = parsePsFormatted(formatted);
    if (list.length) return list;
  }
  const aux = await runCommand('ps', ['aux']);
  if (aux != null) {
    const list = parsePsAux(aux);
    if (list.length) return list;
  }
  warn(logger, '[系统状态] 获取进程列表失败');
  return [];
}

/**
 * 解析 `ps -eo pid=,args=`：pid → 完整命令行。
 * comm 只给可执行名（且常被截到 15 字符），NapCat / SnowLuma 这类
 * `node xxx.mjs` 启动的协议端 comm 只有 "node"，必须靠 args 才能认出来。
 */
export function parsePsArgs(output: string): Map<string, string> {
  const map = new Map<string, string>();
  for (const line of String(output || '').split(/\r?\n/)) {
    const m = line.trim().match(/^(\d+)\s+(.+)$/);
    if (!m) continue;
    const cmd = m[2]!.trim();
    if (cmd) map.set(m[1]!, cmd);
  }
  return map;
}

/** Windows 侧等价物：Win32_Process.CommandLine（Get-Process 不带这个字段） */
export function parseWindowsCmdlines(output: string): Map<string, string> {
  const map = new Map<string, string>();
  try {
    const parsed = JSON.parse(String(output || '[]'));
    const rows = Array.isArray(parsed) ? parsed : parsed ? [parsed] : [];
    for (const raw of rows) {
      const p = raw as { ProcessId?: unknown; CommandLine?: unknown };
      const pid = String(p?.ProcessId ?? '').trim();
      const cmd = String(p?.CommandLine ?? '').trim();
      if (pid && cmd) map.set(pid, cmd);
    }
  } catch {
    /* 命令不可用 / 输出不是 JSON：留空即可，识别逻辑会退回只按进程名 */
  }
  return map;
}

async function readProcessCmdlines(platform: string): Promise<Map<string, string>> {
  if (platform === 'win32') {
    const out = await runPowerShell(
      'Get-CimInstance Win32_Process | Select-Object ProcessId,CommandLine | ConvertTo-Json -Compress',
    );
    return out ? parseWindowsCmdlines(out) : new Map();
  }
  const out = await runCommand('ps', ['-eo', 'pid=,args=']);
  return out ? parsePsArgs(out) : new Map();
}

/** 把命令行并进进程表；取不到时静默跳过，绝不因此丢掉整份进程数据 */
export function attachProcessCmdlines(list: MkProcessInfo[], cmdlines: Map<string, string>): MkProcessInfo[] {
  if (!cmdlines?.size) return list;
  for (const p of list) {
    const cmd = cmdlines.get(String(p.pid));
    if (cmd) p.cmdline = cmd;
  }
  return list;
}

// ================== 网络流量 ==================

/** 网卡计数器两次采样的间隔（与进程采样并行，不额外拉长总耗时） */
const NET_SAMPLE_INTERVAL_MS = 800;

interface NetCounter {
  name: string;
  rx: number;
  tx: number;
}

const EMPTY_NETWORK: MkNetworkInfo = {
  interfaceName: '未检测到网卡',
  rxTotal: 0,
  txTotal: 0,
  rxRate: 0,
  txRate: 0,
  sampleMs: 0,
  available: false,
};

/** 回环 / 虚拟 / 隧道网卡：只作展示用，直接跳过 */
const NET_SKIP_RE =
  /^(lo$|lo\d|loopback|isatap|teredo|pseudo|vmnet|vethernet|virbr|docker|br-|veth|tun\d|tap\d|utun|awdl|llw|bridge|gif|stf|zt|tailscale|wg\d|npcap)/i;

/** 主网卡：跳过虚拟网卡后取收发合计最大的那张 */
function pickBusiestInterface(list: NetCounter[]): NetCounter | null {
  let best: NetCounter | null = null;
  for (const c of list) {
    if (!c || !String(c.name || '').trim()) continue;
    if (NET_SKIP_RE.test(c.name)) continue;
    if (!(c.rx > 0 || c.tx > 0)) continue;
    if (!best || c.rx + c.tx > best.rx + best.tx) best = c;
  }
  return best;
}

/** Linux：直接读 /proc/net/dev，零子进程 */
async function readLinuxNetCounters(): Promise<NetCounter[] | null> {
  try {
    const text = await readFile('/proc/net/dev', 'utf-8');
    const list: NetCounter[] = [];
    for (const line of String(text).split(/\r?\n/)) {
      const idx = line.indexOf(':');
      if (idx <= 0) continue;
      const name = line.slice(0, idx).trim();
      if (!name) continue;
      const cols = line
        .slice(idx + 1)
        .trim()
        .split(/\s+/)
        .map((v) => Number(v));
      // 列顺序：接收 bytes packets errs drop fifo frame compressed multicast，随后是发送 bytes...
      if (cols.length < 9) continue;
      list.push({ name, rx: Number(cols[0]) || 0, tx: Number(cols[8]) || 0 });
    }
    return list.length ? list : null;
  } catch {
    return null;
  }
}

/** Windows：优先 Get-NetAdapterStatistics，老系统回退性能计数器 */
async function readWindowsNetCounters(): Promise<NetCounter[] | null> {
  const script = [
    '$r = @();',
    'try { $r = @(Get-NetAdapterStatistics -ErrorAction Stop) } catch { $r = @() }',
    'if ($r.Count -eq 0) {',
    '  $r = @(Get-CimInstance Win32_PerfRawData_Tcpip_NetworkInterface -ErrorAction SilentlyContinue |',
    "    ForEach-Object { [pscustomobject]@{ Name = $_.Name; ReceivedBytes = [int64]$_.BytesReceivedPersec; SentBytes = [int64]$_.BytesSentPersec } })",
    '}',
    '$r | Select-Object Name,ReceivedBytes,SentBytes | ConvertTo-Json -Compress',
  ].join(' ');
  const out = await runPowerShell(script);
  if (out == null) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(String(out).trim() || '[]');
  } catch {
    return null;
  }
  const rows = Array.isArray(parsed) ? parsed : parsed ? [parsed] : [];
  const list: NetCounter[] = [];
  for (const raw of rows) {
    const p = raw as { Name?: unknown; ReceivedBytes?: unknown; SentBytes?: unknown };
    const name = String(p?.Name || '').trim();
    if (!name) continue;
    list.push({ name, rx: Number(p?.ReceivedBytes) || 0, tx: Number(p?.SentBytes) || 0 });
  }
  return list.length ? list : null;
}

/** macOS：netstat -ib（同名网卡多行时取字节数最大的一行） */
async function readMacNetCounters(): Promise<NetCounter[] | null> {
  const out = await runCommand('netstat', ['-ib']);
  if (out == null) return null;
  const best = new Map<string, NetCounter>();
  for (const line of String(out).split(/\r?\n/).slice(1)) {
    const p = line.trim().split(/\s+/);
    if (p.length < 10) continue;
    const name = p[0];
    const rx = Number(p[6]);
    const tx = Number(p[9]);
    if (!name || !Number.isFinite(rx) || !Number.isFinite(tx)) continue;
    const prev = best.get(name);
    if (!prev || rx + tx > prev.rx + prev.tx) best.set(name, { name, rx, tx });
  }
  return best.size ? [...best.values()] : null;
}

function readNetCounters(): Promise<NetCounter[] | null> {
  const platform = os.platform();
  if (platform === 'win32') return readWindowsNetCounters();
  if (platform === 'darwin') return readMacNetCounters();
  return readLinuxNetCounters();
}

/**
 * 网络流量：累计收发取网卡计数器，实时速率由两次采样做差。
 * 全异步（Linux 读 /proc，Windows 走带超时的 PowerShell），失败时整体降级为不可用。
 */
async function collectNetwork(logger?: MkLogger | null): Promise<MkNetworkInfo> {
  try {
    const t1 = Date.now();
    const first = await readNetCounters();
    const a = first ? pickBusiestInterface(first) : null;
    if (!a) {
      warn(logger, '[系统状态] 获取网络流量失败，未找到可用网卡');
      return { ...EMPTY_NETWORK };
    }
    await sleep(NET_SAMPLE_INTERVAL_MS);
    const t2 = Date.now();
    const second = await readNetCounters();
    const b = second ? second.find((c) => c.name === a.name) || null : null;
    const sampleMs = Math.max(1, t2 - t1);
    // 计数器回绕或网卡重置时差值为负，按 0 处理而不是显示天文数字
    const rxRate = b ? Math.max(0, ((b.rx - a.rx) * 1000) / sampleMs) : 0;
    const txRate = b ? Math.max(0, ((b.tx - a.tx) * 1000) / sampleMs) : 0;
    const cur = b || a;
    return {
      interfaceName: cur.name || '主网卡',
      rxTotal: Math.max(0, cur.rx),
      txTotal: Math.max(0, cur.tx),
      rxRate,
      txRate,
      sampleMs: b ? sampleMs : 0,
      available: true,
    };
  } catch (error) {
    warn(logger, '[系统状态] 获取网络流量失败:', error);
    return { ...EMPTY_NETWORK };
  }
}

/** 网络流量（异步，不阻塞事件循环） */
export async function getNetworkInfo(logger?: MkLogger | null): Promise<MkNetworkInfo> {
  return collectNetwork(logger);
}

// ================== 对外接口 ==================

/** 系统信息（异步，不阻塞事件循环） */
export async function getSystemInfo(logger?: MkLogger | null): Promise<MkSystemInfo> {
  const totalMemory = os.totalmem();
  const freeMemory = os.freemem();
  const usedMemory = totalMemory - freeMemory;
  const memoryUsagePercent = totalMemory > 0 ? ((usedMemory / totalMemory) * 100).toFixed(2) : '0.00';

  const [cpuUsagePercent, disk] = await Promise.all([
    resolveCpuUsagePercent(logger),
    resolveDiskInfo(logger),
  ]);

  const cpus = os.cpus();

  return {
    platform: os.platform(),
    type: os.type(),
    arch: os.arch(),
    hostname: os.hostname(),
    cpuCount: cpus.length,
    cpuModel: String(cpus[0]?.model || '').trim() || '未知处理器',
    cpuUsagePercent,
    totalMemory,
    freeMemory,
    usedMemory,
    memoryUsagePercent,
    systemUptime: os.uptime(),
    processUptime: process.uptime(),
    processMemory: process.memoryUsage().rss,
    nodeVersion: process.version,
    disk,
  };
}

/** 进程列表（按内存降序；异步，不阻塞事件循环） */
async function collectProcesses(logger?: MkLogger | null): Promise<MkProcessInfo[]> {
  try {
    const platform = os.platform();
    // 进程表与「pid → 完整命令行」并行采集；命令行取不到不影响原有数据
    const [processes, cmdlines] = await Promise.all([
      platform === 'win32' ? readWindowsProcessList(logger) : readUnixProcessList(logger),
      readProcessCmdlines(platform),
    ]);
    attachProcessCmdlines(processes, cmdlines);
    return processes.sort((a, b) => b.memory - a.memory);
  } catch (error) {
    warn(logger, '[系统状态] 获取进程列表失败:', error);
    return [];
  }
}

/** 进程列表（按内存降序，最多 20 条；异步，不阻塞事件循环） */
export async function getProcessList(logger?: MkLogger | null): Promise<MkProcessInfo[]> {
  return (await collectProcesses(logger)).slice(0, PROCESS_KEEP);
}

// ================== 关键进程 ==================
//
// 旧实现只按「进程名」匹配，且规则里没有 SnowLuma。实际部署里：
//   · NapCat 注入 QQNT → 进程叫 QQ.exe / qq，被 QQ 规则先认走；
//   · NapCat shell 独立启动 → `node /opt/napcat/napcat.mjs`，comm 只有 "node"；
//   · SnowLuma → 规则里压根没有它，Docker 里宿主 ps 又只看得到容器的 shim；
//   · 咔咔珂与协议端分处不同容器 / 不同机器时，协议端进程根本不在本机进程表里。
// 于是「协议框架」这一行无论 NapCat / SnowLuma、Docker / shell 都恒为「未检测到」。
//
// 现在改成双数据源：
//   ① 进程表：name + cmdline 一起匹配（能读就显示真实 PID / 内存 / CPU）；
//   ② 协议端自报的 get_version_info.app_name：跨容器、跨机器、权限受限都拿得到，
//      进程不可见时用「框架名 + 版本」兜底，不再笼统写「未检测到」。
// ---------------------------------------------------------------------------

/** 协议端自报身份（get_version_info） */
export interface MkProtocolIdentity {
  /** 归一化后的展示名，如 SnowLuma / NapCat / Lagrange */
  name: string;
  version: string;
  /** 原始 app_name */
  appName: string;
  protocolVersion: string;
}

const PROTOCOL_APP_NAMES: { re: RegExp; name: string }[] = [
  { re: /snow[-_\s]?luma/i, name: 'SnowLuma' },
  { re: /napcat/i, name: 'NapCat' },
  { re: /lagrange/i, name: 'Lagrange' },
  { re: /llonebot|lite[-_\s]?loader/i, name: 'LLOneBot' },
  { re: /go[-_\s]?cqhttp/i, name: 'go-cqhttp' },
  { re: /chronocat/i, name: 'Chronocat' },
  { re: /shamrock/i, name: 'OpenShamrock' },
  { re: /opq[-_\s]?bot|opq/i, name: 'OPQBot' },
  { re: /mirai/i, name: 'Mirai' },
  { re: /koishi/i, name: 'Koishi' },
  { re: /onebot/i, name: 'OneBot' },
];

export function normalizeProtocolIdentity(
  appName: unknown,
  appVersion?: unknown,
  protocolVersion?: unknown,
): MkProtocolIdentity | null {
  const raw = String(appName ?? '').trim();
  const version = String(appVersion ?? '').trim();
  const protocol = String(protocolVersion ?? '').trim();
  if (!raw) {
    // 部分实现不返回 app_name，但会返回 protocol_version：至少确认协议端在线
    if (protocol) return { name: 'OneBot 协议端', version, appName: '', protocolVersion: protocol };
    return null;
  }
  const matched = PROTOCOL_APP_NAMES.find((x) => x.re.test(raw));
  return {
    name: matched ? matched.name : raw.slice(0, 40),
    version,
    appName: raw,
    protocolVersion: protocol,
  };
}

/** 用户自定义进程关键字（config.json「协议框架进程关键字」，逗号/分号/空白分隔） */
export function parseProtocolKeywords(raw: unknown): string[] {
  return String(raw ?? '')
    .split(/[,，;；\s]+/)
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 12);
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** 强特征：进程名或命令行里出现这些，基本可确定是协议端 */
const PROTOCOL_STRONG_PATTERNS: RegExp[] = [
  /snow[-_\s]?luma/i,
  /napcat/i,
  /llonebot/i,
  /lagrange/i,
  /shamrock/i,
  /go[-_\s]?cqhttp/i,
  /chronocat/i,
  /opq[-_\s]?bot/i,
  /mirai/i,
  /qqnt/i,
  /lite[-_\s]?loader/i,
];
/** 弱特征：太泛，只在进程名上兜底，避免把任意含 onebot 字样的命令行误判 */
const PROTOCOL_WEAK_PATTERNS: RegExp[] = [/onebot/i, /cqhttp/i];

type ProcessRule = {
  key: MkKeyProcessInfo['key'];
  label: string;
  patterns: RegExp[];
  /** name = 只测进程名（QQ 规则带 $ 锚点）；both = 进程名 + 完整命令行 */
  scope: 'name' | 'both';
};

const KEY_PROCESS_RULES: ProcessRule[] = [
  { key: 'host', label: '宿主框架', patterns: [/kakake/i, /咔咔珂/, /mk-?jsbot/i], scope: 'both' },
  {
    key: 'qq',
    label: 'QQ',
    patterns: [/^qq(\.exe)?$/i, /[\\/]qq(\.exe)?$/i, /^linuxqq$/i, /qq(\.exe)?$/i],
    scope: 'name',
  },
  { key: 'protocol', label: '协议框架', patterns: PROTOCOL_STRONG_PATTERNS, scope: 'both' },
];

function processHaystack(p: MkProcessInfo, scope: 'name' | 'both'): string {
  const name = String(p.name || '');
  return scope === 'both' ? `${name}\n${String(p.cmdline || '')}` : name;
}

/** 同类多进程取内存占用最大的那个 */
function matchProcess(
  list: MkProcessInfo[],
  patterns: RegExp[],
  scope: 'name' | 'both' = 'both',
  excludePids?: Set<string>,
): MkProcessInfo | null {
  let best: MkProcessInfo | null = null;
  if (!patterns.length) return null;
  for (const p of list) {
    if (excludePids?.has(String(p.pid))) continue;
    const hay = processHaystack(p, scope);
    if (!patterns.some((re) => re.test(hay))) continue;
    if (!best || p.memory > best.memory) best = p;
  }
  return best;
}

function selfProcessRow(list: MkProcessInfo[]): MkProcessInfo {
  const selfPid = String(process.pid);
  const hit = list.find((p) => String(p.pid) === selfPid);
  if (hit) return hit;
  const rss = process.memoryUsage().rss;
  return {
    pid: selfPid,
    name: 'node',
    memory: rss,
    memoryMB: (rss / 1024 / 1024).toFixed(2),
    cpuPercent: '0.0',
  };
}

export interface MkKeyProcessOptions {
  /** 协议端自报身份；进程不可见时用它兜底显示框架名与版本 */
  protocolIdentity?: MkProtocolIdentity | null;
  /** 用户自定义进程关键字（字面量，不区分大小写） */
  customPatterns?: string[];
  /** 宿主框架展示名：host 行落到「同宿主进程」时用 */
  hostLabel?: string;
}

/**
 * 从完整进程表中挑出三类关键进程：宿主框架 / QQ / 协议框架。
 * MKbot 与宿主框架共用同一个 Node 进程，所以不再单独列一行。
 */
export function resolveKeyProcesses(
  list: MkProcessInfo[],
  options: MkKeyProcessOptions = {},
): MkKeyProcessInfo[] {
  const self = selfProcessRow(list);
  const rows: MkKeyProcessInfo[] = [];
  const custom = (options.customPatterns || [])
    .map((s) => String(s || '').trim())
    .filter(Boolean)
    .map((s) => new RegExp(escapeRegExp(s), 'i'));
  const excludeSelf = new Set([String(self.pid)]);

  for (const rule of KEY_PROCESS_RULES) {
    let hit: MkProcessInfo | null;
    if (rule.key === 'protocol') {
      // 先强特征（含用户自定义），再弱特征；排除插件自身进程，避免自我误判
      hit =
        matchProcess(list, [...rule.patterns, ...custom], 'both', excludeSelf) ||
        matchProcess(list, PROTOCOL_WEAK_PATTERNS, 'name', excludeSelf);
    } else {
      hit = matchProcess(list, rule.patterns, rule.scope);
    }
    if (rule.key === 'host' && !hit) hit = self;

    if (!hit) {
      // 协议端进程不在本机进程表（Docker 跨容器 / 远程 WS / 权限受限）时，
      // 用协议自报身份兜底：仍然告诉用户「连的是谁」，而不是一句「未检测到」。
      if (rule.key === 'protocol' && options.protocolIdentity) {
        const id = options.protocolIdentity;
        const ver = id.version ? ` v${id.version}` : '';
        rows.push({
          key: 'protocol',
          label: rule.label,
          name: `${id.name}${ver} · 进程不可见`,
          pid: '—',
          memoryMB: '—',
          cpuPercent: '—',
          running: true,
        });
        continue;
      }
      rows.push({
        key: rule.key,
        label: rule.label,
        name: rule.key === 'protocol' ? '未检测到（可配置关键字）' : '未检测到',
        pid: '—',
        memoryMB: '—',
        cpuPercent: '—',
        running: false,
      });
      continue;
    }

    const isSelfHost = rule.key === 'host' && String(hit.pid) === String(self.pid);
    const name = isSelfHost && options.hostLabel
      ? `同宿主进程（${options.hostLabel}）`
      : String(hit.name || 'Unknown');
    rows.push({
      key: rule.key,
      label: rule.label,
      name,
      pid: String(hit.pid || '—'),
      memoryMB: String(hit.memoryMB || '0'),
      cpuPercent: String(hit.cpuPercent || '0'),
      running: true,
    });
  }
  return rows;
}

let snapshotCache: { at: number; value: MkSystemStatusSnapshot } | null = null;
let snapshotInflight: Promise<MkSystemStatusSnapshot> | null = null;

/**
 * 合并采集系统信息与进程列表。
 * 带 TTL 缓存 + 单飞（in-flight）复用：并发/连续触发不会重复拉起子进程。
 */
export function getSystemStatusSnapshot(
  logger?: MkLogger | null,
  ttlMs: number = SNAPSHOT_TTL_MS,
): Promise<MkSystemStatusSnapshot> {
  const now = Date.now();
  if (snapshotCache && now - snapshotCache.at < Math.max(0, ttlMs)) {
    return Promise.resolve(snapshotCache.value);
  }
  if (snapshotInflight) return snapshotInflight;

  snapshotInflight = (async () => {
    const [systemInfo, allProcesses, network] = await Promise.all([
      getSystemInfo(logger),
      collectProcesses(logger),
      collectNetwork(logger),
    ]);
    const value: MkSystemStatusSnapshot = {
      systemInfo,
      processes: allProcesses.slice(0, PROCESS_KEEP),
      // 调用方拿到协议自报身份后会用全量表重新解析关键进程，不受 top20 截断影响
      processPool: allProcesses,
      keyProcesses: resolveKeyProcesses(allProcesses),
      network,
    };
    snapshotCache = { at: Date.now(), value };
    return value;
  })().finally(() => {
    snapshotInflight = null;
  });

  return snapshotInflight;
}

/** 清空快照缓存（测试或强制刷新用） */
export function resetSystemStatusCache(): void {
  snapshotCache = null;
}