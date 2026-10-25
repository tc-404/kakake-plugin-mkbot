// ---------------------------------------------------------------------------
// Sharp 模块加载：优先从「插件数据目录上两级」的 runtime-deps
// 例：咔咔珂 data/<账号>/kakake-plugin-mkbot → data/runtime-deps
//     NapCat config/plugins/napcat-plugin-mkbot → config/runtime-deps（上两级）
// ---------------------------------------------------------------------------

import fs from 'fs';
import path from 'path';
import { pathToFileURL } from 'url';
import { MK_PNG_OUT } from './png-output';

export type SharpFactory = (
  input?: import('sharp').SharpOptions | Buffer | string,
) => import('sharp').Sharp;

let sharpModule: SharpFactory | null = null;
let searchPaths: string[] = [];
/** libvips 并发线程数；null = 沿用 sharp 默认（等于 CPU 核数） */
let sharpConcurrency: number | null = null;

export interface SharpRuntimePaths {
  /** 插件数据目录（咔咔珂: data/<账号>/kakake-plugin-mkbot） */
  dataDir?: string;
  /** 插件代码目录（咔咔珂: plugins_two/<账号>/kakake-plugin-mkbot） */
  pluginDir?: string;
}

/** runtime-deps 子目录名：npm install 目标，挂在插件数据目录上两级 */
export const SHARP_RUNTIME_DEPS_DIR = 'runtime-deps';

/**
 * 由插件数据目录解析 runtime-deps：dirname(dirname(dataDir))/runtime-deps
 * Kakake 例：…/data/123/kakake-plugin-mkbot → …/data/runtime-deps
 */
export function resolveSharpRuntimeDepsDir(dataDir: string): string {
  const resolved = path.resolve(String(dataDir || '').trim());
  if (!resolved) return path.join('.', SHARP_RUNTIME_DEPS_DIR);
  return path.join(path.dirname(path.dirname(resolved)), SHARP_RUNTIME_DEPS_DIR);
}

/** 解析 Sharp 依赖安装/检测目录（优先「上两级」/runtime-deps） */
export function resolveSharpInstallDir(paths: SharpRuntimePaths): string {
  const dataDir = String(paths.dataDir || '').trim();
  if (dataDir) return resolveSharpRuntimeDepsDir(dataDir);
  return path.resolve(String(paths.pluginDir || '').trim());
}

export function configureSharpRuntimePaths(paths: SharpRuntimePaths): void {
  const dataDir = String(paths.dataDir || '').trim();
  const pluginDir = String(paths.pluginDir || '').trim();
  const next: string[] = [];
  if (dataDir) next.push(resolveSharpRuntimeDepsDir(dataDir));
  if (pluginDir) next.push(path.resolve(pluginDir));
  searchPaths = next;
}

function fileExists(p: string): boolean {
  try {
    return fs.existsSync(p);
  } catch {
    return false;
  }
}

function sharpEntryCandidates(baseDir: string): string[] {
  const root = path.join(baseDir, 'node_modules', 'sharp');
  return [
    path.join(root, 'lib', 'index.js'),
    path.join(root, 'lib', 'sharp.js'),
  ];
}

async function importSharpFromDir(baseDir: string): Promise<SharpFactory | null> {
  for (const entry of sharpEntryCandidates(baseDir)) {
    if (!fileExists(entry)) continue;
    try {
      const mod = await import(pathToFileURL(entry).href);
      const factory = (mod.default ?? mod) as SharpFactory;
      if (typeof factory === 'function') return factory;
    } catch {
      // try next
    }
  }
  return null;
}

/** npm install 后需清缓存以便重新加载 native 模块 */
export function resetSharpModuleCache(): void {
  sharpModule = null;
}

/**
 * 设置 libvips 内部线程数（等价于环境变量 VIPS_CONCURRENCY）。
 *
 * 只影响图像流水线里的「像素运算」阶段（缩放 / 合成 / 滤镜）；
 * SVG 栅格化与 PNG/JPEG 编码始终单线程，调这个值不会变快。
 * 默认（空 / 0 / 非法值）= CPU 核数。核数多但单核算力弱、或机器上还有
 * 其它常驻进程抢 CPU 时，手动设成 1~2 往往更快也更稳。
 */
