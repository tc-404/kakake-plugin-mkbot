// ---------------------------------------------------------------------------
// Sharp 渲染：签到卡片（正式版）
//
// 与 wallet / fish-basket 走同一套「正式版」架构，受三处配置支配：
//   1. 背景图   —— 「背景修改 · 签到」槽位（自定义图优先，其次插件包默认资源）
//   2. 暗度/模糊 —— 「渲染开关 · Sharp 背景暗度 / Sharp 背景模糊」
//   3. 字体色   —— 「渲染开关 · Sharp 全局字体色」
// HTML 版（默认资源/签到.html）不受影响，仍是原来的 CSS 渐变。
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

export interface SignInEventTag {
  text: string;
  bonus?: boolean;
}

export interface SignInSharpRenderOptions {
  /** 基础货币展示名；缺省回退「归笺」 */
  货币名?: string;
  theme: 'day' | 'night';
  userName: string;
  userId: string | number;
  rankText: string;
  /** true = 已签到大字；false = 显示货币/诱饵积分 */
  signed?: boolean;
  guiJian?: number;
  yuEr?: number;
  totalDays: string;
  streakText: string;
  events?: SignInEventTag[];
  avatarUrl?: string;
  width?: number;
  height?: number;
  /** 插件根目录（定位 默认资源/image） */
  pluginDir?: string;
  /** 数据目录（读 config.json 的 Sharp 暗度/模糊/字体色） */
  dataPath?: string;
  /** 背景图绝对路径，由调用方用 resolveEffectiveBgAbs('signin', 'sharp') 解析 */
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

/** 粗略字宽估算：西文按 0.56em，中日韩按 1em */
function approxTextWidth(text: string, size: number): number {
  let w = 0;
  for (const ch of String(text || '')) {
    w += /[\x00-\xff]/.test(ch) ? size * 0.56 : size;
  }
  return w;
}

/** 数值字号随位数收缩，避免长数字撑破面板 */
function valueFontSize(text: string, base = 82, min = 40): number {
  const len = String(text || '').length;
  if (len <= 6) return base;
  if (len <= 8) return 68;
  if (len <= 10) return 56;
  return min;
}

function fetchUrlBuffer(url: string, timeoutMs = 12000): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith('https') ? https : http;
    const req = lib.get(
      url,
      { timeout: timeoutMs, headers: { 'User-Agent': 'MKbot-SignInSharp/1.0' } },
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

/** 背景图候选链：显式 path → 数据目录/插件包默认资源下的 签到.* → heng.jpg */
async function loadSignInBackground(
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

  const localNames = ['签到.jpg', '签到.jpeg', '签到.png', '签到.webp', 'heng.jpg'];
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
    for (const name of localNames) push(path.join(root, name));
  }

  for (const src of candidates) {
    try {
      if (/^https?:\/\//i.test(src)) {
        const buf = await fetchUrlBuffer(src, 20000);
        if (buf?.length) return buf;
        continue;
      }
      if (fs.existsSync(src) && fs.statSync(src).isFile()) return fs.readFileSync(src);
    } catch {
      /* try next */
    }
  }
  return null;
}

function glassRect(x: number, y: number, w: number, h: number, r = 22): string {
  return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" ry="${r}" fill="rgba(255,255,255,0.12)" stroke="rgba(255,255,255,0.28)" stroke-width="1.5"/>`;
}

/** 导出以便离线生成样例 SVG 做版式回归（不影响运行时行为） */
export function buildSignInSvg(
  width: number,
  height: number,
  opts: SignInSharpRenderOptions,
  customText: string | null,
  hasBg = false,
): string {
  const 货币单位 = escapeXml(opts.货币名 || '归笺');
  const isDay = opts.theme === 'day';
  const font = 'Microsoft YaHei, Noto Sans SC, sans-serif';

  // 「渲染开关 · Sharp 全局字体色」优先，否则按昼夜主题取默认
  const mainFill = resolveSharpTextFill(customText, isDay ? '#ff5722' : '#f8fafc');
  const subFill = isDay ? 'rgba(120,72,20,0.88)' : 'rgba(226,232,240,0.88)';
  const labelFill = isDay ? 'rgba(120,72,20,0.78)' : 'rgba(203,213,225,0.8)';
  const rankFill = isDay ? '#ff9800' : '#fbbf24';
  const glow = isDay ? 'url(#glowLight)' : 'url(#glowDark)';

  const pad = 30;
  const cardX = pad;
  const cardY = pad;
  const cardW = width - pad * 2;
  const cardH = height - pad * 2;
  const radius = 30;

  const parts: string[] = [];

  parts.push(`<defs>
    <clipPath id="cardClip"><rect x="${cardX}" y="${cardY}" width="${cardW}" height="${cardH}" rx="${radius}" ry="${radius}"/></clipPath>
    <linearGradient id="bgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      ${
        isDay
          ? '<stop offset="0%" stop-color="#ffe0b2"/><stop offset="100%" stop-color="#b3e5fc"/>'
          : '<stop offset="0%" stop-color="#0f172a"/><stop offset="50%" stop-color="#1e293b"/><stop offset="100%" stop-color="#0f172a"/>'
      }
    </linearGradient>
    <linearGradient id="rankGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      ${
        isDay
          ? '<stop offset="0%" stop-color="#ff9800"/><stop offset="100%" stop-color="#ff5722"/>'
          : '<stop offset="0%" stop-color="#f59e0b"/><stop offset="100%" stop-color="#ea580c"/>'
      }
    </linearGradient>
    <linearGradient id="guiGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      ${
        isDay
          ? '<stop offset="0%" stop-color="#ff9800"/><stop offset="100%" stop-color="#ff5722"/>'
          : '<stop offset="0%" stop-color="#f59e0b"/><stop offset="100%" stop-color="#ea580c"/>'
      }
    </linearGradient>
    <linearGradient id="yuGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      ${
        isDay
          ? '<stop offset="0%" stop-color="#00b8d4"/><stop offset="100%" stop-color="#4dd0e1"/>'
          : '<stop offset="0%" stop-color="#3b82f6"/><stop offset="100%" stop-color="#06b6d4"/>'
      }
    </linearGradient>
    <linearGradient id="avatarBorder" x1="0%" y1="0%" x2="100%" y2="100%">
      ${
        isDay
          ? '<stop offset="0%" stop-color="#ff5722"/><stop offset="50%" stop-color="#ff9800"/><stop offset="100%" stop-color="#48cae4"/>'
          : '<stop offset="0%" stop-color="#f59e0b"/><stop offset="50%" stop-color="#3b82f6"/><stop offset="100%" stop-color="#06b6d4"/>'
      }
    </linearGradient>
    <filter id="glowLight" x="-40%" y="-40%" width="180%" height="180%">
      <feDropShadow dx="0" dy="0" stdDeviation="3" flood-color="#ffffff" flood-opacity="0.9"/>
      <feDropShadow dx="0" dy="1" stdDeviation="5" flood-color="#7c5a2a" flood-opacity="0.3"/>
    </filter>
    <filter id="glowDark" x="-40%" y="-40%" width="180%" height="180%">
      <feDropShadow dx="0" dy="0" stdDeviation="3" flood-color="#000000" flood-opacity="0.55"/>
      <feDropShadow dx="0" dy="1" stdDeviation="6" flood-color="#000000" flood-opacity="0.35"/>
    </filter>
    <filter id="blobBlur" x="-50%" y="-50%" width="200%" height="200%">
      <feGaussianBlur stdDeviation="34"/>
    </filter>
  </defs>`);

  // ---- 底：有背景图时只叠主题色调，让图透出；无背景图时画主题渐变 ----
  parts.push(`<g clip-path="url(#cardClip)">`);
  if (!hasBg) {
    parts.push(`<rect x="${cardX}" y="${cardY}" width="${cardW}" height="${cardH}" fill="url(#bgGrad)"/>`);
  } else {
    parts.push(
      `<rect x="${cardX}" y="${cardY}" width="${cardW}" height="${cardH}" fill="${isDay ? 'rgba(255,248,230,0.16)' : 'rgba(8,12,22,0.30)'}"/>`,
    );
  }

  const blobOpacity = hasBg ? 0.26 : 0.5;
  if (isDay) {
    parts.push(`<circle cx="${cardX + cardW * 0.82}" cy="${cardY + 30}" r="150" fill="#ffcc80" opacity="${blobOpacity}" filter="url(#blobBlur)"/>`);
    parts.push(`<circle cx="${cardX + 40}" cy="${cardY + cardH * 0.78}" r="130" fill="#90e0ef" opacity="${blobOpacity}" filter="url(#blobBlur)"/>`);
  } else {
    parts.push(`<circle cx="${cardX + cardW * 0.82}" cy="${cardY + 30}" r="150" fill="#3b82f6" opacity="${blobOpacity}" filter="url(#blobBlur)"/>`);
    parts.push(`<circle cx="${cardX + 40}" cy="${cardY + cardH * 0.78}" r="130" fill="#f59e0b" opacity="${blobOpacity}" filter="url(#blobBlur)"/>`);
  }

  parts.push(glassRect(cardX, cardY, cardW, cardH, radius));

  // ---- 头部：头像 + 昵称 / QQ + 名次 ----
  const avatarSize = 84;
  const avatarX = cardX + 24;
  const avatarY = cardY + 24;
  parts.push(
    `<rect x="${avatarX}" y="${avatarY}" width="${avatarSize}" height="${avatarSize}" rx="20" ry="20" fill="url(#avatarBorder)"/>`,
  );
  parts.push(
    `<rect x="${avatarX + 3}" y="${avatarY + 3}" width="${avatarSize - 6}" height="${avatarSize - 6}" rx="17" ry="17" fill="#ffffff"/>`,
  );

  const textX = avatarX + avatarSize + 20;
  const rightX = cardX + cardW - 26;
  parts.push(
    `<text x="${textX}" y="${avatarY + 33}" font-family="${font}" font-size="27" font-weight="800" fill="${mainFill}" filter="${glow}">${escapeXml(truncateText(opts.userName, 12))}</text>`,
  );
  parts.push(
    `<text x="${textX}" y="${avatarY + 60}" font-family="${font}" font-size="14" fill="${subFill}" filter="${glow}">QQ: ${escapeXml(String(opts.userId))}</text>`,
  );
  parts.push(
    `<text x="${rightX}" y="${avatarY + 58}" text-anchor="end" font-family="${font}" font-size="42" font-weight="900" fill="${rankFill}" filter="${glow}">${escapeXml(opts.rankText)}</text>`,
  );

  // ---- 中部：已签到大字 / 货币+诱饵两栏 ----
  const midW = cardW - 120;
  const midX = cardX + 60;
  if (opts.signed) {
    const midY = avatarY + avatarSize + 34;
    const midH = 240;
    parts.push(glassRect(midX, midY, midW, midH, 26));
    // letter-spacing 会在最后一个字符后面也加间距，text-anchor=middle 时整体会偏左，这里补偿半个字距
    parts.push(
      `<text x="${cardX + cardW / 2 + 4}" y="${midY + midH / 2 + 34}" text-anchor="middle" font-family="${font}" font-size="96" font-weight="900" fill="${mainFill}" letter-spacing="8" filter="${glow}">已签到</text>`,
    );
  } else {
    const gj = Number(opts.guiJian ?? 0);
    const ye = Number(opts.yuEr ?? 0);
    const gjText = `+${gj}`;
    const yeText = `+${ye}`;
    const tileGap = 24;
    const tileW = (midW - tileGap) / 2;
    const tileY = avatarY + avatarSize + 34;
    const tileH = 240;
    const cols = [
      { x: midX, label: 货币单位, value: gjText, grad: 'url(#guiGrad)' },
      { x: midX + tileW + tileGap, label: '诱饵', value: yeText, grad: 'url(#yuGrad)' },
    ];
    for (const col of cols) {
      const cx = col.x + tileW / 2;
      const vSize = valueFontSize(col.value);
      // 设置了「Sharp 全局字体色」时数值跟随该色，否则用主题渐变
      const valueFill = customText ? customText : col.grad;
      parts.push(glassRect(col.x, tileY, tileW, tileH, 26));
      parts.push(
        `<text x="${cx}" y="${tileY + 82}" text-anchor="middle" font-family="${font}" font-size="30" font-weight="800" fill="${labelFill}" filter="${glow}">${escapeXml(col.label)}</text>`,
      );
      parts.push(
        `<text x="${cx}" y="${tileY + 168}" text-anchor="middle" font-family="${font}" font-size="${vSize}" font-weight="900" fill="${valueFill}" filter="${glow}">${escapeXml(col.value)}</text>`,
      );
    }
  }

  // ---- 底部：累计 / 连签 + 事件标签 ----
  const statsH = 152;
  const statsX = cardX + 24;
  const statsW = cardW - 48;
  const statsY = cardY + cardH - 18 - statsH;
  parts.push(glassRect(statsX, statsY, statsW, statsH, 24));

  const col1 = statsX + statsW * 0.25;
  const col2 = statsX + statsW * 0.75;
  const daysSize = valueFontSize(opts.totalDays, 38, 24);
  const streakSize = valueFontSize(truncateText(opts.streakText, 12), 32, 22);
  const statFill = customText ? customText : 'url(#rankGrad)';
  parts.push(
    `<text x="${col1}" y="${statsY + 42}" text-anchor="middle" font-family="${font}" font-size="16" font-weight="700" fill="${labelFill}" filter="${glow}">累计天数</text>`,
  );
  parts.push(
    `<text x="${col1}" y="${statsY + 86}" text-anchor="middle" font-family="${font}" font-size="${daysSize}" font-weight="900" fill="${statFill}" filter="${glow}">${escapeXml(opts.totalDays)}</text>`,
  );
  parts.push(
    `<text x="${col2}" y="${statsY + 42}" text-anchor="middle" font-family="${font}" font-size="16" font-weight="700" fill="${labelFill}" filter="${glow}">连签次数</text>`,
  );
  parts.push(
    `<text x="${col2}" y="${statsY + 86}" text-anchor="middle" font-family="${font}" font-size="${streakSize}" font-weight="900" fill="${statFill}" filter="${glow}">${escapeXml(truncateText(opts.streakText, 12))}</text>`,
  );

  parts.push(
    `<rect x="${statsX + 26}" y="${statsY + 106}" width="${statsW - 52}" height="1" fill="${isDay ? 'rgba(120,72,20,0.2)' : 'rgba(255,255,255,0.18)'}"/>`,
  );

  const events = Array.isArray(opts.events) ? opts.events.filter((e) => String(e?.text || '').trim()) : [];
  if (events.length > 0) {
    let tagX = statsX + 26;
    const tagY = statsY + 116;
    const tagH = 28;
    const maxX = statsX + statsW - 20;
    for (const ev of events.slice(0, 4)) {
      const text = truncateText(ev.text, 14);
      const tagW = Math.ceil(approxTextWidth(text, 13)) + 26;
      if (tagX + tagW > maxX) break;
      const fill = ev.bonus
        ? 'url(#rankGrad)'
        : isDay
          ? 'rgba(255,152,0,0.18)'
          : 'rgba(59,130,246,0.22)';
      const stroke = ev.bonus ? 'none' : isDay ? 'rgba(255,152,0,0.35)' : 'rgba(59,130,246,0.38)';
      const textFill = ev.bonus ? '#ffffff' : isDay ? '#b45309' : '#93c5fd';
      parts.push(
        `<rect x="${tagX}" y="${tagY}" width="${tagW}" height="${tagH}" rx="14" ry="14" fill="${fill}" stroke="${stroke}" stroke-width="1"/>`,
      );
      parts.push(
        `<text x="${tagX + tagW / 2}" y="${tagY + 19}" text-anchor="middle" font-family="${font}" font-size="13" font-weight="600" fill="${textFill}">${escapeXml(text)}</text>`,
      );
      tagX += tagW + 10;
    }
  }

  parts.push(`</g>`);

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">${parts.join('\n')}</svg>`;
}

async function roundAvatar(
  sharp: Awaited<ReturnType<typeof loadSharp>>,
  buf: Buffer,
  size: number,
): Promise<Buffer | null> {
  try {
    const mask = Buffer.from(
      `<svg width="${size}" height="${size}"><rect x="0" y="0" width="${size}" height="${size}" rx="18" ry="18" fill="white"/></svg>`,
    );
    return sharp(buf)
      .resize(size, size, { fit: 'cover' })
      .ensureAlpha()
      .composite([{ input: mask, blend: 'dest-in' }])
      .png()
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
  return sharp(input)
    .resize(width, height, { fit: 'fill' })
    .ensureAlpha()
    .png()
    .toBuffer();
}

/**
 * 使用 Sharp 渲染签到卡片，返回 base64（不含 base64:// 前缀）
 */
export async function renderSignInWithSharpImpl(
  options: SignInSharpRenderOptions,
  logger?: MkLoggerResolved,
): Promise<string | null> {
  const width = options.width ?? 900;
  const height = options.height ?? 620;
  const pluginDir = String(options.pluginDir || '').trim();
  const dataPath = String(options.dataPath || '').trim();
  const bgLocalPath = String(options.bgLocalPath || '').trim();

  try {
    const sharp = await loadSharp();
    const composites: { input: Buffer; top?: number; left?: number }[] = [];

    // 背景图 + 暗度/模糊（渲染开关里的 Sharp 配置自动生效）
    const bgBuf = await loadSignInBackground(bgLocalPath, pluginDir, dataPath);
    if (bgBuf && bgBuf.length > 0) {
      await applySharpPhotoBackgroundLayers(sharp, composites, bgBuf, width, height, dataPath);
    } else {
      const fallback = await sharp({
        create: {
          width,
          height,
          channels: 4,
          background: { r: 18, g: 22, b: 30, alpha: 1 },
        },
      })
        .png()
        .toBuffer();
      composites.push({ input: fallback, top: 0, left: 0 });
      logger?.warn?.('[Sharp渲染] 签到背景图不可用，已使用默认底色');
    }

    const customText = loadSharpTextColorFromDataPath(dataPath);
    const svg = buildSignInSvg(width, height, options, customText, Boolean(bgBuf && bgBuf.length > 0));
    const uiLayer = await fitCompositeLayer(sharp, Buffer.from(svg), width, height);
    composites.push({ input: uiLayer, top: 0, left: 0 });

    // 头像：位置必须与 SVG 里的头像框对齐（pad 30 + 内缩 24）
    const avatarSize = 84;
    const avatarTop = 30 + 24;
    const avatarLeft = 30 + 24;
    const avatarUrl =
      String(options.avatarUrl || '').trim() ||
      `https://q4.qlogo.cn/g?b=qq&nk=${options.userId}&s=5`;
    try {
      const avatarBuf = await fetchUrlBuffer(avatarUrl, 10000);
      if (avatarBuf.length > 0) {
        const rounded = await roundAvatar(sharp, avatarBuf, avatarSize);
        if (rounded) composites.push({ input: rounded, top: avatarTop, left: avatarLeft });
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
      .png()
      .toBuffer();

    return out.toString('base64');
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    logger?.error?.('[Sharp渲染] 签到渲染失败:', msg);
    return null;
  }
}

export async function renderSignInWithSharp(
  options: Parameters<typeof renderSignInWithSharpImpl>[0],
  logger?: Parameters<typeof renderSignInWithSharpImpl>[1],
): Promise<string | null> {
  return runCardSharpJob(
    'signin',
    { options },
    () => renderSignInWithSharpImpl(options, logger),
  );
}
