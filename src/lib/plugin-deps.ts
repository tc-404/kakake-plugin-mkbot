// ---------------------------------------------------------------------------
// 插件运行时依赖：Sharp 安装到「插件数据目录上两级」/runtime-deps
// 例：kakake/data/runtime-deps（避免 plugins 热重载打断 npm）
// ---------------------------------------------------------------------------

import fs from 'fs';
import path from 'path';
import { spawn, type ChildProcess, type SpawnOptions } from 'child_process';
import os from 'os';
import type { MkLoggerResolved } from '../types';
import {
  type SharpRuntimePaths,
  ensureSharpRuntimePackage,
  isSharpPackagePresent,
  probeSharpAvailable,
  resetSharpModuleCache,
  resolveSharpInstallDir,
  SHARP_RUNTIME_DEPS_DIR,
} from './sharp-loader';

export type { SharpRuntimePaths as SharpDepsContext };

/**
 * 宿主是否统一管理 `data/runtime-deps` 里的 sharp。
 *
 * 在咔咔珂 / mk-jsbot 这类宿主下，该目录由宿主自身的安装服务（设置 → 图片引擎环境）拥有并维护；
 * 插件继续往里跑 `npm install` 就会和宿主的进程并发，两个 npm 抢写同一份 node_modules、
 * 互相 `rm -rf` 半残产物，最终 @img 原生包损坏（装了也用不了）。
 *
 * 因此：宿主托管时，插件**只加载、不自装**，缺失则提示用户去宿主装。
 * NapCat / SnowLuma 等不托管该目录的宿主保持 false，插件继续自装（各自装到 config/runtime-deps）。
 *
 * 由 mkbot-core 在初始化识别宿主后调用 `setHostOwnsRuntimeDeps(true)` 开启。
 */
let gHostOwnsRuntimeDeps = false;
export function setHostOwnsRuntimeDeps(value: boolean): void {
  gHostOwnsRuntimeDeps = !!value;
}
export function hostOwnsRuntimeDeps(): boolean {
  return gHostOwnsRuntimeDeps;
}

/**
 * 跨进程安装排他锁（与咔咔珂宿主共用同一份协议：同一文件名 `.sharp-install.lock`、同一接管规则）。
 * 即便本插件走自装路径（NapCat 等非托管宿主，目录不同不会冲突），也遵守这把锁，
 * 这样万一装到同一份共享目录时，能和宿主互相拦住，不会并发踩坏。
 */
const SHARP_INSTALL_LOCK_FILE = '.sharp-install.lock';
const SHARP_LOCK_STALE_MS = 20 * 60 * 1000;

function sharpInstallLockPath(baseDir: string): string {
  return path.join(path.resolve(baseDir), SHARP_INSTALL_LOCK_FILE);
}
function sharpLockPidAlive(pid: number): boolean {
  if (!pid || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    const code = (e as NodeJS.ErrnoException)?.code;
    if (code === 'ESRCH') return false;
    if (code === 'EPERM') return true;
    return false;
  }
}
function sharpLockRead(baseDir: string): { pid: number; startedAt: number; host: string } | null {
  try {
    const obj = JSON.parse(fs.readFileSync(sharpInstallLockPath(baseDir), 'utf-8')) as {
      pid?: unknown; startedAt?: unknown; host?: unknown;
    };
    if (typeof obj.pid === 'number' && typeof obj.startedAt === 'number') {
      return { pid: obj.pid, startedAt: obj.startedAt, host: typeof obj.host === 'string' ? obj.host : 'unknown' };
    }
  } catch {
    // 不存在 / 损坏都当无锁
  }
  return null;
}
export function acquireSharpInstallLock(baseDir: string, host = 'mkbot'): {
  acquired: boolean; holder?: { pid: number; host: string }; reason?: string;
} {
  const dir = path.resolve(baseDir);
  fs.mkdirSync(dir, { recursive: true });
  const p = sharpInstallLockPath(dir);
  const payload = { pid: process.pid, startedAt: Date.now(), host };
  const tryCreate = (): boolean => {
    try {
      const fd = fs.openSync(p, 'wx');
      fs.writeSync(fd, JSON.stringify(payload));
      fs.closeSync(fd);
      return true;
    } catch (e) {
      const code = (e as NodeJS.ErrnoException)?.code;
      if (code === 'EEXIST') return false;
      throw e;
    }
  };
  if (tryCreate()) return { acquired: true };
  const holder = sharpLockRead(dir);
  if (!holder) {
    try { fs.rmSync(p, { force: true }); } catch { /* ignore */ }
    if (tryCreate()) return { acquired: true };
    return { acquired: false, reason: '锁文件状态异常，无法抢锁' };
  }
  const alive = sharpLockPidAlive(holder.pid);
  const stale = Date.now() - holder.startedAt > SHARP_LOCK_STALE_MS;
  if (alive && !stale) {
    return { acquired: false, holder, reason: `另一进程（pid ${holder.pid}, ${holder.host}）正在安装 sharp` };
  }
  try { fs.rmSync(p, { force: true }); } catch { /* ignore */ }
  if (tryCreate()) return { acquired: true };
  return { acquired: false, holder, reason: '锁已被陈旧进程占用，接管失败' };
}
export function releaseSharpInstallLock(baseDir: string): void {
  const p = sharpInstallLockPath(path.resolve(baseDir));
  try {
    const holder = sharpLockRead(baseDir);
    if (holder && holder.pid === process.pid) fs.rmSync(p, { force: true });
  } catch {
    // ignore
  }
}

