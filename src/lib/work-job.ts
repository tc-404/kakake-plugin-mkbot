// ---------------------------------------------------------------------------
// 娱乐·打工：岗位表、工时切分（整小时）、日/夜班与加班工资、每日标准时薪刷新
// 全局玩法：数据不分群，与「归笺」一致；开关走娱乐分项「打工」（仅后台可改）
// ---------------------------------------------------------------------------

import { readA, readB, writeB, deleteKey } from '../data-fs';

/** 娱乐分项键名 */
export const WORK_ENT_KEY = '打工';

const MONEY_FILE = '筱筱吖/娱乐系统/游戏数据/归笺.json';
const BANK_FILE = '筱筱吖/娱乐系统/游戏数据/银行系统/银行归笺.json';

/** 进行中的打工记录：QQ → WorkState */
export const WORK_STATE_FILE = '筱筱吖/娱乐系统/打工玩法/打工中.json';
/** 每日标准时薪：日期(y-m-d) → DailyWageRecord */
export const WORK_WAGE_FILE = '筱筱吖/娱乐系统/打工玩法/标准时薪.json';

/** 标准工时（小时），到此为止按标准时薪结算 */
export const WORK_STANDARD_HOURS = 8;
/** 单次最多计薪工时（小时），超出部分结算时直接丢弃 */
export const WORK_MAX_HOURS = 12;
/** 加班（第 9~12 小时）倍率 */
export const WORK_OVERTIME_RATE = 1.5;
/** 夜班倍率（相对同岗位白班时薪） */
export const WORK_NIGHT_RATE = 1.25;
/** 不满标准工时提前结算的折扣 */
export const WORK_EARLY_LEAVE_RATE = 0.9;
/** 白班起点小时（含） */
export const WORK_DAY_START_HOUR = 8;
/** 夜班起点小时（含） */
export const WORK_NIGHT_START_HOUR = 20;

/**
 * 标准时薪只有下限，没有上限：时薪永远按当天全服真实财富现算，人均越高就一直往上涨。
 * 参照物：签到普通名次一天 15~49 归笺、前三 90~125（周末 ×1.5，一天上限约 187）。
 * 靠平方根曲线而不是靠封顶来防通胀——人均 20 万时满 8 小时约等于一天签到上限，
 * 人均涨到 100 万、1 亿时时薪继续涨，但涨幅始终远慢于财富本身的膨胀速度。
 */
const WAGE_MIN = 5;
/** 无产阶级保底时薪：全服一穷二白时也有活干 */
const WAGE_BASE = 4;
/** 财富项走平方根，越富涨得越慢（人均1万→+3，20万→+13，100万→+30，1亿→+300），不设封顶 */
const WEALTH_SQRT_RATIO = 0.03;
/** 与昨日标准时薪相比的单日最大跌幅：只防「一夜之间腰斩」，上涨不设限 */
const WAGE_DAILY_STEP = 0.12;
/** 每日随机浮动幅度（按日期确定性取值，同一天多次读取结果一致） */
const WAGE_JITTER = 0.06;
/** 商店物价指数夹取范围 */
const PRICE_INDEX_MIN = 0.7;
const PRICE_INDEX_MAX = 1.4;

/**
 * 岗位工资档案：每个岗位一套独立公式，不是同一条公式乘个数字。
 * - 系数：白班基础时薪 = 当日标准时薪 × 系数
 * - 夜班倍率：该岗位夜班时薪 = 白班基础时薪 × 夜班倍率（夜班补贴各岗不同）
 * - 加班倍率：该岗位第 9~12 小时的倍率（体力岗高、技术岗低）
 * - 绩效：每个整点小时的确定性浮动幅度（±比例，提成岗波动大、固定岗几乎不动）
 * - 满勤奖：满标准工时时一次性奖励 = 白班基础时薪 × 满勤奖
 */
export interface WorkPostDef {
  岗位: string;
  系数: number;
  夜班倍率: number;
  加班倍率: number;
  绩效: number;
  满勤奖: number;
}

