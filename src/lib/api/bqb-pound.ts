// ---------------------------------------------------------------------------
// bqb-pound：捣（GIF，移植自 meme-generator-rs pound.rs）
// 8 帧：avatar 在固定位置叠加 + 对应帧模板覆盖；输出 50ms 延迟 GIF
// ---------------------------------------------------------------------------

import fs from 'fs';
import {
  getBqbSharp,
  prepareAvatarPng,
  resolveBqbSubdir,
  templatePath,
  encodeGifFromPngFrames,
} from './bqb-shared';
import type { BqbRenderResult } from './bqb-crawl';

export interface BqbPoundInput {
  avatar: Buffer;
  dataPath: string;
  pluginDir: string;
}

interface BqbFrameLoc {
  x: number;
  y: number;
  w: number;
  h: number;
}

const LOCS: BqbFrameLoc[] = [
  { x: 135, y: 240, w: 138, h: 47 },
  { x: 135, y: 240, w: 138, h: 47 },
  { x: 150, y: 190, w: 105, h: 95 },
  { x: 150, y: 190, w: 105, h: 95 },
  { x: 148, y: 188, w: 106, h: 98 },
  { x: 146, y: 196, w: 110, h: 88 },
  { x: 145, y: 223, w: 112, h: 61 },
  { x: 145, y: 223, w: 112, h: 61 },
];

export async function render(input: BqbPoundInput): Promise<BqbRenderResult> {
  const dir = resolveBqbSubdir('pound', input.dataPath, input.pluginDir);
  if (!dir || !fs.existsSync(dir)) {
    throw new Error('bqb-pound: 素材目录不存在');
  }

  const sharp = await getBqbSharp();

  // Rust: img = images[0].image.square()
  const avatarPng = await prepareAvatarPng(sharp, input.avatar, { circle: false });

  const frames: Buffer[] = [];
  let outW = 0;
  let outH = 0;

  for (let i = 0; i < 8; i++) {
    const tpl = templatePath(dir, i, 'png');
    if (!fs.existsSync(tpl)) throw new Error(`bqb-pound: 模板不存在 ${i}`);

    if (!outW || !outH) {
      const meta = await sharp(tpl).metadata();
      outW = Math.max(1, Number(meta.width) || 1);
      outH = Math.max(1, Number(meta.height) || 1);
    }

    const { x, y, w, h } = LOCS[i] ?? LOCS[0];

    const avatarResized = await sharp(avatarPng)
      .resize(Math.max(1, Math.floor(w)), Math.max(1, Math.floor(h)), {
        fit: 'fill',
        kernel: 'lanczos3',
      })
      .png()
      .toBuffer();

    const templateBuf = await sharp(tpl).ensureAlpha().png().toBuffer();

    // Rust: canvas.clear(Color::WHITE)
    const frame = await sharp({
      create: {
        width: outW,
        height: outH,
        channels: 4,
        background: { r: 255, g: 255, b: 255, alpha: 1 },
      },
    })
      .composite([
        { input: avatarResized, left: Math.floor(x), top: Math.floor(y) },
        { input: templateBuf, left: 0, top: 0 },
      ])
      .png()
      .toBuffer();

    frames.push(frame);
  }

  // Rust: encoder.add_frame(..., 0.05) => 50ms
  const buffer = await encodeGifFromPngFrames(sharp, frames, 50);
  return { buffer, mime: 'image/gif', ext: 'gif' };
}

export const renderPound = render;

