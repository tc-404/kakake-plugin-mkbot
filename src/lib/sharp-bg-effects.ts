// ---------------------------------------------------------------------------
// Sharp 自定义图片背景：暗度 / 模糊（config.json，WebUI 进阶设置）
// ---------------------------------------------------------------------------

import fs from 'fs';
import path from 'path';
import type { MkReadB } from '../types';
import type { loadSharp } from './sharp-loader';
import { MK_PNG_OUT } from './png-output';
import { makeSharpBgLayerKey, getSharpBgLayer, setSharpBgLayer } from './sharp-bg-cache';

export const SHARP_BG_DIM_CONFIG_KEY = 'Sharp背景暗度';
export const SHARP_BG_BLUR_CONFIG_KEY = 'Sharp背景模糊';
export const DEFAULT_SHARP_BG_DIM_PERCENT = 40;
export const DEFAULT_SHARP_BG_BLUR = 0;
export const MAX_SHARP_BG_BLUR = 30;

export interface SharpBgEffects {
  /** 暗色遮罩透明度 0~1 */
  dimAlpha: number;
  /** Gaussian blur sigma，0 表示不模糊 */
  blurSigma: number;
}

export function parseSharpBgDimPercent(value: unknown): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return DEFAULT_SHARP_BG_DIM_PERCENT;
  return Math.min(100, Math.max(0, n));
}

export function parseSharpBgBlurSigma(value: unknown): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return DEFAULT_SHARP_BG_BLUR;
  return Math.min(MAX_SHARP_BG_BLUR, Math.max(0, n));
}

export function resolveSharpBgEffectsFromConfig(
  config: Record<string, unknown> | null | undefined,
): SharpBgEffects {
  const dimPct = parseSharpBgDimPercent(config?.[SHARP_BG_DIM_CONFIG_KEY]);
  const blurSigma = parseSharpBgBlurSigma(config?.[SHARP_BG_BLUR_CONFIG_KEY]);
  return {
    dimAlpha: dimPct / 100,
    blurSigma,
  };
}

export function resolveSharpBgEffectsFromReadB(readB: MkReadB): SharpBgEffects {
  return resolveSharpBgEffectsFromConfig({
    [SHARP_BG_DIM_CONFIG_KEY]: readB('config.json', SHARP_BG_DIM_CONFIG_KEY, DEFAULT_SHARP_BG_DIM_PERCENT),
    [SHARP_BG_BLUR_CONFIG_KEY]: readB('config.json', SHARP_BG_BLUR_CONFIG_KEY, DEFAULT_SHARP_BG_BLUR),
  });
}

export function loadSharpBgEffectsFromDataPath(dataPath: string): SharpBgEffects {
  const dir = String(dataPath || '').trim();
  if (!dir) return resolveSharpBgEffectsFromConfig(null);
  try {
    const cfgPath = path.join(dir, 'config.json');
    if (!fs.existsSync(cfgPath)) return resolveSharpBgEffectsFromConfig(null);
    const raw = JSON.parse(fs.readFileSync(cfgPath, 'utf-8')) as Record<string, unknown>;
    return resolveSharpBgEffectsFromConfig(raw);
  } catch {
    return resolveSharpBgEffectsFromConfig(null);
  }
}

type SharpFactory = Awaited<ReturnType<typeof loadSharp>>;

export async function prepareSharpPhotoBackgroundLayer(
  sharp: SharpFactory,
  bgBuf: Buffer,
  width: number,
  height: number,
  effects: SharpBgEffects,
): Promise<Buffer> {
  let pipeline = sharp(bgBuf).resize(width, height, { fit: 'cover', position: 'centre' });
  if (effects.blurSigma > 0) {
    pipeline = pipeline.blur(effects.blurSigma);
  }
  return pipeline.ensureAlpha().png(MK_PNG_OUT()).toBuffer();
}

export async function createSharpDimOverlayLayer(
  sharp: SharpFactory,
  width: number,
  height: number,
  dimAlpha: number,
): Promise<Buffer | null> {
  if (dimAlpha <= 0) return null;
  return sharp({
    create: {
      width,
      height,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: dimAlpha },
    },
  })
    .png(MK_PNG_OUT())
    .toBuffer();
}

/** 将背景图 + 暗色遮罩压入 composite 列表（Worker / Impl 内调用） */
export async function applySharpPhotoBackgroundLayers(
  sharp: SharpFactory,
  composites: { input: Buffer; top?: number; left?: number }[],
  bgBuf: Buffer,
  width: number,
  height: number,
  dataPath?: string,
  effectsOverride?: SharpBgEffects,
): Promise<void> {
  const effects = effectsOverride ?? loadSharpBgEffectsFromDataPath(String(dataPath || ''));

  // 背景图层缓存：resize + blur + PNG 编码是整条链路最贵的一步，
  // 且结果只由「背景内容指纹 + 尺寸 + 模糊值」决定，与任何动态数据无关，可以安全复用。
  // 指纹取背景原始字节的 sha1，换图/改图后指纹变化 → 自动失效。
  const cacheKey = makeSharpBgLayerKey(bgBuf, width, height, effects.blurSigma);
  let bgLayer = getSharpBgLayer(cacheKey);
  if (!bgLayer) {
    bgLayer = await prepareSharpPhotoBackgroundLayer(sharp, bgBuf, width, height, effects);
    setSharpBgLayer(cacheKey, bgLayer);
  }

  composites.push({ input: bgLayer, top: 0, left: 0 });
  // 暗色遮罩随配置实时变化且生成成本极低，不缓存
  const dimOverlay = await createSharpDimOverlayLayer(sharp, width, height, effects.dimAlpha);
  if (dimOverlay) composites.push({ input: dimOverlay, top: 0, left: 0 });
}