/** 工作区 → 岗位表（每个岗位的四项参数都不一样，1.00 系数为基准岗） */
export const WORK_AREAS: Record<string, WorkPostDef[]> = {
  商店: [
    { 岗位: '收银员', 系数: 1.0, 夜班倍率: 1.3, 加班倍率: 1.5, 绩效: 0.04, 满勤奖: 0.5 },
    { 岗位: '推销员', 系数: 1.12, 夜班倍率: 1.15, 加班倍率: 1.4, 绩效: 0.18, 满勤奖: 0.3 },
    { 岗位: '搬运员', 系数: 1.18, 夜班倍率: 1.2, 加班倍率: 1.6, 绩效: 0.06, 满勤奖: 0.8 },
  ],
  驾车: [
    { 岗位: '出租车司机', 系数: 1.22, 夜班倍率: 1.4, 加班倍率: 1.35, 绩效: 0.15, 满勤奖: 0.4 },
    { 岗位: '网约车司机', 系数: 1.15, 夜班倍率: 1.35, 加班倍率: 1.4, 绩效: 0.12, 满勤奖: 0.6 },
    { 岗位: '送外卖', 系数: 1.08, 夜班倍率: 1.3, 加班倍率: 1.55, 绩效: 0.2, 满勤奖: 1.0 },
  ],
  工厂: [
    { 岗位: '流水线员工', 系数: 1.1, 夜班倍率: 1.25, 加班倍率: 1.5, 绩效: 0.03, 满勤奖: 1.2 },
    { 岗位: '打包装', 系数: 1.02, 夜班倍率: 1.2, 加班倍率: 1.45, 绩效: 0.05, 满勤奖: 0.9 },
    { 岗位: '搬运员', 系数: 1.2, 夜班倍率: 1.22, 加班倍率: 1.65, 绩效: 0.06, 满勤奖: 0.7 },
  ],
  餐馆: [
    { 岗位: '大厨', 系数: 1.35, 夜班倍率: 1.18, 加班倍率: 1.3, 绩效: 0.08, 满勤奖: 0.6 },
    { 岗位: '端菜员工', 系数: 1.0, 夜班倍率: 1.25, 加班倍率: 1.5, 绩效: 0.1, 满勤奖: 0.5 },
    { 岗位: '收银员', 系数: 1.05, 夜班倍率: 1.22, 加班倍率: 1.45, 绩效: 0.04, 满勤奖: 0.4 },
    { 岗位: '清洁工', 系数: 0.95, 夜班倍率: 1.35, 加班倍率: 1.55, 绩效: 0.02, 满勤奖: 1.1 },
  ],
};

/** 岗位档案缺失时的兜底（岗位表改名 / 旧数据），用全局默认倍率、无绩效无满勤奖 */
export function defaultWorkPost(post = ''): WorkPostDef {
  return {
    岗位: String(post || ''),
    系数: 1,
    夜班倍率: WORK_NIGHT_RATE,
    加班倍率: WORK_OVERTIME_RATE,
    绩效: 0,
    满勤奖: 0,
  };
}

/** 按 工作区+岗位 取岗位档案，取不到给兜底档案 */
export function resolveWorkPost(area: unknown, post: unknown): WorkPostDef {
  const list = WORK_AREAS[String(area ?? '')];
  const hit = list?.find((p) => p.岗位 === String(post ?? ''));
  return hit ? { ...hit } : defaultWorkPost(String(post ?? ''));
}

export function workAreaNames(): string[] {
  return Object.keys(WORK_AREAS);
}

export function isWorkArea(name: unknown): boolean {
  return Object.prototype.hasOwnProperty.call(WORK_AREAS, String(name ?? ''));
}

/** 极简菜单正文：一行一个工作区，只列岗位名 */
export function workMenuLines(): string[] {
  return workAreaNames().map((area) => `${area} - ${WORK_AREAS[area].map((p) => p.岗位).join('、')}`);
}

