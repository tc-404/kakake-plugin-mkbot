// ---------------------------------------------------------------------------
// bqb-sold-out：卖掉了（静态 PNG，移植自 meme-generator-rs sold_out）
// ---------------------------------------------------------------------------

import fs from 'fs';
import { getBqbSharp, resolveBqbSubdir } from './bqb-shared';
import type { BqbRenderResult } from './bqb-crawl';
import type { BqbAssetKind } from './bqb-shared';
import path from 'path';

export interface BqbSoldOutInput {
  avatar: Buffer;
  dataPath: string;
  pluginDir: string;
}

export async function render(input: BqbSoldOutInput): Promise<BqbRenderResult> {
  const kind: BqbAssetKind = 'sold_out';
  const dir = resolveBqbSubdir(kind, input.dataPath, input.pluginDir);
  const tpl = path.join(dir, '0.png');
  if (!dir || !fs.existsSync(tpl)) {
    throw new Error('bqb-sold_out: 素材不存在（需 sold_out/0.png）');
  }

  const sharp = await getBqbSharp();

  // Rust: if width > height => resize_height(600), else resize_width(600)
  const rotated = sharp(input.avatar).rotate().ensureAlpha();
  const meta0 = await rotated.metadata();
  const w0 = Number(meta0.width) || 0;
  const h0 = Number(meta0.height) || 0;

  let avatarResized = rotated;
  if (w0 > h0) {
    avatarResized = rotated.resize({ height: 600, kernel: 'lanczos3' });
  } else {
    avatarResized = rotated.resize({ width: 600, kernel: 'lanczos3' });
  }

  const avatarPng = await avatarResized.png().toBuffer();
  const meta = await sharp(avatarPng).metadata();
  const w = Math.max(1, Number(meta.width) || 1);
  const h = Math.max(1, Number(meta.height) || 1);

  const iconPng = await sharp(tpl).ensureAlpha().png().toBuffer();
  const iconMeta = await sharp(iconPng).metadata();
  const iconW = Math.max(1, Number(iconMeta.width) || 1);
  const iconH = Math.max(1, Number(iconMeta.height) || 1);

  // Rust: draw semi-transparent black rect (argb(80,0,0,0))
  const overlay = await sharp({
    create: {
      width: w,
      height: h,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 80 / 255 },
    },
  })
    .png()
    .toBuffer();

  const buffer = await sharp(avatarPng)
    .ensureAlpha()
    .composite([
      { input: overlay, left: 0, top: 0 },
      { input: iconPng, left: Math.floor((w - iconW) / 2), top: Math.floor((h - iconH) / 2) },
    ])
    .png()
    .toBuffer();

  return { buffer, mime: 'image/png', ext: 'png' };
}

export const renderSoldOut = render;

