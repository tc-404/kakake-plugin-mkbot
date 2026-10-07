// ---------------------------------------------------------------------------
// SVG UI 图层：直传 composite，跳过「栅格化 → PNG 编码 → 解码」这一整轮
//
// 旧路径（栅格化）：
//   SVG → librsvg 栅格化成 RGBA → PNG 编码(zlib deflate) → composite 解码 PNG(inflate) → 合成
//   一趟全画幅 PNG 编码 + 解码，在 1680×1010 这类卡片上是纯浪费，
//   而 PNG 编码恰好是整条链路里唯一强制单线程的一段。
//
// 新路径（直传）：
//   把 SVG buffer 直接交给 composite，由 sharp/libvips 内部栅格化后合成，
//   省掉一整轮编解码，像素结果完全一致。
//
// 直传的硬约束：composite 要求图层尺寸 ≤ 底图尺寸，且旧逻辑是 resize 拉伸填满画布。
// 所以只有 SVG 固有尺寸「正好等于」画布尺寸（±1px 容差）时才直传；
// 尺寸对不上就回退栅格化 —— 否则会变成左上角贴一块小图，属于行为变更。
//
// 另外，直传失败时 composite 的报错发生在调用方的 toBuffer()，本地根本 catch 不到，
// 因此这里先用 metadata() 主动探一次尺寸，不匹配就直接走兜底，不冒险。
// ---------------------------------------------------------------------------

import { MK_PNG_OUT } from './png-output';
import type { loadSharp } from './sharp-loader';
import type { MkLoggerResolved } from '../types';

type SharpFactory = Awaited<ReturnType<typeof loadSharp>>;

let directEnabled = true;

/** 配置 SVG 直传：'关闭' / 'false' / '0' / 'off' 视为关闭；其它（含留空）视为开启 */
export function configureSharpSvgDirect(value: unknown, logger?: MkLoggerResolved): void {
  const raw = String(value ?? '').trim().toLowerCase();
  directEnabled = !(raw === '关闭' || raw === 'false' || raw === '0' || raw === 'off');
  logger?.info?.(`[渲染] SVG 直传合成已${directEnabled ? '开启' : '关闭'}`);
}

export function getSharpSvgDirect(): boolean {
  return directEnabled;
}

/** 粗判：buffer 是不是 SVG。只看开头若干字节，够用且不贵 */
export function looksLikeSvg(buf: Buffer | null | undefined): boolean {
  if (!buf || !buf.length) return false;
  const head = buf.subarray(0, 512).toString('utf8').replace(/^﻿/, '').replace(/^\s+/, '');
  return head.startsWith('<svg') || head.startsWith('<?xml');
}

/**
 * 探 SVG 固有尺寸。探不出来返回 null，调用方按「不能直传」处理。
 */
export async function probeSvgSize(
  sharp: SharpFactory,
  buf: Buffer,
): Promise<{ width: number; height: number } | null> {
  try {
    // density 不显式传：sharp 默认就是 72，与后面 composite 内部栅格化用的是同一个值
    const meta = await sharp(buf).metadata();
    const w = Number(meta?.width);
    const h = Number(meta?.height);
    if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) return null;
    return { width: w, height: h };
  } catch {
    return null;
  }
}

/** SVG 能否直传：必须看起来是 SVG，且固有尺寸与画布一致 */
export async function canCompositeSvgDirect(
  sharp: SharpFactory,
  buf: Buffer,
  width: number,
  height: number,
): Promise<boolean> {
  if (!directEnabled) return false;
  if (!looksLikeSvg(buf)) return false;
  const size = await probeSvgSize(sharp, buf);
  if (!size) return false;
  return Math.abs(size.width - width) <= 1 && Math.abs(size.height - height) <= 1;
}

/** 兜底：栅格化 + PNG 编码（旧路径） */
export async function rasterizeLayer(
  sharp: SharpFactory,
  buf: Buffer,
  width: number,
  height: number,
): Promise<Buffer> {
  return sharp(buf)
    .resize(width, height, { fit: 'fill' })
    .ensureAlpha()
    .png(MK_PNG_OUT())
    .toBuffer();
}

/**
 * 取一个可直接塞进 composite 的 SVG 图层：
 * 能直传就原样返回 SVG buffer，否则返回栅格化后的 PNG。
 */
export async function svgCompositeLayer(
  sharp: SharpFactory,
  buf: Buffer,
  width: number,
  height: number,
): Promise<Buffer> {
  if (await canCompositeSvgDirect(sharp, buf, width, height)) return buf;
  return rasterizeLayer(sharp, buf, width, height);
}
