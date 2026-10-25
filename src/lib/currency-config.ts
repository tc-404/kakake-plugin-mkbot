// ---------------------------------------------------------------------------
// 货币与产出配置：货币名称（三级单位）、签到名次奖励、打工参数
// WebUI「修改道具 · 货币配置」与运行时共用
// ---------------------------------------------------------------------------

import { readA, writeA } from '../data-fs';

export const CURRENCY_CONFIG_PATH = '筱筱吖/娱乐系统/货币配置/全局设置.json';

/** 历史硬编码货币名：改名后永久作为指令别名保留，老用户指令不会失效 */
export const LEGACY_CURRENCY_NAME = '归笺';

/** 数值区间 */
export type Range = { 最小: number; 最大: number };

/** 三级货币单位 + 换算比例 */
export type CurrencyNameConfig = {
  基础名: string;
  二级名: string;
  三级名: string;
  /** 多少「基础」= 1「二级」 */
  二级比例: number;
  /** 多少「二级」= 1「三级」 */
  三级比例: number;
};

/** 签到奖励：1~10 名各一档 + 第 10 名之后共用兜底档 */
export type SigninRewardConfig = {
  /** 键 "1".."10"；null = 未配置，运行时回退内置阶梯 */
  名次: Record<string, Range | null>;
  /** 第 10 名之后共用；null = 回退内置兜底 */
  兜底: Range | null;
  /**
   * 诱饵：与名次一一对应，键 "1".."10" + "兜底"；null = 未配置，运行时回退内置档。
   * 旧版只有「前三 / 其他」两档，normalize 时会自动展开迁移到对应名次上。
   */
  诱饵: Record<string, Range | null>;
};

/** 打工参数（对应 work-job.ts 中原先的硬编码常量） */
export type WorkParamConfig = {
  保底基数: number;
  时薪下限: number;
  财富系数: number;
  标准工时: number;
  计薪上限工时: number;
  加班倍率: number;
  夜班倍率: number;
  早退折扣: number;
  单日跌幅上限: number;
  每日浮动: number;
  白班起点: number;
  夜班起点: number;
};

export type CurrencyConfig = {
  货币: CurrencyNameConfig;
  签到: SigninRewardConfig;
  打工: WorkParamConfig;
};

// ---------------------------------------------------------------------------
// 默认值
// ---------------------------------------------------------------------------

/** 签到第 10 名之后（以及未配置档位）的内置兜底，沿用 rand(15,49) */
export const DEFAULT_SIGNIN_FALLBACK: Range = { 最小: 15, 最大: 49 };
export const DEFAULT_BAIT_前三: Range = { 最小: 4, 最大: 8 };
export const DEFAULT_BAIT_其他: Range = { 最小: 1, 最大: 5 };

/** 内置诱饵阶梯（前端 placeholder 来源）：前三 4~8，其余与兜底 1~5 */
export function defaultSigninBaitLadder(): Record<string, Range> {
  const 前三 = { ...DEFAULT_BAIT_前三 };
  const 其他 = { ...DEFAULT_BAIT_其他 };
  const out: Record<string, Range> = {};
  for (let i = 1; i <= 10; i++) out[String(i)] = i <= 3 ? { ...前三 } : { ...其他 };
  out.兜底 = { ...其他 };
  return out;
}

/** 内置签到阶梯：也是前端 placeholder 的数据来源 */
export function defaultSigninLadder(): Record<string, Range> {
  const 兜底 = { ...DEFAULT_SIGNIN_FALLBACK };
  return {
    '1': { 最小: 90, 最大: 125 },
    '2': { 最小: 75, 最大: 89 },
    '3': { 最小: 50, 最大: 74 },
    '4': { ...兜底 },
    '5': { ...兜底 },
    '6': { ...兜底 },
    '7': { ...兜底 },
    '8': { ...兜底 },
    '9': { ...兜底 },
    '10': { ...兜底 },
  };
}

