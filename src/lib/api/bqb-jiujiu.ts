// ---------------------------------------------------------------------------
// bqb-jiujiu：啾啾表情（8 帧 GIF）
// ---------------------------------------------------------------------------

import fs from 'fs';
import {
  encodeGifFromPngFrames,
  getBqbSharp,
  prepareAvatarOvalFitPng,
  resolveBqbSubdir,
  templatePath,
} from './bqb-shared';
import type { BqbRenderResult } from './bqb-crawl';

export interface BqbJiujiuInput {
  avatar: Buffer;
  dataPath: string;
  pluginDir: string;
}

export async function render(input: BqbJiujiuInput): Promise<BqbRenderResult> {
  const dir = resolveBqbSubdir('jiujiu', input.dataPath, input.pluginDir);
  if (!dir || !fs.existsSync(dir)) {
    throw new Error('bqb-jiujiu: 素材目录不存在');
  }

  const sharp = await getBqbSharp();
  const avatarPng = await prepareAvatarOvalFitPng(sharp, input.avatar, 75, 51);

  const frames: Buffer[] = [];
  for (let i = 0; i < 8; i++) {
    const tpl = templatePath(dir, i, 'png');
    if (!fs.existsSync(tpl)) throw new Error(`bqb-jiujiu: 模板不存在 ${i}`);

    const tplMeta = await sharp(tpl).metadata();
    const cw = Math.max(1, Number(tplMeta.width) || 1);
    const ch = Math.max(1, Number(tplMeta.height) || 1);
    const templatePng = await sharp(tpl).ensureAlpha().png().toBuffer();

    frames.push(
      await sharp({
        create: {
          width: cw,
          height: ch,
          channels: 4,
          background: { r: 0, g: 0, b: 0, alpha: 0 },
        },
      })
        .composite([
          { input: avatarPng, left: 5, top: 0 },
          { input: templatePng, left: 0, top: 0 },
        ])
        .png()
        .toBuffer(),
    );
  }

  // Imagick delay 6 = 60ms
  const buffer = await encodeGifFromPngFrames(sharp, frames, 60);
  return { buffer, mime: 'image/gif', ext: 'gif' };
}

export const renderJiujiu = render;
