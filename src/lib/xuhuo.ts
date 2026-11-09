import fs from 'fs';
import path from 'path';
import { getDataPath, readA, writeA } from '../data-fs';

export const XUHUO_CONFIG_FILE = '筱筱吖/扩展功能/续火功能/配置.json';
export const XUHUO_LEGACY_TEXT = '筱筱吖/扩展功能/续火功能/续火内容/文本.txt';
export const XUHUO_LEGACY_MODE = '筱筱吖/扩展功能/续火功能/续火方式/方式.txt';
export const XUHUO_IMAGE_DIR = '筱筱吖/扩展功能/续火功能/图片';
export const XUHUO_LEGACY_IMAGE_DIR = '筱筱吖/扩展功能/续火功能/临时数据/image';
export const XUHUO_STATE_DIR = '筱筱吖/扩展功能/续火功能/状态数据';
export const XUHUO_FRIEND_SWITCH = '筱筱吖/扩展功能/续火功能/状态数据/好友/开关.json';
export const XUHUO_HISTORY_INDEX = '筱筱吖/扩展功能/续火功能/状态数据/历史索引.json';

export type XuhuoImageMode = '随机' | '顺序' | '固定' | '全部';
export type XuhuoTextMode = '随机' | '顺序' | '全部';
export type XuhuoScope = '群聊' | '私聊';

export type XuhuoImageItem = {
  id: string;
  来源: 'url' | '本地';
  值: string;
  备注?: string;
};

export type XuhuoScopeConfig = {
  启用: boolean;
  时: number;
  分: number;
  文案: string[];
};

export type XuhuoConfig = {
  版本: 2;
  群聊: XuhuoScopeConfig;
  私聊: XuhuoScopeConfig;
  图片: {
    启用: boolean;
    模式: XuhuoImageMode;
    张数: number;
    固定序号: number[];
    统一顺序: boolean;
    资源: XuhuoImageItem[];
  };
  发送: {
    合并: boolean;
    文案策略: XuhuoTextMode;
    私聊回落群聊: boolean;
    消息间隔毫秒: number;
  };
  保留天数: number;
};

export type XuhuoMessagePlan = {
  文案: string[];
  图片: string[];
};

export type XuhuoHistoryEntry = {
  日期: string;
  群聊?: { 已发: number; 合计: number };
  私聊?: { 已发: number; 合计: number };
};

const IMAGE_MODES: XuhuoImageMode[] = ['随机', '顺序', '固定', '全部'];
const TEXT_MODES: XuhuoTextMode[] = ['随机', '顺序', '全部'];

let xuhuoIdSeed = 0;

export function newXuhuoId(): string {
  xuhuoIdSeed = (xuhuoIdSeed + 1) % 100000;
  return `x${Date.now().toString(36)}${xuhuoIdSeed.toString(36)}${Math.random().toString(36).slice(2, 5)}`;
}

export function isSafeXuhuoImageName(name: unknown): boolean {
  const s = String(name ?? '').trim();
  return /^[A-Za-z0-9._-]{1,90}\.(png|jpe?g|webp|gif)$/i.test(s);
}

export function isXuhuoUrl(value: unknown): boolean {
  const s = String(value ?? '').trim();
  return /^https?:\/\/[^\s]+$/i.test(s);
}

function clampInt(raw: unknown, min: number, max: number, def: number): number {
  const n = Math.floor(Number(raw));
  if (!Number.isFinite(n)) return def;
  return Math.min(max, Math.max(min, n));
}

