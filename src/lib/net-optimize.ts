// @ts-nocheck
// ---------------------------------------------------------------------------
// 上传节点择优（网络体检 + 屏蔽劣质节点）
//
// 背景：QQ 的 Highway 上传目标由服务端下发，可能分到跨境 / 高丢包的节点。
//   实测：香港机器被分到国内节点（46% 丢包、181ms），2.8MB 视频上传要 100+ 秒；
//   而同一台机器到腾讯香港节点是 0% 丢包、1ms。把劣质节点快速 REJECT 掉后，
//   QQ 会立刻换到其它节点，发送明显变快。
//
// 这里把那套手工排查固化成插件能力，让不同地区的用户都不用手配：
//   ① 发现：找出 QQ 进程当前连了哪些远端 IP（ss 优先，/proc 兜底）
//   ② 体检：对每个 IP 做若干次 TCP 握手采样，得出平均延迟与失败率
//   ③ 择优：只屏蔽「明显更差」的节点，且永远至少保留一个可用节点
//   ④ 回滚：一键撤销本插件加过的全部规则
//
// 安全约束（务必保持）：
//   · 默认关闭，必须由用户在 WebUI 主动开启
//   · 非 Linux / 非 root / 没有 iptables → 直接判定不可用，不做任何系统改动
//   · 只 REJECT、不 DROP：让 QQ 立刻收到 RST 换节点，而不是傻等超时
// ---------------------------------------------------------------------------

import { execFile } from 'child_process';
import { readFile, readdir, readlink } from 'fs/promises';
import net from 'net';

export const MK_NETOPT_ENABLED_KEY = '上传节点择优';
export const MK_NETOPT_BLOCKED_KEY = '上传节点择优已屏蔽';

/** 判定为「劣质」的门槛：延迟超过最佳节点的倍数、绝对延迟下限、失败率上限 */
const MK_NETOPT_WORSE_RATIO = 3;
const MK_NETOPT_MIN_BAD_MS = 50;
const MK_NETOPT_MAX_LOSS_PCT = 20;
/** 每个 IP 的握手采样次数与单次上限 */
const MK_NETOPT_PROBE_SAMPLES = 4;
const MK_NETOPT_PROBE_TIMEOUT_MS = 1500;
/** 单次体检最多探测多少个 IP（并发进行，避免节点多时体检太久） */
const MK_NETOPT_MAX_PROBE_IPS = 8;
/** 只对这些进程名下发的连接做体检 */
const MK_NETOPT_PROCESS_KEYWORDS = ['qq', 'napcat', 'liteloader', 'unidbg-fetch-qsign'];

export interface MkNetPeer {
  ip: string;
  port: number;
  process: string;
  rttMs: number | null;
  lossPct: number | null;
  verdict: 'good' | 'bad' | 'unknown';
  blocked: boolean;
}

export interface MkNetOptStatus {
  supported: boolean;
  reason: string;
  enabled: boolean;
  blocked: string[];
  lastScanAt: number;
  lastScan: MkNetPeer[];
  advice: string;
}

type MkNetOptDeps = {
  readB?: (file: string, key: string, def?: unknown) => unknown;
  writeB?: (file: string, key: string, value: unknown) => void;
  logger?: {
    info?: (...args: unknown[]) => void;
    warn?: (...args: unknown[]) => void;
    error?: (...args: unknown[]) => void;
  };
};

function runCmd(file: string, args: string[]): Promise<{ ok: boolean; out: string; err: string }> {
  return new Promise((resolve) => {
    execFile(file, args, { timeout: 8000, windowsHide: true }, (error, stdout, stderr) => {
      resolve({
        ok: !error,
        out: String(stdout || ''),
        err: String(stderr || error?.message || ''),
      });
    });
  });
}

function isPrivateOrLocal(ip: string): boolean {
  if (!/^\d+\.\d+\.\d+\.\d+$/.test(ip)) return true;
  if (ip === '0.0.0.0' || ip === '127.0.0.1') return true;
  const a = ip.split('.').map(Number);
  if (a[0] === 10 || a[0] === 127) return true;
  if (a[0] === 192 && a[1] === 168) return true;
  if (a[0] === 172 && a[1] >= 16 && a[1] <= 31) return true;
  if (a[0] === 169 && a[1] === 254) return true;
  return false;
}

// ---------------------------------------------------------------------------
// ① 发现：QQ 进程当前连了哪些远端 IP
// ---------------------------------------------------------------------------