/** 秒 → 「X小时Y分钟」，0 秒返回「0分钟」 */
export function formatWorkDuration(seconds: number): string {
  const s = Math.max(0, Math.floor(Number(seconds) || 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h > 0) return m > 0 ? `${h}小时${m}分钟` : `${h}小时`;
  return `${m}分钟`;
}

/** 在指定工作区内随机分配岗位 */
export function pickWorkPost(area: string): WorkPostDef | null {
  const list = WORK_AREAS[String(area ?? '')];
  if (!list || !list.length) return null;
  return list[Math.floor(Math.random() * list.length)];
}

function clampNum(v: number, lo: number, hi: number): number {
  if (!Number.isFinite(v)) return lo;
  return Math.min(hi, Math.max(lo, v));
}

function readMoneyMap(file: string): Map<string, number> {
  const out = new Map<string, number>();
  try {
    const raw = readA(file);
    if (!raw) return out;
    const obj = JSON.parse(raw) as Record<string, unknown>;
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return out;
    for (const [k, v] of Object.entries(obj)) {
      const n = Number(v);
      if (Number.isFinite(n)) out.set(String(k), n);
    }
  } catch {
    return out;
  }
  return out;
}

export interface WealthSnapshot {
  人数: number;
  中位数: number;
  截尾均值: number;
  稳健人均: number;
}

/**
 * 全局货币水平：以「中位数」为主、并用去掉首尾各 10% 的截尾均值封顶。
 * 目的是让个别千万富豪拉不动整体薪资水平。
 */
export function computeRobustWealth(): WealthSnapshot {
  const money = readMoneyMap(MONEY_FILE);
  const bank = readMoneyMap(BANK_FILE);
  const users = new Set<string>([...money.keys(), ...bank.keys()]);
  const vals: number[] = [];
  for (const u of users) {
    vals.push(Math.max(0, (money.get(u) || 0) + (bank.get(u) || 0)));
  }
  vals.sort((a, b) => a - b);
  const n = vals.length;
  if (!n) return { 人数: 0, 中位数: 0, 截尾均值: 0, 稳健人均: 0 };
  const 中位数 = n % 2 ? vals[(n - 1) / 2] : Math.floor((vals[n / 2 - 1] + vals[n / 2]) / 2);
  const cut = n > 4 ? Math.floor(n * 0.1) : 0;
  const core = cut > 0 ? vals.slice(cut, n - cut) : vals;
  const 截尾均值 = Math.floor(core.reduce((s, v) => s + v, 0) / (core.length || 1));
  let 稳健人均 = 中位数 > 0 ? 中位数 : 截尾均值;
  if (截尾均值 > 0) 稳健人均 = Math.min(稳健人均, Math.floor(截尾均值 * 1.5));
  return { 人数: n, 中位数, 截尾均值, 稳健人均: Math.max(0, Math.floor(稳健人均)) };
}

/** 商店物价指数：今日货架价 / 基准原价 的均值，夹到合理区间 */
export function computeShopPriceIndex(
  shelf: Array<{ 今日价: number; 原价: number }>,
): number {
  const ratios: number[] = [];
  for (const it of shelf || []) {
    const now = Number(it?.今日价);
    const base = Number(it?.原价);
    if (!Number.isFinite(now) || !Number.isFinite(base) || base <= 0 || now <= 0) continue;
    ratios.push(now / base);
  }
  if (!ratios.length) return 1;
  const avg = ratios.reduce((s, v) => s + v, 0) / ratios.length;
  return Number(clampNum(avg, PRICE_INDEX_MIN, PRICE_INDEX_MAX).toFixed(4));
}

/** 日期确定性抖动：同一天恒定，范围 ±WAGE_JITTER */
function dateJitter(dateKey: string): number {
  let h = 2166136261;
  const s = String(dateKey ?? '');
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  const unit = ((h >>> 0) % 10000) / 10000; // 0 ~ 0.9999
  return (unit * 2 - 1) * WAGE_JITTER;
}

/**
 * 纯计算：由稳健人均 + 物价指数 + 昨日时薪推导今日标准时薪。
 * 时薪 = (保底 4 + √稳健人均 × 0.03) × 物价指数 × 日抖动，只有 5 归笺/小时的下限，没有上限。
 * 平方根曲线让越富的服涨薪越慢，但永远还在涨：人均 1 万约 7/时，20 万约 17/时，
 * 100 万约 34/时，1 亿约 304/时——财富翻 100 倍，时薪只翻 10 倍。
 * 昨日时薪只用来限制单日跌幅（最多 -12%），上涨当天直接给到真实值，不会被压住。
 */
export function computeStandardHourlyWage(input: {
  日期: string;
  稳健人均: number;
  物价指数: number;
  昨日时薪?: number;
}): number {
  const idx = clampNum(Number(input?.物价指数) || 1, PRICE_INDEX_MIN, PRICE_INDEX_MAX);
  const wealth = Math.max(0, Number(input?.稳健人均) || 0);
  const 基准 = WAGE_BASE + Math.floor(Math.sqrt(wealth) * WEALTH_SQRT_RATIO);
  let hourly = Math.round(基准 * idx);
  hourly = Math.round(hourly * (1 + dateJitter(String(input?.日期 ?? ''))));
  hourly = Math.max(WAGE_MIN, hourly);
  // 昨日时薪只做「跌幅刹车」：跌不过 12%，涨多少都放行
  const 昨日 = Math.max(0, Math.floor(Number(input?.昨日时薪) || 0));
  if (昨日 > 0) {
    const lo = Math.floor(昨日 * (1 - WAGE_DAILY_STEP));
    if (hourly < lo) hourly = lo;
  }
  return Math.max(WAGE_MIN, Math.round(hourly));
}

export interface DailyWageRecord {
  日期: string;
  标准时薪: number;
  稳健人均: number;
  物价指数: number;
  统计人数: number;
  刷新时间: string;
}

/** y-m-d 往前推一天 */
function prevDateKey(dateKey: string): string {
  const m = String(dateKey ?? '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return '';
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  d.setDate(d.getDate() - 1);
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, '0');
  const da = String(d.getDate()).padStart(2, '0');
  return `${y}-${mo}-${da}`;
}

function normalizeWageRecord(raw: unknown, dateKey: string): DailyWageRecord | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const obj = raw as Record<string, unknown>;
  const wage = Math.floor(Number(obj.标准时薪) || 0);
  if (wage <= 0) return null;
  return {
    日期: String(obj.日期 || dateKey),
    标准时薪: wage,
    稳健人均: Math.max(0, Math.floor(Number(obj.稳健人均) || 0)),
    物价指数: Number(obj.物价指数) || 1,
    统计人数: Math.max(0, Math.floor(Number(obj.统计人数) || 0)),
    刷新时间: String(obj.刷新时间 || ''),
  };
}