export function parseXuhuoTextPool(raw: unknown): string[] {
  const s = String(raw ?? '');
  if (!s.trim()) return [];
  return s
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

function normalizeScopeConfig(raw: unknown, fallback: XuhuoScopeConfig): XuhuoScopeConfig {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const hasText = Object.prototype.hasOwnProperty.call(o, '文案');
  let 文案: string[];
  if (!hasText) {
    文案 = fallback.文案;
  } else if (Array.isArray(o.文案)) {
    文案 = o.文案.map((x) => String(x ?? '').trim()).filter(Boolean);
  } else {
    文案 = parseXuhuoTextPool(o.文案);
  }
  return {
    启用: typeof o.启用 === 'boolean' ? o.启用 : fallback.启用,
    时: clampInt(o.时, 0, 23, fallback.时),
    分: clampInt(o.分, 0, 59, fallback.分),
    文案,
  };
}

function scanLegacyImages(): XuhuoImageItem[] {
  const root = getDataPath();
  if (!root) return [];
  const dir = path.join(root, XUHUO_LEGACY_IMAGE_DIR);
  let names: string[] = [];
  try {
    if (!fs.existsSync(dir)) return [];
    names = fs
      .readdirSync(dir)
      .filter((n) => /\.(png|jpe?g|webp|gif)$/i.test(n))
      .sort((a, b) => a.localeCompare(b, 'en', { numeric: true }));
  } catch {
    return [];
  }
  return names.map((n) => ({
    id: newXuhuoId(),
    来源: '本地' as const,
    值: n,
    备注: '旧版自动下载',
  }));
}

function legacyImageDirHasFile(name: string): boolean {
  const root = getDataPath();
  if (!root) return false;
  try {
    return fs.existsSync(path.join(root, XUHUO_LEGACY_IMAGE_DIR, name));
  } catch {
    return false;
  }
}

export function defaultXuhuoConfig(): XuhuoConfig {
  const legacyText = parseXuhuoTextPool(readA(XUHUO_LEGACY_TEXT));
  const legacyMode = String(readA(XUHUO_LEGACY_MODE) || '').trim();
  const legacyImages = legacyMode === '图片' ? scanLegacyImages() : [];
  return {
    版本: 2,
    群聊: { 启用: true, 时: 0, 分: 0, 文案: legacyText.length ? legacyText : ['愿君安心'] },
    私聊: { 启用: true, 时: 0, 分: 5, 文案: [] },
    图片: {
      启用: legacyMode === '图片' || legacyImages.length > 0,
      模式: '随机',
      张数: 1,
      固定序号: [],
      统一顺序: true,
      资源: legacyImages,
    },
    发送: {
      合并: true,
      文案策略: '随机',
      私聊回落群聊: true,
      消息间隔毫秒: 600,
    },
    保留天数: 90,
  };
}

export function normalizeXuhuoConfig(raw: unknown): XuhuoConfig {
  const base = defaultXuhuoConfig();
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const img = (o.图片 && typeof o.图片 === 'object' ? o.图片 : {}) as Record<string, unknown>;
  const send = (o.发送 && typeof o.发送 === 'object' ? o.发送 : {}) as Record<string, unknown>;

  const 资源: XuhuoImageItem[] = Array.isArray(img.资源)
    ? img.资源
        .map((it) => {
          const r = (it && typeof it === 'object' ? it : {}) as Record<string, unknown>;
          const 来源 = r.来源 === '本地' ? '本地' : 'url';
          const 值 = String(r.值 ?? '').trim();
          if (!值) return null;
          if (来源 === 'url' && !isXuhuoUrl(值)) return null;
          if (来源 === '本地' && !isSafeXuhuoImageName(值)) return null;
          return {
            id: String(r.id ?? '').trim() || newXuhuoId(),
            来源,
            值,
            备注: r.备注 == null ? undefined : String(r.备注).slice(0, 60),
          } as XuhuoImageItem;
        })
        .filter((x): x is XuhuoImageItem => Boolean(x))
    : base.图片.资源;

  const 模式 = IMAGE_MODES.includes(img.模式 as XuhuoImageMode) ? (img.模式 as XuhuoImageMode) : base.图片.模式;
  const 固定序号 = Array.isArray(img.固定序号)
    ? img.固定序号
        .map((x) => Math.floor(Number(x)))
        .filter((x) => Number.isFinite(x) && x >= 1)
        .slice(0, 200)
    : [];

  return {
    版本: 2,
    群聊: normalizeScopeConfig(o.群聊, base.群聊),
    私聊: normalizeScopeConfig(o.私聊, base.私聊),
    图片: {
      启用: typeof img.启用 === 'boolean' ? img.启用 : base.图片.启用,
      模式,
      张数: clampInt(img.张数, 1, 30, base.图片.张数),
      固定序号,
      统一顺序: typeof img.统一顺序 === 'boolean' ? img.统一顺序 : base.图片.统一顺序,
      资源,
    },
    发送: {
      合并: typeof send.合并 === 'boolean' ? send.合并 : base.发送.合并,
      文案策略: TEXT_MODES.includes(send.文案策略 as XuhuoTextMode)
        ? (send.文案策略 as XuhuoTextMode)
        : base.发送.文案策略,
      私聊回落群聊: typeof send.私聊回落群聊 === 'boolean' ? send.私聊回落群聊 : base.发送.私聊回落群聊,
      消息间隔毫秒: clampInt(send.消息间隔毫秒, 0, 5000, base.发送.消息间隔毫秒),
    },
    保留天数: clampInt(o.保留天数, 7, 3650, base.保留天数),
  };
}

export function readXuhuoConfig(): XuhuoConfig {
  const raw = readA(XUHUO_CONFIG_FILE);
  if (!raw.trim()) return normalizeXuhuoConfig(null);
  try {
    return normalizeXuhuoConfig(JSON.parse(raw));
  } catch {
    return normalizeXuhuoConfig(null);
  }
}

export function writeXuhuoConfig(cfg: unknown): boolean {
  const normalized = normalizeXuhuoConfig(cfg);
  return writeA(XUHUO_CONFIG_FILE, JSON.stringify(normalized, null, 2));
}

export function ensureXuhuoConfigFile(): XuhuoConfig {
  const raw = readA(XUHUO_CONFIG_FILE);
  if (raw.trim()) {
    try {
      return normalizeXuhuoConfig(JSON.parse(raw));
    } catch {
      void 0;
    }
  }
  const cfg = defaultXuhuoConfig();
  writeXuhuoConfig(cfg);
  return cfg;
}

export function localXuhuoImageExists(name: string): boolean {
  const root = getDataPath();
  if (!root || !isSafeXuhuoImageName(name)) return false;
  try {
    return fs.existsSync(path.join(root, XUHUO_IMAGE_DIR, name));
  } catch {
    return false;
  }
}

export function isXuhuoImageUsable(item: XuhuoImageItem): boolean {
  if (item.来源 === 'url') return isXuhuoUrl(item.值);
  if (!isSafeXuhuoImageName(item.值)) return false;
  return legacyImageDirHasFile(item.值) || localXuhuoImageExists(item.值);
}

export function resolveXuhuoImageAbs(name: string): string {
  const root = getDataPath();
  if (!root || !isSafeXuhuoImageName(name)) return '';
  const abs = path.join(root, XUHUO_IMAGE_DIR, name);
  if (fs.existsSync(abs)) return abs;
  const legacy = path.join(root, XUHUO_LEGACY_IMAGE_DIR, name);
  return fs.existsSync(legacy) ? legacy : '';
}

export function resolveXuhuoImageValue(item: XuhuoImageItem): string {
  if (item.来源 === 'url') return item.值;
  return resolveXuhuoImageAbs(item.值);
}

function shuffle<T>(arr: T[]): T[] {
  const out = arr.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export function pickXuhuoImages(cfg: XuhuoConfig, dayIndex: number): XuhuoImageItem[] {
  if (!cfg.图片.启用) return [];
  const pool = cfg.图片.资源.filter(isXuhuoImageUsable);
  if (!pool.length) return [];
  const n = pool.length;
  const want = clampInt(cfg.图片.张数, 1, n, 1);

  switch (cfg.图片.模式) {
    case '全部':
      return pool.slice();
    case '固定': {
      const picked = cfg.图片.固定序号
        .map((i) => pool[i - 1])
        .filter((x): x is XuhuoImageItem => Boolean(x));
      return picked.length ? picked : [pool[0]];
    }
    case '顺序': {
      const day = Number.isFinite(dayIndex) ? Math.abs(Math.floor(dayIndex)) : 0;
      const start = (day * want) % n;
      const out: XuhuoImageItem[] = [];
      for (let i = 0; i < want; i++) out.push(pool[(start + i) % n]);
      return out;
    }
    case '随机':
    default:
      return shuffle(pool).slice(0, want);
  }
}

export function resolveXuhuoTextPool(cfg: XuhuoConfig, scope: XuhuoScope): string[] {
  const own = cfg[scope].文案.filter((x) => x.trim().length > 0);
  if (own.length) return own;
  if (scope === '私聊' && cfg.发送.私聊回落群聊) {
    return cfg.群聊.文案.filter((x) => x.trim().length > 0);
  }
  return [];
}

export function pickXuhuoTexts(cfg: XuhuoConfig, scope: XuhuoScope, dayIndex: number): string[] {
  const pool = resolveXuhuoTextPool(cfg, scope);
  if (!pool.length) return [];
  const mode = cfg.发送.文案策略;
  if (mode === '全部') return pool.slice();
  const idx =
    mode === '顺序'
      ? (Number.isFinite(dayIndex) ? Math.abs(Math.floor(dayIndex)) : 0) % pool.length
      : Math.floor(Math.random() * pool.length);
  return [pool[idx]];
}

export function planXuhuoMessages(
  cfg: XuhuoConfig,
  texts: string[],
  images: string[],
): XuhuoMessagePlan[] {
  const t = texts.map((x) => String(x ?? '')).filter((x) => x.trim().length > 0);
  const im = images.filter((x) => String(x ?? '').trim().length > 0);
  if (!t.length && !im.length) return [];

  const out: XuhuoMessagePlan[] = [];
  if (t.length && im.length) {
    if (cfg.发送.合并) {
      t.forEach((text, i) => {
        out.push({ 文案: [text], 图片: i === 0 ? im.slice() : [] });
      });
    } else {
      t.forEach((text) => out.push({ 文案: [text], 图片: [] }));
      out.push({ 文案: [], 图片: im.slice() });
    }
  } else if (t.length) {
    t.forEach((text) => out.push({ 文案: [text], 图片: [] }));
  } else {
    out.push({ 文案: [], 图片: im.slice() });
  }
  return out;
}

export function xuhuoDayIndex(now = Date.now()): number {
  return Math.floor(now / 86400000);
}

export function nextXuhuoFireAt(hour: number, minute: number, now = Date.now()): number {
  const d = new Date(now);
  d.setHours(clampInt(hour, 0, 23, 0), clampInt(minute, 0, 59, 0), 0, 0);
  let t = d.getTime();
  if (t <= now) {
    d.setDate(d.getDate() + 1);
    t = d.getTime();
  }
  return t;
}

export function xuhuoTodayFireAt(hour: number, minute: number, now = Date.now()): number {
  const d = new Date(now);
  d.setHours(clampInt(hour, 0, 23, 0), clampInt(minute, 0, 59, 0), 0, 0);
  return d.getTime();
}

export function xuhuoDateKey(now = Date.now()): string {
  const d = new Date(now);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function xuhuoStateFile(scope: XuhuoScope, date: string): string {
  const dir = scope === '群聊' ? '群聊' : '好友';
  return `${XUHUO_STATE_DIR}/${dir}/${date}.json`;
}

export type XuhuoDayState = Record<string, string>;

export function readXuhuoDayState(scope: XuhuoScope, date: string): XuhuoDayState {
  const raw = readA(xuhuoStateFile(scope, date));
  if (!raw.trim()) return {};
  try {
    const data = JSON.parse(raw);
    return data && typeof data === 'object' ? (data as XuhuoDayState) : {};
  } catch {
    return {};
  }
}

function writeXuhuoDayState(scope: XuhuoScope, date: string, state: XuhuoDayState): void {
  writeA(xuhuoStateFile(scope, date), JSON.stringify(state, null, 2));
}

export function markXuhuoSent(scope: XuhuoScope, date: string, target: string): void {
  const state = readXuhuoDayState(scope, date);
  state[target] = '已';
  writeXuhuoDayState(scope, date, state);
}

export function markXuhuoFailed(scope: XuhuoScope, date: string, target: string): void {
  const state = readXuhuoDayState(scope, date);
  if (state[target] === '已') return;
  state[target] = '失败';
  writeXuhuoDayState(scope, date, state);
}

export function readXuhuoHistory(): XuhuoHistoryEntry[] {
  const raw = readA(XUHUO_HISTORY_INDEX);
  if (!raw.trim()) return [];
  try {
    const data = JSON.parse(raw);
    return Array.isArray(data) ? (data as XuhuoHistoryEntry[]) : [];
  } catch {
    return [];
  }
}

export function recordXuhuoHistory(
  date: string,
  scope: XuhuoScope,
  summary: { 已发: number; 合计: number },
): void {
  const list = readXuhuoHistory();
  const key = scope === '群聊' ? '群聊' : '私聊';
  let entry = list.find((x) => x && x.日期 === date);
  if (!entry) {
    entry = { 日期: date };
    list.push(entry);
  }
  entry[key] = { 已发: summary.已发, 合计: summary.合计 };
  list.sort((a, b) => String(a.日期).localeCompare(String(b.日期)));
  const trimmed = list.slice(-400);
  writeA(XUHUO_HISTORY_INDEX, JSON.stringify(trimmed, null, 2));
}

const DATE_FILE_RE = /^(\d{4})-(\d{2})-(\d{2})\.json$/;

function shiftDate(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split('-').map((x) => Number(x));
  const dt = new Date(y, (m || 1) - 1, d || 1);
  dt.setDate(dt.getDate() + days);
  return xuhuoDateKey(dt.getTime());
}

export function pruneXuhuoState(keepDays: number, today = xuhuoDateKey()): { 删除: number } {
  const root = getDataPath();
  const keep = clampInt(keepDays, 7, 3650, 90);
  if (!root) return { 删除: 0 };
  const cutoff = shiftDate(today, -keep);
  let deleted = 0;

  for (const sub of ['群聊', '好友']) {
    const dir = path.join(root, XUHUO_STATE_DIR, sub);
    let names: string[] = [];
    try {
      if (!fs.existsSync(dir)) continue;
      names = fs.readdirSync(dir);
    } catch {
      continue;
    }
    for (const name of names) {
      const m = DATE_FILE_RE.exec(name);
      if (!m) continue;
      const date = `${m[1]}-${m[2]}-${m[3]}`;
      if (date >= cutoff) continue;
      try {
        fs.unlinkSync(path.join(dir, name));
        deleted++;
      } catch {
        void 0;
      }
    }
  }
  return { 删除: deleted };
}
