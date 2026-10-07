// ---------------------------------------------------------------------------
// Sharp 自定义图片：全局主文字颜色（config.json，WebUI 进阶设置）
// ---------------------------------------------------------------------------

import fs from 'fs';
import path from 'path';
import type { MkReadB } from '../types';

export const SHARP_TEXT_COLOR_CONFIG_KEY = 'Sharp全局字体色';

const HEX_COLOR_RE = /^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6}|[0-9A-Fa-f]{8})$/;

export function parseSharpTextColor(value: unknown): string | null {
  const s = String(value ?? '').trim();
  if (!s) return null;
  if (!HEX_COLOR_RE.test(s)) return null;
  if (s.length === 4) {
    const r = s[1];
    const g = s[2];
    const b = s[3];
    return `#${r}${r}${g}${g}${b}${b}`;
  }
  return s.length === 9 ? s.slice(0, 7) : s;
}

export function resolveSharpTextColorFromConfig(
  config: Record<string, unknown> | null | undefined,
): string | null {
  return parseSharpTextColor(config?.[SHARP_TEXT_COLOR_CONFIG_KEY]);
}

export function resolveSharpTextColorFromReadB(readB: MkReadB): string | null {
  return parseSharpTextColor(readB('config.json', SHARP_TEXT_COLOR_CONFIG_KEY, ''));
}

export function loadSharpTextColorFromDataPath(dataPath: string): string | null {
  const dir = String(dataPath || '').trim();
  if (!dir) return null;
  try {
    const cfgPath = path.join(dir, 'config.json');
    if (!fs.existsSync(cfgPath)) return null;
    const raw = JSON.parse(fs.readFileSync(cfgPath, 'utf-8')) as Record<string, unknown>;
    return resolveSharpTextColorFromConfig(raw);
  } catch {
    return null;
  }
}

/** 有自定义色则用自定义，否则用各图原有 fallback */
export function resolveSharpTextFill(custom: string | null, fallback: string): string {
  return custom ?? fallback;
}
