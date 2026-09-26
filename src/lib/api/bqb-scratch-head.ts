// ---------------------------------------------------------------------------
// bqb-scratch-head：挠头表情（6 帧 GIF）
// ---------------------------------------------------------------------------

import fs from 'fs';
import {
  composeAvatarOverTemplate,
  encodeGifFromPngFrames,
  getBqbSharp,
  prepareAvatarPng,
  resolveBqbSubdir,
  templatePath,
  type BqbFrameLoc,
} from './bqb-shared';
import type { BqbRenderResult } from './bqb-crawl';

// PHP: (w, h, x, y)
const LOCS: BqbFrameLoc[] = [
  { x: 4, y: 5, w: 53, h: 46 },
  { x: 7, y: 6, w: 50, h: 45 },
  { x: 6, y: 8, w: 50, h: 42 },
  { x: 7, y: 7, w: 50, h: 44 },
  { x: 4, y: 8, w: 53, h: 42 },
  { x: 7, y: 7, w: 52, h: 45 },
];

export interface BqbScratchHeadInput {
  avatar: Buffer;
  dataPath: string;
  pluginDir: string;
}

export async function render(input: BqbScratchHeadInput): Promise<BqbRenderResult> {
  const dir = resolveBqbSubdir('scratch_head', input.dataPath, input.pluginDir);
  if (!dir || !fs.existsSync(dir)) {
    throw new Error('bqb-scratch-head: 素材目录不存在');
  }

  const sharp = await getBqbSharp();
  const avatarPng = await prepareAvatarPng(sharp, input.avatar, { circle: true, size: 68 });

  const frames: Buffer[] = [];
  for (let i = 0; i < LOCS.length; i++) {
    const tpl = templatePath(dir, i, 'png');
    if (!fs.existsSync(tpl)) throw new Error(`bqb-scratch-head: 模板不存在 ${i}`);
    frames.push(await composeAvatarOverTemplate(sharp, tpl, avatarPng, LOCS[i]));
  }

  // Imagick delay 10 = 100ms
  const buffer = await encodeGifFromPngFrames(sharp, frames, 100);
  return { buffer, mime: 'image/gif', ext: 'gif' };
}

export const renderScratchHead = render;
