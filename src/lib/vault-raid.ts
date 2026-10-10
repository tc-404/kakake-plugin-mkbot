// ---------------------------------------------------------------------------
// 闯金库（升级版打劫）：配置、金库读写、敞口与档位计算
//
// 与业务指令解耦，方便自检脚本直接跑。所有对外金额一律为**整数**。
//
// 数据统一落在 筱筱吖/娱乐系统/闯金库/ 下：
//   配置.json  全局配置（WebUI「修改道具」里改）
//   金库.json  银行金库总值（key = "总值"，全局一个池）
//   冷却.json  key = QQ，值 = 冷却到期时间戳（秒）
//   统计.json  key = QQ，值 = { 成功, 失败, 净收益 }
//   流水/{群号}.json  该群最近 N 条流水（数组，新的在前）
// ---------------------------------------------------------------------------

import { readA, readB, writeA, writeB } from '../data-fs';

/** 本功能的数据根目录 */
export const VAULT_RAID_DIR = '筱筱吖/娱乐系统/闯金库';
export const VAULT_RAID_CONFIG_PATH = `${VAULT_RAID_DIR}/配置.json`;
export const VAULT_RAID_FUND_PATH = `${VAULT_RAID_DIR}/金库.json`;
export const VAULT_RAID_COOLDOWN_PATH = `${VAULT_RAID_DIR}/冷却.json`;
export const VAULT_RAID_STAT_PATH = `${VAULT_RAID_DIR}/统计.json`;

/** 每个群单独一份流水文件，避免全局单文件无限膨胀 */
export function vaultRaidLogPath(群号: string | number): string {
  return `${VAULT_RAID_DIR}/流水/${String(群号 ?? '未知')}.json`;
}

/** 单个群流水最多保留多少条 */
export const VAULT_RAID_LOG_LIMIT = 500;

/** 金库池的键名 */
const 金库键 = '总值';

export type VaultRaidConfig = {
  /** 每次闯金库之间的冷却（分钟） */
  冷却分钟: number;
  /** 成功概率（百分比 0~100） */
  成功率: number;

  /** 低等奖励：固定值 */
  低等奖励: number;
  /** 中等奖励：区间随机 */
  中等奖励最小: number;
  中等奖励最大: number;
  /** 高等奖励：金库现值的百分比区间 */
  高等奖励最小百分比: number;
  高等奖励最大百分比: number;
  /** 隐藏级：用户现有货币的倍数区间 */
  隐藏最小倍数: number;
  隐藏最大倍数: number;

  /** 基础惩罚：禁言分钟区间（无论哪一档都会禁言） */
  禁言最小分钟: number;
  禁言最大分钟: number;
  /** 低等惩罚：固定值 */
  低等惩罚: number;
  /** 中等惩罚：区间随机 */
  中等惩罚最小: number;
  中等惩罚最大: number;
  /** 高等惩罚：用户现有货币的百分比区间 */
  高等惩罚最小百分比: number;
  高等惩罚最大百分比: number;

  /** 反白嫖「风险敞口」：现有货币 × 该倍数 */
  敞口倍数: number;
  /** 反白嫖「风险敞口」：银行存款 × 该系数（存款不会被罚没，敞口打折） */
  存款敞口系数: number;

  /** 金库上限，0 = 不限 */
  金库上限: number;
  /** 银行取款利润抽成进金库的比例（%），0 = 不抽 */
  利息税百分比: number;

  /**
   * 前两档（奖励/惩罚的低等、中等）是否随经济体量自动抬价。
   * 关闭 = 全部按填的数值走，不做任何缩放。
   */
  自动抬价: boolean;
  /** 抬价基准：人均净资产达到这个数时系数为 1 */
  基准人均: number;
  /** 成功奖励档位权重（相对值，不必凑成 100） */
  奖励权重: { 低等: number; 中等: number; 高等: number; 隐藏: number };
  /** 失败惩罚档位权重（相对值，不必凑成 100） */
  惩罚权重: { 低等: number; 中等: number; 高等: number; 隐藏: number };
};

