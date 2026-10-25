// ---------------------------------------------------------------------------
// 刷屏检测：双窗口 burst + sustained，内存计数，权限门控，配置落盘。
// ---------------------------------------------------------------------------

export const SPAM_FLOOD_EVENT_KEY = '刷屏检测';

export const SPAM_FLOOD_DEFAULTS = {
  短窗口秒: 10,
  短次数: 6,
  长窗口秒: 60,
  长次数: 12,
  禁言秒: 600,
  撤回: '开启',
  通知: '关闭',
} as const;

const MAP_CAP = 10_000;
const IDLE_TTL_SEC = 120;
const GROUP_IDLE_PURGE_SEC = 30 * 60;
const CONFIG_CACHE_TTL_MS = 30_000;
const CONFIG_CACHE_STALE_MS = 10 * 60_000;
const BAN_COOLDOWN_SEC = 30;
const SWEEP_INTERVAL_MS = 60_000;
const BOT_ROLE_CACHE_MS = 5 * 60_000;

type WinState = { windowEnd: number; count: number };
type UserState = {
  burst: WinState;
  sustained: WinState;
  lastBanAt: number;
  lastTouchAt: number;
};

export type SpamFloodConfig = {
  短窗口秒: number;
  短次数: number;
  长窗口秒: number;
  长次数: number;
  禁言秒: number;
  撤回: string;
  通知: string;
};

export type SpamFloodDeps = {
  readB: (file: string, key: string, def?: unknown) => unknown;
  writeB: (file: string, key: string, value: unknown) => boolean;
  BOTAPI: (ctx: unknown, action: string, params: Record<string, unknown>) => Promise<unknown>;
  botApiPayload: (result: unknown) => Record<string, unknown> | null | undefined;
  logger?: {
    info?: (...args: unknown[]) => void;
    warn?: (...args: unknown[]) => void;
  };
  RC_group_role: Record<string, number>;
  发消息: (event: unknown, segs: unknown[]) => Promise<unknown>;
  段_引用: (id: unknown) => unknown;
  段_文本: (text: string) => unknown;
  /** 主人 / 管理模式群管等：不计数 */
  isCountExempt?: (event: Record<string, unknown>, ctx: unknown) => Promise<boolean>;
  /** 配置指令权限 */
  canManageConfig?: (event: Record<string, unknown>, ctx: unknown) => Promise<boolean>;
};

const stateMap = new Map<string, UserState>();
const groupLastActiveAt = new Map<string, number>();
const configCache = new Map<string, { config: SpamFloodConfig; loadedAt: number; lastAccess: number }>();
const botRoleCache = new Map<string, { lv: number; loadedAt: number }>();

let sweepTimer: ReturnType<typeof setInterval> | null = null;
let boundLogger: SpamFloodDeps['logger'];

function configRel(groupId: string | number) {
  return `筱筱吖/群管功能/刷屏检测/${groupId}.json`;
}

function eventsRel(groupId: string | number) {
  return `筱筱吖/事件系统/${groupId}.json`;
}

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

function num(v: unknown, def: number) {
  const n = Number(v);
  return Number.isFinite(n) ? n : def;
}

export function normalizeSpamFloodConfig(raw: Record<string, unknown> | null | undefined): SpamFloodConfig {
  const d = SPAM_FLOOD_DEFAULTS;
  return {
    短窗口秒: clamp(num(raw?.['短窗口秒'], d.短窗口秒), 1, 60),
    短次数: clamp(num(raw?.['短次数'], d.短次数), 2, 20),
    长窗口秒: clamp(num(raw?.['长窗口秒'], d.长窗口秒), 30, 300),
    长次数: clamp(num(raw?.['长次数'], d.长次数), 5, 60),
    禁言秒: clamp(num(raw?.['禁言秒'], d.禁言秒), 60, 86400),
    撤回: String(raw?.['撤回'] ?? d.撤回) === '关闭' ? '关闭' : '开启',
    通知: String(raw?.['通知'] ?? d.通知) === '开启' ? '开启' : '关闭',
  };
}