export function configureSharpConcurrency(
  value: unknown,
  logger?: { info?: (...args: unknown[]) => void; warn?: (...args: unknown[]) => void },
): void {
  const raw = String(value ?? '').trim();
  if (!raw) {
    sharpConcurrency = null;
    return;
  }
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) {
    sharpConcurrency = null;
    logger?.warn?.('[渲染] 渲染并发配置无效，已回退 sharp 默认:', raw);
    return;
  }
  const next = Math.max(1, Math.min(16, Math.floor(n)));
  if (sharpConcurrency !== next) {
    logger?.info?.(`[渲染] libvips 并发线程数设为 ${next}`);
  }
  sharpConcurrency = next;
  // sharp 已加载则立即生效（运行中改配置也支持）
  if (sharpModule) applySharpConcurrency(sharpModule);
}

/** 当前 libvips 并发设置；null 表示沿用 sharp 默认 */
export function getSharpConcurrency(): number | null {
  return sharpConcurrency;
}

function applySharpConcurrency(factory: SharpFactory): void {
  if (sharpConcurrency == null) return;
  try {
    const fn = (factory as unknown as { concurrency?: (n: number) => unknown }).concurrency;
    if (typeof fn === 'function') fn.call(factory, sharpConcurrency);
  } catch {
    // 旧版 sharp 无此 API，忽略
  }
}

export async function loadSharp(): Promise<SharpFactory> {
  if (sharpModule) return sharpModule;

  for (const dir of searchPaths) {
    const loaded = await importSharpFromDir(dir);
    if (loaded) {
      sharpModule = loaded;
      applySharpConcurrency(sharpModule);
      return loaded;
    }
  }

  const mod = await import('sharp');
  sharpModule = (mod.default ?? mod) as SharpFactory;
  applySharpConcurrency(sharpModule);
  return sharpModule;
}

export async function probeSharpAvailable(timeoutMs = 8000): Promise<boolean> {
  try {
    return await Promise.race([
      (async () => {
        const sharp = await loadSharp();
        await sharp({
          create: { width: 2, height: 2, channels: 3, background: '#000' },
        })
          .png(MK_PNG_OUT())
          .toBuffer();
        return true;
      })(),
      new Promise<boolean>((resolve) => {
        setTimeout(() => resolve(false), timeoutMs);
      }),
    ]);
  } catch {
    return false;
  }
}

/** node_modules/sharp 是否已存在（不加载 native） */
export function isSharpPackagePresentAt(baseDir: string): boolean {
  const dir = String(baseDir || '').trim();
  if (!dir) return false;
  return fileExists(path.join(dir, 'node_modules', 'sharp', 'package.json'));
}

export function isSharpPackagePresent(paths: SharpRuntimePaths): boolean {
  for (const dir of [resolveSharpInstallDir(paths), ...searchPaths]) {
    if (dir && isSharpPackagePresentAt(dir)) return true;
  }
  const pluginDir = String(paths.pluginDir || '').trim();
  if (pluginDir && isSharpPackagePresentAt(pluginDir)) return true;
  return false;
}

/** 确保 runtime-deps 目录有 package.json（从插件包复制 sharp 声明） */
export function ensureSharpRuntimePackage(
  paths: SharpRuntimePaths,
  logger?: { info?: (...args: unknown[]) => void; warn?: (...args: unknown[]) => void },
): string {
  const installDir = resolveSharpInstallDir(paths);
  fs.mkdirSync(installDir, { recursive: true });

  const pkgPath = path.join(installDir, 'package.json');
  if (fileExists(pkgPath)) return installDir;

  const pluginPkgPath = path.join(String(paths.pluginDir || '').trim(), 'package.json');
  let sharpRange = '^0.34.3';
  try {
    if (fileExists(pluginPkgPath)) {
      const pluginPkg = JSON.parse(fs.readFileSync(pluginPkgPath, 'utf-8')) as {
        dependencies?: Record<string, string>;
      };
      if (pluginPkg?.dependencies?.sharp) sharpRange = pluginPkg.dependencies.sharp;
    }
  } catch (e) {
    logger?.warn?.('[依赖] 读取插件 package.json 失败，使用默认 sharp 版本', e);
  }

  const runtimePkg = {
    name: 'mkbot-sharp-runtime-deps',
    private: true,
    type: 'module',
    dependencies: {
      sharp: sharpRange,
    },
  };
  fs.writeFileSync(pkgPath, JSON.stringify(runtimePkg, null, 2), 'utf-8');
  logger?.info?.(`[依赖] 已写入 ${pkgPath}`);
  return installDir;
}
