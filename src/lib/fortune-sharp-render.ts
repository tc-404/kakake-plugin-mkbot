// ---------------------------------------------------------------------------
// Sharp 渲染：今日运势卡片（UI 布局参考 data/默认资源/今日运势.html）
// ---------------------------------------------------------------------------

import fs from 'fs';
import https from 'https';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import type { FortuneRenderCard, MkLoggerResolved } from '../types';
import { loadSharp } from './sharp-loader';
import { runCardSharpJob } from './sharp-worker-client';
import { applySharpPhotoBackgroundLayers } from './sharp-bg-effects';
import { loadSharpTextColorFromDataPath, resolveSharpTextFill } from './sharp-text-color';
import { MK_PNG_OUT, MK_JPEG_OUT } from './png-output';
import { svgCompositeLayer } from './sharp-svg-layer';

export interface FortuneSharpRenderOptions {
  card: FortuneRenderCard;
  pluginDir?: string;
  dataPath?: string;
  width?: number;
  height?: number;
}

function escapeXml(text: string): string {
  return String(text ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function wrapText(text: string, maxChars: number, maxLines = 6): string[] {
  const s = String(text || '').trim();
  if (!s) return [''];
  const lines: string[] = [];
  let cur = '';
  for (const ch of s) {
    if (cur.length >= maxChars) {
      lines.push(cur);
      cur = '';
      if (lines.length >= maxLines) break;
    }
    cur += ch;
  }
  if (cur && lines.length < maxLines) lines.push(cur);
  return lines.length ? lines : [''];
}

function fetchUrlBuffer(url: string, timeoutMs = 20000): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith('https') ? https : http;
    const req = lib.get(
      url,
      { timeout: timeoutMs, headers: { 'User-Agent': 'MKbot-FortuneSharp/1.0' } },
      (res) => {
        if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          fetchUrlBuffer(res.headers.location, timeoutMs).then(resolve).catch(reject);
          return;
        }
        if (res.statusCode && res.statusCode >= 400) {
          reject(new Error(`HTTP ${res.statusCode}`));
          res.resume();
          return;
        }
        const chunks: Buffer[] = [];
        res.on('data', (c) => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)));
        res.on('end', () => resolve(Buffer.concat(chunks)));
        res.on('error', reject);
      },
    );
    req.on('error', reject);
    req.on('timeout', () => req.destroy(new Error('timeout')));
  });
}

function decodeDataUrl(dataUrl: string): Buffer | null {
  const m = String(dataUrl || '').match(/^data:[^;]+;base64,(.+)$/i);
  if (!m) return null;
  try {
    return Buffer.from(m[1], 'base64');
  } catch {
    return null;
  }
}

async function loadFortuneBackground(
  card: FortuneRenderCard,
  pluginDir: string,
  dataPath: string,
): Promise<Buffer | null> {
  const candidates: string[] = [];
  const push = (v?: string) => {
    const s = String(v || '').trim();
    if (s && !candidates.includes(s)) candidates.push(s);
  };

  push(card.backgroundImageUrl);
  const imageName = String(card.image_name || '').trim();
  if (imageName) {
    if (path.isAbsolute(imageName)) push(imageName);
    const roots = [
      path.join(String(dataPath || '').trim(), '默认资源', 'image'),
      path.join(String(pluginDir || '').trim(), 'data', '默认资源', 'image'),
    ];
    for (const root of roots) {
      if (!root.trim()) continue;
      push(path.join(root, imageName));
    }
  }

  for (const src of candidates) {
    try {
      if (/^data:/i.test(src)) {
        const buf = decodeDataUrl(src);
        if (buf && buf.length) return buf;
        continue;
      }
      if (/^file:\/\//i.test(src)) {
        const abs = fileURLToPath(src);
        if (fs.existsSync(abs)) return fs.readFileSync(abs);
        continue;
      }
      if (/^https?:\/\//i.test(src)) {
        const buf = await fetchUrlBuffer(src, 25000);
        if (buf.length > 0) return buf;
        continue;
      }
      if (fs.existsSync(src)) return fs.readFileSync(src);
    } catch (_e) {
      /* try next */
    }
  }
  return null;
}

