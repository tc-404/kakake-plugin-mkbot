// ---------------------------------------------------------------------------
// Sharp 渲染：接口功能菜单图片（布局对齐主导航菜单 sharp-render）
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
import { renderMenuIconForSharp } from './menu-icons';
import {
  API_INTERFACE_MENU_FOOTER,
  API_INTERFACE_MENU_SECTIONS,
  type ApiInterfaceMenuItem,
  type ApiInterfaceMenuSection,
} from './api-interface-menu';

export interface ApiInterfaceMenuSharpOptions {
  width?: number;
  pluginDir?: string;
  dataPath?: string;
  bgLocalPath?: string;
}

const TAG_COLORS: Record<string, { bg: string; stroke: string; text: string }> = {
  GIF: { bg: 'rgba(255,138,101,0.22)', stroke: 'rgba(255,138,101,0.55)', text: '#ffc9b8' },
  PNG: { bg: 'rgba(129,212,250,0.2)', stroke: 'rgba(129,212,250,0.5)', text: '#c8ecff' },
  静态: { bg: 'rgba(186,255,168,0.18)', stroke: 'rgba(186,255,168,0.45)', text: '#d9ffd0' },
  '@': { bg: 'rgba(255,213,79,0.2)', stroke: 'rgba(255,213,79,0.5)', text: '#ffe9a8' },
};

