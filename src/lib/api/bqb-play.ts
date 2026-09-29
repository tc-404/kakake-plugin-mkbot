// ---------------------------------------------------------------------------
// bqb-play：顶/玩表情（长序列 GIF）
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
  { x: 180, y: 60, w: 100, h: 100 },
  { x: 184, y: 75, w: 100, h: 100 },
  { x: 183, y: 98, w: 100, h: 100 },
  { x: 179, y: 118, w: 110, h: 100 },
  { x: 156, y: 194, w: 150, h: 48 },
  { x: 178, y: 136, w: 122, h: 69 },
  { x: 175, y: 66, w: 122, h: 85 },
  { x: 170, y: 42, w: 130, h: 96 },
  { x: 175, y: 34, w: 118, h: 95 },
  { x: 179, y: 35, w: 110, h: 93 },
  { x: 180, y: 54, w: 102, h: 93 },
  { x: 183, y: 58, w: 97, h: 92 },
  { x: 174, y: 35, w: 120, h: 94 },
  { x: 179, y: 35, w: 109, h: 93 },
  { x: 181, y: 54, w: 101, h: 92 },
  { x: 182, y: 59, w: 98, h: 92 },
  { x: 183, y: 71, w: 90, h: 96 },
  { x: 180, y: 131, w: 92, h: 101 },
];

export interface BqbPlayInput {
  avatar: Buffer;
  dataPath: string;
  pluginDir: string;
}

export async function render(input: BqbPlayInput): Promise<BqbRenderResult> {
  const dir = resolveBqbSubdir('play', input.dataPath, input.pluginDir);
  if (!dir || !fs.existsSync(dir)) {
    throw new Error('bqb-play: 素材目录不存在');
  }

  const sharp = await getBqbSharp();
  const avatarPng = await prepareAvatarPng(sharp, input.avatar, { circle: true });

  const imgFrames: Buffer[] = [];
  for (let i = 0; i < 18; i++) {
    const tpl = templatePath(dir, i, 'png');
    if (!fs.existsSync(tpl)) throw new Error(`bqb-play: 模板不存在 ${i}`);
    imgFrames.push(await composeAvatarUnderTemplate(sharp, tpl, avatarPng, LOCS[i]));
  }

  const rawFrames: Buffer[] = [];
  for (let i = 18; i < 38; i++) {
    const tpl = templatePath(dir, i, 'png');
    if (!fs.existsSync(tpl)) throw new Error(`bqb-play: 模板不存在 ${i}`);
    rawFrames.push(await sharp(tpl).ensureAlpha().png().toBuffer());
  }

  // PHP: [0..11] + [0..11] + [0..7] + [12..17] + raw[18..37]
  const sequence: Buffer[] = [
    ...imgFrames.slice(0, 12),
    ...imgFrames.slice(0, 12),
    ...imgFrames.slice(0, 8),
    ...imgFrames.slice(12, 18),
    ...rawFrames,
  ];

  // Imagick delay 6 = 60ms
  const buffer = await encodeGifFromPngFrames(sharp, sequence, 60);
  return { buffer, mime: 'image/gif', ext: 'gif' };
}

export const renderPlay = render;
