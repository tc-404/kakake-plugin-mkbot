// ---------------------------------------------------------------------------
// bqb-suck：吸/嗦表情（12 帧 GIF，白底合成）
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

const LOCS: BqbFrameLoc[] = [
  { x: 82, y: 100, w: 130, h: 119 },
  { x: 82, y: 94, w: 126, h: 125 },
  { x: 82, y: 120, w: 128, h: 99 },
  { x: 81, y: 164, w: 132, h: 55 },
  { x: 79, y: 163, w: 132, h: 55 },
  { x: 82, y: 140, w: 127, h: 79 },
  { x: 83, y: 152, w: 125, h: 67 },
  { x: 75, y: 157, w: 140, h: 62 },
  { x: 72, y: 165, w: 144, h: 54 },
  { x: 80, y: 132, w: 128, h: 87 },
  { x: 81, y: 127, w: 127, h: 92 },
  { x: 79, y: 111, w: 132, h: 108 },
];

export interface BqbSuckInput {
  avatar: Buffer;
  dataPath: string;
  pluginDir: string;
}

export async function render(input: BqbSuckInput): Promise<BqbRenderResult> {
  const dir = resolveBqbSubdir('suck', input.dataPath, input.pluginDir);
  if (!dir || !fs.existsSync(dir)) {
    throw new Error('bqb-suck: 素材目录不存在');
  }

  const sharp = await getBqbSharp();
  const avatarPng = await prepareAvatarPng(sharp, input.avatar, { circle: true });

  const frames: Buffer[] = [];
  for (let i = 0; i < LOCS.length; i++) {
    const tpl = templatePath(dir, i, 'png');
    if (!fs.existsSync(tpl)) throw new Error(`bqb-suck: 模板不存在 ${i}`);
    frames.push(await composeAvatarOnWhiteWithTemplate(sharp, tpl, avatarPng, LOCS[i]));
  }

  // Imagick delay 8 = 80ms
  const buffer = await encodeGifFromPngFrames(sharp, frames, 80);
  return { buffer, mime: 'image/gif', ext: 'gif' };
}

export const renderSuck = render;