function parseSsLine(line: string): { ip: string; port: number; process: string } | null {
  const trimmed = line.trim();
  if (!/^(ESTAB|SYN-SENT|SYN-RECV|CLOSE-WAIT)\s/.test(trimmed)) return null;
  const parts = trimmed.split(/\s+/);
  const remote = parts[4] || '';
  const idx = remote.lastIndexOf(':');
  if (idx <= 0) return null;
  const ip = remote.slice(0, idx);
  const port = parseInt(remote.slice(idx + 1), 10);
  if (!/^\d+\.\d+\.\d+\.\d+$/.test(ip) || !Number.isFinite(port)) return null;
  const pm = trimmed.match(/users:\(\("([^"]+)"/);
  return { ip, port, process: pm ? pm[1] : '' };
}

async function listPeersBySs(): Promise<{ ip: string; port: number; process: string }[]> {
  const r = await runCmd('ss', ['-tanp']);
  if (!r.ok) return [];
  const out: { ip: string; port: number; process: string }[] = [];
  for (const line of r.out.split('\n')) {
    const p = parseSsLine(line);
    if (!p || isPrivateOrLocal(p.ip)) continue;
    out.push(p);
  }
  return out;
}

/** /proc 兜底：解析 /proc/net/tcp 得到 inode→远端地址，再用 /proc/pid/fd 关联进程 */
async function listPeersByProc(): Promise<{ ip: string; port: number; process: string }[]> {
  const tcpRaw = await readFile('/proc/net/tcp', 'utf8').catch(() => '');
  if (!tcpRaw) return [];

  // inode -> { ip, port, state }
  const byInode = new Map<string, { ip: string; port: number }>();
  for (const line of tcpRaw.split('\n').slice(1)) {
    const f = line.trim().split(/\s+/);
    if (f.length < 10) continue;
    const state = f[3] || '';
    if (state !== '01' && state !== '02') continue; // ESTABLISHED / SYN_SENT
    const rem = f[2] || '';
    const colon = rem.indexOf(':');
    if (colon <= 0) continue;
    const hexIp = rem.slice(0, colon);
    const hexPort = rem.slice(colon + 1);
    if (hexIp.length !== 8) continue;
    const octets: number[] = [];
    for (let i = 3; i >= 0; i--) {
      octets.push(parseInt(hexIp.slice(i * 2, i * 2 + 2), 16));
    }
    const ip = octets.join('.');
    if (isPrivateOrLocal(ip)) continue;
    byInode.set(f[9], { ip, port: parseInt(hexPort, 16) });
  }
  if (!byInode.size) return [];

  const pids = await readdir('/proc').catch(() => [] as string[]);
  const out: { ip: string; port: number; process: string }[] = [];
  for (const pid of pids) {
    if (!/^\d+$/.test(pid)) continue;
    let comm = '';
    try {
      comm = (await readFile(`/proc/${pid}/comm`, 'utf8')).trim();
    } catch {
      continue;
    }
    const lower = comm.toLowerCase();
    if (!MK_NETOPT_PROCESS_KEYWORDS.some((k) => lower.includes(k))) continue;
    const fds = await readdir(`/proc/${pid}/fd`).catch(() => [] as string[]);
    for (const fd of fds) {
      let target = '';
      try {
        target = await readlink(`/proc/${pid}/fd/${fd}`);
      } catch {
        continue;
      }
      const m = target.match(/socket:\[(\d+)\]/);
      if (!m) continue;
      const hit = byInode.get(m[1]);
      if (hit) out.push({ ip: hit.ip, port: hit.port, process: comm });
    }
  }
  return out;
}

async function mkNetOptListPeers(): Promise<{ ip: string; port: number; process: string }[]> {
  const viaSs = await listPeersBySs();
  if (viaSs.length) return viaSs;
  return await listPeersByProc();
}

// ---------------------------------------------------------------------------
// ② 体检：TCP 握手采样
// ---------------------------------------------------------------------------

function probeOnce(ip: string, port: number): Promise<number | null> {
  return new Promise((resolve) => {
    const t0 = Date.now();
    const sock = new net.Socket();
    let settled = false;
    const finish = (ok: boolean) => {
      if (settled) return;
      settled = true;
      try {
        sock.destroy();
      } catch {
        // ignore
      }
      resolve(ok ? Date.now() - t0 : null);
    };
    sock.setTimeout(MK_NETOPT_PROBE_TIMEOUT_MS);
    sock.once('connect', () => finish(true));
    sock.once('timeout', () => finish(false));
    sock.once('error', () => finish(false));
    try {
      sock.connect(port, ip);
    } catch {
      finish(false);
    }
  });
}

async function mkNetOptProbe(ip: string, port: number) {
  const samples: (number | null)[] = [];
  for (let i = 0; i < MK_NETOPT_PROBE_SAMPLES; i++) {
    samples.push(await probeOnce(ip, port));
  }
  const okList = samples.filter((x): x is number => typeof x === 'number');
  const lossPct = Math.round(((samples.length - okList.length) / samples.length) * 100);
  const rttMs = okList.length ? Math.round(okList.reduce((a, b) => a + b, 0) / okList.length) : null;
  return { rttMs, lossPct };
}

// ---------------------------------------------------------------------------
// ③ 择优 + ④ 施加 / 回滚
// ---------------------------------------------------------------------------

async function mkNetOptHasIptables(): Promise<boolean> {
  const r = await runCmd('iptables', ['-L', 'OUTPUT', '-n']);
  return r.ok;
}

async function mkNetOptRuleExists(ip: string): Promise<boolean> {
  const r = await runCmd('iptables', [
    '-C', 'OUTPUT', '-p', 'tcp', '-d', ip, '-j', 'REJECT', '--reject-with', 'tcp-reset',
  ]);
  return r.ok;
}

async function mkNetOptAddRule(ip: string): Promise<boolean> {
  if (await mkNetOptRuleExists(ip)) return true;
  const r = await runCmd('iptables', [
    '-A', 'OUTPUT', '-p', 'tcp', '-d', ip, '-j', 'REJECT', '--reject-with', 'tcp-reset',
  ]);
  return r.ok;
}

async function mkNetOptDelRule(ip: string): Promise<boolean> {
  if (!(await mkNetOptRuleExists(ip))) return true;
  const r = await runCmd('iptables', [
    '-D', 'OUTPUT', '-p', 'tcp', '-d', ip, '-j', 'REJECT', '--reject-with', 'tcp-reset',
  ]);
  return r.ok;
}

function mkNetOptReadBlocked(deps: MkNetOptDeps): string[] {
  const raw = deps.readB?.('config.json', MK_NETOPT_BLOCKED_KEY, '');
  if (typeof raw === 'string' && raw.trim()) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed.filter((x) => typeof x === 'string');
    } catch {
      // 历史脏数据，忽略
    }
  }
  return [];
}

