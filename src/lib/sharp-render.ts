// ---------------------------------------------------------------------------
// Sharp 渲染：菜单图片（UI 布局参考 data/默认资源/导航菜单.html）
// ---------------------------------------------------------------------------

import fs from 'fs';
import https from 'https';
import http from 'http';
import path from 'path';
import { pathToFileURL, fileURLToPath } from 'url';
import type { MkLoggerResolved } from '../types';
import {
  MENU_BASIC_ITEMS,
  MENU_ENT_ITEMS,
  type MenuItemDef,
  renderMenuIconForSharp,
} from './menu-icons';
import {
  loadSharp,
  probeSharpAvailable,
  resetSharpModuleCache,
} from './sharp-loader';
import { runCardSharpJob } from './sharp-worker-client';
import { applySharpPhotoBackgroundLayers } from './sharp-bg-effects';
import { loadSharpTextColorFromDataPath, resolveSharpTextFill } from './sharp-text-color';

export { probeSharpAvailable, resetSharpModuleCache };

export interface MenuSharpRenderOptions {
  uiTheme?: string;
  bgUrl?: string;
  bgLandscape?: string;
  bgPortrait?: string;
  bgLocalPath?: string;
  bgLocalPortraitPath?: string;
  width?: number;
  height?: number;
}

type MenuItem = MenuItemDef;

function escapeXml(text: string): string {
  return String(text ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function wrapText(text: string, maxChars: number): string[] {
  const s = String(text || '').trim();
  if (!s) return [''];
  const lines: string[] = [];
  let cur = '';
  for (const ch of s) {
    if (cur.length >= maxChars) {
      lines.push(cur);
      cur = '';
    }
    cur += ch;
  }
  if (cur) lines.push(cur);
  return lines.slice(0, 3);
}

function fetchUrlBuffer(url: string, timeoutMs = 15000): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const lib = u.protocol === 'https:' ? https : http;
    const req = lib.get(
      url,
      { timeout: timeoutMs, headers: { 'User-Agent': 'MKbot-SharpRender/1.0' } },
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
    req.on('timeout', () => {
      req.destroy(new Error('timeout'));
    });
  });
}

async function loadBackgroundSource(
  options: MenuSharpRenderOptions,
  pluginDir: string,
  dataPath: string,
): Promise<Buffer | null> {
  const width = options.width ?? 1680;
  const height = options.height ?? 1010;
  const landscape = width >= height;
  const candidates: string[] = [];

  const push = (v?: string) => {
    const s = String(v || '').trim();
    if (s && !candidates.includes(s)) candidates.push(s);
  };

  if (landscape) {
    push(options.bgLocalPath);
  } else {
    push(options.bgLocalPortraitPath);
    push(options.bgLocalPath);
  }

  const localNames = landscape
    ? ['heng.jpg', 'heng.jpeg', 'heng.png', 'heng.webp']
    : ['shu.jpg', 'shu.jpeg', 'shu.png', 'shu.webp', 'heng.jpg'];

  const roots = [
    path.join(String(pluginDir || '').trim(), '默认资源', 'image'),
  ];

  for (const root of roots) {
    if (!String(root || '').trim()) continue;
    for (const name of localNames) {
      push(path.join(root, name));
    }
  }

  push(options.bgUrl);
  push(landscape ? options.bgLandscape : options.bgPortrait);
  push(options.bgLandscape);
  push(options.bgPortrait);

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
      if (fs.existsSync(abs)) {
        return fs.readFileSync(abs);
      }
    } catch (_e) {
      /* try next */
    }
  }
  return null;
}

