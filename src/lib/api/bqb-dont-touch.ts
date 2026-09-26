// ---------------------------------------------------------------------------
// bqb-dont-touch：别碰（静态 PNG，移植自 meme-generator-rs dont_touch）
// ---------------------------------------------------------------------------

import fs from 'fs';
import path from 'path';
import { getBqbSharp, resolveBqbSubdir } from './bqb-shared';
import type { BqbRenderResult } from './bqb-crawl';

interface Bucket {
  r: number;
  g: number;
  b: number;
  count: number;
}

export interface BqbDontTouchInput {
  avatar: Buffer;
  dataPath: string;
  pluginDir: string;
}

function pickDominantColors(data: Uint8Array): string[] {
  const buckets: Bucket[] = Array.from({ length: 8 }, () => ({ r: 0, g: 0, b: 0, count: 0 }));
  let sampled = 0;
  for (let i = 0; i + 3 < data.length; i += 4) {
    const a = data[i + 3];
    if (a < 16) continue;
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const idx = ((r >> 7) << 2) | ((g >> 7) << 1) | (b >> 7);
    const cur = buckets[idx];
    cur.r += r;
    cur.g += g;
    cur.b += b;
    cur.count += 1;
    sampled += 1;
  }
  const colors = buckets
    .filter((b) => b.count > 0 && b.count / Math.max(1, sampled) > 0.01)
    .sort((a, b) => b.count - a.count)
    .map((b) => `rgb(${Math.round(b.r / b.count)},${Math.round(b.g / b.count)},${Math.round(b.b / b.count)})`);
  return colors.length > 0 ? colors : ['rgb(255,255,255)'];
}

function makeSeedFromBuffer(buf: Buffer): number {
  let seed = 0;
  const len = Math.min(buf.length, 256);
  for (let i = 0; i < len; i++) {
    seed = (seed * 131 + buf[i]) >>> 0;
  }
  return seed || 1;
}

function nextRand(seed: number): number {
  return (seed * 1664525 + 1013904223) >>> 0;
}

function buildBlocksSvg(maskRaw: Buffer, maskW: number, maskH: number, colors: string[], seed0: number): Buffer {
  let seed = seed0 >>> 0;
  const blocks: string[] = [];
  const points: Array<{ x: number; y: number }> = [];
  const x1 = 200;
  const y1 = 300;
  const x2 = 400;
  const y2 = 650;

  for (let tries = 0; tries < 1200 && points.length < 150; tries++) {
    seed = nextRand(seed);
    const x = x1 + (seed % (x2 - x1 + 1));
    seed = nextRand(seed);
    const y = y1 + (seed % (y2 - y1 + 1));
    if (x < 0 || y < 0 || x >= maskW || y >= maskH) continue;
    const idx = (y * maskW + x) * 4;
    const alpha = maskRaw[idx + 3] ?? 0;
    const r = maskRaw[idx] ?? 0;
    const g = maskRaw[idx + 1] ?? 0;
    const b = maskRaw[idx + 2] ?? 0;
    if (alpha < 8 || (r < 8 && g < 8 && b < 8)) continue;
    if (points.some((p) => Math.abs(x - p.x) < 13 && Math.abs(y - p.y) < 13)) continue;
    points.push({ x, y });
    seed = nextRand(seed);
    const color = colors[seed % colors.length];
    blocks.push(
      `<rect x="${x}" y="${y}" width="10" height="10" fill="${color}" transform="rotate(45 ${x} ${y})"/>`,
    );
  }

  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${maskW}" height="${maskH}">` +
    blocks.join('') +
    `</svg>`;
  return Buffer.from(svg);
}

export async function render(input: BqbDontTouchInput): Promise<BqbRenderResult> {
  const dir = resolveBqbSubdir('dont_touch', input.dataPath, input.pluginDir);
  if (!dir) throw new Error('bqb-dont-touch: 素材目录不存在');
  const tpl = path.join(dir, '0.png');
  const mask = path.join(dir, 'mask.png');
  if (!fs.existsSync(tpl)) throw new Error('bqb-dont-touch: 模板不存在 0.png');
  if (!fs.existsSync(mask)) throw new Error('bqb-dont-touch: 模板不存在 mask.png');

  const sharp = await getBqbSharp();
  const photo = await sharp(input.avatar)
    .rotate()
    .resize(250, 250, { fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 0 } })
    .ensureAlpha()
    .png()
    .toBuffer();

  const colorSample = await sharp(photo)
    .resize(200, 200, { fit: 'inside' })
    .ensureAlpha()
    .raw()
    .toBuffer();
  const colors = pickDominantColors(colorSample);

  const maskMeta = await sharp(mask).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const blocksSvg = buildBlocksSvg(
    maskMeta.data,
    maskMeta.info.width,
    maskMeta.info.height,
    colors,
    makeSeedFromBuffer(input.avatar),
  );

  const buffer = await sharp(tpl)
    .ensureAlpha()
    .composite([
      { input: blocksSvg, left: 0, top: 0 },
      { input: photo, left: 25, top: 460 },
    ])
    .png()
    .toBuffer();

  return { buffer, mime: 'image/png', ext: 'png' };
}

export const renderDontTouch = render;