export function loadSpamFloodConfig(groupId: string | number, readB: SpamFloodDeps['readB'], force = false): SpamFloodConfig {
  const gid = String(groupId);
  const now = Date.now();
  const cached = configCache.get(gid);
  if (!force && cached && now - cached.loadedAt < CONFIG_CACHE_TTL_MS) {
    cached.lastAccess = now;
    return cached.config;
  }
  const config = normalizeSpamFloodConfig({
    短窗口秒: readB(configRel(gid), '短窗口秒', SPAM_FLOOD_DEFAULTS.短窗口秒),
    短次数: readB(configRel(gid), '短次数', SPAM_FLOOD_DEFAULTS.短次数),
    长窗口秒: readB(configRel(gid), '长窗口秒', SPAM_FLOOD_DEFAULTS.长窗口秒),
    长次数: readB(configRel(gid), '长次数', SPAM_FLOOD_DEFAULTS.长次数),
    禁言秒: readB(configRel(gid), '禁言秒', SPAM_FLOOD_DEFAULTS.禁言秒),
    撤回: readB(configRel(gid), '撤回', SPAM_FLOOD_DEFAULTS.撤回),
    通知: readB(configRel(gid), '通知', SPAM_FLOOD_DEFAULTS.通知),
  });
  configCache.set(gid, { config, loadedAt: now, lastAccess: now });
  return config;
}

export function saveSpamFloodConfig(
  groupId: string | number,
  config: Partial<SpamFloodConfig>,
  readB: SpamFloodDeps['readB'],
  writeB: SpamFloodDeps['writeB'],
) {
  const gid = String(groupId);
  const merged = normalizeSpamFloodConfig({ ...loadSpamFloodConfig(gid, readB, true), ...config });
  const rel = configRel(gid);
  for (const [k, v] of Object.entries(merged)) {
    writeB(rel, k, v);
  }
  configCache.set(gid, { config: merged, loadedAt: Date.now(), lastAccess: Date.now() });
  return merged;
}

export function isSpamFloodEventOn(groupId: string | number, readB: SpamFloodDeps['readB']) {
  return readB(eventsRel(groupId), SPAM_FLOOD_EVENT_KEY, '关闭') === '开启';
}

export function setSpamFloodEvent(groupId: string | number, on: boolean, writeB: SpamFloodDeps['writeB']) {
  writeB(eventsRel(groupId), SPAM_FLOOD_EVENT_KEY, on ? '开启' : '关闭');
}

function stateKey(groupId: string | number, userId: string | number) {
  return `${groupId}:${userId}`;
}

function tickWindow(win: WinState, windowSec: number, now: number) {
  if (now >= win.windowEnd) {
    win.windowEnd = now + windowSec;
    win.count = 1;
  } else {
    win.count += 1;
  }
}

function resetWindows(state: UserState, config: SpamFloodConfig, now: number) {
  state.burst = { windowEnd: now + config.短窗口秒, count: 0 };
  state.sustained = { windowEnd: now + config.长窗口秒, count: 0 };
}

function maxWindowEnd(state: UserState) {
  return Math.max(state.burst.windowEnd, state.sustained.windowEnd);
}

function shouldDeleteState(state: UserState, now: number) {
  return now > maxWindowEnd(state) + IDLE_TTL_SEC;
}

function evictLruOne() {
  let oldestKey = '';
  let oldestTouch = Infinity;
  for (const [k, st] of stateMap) {
    if (st.lastTouchAt < oldestTouch) {
      oldestTouch = st.lastTouchAt;
      oldestKey = k;
    }
  }
  if (oldestKey) stateMap.delete(oldestKey);
}

function purgeGroupStates(groupId: string) {
  const prefix = `${groupId}:`;
  for (const k of [...stateMap.keys()]) {
    if (k.startsWith(prefix)) stateMap.delete(k);
  }
}

export function sweepSpamFloodState(nowSec = Math.floor(Date.now() / 1000)) {
  for (const [k, st] of [...stateMap.entries()]) {
    if (shouldDeleteState(st, nowSec)) stateMap.delete(k);
  }
  for (const [gid, lastAt] of [...groupLastActiveAt.entries()]) {
    if (nowSec - lastAt > GROUP_IDLE_PURGE_SEC) {
      purgeGroupStates(gid);
      groupLastActiveAt.delete(gid);
    }
  }
  const nowMs = Date.now();
  for (const [gid, entry] of [...configCache.entries()]) {
    if (nowMs - entry.lastAccess > CONFIG_CACHE_STALE_MS) configCache.delete(gid);
  }
}

