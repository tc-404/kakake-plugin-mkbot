// ---------------------------------------------------------------------------
// 图片渲染全局开关与渲染模式（与「测试功能 cs_of」分离）
// config.json: 图片渲染 (boolean), 渲染模式 ('html' | 'sharp')
// ---------------------------------------------------------------------------

import type { MkReadB } from '../types';

export type MkRenderMode = 'html' | 'sharp';

const LEGACY_RENDER_KEYS = ['图片渲染', '渲染开关'] as const;

/** 是否开启图片渲染（兼容旧版 cs_of 误绑定的配置，仅读取不回写） */
export function isImageRenderEnabled(readB: MkReadB): boolean {
  for (const key of LEGACY_RENDER_KEYS) {
    const v = readB('config.json', key, undefined);
    if (v === true || v === 'true' || v === 1 || v === '1') return true;
    if (v === false || v === 'false' || v === 0 || v === '0') return false;
  }
  // 旧版曾把图片渲染绑在测试功能上
  const legacy = readB('config.json', 'cs_of', false);
  return legacy === true || legacy === 'true';
}

/** 渲染模式：html（Puppeteer）| sharp（Node Sharp）；默认 html */
export function getRenderMode(readB: MkReadB): MkRenderMode {
  const raw = String(readB('config.json', '渲染模式', 'html') || 'html')
    .trim()
    .toLowerCase();
  if (raw === 'sharp' || raw === 'node' || raw === 'nodejs') return 'sharp';
  // 兼容旧 python 选项名，映射到 sharp
  if (raw === 'python' || raw === 'py') return 'sharp';
  return 'html';
}

export function normalizeRenderModeInput(value: unknown): MkRenderMode {
  const raw = String(value ?? 'html').trim().toLowerCase();
  if (raw === 'sharp' || raw === 'python' || raw === 'py' || raw === 'node') return 'sharp';
  return 'html';
}

export {
  resolveSharpBgEffectsFromReadB,
  parseSharpBgDimPercent,
  parseSharpBgBlurSigma,
  SHARP_BG_DIM_CONFIG_KEY,
  SHARP_BG_BLUR_CONFIG_KEY,
  DEFAULT_SHARP_BG_DIM_PERCENT,
  DEFAULT_SHARP_BG_BLUR,
  MAX_SHARP_BG_BLUR,
} from './sharp-bg-effects';

export {
  parseSharpTextColor,
  resolveSharpTextColorFromReadB,
  loadSharpTextColorFromDataPath,
  resolveSharpTextFill,
  SHARP_TEXT_COLOR_CONFIG_KEY,
} from './sharp-text-color';