function calcFortuneCardLayout(width: number, height: number, unSignText: string) {
  const cardW = Math.min(480, width - 40);
  const cardX = (width - cardW) / 2;
  const bottomPad = 50;
  const subLines = wrapText(unSignText, 26, 6);
  const cardH = 30 + 88 + 25 + 54 + subLines.length * 24 + 16 + 48 + 30;
  const cardY = height - bottomPad - cardH;
  return { cardW, cardX, cardY, cardH, subLines };
}

function buildFortuneOverlaySvg(
  width: number,
  height: number,
  card: FortuneRenderCard,
  customText: string | null,
): string {
  const font = 'Microsoft YaHei, Noto Sans SC, sans-serif';
  const accent = '#FFB6C1';
  const mainFill = resolveSharpTextFill(customText, '#ffffff');
  const glass = 'rgba(15,15,18,0.5)';
  const title = escapeXml(card.Sorte || '大吉');
  const stars = escapeXml(card.Estrelas || '★★★★★★★');
  const time = escapeXml(card.time || '');
  const signText = escapeXml(card.signText || '福星高照，万事如意');
  const unSignText = String(card.unSignText || '此签为大吉之兆');
  const { cardW, cardX, cardY, cardH, subLines } = calcFortuneCardLayout(width, height, unSignText);

  const pad = 30;
  const avatarSize = 80;
  const avatarX = cardX + pad;
  const avatarY = cardY + pad;
  const infoX = avatarX + avatarSize + 18;
  const infoTimeY = avatarY + 18;
  const infoTitleY = avatarY + 44;
  const infoStarsY = avatarY + 72;

  const parts: string[] = [];
  parts.push(
    `<rect x="${cardX}" y="${cardY}" width="${cardW}" height="${cardH}" rx="35" ry="35" fill="${glass}" stroke="rgba(255,255,255,0.12)" stroke-width="1"/>`,
  );
  parts.push(
    `<circle cx="${avatarX + avatarSize / 2}" cy="${avatarY + avatarSize / 2}" r="${avatarSize / 2 + 1.5}" fill="none" stroke="#ffffff" stroke-width="3"/>`,
  );
  parts.push(
    `<text x="${infoX}" y="${infoTimeY}" font-family="${font}" font-size="13" font-weight="900" fill="${accent}" letter-spacing="1">time:${time}</text>`,
  );
  parts.push(
    `<text x="${infoX}" y="${infoTitleY}" font-family="${font}" font-size="26" font-weight="700" fill="${mainFill}">${title}</text>`,
  );
  parts.push(
    `<text x="${infoX}" y="${infoStarsY}" font-family="${font}" font-size="18" fill="${accent}">${stars}</text>`,
  );

  const mainTop = avatarY + avatarSize + 25;
  const barX = cardX + pad;
  const textX = barX + 16;
  parts.push(
    `<rect x="${barX}" y="${mainTop + 2}" width="4" height="24" rx="2" fill="#ffffff" opacity="0.95"/>`,
  );
  const signLines = wrapText(card.signText || '', 22, 2);
  signLines.forEach((line, i) => {
    parts.push(
      `<text x="${textX}" y="${mainTop + 20 + i * 26}" font-family="${font}" font-size="19" font-weight="600" fill="${mainFill}">${escapeXml(line)}</text>`,
    );
  });

  const subTop = mainTop + 20 + signLines.length * 26 + 14;
  const subX = cardX + pad + 17;
  parts.push(
    `<line x1="${cardX + pad}" y1="${subTop - 8}" x2="${cardX + pad}" y2="${subTop - 8 + subLines.length * 24 + 8}" stroke="rgba(255,255,255,0.2)" stroke-width="1"/>`,
  );
  subLines.forEach((line, i) => {
    parts.push(
      `<text x="${subX}" y="${subTop + i * 24}" font-family="${font}" font-size="15" fill="rgba(255,255,255,0.7)">${escapeXml(line)}</text>`,
    );
  });

  const noteY = cardY + cardH - 22;
  parts.push(
    `<text x="${cardX + cardW / 2}" y="${noteY}" text-anchor="middle" font-family="${font}" font-size="11" fill="rgba(255,255,255,0.3)" letter-spacing="2">本内容为虚拟生成，切勿迷信！</text>`,
  );

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">${parts.join('\n')}</svg>`;
}