/** 读某天已落盘的标准时薪（没有则 null），供状态查询等只读场景使用 */
export function readDailyStandardWage(dateKey: string): DailyWageRecord | null {
  return normalizeWageRecord(readB(WORK_WAGE_FILE, String(dateKey ?? ''), null), String(dateKey ?? ''));
}

/**
 * 取今日标准时薪：当天首个打工人触发刷新并落盘，其余人直接读缓存。
 * 返回 首次刷新=true 表示本次调用就是当天的那次刷新。
 * 物价指数支持传函数：命中缓存时不会调用，避免每次上班都全量扫商店货架。
 */
export function resolveDailyStandardWage(
  dateKey: string,
  opts?: { 物价指数?: number | (() => number); 刷新时间?: string },
): DailyWageRecord & { 首次刷新: boolean } {
  const cached = normalizeWageRecord(readB(WORK_WAGE_FILE, dateKey, null), dateKey);
  if (cached) return { ...cached, 首次刷新: false };

  const wealth = computeRobustWealth();
  let 指数原值 = 1;
  try {
    指数原值 = typeof opts?.物价指数 === 'function' ? Number(opts.物价指数()) : Number(opts?.物价指数);
  } catch {
    指数原值 = 1;
  }
  const idx = clampNum(指数原值 || 1, PRICE_INDEX_MIN, PRICE_INDEX_MAX);
  const 昨日 = normalizeWageRecord(readB(WORK_WAGE_FILE, prevDateKey(dateKey), null), '');
  const record: DailyWageRecord = {
    日期: String(dateKey),
    标准时薪: computeStandardHourlyWage({
      日期: String(dateKey),
      稳健人均: wealth.稳健人均,
      物价指数: idx,
      昨日时薪: 昨日?.标准时薪 || 0,
    }),
    稳健人均: wealth.稳健人均,
    物价指数: Number(idx.toFixed(4)),
    统计人数: wealth.人数,
    刷新时间: String(opts?.刷新时间 || ''),
  };
  writeB(WORK_WAGE_FILE, dateKey, record);
  return { ...record, 首次刷新: true };
}

