// ---------------------------------------------------------------------------
// Sharp 渲染：入群身份卡片（液态玻璃 + 蓝白主题，与我的信息/菜单统一）
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

export interface JoinIdentitySharpRenderOptions {
  qq: string;
  name: string;
  sex: string;
  birthday: string;
  age: string;
  qqLevel: string;
  regTime: string;
  joinTime: string;
  width?: number;
  height?: number;
  pluginDir?: string;
  dataPath?: string;
  bgLocalPath?: string;
}

export interface JoinIdentityLayout {
  avatarSize: number;
  avatarLeft: number;
  avatarTop: number;
}

/** 玻璃面板（与 wallet-sharp-render 一致） */
function glassRect(x: number, y: number, w: number, h: number, r = 18): string {
  return [
    `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" ry="${r}" fill="rgba(255,255,255,0.12)" stroke="rgba(255,255,255,0.28)" stroke-width="1.5"/>`,
    `<rect x="${x + 1}" y="${y + 1}" width="${w - 2}" height="${Math.max(10, Math.floor(h * 0.22))}" rx="${Math.max(8, r - 4)}" ry="${Math.max(8, r - 4)}" fill="rgba(255,255,255,0.08)"/>`,
  ].join('\n');
}

function joinIdentityDefs(): string {
  return `<defs>
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
  </defs>`;
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

function fetchUrlBuffer(url: string, timeoutMs = 12000): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith('https') ? https : http;
    const req = lib.get(
      url,
      { timeout: timeoutMs, headers: { 'User-Agent': 'MKbot-JoinIdentitySharp/1.0' } },
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

async function loadJoinIdentityBackground(
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

  const localNames = ['heng.jpg', 'heng.jpeg', 'heng.png', 'heng.webp'];
  const roots = [
    path.join(String(pluginDir || '').trim(), '默认资源', 'image'),
    path.join(String(dataPath || '').trim(), '默认资源', 'image'),
  ];
  try {
    const here = path.dirname(fileURLToPath(import.meta.url));
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
        if (buf.length > 0) return buf;
        continue;
      }
      const abs = path.isAbsolute(src) ? src : path.resolve(src);
      if (fs.existsSync(abs)) {
        const buf = fs.readFileSync(abs);
        if (buf.length > 0) return buf;
      }
    } catch {
      /* try next */
    }
  }
  return null;
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

function calcJoinIdentityLayout(width: number, height: number): JoinIdentityLayout {
  const pad = 40;
  const headerH = 88;
  const avatarSize = 196;
  const avatarCenterY = pad + headerH + 36 + avatarSize / 2;
  return {
    avatarSize,
    avatarLeft: Math.round(width / 2 - avatarSize / 2),
    avatarTop: Math.round(avatarCenterY - avatarSize / 2),
  };
}

function buildJoinIdentitySvg(
  width: number,
  height: number,
  opts: JoinIdentitySharpRenderOptions,
  layout: JoinIdentityLayout,
  customText: string | null,
): string {
  const font = 'Microsoft YaHei, Noto Sans SC, sans-serif';
  const mainFill = resolveSharpTextFill(customText, '#ffffff');
  const pad = 40;
  const cardX = pad;
  const cardY = pad;
  const cardW = width - pad * 2;
  const cardH = height - pad * 2;
  const cx = width / 2;

  const qq = escapeXml(String(opts.qq || ''));
  const name = escapeXml(truncateText(opts.name || '新成员', 14));
  const sex = escapeXml(String(opts.sex || '未知'));
  const birthday = escapeXml(String(opts.birthday || '-'));
  const age = escapeXml(String(opts.age || '0'));
  const qqLevel = escapeXml(String(opts.qqLevel || '0'));
  const regTime = escapeXml(String(opts.regTime || '-'));
  const joinTime = escapeXml(String(opts.joinTime || '-'));

  const avatarCx = layout.avatarLeft + layout.avatarSize / 2;
  const avatarCy = layout.avatarTop + layout.avatarSize / 2;
  const avatarR = layout.avatarSize / 2;

  const nameY = layout.avatarTop + layout.avatarSize + 44;
  const qqY = nameY + 34;
  const badgeY = qqY + 36;
  const gridY = badgeY + 40;

  const gridPad = 36;
  const gridW = cardW - gridPad * 2;
  const colGap = 16;
  const rowGap = 16;
  const colW = (gridW - colGap * 3) / 4;
  const rowH = 108;
  const wideW = (gridW - colGap) / 2;

  const parts: string[] = [];
  parts.push(joinIdentityDefs());

  parts.push(glassRect(cardX, cardY, cardW, cardH, 32));

  const headerY = cardY + 36;
  parts.push(
    `<text x="${cardX + gridPad}" y="${headerY}" font-family="${font}" font-size="30" font-weight="900" fill="${mainFill}" filter="url(#titleGlow)">入群身份</text>`,
  );
  parts.push(
    `<text x="${cardX + gridPad}" y="${headerY + 26}" font-family="${font}" font-size="13" fill="rgba(255,255,255,0.72)" letter-spacing="1.5">WELCOME CARD</text>`,
  );
  parts.push(
    `<text x="${cardX + cardW - gridPad}" y="${headerY}" text-anchor="end" font-family="${font}" font-size="13" fill="rgba(255,255,255,0.82)">${joinTime}</text>`,
  );
  parts.push(
    `<text x="${cardX + cardW - gridPad}" y="${headerY + 22}" text-anchor="end" font-family="${font}" font-size="11" fill="rgba(255,255,255,0.5)">加群时间</text>`,
  );

  parts.push(
    `<circle cx="${avatarCx}" cy="${avatarCy}" r="${avatarR + 6}" fill="none" stroke="rgba(255,255,255,0.35)" stroke-width="2.5"/>`,
  );
  parts.push(
    `<circle cx="${avatarCx}" cy="${avatarCy}" r="${avatarR}" fill="rgba(255,255,255,0.1)" stroke="rgba(255,255,255,0.45)" stroke-width="3"/>`,
  );

  parts.push(
    `<text x="${cx}" y="${nameY}" text-anchor="middle" font-family="${font}" font-size="34" font-weight="900" fill="url(#valGrad)" filter="url(#valGlow)">${name}</text>`,
  );
  parts.push(
    `<text x="${cx}" y="${qqY}" text-anchor="middle" font-family="${font}" font-size="16" fill="rgba(255,255,255,0.82)">QQ · ${qq}</text>`,
  );

  const badges: { text: string; x: number }[] = [
    { text: sex, x: cx - 130 },
    { text: `${age}岁`, x: cx },
    { text: `Lv.${qqLevel}`, x: cx + 130 },
  ];
  badges.forEach((b) => {
    const bw = 108;
    const bh = 30;
    const bx = b.x - bw / 2;
    const by = badgeY - 22;
    parts.push(glassRect(bx, by, bw, bh, 15));
    parts.push(
      `<text x="${b.x}" y="${badgeY}" text-anchor="middle" font-family="${font}" font-size="14" font-weight="800" fill="url(#accentGrad)" filter="url(#valGlow)">${escapeXml(b.text)}</text>`,
    );
  });

  const drawTile = (x: number, y: number, w: number, h: number, label: string, value: string, accent = false) => {
    parts.push(glassRect(x, y, w, h, 16));
    parts.push(
      `<circle cx="${x + 18}" cy="${y + 22}" r="4" fill="rgba(200,231,255,0.9)"/>`,
    );
    parts.push(
      `<text x="${x + 32}" y="${y + 26}" font-family="${font}" font-size="12" font-weight="600" fill="rgba(255,255,255,0.72)">${escapeXml(label)}</text>`,
    );
    if (accent) {
      parts.push(
        `<text x="${x + 18}" y="${y + 72}" font-family="${font}" font-size="24" font-weight="900" fill="url(#valGrad)" filter="url(#valGlow)">${escapeXml(value)}</text>`,
      );
    } else {
      parts.push(
        `<text x="${x + 18}" y="${y + 68}" font-family="${font}" font-size="20" font-weight="700" fill="${mainFill}">${escapeXml(value)}</text>`,
      );
    }
  };

  const gx = cardX + gridPad;
  const tiles: { label: string; value: string; accent?: boolean }[] = [
    { label: '性别', value: sex, accent: true },
    { label: '年龄', value: `${age}岁`, accent: true },
    { label: 'QQ等级', value: `${qqLevel}级`, accent: true },
    { label: '生日', value: birthday, accent: true },
  ];
  tiles.forEach((tile, i) => {
    const x = gx + i * (colW + colGap);
    drawTile(x, gridY, colW, rowH, tile.label, tile.value, tile.accent);
  });

  const row2Y = gridY + rowH + rowGap;
  drawTile(gx, row2Y, wideW, rowH, '注册时间', regTime);
  drawTile(gx + wideW + colGap, row2Y, wideW, rowH, '加群时间', joinTime);

  parts.push(
    `<text x="${cx}" y="${cardY + cardH - 18}" text-anchor="middle" font-family="${font}" font-size="11" fill="rgba(255,255,255,0.38)" letter-spacing="2">MK-Bot · 入群欢迎</text>`,
  );

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">${parts.join('\n')}</svg>`;
}

async function roundAvatar(
  sharp: Awaited<ReturnType<typeof loadSharp>>,
  buf: Buffer,
  size: number,
): Promise<Buffer | null> {
  try {
    const mask = Buffer.from(
      `<svg width="${size}" height="${size}"><circle cx="${size / 2}" cy="${size / 2}" r="${size / 2}" fill="white"/></svg>`,
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

export async function renderJoinIdentityWithSharpImpl(
  options: JoinIdentitySharpRenderOptions,
  logger?: MkLoggerResolved,
): Promise<string | null> {
  const width = options.width ?? 1400;
  const height = options.height ?? 850;
  const layout = calcJoinIdentityLayout(width, height);
  const pluginDir = String(options.pluginDir || '').trim();
  const dataPath = String(options.dataPath || '').trim();
  const bgLocalPath = String(options.bgLocalPath || '').trim();

  try {
    const sharp = await loadSharp();
    const composites: { input: Buffer; top: number; left: number }[] = [];

    const bgBuf = await loadJoinIdentityBackground(bgLocalPath, pluginDir, dataPath);
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
        .png()
        .toBuffer();
      composites.push({ input: fallback, top: 0, left: 0 });
      logger?.warn?.('[Sharp渲染] 入群身份背景图不可用，已使用默认底色');
    }

    const customText = loadSharpTextColorFromDataPath(dataPath);
    const svg = buildJoinIdentitySvg(width, height, options, layout, customText);
    const uiLayer = await fitCompositeLayer(sharp, Buffer.from(svg), width, height);
    composites.push({ input: uiLayer, top: 0, left: 0 });

    const avatarUrl = `https://q4.qlogo.cn/g?b=qq&nk=${options.qq || ''}&s=5`;
    try {
      const avatarBuf = await fetchUrlBuffer(avatarUrl, 10000);
      if (avatarBuf.length > 0) {
        const rounded = await roundAvatar(sharp, avatarBuf, layout.avatarSize);
        if (rounded) {
          composites.push({ input: rounded, top: layout.avatarTop, left: layout.avatarLeft });
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
      .png()
      .toBuffer();

    return out.toString('base64');
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    logger?.error?.('[Sharp渲染] 入群身份渲染失败:', msg);
    return null;
  }
}

export async function renderJoinIdentityWithSharp(
  options: Parameters<typeof renderJoinIdentityWithSharpImpl>[0],
  logger?: Parameters<typeof renderJoinIdentityWithSharpImpl>[1],
): Promise<string | null> {
  return runCardSharpJob(
    'join-identity',
    { options },
    () => renderJoinIdentityWithSharpImpl(options, logger),
  );
}
