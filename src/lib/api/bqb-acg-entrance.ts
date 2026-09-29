// ---------------------------------------------------------------------------
// bqb-acg-entrance：二次元入口（静态 PNG，移植自 meme-generator-rs acg_entrance）
// ---------------------------------------------------------------------------

import fs from 'fs';
import path from 'path';
import { getBqbSharp, resolveBqbSubdir } from './bqb-shared';
import type { BqbRenderResult } from './bqb-crawl';

const DEFAULT_TEXT = '走，跟我去二次元吧';

export interface BqbAcgEntranceInput {
  /** 作为“照片”的输入图（优先级由 bqb.ts 决定：图/引用图/头像） */
  avatar: Buffer;
  dataPath: string;
  pluginDir: string;
  /** 可选自定义文案 */
  text?: string;
}

function escapeXml(text: string): string {
  return String(text ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function buildTextSvg(width: number, height: number, text: string): Buffer {
  const font = 'Noto Sans SC, Microsoft YaHei, PingFang SC, sans-serif';
  const safe = escapeXml(text);
  // Rust: IRect::from_ltrb(30, 720, frame.width()-30, 810) + auto font size 25..50, white
  // 这里用 SVG 让 sharp 直接渲染文本，近似原版效果。
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">` +
    `<style>text{font-family:${font};fill:#fff;font-weight:600;}</style>` +
    `<text x="30" y="780" font-size="38">${safe}</text>` +
    `</svg>`;
  return Buffer.from(svg);
}

export async function render(input: BqbAcgEntranceInput): Promise<BqbRenderResult> {
  const dir = resolveBqbSubdir('acg_entrance', input.dataPath, input.pluginDir);
  if (!dir) throw new Error('bqb-acg-entrance: 素材目录不存在');
  const tpl = path.join(dir, '0.png');
  if (!fs.existsSync(tpl)) throw new Error('bqb-acg-entrance: 模板不存在 0.png');

  const sharp = await getBqbSharp();
  const meta = await sharp(tpl).metadata();
  const w = Math.max(1, Number(meta.width) || 900);
  const h = Math.max(1, Number(meta.height) || 900);

  // “照片”区域：Rust resize_fit((290,410), Fit::Cover) 然后贴 (190,265)
  const photo = await sharp(input.avatar)
    .rotate()
    .resize(290, 410, { fit: 'cover', position: 'centre', kernel: 'lanczos3' })
    .ensureAlpha()
    .png()
    .toBuffer();

  const text = String(input.text ?? '').trim() || DEFAULT_TEXT;
  const textSvg = buildTextSvg(w, h, text);

  const framePng = await sharp(tpl)
    .ensureAlpha()
    .composite([{ input: textSvg, left: 0, top: 0 }])
    .png()
    .toBuffer();

  // Rust: 白底 → photo → frame
  const buffer = await sharp({
    create: {
      width: w,
      height: h,
      channels: 4,
      background: { r: 255, g: 255, b: 255, alpha: 1 },
    },
  })
    .composite([
      { input: photo, left: 190, top: 265 },
      { input: framePng, left: 0, top: 0 },
    ])
    .png()
    .toBuffer();

  return { buffer, mime: 'image/png', ext: 'png' };
}

export const renderAcgEntrance = render;

