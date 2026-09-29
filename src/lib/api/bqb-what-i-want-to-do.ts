// ---------------------------------------------------------------------------
// bqb-what-i-want-to-do：我想上的（静态 PNG，移植自 meme-generator-rs what_i_want_to_do）
// ---------------------------------------------------------------------------

import fs from 'fs';
import path from 'path';
import { getBqbSharp, prepareAvatarPng, resolveBqbSubdir } from './bqb-shared';
import type { BqbRenderResult } from './bqb-crawl';

export interface BqbWhatIWantToDoInput {
  avatar: Buffer;
  dataPath: string;
  pluginDir: string;
}

export async function render(input: BqbWhatIWantToDoInput): Promise<BqbRenderResult> {
  const dir = resolveBqbSubdir('what_i_want_to_do', input.dataPath, input.pluginDir);
  const tpl = path.join(dir, '0.png');
  if (!dir || !fs.existsSync(tpl)) {
    throw new Error('bqb-what-i-want-to-do: 素材不存在（需 what_i_want_to_do/0.png）');
  }

  const sharp = await getBqbSharp();
  const avatarPng = await prepareAvatarPng(sharp, input.avatar, { circle: true });
  const avatarFit = await sharp(avatarPng)
    .resize(270, 270, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();

  const buffer = await sharp(tpl)
    .ensureAlpha()
    .composite([{ input: avatarFit, left: 350, top: 590 }])
    .png()
    .toBuffer();

  return { buffer, mime: 'image/png', ext: 'png' };
}

export const renderWhatIWantToDo = render;
