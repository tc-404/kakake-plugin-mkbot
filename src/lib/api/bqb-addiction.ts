// ---------------------------------------------------------------------------
// bqb-addiction：上瘾（静态 PNG，移植自 meme-generator-rs addiction）
// ---------------------------------------------------------------------------

import fs from 'fs';
import path from 'path';
import { getBqbSharp, resolveBqbSubdir } from './bqb-shared';
import type { BqbRenderResult } from './bqb-crawl';

export interface BqbAddictionInput {
  /** 作为左上角照片的输入图 */
  avatar: Buffer;
  dataPath: string;
  pluginDir: string;
}

export async function render(input: BqbAddictionInput): Promise<BqbRenderResult> {
  const dir = resolveBqbSubdir('addiction', input.dataPath, input.pluginDir);
  if (!dir) throw new Error('bqb-addiction: 素材目录不存在');
  const tpl = path.join(dir, '0.png');
  if (!fs.existsSync(tpl)) throw new Error('bqb-addiction: 模板不存在 0.png');

  const sharp = await getBqbSharp();
  const photo = await sharp(input.avatar)
    .rotate()
    .resize(91, 91, { fit: 'cover', position: 'centre', kernel: 'lanczos3' })
    .ensureAlpha()
    .png()
    .toBuffer();

  const buffer = await sharp(tpl)
    .ensureAlpha()
    .composite([{ input: photo, left: 0, top: 0 }])
    .png()
    .toBuffer();

  return { buffer, mime: 'image/png', ext: 'png' };
}

export const renderAddiction = render;