let sharpInstallPromise: Promise<boolean> | null = null;
let activeNpmInstallChild: ChildProcess | null = null;
let activeNpmInstallTimers: {
  tick: ReturnType<typeof setInterval> | null;
  timer: ReturnType<typeof setTimeout> | null;
} = { tick: null, timer: null };

const sharpInstallState = {
  phase: 'idle' as 'idle' | 'running' | 'success' | 'failed',
  detail: '',
  error: '',
  startedAt: 0,
  percent: 0,
  logPath: '',
};

export interface SharpDepsStatus {
  available: boolean;
  packagePresent: boolean;
  installing: boolean;
  platform: string;
  libc: string;
  installDir: string;
  pluginDir: string;
  dataDir: string;
  message: string;
  phase: 'idle' | 'running' | 'success' | 'failed';
  detail: string;
  percent: number;
  logPath: string;
  manualHint: string;
}

function fileExists(p: string): boolean {
  try {
    return fs.existsSync(p);
  } catch {
    return false;
  }
}

function detectLinuxLibc(): string {
  if (process.platform !== 'linux') return '';
  if (
    fileExists('/lib/ld-musl-x86_64.so.1')
    || fileExists('/lib/ld-musl-aarch64.so.1')
    || fileExists('/lib/ld-musl-armhf.so.1')
  ) {
    return 'musl';
  }
  return 'glibc';
}

function buildPlatformLabel(): string {
  const libc = detectLinuxLibc();
  const base = `${os.platform()}-${os.arch()}`;
  return libc ? `${base} (${libc})` : base;
}

function buildManualInstallHint(installDir: string, paths: SharpRuntimePaths): string {
  const dir = path.resolve(String(installDir || '').trim() || '.');
  const platform = buildPlatformLabel();
  const dataHint = paths.dataDir
    ? `（请装到插件数据目录上两级的 ${SHARP_RUNTIME_DEPS_DIR}，如 kakake/data/${SHARP_RUNTIME_DEPS_DIR}；勿在 plugins 目录 npm install）`
    : '';
  return [
    `平台: ${platform} · Node ${process.version}${dataHint}`,
    `SSH 手动安装：`,
    `cd "${dir}"`,
    `rm -rf node_modules/sharp node_modules/@img`,
    `npm config set registry https://registry.npmmirror.com   # 国内建议`,
    `npm install --omit=dev --no-audit --no-fund`,
    `日志: ${path.join(dir, 'sharp-install.log')}`,
  ].join('\n');
}

function isSharpInstallRunning(): boolean {
  return sharpInstallPromise != null || sharpInstallState.phase === 'running';
}

async function probeSharpSafe(timeoutMs = 8000): Promise<boolean> {
  if (isSharpInstallRunning()) return false;
  return probeSharpAvailable(timeoutMs);
}

function clearNpmInstallTimers() {
  if (activeNpmInstallTimers.tick) {
    clearInterval(activeNpmInstallTimers.tick);
    activeNpmInstallTimers.tick = null;
  }
  if (activeNpmInstallTimers.timer) {
    clearTimeout(activeNpmInstallTimers.timer);
    activeNpmInstallTimers.timer = null;
  }
}

function killNpmInstallChild(logger?: MkLoggerResolved) {
  const child = activeNpmInstallChild;
  if (!child) return;
  activeNpmInstallChild = null;
  try {
    if (process.platform === 'win32' && child.pid) {
      spawn('taskkill', ['/PID', String(child.pid), '/T', '/F'], {
        shell: true,
        stdio: 'ignore',
      });
    } else {
      child.kill('SIGKILL');
    }
  } catch (e) {
    logger?.warn?.('[依赖] 终止 npm install 进程失败:', e);
  }
}