function escapeXml(text: string): string {
  return String(text ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function wrapText(text: string, maxChars: number, maxLines = 2): string[] {
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

function fetchUrlBuffer(url: string, timeoutMs = 15000): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith('https') ? https : http;
    const req = lib.get(
      url,
      { timeout: timeoutMs, headers: { 'User-Agent': 'MKbot-ApiMenuSharp/1.0' } },
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

async function loadBackgroundBuffer(options: ApiInterfaceMenuSharpOptions): Promise<Buffer | null> {
  const candidates: string[] = [];
  const push = (v?: string) => {
    const s = String(v || '').trim();
    if (s && !candidates.includes(s)) candidates.push(s);
  };

  push(options.bgLocalPath);

  const roots = [
    path.join(String(options.dataPath || '').trim(), '默认资源', 'image'),
    path.join(String(options.pluginDir || '').trim(), 'data', '默认资源', 'image'),
  ];
  for (const root of roots) {
    if (!root.trim()) continue;
    for (const name of ['heng.jpg', 'heng.jpeg', 'heng.png', 'heng.webp']) {
      push(path.join(root, name));
    }
  }

  for (const src of candidates) {
    try {
      if (/^file:\/\//i.test(src)) {
        const abs = fileURLToPath(src);
        if (fs.existsSync(abs)) return fs.readFileSync(abs);
        continue;
      }
      if (/^https?:\/\//i.test(src)) {
        const buf = await fetchUrlBuffer(src, 20000);
        if (buf.length > 0) return buf;
        continue;
      }
      const abs = path.isAbsolute(src) ? src : path.resolve(src);
      if (fs.existsSync(abs)) return fs.readFileSync(abs);
    } catch {
      /* try next */
    }
  }
  return null;
}

function calcSectionGrid(section: ApiInterfaceMenuSection, cols: number, rowH: number): number {
  const rows = Math.ceil(section.items.length / cols);
  return 42 + rows * rowH + 10;
}

function calcMenuHeight(width: number, cols: number, rowH: number): number {
  const padY = 36;
  const titleBlock = 86;
  const sectionGap = 16;
  const footerH = 40;
  let body = 0;
  for (const section of API_INTERFACE_MENU_SECTIONS) {
    body += calcSectionGrid(section, cols, rowH) + sectionGap;
  }
  return padY + titleBlock + body + footerH + padY;
}

function renderTagPill(x: number, y: number, tag: string): string {
  const colors = TAG_COLORS[tag] || TAG_COLORS.GIF;
  const w = tag.length <= 2 ? 34 : 44;
  return [
    `<rect x="${x}" y="${y}" width="${w}" height="18" rx="9" fill="${colors.bg}" stroke="${colors.stroke}" stroke-width="1"/>`,
    `<text x="${x + w / 2}" y="${y + 13}" text-anchor="middle" font-family="Microsoft YaHei, Noto Sans SC, sans-serif" font-size="10" font-weight="700" fill="${colors.text}">${escapeXml(tag)}</text>`,
  ].join('');
}

function buildApiInterfaceMenuSvg(width: number, height: number, customText: string | null): string {
  const titleColor = resolveSharpTextFill(customText, '#fff3dc');
  const labelColor = resolveSharpTextFill(customText, 'rgba(255,255,255,0.88)');
  const groupBg = 'rgba(0,0,0,0.14)';
  const groupColor = resolveSharpTextFill(customText, '#fff3dc');
  const boxBg = 'rgba(255,255,255,0.05)';
  const boxBorder = 'rgba(255,255,255,0.38)';
  const cellBg = 'transparent';
  const cellAltBg = 'rgba(255,255,255,0.025)';
  const itemTitle = resolveSharpTextFill(customText, '#fff6e8');
  const itemDesc = 'rgba(255,255,255,0.82)';
  const iconBg = 'rgba(255,255,255,0.1)';
  const iconBorder = 'rgba(255,255,255,0.42)';
  const iconStroke = resolveSharpTextFill(customText, '#fff6e8');
  const footerColor = 'rgba(238,238,238,0.35)';

  const padX = 24;
  const contentW = width - padX * 2;
  const cols = width >= 900 ? 3 : width >= 620 ? 2 : 1;
  const colW = contentW / cols;
  const rowH = cols === 3 ? 78 : cols === 2 ? 82 : 72;
  const iconSize = 30;

  const parts: string[] = [];
  let y = 40;

  parts.push(
    `<text x="${width / 2}" y="${y}" text-anchor="middle" font-family="Microsoft YaHei, Noto Sans SC, sans-serif" font-size="42" font-weight="800" fill="${titleColor}">接口功能</text>`,
  );
  y += 36;
  parts.push(
    `<text x="${width / 2}" y="${y}" text-anchor="middle" font-family="Microsoft YaHei, Noto Sans SC, sans-serif" font-size="15" fill="${labelColor}">MK-Bot · 第三方 API 与表情包指令</text>`,
  );
  y += 34;

  const renderGridSection = (groupTitle: string, items: ApiInterfaceMenuItem[]) => {
    const rows = Math.ceil(items.length / cols);
    const groupH = 42 + rows * rowH + 10;
    const boxX = padX;
    const boxY = y;

    parts.push(
      `<rect x="${boxX}" y="${boxY}" width="${contentW}" height="${groupH}" rx="18" ry="18" fill="${boxBg}" stroke="${boxBorder}" stroke-width="1"/>`,
    );
    parts.push(
      `<rect x="${boxX}" y="${boxY}" width="${contentW}" height="38" rx="18" ry="18" fill="${groupBg}"/>`,
    );
    parts.push(
      `<text x="${boxX + 18}" y="${boxY + 26}" font-family="Microsoft YaHei, Noto Sans SC, sans-serif" font-size="16" font-weight="700" fill="${groupColor}">${escapeXml(groupTitle)}</text>`,
    );

    const gridTop = boxY + 42;
    items.forEach((item, idx) => {
      const col = idx % cols;
      const row = Math.floor(idx / cols);
      const cx = boxX + col * colW;
      const cy = gridTop + row * rowH;
      const alt = row % 2 === 1;

      parts.push(
        `<rect x="${cx + 1}" y="${cy + 1}" width="${colW - 2}" height="${rowH - 2}" fill="${alt ? cellAltBg : cellBg}" stroke="rgba(255,255,255,0.12)" stroke-width="1"/>`,
      );

      const ix = cx + 12;
      const iy = cy + 14;
      parts.push(
        `<rect x="${ix}" y="${iy}" width="${iconSize}" height="${iconSize}" rx="8" fill="${iconBg}" stroke="${iconBorder}" stroke-width="1"/>`,
      );
      if (item.icon) {
        parts.push(renderMenuIconForSharp(item.icon, ix, iy, iconSize, iconStroke));
      }

      const tx = ix + iconSize + 10;
      const titleLines = wrapText(item.name, cols === 1 ? 24 : cols === 2 ? 14 : 10, 1);
      parts.push(
        `<text x="${tx}" y="${iy + 16}" font-family="Microsoft YaHei, Noto Sans SC, sans-serif" font-size="14" font-weight="700" fill="${itemTitle}">${escapeXml(titleLines[0])}</text>`,
      );

      if (item.tag) {
        parts.push(renderTagPill(cx + colW - 48, cy + 10, item.tag));
      }

      const descSource = item.note || (item.tag ? '' : '');
      if (descSource) {
        const descLines = wrapText(descSource, cols === 1 ? 28 : cols === 2 ? 16 : 12, 2);
        descLines.forEach((line, li) => {
          parts.push(
            `<text x="${tx}" y="${iy + 34 + li * 15}" font-family="Microsoft YaHei, Noto Sans SC, sans-serif" font-size="11" fill="${itemDesc}">${escapeXml(line)}</text>`,
          );
        });
      } else if (!item.tag && cols >= 2) {
        parts.push(
          `<text x="${tx}" y="${iy + 34}" font-family="Microsoft YaHei, Noto Sans SC, sans-serif" font-size="11" fill="${itemDesc}">发送指令即可使用</text>`,
        );
      }
    });

    y += groupH + 16;
  };

  for (const section of API_INTERFACE_MENU_SECTIONS) {
    renderGridSection(section.title, section.items);
  }

  parts.push(
    `<text x="${width / 2}" y="${height - 18}" text-anchor="middle" font-family="Microsoft YaHei, Noto Sans SC, sans-serif" font-size="11" fill="${footerColor}" letter-spacing="1">${escapeXml(API_INTERFACE_MENU_FOOTER)}</text>`,
  );

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
  <defs>
    <linearGradient id="topFade" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="rgba(0,0,0,0.1)"/>
      <stop offset="100%" stop-color="rgba(0,0,0,0)"/>
    </linearGradient>
  </defs>
  ${parts.join('\n  ')}
  <rect x="0" y="0" width="${width}" height="180" fill="url(#topFade)"/>
</svg>`;
}

async function fitCompositeLayer(
  sharp: Awaited<ReturnType<typeof loadSharp>>,
  input: Buffer,
  width: number,
  height: number,
): Promise<Buffer> {
  return sharp(input).resize(width, height, { fit: 'fill' }).ensureAlpha().png().toBuffer();
}

/**
 * 使用 Sharp 渲染接口功能菜单，返回 base64（不含 base64:// 前缀）
 */
export async function renderApiInterfaceMenuWithSharpImpl(
  options: ApiInterfaceMenuSharpOptions = {},
  logger?: MkLoggerResolved,
): Promise<string | null> {
  const width = options.width ?? 1080;
  const cols = width >= 900 ? 3 : width >= 620 ? 2 : 1;
  const rowH = cols === 3 ? 78 : cols === 2 ? 82 : 72;
  const height = calcMenuHeight(width, cols, rowH);
  const dataPath = String(options.dataPath || '').trim();

  try {
    const sharp = await loadSharp();
    const composites: { input: Buffer; top?: number; left?: number }[] = [];

    const bgBuf = await loadBackgroundBuffer(options);
    if (bgBuf && bgBuf.length > 0) {
      await applySharpPhotoBackgroundLayers(sharp, composites, bgBuf, width, height, dataPath);
    }

    const customText = loadSharpTextColorFromDataPath(dataPath);
    const svg = buildApiInterfaceMenuSvg(width, height, customText);
    const uiLayer = await fitCompositeLayer(sharp, Buffer.from(svg), width, height);
    composites.push({ input: uiLayer, top: 0, left: 0 });

    let canvas = sharp({
      create: {
        width,
        height,
        channels: 4,
        background: { r: 15, g: 25, b: 35, alpha: 1 },
      },
    });

    if (composites.length > 0) {
      canvas = canvas.composite(composites);
    }

    const out = await canvas.png().toBuffer();
    return out.toString('base64');
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    logger?.error?.('[Sharp渲染] 接口功能菜单渲染失败:', msg);
    return null;
  }
}

export async function renderApiInterfaceMenuWithSharp(
  options: Parameters<typeof renderApiInterfaceMenuWithSharpImpl>[0],
  logger?: Parameters<typeof renderApiInterfaceMenuWithSharpImpl>[1],
): Promise<string | null> {
  return runCardSharpJob(
    'api-menu',
    { options },
    () => renderApiInterfaceMenuWithSharpImpl(options, logger),
  );
}
