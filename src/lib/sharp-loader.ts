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
/** 最近一次 sharp 加载/探测失败的原始错误（用于诊断：glibc 太老 / @img 损坏 / Node 太老等） */
let lastSharpLoadError = '';

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
  if (pluginDir) {
    const abs = path.resolve(pluginDir);
    next.push(abs);
    // 咔咔珂把插件装在 plugins_two/<账号>/<插件>，sharp 有时随宿主装在
    // 项目根 /root/kakake/node_modules。补上几级祖先目录，避免只因
    // 「index.mjs 相对解析不到 bare sharp」就整条渲染链路回退到 HTML。
    for (const up of ['..', '../..', '../../..']) {
      const base = path.resolve(abs, up);
      if (base !== abs && !next.includes(base)) next.push(base);
    }
  }
  const cwd = path.resolve(process.cwd());
  if (!next.includes(cwd)) next.push(cwd);
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
  // sharp 0.35+ 入口在 dist/（ESM/CJS），0.33/0.34 为 lib/index.js，更早为 lib/sharp.js
  return [
    path.join(root, 'dist', 'index.mjs'),
    path.join(root, 'dist', 'index.cjs'),
    path.join(root, 'lib', 'index.js'),
    path.join(root, 'lib', 'sharp.js'),
  ];
}

function recordSharpLoadError(e: unknown, where: string): void {
  const msg = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
  lastSharpLoadError = msg ? `[${where}] ${msg}` : `[${where}] 未知错误`;
}

/** 最近一次 sharp 加载失败的原始错误；从未失败过则返回空串 */
export function getLastSharpLoadError(): string {
  return lastSharpLoadError;
}

async function importSharpFromDir(baseDir: string): Promise<SharpFactory | null> {
  for (const entry of sharpEntryCandidates(baseDir)) {
    if (!fileExists(entry)) continue;
    try {
      const mod = await import(pathToFileURL(entry).href);
      const factory = (mod.default ?? mod) as SharpFactory;
      if (typeof factory === 'function') return factory;
      recordSharpLoadError(new Error('模块加载成功但导出不是可调用工厂'), entry);
    } catch (e) {
      // 记录真实失败原因再试下一个候选——这条错误是诊断 glibc / @img 损坏的关键证据
      recordSharpLoadError(e, entry);
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

  try {
    const mod = await import('sharp');
    sharpModule = (mod.default ?? mod) as SharpFactory;
    applySharpConcurrency(sharpModule);
    return sharpModule;
  } catch (e) {
    recordSharpLoadError(
      e,
      searchPaths.length
        ? `runtime-deps(${searchPaths.join(' | ')}) 及内置 sharp`
        : '内置 sharp',
    );
    const detail = e instanceof Error ? e.message : String(e);
    // 咔咔珂把插件装在 plugins_two/<账号>/ 下，bare 'sharp' 从 index.mjs
    // 解析不到时只报一句 Cannot find package，用户完全不知道该装哪里。
    if (/Cannot find package|ERR_MODULE_NOT_FOUND/i.test(detail)) {
      throw new Error(
        `未找到 sharp 运行时依赖（${detail}）。请在 MKbot WebUI「渲染设置 → Sharp 运行时依赖」安装，` +
          '或把 sharp 装到 data/runtime-deps；未安装时图片渲染会回退到 HTML/puppeteer。',
      );
    }
    throw e;
  }
}

export async function probeSharpAvailable(timeoutMs = 8000): Promise<boolean> {
  let timedOut = false;
  try {
    const ok = await Promise.race([
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
        setTimeout(() => {
          timedOut = true;
          resolve(false);
        }, timeoutMs);
      }),
    ]);
    if (ok) {
      lastSharpLoadError = '';
      return true;
    }
    // 超时分支：没有异常可记，但要让上层知道是「加载/渲染卡死」而不是「请重新安装」
    if (timedOut && !lastSharpLoadError) {
      lastSharpLoadError = `[probe] ${timeoutMs}ms 内未完成加载+渲染（可能卡在原生模块初始化）`;
    }
    return false;
  } catch (e) {
    recordSharpLoadError(e, 'probe');
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
