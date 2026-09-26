// ---------------------------------------------------------------------------
// bqb-crawl：爬表情（静态 JPG，随机/指定 1-92 模板）
// ---------------------------------------------------------------------------

import fs from 'fs';
import {
  getBqbSharp,
  prepareAvatarPng,
  resolveBqbSubdir,
  templatePath,
} from './bqb-shared';

export interface BqbCrawlInput {
  avatar: Buffer;
  dataPath: string;
  pluginDir: string;
  /** 1-92，缺省随机 */
  num?: number;
}

export interface BqbRenderResult {
  buffer: Buffer;
  mime: 'image/jpeg' | 'image/gif';
  ext: 'jpg' | 'gif';
}

export async function render(input: BqbCrawlInput): Promise<BqbRenderResult> {
  const dir = resolveBqbSubdir('crawl', input.dataPath, input.pluginDir);
  if (!dir || !fs.existsSync(dir)) {
    throw new Error('bqb-crawl: 素材目录不存在');
  }

  let num = Math.floor(Number(input.num) || 0);
  if (num < 1 || num > 92) {
    num = 1 + Math.floor(Math.random() * 92);
  }

  const tpl = templatePath(dir, num, 'jpg', 2);
  if (!fs.existsSync(tpl)) {
    throw new Error(`bqb-crawl: 模板不存在 ${num}`);
  }

  const sharp = await getBqbSharp();
  const avatarPng = await prepareAvatarPng(sharp, input.avatar, { circle: true, size: 100 });

  // PHP: avatar 贴在模板 (0, 400)，模板为底层
  const composed = await sharp(tpl)
    .ensureAlpha()
    .composite([{ input: avatarPng, left: 0, top: 400 }])
    .jpeg({ quality: 90, mozjpeg: true })
    .toBuffer();

  return { buffer: composed, mime: 'image/jpeg', ext: 'jpg' };
}

/** 兼容旧式命名 */
export const renderCrawl = render;
