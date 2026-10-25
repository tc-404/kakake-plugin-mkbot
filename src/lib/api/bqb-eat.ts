// ---------------------------------------------------------------------------
// bqb-eat：吃（3 帧 GIF，移植自 meme-generator-rs eat）
// ---------------------------------------------------------------------------

import fs from 'fs';
import {
  composeAvatarOnWhiteWithTemplate,
  encodeGifFromPngFrames,
  getBqbSharp,
  prepareAvatarPng,
  resolveBqbSubdir,
  templatePath,
  type BqbFrameLoc,
} from './bqb-shared';
import type { BqbRenderResult } from './bqb-crawl';

const LOC: BqbFrameLoc = { x: 2, y: 38, w: 34, h: 34 };

export interface BqbEatInput {
  avatar: Buffer;
  dataPath: string;
  pluginDir: string;
}

export async function render(input: BqbEatInput): Promise<BqbRenderResult> {
  const dir = resolveBqbSubdir('eat', input.dataPath, input.pluginDir);
  if (!dir || !fs.existsSync(dir)) {
    throw new Error('bqb-eat: 素材目录不存在');
  }

  const sharp = await getBqbSharp();
  const avatarPng = await prepareAvatarPng(sharp, input.avatar, { circle: false });

  const frames: Buffer[] = [];
  for (let i = 0; i < 3; i++) {
    const tpl = templatePath(dir, i, 'png');
    if (!fs.existsSync(tpl)) throw new Error(`bqb-eat: 模板不存在 ${i}`);
    frames.push(await composeAvatarOnWhiteWithTemplate(sharp, tpl, avatarPng, LOC));
  }

  // Rust GifEncoder delay 0.05 = 50ms
  const buffer = await encodeGifFromPngFrames(sharp, frames, 50);
  return { buffer, mime: 'image/gif', ext: 'gif' };
}

export const renderEat = render;
