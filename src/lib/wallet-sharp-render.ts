// ---------------------------------------------------------------------------
// Sharp 渲染：我的货币 / 我的信息卡片（透明液态玻璃 + 可换背景）
// ---------------------------------------------------------------------------

import fs from 'fs';
import https from 'https';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import type { MkLoggerResolved } from '../types';
import { loadSharp } from './sharp-loader';
import { runCardSharpJob } from './sharp-worker-client';
import { applySharpPhotoBackgroundLayers } from './sharp-bg-effects';
import { loadSharpTextColorFromDataPath, resolveSharpTextFill } from './sharp-text-color';
import { MK_PNG_OUT } from './png-output';
import { svgCompositeLayer } from './sharp-svg-layer';

export interface WalletSharpRenderOptions {
  /** 基础货币展示名；缺省回退「归笺」 */
  货币名?: string;
  title?: string;
  userName?: string;
  userId: string | number;
  time?: string;
  currentMoney: string;
  bankMoney: string;
  baitCount: string;
  muteCardCount?: string;
  signTotal: string;
  signStreak: string;
  width?: number;
  height?: number;
  pluginDir?: string;
  dataPath?: string;
  bgLocalPath?: string;
}

function escapeXml(text: string): string {
  return String(text ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function truncateText(text: string, maxLen: number): string {
  const s = String(text || '').trim();
  if (s.length <= maxLen) return s;
  return `${s.slice(0, maxLen - 1)}…`;
}

function valueFontSize(text: string, base = 34, min = 20): number {
  const len = String(text || '').length;
  if (len <= 8) return base;
  if (len <= 12) return 28;
  if (len <= 18) return 24;
  return min;
}

function fetchUrlBuffer(url: string, timeoutMs = 12000): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith('https') ? https : http;
    const req = lib.get(
      url,
      { timeout: timeoutMs, headers: { 'User-Agent': 'MKbot-WalletSharp/1.0' } },
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

function glassRect(x: number, y: number, w: number, h: number, r = 18): string {
  // 只保留玻璃底板。原先这里还叠了一层「顶部高光条」（高度 = 22% 卡高），
  // 在主卡上高 146px、下边缘横穿头部区，在子卡上则是一条压住标签文字的圆角气泡条，
  // 视觉上表现为「卡片顶部一条横向气泡 + 文字重叠」，已按需求移除。
  return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" ry="${r}" fill="rgba(255,255,255,0.12)" stroke="rgba(255,255,255,0.28)" stroke-width="1.5"/>`;
}

async function loadWalletBackground(
  bgLocalPath: string,
  pluginDir: string,
  dataPath: string,
): Promise<Buffer | null> {
  const candidates: string[] = [];
  const push = (v?: string) => {
    const s = String(v || '').trim();
    if (s && !candidates.includes(s)) candidates.push(s);
  };

  push(bgLocalPath);

  const localNames = ['运行状态.jpg', '运行状态.jpeg', '运行状态.png', '运行状态.webp'];
  const roots = [
    path.join(String(pluginDir || '').trim(), '默认资源', 'image'),
    path.join(String(dataPath || '').trim(), '默认资源', 'image'),
  ];
  try {
    const here = path.dirname(fileURLToPath(import.meta.url));
    roots.push(path.join(here, '默认资源', 'image'));
    roots.push(path.join(here, '..', '默认资源', 'image'));
  } catch {
    /* ignore */
  }
  for (const root of roots) {
    if (!String(root || '').trim()) continue;
    for (const name of localNames) {
      push(path.join(root, name));
    }
  }

  for (const src of candidates) {
    try {
      if (/^https?:\/\//i.test(src)) {
        const buf = await fetchUrlBuffer(src, 20000);
        if (buf?.length) return buf;
        continue;
      }
      if (fs.existsSync(src) && fs.statSync(src).isFile()) {
        return fs.readFileSync(src);
      }
    } catch {
      /* try next */
    }
  }
  return null;
}

/** 导出以便离线生成样例 SVG 做版式回归（不影响运行时行为） */
export function buildWalletSvg(width: number, height: number, opts: WalletSharpRenderOptions, customText: string | null): string {
  const 货币单位 = escapeXml(opts.货币名 || '归笺');
  const font = 'Microsoft YaHei, Noto Sans SC, sans-serif';
  const mainFill = resolveSharpTextFill(customText, '#ffffff');
  const pad = 28;
  const cardX = pad;
  const cardY = pad;
  const cardW = width - pad * 2;
  const cardH = height - pad * 2;
  const title = escapeXml(opts.title || '我的信息');
  const userName = escapeXml(truncateText(opts.userName || '旅人', 14));
  const userId = escapeXml(String(opts.userId || ''));
  const time = escapeXml(opts.time || '');
  const currentMoney = escapeXml(opts.currentMoney || `0${货币单位}`);
  const bankMoney = escapeXml(opts.bankMoney || `0${货币单位}`);
  const baitCount = escapeXml(String(opts.baitCount ?? '0'));
  const muteCardCount = escapeXml(String(opts.muteCardCount ?? '0'));
  const signTotal = escapeXml(String(opts.signTotal ?? '0'));
  const signStreak = escapeXml(String(opts.signStreak ?? '0'));

  const parts: string[] = [];
  parts.push(`<defs>
    <linearGradient id="valGrad" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#ffffff"/>
      <stop offset="100%" stop-color="#c8e7ff"/>
    </linearGradient>
    <linearGradient id="accentGrad" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#e8f4ff"/>
      <stop offset="100%" stop-color="#9ec9e8"/>
    </linearGradient>
    <filter id="titleGlow" x="-30%" y="-30%" width="160%" height="160%">
      <feDropShadow dx="0" dy="0" stdDeviation="2" flood-color="#ffffff" flood-opacity="0.85"/>
      <feDropShadow dx="0" dy="1" stdDeviation="4" flood-color="#8eb8d8" flood-opacity="0.35"/>
    </filter>
    <filter id="valGlow" x="-35%" y="-35%" width="170%" height="170%">
      <feDropShadow dx="0" dy="0" stdDeviation="2" flood-color="#ffffff" flood-opacity="0.55"/>
      <feDropShadow dx="0" dy="1" stdDeviation="5" flood-color="#9ec9e8" flood-opacity="0.35"/>
    </filter>
  </defs>`);

  // 主玻璃卡（透明，背景图透出）
  parts.push(glassRect(cardX, cardY, cardW, cardH, 26));

  const avatarX = cardX + 22;
  const avatarY = cardY + 22;
  const avatarSize = 86;
  parts.push(
    `<circle cx="${avatarX + avatarSize / 2}" cy="${avatarY + avatarSize / 2}" r="${avatarSize / 2 + 1.5}" fill="rgba(255,255,255,0.14)" stroke="rgba(255,255,255,0.45)" stroke-width="2.5"/>`,
  );

  const infoX = avatarX + avatarSize + 18;
  parts.push(
    `<text x="${infoX}" y="${avatarY + 26}" font-family="${font}" font-size="13" font-weight="700" fill="rgba(255,255,255,0.72)" letter-spacing="1">time:${time}</text>`,
  );
  parts.push(
    `<text x="${infoX}" y="${avatarY + 58}" font-family="${font}" font-size="30" font-weight="900" fill="${mainFill}" filter="url(#titleGlow)">${title}</text>`,
  );
  parts.push(
    `<text x="${infoX}" y="${avatarY + 82}" font-family="${font}" font-size="15" fill="rgba(255,255,255,0.82)">${userName} (${userId})</text>`,
  );

  const tileY = cardY + 118;
  const gap = 14;
  const tileW = (cardW - 44 - gap) / 2;
  const tileH = 112;
  const tileX0 = cardX + 22;

  const tiles = [
    { label: '现有货币', value: currentMoney },
    { label: '银行储存', value: bankMoney },
    { label: '诱饵数量', value: baitCount, unit: '个' },
    { label: '禁言卡', value: muteCardCount, unit: '张' },
  ];

  tiles.forEach((tile, i) => {
    const col = i % 2;
    const row = Math.floor(i / 2);
    const x = tileX0 + col * (tileW + gap);
    const y = tileY + row * (tileH + gap);
    const displayValue = tile.unit ? `${tile.value}${tile.unit}` : tile.value;
    const valSize = valueFontSize(displayValue, 30, 18);
    parts.push(glassRect(x, y, tileW, tileH, 18));
    parts.push(
      `<circle cx="${x + 22}" cy="${y + 24}" r="4.5" fill="rgba(200,231,255,0.9)"/>`,
    );
    parts.push(
      `<text x="${x + 36}" y="${y + 28}" font-family="${font}" font-size="16" font-weight="800" fill="rgba(255,255,255,0.92)">${escapeXml(tile.label)}</text>`,
    );
    parts.push(
      `<text x="${x + 22}" y="${y + 78}" font-family="${font}" font-size="${valSize}" font-weight="900" fill="url(#valGrad)" filter="url(#valGlow)">${escapeXml(displayValue)}</text>`,
    );
  });

  const footY = tileY + tileH * 2 + gap + 14;
  const footW = (cardW - 44 - gap) / 2;
  const footH = 74;
  const footItems = [
    { label: '累计签到', value: signTotal, unit: '天' },
    { label: '连续签到', value: signStreak, unit: '天' },
  ];
  footItems.forEach((item, i) => {
    const x = tileX0 + i * (footW + gap);
    parts.push(glassRect(x, footY, footW, footH, 16));
    parts.push(
      `<text x="${x + 16}" y="${footY + 26}" font-family="${font}" font-size="13" font-weight="600" fill="rgba(255,255,255,0.78)">${escapeXml(item.label)}</text>`,
    );
    parts.push(
      `<text x="${x + 16}" y="${footY + 54}" font-family="${font}" font-size="26" font-weight="900" fill="url(#accentGrad)" filter="url(#valGlow)">${escapeXml(item.value)}<tspan font-size="13" fill="rgba(255,255,255,0.7)" filter="none"> ${escapeXml(item.unit)}</tspan></text>`,
    );
  });

  parts.push(
    `<text x="${cardX + cardW / 2}" y="${cardY + cardH - 14}" text-anchor="middle" font-family="${font}" font-size="11" fill="rgba(255,255,255,0.38)" letter-spacing="2">MK-Bot · 娱乐经济数据</text>`,
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

async function fitCompositeLayer(
  sharp: Awaited<ReturnType<typeof loadSharp>>,
  input: Buffer,
  width: number,
  height: number,
): Promise<Buffer> {
  // SVG 直传：固有尺寸与画布一致时，跳过「栅格化 → PNG 编码 → composite 再解码」这一整轮
  return svgCompositeLayer(sharp, input, width, height);
}

export async function renderWalletWithSharpImpl(
  options: WalletSharpRenderOptions,
  logger?: MkLoggerResolved,
): Promise<string | null> {
  const width = options.width ?? 1080;
  const height = options.height ?? 720;
  const pluginDir = String(options.pluginDir || '').trim();
  const dataPath = String(options.dataPath || '').trim();
  const bgLocalPath = String(options.bgLocalPath || '').trim();

  try {
    const sharp = await loadSharp();
    const composites: { input: Buffer; top?: number; left?: number }[] = [];

    const bgBuf = await loadWalletBackground(bgLocalPath, pluginDir, dataPath);
    if (bgBuf && bgBuf.length > 0) {
      await applySharpPhotoBackgroundLayers(sharp, composites, bgBuf, width, height, dataPath);
    } else {
      const fallback = await sharp({
        create: {
          width,
          height,
          channels: 4,
          background: { r: 22, g: 28, b: 38, alpha: 1 },
        },
      })
        .png(MK_PNG_OUT())
        .toBuffer();
      composites.push({ input: fallback, top: 0, left: 0 });
      logger?.warn?.('[Sharp渲染] 我的信息背景图不可用，已使用默认底色');
    }

    const customText = loadSharpTextColorFromDataPath(dataPath);
    const svg = buildWalletSvg(width, height, options, customText);
    const uiLayer = await fitCompositeLayer(sharp, Buffer.from(svg), width, height);
    composites.push({ input: uiLayer, top: 0, left: 0 });

    const avatarSize = 86;
    const avatarTop = 28 + 22; // pad + inset
    const avatarLeft = 28 + 22;
    const avatarUrl = `https://q4.qlogo.cn/g?b=qq&nk=${options.userId}&s=5`;
    try {
      const avatarBuf = await fetchUrlBuffer(avatarUrl, 10000);
      if (avatarBuf.length > 0) {
        const rounded = await roundAvatar(sharp, avatarBuf, avatarSize);
        if (rounded) {
          composites.push({ input: rounded, top: avatarTop, left: avatarLeft });
        }
      }
    } catch (_e) {
      /* 头像失败不影响整体 */
    }

    const out = await sharp({
      create: {
        width,
        height,
        channels: 4,
        background: { r: 18, g: 22, b: 30, alpha: 1 },
      },
    })
      .composite(composites)
      .png(MK_PNG_OUT())
      .toBuffer();

    return out.toString('base64');
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    logger?.error?.('[Sharp渲染] 我的货币渲染失败:', msg);
    return null;
  }
}

export async function renderWalletWithSharp(
  options: WalletSharpRenderOptions,
  logger?: MkLoggerResolved,
): Promise<string | null> {
  return runCardSharpJob(
    'wallet',
    { options },
    () => renderWalletWithSharpImpl(options, logger),
  );
}