async function getBotRoleLv(
  ctx: unknown,
  groupId: string | number,
  selfId: string | number,
  deps: SpamFloodDeps,
): Promise<number> {
  const gid = String(groupId);
  const now = Date.now();
  const cached = botRoleCache.get(gid);
  if (cached && now - cached.loadedAt < BOT_ROLE_CACHE_MS) return cached.lv;
  let lv = 0;
  try {
    const dp = deps.botApiPayload(
      await deps.BOTAPI(ctx, 'get_group_member_info', { group_id: groupId, user_id: selfId }),
    );
    lv = deps.RC_group_role[String(dp?.role || 'member')] || 0;
  } catch (e) {
    deps.logger?.warn?.('[刷屏检测] 查询机器人身份失败:', (e as Error)?.message || e);
  }
  botRoleCache.set(gid, { lv, loadedAt: now });
  return lv;
}

async function getUserRoleLv(
  ctx: unknown,
  groupId: string | number,
  userId: string | number,
  deps: SpamFloodDeps,
): Promise<number> {
  try {
    const dp = deps.botApiPayload(
      await deps.BOTAPI(ctx, 'get_group_member_info', { group_id: groupId, user_id: userId }),
    );
    return deps.RC_group_role[String(dp?.role || 'member')] || 0;
  } catch (e) {
    deps.logger?.warn?.('[刷屏检测] 查询用户身份失败:', (e as Error)?.message || e);
    return 1;
  }
}

async function punishSpamFlood(
  ctx: unknown,
  event: Record<string, unknown>,
  config: SpamFloodConfig,
  reason: 'burst' | 'sustained',
  robotLv: number,
  userLv: number,
  deps: SpamFloodDeps,
) {
  if (robotLv < 2 || robotLv <= userLv) {
    deps.logger?.info?.(
      `[刷屏检测] 跳过处罚：权限不足 botLv=${robotLv} userLv=${userLv} group=${event.group_id} user=${event.user_id}`,
    );
    return;
  }
  try {
    if (config.撤回 === '开启' && event.message_id != null) {
      await deps.BOTAPI(ctx, 'delete_msg', { message_id: event.message_id });
    }
    await deps.BOTAPI(ctx, 'set_group_ban', {
      group_id: event.group_id,
      user_id: event.user_id,
      duration: config.禁言秒,
    });
    if (config.通知 === '开启') {
      await deps.发消息(event, [
        deps.段_引用(event.message_id),
        deps.段_文本(`检测到刷屏行为（${reason === 'burst' ? '短窗口' : '长窗口'}），已处理。`),
      ]);
    }
    deps.logger?.info?.(
      `[刷屏检测] 处罚 group=${event.group_id} user=${event.user_id} reason=${reason} botLv=${robotLv} userLv=${userLv}`,
    );
  } catch (e) {
    deps.logger?.warn?.('[刷屏检测] 处罚执行失败:', (e as Error)?.message || e);
  }
}

/**
 * 热路径：检测并处罚。返回 true 表示已处罚并应中断后续 handleMessage。
 */
export async function checkSpamFlood(
  ctx: unknown,
  event: Record<string, unknown>,
  deps: SpamFloodDeps,
): Promise<boolean> {
  if (event.message_type !== 'group') return false;
  const groupId = event.group_id;
  const selfId = event.self_id;
  const userId = event.user_id ?? (event.sender as Record<string, unknown> | undefined)?.user_id;
  if (groupId == null || selfId == null || userId == null) return false;

  if (!isSpamFloodEventOn(String(groupId), deps.readB)) return false;

  if (String(selfId) === String(userId)) return false;

  if (deps.isCountExempt && (await deps.isCountExempt(event, ctx))) return false;

  const robotLv = await getBotRoleLv(ctx, groupId, selfId, deps);
  if (robotLv < 2) return false;

  const userLv = await getUserRoleLv(ctx, groupId, userId, deps);
  if (robotLv <= userLv) return false;

  const now = Math.floor(Date.now() / 1000);
  const gid = String(groupId);
  groupLastActiveAt.set(gid, now);

  const config = loadSpamFloodConfig(gid, deps.readB);
  const key = stateKey(groupId, userId);
  let state = stateMap.get(key);
  if (!state) {
    if (stateMap.size >= MAP_CAP) evictLruOne();
    state = {
      burst: { windowEnd: 0, count: 0 },
      sustained: { windowEnd: 0, count: 0 },
      lastBanAt: 0,
      lastTouchAt: now,
    };
    stateMap.set(key, state);
  }
  state.lastTouchAt = now;

  tickWindow(state.burst, config.短窗口秒, now);
  tickWindow(state.sustained, config.长窗口秒, now);

  const burstHit = state.burst.count >= config.短次数;
  const sustainedHit = state.sustained.count >= config.长次数;

  if ((burstHit || sustainedHit) && now - state.lastBanAt >= BAN_COOLDOWN_SEC) {
    const robotLv2 = await getBotRoleLv(ctx, groupId, selfId, deps);
    const userLv2 = await getUserRoleLv(ctx, groupId, userId, deps);
    await punishSpamFlood(ctx, event, config, burstHit ? 'burst' : 'sustained', robotLv2, userLv2, deps);
    state.lastBanAt = now;
    resetWindows(state, config, now);
    return true;
  }

  if (shouldDeleteState(state, now)) stateMap.delete(key);
  return false;
}

