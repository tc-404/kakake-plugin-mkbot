// ---------------------------------------------------------------------------
// Sharp 背景图层缓存
//
// 缓存对象：prepareSharpPhotoBackgroundLayer 的结果（resize + blur + PNG 编码），
// 这是整条渲染链路里最贵的一步，而它只由「背景内容 + 尺寸 + 模糊值」决定。
//
// 失效方式：对背景原始字节做 sha1 指纹作为 key 的一部分。
//   → 本地换图、远程背景更新、任何来源的内容变化，指纹都会变，缓存自动失效。
//   比 mtime / URL + TTL 更可靠，且不需要区分来源是本地还是网络。
//
// 不缓存的东西：
//   · 暗度遮罩层——纯色画布，生成成本极低，且随配置实时变化
//   · 成品图——含归笺余额、等级、签到天数等动态数据，缓存会出严重问题
// ---------------------------------------------------------------------------

import crypto from 'crypto';
import type { MkLoggerResolved } from '../types';

const DEFAULT_MAX_ENTRIES = 6;

let enabled = true;
let maxEntries = DEFAULT_MAX_ENTRIES;
/** key -> Buffer，按插入顺序实现 LRU（Map 保序） */
const cache = new Map<string, Buffer>();

/**
 * 配置背景缓存。
 * @param value 开关：'关闭' / 'false' / '0' / 'off' 视为关闭；其它（含留空）视为开启
 * @param maxValue 最多缓存几张（1~32，非法值用默认 6）
 */
export function configureSharpBgCache(value: unknown, maxValue: unknown, logger?: MkLoggerResolved): void {
  const raw = String(value ?? '').trim().toLowerCase();
  const on = !(raw === '关闭' || raw === 'false' || raw === '0' || raw === 'off');
  const n = Number(maxValue);
  const max = Number.isFinite(n) && n > 0 ? Math.max(1, Math.min(32, Math.floor(n))) : DEFAULT_MAX_ENTRIES;
  applyBgCacheState(on, max, logger);
}

function applyBgCacheState(on: boolean, max: number, logger?: MkLoggerResolved): void {
  const before = enabled;
  enabled = !!on;
  maxEntries = max;
  if (!enabled && cache.size) {
    cache.clear();
    if (before) logger?.info?.('[渲染] 背景缓存已关闭，已清空');
  }
  while (enabled && cache.size > maxEntries) {
    const oldest = cache.keys().next().value;
    if (oldest === undefined) break;
    cache.delete(oldest);
  }
}

/**
 * 主线程 → Worker 的配置同步入口。
 * 渲染跑在 worker 线程里，模块级状态不共享，只能靠消息把开关带过去。
 */
export function applySharpBgCacheConfig(cfg: { enabled?: boolean; maxEntries?: number } | null | undefined, logger?: MkLoggerResolved): void {
  if (!cfg || typeof cfg !== 'object') return;
  applyBgCacheState(cfg.enabled !== false, Number(cfg.maxEntries) || DEFAULT_MAX_ENTRIES, logger);
}

/** 供主线程打包进 worker 消息 */
export function getSharpBgCacheConfig(): { enabled: boolean; maxEntries: number } {
  return { enabled, maxEntries };
}

export function clearSharpBgCache() {
  cache.clear();
}

export function getSharpBgCacheSize() {
  return cache.size;
}

function fingerprint(buf: Buffer): string {
  return crypto.createHash('sha1').update(buf).digest('hex').slice(0, 16);
}

/** 生成缓存 key；关闭缓存或背景为空时返回 null（调用方按未命中处理） */
export function makeSharpBgLayerKey(bgBuf: Buffer | null | undefined, width: number, height: number, blurSigma: number): string | null {
  if (!enabled) return null;
  if (!bgBuf || !bgBuf.length) return null;
  return `${fingerprint(bgBuf)}|${width}x${height}|${blurSigma}`;
}

export function getSharpBgLayer(key: string | null): Buffer | null {
  if (!key) return null;
  const hit = cache.get(key);
  if (!hit) return null;
  // 命中后移到末尾，维持 LRU 顺序
  cache.delete(key);
  cache.set(key, hit);
  return hit;
}

export function setSharpBgLayer(key: string | null, buf: Buffer | null | undefined): void {
  if (!key || !buf || !buf.length) return;
  cache.set(key, buf);
  while (cache.size > maxEntries) {
    const oldest = cache.keys().next().value;
    if (oldest === undefined) break;
    cache.delete(oldest);
  }
}