/** 默认档位权重：高+隐藏合计 10%，200 轮实测约 20 次，稀有但摸得到 */
export const 默认奖励权重 = { 低等: 55, 中等: 35, 高等: 8, 隐藏: 2 } as const;
/** 隐藏惩罚 = 清空现有货币，权重压到 2 */
export const 默认惩罚权重 = { 低等: 50, 中等: 36, 高等: 12, 隐藏: 2 } as const;

export type 奖励档位 = '低等' | '中等' | '高等' | '隐藏';
export type 惩罚档位 = '低等' | '中等' | '高等' | '隐藏';

/**
 * 会随经济体量抬价的字段（前两档的奖励与惩罚）。
 * 只要这些字段**没有在配置里被显式改写**，就按「默认值 × 抬价系数」取值。
 */
export const 抬价字段表 = [
  '低等奖励',
  '中等奖励最小',
  '中等奖励最大',
  '低等惩罚',
  '中等惩罚最小',
  '中等惩罚最大',
] as const;

export function defaultVaultRaidConfig(): VaultRaidConfig {
  return {
    冷却分钟: 15,
    成功率: 50,

    低等奖励: 100,
    中等奖励最小: 50,
    中等奖励最大: 300,
    高等奖励最小百分比: 5,
    高等奖励最大百分比: 15,
    隐藏最小倍数: 0.5,
    隐藏最大倍数: 5,

    禁言最小分钟: 5,
    禁言最大分钟: 15,
    低等惩罚: 50,
    中等惩罚最小: 30,
    中等惩罚最大: 150,
    高等惩罚最小百分比: 5,
    高等惩罚最大百分比: 15,

    敞口倍数: 5,
    存款敞口系数: 0.1,

    金库上限: 0,
    利息税百分比: 10,

    自动抬价: true,
    基准人均: 5000,
    奖励权重: { ...默认奖励权重 },
    惩罚权重: { ...默认惩罚权重 },
  };
}

function 整数夹取(n: unknown, lo: number, hi: number, fallback: number): number {
  const v = Number(n);
  if (!Number.isFinite(v)) return fallback;
  return Math.floor(Math.min(hi, Math.max(lo, v)));
}

function 小数夹取(n: unknown, lo: number, hi: number, fallback: number): number {
  const v = Number(n);
  if (!Number.isFinite(v)) return fallback;
  return Math.min(hi, Math.max(lo, v));
}

