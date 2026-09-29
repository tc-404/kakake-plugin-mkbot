// ---------------------------------------------------------------------------
// bqb-abstinence：戒导证书（静态 PNG，移植自 meme-generator-rs abstinence）
// ---------------------------------------------------------------------------

import fs from 'fs';
import path from 'path';
import { getBqbSharp, resolveBqbSubdir } from './bqb-shared';
import type { BqbRenderResult } from './bqb-crawl';

export interface BqbAbstinenceInput {
  avatar: Buffer;
  /** 戒导人署名（昵称/群名片） */
  displayName: string;
  dataPath: string;
  pluginDir: string;
  /** YYYY-MM-DD，缺省为当天 */
  date?: string;
}

function escapeXml(text: string): string {
  return String(text ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function parseDateParts(dateStr?: string): { y: number; m: number; d: number } {
  const raw = String(dateStr ?? '').trim();
  if (raw) {
    const m = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
    if (m) {
      return { y: Number(m[1]), m: Number(m[2]), d: Number(m[3]) };
    }
    throw new Error('bqb-abstinence: 日期格式应为 YYYY-MM-DD');
  }
  const now = new Date();
  return { y: now.getFullYear(), m: now.getMonth() + 1, d: now.getDate() };
}

function buildTextOverlaySvg(width: number, height: number, name: string, y: number, mo: number, d: number): Buffer {
  const font = 'Noto Sans SC, Microsoft YaHei, PingFang SC, sans-serif';
  const safeName = escapeXml(name);
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">` +
    `<text x="150" y="690" font-family="${font}" font-size="18" fill="#000">` +
    `戒导人：<tspan text-decoration="underline">${safeName}</tspan></text>` +
    `<text x="150" y="780" font-family="${font}" font-size="20" fill="#000">` +
    `<tspan text-decoration="underline">${y}</tspan>年` +
    `<tspan text-decoration="underline"> ${mo} </tspan>月` +
    `<tspan text-decoration="underline"> ${d} </tspan>日</text>` +
    `</svg>`;
  return Buffer.from(svg);
}

export async function render(input: BqbAbstinenceInput): Promise<BqbRenderResult> {
  const dir = resolveBqbSubdir('abstinence', input.dataPath, input.pluginDir);
  const basePath = path.join(dir, 'base.png');
  const stampPath = path.join(dir, 'stamp.png');
  if (!dir || !fs.existsSync(basePath) || !fs.existsSync(stampPath)) {
    throw new Error('bqb-abstinence: 素材不存在（需 base.png、stamp.png）');
  }

  const displayName = String(input.displayName ?? '').trim() || '戒导人';
  const { y, m, d } = parseDateParts(input.date);

  const sharp = await getBqbSharp();
  const baseMeta = await sharp(basePath).metadata();
  const cw = Math.max(1, Number(baseMeta.width) || 900);
  const ch = Math.max(1, Number(baseMeta.height) || 900);

  const avatarPng = await sharp(input.avatar)
    .rotate()
    .resize(270, 360, { fit: 'inside', kernel: 'linear' })
    .png()
    .toBuffer();

  const textSvg = buildTextOverlaySvg(cw, ch, displayName, y, m, d);

  const buffer = await sharp(basePath)
    .ensureAlpha()
    .composite([
      { input: textSvg, left: 0, top: 0 },
      { input: avatarPng, left: 80, top: 380 },
      { input: stampPath, left: 310, top: 660 },
    ])
    .png()
    .toBuffer();

  return { buffer, mime: 'image/png', ext: 'png' };
}

export const renderAbstinence = render;
