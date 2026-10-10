// ---------------------------------------------------------------------------
// 私聊解禁：收费配置（初始收费值 / 上涨百分比）— WebUI「修改道具」与运行时共用
// ---------------------------------------------------------------------------

import { readA, writeA } from '../data-fs';

export const UNMUTE_PRICE_CONFIG_PATH = '筱筱吖/娱乐系统/私聊解禁/配置.json';

/** 每个用户前 N 次解禁免费（第 1~N 次） */
export const UNMUTE_FREE_TIMES = 3;

export type UnmutePriceConfig = {
  /** 第 N+1 次起的基础收费（货币单位由货币名决定） */
  初始收费: number;
  /** 每解禁一次，下一次收费的上涨百分比；20 表示 +20%，0 表示不涨价 */
  上涨百分比: number;
};

export function defaultUnmutePriceConfig(): UnmutePriceConfig {
  return {
    初始收费: 500,
    上涨百分比: 20,
  };
}

function clampNum(n: unknown, lo: number, hi: number, fallback: number): number {
  const v = Number(n);
  if (!Number.isFinite(v)) return fallback;
  return Math.min(hi, Math.max(lo, v));
}

/** 规范化并补齐缺项，供读写/展示共用 */
export function normalizeUnmutePriceConfig(raw: unknown): UnmutePriceConfig {
  const base = defaultUnmutePriceConfig();
  if (!raw || typeof raw !== 'object') return base;
  const o = raw as Record<string, unknown>;
  return {
    初始收费: Math.floor(clampNum(o.初始收费, 0, 100000000, base.初始收费)),
    上涨百分比: clampNum(o.上涨百分比, 0, 1000, base.上涨百分比),
  };
}

export function loadUnmutePriceConfig(): UnmutePriceConfig {
  try {
    const text = readA(UNMUTE_PRICE_CONFIG_PATH);
    if (!text || text === '无' || text === 'false') return defaultUnmutePriceConfig();
    return normalizeUnmutePriceConfig(JSON.parse(text));
  } catch {
    return defaultUnmutePriceConfig();
  }
}

export function saveUnmutePriceConfig(raw: unknown): UnmutePriceConfig {
  const cfg = normalizeUnmutePriceConfig(raw);
  writeA(UNMUTE_PRICE_CONFIG_PATH, JSON.stringify(cfg, null, 2));
  return cfg;
}

/**
 * 计算「第 n 次解禁」（已解除次数 = n，即本次是第 n+1 次）应收的货币数。
 *
 * - 已解除次数 < UNMUTE_FREE_TIMES → 免费（0）
 * - 之后：初始收费 × (1 + 上涨百分比/100) ^ (收费序号 - 1)
 *   例：初始 500、涨幅 20% → 第 4 次 500，第 5 次 600，第 6 次 720 …
 * - 涨幅为 0 时恒等于初始收费
 */
export function calcUnmutePrice(已解除次数: number, cfg?: UnmutePriceConfig): number {
  const conf = cfg || loadUnmutePriceConfig();
  const n = Math.max(0, Math.floor(Number(已解除次数) || 0));
  if (n < UNMUTE_FREE_TIMES) return 0;

  const 收费序号 = n - UNMUTE_FREE_TIMES + 1;
  const 涨幅 = Math.max(0, Number(conf.上涨百分比) || 0) / 100;
  const 基础 = Math.max(0, Math.floor(Number(conf.初始收费) || 0));
  if (基础 === 0) return 0;

  return Math.max(0, Math.round(基础 * Math.pow(1 + 涨幅, 收费序号 - 1)));
}
