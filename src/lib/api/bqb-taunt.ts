// ---------------------------------------------------------------------------
// bqb-taunt：嘲讽（静态 PNG，移植自 meme-generator-rs taunt）
// ---------------------------------------------------------------------------

import fs from 'fs';
import path from 'path';
import { getBqbSharp, prepareAvatarPng, resolveBqbSubdir } from './bqb-shared';
import type { BqbRenderResult } from './bqb-crawl';
import { MK_PNG_OUT } from '../png-output';

export interface BqbTauntInput {
  avatar: Buffer;
  dataPath: string;
  pluginDir: string;
}

export async function render(input: BqbTauntInput): Promise<BqbRenderResult> {
  const dir = resolveBqbSubdir('taunt', input.dataPath, input.pluginDir);
  const tpl = path.join(dir, '0.png');
  if (!dir || !fs.existsSync(tpl)) {
    throw new Error('bqb-taunt: 素材不存在（需 taunt/0.png）');
  }

  const sharp = await getBqbSharp();
  const avatarPng = await prepareAvatarPng(sharp, input.avatar, { circle: false, size: 230 });

  const buffer = await sharp(tpl)
    .ensureAlpha()
    .composite([{ input: avatarPng, left: 245, top: 245 }])
    .png(MK_PNG_OUT())
    .toBuffer();

  return { buffer, mime: 'image/png', ext: 'png' };
}

export const renderTaunt = render;
