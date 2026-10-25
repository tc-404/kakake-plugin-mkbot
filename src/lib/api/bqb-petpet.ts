// ---------------------------------------------------------------------------
// bqb-petpet：摸头表情（5 帧 GIF）
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
  { x: 14, y: 20, w: 98, h: 98 },
  { x: 12, y: 33, w: 101, h: 85 },
  { x: 8, y: 40, w: 110, h: 76 },
  { x: 10, y: 33, w: 102, h: 84 },
  { x: 12, y: 20, w: 98, h: 98 },
];

export interface BqbPetpetInput {
  avatar: Buffer;
  dataPath: string;
  pluginDir: string;
  /** 默认圆形；传 false 为方形 */
  circle?: boolean;
}

export async function render(input: BqbPetpetInput): Promise<BqbRenderResult> {
  const dir = resolveBqbSubdir('petpet', input.dataPath, input.pluginDir);
  if (!dir || !fs.existsSync(dir)) {
    throw new Error('bqb-petpet: 素材目录不存在');
  }

  const sharp = await getBqbSharp();
  const avatarPng = await prepareAvatarPng(sharp, input.avatar, {
    circle: input.circle !== false,
  });

  const frames: Buffer[] = [];
  for (let i = 0; i < LOCS.length; i++) {
    const tpl = templatePath(dir, i, 'png');
    if (!fs.existsSync(tpl)) throw new Error(`bqb-petpet: 模板不存在 ${i}`);
    frames.push(await composeAvatarUnderTemplate(sharp, tpl, avatarPng, LOCS[i]));
  }

  // Imagick delay 6 = 60ms
  const buffer = await encodeGifFromPngFrames(sharp, frames, 60);
  return { buffer, mime: 'image/gif', ext: 'gif' };
}

export const renderPetpet = render;