/** 体检：发现节点 → 逐个探测 → 判定好/坏（不改动系统） */
export async function mkNetOptScan(deps: MkNetOptDeps = {}): Promise<MkNetPeer[]> {
  const peers = await mkNetOptListPeers();

  // 同一 IP 归并，保留一个端口用于探测
  const merged = new Map<string, { ip: string; port: number; process: string }>();
  for (const p of peers) {
    if (!merged.has(p.ip)) merged.set(p.ip, p);
  }

  // 并发探测：串行时总耗时 = IP 数 × 采样次数 × 单次上限，节点一多体检就卡住前端
  const targets = Array.from(merged.values()).slice(0, MK_NETOPT_MAX_PROBE_IPS);
  const results: MkNetPeer[] = await Promise.all(
    targets.map(async (p) => {
      const { rttMs, lossPct } = await mkNetOptProbe(p.ip, p.port || 443);
      return {
        ip: p.ip,
        port: p.port,
        process: p.process,
        rttMs,
        lossPct,
        verdict: 'unknown' as const,
        blocked: false,
      };
    }),
  );

  const measured = results.filter((r) => typeof r.rttMs === 'number');
  if (measured.length) {
    const best = Math.min(...measured.map((r) => r.rttMs as number));
    for (const r of results) {
      if (typeof r.rttMs !== 'number') {
        r.verdict = (r.lossPct ?? 0) >= MK_NETOPT_MAX_LOSS_PCT ? 'bad' : 'unknown';
        continue;
      }
      const tooSlow = r.rttMs > best * MK_NETOPT_WORSE_RATIO && r.rttMs > MK_NETOPT_MIN_BAD_MS;
      const tooLossy = (r.lossPct ?? 0) >= MK_NETOPT_MAX_LOSS_PCT;
      r.verdict = tooSlow || tooLossy ? 'bad' : 'good';
    }
  }

  // 安全网：永远至少保留一个可用节点
  const good = results.filter((r) => r.verdict === 'good');
  if (!good.length) {
    for (const r of results) r.verdict = r.verdict === 'bad' ? 'unknown' : r.verdict;
  }

  return results.sort((a, b) => (a.rttMs ?? 1e9) - (b.rttMs ?? 1e9));
}