export function countSpamFloodEntries(groupId?: string) {
  if (!groupId) return stateMap.size;
  const prefix = `${groupId}:`;
  let n = 0;
  for (const k of stateMap.keys()) {
    if (k.startsWith(prefix)) n += 1;
  }
  return n;
}

export function getSpamFloodMemoryEstimateBytes() {
  return stateMap.size * 96;
}

export function initSpamFloodGuard(logger?: SpamFloodDeps['logger']) {
  boundLogger = logger;
  if (sweepTimer) return;
  sweepTimer = setInterval(() => {
    try {
      sweepSpamFloodState();
    } catch (e) {
      boundLogger?.warn?.('[刷屏检测] sweep 异常:', (e as Error)?.message || e);
    }
  }, SWEEP_INTERVAL_MS);
  sweepTimer.unref?.();
}

export function cleanupSpamFloodGuard() {
  if (sweepTimer) {
    clearInterval(sweepTimer);
    sweepTimer = null;
  }
  stateMap.clear();
  groupLastActiveAt.clear();
  configCache.clear();
  botRoleCache.clear();
  boundLogger = undefined;
}

function invalidateConfigCache(groupId: string) {
  configCache.delete(String(groupId));
}

export async function handleSpamFloodConfigCommands(
  message: string,
  event: Record<string, unknown>,
  ctx: unknown,
  deps: SpamFloodDeps,
): Promise<boolean> {
  if (event.message_type !== 'group') return false;
  const groupId = event.group_id;
  if (groupId == null) return false;

  const needAuth = async () => {
    if (!(await deps.canManageConfig?.(event, ctx))) return false;
    return true;
  };

  if (message === '查看刷屏检测') {
    if (!(await needAuth())) return true;
    const on = isSpamFloodEventOn(groupId, deps.readB);
    const cfg = loadSpamFloodConfig(groupId, deps.readB);
    let text = '📊 本群刷屏检测';
    text += `\n【事件】${on ? '✅开启' : '❌关闭'}`;
    text += `\n【短窗口】${cfg.短窗口秒} 秒内 ${cfg.短次数} 条`;
    text += `\n【长窗口】${cfg.长窗口秒} 秒内 ${cfg.长次数} 条`;
    text += `\n【禁言】${cfg.禁言秒} 秒（${Math.round(cfg.禁言秒 / 60)} 分钟）`;
    text += `\n【撤回】${cfg.撤回} · 【通知】${cfg.通知}`;
    await deps.发消息(event, [deps.段_引用(event.message_id), deps.段_文本(text)]);
    return true;
  }

  const m1 = message.match(/^设置刷屏间隔\s*(\d+)$/);
  if (m1) {
    if (!(await needAuth())) return true;
    const v = clamp(Number(m1[1]), 1, 60);
    writeConfigField(groupId, '短窗口秒', v, deps.writeB);
    await deps.发消息(event, [deps.段_引用(event.message_id), deps.段_文本(`✅ 短窗口已设为 ${v} 秒`)]);
    return true;
  }

  const m2 = message.match(/^设置刷屏次数\s*(\d+)$/);
  if (m2) {
    if (!(await needAuth())) return true;
    const v = clamp(Number(m2[1]), 2, 20);
    writeConfigField(groupId, '短次数', v, deps.writeB);
    await deps.发消息(event, [deps.段_引用(event.message_id), deps.段_文本(`✅ 短窗口次数已设为 ${v} 条`)]);
    return true;
  }

  const m3 = message.match(/^设置慢刷窗口\s*(\d+)$/);
  if (m3) {
    if (!(await needAuth())) return true;
    const v = clamp(Number(m3[1]), 30, 300);
    writeConfigField(groupId, '长窗口秒', v, deps.writeB);
    await deps.发消息(event, [deps.段_引用(event.message_id), deps.段_文本(`✅ 长窗口已设为 ${v} 秒`)]);
    return true;
  }

  const m4 = message.match(/^设置慢刷次数\s*(\d+)$/);
  if (m4) {
    if (!(await needAuth())) return true;
    const v = clamp(Number(m4[1]), 5, 60);
    writeConfigField(groupId, '长次数', v, deps.writeB);
    await deps.发消息(event, [deps.段_引用(event.message_id), deps.段_文本(`✅ 长窗口次数已设为 ${v} 条`)]);
    return true;
  }

  const m5 = message.match(/^设置刷屏禁言\s*(\d+)$/);
  if (m5) {
    if (!(await needAuth())) return true;
    const min = clamp(Number(m5[1]), 1, 1440);
    const sec = min * 60;
    writeConfigField(groupId, '禁言秒', sec, deps.writeB);
    await deps.发消息(event, [deps.段_引用(event.message_id), deps.段_文本(`✅ 刷屏禁言已设为 ${min} 分钟（${sec} 秒）`)]);
    return true;
  }

  return false;
}

