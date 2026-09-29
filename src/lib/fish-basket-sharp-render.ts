// ---------------------------------------------------------------------------
// Sharp 渲染：我的鱼篓 — 三列 · 类/条分层 · 从重到轻（每页 100 条，最多 10 页）
// ---------------------------------------------------------------------------

import fs from 'fs';
import path from 'path';
import type { MkLoggerResolved } from '../types';
import { loadSharp } from './sharp-loader';
import { runCardSharpJob } from './sharp-worker-client';
import { applySharpPhotoBackgroundLayers } from './sharp-bg-effects';
import { loadSharpTextColorFromDataPath, resolveSharpTextFill } from './sharp-text-color';

/** 每张图最多规格记录数 */
export const FISH_BASKET_PER_PAGE = 100;
/** 最多渲染张数 */
export const FISH_BASKET_MAX_PAGES = 10;
/** 合计最多展示规格数（供调用方截断） */
export const FISH_BASKET_MAX_ROWS = FISH_BASKET_PER_PAGE * FISH_BASKET_MAX_PAGES;

const COLUMN_COUNT = 3;



export interface FishBasketItem {

  name: string;

  weight: number;

  count: number;

  unitPrice: number;

  totalPrice: number;

  tier: 'normal' | 'premium';

}



export interface FishBasketSharpRenderOptions {
  /** 基础货币展示名；缺省回退「归笺」 */
  货币名?: string;

  userName?: string;

  userId: string | number;

  time?: string;

  totalCount: number;

  totalValue: string;

  /** 规格记录数（条） */

  recordCount: number;

  /** 鱼种类数（类） */

  categoryCount: number;

  items: FishBasketItem[];

  width?: number;

  /** 当前页（从 1 起） */
  pageIndex?: number;

  /** 总页数 */
  pageTotal?: number;

  /** 本页排名起始偏移（全局序号 = offset + 页内 rank） */
  rankOffset?: number;

  pluginDir?: string;

  dataPath?: string;

  bgLocalPath?: string;

}



type RenderLine =

  | { type: 'tier'; tier: 'premium' | 'normal' }

  | { type: 'category'; name: string; tier: 'normal' | 'premium'; subCount: number; subTotal: number; rows: { item: FishBasketItem; rank: number }[] };



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



function formatWeight(w: number): string {

  const n = Number(w);

  if (!Number.isFinite(n)) return '0kg';

  const s = n.toFixed(3).replace(/\.?0+$/, '');

  return `${s}kg`;

}



