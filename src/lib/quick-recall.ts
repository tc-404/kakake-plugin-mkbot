import {
  isRecallAlreadySuccess,
  loadGroupMessageRecordTimeline,
  markRecallSuccess,
  mergeAnchorIntoTimeline,
  type MsgRecordTimelineItem,
} from './message-record-storage';

export type QuickRecallMode = 'single' | 'up' | 'down' | null;

export type QuickRecallCommand = {
  mode: QuickRecallMode;
  count?: number;
};

export type QuickRecallDeps = {
  readB: (filename: string, key: string, defaultValue?: unknown) => unknown;
  BOTAPI: (ctx: unknown, action: string, params: Record<string, unknown>) => Promise<unknown>;
  botApiPayload: (result: unknown) => unknown;
  checkOwner3: (
    event: Record<string, unknown>,
    ctx: unknown,
    enableGroupAdmin?: boolean,
    silent?: boolean,
  ) => Promise<boolean>;
  RC_sq: string;
  RC_group_role: Record<string, number>;
  getDataPath: () => string;
  isWhitelistExempt?: (
    ctx: unknown,
    event: Record<string, unknown>,
    uid: string | number,
  ) => Promise<boolean>;
  logger?: {
    warn?: (...args: unknown[]) => void;
    info?: (...args: unknown[]) => void;
  };
};

const QUICK_RECALL_MAX_COUNT = 100;
const QUICK_RECALL_EMPTY_STREAK_LIMIT = 5;
const QUICK_RECALL_COOLDOWN_BATCH = 15;