export function cancelSharpDependencyInstall(logger?: MkLoggerResolved): void {
  clearNpmInstallTimers();
  killNpmInstallChild(logger);
  sharpInstallPromise = null;
  sharpInstallState.phase = 'idle';
  sharpInstallState.detail = '';
  sharpInstallState.error = '';
  sharpInstallState.percent = 0;
  sharpInstallState.startedAt = 0;
  sharpInstallState.logPath = '';
  resetSharpModuleCache();
  logger?.info?.('[依赖] Sharp 安装任务已取消（插件停用）');
}

function setInstallProgress(
  phase: typeof sharpInstallState.phase,
  detail: string,
  percent: number,
  error = '',
) {
  sharpInstallState.phase = phase;
  sharpInstallState.detail = detail;
  sharpInstallState.percent = Math.max(0, Math.min(100, percent));
  sharpInstallState.error = error;
  if (phase === 'running' && !sharpInstallState.startedAt) {
    sharpInstallState.startedAt = Date.now();
  }
}

function findNpmCliJs(): string | null {
  const nodeDir = path.dirname(process.execPath);
  const guesses = [
    path.join(nodeDir, '..', 'lib', 'node_modules', 'npm', 'bin', 'npm-cli.js'),
    path.join(nodeDir, '..', 'libexec', 'lib', 'node_modules', 'npm', 'bin', 'npm-cli.js'),
    path.join(nodeDir, 'node_modules', 'npm', 'bin', 'npm-cli.js'),
  ];
  for (const g of guesses) {
    if (fileExists(g)) return g;
  }
  return null;
}

function resolveNpmSpawn(installArgs: string[]): {
  command: string;
  args: string[];
  options: SpawnOptions;
} {
  const baseOptions: SpawnOptions = {
    stdio: ['ignore', 'pipe', 'pipe'],
    env: {
      ...process.env,
      npm_config_fund: 'false',
      npm_config_audit: 'false',
      npm_config_fetch_timeout: '600000',
      npm_config_progress: 'true',
    },
  };

  if (process.platform === 'win32') {
    return {
      command: 'npm.cmd',
      args: installArgs,
      options: { ...baseOptions, shell: true },
    };
  }

  const npmCli = findNpmCliJs();
  if (npmCli) {
    return {
      command: process.execPath,
      args: [npmCli, ...installArgs],
      options: baseOptions,
    };
  }

  const localNpm = path.join(path.dirname(process.execPath), 'npm');
  if (fileExists(localNpm)) {
    return { command: localNpm, args: installArgs, options: baseOptions };
  }

  return { command: 'npm', args: installArgs, options: baseOptions };
}

function appendInstallLog(logPath: string, chunk: string) {
  if (!logPath || !chunk) return;
  try {
    fs.appendFileSync(logPath, chunk, 'utf-8');
  } catch {
    // ignore
  }
}

function cleanBrokenSharpArtifacts(installDir: string, logger?: MkLoggerResolved) {
  const nm = path.join(path.resolve(installDir), 'node_modules');
  for (const name of ['sharp', '@img']) {
    const target = path.join(nm, name);
    if (!fileExists(target)) continue;
    try {
      fs.rmSync(target, { recursive: true, force: true });
      logger?.info?.(`[依赖] 已清理: ${target}`);
    } catch (e) {
      logger?.warn?.(`[依赖] 清理 ${target} 失败:`, e);
    }
  }
}