async function loadFishBasketBackground(
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

  const localNames = ['运势13.png', '运势13.jpg', '运势13.jpeg', '运势13.webp'];
  const roots = [
    path.join(String(pluginDir || '').trim(), '默认资源', 'image'),
    path.join(String(dataPath || '').trim(), '默认资源', 'image'),
  ];
  for (const root of roots) {
    if (!String(root || '').trim()) continue;
    for (const name of localNames) {
      push(path.join(root, name));
    }
  }

  for (const src of candidates) {
    try {
      if (fs.existsSync(src) && fs.statSync(src).isFile()) {
        return fs.readFileSync(src);
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



/** 单页固定可读密度（不再随总量缩小字号） */
function pickDensity(_recordCount?: number) {
  return { width: 2100, rowH: 28, categoryH: 32, tierH: 36, colHeadH: 30, nameSize: 14, cellSize: 13, colGap: 18 };
}



/**

 * 类（鱼种）按组内最重一条从重到轻；条（规格）在类内也从重到轻。

 */

export function buildFishBasketRenderLines(items: FishBasketItem[], rankOffset = 0): RenderLine[] {

  const capped = items.slice(0, FISH_BASKET_PER_PAGE);

  const groupMap = new Map<string, FishBasketItem[]>();

  for (const item of capped) {

    const list = groupMap.get(item.name) || [];

    list.push(item);

    groupMap.set(item.name, list);

  }



  const groups = [...groupMap.entries()]

    .map(([name, rows]) => {

      const sortedRows = [...rows].sort((a, b) => b.weight - a.weight || b.count - a.count);

      const subCount = sortedRows.reduce((s, r) => s + r.count, 0);

      const subTotal = sortedRows.reduce((s, r) => s + r.totalPrice, 0);

      return {

        name,

        tier: sortedRows.some((r) => r.tier === 'premium') ? ('premium' as const) : ('normal' as const),

        maxWeight: Math.max(...sortedRows.map((r) => r.weight)),

        rows: sortedRows,

        subCount,

        subTotal,

      };

    })

    .sort((a, b) => b.maxWeight - a.maxWeight || a.name.localeCompare(b.name, 'zh-CN'));



  const lines: RenderLine[] = [];

  let lastTier: '' | 'premium' | 'normal' = '';

  let rank = rankOffset;



  for (const g of groups) {

    if (g.tier !== lastTier) {

      lines.push({ type: 'tier', tier: g.tier });

      lastTier = g.tier;

    }

    const rowEntries: { item: FishBasketItem; rank: number }[] = [];

    for (const item of g.rows) {

      rank += 1;

      rowEntries.push({ item, rank });

    }

    lines.push({

      type: 'category',

      name: g.name,

      tier: g.tier,

      subCount: g.subCount,

      subTotal: g.subTotal,

      rows: rowEntries,

    });

  }

  return lines;

}



/** 分类卡内容高度（含卡内底垫，不含卡间距） */
function estimateCategoryBlockHeight(
  cat: Extract<RenderLine, { type: 'category' }>,
  density: ReturnType<typeof pickDensity>,
): number {
  return density.categoryH + cat.rows.length * density.rowH + 8;
}

/** 分类卡占位步长（卡高 + 卡间距），须与 renderCategoryBlock 返回的 height 一致 */
function estimateCategoryStride(
  cat: Extract<RenderLine, { type: 'category' }>,
  density: ReturnType<typeof pickDensity>,
): number {
  return estimateCategoryBlockHeight(cat, density) + 8;
}



/** 按预估高度均衡分配到三列 */

function distributeCategoriesToColumns(

  categories: Extract<RenderLine, { type: 'category' }>[],

  density: ReturnType<typeof pickDensity>,

): Extract<RenderLine, { type: 'category' }>[][] {

  const cols: Extract<RenderLine, { type: 'category' }>[][] = Array.from({ length: COLUMN_COUNT }, () => []);

  const heights = new Array(COLUMN_COUNT).fill(0);

  for (const cat of categories) {

    const h = estimateCategoryStride(cat, density);

    let minIdx = 0;

    for (let i = 1; i < COLUMN_COUNT; i += 1) {

      if (heights[i] < heights[minIdx]) minIdx = i;

    }

    cols[minIdx].push(cat);

    heights[minIdx] += h;

  }

  return cols;

}



function rowHighlightKind(rank: number, tier: FishBasketItem['tier']): string {

  if (rank === 1) return 'rank1';

  if (rank === 2) return 'rank2';

  if (rank === 3) return 'rank3';

  return tier === 'premium' ? 'premium' : 'normal';

}



function nameTextAttr(kind: string, size = 13): string {

  const map: Record<string, { fill: string; filter: string }> = {

    rank1: { fill: 'url(#rank1Grad)', filter: 'url(#glowRank1)' },

    rank2: { fill: 'url(#rank2Grad)', filter: 'url(#glowRank2)' },

    rank3: { fill: 'url(#rank3Grad)', filter: 'url(#glowRank3)' },

    premium: { fill: 'url(#premiumGrad)', filter: 'url(#glowPremium)' },

    normal: { fill: 'url(#normalGrad)', filter: 'url(#glowNormal)' },

  };

  const s = map[kind] || { fill: '#ffffff', filter: '' };

  const filterAttr = s.filter ? ` filter="${s.filter}"` : '';

  return `font-size="${size}" font-weight="800" fill="${s.fill}"${filterAttr}`;

}



function renderCategoryBlock(

  cat: Extract<RenderLine, { type: 'category' }>,

  x: number,

  y: number,

  colW: number,

  density: ReturnType<typeof pickDensity>,

  font: string,

  mainFill: string,

): { parts: string[]; height: number } {

  const parts: string[] = [];

  const pad = 8;

  const innerW = colW - pad * 2;

  const tag = cat.tier === 'premium' ? '珍' : '常';

  const tagColor = cat.tier === 'premium' ? '#FFD54F' : '#80DEEA';

  const blockH = estimateCategoryBlockHeight(cat, density);
  const stride = estimateCategoryStride(cat, density);



  parts.push(

    `<rect x="${x}" y="${y}" width="${colW}" height="${blockH}" rx="10" fill="rgba(255,255,255,0.10)" stroke="rgba(255,255,255,0.28)" stroke-width="1"/>`,

  );

  parts.push(

    `<rect x="${x}" y="${y}" width="4" height="${blockH}" rx="2" fill="${tagColor}" opacity="0.85"/>`,

  );



  const headY = y + density.categoryH - 9;

  parts.push(

    `<text x="${x + pad + 4}" y="${headY}" font-family="${font}" font-size="${density.nameSize}" font-weight="900" fill="${mainFill}">${escapeXml(truncateText(cat.name, 8))} · ${tag} · ${cat.subCount}条 · ${cat.subTotal}</text>`,

  );



  let rowY = y + density.categoryH;

  for (let i = 0; i < cat.rows.length; i += 1) {

    const { item, rank } = cat.rows[i];

    if (i % 2 === 0) {

      parts.push(

        `<rect x="${x + pad}" y="${rowY}" width="${innerW}" height="${density.rowH}" rx="4" fill="rgba(255,255,255,0.05)"/>`,

      );

    }

    const ty = rowY + density.rowH - 7;

    const rankColor = rank <= 3 ? ['#FFD700', '#C0C0C0', '#CD7F32'][rank - 1] : 'rgba(255,255,255,0.55)';

    const hl = rowHighlightKind(rank, item.tier);



    parts.push(

      `<text x="${x + pad + 4}" y="${ty}" font-family="${font}" font-size="${density.cellSize}" font-weight="700" fill="${rankColor}">#${rank}</text>`,

    );

    parts.push(

      `<text x="${x + pad + 34}" y="${ty}" font-family="${font}" ${nameTextAttr(hl, density.cellSize + 1)}>${formatWeight(item.weight)}</text>`,

    );

    parts.push(

      `<text x="${x + pad + 98}" y="${ty}" font-family="${font}" font-size="${density.cellSize}" font-weight="700" fill="${mainFill}">×${item.count}</text>`,

    );

    parts.push(

      `<text x="${x + colW - pad - 4}" y="${ty}" text-anchor="end" font-family="${font}" font-size="${density.cellSize}" font-weight="700" fill="rgba(255,255,255,0.92)">${item.totalPrice}</text>`,

    );

    rowY += density.rowH;

  }



  return { parts, height: stride };

}



function renderColumnCategories(

  categories: Extract<RenderLine, { type: 'category' }>[],

  x: number,

  startY: number,

  colW: number,

  density: ReturnType<typeof pickDensity>,

  font: string,

  mainFill: string,

): { parts: string[]; height: number } {

  const parts: string[] = [];

  let y = startY;

  for (const cat of categories) {

    const block = renderCategoryBlock(cat, x, y, colW, density, font, mainFill);

    parts.push(...block.parts);

    y += block.height;

  }

  return { parts, height: y - startY };

}



export function calcFishBasketCanvasHeight(

  lines: RenderLine[],

  density: ReturnType<typeof pickDensity>,

): number {

  const pad = 24;

  const headerH = 188;

  // 页脚文案 + 卡片底边距；额外安全余量防止描边/阴影裁切
  const footerH = 56;
  const safety = 32;

  let bodyH = 0;



  let tierCats: Extract<RenderLine, { type: 'category' }>[] = [];

  const flushTier = () => {

    if (!tierCats.length) return;

    bodyH += density.tierH + 8;

    const cols = distributeCategoriesToColumns(tierCats, density);

    // 必须用 stride（含卡间距），与 renderColumnCategories 一致
    const colHeights = cols.map((cats) =>
      cats.reduce((s, c) => s + estimateCategoryStride(c, density), 0),
    );

    bodyH += Math.max(...colHeights, 0) + 12;

    tierCats = [];

  };



  for (const line of lines) {

    if (line.type === 'tier') {

      flushTier();

    } else if (line.type === 'category') {

      tierCats.push(line);

    }

  }

  flushTier();



  return pad * 2 + headerH + bodyH + footerH + safety;

}



function buildFishBasketSvg(

  width: number,

  height: number,

  opts: FishBasketSharpRenderOptions,

  lines: RenderLine[],

  density: ReturnType<typeof pickDensity>,

  customText: string | null,

): string {
  const 货币单位 = escapeXml(opts.货币名 || '归笺');

  const font = 'Microsoft YaHei, Noto Sans SC, sans-serif';
  const mainFill = resolveSharpTextFill(customText, '#ffffff');

  const pad = 24;

  const headerH = 188;

  const cardX = pad;

  const cardY = pad;

  const cardW = width - pad * 2;

  const cardH = height - pad * 2;

  const innerX = cardX + 20;

  const contentW = cardW - 40;



  const userName = escapeXml(truncateText(opts.userName || '旅人', 14));

  const userId = escapeXml(String(opts.userId || ''));

  const time = escapeXml(opts.time || '');

  const totalValue = escapeXml(String(opts.totalValue || `0${货币单位}`));



  const colW = Math.floor((contentW - density.colGap * (COLUMN_COUNT - 1)) / COLUMN_COUNT);



  const parts: string[] = [];

  parts.push(`<defs>

    <linearGradient id="rank1Grad" x1="0%" y1="0%" x2="100%" y2="0%">

      <stop offset="0%" stop-color="#ffe082"/><stop offset="100%" stop-color="#ff6f00"/>

    </linearGradient>

    <linearGradient id="rank2Grad" x1="0%" y1="0%" x2="100%" y2="0%">

      <stop offset="0%" stop-color="#f5f5f5"/><stop offset="100%" stop-color="#90a4ae"/>

    </linearGradient>

    <linearGradient id="rank3Grad" x1="0%" y1="0%" x2="100%" y2="0%">

      <stop offset="0%" stop-color="#ffccbc"/><stop offset="100%" stop-color="#bf360c"/>

    </linearGradient>

    <linearGradient id="premiumGrad" x1="0%" y1="0%" x2="100%" y2="0%">

      <stop offset="0%" stop-color="#ffd54f"/><stop offset="100%" stop-color="#ff8f00"/>

    </linearGradient>

    <linearGradient id="normalGrad" x1="0%" y1="0%" x2="100%" y2="0%">

      <stop offset="0%" stop-color="#80deea"/><stop offset="100%" stop-color="#0097a7"/>

    </linearGradient>

    <linearGradient id="statGrad" x1="0%" y1="0%" x2="100%" y2="0%">

      <stop offset="0%" stop-color="#e8f4ff"/><stop offset="100%" stop-color="#9ec9e8"/>

    </linearGradient>

    <filter id="titleGlow" x="-30%" y="-30%" width="160%" height="160%">

      <feDropShadow dx="0" dy="0" stdDeviation="2" flood-color="#ffffff" flood-opacity="0.9"/>

      <feDropShadow dx="0" dy="2" stdDeviation="5" flood-color="#8eb8d8" flood-opacity="0.45"/>

    </filter>

    <filter id="glowRank1" x="-35%" y="-35%" width="170%" height="170%">

      <feDropShadow dx="0" dy="0" stdDeviation="3" flood-color="#ffd54f" flood-opacity="0.75"/>

    </filter>

    <filter id="glowRank2" x="-35%" y="-35%" width="170%" height="170%">

      <feDropShadow dx="0" dy="0" stdDeviation="3" flood-color="#eceff1" flood-opacity="0.7"/>

    </filter>

    <filter id="glowRank3" x="-35%" y="-35%" width="170%" height="170%">

      <feDropShadow dx="0" dy="0" stdDeviation="3" flood-color="#ffab91" flood-opacity="0.7"/>

    </filter>

    <filter id="glowPremium" x="-35%" y="-35%" width="170%" height="170%">

      <feDropShadow dx="0" dy="0" stdDeviation="3" flood-color="#ffca28" flood-opacity="0.75"/>

    </filter>

    <filter id="glowNormal" x="-35%" y="-35%" width="170%" height="170%">

      <feDropShadow dx="0" dy="0" stdDeviation="3" flood-color="#4dd0e1" flood-opacity="0.7"/>

    </filter>

  </defs>`);



  // 透明玻璃主卡（不铺不透明底，背景图透出）
  parts.push(

    `<rect x="${cardX}" y="${cardY}" width="${cardW}" height="${cardH}" rx="20" fill="rgba(255,255,255,0.12)" stroke="rgba(255,255,255,0.28)" stroke-width="1.5"/>`,

  );



  let curY = cardY + 34;

  parts.push(

    `<text x="${innerX}" y="${curY}" font-family="${font}" font-size="32" font-weight="900" fill="${mainFill}" filter="url(#titleGlow)">我的鱼篓</text>`,

  );

  parts.push(

    `<text x="${innerX}" y="${curY + 26}" font-family="${font}" font-size="13" fill="rgba(255,255,255,0.82)">${userName} · QQ ${userId}</text>`,

  );

  if (time) {

    parts.push(

      `<text x="${cardX + cardW - 20}" y="${curY}" text-anchor="end" font-family="${font}" font-size="12" fill="rgba(255,255,255,0.65)">${time}</text>`,

    );

  }

  const pageIndex = Math.max(1, Number(opts.pageIndex) || 1);
  const pageTotal = Math.max(1, Number(opts.pageTotal) || 1);
  parts.push(

    `<text x="${cardX + cardW - 20}" y="${curY + 22}" text-anchor="end" font-family="${font}" font-size="11" fill="rgba(255,255,255,0.5)">第 ${pageIndex}/${pageTotal} 页 · 三列 · 从重到轻</text>`,

  );

  curY += 46;



  const statW = (contentW - 30) / 4;

  const stats = [

    { label: '总条数', value: `${opts.totalCount} 条` },

    { label: '总价值', value: totalValue },

    { label: '鱼种类', value: `${opts.categoryCount} 类` },

    { label: '规格记录', value: `${opts.recordCount} 条` },

  ];

  stats.forEach((st, i) => {

    const x = innerX + i * (statW + 10);

    parts.push(

      `<rect x="${x}" y="${curY}" width="${statW}" height="56" rx="12" fill="rgba(255,255,255,0.12)" stroke="rgba(255,255,255,0.28)" stroke-width="1"/>`,

    );

    parts.push(

      `<text x="${x + 12}" y="${curY + 20}" font-family="${font}" font-size="11" fill="rgba(255,255,255,0.65)">${escapeXml(st.label)}</text>`,

    );

    parts.push(

      `<text x="${x + 12}" y="${curY + 42}" font-family="${font}" font-size="16" font-weight="900" fill="url(#statGrad)" filter="url(#titleGlow)">${escapeXml(st.value)}</text>`,

    );

  });

  curY = cardY + headerH;



  let tierCats: Extract<RenderLine, { type: 'category' }>[] = [];

  let pendingTier: 'premium' | 'normal' | null = null;



  const flushTierSection = () => {

    if (!tierCats.length || !pendingTier) return;



    const label = pendingTier === 'premium' ? '◆ 高级渔获区' : '◇ 普通渔获区';

    const fill = pendingTier === 'premium' ? 'rgba(255,193,7,0.22)' : 'rgba(255,255,255,0.14)';
    const stroke = pendingTier === 'premium' ? 'rgba(255,213,79,0.45)' : 'rgba(255,255,255,0.28)';

    parts.push(`<rect x="${innerX}" y="${curY}" width="${contentW}" height="${density.tierH}" rx="8" fill="${fill}" stroke="${stroke}" stroke-width="1"/>`);

    parts.push(

      `<text x="${innerX + 14}" y="${curY + density.tierH - 11}" font-family="${font}" font-size="${density.nameSize + 1}" font-weight="900" fill="${mainFill}">${label}</text>`,

    );

    curY += density.tierH + 8;



    const cols = distributeCategoriesToColumns(tierCats, density);

    const colStarts = cols.map((_, idx) => innerX + idx * (colW + density.colGap));

    const colRendered = cols.map((cats, idx) =>

      renderColumnCategories(cats, colStarts[idx], curY, colW, density, font, mainFill),

    );

    const maxColH = Math.max(...colRendered.map((c) => c.height), 0);

    for (const col of colRendered) {

      parts.push(...col.parts);

    }

    curY += maxColH + 12;



    tierCats = [];

    pendingTier = null;

  };



  for (const line of lines) {

    if (line.type === 'tier') {

      flushTierSection();

      pendingTier = line.tier;

    } else if (line.type === 'category') {

      tierCats.push(line);

    }

  }

  flushTierSection();



  parts.push(

    `<text x="${width / 2}" y="${cardY + cardH - 14}" text-anchor="middle" font-family="${font}" font-size="10" fill="rgba(255,255,255,0.42)">${escapeXml('MK-Bot · 出售: 出售 全部鱼 / 出售 鱼名(重量kg) [数量]')}</text>`,

  );



  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">${parts.join('\n')}</svg>`;

}



export async function renderFishBasketWithSharpImpl(

  options: FishBasketSharpRenderOptions,

  logger?: MkLoggerResolved,

): Promise<string | null> {

  const displayItems = (options.items || []).slice(0, FISH_BASKET_PER_PAGE);

  const density = pickDensity(displayItems.length);

  const width = options.width ?? density.width;

  const rankOffset = Math.max(0, Number(options.rankOffset) || 0);

  const lines = buildFishBasketRenderLines(displayItems, rankOffset);

  const height = calcFishBasketCanvasHeight(lines, density);

  const pluginDir = String(options.pluginDir || '').trim();
  const dataPath = String(options.dataPath || '').trim();
  const bgLocalPath = String(options.bgLocalPath || '').trim();



  try {

    const sharp = await loadSharp();
    const composites: { input: Buffer; top?: number; left?: number }[] = [];

    const bgBuf = await loadFishBasketBackground(bgLocalPath, pluginDir, dataPath);
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
      logger?.warn?.('[Sharp渲染] 我的鱼篓背景图不可用，已使用默认底色');
    }

    const svg = buildFishBasketSvg(width, height, options, lines, density, loadSharpTextColorFromDataPath(dataPath));

    const uiLayer = await fitCompositeLayer(sharp, Buffer.from(svg), width, height);
    composites.push({ input: uiLayer, top: 0, left: 0 });

    const out = await sharp({

      create: {

        width,

        height,

        channels: 4,

        background: { r: 18, g: 22, b: 30, alpha: 1 },

      },

    })

      .composite(composites)

      .png({ compressionLevel: 6 })

      .toBuffer();

    return out.toString('base64');

  } catch (error) {

    const msg = error instanceof Error ? error.message : String(error);

    logger?.error?.('[Sharp渲染] 我的鱼篓渲染失败:', msg);

    return null;

  }

}

export async function renderFishBasketWithSharp(
  options: Parameters<typeof renderFishBasketWithSharpImpl>[0],
  logger?: Parameters<typeof renderFishBasketWithSharpImpl>[1],
): Promise<string | null> {
  return runCardSharpJob(
    'fish-basket',
    { options },
    () => renderFishBasketWithSharpImpl(options, logger),
  );
}