/** 判断某时刻属于夜班：20:00~次日08:00 */
export function isNightShiftHour(hour: number): boolean {
  const h = Math.floor(Number(hour) || 0);
  return h < WORK_DAY_START_HOUR || h >= WORK_NIGHT_START_HOUR;
}

/** 单个整点工时段 */
export interface WorkHourSlice {
  序号: number;
  小时: number;
  夜班: boolean;
  加班: boolean;
}

export interface WorkHourBreakdown {
  实际秒: number;
  实际工时: number;
  计薪工时: number;
  超时工时: number;
  标准白: number;
  标准夜: number;
  加班白: number;
  加班夜: number;
  提前结算: boolean;
  明细: WorkHourSlice[];
}

/**
 * 按整小时切分工时：不足 1 小时的零头直接丢弃，超过 12 小时的部分不计薪。
 * 每个整点段按其起始时刻归入白班 / 夜班；第 9~12 小时记为加班。
 */
export function splitWorkHours(startTs: number, endTs: number): WorkHourBreakdown {
  const start = Math.floor(Number(startTs) || 0);
  const end = Math.floor(Number(endTs) || 0);
  const 实际秒 = Math.max(0, end - start);
  const 实际工时 = Math.floor(实际秒 / 3600);
  const 计薪工时 = Math.min(实际工时, WORK_MAX_HOURS);
  const 超时工时 = Math.max(0, 实际工时 - WORK_MAX_HOURS);
  let 标准白 = 0;
  let 标准夜 = 0;
  let 加班白 = 0;
  let 加班夜 = 0;
  const 明细: WorkHourSlice[] = [];
  for (let i = 0; i < 计薪工时; i++) {
    const hour = new Date((start + i * 3600) * 1000).getHours();
    const night = isNightShiftHour(hour);
    const overtime = i >= WORK_STANDARD_HOURS;
    明细.push({ 序号: i, 小时: hour, 夜班: night, 加班: overtime });
    if (overtime) {
      if (night) 加班夜 += 1;
      else 加班白 += 1;
    } else if (night) {
      标准夜 += 1;
    } else {
      标准白 += 1;
    }
  }
  return {
    实际秒,
    实际工时,
    计薪工时,
    超时工时,
    标准白,
    标准夜,
    加班白,
    加班夜,
    提前结算: 计薪工时 > 0 && 计薪工时 < WORK_STANDARD_HOURS,
    明细,
  };
}

export interface WorkWageResult {
  白班时薪: number;
  夜班时薪: number;
  加班白时薪: number;
  加班夜时薪: number;
  标准工资: number;
  加班工资: number;
  绩效浮动: number;
  满勤奖: number;
  折扣: number;
  总工资: number;
}

/** 绩效浮动用的确定性随机：同一次打工的同一个小时，永远是同一个值 */
function sliceUnit(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (((h >>> 0) % 10000) / 10000) * 2 - 1; // -1 ~ +1
}

/**
 * 结算工资：逐个整点小时按「该岗位自己的公式」计价。
 * 每小时 = 白班基础时薪 × (夜班 ? 岗位夜班倍率 : 1) × (加班 ? 岗位加班倍率 : 1) × (1 ± 岗位绩效幅度)
 * 满标准工时另给一次性满勤奖；不满标准工时整体打 9 折（满勤奖此时必然为 0）。
 * 岗位参数传数字时按老逻辑只当系数用（兼容旧数据/旧调用）。
 */