function runNpmInstall(
  installDir: string,
  timeoutMs: number,
  logger?: MkLoggerResolved,
  onProgress?: (detail: string, percent: number) => void,
): Promise<{ ok: boolean; message: string }> {
  return new Promise((resolve) => {
    const cwd = path.resolve(installDir);
    const pkgPath = path.join(cwd, 'package.json');
    if (!fileExists(pkgPath)) {
      resolve({ ok: false, message: 'package.json 不存在' });
      return;
    }

    const logPath = path.join(cwd, 'sharp-install.log');
    sharpInstallState.logPath = logPath;
    try {
      fs.writeFileSync(
        logPath,
        `[${new Date().toISOString()}] Sharp install · ${buildPlatformLabel()} · cwd=${cwd}\n`,
        'utf-8',
      );
    } catch {
      // ignore
    }

    const installArgs = ['install', '--omit=dev', '--no-audit', '--no-fund', '--loglevel=warn'];
    const spawnSpec = resolveNpmSpawn(installArgs);

    onProgress?.('正在执行 npm install…', 15);
    logger?.info?.(
      `[依赖] 正在 ${cwd} 执行 npm install（${spawnSpec.command} ${spawnSpec.args.join(' ')}）…`,
    );

    const child = spawn(spawnSpec.command, spawnSpec.args, { ...spawnSpec.options, cwd });
    activeNpmInstallChild = child;

    let stderr = '';
    let stdout = '';
    const started = Date.now();
    clearNpmInstallTimers();
    activeNpmInstallTimers.tick = setInterval(() => {
      const elapsed = Date.now() - started;
      onProgress?.(
        '正在下载 Sharp 原生包（装到插件数据上两级的 runtime-deps，避免插件热重载）…',
        Math.min(88, 15 + Math.floor(elapsed / 4000)),
      );
    }, 2000);

    activeNpmInstallTimers.timer = setTimeout(() => {
      clearNpmInstallTimers();
      killNpmInstallChild(logger);
      appendInstallLog(logPath, `\n[timeout] exceeded ${timeoutMs}ms\n`);
      resolve({
        ok: false,
        message: `npm install 超时，请 SSH 手动安装（见 sharp-install.log）`,
      });
    }, timeoutMs);

    const finish = (result: { ok: boolean; message: string }) => {
      clearNpmInstallTimers();
      if (activeNpmInstallChild === child) activeNpmInstallChild = null;
      appendInstallLog(logPath, `\n[result] ${result.ok ? 'ok' : 'fail'}: ${result.message}\n`);
      if (result.ok) {
        logger?.info?.('[依赖] npm install 完成');
      } else {
        logger?.warn?.(`[依赖] npm install 失败: ${result.message}`);
      }
      resolve(result);
    };

    child.stdout?.on('data', (chunk) => {
      const text = String(chunk || '');
      stdout += text;
      appendInstallLog(logPath, text);
    });
    child.stderr?.on('data', (chunk) => {
      const text = String(chunk || '');
      stderr += text;
      appendInstallLog(logPath, text);
    });

    child.on('error', (err) => {
      const msg = err?.message || String(err);
      finish({
        ok: false,
        message: msg.includes('ENOENT')
          ? `${msg}（未找到 npm，请 SSH 手动安装）`
          : msg,
      });
    });

    child.on('close', (code) => {
      if (code === 0) {
        onProgress?.('依赖下载完成，正在验证 Sharp…', 92);
        finish({ ok: true, message: 'ok' });
        return;
      }
      const tail = (stderr || stdout).trim().split(/\r?\n/).slice(-8).join(' ');
      finish({ ok: false, message: tail || `npm install 退出码 ${code ?? 'unknown'}` });
    });
  });
}

async function installSharpOnce(
  paths: SharpRuntimePaths,
  logger?: MkLoggerResolved,
): Promise<boolean> {
  setInstallProgress('running', '准备安装…', 5);
  resetSharpModuleCache();

  const installDir = ensureSharpRuntimePackage(paths, logger);
  if (!installDir || !fileExists(path.join(installDir, 'package.json'))) {
    setInstallProgress('failed', '无法创建 runtime-deps', 0, '无法创建安装目录');
    return false;
  }

  setInstallProgress('running', '清理旧 Sharp 原生包…', 10);
  cleanBrokenSharpArtifacts(installDir, logger);

  // 跨进程排他锁：与咔咔珂宿主共用同一把锁，避免两个进程并发写 data/runtime-deps。
  const lock = acquireSharpInstallLock(installDir, 'mkbot');
  if (!lock.acquired) {
    setInstallProgress('failed', lock.reason ?? '无法获取安装锁', 0,
      `${lock.reason ?? '无法获取安装锁'}\n${buildManualInstallHint(installDir, paths)}`);
    return false;
  }

  let result: { ok: boolean; message: string };
  try {
    result = await runNpmInstall(installDir, 600000, logger, (detail, percent) => {
      setInstallProgress('running', detail, percent);
    });
  } finally {
    releaseSharpInstallLock(installDir);
  }
  resetSharpModuleCache();

  if (!result.ok) {
    setInstallProgress('failed', result.message, 0, `${result.message}\n${buildManualInstallHint(installDir, paths)}`);
    return false;
  }

  setInstallProgress('running', '验证 Sharp 模块…', 95);
  if (await probeSharpAvailable(15000)) {
    setInstallProgress('success', 'Sharp 已安装并可用', 100);
    logger?.info?.(`[依赖] Sharp 已就绪: ${installDir}`);
    return true;
  }

  const msg = [
    `npm 已完成但 Sharp 仍无法加载（${buildPlatformLabel()}）`,
    buildManualInstallHint(installDir, paths),
  ].join('\n');
  setInstallProgress('failed', 'Sharp 验证失败', 0, msg);
  logger?.warn?.(`[依赖] ${msg}`);
  return false;
}

