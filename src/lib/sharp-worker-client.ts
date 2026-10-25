/**
 * 主线程 Sharp 渲染客户端：任务交给 sharp-worker.mjs（worker_threads），避免堵事件循环。
 * 找不到 worker 或启动失败时回退到进程内 Impl。
 */

import fs from 'node:fs';
import path from 'node:path';
import { Worker, isMainThread } from 'node:worker_threads';
import { fileURLToPath } from 'node:url';
import { getSharpConcurrency, type SharpRuntimePaths } from './sharp-loader';
import { getSharpPngCompressionLevel } from './png-output';
import { getSharpBgCacheConfig } from './sharp-bg-cache';
import { getSharpSvgDirect } from './sharp-svg-layer';

export type SharpWorkerKind =
  | 'menu'
  | 'api-menu'
  | 'fortune'
  | 'status'
  | 'signin'
  | 'wallet'
  | 'shop'
  | 'fish-basket'
  | 'music-list'
  | 'join-identity'
  | 'bqb';

type Pending = {
  resolve: (result: { buffer: Buffer; mime?: string; ext?: string }) => void;
  reject: (err: Error) => void;
  timer?: ReturnType<typeof setTimeout> | null;
};

/** 单个渲染任务的超时上限（毫秒）。worker 卡死时若没有超时，Promise 会永久 pending */
let gJobTimeoutMs = 20000;

let gPluginDir = '';
let gDataDir = '';
let gWorker: Worker | null = null;
let gNextId = 1;
let gDisabled = false;
let gWarnedMissing = false;
const gPending = new Map<number, Pending>();

export function configureSharpWorkerPaths(opts: {
  pluginDir?: string;
  dataDir?: string;
}): void {
  gPluginDir = String(opts?.pluginDir || '').trim();
  gDataDir = String(opts?.dataDir || '').trim();
}

function runtimePaths(): SharpRuntimePaths {
  return { dataDir: gDataDir, pluginDir: gPluginDir };
}

function toStandaloneArrayBuffer(data: Uint8Array | Buffer): ArrayBuffer {
  const u8 = data instanceof Uint8Array ? data : new Uint8Array(data);
  const ab = new ArrayBuffer(u8.byteLength);
  new Uint8Array(ab).set(u8);
  return ab;
}

function resolveWorkerPath(): string | null {
  const candidates: string[] = [];
  if (gPluginDir) candidates.push(path.join(gPluginDir, 'sharp-worker.mjs'));
  try {
    const here = path.dirname(fileURLToPath(import.meta.url));
    candidates.push(path.join(here, 'sharp-worker.mjs'));
  } catch {
    /* ignore */
  }
  try {
    candidates.push(path.join(process.cwd(), 'sharp-worker.mjs'));
  } catch {
    /* ignore */
  }

  for (const p of candidates) {
    try {
      if (p && fs.existsSync(p) && fs.statSync(p).isFile()) return p;
    } catch {
      /* ignore */
    }
  }
  return null;
}

/** 配置渲染任务超时（毫秒）；非法值回退默认 20s，上限 3 分钟 */
export function configureSharpJobTimeoutMs(value: unknown): void {
  const raw = String(value ?? '').trim();
  if (!raw) {
    gJobTimeoutMs = 20000;
    return;
  }
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) {
    gJobTimeoutMs = 20000;
    return;
  }
  gJobTimeoutMs = Math.max(1000, Math.min(180000, Math.floor(n)));
}

function clearPendingTimer(pending: Pending | undefined): void {
  if (pending?.timer) {
    clearTimeout(pending.timer);
    pending.timer = null;
  }
}

function onWorkerMessage(msg: any) {
  const id = Number(msg?.id);
  const pending = gPending.get(id);
  if (!pending) return;
  gPending.delete(id);
  clearPendingTimer(pending);
  if (msg?.ok === true && msg.buffer) {
    pending.resolve({
      buffer: Buffer.from(msg.buffer),
      mime: msg.mime ? String(msg.mime) : undefined,
      ext: msg.ext ? String(msg.ext) : undefined,
    });
    return;
  }
  pending.reject(new Error(String(msg?.error || 'Sharp Worker 渲染失败')));
}

function onWorkerError(err: Error) {
  const all = [...gPending.values()];
  gPending.clear();
  for (const p of all) {
    clearPendingTimer(p);
    p.reject(err instanceof Error ? err : new Error(String(err)));
  }
  gWorker = null;
}

function onWorkerExit(code: number) {
  if (gPending.size) {
    const err = new Error(`Sharp Worker 异常退出 code=${code}`);
    const all = [...gPending.values()];
    gPending.clear();
    for (const p of all) {
      clearPendingTimer(p);
      p.reject(err);
    }
  }
  gWorker = null;
}

/**
 * 终止当前 worker 并拒绝所有在途任务。
 * 只有渲染超时会走到这里：卡死的任务无法被中断，只能连同线程一起丢弃，
 * 下一次渲染时 ensureWorker() 会重新拉起一个干净的 worker。
 */
