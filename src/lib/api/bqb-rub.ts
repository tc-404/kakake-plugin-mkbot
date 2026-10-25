// ---------------------------------------------------------------------------
// bqb-rub：贴贴表情（6 帧 GIF，双头像）
// ---------------------------------------------------------------------------

import fs from 'fs';
import {
  composeRubFrame,
  encodeGifFromPngFrames,
  getBqbSharp,
  prepareAvatarPng,
  resolveBqbSubdir,
  templatePath,
  type BqbFrameLoc,
  type BqbFrameLocRot,
} from './bqb-shared';
import type { BqbRenderResult } from './bqb-crawl';

const TARGET_LOCS: BqbFrameLoc[] = [
  { x: 39, y: 91, w: 75, h: 75 },
  { x: 49, y: 101, w: 75, h: 75 },
  { x: 67, y: 98, w: 75, h: 75 },
  { x: 55, y: 86, w: 75, h: 75 },
  { x: 61, y: 109, w: 75, h: 75 },
  { x: 65, y: 101, w: 75, h: 75 },
];

const SELF_LOCS: BqbFrameLocRot[] = [
  { x: 102, y: 95, w: 70, h: 80, angle: 0 },
  { x: 108, y: 60, w: 50, h: 100, angle: 0 },
  { x: 97, y: 18, w: 65, h: 95, angle: 0 },
  { x: 65, y: 5, w: 75, h: 75, angle: -20 },
  { x: 95, y: 57, w: 100, h: 55, angle: -70 },
  { x: 109, y: 107, w: 65, h: 75, angle: 0 },
];

export interface BqbRubInput {
  selfAvatar: Buffer;
  targetAvatar: Buffer;
  dataPath: string;
  pluginDir: string;
}

export async function render(input: BqbRubInput): Promise<BqbRenderResult> {
  const dir = resolveBqbSubdir('rub', input.dataPath, input.pluginDir);
  if (!dir || !fs.existsSync(dir)) {
    throw new Error('bqb-rub: 素材目录不存在');
  }

  const sharp = await getBqbSharp();
  const selfPng = await prepareAvatarPng(sharp, input.selfAvatar, { circle: true });
  const targetPng = await prepareAvatarPng(sharp, input.targetAvatar, { circle: true });

  const frames: Buffer[] = [];
  for (let i = 0; i < 6; i++) {
    const tpl = templatePath(dir, i, 'png');
    if (!fs.existsSync(tpl)) throw new Error(`bqb-rub: 模板不存在 ${i}`);
    frames.push(
      await composeRubFrame(sharp, tpl, selfPng, targetPng, TARGET_LOCS[i], SELF_LOCS[i]),
    );
  }

  // Imagick delay 5 = 50ms
  const buffer = await encodeGifFromPngFrames(sharp, frames, 50);
  return { buffer, mime: 'image/gif', ext: 'gif' };
}

export const renderRub = render;