function buildMenuSvg(width: number, height: number, theme: 'clear' | 'light', customText: string | null): string {
  const isLight = theme === 'light';
  const titleColor = resolveSharpTextFill(customText, isLight ? '#3a2f1c' : '#fff3dc');
  const labelColor = resolveSharpTextFill(customText, isLight ? 'rgba(42,36,24,0.78)' : 'rgba(255,255,255,0.88)');
  const groupBg = isLight ? 'rgba(255,255,255,0.22)' : 'rgba(0,0,0,0.14)';
  const groupColor = resolveSharpTextFill(customText, isLight ? '#3a2f1c' : '#fff3dc');
  const boxBg = isLight ? 'rgba(255,255,255,0.16)' : 'rgba(255,255,255,0.05)';
  const boxBorder = isLight ? 'rgba(255,255,255,0.45)' : 'rgba(255,255,255,0.38)';
  const cellBg = isLight ? 'rgba(255,255,255,0.12)' : 'transparent';
  const cellAltBg = isLight ? 'rgba(255,255,255,0.18)' : 'rgba(255,255,255,0.025)';
  const itemTitle = resolveSharpTextFill(customText, isLight ? '#2f2718' : '#fff6e8');
  const itemDesc = isLight ? 'rgba(42,36,24,0.78)' : 'rgba(255,255,255,0.92)';
  const iconBg = isLight ? 'rgba(255,255,255,0.38)' : 'rgba(255,255,255,0.1)';
  const iconBorder = isLight ? 'rgba(255,255,255,0.72)' : 'rgba(255,255,255,0.42)';
  const iconStroke = resolveSharpTextFill(customText, isLight ? '#6b5434' : '#fff6e8');
  const footerColor = 'rgba(238,238,238,0.35)';

  const padX = 20;
  const contentW = width - padX * 2;
  const cols = width >= 560 ? 3 : width >= 380 ? 2 : 1;
  const colW = contentW / cols;
  const rowH = 88;
  const iconSize = 32;

  let y = 56;
  const parts: string[] = [];

  parts.push(
    `<text x="${width / 2}" y="${y}" text-anchor="middle" font-family="Microsoft YaHei, Noto Sans SC, sans-serif" font-size="46" font-weight="800" fill="${titleColor}">使用帮助</text>`,
  );
  y += 38;
  parts.push(
    `<text x="${width / 2}" y="${y}" text-anchor="middle" font-family="Microsoft YaHei, Noto Sans SC, sans-serif" font-size="16" fill="${labelColor}">MK-Bot · NapCat 综合娱乐与群管</text>`,
  );
  y += 28;

  const renderSection = (groupTitle: string, items: MenuItem[]) => {
    const rows = Math.ceil(items.length / cols);
    const groupH = 42 + rows * rowH + 8;
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
        `<rect x="${cx + 1}" y="${cy + 1}" width="${colW - 2}" height="${rowH - 2}" fill="${alt ? cellAltBg : cellBg}" stroke="${isLight ? 'rgba(255,255,255,0.28)' : 'rgba(255,255,255,0.12)'}" stroke-width="1"/>`,
      );
      const ix = cx + 10;
      const iy = cy + 12;
      parts.push(
        `<rect x="${ix}" y="${iy}" width="${iconSize}" height="${iconSize}" rx="7" fill="${iconBg}" stroke="${iconBorder}" stroke-width="1"/>`,
      );
      parts.push(renderMenuIconForSharp(item.icon, ix, iy, iconSize, iconStroke));
      const tx = ix + iconSize + 10;
      parts.push(
        `<text x="${tx}" y="${iy + 16}" font-family="Microsoft YaHei, Noto Sans SC, sans-serif" font-size="14" font-weight="700" fill="${itemTitle}">${escapeXml(item.title)}</text>`,
      );
      const descLines = wrapText(item.desc, cols === 1 ? 28 : cols === 2 ? 18 : 14);
      descLines.forEach((line, li) => {
        parts.push(
          `<text x="${tx}" y="${iy + 34 + li * 16}" font-family="Microsoft YaHei, Noto Sans SC, sans-serif" font-size="11" fill="${itemDesc}">${escapeXml(line)}</text>`,
        );
      });
    });

    y += groupH + 14;
  };

  renderSection('基础功能', MENU_BASIC_ITEMS);
  renderSection('娱乐功能', MENU_ENT_ITEMS);

  parts.push(
    `<text x="${width / 2}" y="${height - 18}" text-anchor="middle" font-family="Microsoft YaHei, Noto Sans SC, sans-serif" font-size="11" fill="${footerColor}" letter-spacing="2">发送「菜单」或「/MK」查看本帮助</text>`,
  );

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
  <defs>
    <linearGradient id="topFade" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="rgba(0,0,0,0.08)"/>
      <stop offset="100%" stop-color="rgba(0,0,0,0)"/>
    </linearGradient>
  </defs>
  ${parts.join('\n  ')}
  <rect x="0" y="0" width="${width}" height="220" fill="url(#topFade)"/>
</svg>`;
}

/** composite 要求图层不大于底图，且尺寸一致；统一规范化 */
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
 * 使用 Sharp 渲染导航菜单，返回 base64 字符串（不含 base64:// 前缀）
 */
export async function renderMenuWithSharpImpl(
  pluginDir: string,
  dataPath: string,
  options: MenuSharpRenderOptions,
  logger?: MkLoggerResolved,
): Promise<string | null> {
  const width = options.width ?? 1680;
  const height = options.height ?? 1010;
  const theme = String(options.uiTheme || '0').trim() === '1' ? 'light' : 'clear';

  try {
    const sharp = await loadSharp();
    const bgBuf = await loadBackgroundSource(options, pluginDir, dataPath);

    const composites: { input: Buffer; top?: number; left?: number }[] = [];

    if (bgBuf && bgBuf.length > 0) {
      await applySharpPhotoBackgroundLayers(sharp, composites, bgBuf, width, height, dataPath);
    }

    const customText = loadSharpTextColorFromDataPath(dataPath);
    const svg = buildMenuSvg(width, height, theme, customText);
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
    logger?.error?.('[Sharp渲染] 菜单渲染失败:', msg);
    return null;
  }
}

export async function renderMenuWithSharp(
  pluginDir: string,
  dataPath: string,
  options: MenuSharpRenderOptions,
  logger?: MkLoggerResolved,
): Promise<string | null> {
  return runCardSharpJob(
    'menu',
    { pluginDir, dataPath, options },
    () => renderMenuWithSharpImpl(pluginDir, dataPath, options, logger),
  );
}