export async function getSharpDependencyStatus(
  paths: SharpRuntimePaths,
): Promise<SharpDepsStatus> {
  const installDir = resolveSharpInstallDir(paths);
  const pluginDir = path.resolve(String(paths.pluginDir || '').trim());
  const dataDir = String(paths.dataDir || '').trim();
  const installing = isSharpInstallRunning();
  const packagePresent = isSharpPackagePresent(paths);
  const platform = buildPlatformLabel();
  const manualHint = buildManualInstallHint(installDir, paths);
  const logPath = sharpInstallState.logPath || path.join(installDir, 'sharp-install.log');

  const available = installing ? false : await probeSharpSafe();

  let message = '';
  if (installing) {
    message = sharpInstallState.detail || '正在安装中…';
  } else if (available) {
    message = `Sharp 已就绪（${platform}）`;
  } else if (sharpInstallState.phase === 'failed' && sharpInstallState.error) {
    message = sharpInstallState.error;
  } else if (packagePresent) {
    message = `检测到 sharp 包但无法加载（${platform}），请重新安装`;
  } else {
    message = hostOwnsRuntimeDeps()
      ? `未安装 Sharp（${platform}），由咔咔珂宿主统一管理；请在宿主 设置 → 图片引擎环境 安装。`
      : `未安装 Sharp（${platform}），将安装到「数据目录上两级」/${SHARP_RUNTIME_DEPS_DIR}`;
  }

  return {
    available,
    packagePresent,
    installing,
    platform,
    libc: detectLinuxLibc(),
    installDir,
    pluginDir,
    dataDir,
    message,
    phase: installing ? 'running' : sharpInstallState.phase,
    detail: sharpInstallState.detail,
    percent: sharpInstallState.percent,
    logPath,
    manualHint,
  };
}

export async function triggerSharpDependencyInstall(
  paths: SharpRuntimePaths,
  logger?: MkLoggerResolved,
): Promise<{ accepted: boolean; message: string }> {
  // 宿主（咔咔珂 / mk-jsbot）已统一管理 data/runtime-deps 的 sharp：插件只加载、不自装，
  // 避免两个进程并发 npm install 踩坏共享依赖。
  if (hostOwnsRuntimeDeps()) {
    if (!isSharpInstallRunning() && (await probeSharpSafe())) {
      setInstallProgress('success', 'Sharp 已由宿主管理并已就绪', 100);
      return { accepted: false, message: 'Sharp 已由咔咔珂宿主安装并可用，本插件不再自行安装。' };
    }
    return {
      accepted: false,
      message:
        'Sharp 依赖由咔咔珂宿主统一管理：请在咔咔珂 设置 → 图片引擎环境 点击安装。' +
        '本插件在咔咔珂宿主下不再自行安装，以免两个进程并发踩坏共享依赖。',
    };
  }

  if (!isSharpInstallRunning() && (await probeSharpSafe())) {
    setInstallProgress('success', 'Sharp 已就绪', 100);
    return { accepted: false, message: 'Sharp 已就绪，无需重复安装' };
  }

  if (sharpInstallPromise) {
    return { accepted: true, message: '安装已在进行中' };
  }

  sharpInstallState.startedAt = Date.now();
  sharpInstallState.error = '';
  setInstallProgress('running', '已开始安装…', 8);

  sharpInstallPromise = installSharpOnce(paths, logger)
    .catch((e) => {
      const msg = e instanceof Error ? e.message : String(e);
      setInstallProgress('failed', msg, 0, msg);
      logger?.error?.('[依赖] 安装异常:', e);
      return false;
    })
    .finally(() => {
      sharpInstallPromise = null;
    });

  void sharpInstallPromise;
  return { accepted: true, message: '已开始安装，请稍候' };
}

/** @deprecated */
export async function installSharpDependencies(
  paths: SharpRuntimePaths,
  logger?: MkLoggerResolved,
): Promise<{ ok: boolean; message: string }> {
  const trigger = await triggerSharpDependencyInstall(paths, logger);
  if (!trigger.accepted && trigger.message.includes('已就绪')) {
    return { ok: true, message: trigger.message };
  }
  if (sharpInstallPromise) {
    const ok = await sharpInstallPromise;
    return { ok, message: ok ? 'Sharp 安装成功' : sharpInstallState.error || '安装失败' };
  }
  return { ok: false, message: trigger.message };
}
