// ---------------------------------------------------------------------------
// bqb-think-what：想什么（静态 PNG，移植自 meme-generator-rs think_what）
// ---------------------------------------------------------------------------

import fs from 'fs';
import path from 'path';
import { getBqbSharp, resolveBqbSubdir } from './bqb-shared';
import type { BqbRenderResult } from './bqb-crawl';

export interface BqbThinkWhatInput {
  avatar: Buffer;
  dataPath: string;
  pluginDir: string;
}

export async function render(input: BqbThinkWhatInput): Promise<BqbRenderResult> {
  const dir = resolveBqbSubdir('think_what', input.dataPath, input.pluginDir);
  const tpl = path.join(dir, '0.png');
  if (!dir || !fs.existsSync(tpl)) {
    throw new Error('bqb-think-what: 素材不存在（需 think_what/0.png）');
  }

  const sharp = await getBqbSharp();
  const meta = await sharp(tpl).metadata();
  const w = Math.max(1, Number(meta.width) || 1);
  const h = Math.max(1, Number(meta.height) || 1);

  const photo = await sharp(input.avatar)
    .rotate()
    .resize(534, 493, { fit: 'cover', position: 'centre', kernel: 'lanczos3' })
    .ensureAlpha()
    .png()
    .toBuffer();

  const framePng = await sharp(tpl).ensureAlpha().png().toBuffer();

  const buffer = await sharp({
    create: {
      width: w,
      height: h,
      channels: 4,
      background: { r: 255, g: 255, b: 255, alpha: 1 },
    },
  })
    .composite([
      { input: photo, left: 530, top: 0 },
      { input: framePng, left: 0, top: 0 },
    ])
    .png()
    .toBuffer();

  return { buffer, mime: 'image/png', ext: 'png' };
}

export const renderThinkWhat = render;
