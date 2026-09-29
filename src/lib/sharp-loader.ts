// ---------------------------------------------------------------------------
// Sharp 模块加载：优先从「插件数据目录上两级」的 runtime-deps
// 例：咔咔珂 data/<账号>/kakake-plugin-mkbot → data/runtime-deps
//     NapCat config/plugins/napcat-plugin-mkbot → config/runtime-deps（上两级）
// ---------------------------------------------------------------------------

import fs from 'fs';
import path from 'path';
import { pathToFileURL } from 'url';

export type SharpFactory = (
  input?: import('sharp').SharpOptions | Buffer | string,
) => import('sharp').Sharp;

let sharpModule: SharpFactory | null = null;
let searchPaths: string[] = [];

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

export async function loadSharp(): Promise<SharpFactory> {
  if (sharpModule) return sharpModule;

  for (const dir of searchPaths) {
    const loaded = await importSharpFromDir(dir);
    if (loaded) {
      sharpModule = loaded;
      return loaded;
    }
  }

  const mod = await import('sharp');
  sharpModule = (mod.default ?? mod) as SharpFactory;
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
          .png()
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