/** 规范化并补齐缺项；顺带把 min/max 的大小关系纠正过来 */
export function normalizeVaultRaidConfig(raw: unknown): VaultRaidConfig {
  const b = defaultVaultRaidConfig();
  if (!raw || typeof raw !== 'object') return b;
  const o = raw as Record<string, unknown>;

  let 中等奖励最小 = 整数夹取(o.中等奖励最小, 0, 100000000, b.中等奖励最小);
  let 中等奖励最大 = 整数夹取(o.中等奖励最大, 0, 100000000, b.中等奖励最大);
  if (中等奖励最大 < 中等奖励最小) 中等奖励最大 = 中等奖励最小;

  let 高等奖励最小百分比 = 小数夹取(o.高等奖励最小百分比, 0, 1000, b.高等奖励最小百分比);
  let 高等奖励最大百分比 = 小数夹取(o.高等奖励最大百分比, 0, 1000, b.高等奖励最大百分比);
  if (高等奖励最大百分比 < 高等奖励最小百分比) 高等奖励最大百分比 = 高等奖励最小百分比;

  let 隐藏最小倍数 = 小数夹取(o.隐藏最小倍数, 0, 100, b.隐藏最小倍数);
  let 隐藏最大倍数 = 小数夹取(o.隐藏最大倍数, 0, 100, b.隐藏最大倍数);
  if (隐藏最大倍数 < 隐藏最小倍数) 隐藏最大倍数 = 隐藏最小倍数;

  let 禁言最小分钟 = 整数夹取(o.禁言最小分钟, 0, 43200, b.禁言最小分钟);
  let 禁言最大分钟 = 整数夹取(o.禁言最大分钟, 0, 43200, b.禁言最大分钟);
  if (禁言最大分钟 < 禁言最小分钟) 禁言最大分钟 = 禁言最小分钟;

  let 中等惩罚最小 = 整数夹取(o.中等惩罚最小, 0, 100000000, b.中等惩罚最小);
  let 中等惩罚最大 = 整数夹取(o.中等惩罚最大, 0, 100000000, b.中等惩罚最大);
  if (中等惩罚最大 < 中等惩罚最小) 中等惩罚最大 = 中等惩罚最小;

  let 高等惩罚最小百分比 = 小数夹取(o.高等惩罚最小百分比, 0, 1000, b.高等惩罚最小百分比);
  let 高等惩罚最大百分比 = 小数夹取(o.高等惩罚最大百分比, 0, 1000, b.高等惩罚最大百分比);
  if (高等惩罚最大百分比 < 高等惩罚最小百分比) 高等惩罚最大百分比 = 高等惩罚最小百分比;

  return {
    冷却分钟: 整数夹取(o.冷却分钟, 0, 100000, b.冷却分钟),
    成功率: 整数夹取(o.成功率, 0, 100, b.成功率),

    低等奖励: 整数夹取(o.低等奖励, 0, 100000000, b.低等奖励),
    中等奖励最小,
    中等奖励最大,
    高等奖励最小百分比,
    高等奖励最大百分比,
    隐藏最小倍数,
    隐藏最大倍数,

    禁言最小分钟,
    禁言最大分钟,
    低等惩罚: 整数夹取(o.低等惩罚, 0, 100000000, b.低等惩罚),
    中等惩罚最小,
    中等惩罚最大,
    高等惩罚最小百分比,
    高等惩罚最大百分比,

    敞口倍数: 小数夹取(o.敞口倍数, 0, 100, b.敞口倍数),
    存款敞口系数: 小数夹取(o.存款敞口系数, 0, 100, b.存款敞口系数),

    金库上限: 整数夹取(o.金库上限, 0, 100000000000, b.金库上限),
    利息税百分比: 整数夹取(o.利息税百分比, 0, 100, b.利息税百分比),

    自动抬价: o.自动抬价 === false || o.自动抬价 === '关闭' || o.自动抬价 === 0 ? false : true,
    基准人均: 整数夹取(o.基准人均, 1, 1000000000, b.基准人均),
    奖励权重: normalize权重(o.奖励权重, b.奖励权重),
    惩罚权重: normalize权重(o.惩罚权重, b.惩罚权重),
  };
}

/** 权重规范化：缺项补默认，负数按 0；全 0 时回退默认（否则抽不出来档位） */
function normalize权重<T extends Record<string, number>>(raw: unknown, base: T): T {
  const out: Record<string, number> = { ...base };
  const o = (raw && typeof raw === 'object') ? (raw as Record<string, unknown>) : {};
  let 总 = 0;
  for (const k of Object.keys(base)) {
    const v = Number(o[k]);
    out[k] = Number.isFinite(v) && v > 0 ? Math.floor(v) : 0;
    总 += out[k];
  }
  if (总 <= 0) return { ...base };
  return out as T;
}

export function loadVaultRaidConfig(): VaultRaidConfig {
  try {
    const text = readA(VAULT_RAID_CONFIG_PATH);
    if (!text || text === '无' || text === 'false') return defaultVaultRaidConfig();
    return normalizeVaultRaidConfig(JSON.parse(text));
  } catch {
    return defaultVaultRaidConfig();
  }
}

