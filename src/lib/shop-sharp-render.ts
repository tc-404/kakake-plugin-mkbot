// ---------------------------------------------------------------------------
// Sharp 渲染：道具商店（清爽货架卡，渐变底 + 白卡片列表）
// ---------------------------------------------------------------------------

import type { MkLoggerResolved } from '../types';
import { loadSharp } from './sharp-loader';
import { runCardSharpJob } from './sharp-worker-client';
import { MK_PNG_OUT } from './png-output';

export interface ShopSharpItem {
  name: string;
  modeLabel: string;
  /** 今日成交价（数字字符串） */
  price: string;
  /** 默认原价，降价时左侧划线展示 */
  basePrice?: string;
  /** down=降价划线原价；up=仅显示上升图标 */
  trend?: 'up' | 'down' | 'same';
  limitText: string;
  remainText: string;
  soldOut?: boolean;
}

export interface ShopSharpRenderOptions {
  /** 基础货币展示名；缺省回退「归笺」 */
  货币名?: string;
  title?: string;
  subtitle?: string;
  hint?: string;
  items: ShopSharpItem[];
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

function buildShopSvg(width: number, height: number, opts: ShopSharpRenderOptions): string {
  const 货币单位 = escapeXml(opts.货币名 || '归笺');
  const font = 'Microsoft YaHei, Noto Sans SC, sans-serif';
  const pad = 40;
  const title = escapeXml(opts.title || '道具商店');
  const subtitle = escapeXml(opts.subtitle || '');
  const hint = escapeXml(opts.hint || '');
  const items = Array.isArray(opts.items) ? opts.items : [];

  const parts: string[] = [];
  parts.push(`<defs>
    <linearGradient id="shopBg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#ff9a9e"/>
      <stop offset="42%" stop-color="#fad0c4"/>
      <stop offset="100%" stop-color="#a18cd1"/>
    </linearGradient>
    <linearGradient id="sheetGrad" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="rgba(255,255,255,0.94)"/>
      <stop offset="100%" stop-color="rgba(255,255,255,0.82)"/>
    </linearGradient>
    <linearGradient id="priceGrad" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#ff7043"/>
      <stop offset="100%" stop-color="#ec407a"/>
    </linearGradient>
    <linearGradient id="priceDownGrad" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#43a047"/>
      <stop offset="100%" stop-color="#2e7d32"/>
    </linearGradient>
    <filter id="softBlob" x="-40%" y="-40%" width="180%" height="180%">
      <feGaussianBlur stdDeviation="42"/>
    </filter>
  </defs>`);

  // 背景
  parts.push(`<rect x="0" y="0" width="${width}" height="${height}" fill="url(#shopBg)"/>`);
  parts.push(`<circle cx="${width - 70}" cy="60" r="170" fill="#fff3e0" opacity="0.35" filter="url(#softBlob)"/>`);
  parts.push(`<circle cx="50" cy="${height - 30}" r="150" fill="#e1bee7" opacity="0.32" filter="url(#softBlob)"/>`);

  // 外层白底货架板（无顶部彩色横条）
  const sheetX = pad;
  const sheetY = pad;
  const sheetW = width - pad * 2;
  const sheetH = height - pad * 2 - (hint ? 12 : 0);
  parts.push(
    `<rect x="${sheetX}" y="${sheetY}" width="${sheetW}" height="${sheetH}" rx="28" ry="28" fill="url(#sheetGrad)" stroke="rgba(255,255,255,0.75)" stroke-width="2"/>`,
  );

  // 标题区
  parts.push(
    `<text x="${sheetX + 36}" y="${sheetY + 56}" font-family="${font}" font-size="40" font-weight="900" fill="#2d2430">${title}</text>`,
  );
  if (subtitle) {
    parts.push(
      `<text x="${sheetX + 36}" y="${sheetY + 90}" font-family="${font}" font-size="18" fill="rgba(45,36,48,0.55)">${subtitle}</text>`,
    );
  }

  // 表头
  const headY = sheetY + 126;
  parts.push(
    `<text x="${sheetX + 36}" y="${headY}" font-family="${font}" font-size="15" font-weight="700" fill="rgba(45,36,48,0.4)" letter-spacing="1">商品</text>`,
  );
  parts.push(
    `<text x="${sheetX + sheetW * 0.46}" y="${headY}" font-family="${font}" font-size="15" font-weight="700" fill="rgba(45,36,48,0.4)" letter-spacing="1">限购</text>`,
  );
  parts.push(
    `<text x="${sheetX + sheetW - 36}" y="${headY}" text-anchor="end" font-family="${font}" font-size="15" font-weight="700" fill="rgba(45,36,48,0.4)" letter-spacing="1">今日价</text>`,
  );
  parts.push(
    `<line x1="${sheetX + 28}" y1="${headY + 14}" x2="${sheetX + sheetW - 28}" y2="${headY + 14}" stroke="rgba(45,36,48,0.08)" stroke-width="1.5"/>`,
  );

  const rowH = 108;
  const rowStart = headY + 28;

  items.forEach((item, i) => {
    const y = rowStart + i * rowH;
    const soldOut = !!item.soldOut;
    const name = escapeXml(truncateText(item.name, 8));
    const modeLabel = escapeXml(truncateText(item.modeLabel, 6));
    const priceNum = String(item.price || '-').replace(/[^\d.-]/g, '').trim();
    const price = escapeXml(priceNum);
    const baseNum = String(item.basePrice || '').replace(/[^\d.-]/g, '').trim();
    const basePrice = escapeXml(baseNum);
    const trend = item.trend === 'down' ? 'down' : item.trend === 'same' ? 'same' : 'up';
    const limitText = escapeXml(item.limitText || '-');
    const remainText = escapeXml(item.remainText || '-');

    // 斑马底
    if (i % 2 === 0) {
      parts.push(
        `<rect x="${sheetX + 18}" y="${y}" width="${sheetW - 36}" height="${rowH - 12}" rx="18" fill="rgba(255,107,138,0.06)"/>`,
      );
    }

    // 序号
    parts.push(
      `<text x="${sheetX + 48}" y="${y + 46}" font-family="${font}" font-size="18" font-weight="800" fill="rgba(255,107,138,0.75)">${String(i + 1).padStart(2, '0')}</text>`,
    );

    // 名称
    parts.push(
      `<text x="${sheetX + 84}" y="${y + 40}" font-family="${font}" font-size="28" font-weight="900" fill="#2d2430">${name}</text>`,
    );

    // 档位徽章
    const badgeW = Math.max(72, modeLabel.length * 16 + 28);
    parts.push(
      `<rect x="${sheetX + 84}" y="${y + 54}" width="${badgeW}" height="28" rx="14" fill="rgba(139,124,246,0.14)"/>`,
    );
    parts.push(
      `<text x="${sheetX + 84 + badgeW / 2}" y="${y + 74}" text-anchor="middle" font-family="${font}" font-size="14" font-weight="700" fill="#6a5acd">${modeLabel}</text>`,
    );

    // 限购 / 可买
    parts.push(
      `<text x="${sheetX + sheetW * 0.46}" y="${y + 40}" font-family="${font}" font-size="17" fill="rgba(45,36,48,0.55)">${limitText}</text>`,
    );
    parts.push(
      `<text x="${sheetX + sheetW * 0.46}" y="${y + 72}" font-family="${font}" font-size="22" font-weight="800" fill="${soldOut ? '#e53935' : '#43a047'}">${remainText}</text>`,
    );

    // 今日价区域
    const priceRight = sheetX + sheetW - 36;
    const priceColor = trend === 'down' ? 'url(#priceDownGrad)' : 'url(#priceGrad)';

    if (trend === 'down' && baseNum && baseNum !== priceNum) {
      // 左侧划线原价 + 右侧现价（市场降价 UI）
      const strike = escapeXml(baseNum);
      // 估算原价文字宽度，右对齐到现价左侧
      const strikeApproxW = baseNum.length * 12 + 4;
      const strikeX = priceRight - Math.max(120, priceNum.length * 18) - 16 - strikeApproxW;
      parts.push(
        `<text x="${strikeX}" y="${y + 48}" font-family="${font}" font-size="18" font-weight="600" fill="rgba(45,36,48,0.38)">${strike}</text>`,
      );
      // 划线
      parts.push(
        `<line x1="${strikeX - 2}" y1="${y + 42}" x2="${strikeX + strikeApproxW}" y2="${y + 42}" stroke="rgba(45,36,48,0.45)" stroke-width="2"/>`,
      );
      parts.push(
        `<text x="${priceRight}" y="${y + 50}" text-anchor="end" font-family="${font}" font-size="34" font-weight="900" fill="${priceColor}">${price}</text>`,
      );
      parts.push(
        `<text x="${priceRight}" y="${y + 76}" text-anchor="end" font-family="${font}" font-size="14" fill="#43a047" font-weight="700">${货币单位} · 降价</text>`,
      );
    } else {
      // 升价：现价 + 上升图标
      parts.push(
        `<text x="${priceRight}" y="${y + 50}" text-anchor="end" font-family="${font}" font-size="34" font-weight="900" fill="${priceColor}">${price}</text>`,
      );
      if (trend === 'up') {
        const arrowX = priceRight - Math.max(70, priceNum.length * 18) - 28;
        // 简洁上升三角
        parts.push(
          `<path d="M ${arrowX} ${y + 54} L ${arrowX + 10} ${y + 38} L ${arrowX + 20} ${y + 54} Z" fill="#ec407a"/>`,
        );
        parts.push(
          `<rect x="${arrowX + 7}" y="${y + 54}" width="6" height="12" rx="1" fill="#ec407a"/>`,
        );
        parts.push(
          `<text x="${priceRight}" y="${y + 76}" text-anchor="end" font-family="${font}" font-size="14" fill="rgba(45,36,48,0.4)">${货币单位}</text>`,
        );
      } else {
        parts.push(
          `<text x="${priceRight}" y="${y + 76}" text-anchor="end" font-family="${font}" font-size="14" fill="rgba(45,36,48,0.4)">${货币单位}</text>`,
        );
      }
    }
  });

  if (hint) {
    parts.push(
      `<text x="${width / 2}" y="${height - 18}" text-anchor="middle" font-family="${font}" font-size="15" fill="rgba(255,255,255,0.88)">${hint}</text>`,
    );
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">${parts.join('\n')}</svg>`;
}

export async function renderShopWithSharpImpl(
  options: ShopSharpRenderOptions,
  logger?: MkLoggerResolved,
): Promise<string | null> {
  const items = Array.isArray(options.items) ? options.items : [];
  // 提高分辨率，QQ 缩略后仍更清晰
  const width = options.width ?? 1280;
  const headerBlock = 40 + 126 + 28;
  const rowBlock = Math.max(1, items.length) * 108;
  const height = Math.max(420, headerBlock + rowBlock + 64);

  try {
    const sharp = await loadSharp();
    const svg = buildShopSvg(width, height, options);
    // 直接按大尺寸栅格化，保证清晰度
    const out = await sharp(Buffer.from(svg)).png(MK_PNG_OUT()).toBuffer();
    return out.toString('base64');
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    logger?.error?.('[Sharp渲染] 商店渲染失败:', msg);
    return null;
  }
}

export async function renderShopWithSharp(
  options: Parameters<typeof renderShopWithSharpImpl>[0],
  logger?: Parameters<typeof renderShopWithSharpImpl>[1],
): Promise<string | null> {
  return runCardSharpJob(
    'shop',
    { options },
    () => renderShopWithSharpImpl(options, logger),
  );
}
