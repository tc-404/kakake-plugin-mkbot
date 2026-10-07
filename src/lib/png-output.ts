// ---------------------------------------------------------------------------
// Sharp 位图输出参数统一出口（PNG / JPEG）
//
// 全项目近百处无参 png() 原先都用 sharp 默认（compressionLevel=6，最慢档）。
// PNG 编码在整条渲染链路里占相当比重的 CPU，低配机器上把级别降到 3~4
// 能明显缩短出图耗时，代价只是体积略增（约 5~10%），视觉无差异。
// 留空 = 完全沿用 sharp 默认，行为与改动前一致。
//
// JPEG：照片类大图（如今日运势 720×1280）用 PNG 无损编码体积可达 1~2MB，
// base64 内联后 1.3~2.4MB 足以让协议端 sendMsg 超时；改 JPEG(q85) 后约 0.25MB，
// 缩小约 90% 且肉眼无差异。需要透明通道的图层（头像遮罩等）仍走 PNG。
// ---------------------------------------------------------------------------

import type { MkLoggerResolved } from '../types';

/** PNG 压缩级别 0~9；null = 沿用 sharp 默认（6）。0 最快体积最大，9 最慢体积最小 */
let pngCompressionLevel: number | null = null;

export function configureSharpPngCompressionLevel(value: unknown, logger?: MkLoggerResolved): void {
  const raw = String(value ?? '').trim();
  if (!raw) {
    pngCompressionLevel = null;
    return;
  }
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0 || n > 9) {
    pngCompressionLevel = null;
    logger?.warn?.('[渲染] PNG压缩级别配置无效（应为 0~9 或留空），已回退 sharp 默认:', raw);
    return;
  }
  const next = Math.floor(n);
  if (pngCompressionLevel !== next) {
    logger?.info?.(`[渲染] PNG 压缩级别设为 ${next}`);
  }
  pngCompressionLevel = next;
}

/** 当前 PNG 压缩级别；null 表示沿用 sharp 默认 */
export function getSharpPngCompressionLevel(): number | null {
  return pngCompressionLevel;
}

/** 供 png(...) 使用；未配置时返回空对象，等价于 sharp 默认参数 */
export function MK_PNG_OUT(): { compressionLevel?: number } {
  return pngCompressionLevel == null ? {} : { compressionLevel: pngCompressionLevel };
}

// ---------------------------------------------------------------------------
// JPEG
// ---------------------------------------------------------------------------

/** JPEG 质量 1~100；null = 沿用默认（85） */
let jpegQuality: number | null = null;

const MK_JPEG_DEFAULT_QUALITY = 85;

export function configureSharpJpegQuality(value: unknown, logger?: MkLoggerResolved): void {
  const raw = String(value ?? '').trim();
  if (!raw) {
    jpegQuality = null;
    return;
  }
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 1 || n > 100) {
    jpegQuality = null;
    logger?.warn?.('[渲染] JPEG质量配置无效（应为 1~100 或留空），已回退默认:', raw);
    return;
  }
  const next = Math.floor(n);
  if (jpegQuality !== next) {
    logger?.info?.(`[渲染] JPEG 质量设为 ${next}`);
  }
  jpegQuality = next;
}

/**
 * 供 jpeg(...) 使用。
 * mozjpeg 在同等质量下体积更小（约再省 5~10%），代价是编码稍慢，适合大图一次性出图。
 */
export function MK_JPEG_OUT(): { quality: number; mozjpeg: boolean } {
  return { quality: jpegQuality ?? MK_JPEG_DEFAULT_QUALITY, mozjpeg: true };
}
