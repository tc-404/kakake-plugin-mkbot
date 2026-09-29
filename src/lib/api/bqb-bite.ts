// ---------------------------------------------------------------------------
// bqb-bite：啃表情（16 帧 GIF，前 6 帧合头像）
// ---------------------------------------------------------------------------

import fs from 'fs';
import {
  composeAvatarUnderTemplate,
  encodeGifFromPngFrames,
  getBqbSharp,
  prepareAvatarPng,
  resolveBqbSubdir,
  templatePath,
  type BqbFrameLoc,
} from './bqb-shared';
import type { BqbRenderResult } from './bqb-crawl';

const LOCS: BqbFrameLoc[] = [
  { x: 90, y: 90, w: 105, h: 150 },
  { x: 90, y: 83, w: 96, h: 172 },
  { x: 90, y: 90, w: 106, h: 148 },
  { x: 88, y: 88, w: 97, h: 167 },
  { x: 90, y: 85, w: 89, h: 179 },
  { x: 90, y: 90, w: 106, h: 151 },
];

export interface BqbBiteInput {
  avatar: Buffer;
  dataPath: string;
  pluginDir: string;
}

export async function render(input: BqbBiteInput): Promise<BqbRenderResult> {
  const dir = resolveBqbSubdir('bite', input.dataPath, input.pluginDir);
  if (!dir || !fs.existsSync(dir)) {
    throw new Error('bqb-bite: 素材目录不存在');
  }

  const sharp = await getBqbSharp();
  const avatarPng = await prepareAvatarPng(sharp, input.avatar, { circle: true });

  const frames: Buffer[] = [];
  for (let i = 0; i < 6; i++) {
    const tpl = templatePath(dir, i, 'png');
    if (!fs.existsSync(tpl)) throw new Error(`bqb-bite: 模板不存在 ${i}`);
    frames.push(await composeAvatarUnderTemplate(sharp, tpl, avatarPng, LOCS[i]));
  }
  for (let i = 6; i < 16; i++) {
    const tpl = templatePath(dir, i, 'png');
    if (!fs.existsSync(tpl)) throw new Error(`bqb-bite: 模板不存在 ${i}`);
    frames.push(await sharp(tpl).ensureAlpha().png().toBuffer());
  }

  // Imagick delay 7 = 70ms
  const buffer = await encodeGifFromPngFrames(sharp, frames, 70);
  return { buffer, mime: 'image/gif', ext: 'gif' };
}

export const renderBite = render;
