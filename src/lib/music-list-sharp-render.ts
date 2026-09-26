// ---------------------------------------------------------------------------
// Sharp 渲染：点歌搜索列表（序号 → 封面 → 歌名/歌手）
// 拉封面 / 机器人头像 / Sharp 合成均在 Impl 内（由 Worker 调用），不占主进程。
// ---------------------------------------------------------------------------

import fs from 'fs';
import path from 'path';
import type { MkLoggerResolved } from '../types';
import { fetchQqAvatarBuffer, fetchUrlImageBuffer } from './api/bqb-shared';
import { loadSharp } from './sharp-loader';
import { runCardSharpJob } from './sharp-worker-client';
import { applySharpPhotoBackgroundLayers } from './sharp-bg-effects';
import { loadSharpTextColorFromDataPath, resolveSharpTextFill } from './sharp-text-color';

export const MUSIC_LIST_MAX_ITEMS = 20;

export interface MusicListSharpItem {
  index: number;
  title: string;
  artist: string;
  coverUrl?: string;
}

export interface MusicListSharpRenderOptions {
  source: string;
  query?: string;
  botSelfId?: string | number;
  items: MusicListSharpItem[];
  bgLocalPath?: string;
  pluginDir?: string;
  dataPath?: string;
  width?: number;
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

async function loadMusicListBackground(
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
  const roots = [
    path.join(String(pluginDir || '').trim(), '默认资源', 'image'),
    path.join(String(dataPath || '').trim(), '默认资源', 'image'),
  ];
  for (const root of roots) {
    if (!root.trim()) continue;
    push(path.join(root, '运势6.png'));
  }

  for (const src of candidates) {
    try {
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

async function roundCover(
  sharp: Awaited<ReturnType<typeof loadSharp>>,
  buf: Buffer,
  size: number,
): Promise<Buffer | null> {
  try {
    const mask = Buffer.from(
      `<svg width="${size}" height="${size}"><rect x="0" y="0" width="${size}" height="${size}" rx="12" ry="12" fill="white"/></svg>`,
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

async function makeFallbackCover(
  sharp: Awaited<ReturnType<typeof loadSharp>>,
  size: number,
): Promise<Buffer> {
  return sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      background: { r: 80, g: 90, b: 110, alpha: 0.85 },
    },
  })
    .png()
    .toBuffer();
}

function buildMusicListSvg(
  width: number,
  height: number,
  opts: {
    source: string;
    query: string;
    count: number;
    items: MusicListSharpItem[];
    rowH: number;
    coverSize: number;
    padX: number;
    headerH: number;
    customText: string | null;
  },
): string {
  const font = 'Microsoft YaHei, Noto Sans SC, sans-serif';
  const { source, query, count, items, rowH, coverSize, padX, headerH, customText } = opts;
  const titleFill = resolveSharpTextFill(customText, '#fff6e8');
  const subFill = resolveSharpTextFill(customText, 'rgba(255,255,255,0.88)');
  const idxFill = resolveSharpTextFill(customText, '#fff3dc');
  const mainFill = resolveSharpTextFill(customText, '#fff8ee');
  const parts: string[] = [];

  parts.push(
    `<text x="${width / 2}" y="48" text-anchor="middle" font-family="${font}" font-size="36" font-weight="800" fill="${titleFill}">点歌列表</text>`,
  );
  parts.push(
    `<text x="${width / 2}" y="78" text-anchor="middle" font-family="${font}" font-size="16" fill="${subFill}">【${escapeXml(source)}】共 ${count} 首${query ? ` · ${escapeXml(truncateText(query, 18))}` : ''}</text>`,
  );

  const listTop = headerH;
  const listLeft = padX;
  const listW = width - padX * 2;
  const listH = items.length * rowH + 16;
  parts.push(
    `<rect x="${listLeft}" y="${listTop}" width="${listW}" height="${listH}" rx="20" ry="20" fill="rgba(0,0,0,0.28)" stroke="rgba(255,255,255,0.22)" stroke-width="1"/>`,
  );

  items.forEach((item, i) => {
    const y = listTop + 8 + i * rowH;
    const alt = i % 2 === 1;
    parts.push(
      `<rect x="${listLeft + 4}" y="${y}" width="${listW - 8}" height="${rowH - 4}" rx="12" ry="12" fill="${alt ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.04)'}"/>`,
    );

    const idxX = listLeft + 28;
    const idxY = y + rowH / 2 + 6;
    parts.push(
      `<text x="${idxX}" y="${idxY}" text-anchor="middle" font-family="${font}" font-size="22" font-weight="800" fill="${idxFill}">${escapeXml(String(item.index))}</text>`,
    );

    // 封面由 composite 叠加；此处为文字区
    const textX = listLeft + 28 + 28 + coverSize + 16;
    const title = truncateText(item.title || '未知歌名', 22);
    const artist = truncateText(item.artist || '未知歌手', 26);
    parts.push(
      `<text x="${textX}" y="${y + 34}" font-family="${font}" font-size="20" font-weight="700" fill="${mainFill}">${escapeXml(title)}</text>`,
    );
    parts.push(
      `<text x="${textX}" y="${y + 60}" font-family="${font}" font-size="14" fill="rgba(255,255,255,0.78)">${escapeXml(artist)}</text>`,
    );
  });

  parts.push(
    `<text x="${width / 2}" y="${height - 22}" text-anchor="middle" font-family="${font}" font-size="13" fill="rgba(255,255,255,0.55)">发送「选歌N」/「卡片选歌N」/「语音选歌N」/「链接选歌N」</text>`,
  );

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">${parts.join('\n')}</svg>`;
}

/**
 * Worker / 进程内 Impl：拉封面与机器人头像、Sharp 合成，返回 base64（无前缀）
 */
export async function renderMusicListWithSharpImpl(
  options: MusicListSharpRenderOptions,
  logger?: MkLoggerResolved,
): Promise<string | null> {
  const rawItems = Array.isArray(options.items) ? options.items : [];
  const items = rawItems.slice(0, MUSIC_LIST_MAX_ITEMS).map((it, i) => ({
    index: Number(it.index) || i + 1,
    title: String(it.title || '').trim(),
    artist: String(it.artist || '').trim(),
    coverUrl: String(it.coverUrl || '').trim(),
  }));
  if (!items.length) return null;

  const width = options.width ?? 900;
  const rowH = 88;
  const coverSize = 64;
  const padX = 28;
  const headerH = 100;
  const footerH = 52;
  const height = Math.max(360, headerH + items.length * rowH + 24 + footerH);

  const pluginDir = String(options.pluginDir || '').trim();
  const dataPath = String(options.dataPath || '').trim();
  const bgLocalPath = String(options.bgLocalPath || '').trim();
  const source = String(options.source || '网易云').trim() || '网易云';
  const query = String(options.query || '').trim();
  const botSelfId = options.botSelfId;

  try {
    const sharp = await loadSharp();

    // 兜底头像：先拉一次机器人头像
    let botAvatarBuf: Buffer | null = null;
    try {
      botAvatarBuf = await fetchQqAvatarBuffer(botSelfId ?? '');
    } catch {
      botAvatarBuf = null;
    }

    // 并发拉封面（均在 Worker/Impl 内）
    const coverBufs = await Promise.all(
      items.map(async (it) => {
        if (it.coverUrl) {
          const buf = await fetchUrlImageBuffer(it.coverUrl);
          if (buf && buf.length > 32) return buf;
        }
        if (botAvatarBuf && botAvatarBuf.length > 32) return botAvatarBuf;
        return null;
      }),
    );

    const composites: { input: Buffer; top?: number; left?: number }[] = [];

    const bgBuf = await loadMusicListBackground(bgLocalPath, pluginDir, dataPath);
    if (bgBuf && bgBuf.length > 0) {
      await applySharpPhotoBackgroundLayers(sharp, composites, bgBuf, width, height, dataPath);
    } else {
      const fallback = await sharp({
        create: {
          width,
          height,
          channels: 4,
          background: { r: 28, g: 36, b: 52, alpha: 1 },
        },
      })
        .png()
        .toBuffer();
      composites.push({ input: fallback, top: 0, left: 0 });
    }

    const customText = loadSharpTextColorFromDataPath(dataPath);
    const svg = buildMusicListSvg(width, height, {
      source,
      query,
      count: items.length,
      items,
      rowH,
      coverSize,
      padX,
      headerH,
      customText,
    });
    const uiLayer = await sharp(Buffer.from(svg)).ensureAlpha().png().toBuffer();
    composites.push({ input: uiLayer, top: 0, left: 0 });

    const listTop = headerH;
    const listLeft = padX;
    const coverLeft = listLeft + 28 + 28;
    const solidFallback = await makeFallbackCover(sharp, coverSize);

    for (let i = 0; i < items.length; i++) {
      const y = listTop + 8 + i * rowH;
      const coverTop = Math.round(y + (rowH - 4 - coverSize) / 2);
      let raw = coverBufs[i];
      if (!raw || raw.length < 32) raw = botAvatarBuf;
      let rounded: Buffer | null = null;
      if (raw && raw.length >= 32) {
        rounded = await roundCover(sharp, raw, coverSize);
      }
      composites.push({
        input: rounded || solidFallback,
        top: Math.max(0, coverTop),
        left: coverLeft,
      });
    }

    const out = await sharp({
      create: {
        width,
        height,
        channels: 4,
        background: { r: 15, g: 25, b: 35, alpha: 1 },
      },
    })
      .composite(composites)
      .png()
      .toBuffer();

    return out.toString('base64');
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    logger?.error?.('[Sharp渲染] 点歌列表渲染失败:', msg);
    return null;
  }
}

export async function renderMusicListWithSharp(
  options: MusicListSharpRenderOptions,
  logger?: MkLoggerResolved,
): Promise<string | null> {
  return runCardSharpJob(
    'music-list',
    { options },
    () => renderMusicListWithSharpImpl(options, logger),
  );
}