export function defaultCurrencyConfig(): CurrencyConfig {
  return {
    货币: { 基础名: '归笺', 二级名: '玉笺', 三级名: '玉令', 二级比例: 1000, 三级比例: 100 },
    签到: {
      // 仅写入 1~3 名的真实默认；4~10 与兜底留空（前端以 placeholder 提示 15~49）
      名次: {
        '1': { 最小: 90, 最大: 125 },
        '2': { 最小: 75, 最大: 89 },
        '3': { 最小: 50, 最大: 74 },
      },
      兜底: null,
      // 全部留空由用户自己填（normalize 后会补齐 1~10 + 兜底 共 11 个键）
      诱饵: {},
    },
    打工: {
      保底基数: 4,
      时薪下限: 5,
      财富系数: 0.03,
      标准工时: 8,
      计薪上限工时: 12,
      加班倍率: 1.5,
      夜班倍率: 1.25,
      早退折扣: 0.9,
      单日跌幅上限: 0.12,
      每日浮动: 0.06,
      白班起点: 8,
      夜班起点: 20,
    },
  };
}

/** 前端 placeholder 用的全量默认值（含展开后的 4~10 名阶梯） */
export function defaultCurrencyPayload() {
  return {
    货币: { ...defaultCurrencyConfig().货币 },
    签到: {
      名次: defaultSigninLadder(),
      兜底: { ...DEFAULT_SIGNIN_FALLBACK },
      诱饵: defaultSigninBaitLadder(),
    },
    打工: { ...defaultCurrencyConfig().打工 },
  };
}

// ---------------------------------------------------------------------------
// 规范化
// ---------------------------------------------------------------------------

function clampInt(v: unknown, lo: number, hi: number, fb: number): number {
  if (v === null || v === undefined || v === '') return fb;
  const n = Number(v);
  if (!Number.isFinite(n)) return fb;
  return Math.min(hi, Math.max(lo, Math.floor(n)));
}

function clampNum(v: unknown, lo: number, hi: number, fb: number): number {
  if (v === null || v === undefined || v === '') return fb;
  const n = Number(v);
  if (!Number.isFinite(n)) return fb;
  return Number(Math.min(hi, Math.max(lo, n)).toFixed(4));
}