export function computeWorkWage(
  breakdown: WorkHourBreakdown,
  基准时薪: number,
  岗位: Partial<WorkPostDef> | number,
  开始时间: number = 0,
): WorkWageResult {
  const def = typeof 岗位 === 'number' ? { ...defaultWorkPost(), 系数: 岗位 } : { ...defaultWorkPost(), ...(岗位 || {}) };
  const 系数 = Number(def.系数) || 1;
  const 夜班倍率 = Number(def.夜班倍率) > 0 ? Number(def.夜班倍率) : WORK_NIGHT_RATE;
  const 加班倍率 = Number(def.加班倍率) > 0 ? Number(def.加班倍率) : WORK_OVERTIME_RATE;
  const 绩效幅度 = Math.max(0, Number(def.绩效) || 0);
  const 满勤倍数 = Math.max(0, Number(def.满勤奖) || 0);

  const 白班时薪 = Math.max(1, Math.floor((Number(基准时薪) || 0) * 系数));
  const 夜班时薪 = Math.max(1, Math.floor(白班时薪 * 夜班倍率));
  const 加班白时薪 = Math.max(1, Math.floor(白班时薪 * 加班倍率));
  const 加班夜时薪 = Math.max(1, Math.floor(夜班时薪 * 加班倍率));

  let 标准工资 = 0;
  let 加班工资 = 0;
  let 绩效浮动 = 0;
  const slices = breakdown.明细 && breakdown.明细.length
    ? breakdown.明细
    : rebuildSlices(breakdown);
  for (const s of slices) {
    const 基础 = s.加班 ? (s.夜班 ? 加班夜时薪 : 加班白时薪) : s.夜班 ? 夜班时薪 : 白班时薪;
    if (s.加班) 加班工资 += 基础;
    else 标准工资 += 基础;
    if (绩效幅度 > 0) {
      const unit = sliceUnit(`${Math.floor(Number(开始时间) || 0)}|${def.岗位 || ''}|${s.序号}`);
      绩效浮动 += Math.round(基础 * 绩效幅度 * unit);
    }
  }

  const 满勤 = breakdown.计薪工时 >= WORK_STANDARD_HOURS ? Math.floor(白班时薪 * 满勤倍数) : 0;
  const 折扣 = breakdown.提前结算 ? WORK_EARLY_LEAVE_RATE : 1;
  const 小计 = 标准工资 + 加班工资 + 绩效浮动;
  const 总工资 = breakdown.计薪工时 < 1 ? 0 : Math.max(0, Math.floor(小计 * 折扣)) + 满勤;
  return { 白班时薪, 夜班时薪, 加班白时薪, 加班夜时薪, 标准工资, 加班工资, 绩效浮动, 满勤奖: 满勤, 折扣, 总工资 };
}

/** 老数据/老调用没有 明细 时，按汇总数量还原出等价的时段列表（绩效按序号取值） */
function rebuildSlices(breakdown: WorkHourBreakdown): WorkHourSlice[] {
  const out: WorkHourSlice[] = [];
  let i = 0;
  const push = (night: boolean, overtime: boolean, n: number) => {
    for (let k = 0; k < n; k++) out.push({ 序号: i++, 小时: night ? WORK_NIGHT_START_HOUR : WORK_DAY_START_HOUR, 夜班: night, 加班: overtime });
  };
  push(false, false, Math.max(0, breakdown.标准白 || 0));
  push(true, false, Math.max(0, breakdown.标准夜 || 0));
  push(false, true, Math.max(0, breakdown.加班白 || 0));
  push(true, true, Math.max(0, breakdown.加班夜 || 0));
  return out;
}

export interface WorkState {
  工作区: string;
  岗位: string;
  系数: number;
  基准时薪: number;
  开始时间: number;
  开始文本: string;
  日期: string;
  来源: string;
}

/** 状态文件里 基准时薪 缺失/损坏时的兜底：优先用上班当天已落盘的标准时薪 */
function fallbackBaseWage(dateKey: string): number {
  const rec = readDailyStandardWage(dateKey);
  if (rec && rec.标准时薪 > 0) return rec.标准时薪;
  return WAGE_MIN;
}

