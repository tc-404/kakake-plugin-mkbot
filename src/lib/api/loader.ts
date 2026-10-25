// ---------------------------------------------------------------------------
// 本地视频解析 API 加载器（运行时从 lib/api/*.mjs 动态导入）
// ---------------------------------------------------------------------------

import fs from 'fs';
import path from 'path';
import { pathToFileURL } from 'url';

export type LocalVideoApiName = 'blbl' | 'dy' | 'xhs' | 'ks' | 'yt' | 'tt';

export interface LocalImghostInput {
  buffer?: Buffer;
  filepath?: string;
  url?: string;
  filename?: string;
}

export interface LocalImghostResult {
  code: number;
  msg: string;
  data?: {
    url: string;
    source: 'cdn58' | 'pngcm' | 'imgdd';
  };
}

export interface LocalMusicSignInput {
  title: string;
  singer?: string;
  image: string;
  url: string;
  audio: string;
  type?: string;
}

export interface LocalMusicSignResult {
  ok: boolean;
  ark?: string;
  payload?: Record<string, unknown>;
  error?: string;
}

type CachedMod<T> = { mtime: number; mod: T };

/** 透传给各解析模块的运行时上下文（Cookie 由 WebUI「视频解析」页维护） */
export interface LocalVideoApiCtx {
  /** 平台名 → Cookie 串（哔哩哔哩 / 抖音 / 小红书 / 快手） */
  cookies?: Record<string, string>;
}

const moduleCache = new Map<LocalVideoApiName, CachedMod<{ parse: (input: string, ctx?: LocalVideoApiCtx) => Promise<unknown> }>>();
let imghostModuleCache: CachedMod<{ upload: (input: LocalImghostInput) => Promise<LocalImghostResult> }> | null =
  null;
let musicSignModuleCache: CachedMod<{ sign: (input: LocalMusicSignInput) => Promise<LocalMusicSignResult> }> | null =
  null;

function readMtimeMs(filePath: string): number {
  try {
    return fs.statSync(filePath).mtimeMs || 0;
  } catch {
    return Date.now();
  }
}

/**
 * 动态 import 并按文件 mtime 失效缓存。
 * Windows 上热重载插件时，Node ESM 会对相同 URL 永久缓存旧模块；
 * 若不带 ?t=mtime，会出现「磁盘已更新但运行仍是旧解析逻辑」——Linux 全进程重启时不明显。
 */
async function importFresh<T>(modPath: string): Promise<{ mtime: number; mod: T }> {
  const mtime = readMtimeMs(modPath);
  const href = `${pathToFileURL(modPath).href}?t=${mtime}`;
  const mod = (await import(href)) as T;
  return { mtime, mod };
}

/**
 * 调用本地 lib/api 解析模块
 * @param pluginDir 插件根目录（index.mjs 所在目录，即 kakake-plugin-mkbot/）
 * @param apiName blbl | dy | xhs | ks | yt | tt
 * @param input 链接或原始文本
 */
export async function callLocalVideoApi(
  pluginDir: string,
  apiName: LocalVideoApiName,
  input: string,
  ctx?: LocalVideoApiCtx,
): Promise<unknown> {
  const modPath = path.join(pluginDir, 'lib', 'api', `${apiName}.mjs`);
  const mtime = readMtimeMs(modPath);
  const cached = moduleCache.get(apiName);
  if (!cached || cached.mtime !== mtime) {
    const loaded = await importFresh<{ parse: (input: string, ctx?: LocalVideoApiCtx) => Promise<unknown> }>(modPath);
    moduleCache.set(apiName, loaded);
  }
  return moduleCache.get(apiName)!.mod.parse(input, ctx);
}

/**
 * 调用本地 lib/api 聚合图床模块（58同城 → fuliba → IMGDD）
 * @param pluginDir 插件根目录（index.mjs 所在目录）
 * @param input buffer / filepath / url + 可选 filename
 */
export async function callLocalImghostApi(
  pluginDir: string,
  input: LocalImghostInput,
): Promise<LocalImghostResult> {
  const modPath = path.join(pluginDir, 'lib', 'api', 'imghost.mjs');
  const mtime = readMtimeMs(modPath);
  if (!imghostModuleCache || imghostModuleCache.mtime !== mtime) {
    imghostModuleCache = await importFresh<{
      upload: (input: LocalImghostInput) => Promise<LocalImghostResult>;
    }>(modPath);
  }
  return imghostModuleCache.mod.upload(input);
}

/**
 * 调用本地 lib/api/music-sign.mjs（CZ QQ 音乐 Ark 签名）
 */
export async function callLocalMusicSignApi(
  pluginDir: string,
  input: LocalMusicSignInput,
): Promise<LocalMusicSignResult> {
  const modPath = path.join(pluginDir, 'lib', 'api', 'music-sign.mjs');
  const mtime = readMtimeMs(modPath);
  if (!musicSignModuleCache || musicSignModuleCache.mtime !== mtime) {
    musicSignModuleCache = await importFresh<{
      sign: (input: LocalMusicSignInput) => Promise<LocalMusicSignResult>;
    }>(modPath);
  }
  return musicSignModuleCache.mod.sign(input);
}