async function roundAvatar(sharp: Awaited<ReturnType<typeof loadSharp>>, buf: Buffer, size: number): Promise<Buffer | null> {
  try {
    const mask = Buffer.from(
      `<svg width="${size}" height="${size}"><circle cx="${size / 2}" cy="${size / 2}" r="${size / 2}" fill="white"/></svg>`,
    );
    return sharp(buf)
      .resize(size, size, { fit: 'cover' })
      .ensureAlpha()
      .composite([{ input: mask, blend: 'dest-in' }])
      .png(MK_PNG_OUT())
      .toBuffer();
  } catch {
    return null;
  }
}

/**
 * 使用 Sharp 渲染今日运势卡片，返回 base64（不含 base64:// 前缀）
 */
export async function renderFortuneWithSharpImpl(
  options: FortuneSharpRenderOptions,
  logger?: MkLoggerResolved,
): Promise<string | null> {
  const width = options.width ?? 720;
  const height = options.height ?? 1280;
  const card = options.card || {};
  const pluginDir = String(options.pluginDir || '').trim();
  const dataPath = String(options.dataPath || '').trim();

  try {
    const sharp = await loadSharp();
    const bgBuf = await loadFortuneBackground(card, pluginDir, dataPath);
    const composites: { input: Buffer; top?: number; left?: number }[] = [];

    if (bgBuf && bgBuf.length > 0) {
      await applySharpPhotoBackgroundLayers(sharp, composites, bgBuf, width, height, dataPath);
    } else {
      const fallback = await sharp({
        create: {
          width,
          height,
          channels: 3,
          background: { r: 255, g: 240, b: 243 },
        },
      })
        .png(MK_PNG_OUT())
        .toBuffer();
      composites.push({ input: fallback, top: 0, left: 0 });
      logger?.warn?.('[Sharp渲染] 今日运势背景图不可用，已使用默认底色');
    }

    const customText = loadSharpTextColorFromDataPath(dataPath);
    const overlaySvg = buildFortuneOverlaySvg(width, height, card, customText);
    const overlayLayer = await svgCompositeLayer(sharp, Buffer.from(overlaySvg), width, height);
    composites.push({ input: overlayLayer, top: 0, left: 0 });

    const { cardX, cardY } = calcFortuneCardLayout(width, height, String(card.unSignText || ''));
    const avatarUrl = `https://q4.qlogo.cn/g?b=qq&nk=${card.qq || ''}&s=5`;
    try {
      const avatarBuf = await fetchUrlBuffer(avatarUrl, 10000);
      if (avatarBuf.length > 0) {
        const rounded = await roundAvatar(sharp, avatarBuf, 80);
        if (rounded) {
          composites.push({ input: rounded, top: Math.round(cardY + 30), left: Math.round(cardX + 30) });
        }
      }
    } catch (_e) {
      /* 头像失败不影响整体 */
    }

    // 照片类竖屏大图（720×1280）用 PNG 无损编码可达 1~2MB，base64 内联后
    // 1.3~2.4MB 会让协议端 sendMsg 超时；改 JPEG(q85) 后约 0.25MB，肉眼无差异。
    // flatten 白底：JPEG 不支持 alpha，先压平避免透明区域变黑。
    const out = await sharp({
      create: {
        width,
        height,
        channels: 4,
        background: { r: 0, g: 0, b: 0, alpha: 1 },
      },
    })
      .composite(composites)
      .flatten({ background: { r: 255, g: 255, b: 255 } })
      .jpeg(MK_JPEG_OUT())
      .toBuffer();

    return out.toString('base64');
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    logger?.error?.('[Sharp渲染] 今日运势渲染失败:', msg);
    return null;
  }
}

export async function renderFortuneWithSharp(
  options: Parameters<typeof renderFortuneWithSharpImpl>[0],
  logger?: Parameters<typeof renderFortuneWithSharpImpl>[1],
): Promise<string | null> {
  return runCardSharpJob(
    'fortune',
    { options },
    () => renderFortuneWithSharpImpl(options, logger),
  );
}