function restartWorker(reason: string): void {
  const w = gWorker;
  gWorker = null;
  const all = [...gPending.values()];
  gPending.clear();
  const err = new Error(reason);
  for (const p of all) {
    clearPendingTimer(p);
    p.reject(err);
  }
  if (w) {
    try {
      w.removeAllListeners();
      void w.terminate();
    } catch {
      /* ignore */
    }
  }
}

function ensureWorker(): Worker | null {
  if (gDisabled) return null;
  if (gWorker) return gWorker;
  const workerPath = resolveWorkerPath();
  if (!workerPath) {
    if (!gWarnedMissing) {
      gWarnedMissing = true;
      console.warn?.(
        '[Sharp Worker] 未找到 sharp-worker.mjs，已回退进程内渲染（请确认插件包含 sharp-worker.mjs）',
      );
    }
    gDisabled = true;
    return null;
  }
  try {
    const w = new Worker(workerPath);
    w.on('message', onWorkerMessage);
    w.on('error', onWorkerError);
    w.on('exit', onWorkerExit);
    gWorker = w;
    return w;
  } catch (e) {
    console.warn?.(
      '[Sharp Worker] 启动失败，已回退进程内渲染:',
      e instanceof Error ? e.message : e,
    );
    gDisabled = true;
    return null;
  }
}

export function disposeSharpWorker(): void {
  const w = gWorker;
  gWorker = null;
  gDisabled = false;
  gWarnedMissing = false;
  if (gPending.size) {
    const err = new Error('Sharp Worker 已关闭');
    for (const p of gPending.values()) {
      clearPendingTimer(p);
      p.reject(err);
    }
    gPending.clear();
  }
  if (w) {
    try {
      w.removeAllListeners();
      void w.terminate();
    } catch {
      /* ignore */
    }
  }
}

async function postJob(
  kind: SharpWorkerKind,
  payload: Record<string, unknown>,
  transfer: ArrayBuffer[] = [],
): Promise<{ buffer: Buffer; mime?: string; ext?: string }> {
  // Worker 包会打进 Impl 同文件的客户端包装；在 worker 线程内禁止再开子 Worker
  if (!isMainThread) throw new Error('SHARP_WORKER_UNAVAILABLE');
  const worker = ensureWorker();
  if (!worker) throw new Error('SHARP_WORKER_UNAVAILABLE');
  const id = gNextId++;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      if (!gPending.has(id)) return;
      restartWorker(`Sharp 渲染超时（${gJobTimeoutMs}ms），渲染线程已重启`);
    }, gJobTimeoutMs);
    gPending.set(id, { resolve, reject, timer });
    try {
      worker.postMessage(
        {
          id,
          kind,
          paths: runtimePaths(),
          concurrency: getSharpConcurrency(),
          pngLevel: getSharpPngCompressionLevel(),
          bgCache: getSharpBgCacheConfig(),
          svgDirect: getSharpSvgDirect(),
          payload,
        },
        transfer,
      );
    } catch (e: any) {
      clearPendingTimer(gPending.get(id));
      gPending.delete(id);
      reject(e instanceof Error ? e : new Error(String(e)));
    }
  });
}

/** 卡片类：Worker 回传 PNG 字节 → base64 字符串 */
export async function runCardSharpJob(
  kind: Exclude<SharpWorkerKind, 'bqb'>,
  payload: Record<string, unknown>,
  fallback: () => Promise<string | null>,
): Promise<string | null> {
  try {
    const result = await postJob(kind, payload);
    if (!result.buffer || !result.buffer.length) return null;
    return result.buffer.toString('base64');
  } catch (e: any) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg !== 'SHARP_WORKER_UNAVAILABLE') {
      console.warn?.(`[Sharp Worker] ${kind} 失败，回退进程内:`, msg);
    }
    return fallback();
  }
}

export interface BqbWorkerResult {
  buffer: Buffer;
  mime: string;
  ext: string;
}

/** 表情制作：可 transfer 头像 ArrayBuffer */
export async function runBqbSharpJob(
  payload: Record<string, unknown>,
  buffers: { key: string; data: Buffer }[],
  fallback: () => Promise<BqbWorkerResult>,
): Promise<BqbWorkerResult> {
  const transfer: ArrayBuffer[] = [];
  const cloned: Record<string, unknown> = { ...payload };
  for (const b of buffers) {
    const ab = toStandaloneArrayBuffer(b.data);
    cloned[b.key] = ab;
    transfer.push(ab);
  }
  try {
    const result = await postJob('bqb', cloned, transfer);
    const buf = result.buffer;
    const isGif = buf.length >= 6 && buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46;
    const isJpeg = buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8;
    return {
      buffer: buf,
      mime:
        result.mime
        || (isGif ? 'image/gif' : isJpeg ? 'image/jpeg' : 'image/png'),
      ext: result.ext || (isGif ? 'gif' : isJpeg ? 'jpg' : 'png'),
    };
  } catch (e: any) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg !== 'SHARP_WORKER_UNAVAILABLE') {
      console.warn?.('[Sharp Worker] bqb 失败，回退进程内:', msg);
    }
    return fallback();
  }
}
