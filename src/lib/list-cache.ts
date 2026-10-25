// ---------------------------------------------------------------------------
// 名单文件读缓存（黑白名单 / 免死金牌等「整文件 = 字符串数组」的小文件）
//
// 背景：mkResolveListStatus 挂在「每条群消息」的处理路径上，一次身份判定最多
// 读 4 个 JSON；readA 是existsSync + readFileSync 的同步 IO，繁忙群里这笔开销
// 落在事件循环主线程上。用 mtime 做失效键，读多写少的名单只需一次 statSync。
//
// 失效策略：以 (mtimeMs, size) 为键。文件没变则复用缓存；任何写入方（本模块的
// writeA、剪贴板粘贴、手工改文件）改动文件都会改变 mtime，缓存自动失效，
// 无需调用方配合通知，因此不存在「忘了清缓存导致读到旧名单」的风险。
// ---------------------------------------------------------------------------

import fs from 'fs';
import path from 'path';
import { readA, resolvePluginOrDataPath } from '../data-fs';

type CacheEntry = {
  mtimeMs: number;
  size: number;
  list: string[];
};

const cache = new Map<string, CacheEntry>();

/** 名单文件不该很大；超过这个体积说明数据异常，直接绕过缓存走原路径 */
const MAX_CACHE_BYTES = 512 * 1024;

/** 不缓存空结果：空名单最常见（多数群没开名单）且每次读都是「文件不存在」，statSync 也省不掉，但避免缓存污染 */
function statOf(abs: string): { mtimeMs: number; size: number } | null {
  try {
    const st = fs.statSync(abs);
    return { mtimeMs: st.mtimeMs, size: st.size };
  } catch {
    return null;
  }
}

function readListFromDisk(file: string): string[] {
  try {
    const raw = JSON.parse(readA(file) || '[]');
    return Array.isArray(raw) ? raw.map(String) : [];
  } catch {
    return [];
  }
}

/**
 * 读取名单数组（元素统一为字符串）。
 * 返回的是内部数组的副本，调用方可以安全 filter/sort 而不会污染缓存。
 */
export function loadCachedList(file: string): string[] {
  const key = String(file ?? '');
  if (!key) return [];

  const abs = resolvePluginOrDataPath(key);
  const st = statOf(abs);
  if (!st) {
    // 文件不存在（多数群的常态）：清掉可能存在的旧条目，直接返回空
    cache.delete(key);
    return [];
  }
  if (st.size > MAX_CACHE_BYTES) {
    return readListFromDisk(key);
  }

  const hit = cache.get(key);
  if (hit && hit.mtimeMs === st.mtimeMs && hit.size === st.size) {
    return hit.list.slice();
  }

  const list = readListFromDisk(key);
  cache.set(key, { mtimeMs: st.mtimeMs, size: st.size, list: list.slice() });
  return list;
}

/** 主动失效（写入后立即调用可省掉一次 statSync；非必需，仅用于写路径顺手清理） */
export function invalidateCachedList(file: string): void {
  cache.delete(String(file ?? ''));
}

/** 清空全部缓存（切换数据目录、批量导入后调用） */
export function invalidateAllCachedLists(): void {
  cache.clear();
}

/** 仅供自检/测试：当前缓存条目数 */
export function cachedListCount(): number {
  return cache.size;
}