export function readWorkState(userId: string | number): WorkState | null {
  const raw = readB(WORK_STATE_FILE, String(userId), null);
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const obj = raw as Record<string, unknown>;
  const start = Math.floor(Number(obj.开始时间) || 0);
  const area = String(obj.工作区 || '');
  const post = String(obj.岗位 || '');
  if (!start || !area || !post) return null;
  const 日期 = String(obj.日期 || '');
  let 基准时薪 = Math.floor(Number(obj.基准时薪) || 0);
  if (!(基准时薪 > 0)) 基准时薪 = fallbackBaseWage(日期);
  let 系数 = Number(obj.系数);
  if (!Number.isFinite(系数) || 系数 <= 0) {
    系数 = WORK_AREAS[area]?.find((p) => p.岗位 === post)?.系数 || 1;
  }
  return {
    工作区: area,
    岗位: post,
    系数,
    基准时薪: Math.max(1, 基准时薪),
    开始时间: start,
    开始文本: String(obj.开始文本 || ''),
    日期,
    来源: String(obj.来源 || ''),
  };
}

export interface WorkStatusView {
  工作区: string;
  岗位: string;
  已工作秒: number;
  实际工时: number;
  零头分钟: number;
  标准进度: number;
  标准目标: number;
  加班分钟: number;
  加班计薪工时: number;
  加班目标: number;
  超时工时: number;
  计薪工时: number;
  提前结算: boolean;
  已满标准: boolean;
  退出可得: number;
  白班时薪: number;
  夜班时薪: number;
  满勤奖: number;
  满勤奖预告: number;
}

/** 取该次打工实际生效的岗位档案：系数用记录里锁定的，其余倍率按岗位表 */
export function workStatePostDef(state: WorkState): WorkPostDef {
  const def = resolveWorkPost(state?.工作区, state?.岗位);
  const 系数 = Number(state?.系数);
  return { ...def, 系数: Number.isFinite(系数) && 系数 > 0 ? 系数 : def.系数 };
}

/**
 * 打工状态实时视图：只读，不写盘、不发钱。
 * 退出可得 = 此刻发【结算工资】能拿到的金额（含不满 8 小时的 ×0.9 折扣、满勤奖与绩效浮动）。
 */
export function computeWorkStatus(state: WorkState, nowTs: number): WorkStatusView {
  const start = Math.floor(Number(state?.开始时间) || 0);
  const now = Math.max(start, Math.floor(Number(nowTs) || 0));
  const breakdown = splitWorkHours(start, now);
  const post = workStatePostDef(state);
  const wage = computeWorkWage(breakdown, Number(state?.基准时薪) || 1, post, start);
  const 加班秒 = clampNum(
    breakdown.实际秒 - WORK_STANDARD_HOURS * 3600,
    0,
    (WORK_MAX_HOURS - WORK_STANDARD_HOURS) * 3600,
  );
  return {
    工作区: String(state?.工作区 || ''),
    岗位: String(state?.岗位 || ''),
    已工作秒: breakdown.实际秒,
    实际工时: breakdown.实际工时,
    零头分钟: Math.floor((breakdown.实际秒 % 3600) / 60),
    标准进度: Math.min(breakdown.实际工时, WORK_STANDARD_HOURS),
    标准目标: WORK_STANDARD_HOURS,
    加班分钟: Math.floor(加班秒 / 60),
    加班计薪工时: breakdown.加班白 + breakdown.加班夜,
    加班目标: WORK_MAX_HOURS - WORK_STANDARD_HOURS,
    超时工时: breakdown.超时工时,
    计薪工时: breakdown.计薪工时,
    提前结算: breakdown.提前结算,
    已满标准: breakdown.实际工时 >= WORK_STANDARD_HOURS,
    退出可得: wage.总工资,
    白班时薪: wage.白班时薪,
    夜班时薪: wage.夜班时薪,
    满勤奖: wage.满勤奖,
    满勤奖预告: Math.floor(wage.白班时薪 * Math.max(0, Number(post.满勤奖) || 0)),
  };
}

export function writeWorkState(userId: string | number, state: WorkState): void {
  writeB(WORK_STATE_FILE, String(userId), state);
}

export function clearWorkState(userId: string | number): void {
  deleteKey(WORK_STATE_FILE, String(userId));
}