function sleepMs(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function mkQuickRecallCooldownMs() {
  return 1000 + Math.floor(Math.random() * 2001);
}

function pickFirst(...values: unknown[]) {
  for (const v of values) {
    if (v != null && v !== '') return v;
  }
  return undefined;
}

/** delete_msg 成功判定：有 retcode/status 则按 OB11；无包装/空载荷且未抛错视为成功 */
function isBotApiSuccess(raw: unknown): boolean {
  if (raw == null) return true;
  if (typeof raw !== 'object') return true;
  const obj = raw as { retcode?: number; status?: string };
  if (obj.retcode != null && Number(obj.retcode) !== 0) return false;
  if (obj.status != null) {
    const st = String(obj.status).toLowerCase();
    if (st === 'failed' || st === 'error') return false;
  }
  return true;
}

export function parseQuickRecallCommand(message: string): QuickRecallCommand {
  const text = String(message ?? '');
  const up = text.match(/向上撤回(\d+)/);
  if (up) {
    let count = Number(up[1]);
    if (!Number.isFinite(count) || count === 0) return { mode: null };
    if (count > QUICK_RECALL_MAX_COUNT) count = QUICK_RECALL_MAX_COUNT;
    return { mode: 'up', count };
  }
  const down = text.match(/向下撤回(\d+)/);
  if (down) {
    let count = Number(down[1]);
    if (!Number.isFinite(count) || count === 0) return { mode: null };
    if (count > QUICK_RECALL_MAX_COUNT) count = QUICK_RECALL_MAX_COUNT;
    return { mode: 'down', count };
  }
  if (/向上撤回|向下撤回/.test(text)) return { mode: null };
  if (/撤回/.test(text)) return { mode: 'single' };
  return { mode: null };
}

export function extractReplyMessageId(event: Record<string, unknown>): string {
  for (const seg of (event?.message as { type?: string; data?: { id?: string } }[]) || []) {
    if (seg?.type === 'reply') {
      return String(seg?.data?.id ?? '').trim();
    }
  }
  return '';
}

async function resolveAnchorMeta(
  ctx: unknown,
  messageId: string,
  deps: QuickRecallDeps,
  fallback?: { userId?: string; time?: number },
): Promise<MsgRecordTimelineItem | null> {
  const id = String(messageId ?? '').trim();
  if (!id) return null;

  let userId = String(fallback?.userId ?? '').trim();
  let time = Number(fallback?.time ?? 0);

  try {
    const raw = await deps.BOTAPI(ctx, 'get_msg', { message_id: id });
    const msg = (deps.botApiPayload(raw) as Record<string, unknown>) || {};
    userId = String(
      pickFirst(
        msg.user_id,
        msg.userId,
        (msg.sender as { user_id?: string | number })?.user_id,
        msg.raw && (msg.raw as { records?: { senderUin?: string }[] }).records?.[0]?.senderUin,
        userId,
      ) ?? '',
    ).trim();
    const t = Number(pickFirst(msg.time, msg.timestamp, time));
    if (Number.isFinite(t) && t > 0) time = t;
  } catch {
    // 允许仅用 fallback（如无引用时当前 event）
  }

  if (!userId || !Number.isFinite(time) || time <= 0) return null;
  return { messageId: id, qq: userId, time };
}

function resolveAnchorFromEvent(event: Record<string, unknown>): MsgRecordTimelineItem | null {
  const messageId = String(event.message_id ?? '').trim();
  const qq = String(
    pickFirst(event.user_id, (event.sender as { user_id?: string | number })?.user_id) ?? '',
  ).trim();
  const time = Number(event.time ?? 0);
  if (!messageId || !qq || !Number.isFinite(time) || time <= 0) return null;
  return { messageId, qq, time };
}

async function ensureBotIsGroupAdmin(
  ctx: unknown,
  event: Record<string, unknown>,
  deps: QuickRecallDeps,
): Promise<{ ok: boolean; robotLevel: number }> {
  try {
    const raw = await deps.BOTAPI(ctx, 'get_group_member_info', {
      group_id: event.group_id,
      user_id: event.self_id,
      no_cache: true,
    });
    const info = (deps.botApiPayload(raw) as { role?: string }) || {};
    const role = String(info.role || 'member');
    if (role !== 'admin' && role !== 'owner') {
      return { ok: false, robotLevel: deps.RC_group_role.member || 1 };
    }
    return { ok: true, robotLevel: deps.RC_group_role[role] || 0 };
  } catch {
    return { ok: false, robotLevel: 0 };
  }
}

class QuickRecallRoleCache {
  private readonly ctx: unknown;
  private readonly event: Record<string, unknown>;
  private readonly deps: QuickRecallDeps;
  private readonly robotLevel: number;
  private readonly selfId: string;
  private readonly levels = new Map<string, number>();

  constructor(
    ctx: unknown,
    event: Record<string, unknown>,
    deps: QuickRecallDeps,
    robotLevel: number,
  ) {
    this.ctx = ctx;
    this.event = event;
    this.deps = deps;
    this.robotLevel = robotLevel;
    this.selfId = String(event.self_id ?? '');
  }

  async getTargetLevel(qq: string): Promise<number> {
    const key = String(qq ?? '').trim();
    if (!key) return this.deps.RC_group_role.member || 1;
    if (this.levels.has(key)) return this.levels.get(key)!;
    try {
      const raw = await this.deps.BOTAPI(this.ctx, 'get_group_member_info', {
        group_id: this.event.group_id,
        user_id: key,
        no_cache: true,
      });
      const info = (this.deps.botApiPayload(raw) as { role?: string }) || {};
      const level = this.deps.RC_group_role[String(info.role || 'member')] || 0;
      this.levels.set(key, level);
      return level;
    } catch {
      const fallback = this.deps.RC_group_role.member || 1;
      this.levels.set(key, fallback);
      return fallback;
    }
  }

  canDelete(targetQQ: string, targetLevel?: number): boolean {
    const qq = String(targetQQ ?? '');
    if (qq && qq === this.selfId) return true;
    const level = targetLevel ?? this.deps.RC_group_role.member ?? 1;
    return this.robotLevel > level || this.robotLevel === (this.deps.RC_group_role.owner ?? 3);
  }

  dispose() {
    this.levels.clear();
  }
}

async function tryDeleteMsgSuccess(
  ctx: unknown,
  messageId: string,
  deps: QuickRecallDeps,
  options?: { skipDupCheck?: boolean },
): Promise<boolean> {
  const id = String(messageId ?? '').trim();
  if (!id) return false;
  if (!options?.skipDupCheck && isRecallAlreadySuccess(deps.getDataPath, id)) {
    return false;
  }
  try {
    const raw = await deps.BOTAPI(ctx, 'delete_msg', { message_id: id });
    if (!isBotApiSuccess(raw)) return false;
    await markRecallSuccess(deps.getDataPath, id);
    return true;
  } catch {
    return false;
  }
}

function enqueueQuickRecall(task: () => Promise<void>, logger?: QuickRecallDeps['logger']) {
  setImmediate(() => {
    task().catch((err) => {
      logger?.warn?.('[快捷撤回] 后台任务异常:', (err as Error)?.message || err);
    });
  });
}

async function runSingleQuickRecall(
  ctx: unknown,
  event: Record<string, unknown>,
  quotedId: string,
  deps: QuickRecallDeps,
  manageModeOn: boolean,
) {
  const admin = await ensureBotIsGroupAdmin(ctx, event, deps);
  if (!admin.ok) return;

  const allowed = await deps.checkOwner3(event, ctx, manageModeOn, false);
  if (!allowed) return;

  const anchor = await resolveAnchorMeta(ctx, quotedId, deps);
  if (!anchor) return;

  const roleCache = new QuickRecallRoleCache(ctx, event, deps, admin.robotLevel);
  try {
    const targetLevel = await roleCache.getTargetLevel(anchor.qq);
    if (!roleCache.canDelete(anchor.qq, targetLevel)) return;
    // 白名单成员豁免（免撤回，手动也豁免）
    if (deps.isWhitelistExempt && (await deps.isWhitelistExempt(ctx, event, anchor.qq))) return;
    await tryDeleteMsgSuccess(ctx, quotedId, deps, { skipDupCheck: true });
  } finally {
    roleCache.dispose();
  }
}

async function runBatchQuickRecall(
  ctx: unknown,
  event: Record<string, unknown>,
  mode: 'up' | 'down',
  count: number,
  quotedId: string,
  deps: QuickRecallDeps,
  manageModeOn: boolean,
) {
  const admin = await ensureBotIsGroupAdmin(ctx, event, deps);
  if (!admin.ok) return;

  const allowed = await deps.checkOwner3(event, ctx, manageModeOn, true);
  if (!allowed) return;

  let anchor: MsgRecordTimelineItem | null = null;
  if (quotedId) {
    anchor = await resolveAnchorMeta(ctx, quotedId, deps);
  } else if (mode === 'up') {
    const fromEvent = resolveAnchorFromEvent(event);
    anchor = fromEvent
      ? await resolveAnchorMeta(ctx, fromEvent.messageId, deps, {
          userId: fromEvent.qq,
          time: fromEvent.time,
        })
      : null;
  }
  if (!anchor) return;

  // 按消息记录 JSON 时间线索引上一条/下一条（不再调用 get_group_msg_history）
  let timeline = loadGroupMessageRecordTimeline(deps.getDataPath, event.group_id as string | number);
  const merged = mergeAnchorIntoTimeline(timeline, anchor);
  timeline = merged.timeline;
  const anchorIndex = merged.anchorIndex;
  if (anchorIndex < 0) return;

  const roleCache = new QuickRecallRoleCache(ctx, event, deps, admin.robotLevel);
  let emptyStreak = 0;
  let steps = 0;
  let deletedCount = 0;

  try {
    // N = 从锚点起沿 JSON 时间线走 N 个索引位（含锚点）；每位上凡有权限则撤，不限发送者
    while (steps < count && emptyStreak < QUICK_RECALL_EMPTY_STREAK_LIMIT) {
      const idx = mode === 'down' ? anchorIndex + steps : anchorIndex - steps;

      if (idx < 0 || idx >= timeline.length) {
        emptyStreak++;
        steps++;
        continue;
      }

      emptyStreak = 0;
      const entry = timeline[idx];
      const senderLevel = await roleCache.getTargetLevel(entry.qq);

      if (roleCache.canDelete(entry.qq, senderLevel)) {
        // 白名单成员豁免（免撤回，手动也豁免）
        if (deps.isWhitelistExempt && (await deps.isWhitelistExempt(ctx, event, entry.qq))) {
          steps++;
          continue;
        }
        const ok = await tryDeleteMsgSuccess(ctx, entry.messageId, deps);
        if (ok) {
          deletedCount++;
          if (count > QUICK_RECALL_COOLDOWN_BATCH && deletedCount % QUICK_RECALL_COOLDOWN_BATCH === 0) {
            await sleepMs(mkQuickRecallCooldownMs());
          }
        }
      }

      steps++;
    }
  } finally {
    roleCache.dispose();
  }
}

export function handleQuickRecallBlock(
  message: string,
  event: Record<string, unknown>,
  ctx: unknown,
  deps: QuickRecallDeps,
) {
  if (event.message_type !== 'group') return;
  if (!/撤回/.test(String(message ?? ''))) return;

  const cmd = parseQuickRecallCommand(message);
  if (cmd.mode == null) return;

  const quotedId = extractReplyMessageId(event);
  if (!quotedId && cmd.mode !== 'up') return;

  if (deps.RC_sq !== '已授权') return;

  const groupId = event.group_id;
  const switchOn = deps.readB(`筱筱吖/事件系统/${groupId}.json`, '快捷撤回', '关闭') === '开启';
  if (!switchOn) return;

  const manageModeOn =
    deps.readB(`筱筱吖/事件系统/${groupId}.json`, '管理模式', '关闭') === '开启';

  if (cmd.mode === 'single') {
    enqueueQuickRecall(
      () => runSingleQuickRecall(ctx, event, quotedId, deps, manageModeOn),
      deps.logger,
    );
    return;
  }

  if (cmd.mode === 'up' || cmd.mode === 'down') {
    const batchCount = cmd.count ?? 0;
    if (batchCount <= 0) return;
    enqueueQuickRecall(
      () => runBatchQuickRecall(ctx, event, cmd.mode as 'up' | 'down', batchCount, quotedId, deps, manageModeOn),
      deps.logger,
    );
  }
}