/** 名称净化：去空白与危险字符（防止破坏指令正则 / 文件路径 / SVG），限长 12 */
function sanitizeName(v: unknown, fallback: string): string {
  const s = String(v ?? '')
    .replace(/[\s\u3000]/g, '')
    .replace(/[#\\/:*?"'<>|[\]{}()^$+?.!&,;=@~`]/g, '')
    .slice(0, 12);
  return s || fallback;
}

/**
 * 区间规范化。
 * 区分「清空回退默认」与「显式填 0」：空串/null/undefined => null（未配置）；数字 0 合法。
 * 必须在 Number() 之前先判空串，否则 Number('') === 0 会把"清空"误判成"填 0"。
 */
function normRange(v: unknown): Range | null {
  if (v === null || v === undefined) return null;
  if (typeof v === 'string' && v.trim() === '') return null;
  if (typeof v === 'number') {
    if (!Number.isFinite(v)) return null;
    const n = Math.max(0, Math.floor(v));
    return { 最小: n, 最大: n };
  }
  if (!v || typeof v !== 'object' || Array.isArray(v)) return null;
  const o = v as Record<string, unknown>;
  const rawMin = o.最小;
  const rawMax = o.最大;
  // 只填一侧视为未配置，避免产生半截区间
  if (rawMin === null || rawMin === undefined || rawMin === '') return null;
  if (rawMax === null || rawMax === undefined || rawMax === '') return null;
  if (typeof rawMin === 'string' && rawMin.trim() === '') return null;
  if (typeof rawMax === 'string' && rawMax.trim() === '') return null;
  const a = Number(rawMin);
  const b = Number(rawMax);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  let 最小 = Math.min(1e9, Math.max(0, Math.floor(a)));
  let 最大 = Math.min(1e9, Math.max(0, Math.floor(b)));
  if (最小 > 最大) {
    const t = 最小;
    最小 = 最大;
    最大 = t;
  }
  return { 最小, 最大 };
}

export function normalizeCurrencyConfig(raw: unknown): CurrencyConfig {
  const base = defaultCurrencyConfig();
  const o = raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, any>) : {};
  const 货币In = o.货币 && typeof o.货币 === 'object' ? o.货币 : {};
  const 签到In = o.签到 && typeof o.签到 === 'object' ? o.签到 : {};
  const 打工In = o.打工 && typeof o.打工 === 'object' ? o.打工 : {};
  const 名次In = 签到In.名次 && typeof 签到In.名次 === 'object' ? 签到In.名次 : {};
  const 诱饵In = 签到In.诱饵 && typeof 签到In.诱饵 === 'object' ? 签到In.诱饵 : {};

  const 名次: Record<string, Range | null> = {};
  for (let i = 1; i <= 10; i++) 名次[String(i)] = normRange(名次In[String(i)]);

  // 诱饵：新结构是 1~10 + 兜底 共 11 档。旧结构只有「前三 / 其他」两档，
  // 首次读到这里会把旧值铺到对应名次上完成迁移；迁移后存档即带全 11 个键，
  // 之后用户主动清空某一档时以「键存在但值为 null」为准，不会被旧值捞回来。
  const hasOwn = (o: Record<string, unknown>, k: string) => Object.prototype.hasOwnProperty.call(o, k);
  const 旧前三 = normRange(诱饵In.前三);
  const 旧其他 = normRange(诱饵In.其他);
  const 诱饵: Record<string, Range | null> = {};
  for (let i = 1; i <= 10; i++) {
    const k = String(i);
    诱饵[k] = hasOwn(诱饵In, k) ? normRange(诱饵In[k]) : (i <= 3 ? 旧前三 : 旧其他);
  }
  诱饵.兜底 = hasOwn(诱饵In, '兜底') ? normRange(诱饵In.兜底) : 旧其他;

  return {
    货币: {
      基础名: sanitizeName(货币In.基础名, base.货币.基础名),
      二级名: sanitizeName(货币In.二级名, base.货币.二级名),
      三级名: sanitizeName(货币In.三级名, base.货币.三级名),
      二级比例: clampInt(货币In.二级比例, 2, 1e9, base.货币.二级比例),
      三级比例: clampInt(货币In.三级比例, 2, 1e9, base.货币.三级比例),
    },
    签到: {
      名次,
      兜底: normRange(签到In.兜底),
      诱饵,
    },
    打工: {
      保底基数: clampInt(打工In.保底基数, 0, 1e6, base.打工.保底基数),
      时薪下限: clampInt(打工In.时薪下限, 0, 1e6, base.打工.时薪下限),
      标准工时: clampInt(打工In.标准工时, 1, 24, base.打工.标准工时),
      计薪上限工时: clampInt(打工In.计薪上限工时, 1, 48, base.打工.计薪上限工时),
      白班起点: clampInt(打工In.白班起点, 0, 23, base.打工.白班起点),
      夜班起点: clampInt(打工In.夜班起点, 1, 23, base.打工.夜班起点),
      财富系数: clampNum(打工In.财富系数, 0, 2, base.打工.财富系数),
      加班倍率: clampNum(打工In.加班倍率, 1, 5, base.打工.加班倍率),
      夜班倍率: clampNum(打工In.夜班倍率, 1, 5, base.打工.夜班倍率),
      早退折扣: clampNum(打工In.早退折扣, 0, 1, base.打工.早退折扣),
      单日跌幅上限: clampNum(打工In.单日跌幅上限, 0, 1, base.打工.单日跌幅上限),
      每日浮动: clampNum(打工In.每日浮动, 0, 1, base.打工.每日浮动),
    },
  };
}

// ---------------------------------------------------------------------------
// 读写 + 缓存
// ---------------------------------------------------------------------------

export function loadCurrencyConfig(): CurrencyConfig {
  try {
    const text = readA(CURRENCY_CONFIG_PATH);
    if (!text || text === '无' || text === 'false') return defaultCurrencyConfig();
    return normalizeCurrencyConfig(JSON.parse(text));
  } catch {
    return defaultCurrencyConfig();
  }
}

let cache: { at: number; cfg: CurrencyConfig } | null = null;
const CACHE_TTL_MS = 3000;

export function clearCurrencyConfigCache(): void {
  cache = null;
}

/** 运行时读取入口：带 TTL，避免同一条消息里 moneyA 被反复调用导致重复读文件 */
export function getCurrencyConfig(ttlMs: number = CACHE_TTL_MS): CurrencyConfig {
  const now = Date.now();
  if (cache && now - cache.at < ttlMs) return cache.cfg;
  const cfg = loadCurrencyConfig();
  cache = { at: now, cfg };
  return cfg;
}

export function saveCurrencyConfig(raw: unknown): CurrencyConfig {
  const cfg = normalizeCurrencyConfig(raw);
  writeA(CURRENCY_CONFIG_PATH, JSON.stringify(cfg, null, 2));
  cache = { at: Date.now(), cfg };
  return cfg;
}

// ---------------------------------------------------------------------------
// 对外 getter
// ---------------------------------------------------------------------------

/** 基础货币名：所有展示文案与指令的唯一来源 */
export function 基础货币名(): string {
  return getCurrencyConfig().货币.基础名;
}

/** moneyA 专用：三级名称 + 换算比例（AC = 二级比例 × 三级比例） */
export function 货币换算(): { 名1: string; 名2: string; 名3: string; BC: number; AC: number } {
  const c = getCurrencyConfig().货币;
  return {
    名1: c.基础名,
    名2: c.二级名,
    名3: c.三级名,
    BC: c.二级比例,
    AC: c.二级比例 * c.三级比例,
  };
}

/**
 * 签到名次 → 货币区间。
 * 回退链刻意不让 1~10 名去吃「兜底」档：兜底是「第 10 名之后」的专属配置，
 * 前 10 名留空时应当回退各自的默认原值，而不是被兜底档覆盖。
 */
export function resolveSigninRange(序号: number): Range {
  const n = Math.floor(Number(序号) || 0);
  const c = getCurrencyConfig().签到;
  if (n >= 1 && n <= 10) {
    const 档 = c.名次[String(n)];
    if (档) return 档;
    return defaultSigninLadder()[String(n)] || DEFAULT_SIGNIN_FALLBACK;
  }
  return c.兜底 || DEFAULT_SIGNIN_FALLBACK;
}

/** 签到名次 → 诱饵区间（同上：1~10 各一档，留空回退默认原值；>10 才走兜底档） */
export function resolveSigninBaitRange(序号: number): Range {
  const n = Math.floor(Number(序号) || 0);
  const c = getCurrencyConfig().签到;
  if (n >= 1 && n <= 10) {
    const 档 = c.诱饵[String(n)];
    if (档) return 档;
    return n <= 3 ? DEFAULT_BAIT_前三 : DEFAULT_BAIT_其他;
  }
  return c.诱饵.兜底 || DEFAULT_BAIT_其他;
}

/** 打工参数（work-job.ts 唯一入口） */
export function 打工参数(): WorkParamConfig {
  return getCurrencyConfig().打工;
}

// ---------------------------------------------------------------------------
// 指令别名：新旧货币名同时生效
// ---------------------------------------------------------------------------

export type CurrencyCommandKind = '我的' | '排行榜' | '银行排行榜';

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** 当前货币名 + 历史货币名（去重） */
function 货币名集合(): string[] {
  const now = 基础货币名();
  return Array.from(new Set([now, LEGACY_CURRENCY_NAME].filter((s) => !!s)));
}

export function matchCurrencyCommand(message: string, kind: CurrencyCommandKind): boolean {
  const m = String(message ?? '').trim();
  return 货币名集合().some((n) => {
    if (kind === '我的') return m === `我的${n}`;
    if (kind === '排行榜') return m === `${n}排行榜`;
    if (kind === '银行排行榜') return m === `银行${n}排行榜`;
    return false;
  });
}

/** 转移 X#QQ#数量 */
export function matchCurrencyTransfer(message: string): { 目标: string; 数量: number } | null {
  const names = 货币名集合().map(escapeRe).join('|');
  if (!names) return null;
  const m = String(message ?? '').trim().match(new RegExp(`^转移(?:${names})#(\\d+)#(\\d+)$`));
  if (!m) return null;
  return { 目标: m[1], 数量: Number(m[2]) };
}