function writeConfigField(
  groupId: string | number,
  key: keyof SpamFloodConfig,
  value: unknown,
  writeB: SpamFloodDeps['writeB'],
) {
  writeB(configRel(groupId), key, value);
  invalidateConfigCache(String(groupId));
}

export function getSpamFloodWebPayload(groupId: string | number, readB: SpamFloodDeps['readB']) {
  const cfg = loadSpamFloodConfig(groupId, readB);
  return {
    group_id: String(groupId),
    event: isSpamFloodEventOn(groupId, readB) ? '开启' : '关闭',
    config: cfg,
    defaults: { ...SPAM_FLOOD_DEFAULTS },
    active_entries: countSpamFloodEntries(String(groupId)),
  };
}

export function applySpamFloodWebSave(
  groupId: string | number,
  body: { event?: string; config?: Partial<SpamFloodConfig> },
  readB: SpamFloodDeps['readB'],
  writeB: SpamFloodDeps['writeB'],
) {
  if (body.event === '开启' || body.event === '关闭') {
    setSpamFloodEvent(groupId, body.event === '开启', writeB);
  }
  if (body.config && typeof body.config === 'object') {
    const patch: Partial<SpamFloodConfig> = {};
    if (body.config['短窗口秒'] != null) patch.短窗口秒 = clamp(num(body.config['短窗口秒'], SPAM_FLOOD_DEFAULTS.短窗口秒), 1, 60);
    if (body.config['短次数'] != null) patch.短次数 = clamp(num(body.config['短次数'], SPAM_FLOOD_DEFAULTS.短次数), 2, 20);
    if (body.config['长窗口秒'] != null) patch.长窗口秒 = clamp(num(body.config['长窗口秒'], SPAM_FLOOD_DEFAULTS.长窗口秒), 30, 300);
    if (body.config['长次数'] != null) patch.长次数 = clamp(num(body.config['长次数'], SPAM_FLOOD_DEFAULTS.长次数), 5, 60);
    if (body.config['禁言秒'] != null) patch.禁言秒 = clamp(num(body.config['禁言秒'], SPAM_FLOOD_DEFAULTS.禁言秒), 60, 86400);
    saveSpamFloodConfig(groupId, patch, readB, writeB);
  }
  invalidateConfigCache(String(groupId));
  return getSpamFloodWebPayload(groupId, readB);
}

export function resetSpamFloodWebConfig(
  groupId: string | number,
  readB: SpamFloodDeps['readB'],
  writeB: SpamFloodDeps['writeB'],
) {
  saveSpamFloodConfig(groupId, { ...SPAM_FLOOD_DEFAULTS }, readB, writeB);
  invalidateConfigCache(String(groupId));
  return getSpamFloodWebPayload(groupId, readB);
}