/** 按体检结果施加规则；返回实际被屏蔽的 IP */
export async function mkNetOptApply(
  deps: MkNetOptDeps = {},
): Promise<{ ok: boolean; applied: string[]; message: string }> {
  const env = await mkNetOptEnv(deps);
  if (!env.supported) return { ok: false, applied: [], message: env.reason };

  const scan = await mkNetOptScan(deps);
  const bad = scan.filter((p) => p.verdict === 'bad').map((p) => p.ip);
  if (!bad.length) {
    return { ok: true, applied: [], message: '体检未发现劣质节点，无需屏蔽' };
  }

  const applied: string[] = [];
  for (const ip of bad) {
    if (await mkNetOptAddRule(ip)) applied.push(ip);
  }
  const blocked = Array.from(new Set([...mkNetOptReadBlocked(deps), ...applied]));
  deps.writeB?.('config.json', MK_NETOPT_BLOCKED_KEY, JSON.stringify(blocked));
  deps.logger?.info?.(`[网络择优] 已屏蔽劣质节点：${applied.join('、') || '无'}`);
  return {
    ok: applied.length > 0,
    applied,
    message: applied.length ? `已屏蔽 ${applied.length} 个劣质节点` : '规则写入失败，请确认 iptables 可用',
  };
}

/** 回滚：撤销本插件加过的全部规则 */
export async function mkNetOptRollback(
  deps: MkNetOptDeps = {},
): Promise<{ ok: boolean; removed: string[]; message: string }> {
  const blocked = mkNetOptReadBlocked(deps);
  const removed: string[] = [];
  for (const ip of blocked) {
    if (await mkNetOptDelRule(ip)) removed.push(ip);
  }
  deps.writeB?.('config.json', MK_NETOPT_BLOCKED_KEY, JSON.stringify([]));
  deps.logger?.info?.(`[网络择优] 已回滚 ${removed.length} 条规则`);
  return { ok: true, removed, message: `已回滚 ${removed.length} 条规则` };
}

export function mkNetOptSetEnabled(deps: MkNetOptDeps, enabled: boolean): void {
  deps.writeB?.('config.json', MK_NETOPT_ENABLED_KEY, enabled ? '开启' : '关闭');
  if (!enabled) {
    void mkNetOptRollback(deps);
  }
}

/** 环境能力探测：非 Linux / 非 root / 无 iptables 都不动系统 */
export async function mkNetOptEnv(deps: MkNetOptDeps = {}): Promise<{ supported: boolean; reason: string }> {
  if (process.platform !== 'linux') {
    return { supported: false, reason: `当前系统 ${process.platform} 不支持 iptables 择优` };
  }
  if (typeof process.getuid === 'function' && process.getuid() !== 0) {
    return { supported: false, reason: '插件进程非 root，无法修改 iptables' };
  }
  if (!(await mkNetOptHasIptables())) {
    return { supported: false, reason: '未找到可用的 iptables（容器环境常见）' };
  }
  return { supported: true, reason: '' };
}

export async function mkNetOptStatus(deps: MkNetOptDeps = {}): Promise<MkNetOptStatus> {
  const env = await mkNetOptEnv(deps);
  const enabled = String(deps.readB?.('config.json', MK_NETOPT_ENABLED_KEY, '关闭') || '关闭') === '开启';
  const blocked = mkNetOptReadBlocked(deps);

  let advice = '';
  if (!env.supported) {
    advice = env.reason;
  } else if (!enabled) {
    advice = '未开启。若上传图片/视频经常超时，可先体检一次再决定是否开启。';
  } else if (!blocked.length) {
    advice = '已开启，尚未屏蔽任何节点。可执行一次体检。';
  } else {
    advice = `已开启，当前屏蔽 ${blocked.length} 个节点。`;
  }

  return {
    supported: env.supported,
    reason: env.reason,
    enabled,
    blocked,
    lastScanAt: 0,
    lastScan: [],
    advice,
  };
}
