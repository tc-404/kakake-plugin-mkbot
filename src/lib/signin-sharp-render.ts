// ---------------------------------------------------------------------------
// Sharp 渲染：签到卡片（UI 布局参考 data/默认资源/签到.html）
// ---------------------------------------------------------------------------

import https from 'https';
import http from 'http';
import type { MkLoggerResolved } from '../types';
import { loadSharp } from './sharp-loader';
import { runCardSharpJob } from './sharp-worker-client';

export interface SignInEventTag {
  text: string;
  bonus?: boolean;
}

export interface SignInSharpRenderOptions {
  theme: 'day' | 'night';
  userName: string;
  userId: string | number;
  rankText: string;
  /** true = 已签到大字；false = 显示归笺/诱饵积分 */
  signed?: boolean;
  guiJian?: number;
  yuEr?: number;
  totalDays: string;
  streakText: string;
  events?: SignInEventTag[];
  avatarUrl?: string;
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

function buildSignInSvg(width: number, height: number, opts: SignInSharpRenderOptions): string {
  const isDay = opts.theme === 'day';
  const padX = 20;
  const padTop = 40;
  const radius = 36;
  const font = 'Microsoft YaHei, Noto Sans SC, sans-serif';

  const nameColor = isDay ? '#ff5722' : '#60a5fa';
  const qqColor = isDay ? '#ff9800' : '#93c5fd';
  const statsCardBg = isDay ? 'rgba(255,255,255,0.4)' : 'rgba(30,41,59,0.4)';
  const statsLabel = isDay ? '#ff9800' : '#93c5fd';
  const dividerColor = isDay ? 'rgba(255,152,0,0.15)' : 'rgba(59,130,246,0.15)';

  const parts: string[] = [];

  parts.push(`<defs>
    <clipPath id="cardClip"><rect x="0" y="0" width="${width}" height="${height}" rx="${radius}" ry="${radius}"/></clipPath>
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
    <linearGradient id="statGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      ${
        isDay
          ? '<stop offset="0%" stop-color="#ff9800"/><stop offset="100%" stop-color="#ff5722"/>'
          : '<stop offset="0%" stop-color="#f59e0b"/><stop offset="100%" stop-color="#ea580c"/>'
      }
    </linearGradient>
    <linearGradient id="signedGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      ${
        isDay
          ? '<stop offset="0%" stop-color="#ff9800"/><stop offset="100%" stop-color="#ff5722"/>'
          : '<stop offset="0%" stop-color="#f59e0b"/><stop offset="50%" stop-color="#3b82f6"/><stop offset="100%" stop-color="#06b6d4"/>'
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
          ? '<stop offset="0%" stop-color="#00e5ff"/><stop offset="100%" stop-color="#80deea"/>'
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
    <filter id="blobBlur" x="-50%" y="-50%" width="200%" height="200%">
      <feGaussianBlur stdDeviation="35"/>
    </filter>
  </defs>`);

  parts.push(`<g clip-path="url(#cardClip)">`);
  parts.push(`<rect x="0" y="0" width="${width}" height="${height}" fill="url(#bgGrad)"/>`);

  // 背景装饰球
  if (isDay) {
    parts.push(`<circle cx="620" cy="40" r="160" fill="#ffcc80" opacity="0.55" filter="url(#blobBlur)"/>`);
    parts.push(`<circle cx="60" cy="420" r="140" fill="#90e0ef" opacity="0.5" filter="url(#blobBlur)"/>`);
    parts.push(`<circle cx="180" cy="260" r="110" fill="#b3e5fc" opacity="0.45" filter="url(#blobBlur)"/>`);
  } else {
    parts.push(`<circle cx="620" cy="40" r="160" fill="#3b82f6" opacity="0.45" filter="url(#blobBlur)"/>`);
    parts.push(`<circle cx="60" cy="420" r="140" fill="#f59e0b" opacity="0.4" filter="url(#blobBlur)"/>`);
    parts.push(`<circle cx="180" cy="260" r="110" fill="#06b6d4" opacity="0.35" filter="url(#blobBlur)"/>`);
  }

  const avatarX = padX;
  const avatarY = padTop - 8;
  const avatarSize = 72;
  parts.push(
    `<rect x="${avatarX}" y="${avatarY}" width="${avatarSize}" height="${avatarSize}" rx="20" ry="20" fill="url(#avatarBorder)"/>`,
  );
  parts.push(
    `<rect x="${avatarX + 3}" y="${avatarY + 3}" width="${avatarSize - 6}" height="${avatarSize - 6}" rx="17" ry="17" fill="#ffffff"/>`,
  );

  const textX = avatarX + avatarSize + 12;
  parts.push(
    `<text x="${textX}" y="${avatarY + 30}" font-family="${font}" font-size="26" font-weight="700" fill="${nameColor}">${escapeXml(truncateText(opts.userName, 12))}</text>`,
  );
  parts.push(
    `<text x="${textX}" y="${avatarY + 52}" font-family="${font}" font-size="15" fill="${qqColor}">QQ: ${escapeXml(String(opts.userId))}</text>`,
  );
  parts.push(
    `<text x="${width - padX}" y="${avatarY + 52}" text-anchor="end" font-family="${font}" font-size="50" font-weight="800" fill="url(#rankGrad)">${escapeXml(opts.rankText)}</text>`,
  );

  const centerY = 250;
  if (opts.signed) {
    parts.push(
      `<text x="${width / 2}" y="${centerY}" text-anchor="middle" font-family="${font}" font-size="72" font-weight="900" fill="url(#signedGrad)" letter-spacing="8">已签到</text>`,
    );
  } else {
    const gj = Number(opts.guiJian ?? 0);
    const ye = Number(opts.yuEr ?? 0);
    const gjText = `+${gj}`;
    const yeText = `+${ye}`;
    // 上下式：标签在上、数值在下；单列预留最多 5 位数字（+99999）
    const labelSize = 34;
    const valueSize = 68;
    const labelBaseline = 218;
    const valueBaseline = labelBaseline + 86;
    const leftColX = width * 0.27;
    const rightColX = width * 0.73;
    parts.push(
      `<text x="${leftColX}" y="${labelBaseline}" text-anchor="middle" font-family="${font}" font-size="${labelSize}" font-weight="700" fill="${nameColor}">归笺</text>`,
    );
    parts.push(
      `<text x="${leftColX}" y="${valueBaseline}" text-anchor="middle" font-family="${font}" font-size="${valueSize}" font-weight="900" fill="url(#guiGrad)">${escapeXml(gjText)}</text>`,
    );
    parts.push(
      `<text x="${rightColX}" y="${labelBaseline}" text-anchor="middle" font-family="${font}" font-size="${labelSize}" font-weight="700" fill="${isDay ? '#ff5722' : '#93c5fd'}">诱饵</text>`,
    );
    parts.push(
      `<text x="${rightColX}" y="${valueBaseline}" text-anchor="middle" font-family="${font}" font-size="${valueSize}" font-weight="900" fill="url(#yuGrad)">${escapeXml(yeText)}</text>`,
    );
  }

  const cardY = height - 30 - 148;
  const cardW = width - padX * 2;
  const cardH = 148;
  parts.push(
    `<rect x="${padX}" y="${cardY}" width="${cardW}" height="${cardH}" rx="28" ry="28" fill="${statsCardBg}" stroke="rgba(255,255,255,0.2)" stroke-width="1"/>`,
  );

  const col1 = padX + cardW * 0.25;
  const col2 = padX + cardW * 0.75;
  parts.push(
    `<text x="${col1}" y="${cardY + 36}" text-anchor="middle" font-family="${font}" font-size="16" font-weight="600" fill="${statsLabel}">累计天数</text>`,
  );
  parts.push(
    `<text x="${col1}" y="${cardY + 72}" text-anchor="middle" font-family="${font}" font-size="32" font-weight="900" fill="url(#statGrad)">${escapeXml(opts.totalDays)}</text>`,
  );
  parts.push(
    `<text x="${col2}" y="${cardY + 36}" text-anchor="middle" font-family="${font}" font-size="16" font-weight="600" fill="${statsLabel}">连签次数</text>`,
  );
  parts.push(
    `<text x="${col2}" y="${cardY + 72}" text-anchor="middle" font-family="${font}" font-size="28" font-weight="900" fill="url(#statGrad)">${escapeXml(truncateText(opts.streakText, 14))}</text>`,
  );

  const dividerY = cardY + 92;
  parts.push(
    `<rect x="${padX + 24}" y="${dividerY}" width="${cardW - 48}" height="1" fill="${dividerColor}"/>`,
  );

  const events = Array.isArray(opts.events) ? opts.events.filter((e) => String(e?.text || '').trim()) : [];
  if (events.length > 0) {
    let tagX = padX + 28;
    const tagY = cardY + 112;
    const maxX = padX + cardW - 20;
    for (const ev of events.slice(0, 4)) {
      const text = truncateText(ev.text, 18);
      const tagW = Math.min(220, text.length * 14 + 28);
      if (tagX + tagW > maxX) break;
      const fill = ev.bonus
        ? isDay
          ? 'url(#rankGrad)'
          : 'url(#signedGrad)'
        : isDay
          ? 'rgba(255,152,0,0.15)'
          : 'rgba(59,130,246,0.15)';
      const stroke = ev.bonus ? 'none' : isDay ? 'rgba(255,152,0,0.3)' : 'rgba(59,130,246,0.3)';
      const textFill = ev.bonus ? '#ffffff' : isDay ? '#ff9800' : '#60a5fa';
      parts.push(
        `<rect x="${tagX}" y="${tagY}" width="${tagW}" height="28" rx="14" ry="14" fill="${fill}" stroke="${stroke}" stroke-width="1"/>`,
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

async function roundAvatar(sharp: Awaited<ReturnType<typeof loadSharp>>, buf: Buffer, size: number): Promise<Buffer | null> {
  try {
    const mask = Buffer.from(
      `<svg width="${size}" height="${size}"><rect x="0" y="0" width="${size}" height="${size}" rx="16" ry="16" fill="white"/></svg>`,
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

/**
 * 使用 Sharp 渲染签到卡片，返回 base64（不含 base64:// 前缀）
 */
export async function renderSignInWithSharpImpl(
  options: SignInSharpRenderOptions,
  logger?: MkLoggerResolved,
): Promise<string | null> {
  const width = options.width ?? 720;
  const height = options.height ?? 520;

  try {
    const sharp = await loadSharp();
    const svg = buildSignInSvg(width, height, options);
    const uiLayer = await sharp(Buffer.from(svg)).png().toBuffer();

    const composites: { input: Buffer; top: number; left: number }[] = [
      { input: uiLayer, top: 0, left: 0 },
    ];

    const avatarUrl =
      String(options.avatarUrl || '').trim() ||
      `https://q4.qlogo.cn/g?b=qq&nk=${options.userId}&s=5`;
    try {
      const avatarBuf = await fetchUrlBuffer(avatarUrl, 10000);
      if (avatarBuf.length > 0) {
        const rounded = await roundAvatar(sharp, avatarBuf, 66);
        if (rounded) {
          composites.push({ input: rounded, top: 32, left: 23 });
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
        background: { r: 0, g: 0, b: 0, alpha: 0 },
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