/** 读配置文件的**原始对象**（未补默认值），用于判断哪些字段被用户改过 */
export function 读原始配置(): Record<string, unknown> {
  try {
    const text = readA(VAULT_RAID_CONFIG_PATH);
    if (!text || text === '无' || text === 'false') return {};
    const v = JSON.parse(text);
    return (v && typeof v === 'object') ? (v as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

/**
 * 保存配置。
 * 关键约定：开启「自动抬价」时，若某个前两档字段的值**等于默认值**，
 * 就不写进文件 —— 这样它就保持「自动」状态，能被抬价系数放大。
 * 一旦用户填了别的数，该字段被落盘，从此锁定为固定值，不再参与抬价。
 */
export function saveVaultRaidConfig(raw: unknown): VaultRaidConfig {
  const cfg = normalizeVaultRaidConfig(raw);
  const 默认 = defaultVaultRaidConfig();
  const 输出: Record<string, unknown> = { ...cfg };
  if (cfg.自动抬价) {
    for (const f of 抬价字段表) {
      if (Number(输出[f]) === Number(默认[f])) delete 输出[f];
    }
  }
  writeA(VAULT_RAID_CONFIG_PATH, JSON.stringify(输出, null, 2));
  return cfg;
}

// ---------------------------------------------------------------------------
// 实时抬价：前两档随经济体量放大
// ---------------------------------------------------------------------------

/** 现金账本与银行账本（用于算人均净资产） */
const 现金账本 = '筱筱吖/娱乐系统/游戏数据/归笺.json';
const 存款账本 = '筱筱吖/娱乐系统/游戏数据/银行系统/银行归笺.json';
/** 经济指数缓存文件 */
const 经济缓存文件 = `${VAULT_RAID_DIR}/经济指数.json`;
/** 缓存多久重算一次（秒） */
const 经济缓存秒 = 30 * 60;
/** 抬价系数的上下限：永远不低于 1（不缩水），最多 30 倍 */
const 抬价下限 = 1;
const 抬价上限 = 30;

function 读账本(file: string): Record<string, number> {
  try {
    const text = readA(file);
    if (!text || text === '无') return {};
    const v = JSON.parse(text);
    return (v && typeof v === 'object') ? (v as Record<string, number>) : {};
  } catch {
    return {};
  }
}

/** 人均净资产 = 全体（现金 + 存款）之和 / 人数 */
export function 计算人均净资产(): number {
  const 现金 = 读账本(现金账本);
  const 存款 = 读账本(存款账本);
  const 人 = new Set([...Object.keys(现金), ...Object.keys(存款)]);
  if (人.size === 0) return 0;
  let 总 = 0;
  for (const id of 人) {
    总 += Math.max(0, Number(现金[id]) || 0) + Math.max(0, Number(存款[id]) || 0);
  }
  return 总 / 人.size;
}

/**
 * 抬价系数 = clamp( sqrt(人均净资产 / 基准人均), 1, 30 )
 *
 * 走平方根曲线：与「打工」的标准时薪同一套 philosophy —— 全服越富涨得越多，
 * 但涨幅远慢于财富膨胀，永远不会失控。基准 5000 时系数恰好为 1。
 * 结果缓存 30 分钟，避免每次闯库都去遍历全部账本。
 */
export function 抬价系数(cfg?: VaultRaidConfig, 强制重算 = false): number {
  const conf = cfg || loadVaultRaidConfig();
  if (!conf.自动抬价) return 1;
  const 现在 = Math.floor(Date.now() / 1000);
  if (!强制重算) {
    const 缓存时间 = Number(readB(经济缓存文件, '时间', 0)) || 0;
    const 缓存值 = Number(readB(经济缓存文件, '系数', 0)) || 0;
    if (缓存值 > 0 && 现在 - 缓存时间 < 经济缓存秒) return 缓存值;
  }
  const 人均 = 计算人均净资产();
  const 基准 = Math.max(1, Number(conf.基准人均) || 1);
  const k = Math.min(抬价上限, Math.max(抬价下限, Math.sqrt(人均 / 基准)));
  const 结果 = Math.round(k * 100) / 100;
  writeB(经济缓存文件, '系数', 结果);
  writeB(经济缓存文件, '时间', 现在);
  writeB(经济缓存文件, '人均净资产', Math.floor(人均));
  return 结果;
}

/** 清掉抬价缓存（改了基准/开关后立刻生效） */
export function 清抬价缓存(): void {
  writeB(经济缓存文件, '时间', 0);
}

/**
 * 取**生效配置**：把未自定义的前两档字段按抬价系数放大后返回。
 * 同时回传系数与命中的字段，便于回执/后台展示。
 */
export function 有效配置(): { 配置: VaultRaidConfig; 系数: number; 抬价字段: string[] } {
  const 原始 = 读原始配置();
  const cfg = normalizeVaultRaidConfig(原始);
  const k = 抬价系数(cfg);
  const 默认 = defaultVaultRaidConfig();
  const 配置: VaultRaidConfig = { ...cfg };
  const 抬价字段: string[] = [];
  if (cfg.自动抬价 && k !== 1) {
    for (const f of 抬价字段表) {
      // 字段没被显式写进配置文件 → 视为「未自定义」→ 跟着抬价走
      if (!(f in 原始)) {
        (配置 as Record<string, unknown>)[f] = Math.max(1, Math.round(Number(默认[f]) * k));
        抬价字段.push(f);
      }
    }
  }
  return { 配置, 系数: k, 抬价字段 };
}

// ---------------------------------------------------------------------------
// 金库
// ---------------------------------------------------------------------------

/** 银行金库现值（全局一个池）；读不到就当 0 */
export function 读金库(): number {
  const v = Number(readB(VAULT_RAID_FUND_PATH, 金库键, 0));
  return Number.isFinite(v) && v > 0 ? Math.floor(v) : 0;
}

/** 写金库；受「金库上限」约束（0 = 不限），永不为负 */
export function 写金库(新值: number, cfg?: VaultRaidConfig): number {
  const conf = cfg || loadVaultRaidConfig();
  let v = Math.max(0, Math.floor(Number(新值) || 0));
  if (conf.金库上限 > 0) v = Math.min(v, conf.金库上限);
  writeB(VAULT_RAID_FUND_PATH, 金库键, v);
  return v;
}

/** 金库入账（罚没充公 / 主人注入 / 利息税），返回入账后的值 */
export function 金库入账(金额: number, cfg?: VaultRaidConfig): number {
  const 入 = Math.max(0, Math.floor(Number(金额) || 0));
  return 写金库(读金库() + 入, cfg);
}

/** 金库出账（成功奖励），不会出成负数，返回实际出账金额 */
export function 金库出账(金额: number, cfg?: VaultRaidConfig): number {
  const 现有 = 读金库();
  const 出 = Math.min(现有, Math.max(0, Math.floor(Number(金额) || 0)));
  写金库(现有 - 出, cfg);
  return 出;
}

// ---------------------------------------------------------------------------
// 反白嫖：风险敞口
// ---------------------------------------------------------------------------

/**
 * 风险敞口 = 现有货币 × 敞口倍数 + 银行存款 × 存款敞口系数
 *
 * 逻辑：你能赢多少，取决于你能输多少。
 * 惩罚只扣「现有货币」，所以钱存在银行里是安全的 —— 但敞口也只按系数打折。
 * 想搏大的就得把钱取出来放着，于是暴露在罚没风险里。
 * 身无分文的人敞口接近 0，抽中隐藏级也拿不到多少，代价则是失败必吃禁言。
 */
export function calc敞口(现有货币: number, 银行存款: number, cfg?: VaultRaidConfig): number {
  const conf = cfg || loadVaultRaidConfig();
  const 现金 = Math.max(0, Math.floor(Number(现有货币) || 0));
  const 存款 = Math.max(0, Math.floor(Number(银行存款) || 0));
  const v = 现金 * Math.max(0, conf.敞口倍数) + 存款 * Math.max(0, conf.存款敞口系数);
  return Math.max(0, Math.floor(v));
}

/** 空手门槛：现有货币与银行存款皆为 0 → 不允许参与 */
export function 是空手(现有货币: number, 银行存款: number): boolean {
  return Math.max(0, Math.floor(Number(现有货币) || 0)) <= 0 &&
    Math.max(0, Math.floor(Number(银行存款) || 0)) <= 0;
}

// ---------------------------------------------------------------------------
// 档位抽取与金额计算
// ---------------------------------------------------------------------------

function 整数随机(最小: number, 最大: number): number {
  const lo = Math.ceil(Math.min(最小, 最大));
  const hi = Math.floor(Math.max(最小, 最大));
  if (hi <= lo) return lo;
  return Math.floor(Math.random() * (hi - lo + 1)) + lo;
}

function 小数随机(最小: number, 最大: number): number {
  const lo = Math.min(最小, 最大);
  const hi = Math.max(最小, 最大);
  if (hi <= lo) return lo;
  return Math.random() * (hi - lo) + lo;
}

/** 按权重抽一个键 */
function 按权重抽<T extends string>(权重: Record<T, number>): T {
  const keys = Object.keys(权重) as T[];
  const 总 = keys.reduce((s, k) => s + Math.max(0, Number(权重[k]) || 0), 0);
  if (总 <= 0) return keys[0];
  let r = Math.random() * 总;
  for (const k of keys) {
    r -= Math.max(0, Number(权重[k]) || 0);
    if (r < 0) return k;
  }
  return keys[keys.length - 1];
}

export function 抽奖励档位(cfg?: VaultRaidConfig): 奖励档位 {
  const conf = cfg || loadVaultRaidConfig();
  return 按权重抽(conf.奖励权重 as unknown as Record<奖励档位, number>);
}

export function 抽惩罚档位(cfg?: VaultRaidConfig): 惩罚档位 {
  const conf = cfg || loadVaultRaidConfig();
  return 按权重抽(conf.惩罚权重 as unknown as Record<惩罚档位, number>);
}

/**
 * 按档位算成功奖励的**原始值**（还没封顶、还没管金库够不够）。
 * 高等看金库现值，隐藏级看用户现有货币。
 */
export function calc奖励(档位: 奖励档位, 现有货币: number, 金库现值: number, cfg?: VaultRaidConfig): number {
  const conf = cfg || loadVaultRaidConfig();
  const 现金 = Math.max(0, Math.floor(Number(现有货币) || 0));
  const 库 = Math.max(0, Math.floor(Number(金库现值) || 0));
  switch (档位) {
    case '低等':
      return Math.max(0, Math.floor(conf.低等奖励));
    case '中等':
      return 整数随机(conf.中等奖励最小, conf.中等奖励最大);
    case '高等': {
      const 百分比 = 小数随机(conf.高等奖励最小百分比, conf.高等奖励最大百分比);
      return Math.floor(库 * 百分比 / 100);
    }
    case '隐藏': {
      const 倍数 = 小数随机(conf.隐藏最小倍数, conf.隐藏最大倍数);
      return Math.floor(现金 * 倍数);
    }
    default:
      return 0;
  }
}

/** 按档位算失败罚款（还没管余额够不够）；返回值已整数化且不小于 0 */
export function calc罚款(档位: 惩罚档位, 现有货币: number, cfg?: VaultRaidConfig): number {
  const conf = cfg || loadVaultRaidConfig();
  const 现金 = Math.max(0, Math.floor(Number(现有货币) || 0));
  switch (档位) {
    case '低等':
      return Math.max(0, Math.floor(conf.低等惩罚));
    case '中等':
      return 整数随机(conf.中等惩罚最小, conf.中等惩罚最大);
    case '高等': {
      const 百分比 = 小数随机(conf.高等惩罚最小百分比, conf.高等惩罚最大百分比);
      return Math.floor(现金 * 百分比 / 100);
    }
    case '隐藏':
      // 隐藏惩罚：清空现有货币（银行存款不动）
      return 现金;
    default:
      return 0;
  }
}

/** 基础惩罚：禁言分钟数（区间随机，整数） */
export function calc禁言分钟(cfg?: VaultRaidConfig): number {
  const conf = cfg || loadVaultRaidConfig();
  return 整数随机(conf.禁言最小分钟, conf.禁言最大分钟);
}

/** 是否成功（按配置的成功率掷骰） */
export function 掷成败(cfg?: VaultRaidConfig): boolean {
  const conf = cfg || loadVaultRaidConfig();
  const 率 = Math.min(100, Math.max(0, Number(conf.成功率) || 0));
  return Math.random() * 100 < 率;
}

// ---------------------------------------------------------------------------
// 冷却
// ---------------------------------------------------------------------------

/** 冷却是否仍未结束；返回剩余秒数（<=0 表示可以玩） */
export function 剩余冷却秒(QQ: string | number, cfg?: VaultRaidConfig): number {
  const conf = cfg || loadVaultRaidConfig();
  const 到期 = Number(readB(VAULT_RAID_COOLDOWN_PATH, String(QQ), 0)) || 0;
  return Math.max(0, Math.ceil(到期 - Date.now() / 1000));
}

/** 写入冷却到期时间 */
export function 写冷却(QQ: string | number, cfg?: VaultRaidConfig): number {
  const conf = cfg || loadVaultRaidConfig();
  const 到期 = Math.floor(Date.now() / 1000) + Math.max(0, Math.floor(conf.冷却分钟) * 60);
  writeB(VAULT_RAID_COOLDOWN_PATH, String(QQ), 到期);
  return 到期;
}

// ---------------------------------------------------------------------------
// 统计与流水
// ---------------------------------------------------------------------------

export type 闯金库统计 = { 成功: number; 失败: number; 净收益: number };

export function 读统计(QQ: string | number): 闯金库统计 {
  const v = readB(VAULT_RAID_STAT_PATH, String(QQ), null);
  const o = (v && typeof v === 'object') ? (v as Record<string, unknown>) : {};
  return {
    成功: Math.max(0, Math.floor(Number(o.成功) || 0)),
    失败: Math.max(0, Math.floor(Number(o.失败) || 0)),
    净收益: Math.floor(Number(o.净收益) || 0),
  };
}

export function 累加统计(QQ: string | number, 成功与否: boolean, 增减: number): 闯金库统计 {
  const 旧 = 读统计(QQ);
  const 新: 闯金库统计 = {
    成功: 旧.成功 + (成功与否 ? 1 : 0),
    失败: 旧.失败 + (成功与否 ? 0 : 1),
    净收益: 旧.净收益 + Math.floor(增减 || 0),
  };
  writeB(VAULT_RAID_STAT_PATH, String(QQ), 新);
  return 新;
}

export type 闯金库流水 = {
  时间: string;
  时间戳: number;
  群号: string;
  QQ: string;
  指令: string;
  结果: '成功' | '失败';
  档位: string;
  增减: number;
  原本: number;
  现在: number;
  银行存款: number;
  金库原本: number;
  金库现在: number;
  禁言分钟: number;
  免死金牌: boolean;
  冷却到期: number;
};

/** 追加一条流水（新的在前），并截断到上限 */
export function 写流水(群号: string | number, 记录: 闯金库流水): void {
  const 文件 = vaultRaidLogPath(群号);
  let 列表: 闯金库流水[] = [];
  try {
    const text = readA(文件);
    if (text && text !== '无') {
      const v = JSON.parse(text);
      if (Array.isArray(v)) 列表 = v as 闯金库流水[];
    }
  } catch {
    列表 = [];
  }
  列表.unshift(记录);
  if (列表.length > VAULT_RAID_LOG_LIMIT) 列表 = 列表.slice(0, VAULT_RAID_LOG_LIMIT);
  writeA(文件, JSON.stringify(列表, null, 2));
}

/** 时间格式化：YYYY-MM-DD HH:mm:ss */
export function 格式化时间(时间戳毫秒?: number): string {
  const d = new Date(Number.isFinite(时间戳毫秒) ? (时间戳毫秒 as number) : Date.now());
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}
