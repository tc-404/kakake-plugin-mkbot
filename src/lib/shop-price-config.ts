// ---------------------------------------------------------------------------
// 道具商店：默认价格 / 限购数量 + 浮动比例（WebUI「修改道具」与运行时共用）
// ---------------------------------------------------------------------------

import { readA, writeA } from '../data-fs';

export const SHOP_PRICE_CONFIG_PATH = '筱筱吖/娱乐系统/商店系统/价格配置/默认设置.json';

export type ShopPriceFloatConfig = {
  降价概率: number;
  降价最小: number;
  降价最大: number;
  涨价最小: number;
  涨价最大: number;
};

export type ShopPriceConfig = {
  prices: Record<string, number>;
  limits: Record<string, number>;
  float: ShopPriceFloatConfig;
};

/** 可编辑道具元数据（价格键 = 限购键） */
export const SHOP_EDITABLE_ITEMS = [
  { key: '诱饵_个人', name: '诱饵', mode: '个人' },
  { key: '禁言卡_个人', name: '禁言卡', mode: '个人' },
  { key: '禁言卡_全服', name: '禁言卡', mode: '全服' },
] as const;

export function defaultShopPriceConfig(): ShopPriceConfig {
  return {
    prices: {
      诱饵_个人: 100,
      禁言卡_个人: 888,
      禁言卡_全服: 1200,
    },
    limits: {
      诱饵_个人: 20,
      禁言卡_个人: 2,
      禁言卡_全服: 15,
    },
    float: {
      降价概率: 0.3,
      降价最小: 0.05,
      降价最大: 0.7,
      涨价最小: 0.1,
      涨价最大: 0.5,
    },
  };
}

function clampNum(n: unknown, lo: number, hi: number, fallback: number): number {
  const v = Number(n);
  if (!Number.isFinite(v)) return fallback;
  return Math.min(hi, Math.max(lo, v));
}

/** 规范化并补齐缺项，供读写/展示共用 */
export function normalizeShopPriceConfig(raw: unknown): ShopPriceConfig {
  const base = defaultShopPriceConfig();
  const obj = raw && typeof raw === 'object' ? (raw as Record<string, any>) : {};
  const pricesIn = obj.prices && typeof obj.prices === 'object' ? obj.prices : {};
  const limitsIn = obj.limits && typeof obj.limits === 'object' ? obj.limits : {};
  const floatIn = obj.float && typeof obj.float === 'object' ? obj.float : {};

  const prices: Record<string, number> = { ...base.prices };
  const limits: Record<string, number> = { ...base.limits };
  for (const key of Object.keys(base.prices)) {
    prices[key] = Math.max(1, Math.floor(clampNum(pricesIn[key], 1, 1e9, base.prices[key])));
  }
  for (const key of Object.keys(base.limits)) {
    limits[key] = Math.max(1, Math.floor(clampNum(limitsIn[key], 1, 1e6, base.limits[key])));
  }

  const 降价最小 = clampNum(floatIn.降价最小, 0, 2, base.float.降价最小);
  let 降价最大 = clampNum(floatIn.降价最大, 0, 2, base.float.降价最大);
  if (降价最大 < 降价最小) 降价最大 = 降价最小;

  const 涨价最小 = clampNum(floatIn.涨价最小, 0, 2, base.float.涨价最小);
  let 涨价最大 = clampNum(floatIn.涨价最大, 0, 2, base.float.涨价最大);
  if (涨价最大 < 涨价最小) 涨价最大 = 涨价最小;

  return {
    prices,
    limits,
    float: {
      降价概率: clampNum(floatIn.降价概率, 0, 1, base.float.降价概率),
      降价最小,
      降价最大,
      涨价最小,
      涨价最大,
    },
  };
}

export function loadShopPriceConfig(): ShopPriceConfig {
  try {
    const text = readA(SHOP_PRICE_CONFIG_PATH);
    if (!text || text === '无' || text === 'false') return defaultShopPriceConfig();
    return normalizeShopPriceConfig(JSON.parse(text));
  } catch {
    return defaultShopPriceConfig();
  }
}

export function saveShopPriceConfig(raw: unknown): ShopPriceConfig {
  const cfg = normalizeShopPriceConfig(raw);
  writeA(SHOP_PRICE_CONFIG_PATH, JSON.stringify(cfg, null, 2));
  return cfg;
}

export function shopPriceKey(name: string, mode: string): string {
  return `${name}_${mode}`;
}

export function getShopBasePrice(name: string, mode: string, fallback: number): number {
  const cfg = loadShopPriceConfig();
  const key = shopPriceKey(name, mode);
  const v = Number(cfg.prices[key]);
  if (Number.isFinite(v) && v >= 1) return Math.floor(v);
  return Math.max(1, Math.floor(fallback));
}

export function getShopLimit(name: string, mode: string, fallback: number): number {
  const cfg = loadShopPriceConfig();
  const key = shopPriceKey(name, mode);
  const v = Number(cfg.limits[key]);
  if (Number.isFinite(v) && v >= 1) return Math.floor(v);
  return Math.max(1, Math.floor(fallback));
}

/** WebUI 展示用的条目清单 */
export function listShopPriceEditableItems(cfg?: ShopPriceConfig): Array<{
  key: string;
  name: string;
  mode: string;
  price: number;
  limit: number;
}> {
  const c = cfg || loadShopPriceConfig();
  return SHOP_EDITABLE_ITEMS.map((m) => ({
    key: m.key,
    name: m.name,
    mode: m.mode,
    price: Math.max(1, Math.floor(Number(c.prices[m.key]) || 1)),
    limit: Math.max(1, Math.floor(Number(c.limits[m.key]) || 1)),
  }));
}
