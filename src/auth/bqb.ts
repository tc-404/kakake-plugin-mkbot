// ---------------------------------------------------------------------------
// 表情包系统（bqb）：爬 / 顶 / 啃 / 摸头 / 吸 / 啾 / 挠头 / 贴贴
// 事件开关「表情制作」：群聊→事件系统/{群号}.json；私聊→事件系统/私聊.json
// 指令/艾特一律只看 OB11 message 段，禁止用 CQ / raw_message 判断内容
// ---------------------------------------------------------------------------

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import type {
  AuthRcStatus,
  BqbDeps,
  MkCommandHandleResult,
  MkMessageEvent,
  MkOb11Segment,
  MkPluginContext,
} from '../types';
import { 发消息, 段_引用, 段_图片, 段_文本 } from '../BOT';
import { fetchQqAvatarBuffer, fetchUrlImageBuffer } from '../lib/api/bqb-shared';
import { render as renderCrawl } from '../lib/api/bqb-crawl';
import { render as renderPlay } from '../lib/api/bqb-play';
import { render as renderBite } from '../lib/api/bqb-bite';
import { render as renderPetpet } from '../lib/api/bqb-petpet';
import { render as renderEat } from '../lib/api/bqb-eat';
import { render as renderSuck } from '../lib/api/bqb-suck';
import { render as renderJiujiu } from '../lib/api/bqb-jiujiu';
import { render as renderScratchHead } from '../lib/api/bqb-scratch-head';
import { render as renderRub } from '../lib/api/bqb-rub';
import { render as renderAbstinence } from '../lib/api/bqb-abstinence';
import { render as renderAcgEntrance } from '../lib/api/bqb-acg-entrance';
import { render as renderAddiction } from '../lib/api/bqb-addiction';
import { render as renderDontTouch } from '../lib/api/bqb-dont-touch';
import { render as renderFadeAway } from '../lib/api/bqb-fade-away';
import { render as renderPound } from '../lib/api/bqb-pound';
import { render as renderSoldOut } from '../lib/api/bqb-sold-out';
import { render as renderTaunt } from '../lib/api/bqb-taunt';
import { render as renderThinkWhat } from '../lib/api/bqb-think-what';
import { render as renderWhatIWantToDo } from '../lib/api/bqb-what-i-want-to-do';
import { render as renderYouDontGet } from '../lib/api/bqb-you-dont-get';
import { runBqbSharpJob } from '../lib/sharp-worker-client';
import { requireAuthorized } from '../lib/unauth-reply';

export const BQB_EVENT_KEY = '表情制作';

type BqbKind =
  | 'crawl'
  | 'play'
  | 'bite'
  | 'petpet'
  | 'eat'
  | 'suck'
  | 'jiujiu'
  | 'scratch_head'
  | 'rub'
  | 'abstinence'
  | 'acg_entrance'
  | 'addiction'
  | 'dont_touch'
  | 'fade_away'
  | 'pound'
  | 'sold_out'
  | 'taunt'
  | 'think_what'
  | 'what_i_want_to_do'
  | 'you_dont_get';

interface BqbResolvedCommand {
  kind: BqbKind;
  /** 戒导可选日期 YYYY-MM-DD */
  date?: string;
}

const BQB_TRIGGERS = new Map<string, BqbKind>([
  ['爬', 'crawl'],
  ['顶', 'play'],
  ['啃', 'bite'],
  ['摸头', 'petpet'],
  ['吃', 'eat'],
  ['吸', 'suck'],
  ['啾', 'jiujiu'],
  ['挠头', 'scratch_head'],
  ['贴贴', 'rub'],
  ['二次元入口', 'acg_entrance'],
  ['上瘾', 'addiction'],
  ['别碰', 'dont_touch'],
  ['灰飞烟灭', 'fade_away'],
  ['捣', 'pound'],
  ['pound', 'pound'],
  ['卖掉了', 'sold_out'],
  ['sold_out', 'sold_out'],
  ['嘲讽', 'taunt'],
  ['taunt', 'taunt'],
  ['想什么', 'think_what'],
  ['think_what', 'think_what'],
  ['我想上的', 'what_i_want_to_do'],
  ['what_i_want_to_do', 'what_i_want_to_do'],
  ['你不懂啦', 'you_dont_get'],
  ['you_dont_get', 'you_dont_get'],
]);

function resolveBqbCommand(text: string): BqbResolvedCommand | null {
  const abst = text.match(/^戒导(\d{4}-\d{1,2}-\d{1,2})?$/);
  if (abst) {
    return { kind: 'abstinence', date: abst[1] };
  }
  const kind = BQB_TRIGGERS.get(text);
  if (kind) return { kind };
  return null;
}

function resolveDisplayName(event: MkMessageEvent): string {
  const sender = event.sender as { card?: string; nickname?: string } | undefined;
  const name = String(sender?.card || sender?.nickname || event.user_id || '').trim();
  return name || '戒导人';
}

/** 解析戒导人署名：@ 他人时取对方群名片/昵称 */
async function resolveSubjectDisplayName(
  event: MkMessageEvent,
  ctx: MkPluginContext,
  d: BqbDeps,
  subjectQq: string,
): Promise<string> {
  const qq = String(subjectQq ?? '').trim();
  if (!qq) return '戒导人';
  if (qq === resolveSelfQq(event)) {
    return resolveDisplayName(event);
  }
  if (!d.botApi) return qq;

  try {
    if (event.message_type === 'group' && event.group_id != null) {
      const info = (await d.botApi(ctx, 'get_group_member_info', {
        group_id: event.group_id,
        user_id: Number(qq) || qq,
      })) as { card?: string; nickname?: string } | null;
      const name = String(info?.card || info?.nickname || '').trim();
      if (name) return name;
    } else if (event.message_type === 'private') {
      const info = (await d.botApi(ctx, 'get_stranger_info', {
        user_id: Number(qq) || qq,
      })) as { nickname?: string } | null;
      const name = String(info?.nickname || '').trim();
      if (name) return name;
    }
  } catch {
    // 接口失败时回退 QQ 号
  }
  return qq;
}

function eventScopeId(event: MkMessageEvent): string | null {
  if (event.message_type === 'group' && event.group_id != null) {
    return String(event.group_id);
  }
  if (event.message_type === 'private') {
    return '私聊';
  }
  return null;
}

/** 是否已开启表情制作（群聊/私聊） */
export function isBqbEventEnabled(event: MkMessageEvent, readB: BqbDeps['readB']): boolean {
  const scope = eventScopeId(event);
  if (!scope) return false;
  return readB(`筱筱吖/事件系统/${scope}.json`, BQB_EVENT_KEY, '关闭') === '开启';
}

function resolveSelfQq(event: MkMessageEvent): string {
  return String(event.user_id ?? '').trim();
}

function asSegments(event: MkMessageEvent): MkOb11Segment[] {
  return Array.isArray(event.message) ? (event.message as MkOb11Segment[]) : [];
}

function extractReplyMessageId(event: MkMessageEvent): string | null {
  for (const seg of asSegments(event)) {
    if (seg?.type === 'reply') {
      const id = String((seg.data as any)?.id ?? '').trim();
      if (id) return id;
    }
  }
  return null;
}

function extractImageRefsFromSegments(segs: MkOb11Segment[]): string[] {
  const out: string[] = [];
  for (const seg of segs) {
    if (seg?.type !== 'image') continue;
    const data = (seg.data && typeof seg.data === 'object') ? (seg.data as Record<string, unknown>) : {};
    const ref = String((data.url ?? data.file ?? '') as any).trim();
    if (ref) out.push(ref);
  }
  return out;
}

async function fetchImageBufferFromRef(ref: string): Promise<Buffer | null> {
  const s = String(ref ?? '').trim();
  if (!s) return null;
  if (/^https?:\/\//i.test(s)) return fetchUrlImageBuffer(s);
  try {
    if (/^file:\/\//i.test(s)) {
      const p = fileURLToPath(s);
      if (fs.existsSync(p)) return await fs.promises.readFile(p);
      return null;
    }
  } catch {
    // ignore
  }
  try {
    const p = path.isAbsolute(s) ? s : path.resolve(s);
    if (fs.existsSync(p)) return await fs.promises.readFile(p);
  } catch {
    // ignore
  }
  return null;
}

function unwrapBotApiPayload(res: unknown): any {
  if (!res || typeof res !== 'object') return res;
  const r: any = res;
  // common OB11 shapes: { status, data }, { retcode, data }, or raw object
  if (r.data != null) return r.data;
  return r;
}

async function getQuotedMessage(
  ctx: MkPluginContext,
  d: BqbDeps,
  messageId: string,
): Promise<{ user_id?: string | number; sender?: any; message?: MkOb11Segment[] } | null> {
  if (!d.botApi) return null;
  const mid = String(messageId ?? '').trim();
  if (!mid) return null;
  try {
    const raw = await d.botApi(ctx, 'get_msg', { message_id: mid });
    const dp = unwrapBotApiPayload(raw);
    if (!dp || typeof dp !== 'object') return null;
    const msg: any = dp;
    const segs = Array.isArray(msg.message) ? (msg.message as MkOb11Segment[]) : undefined;
    return { user_id: msg.user_id ?? msg.sender?.user_id, sender: msg.sender, message: segs };
  } catch {
    return null;
  }
}

/**
 * 仅拼接 text 段得到触发词（去空白）。
 * 贴贴@人时典型结构：[{text:贴贴},{at},{text:空格}] → 「贴贴」
 */
function resolveTriggerFromSegments(event: MkMessageEvent, fallbackMessage: string): string {
  const segs = asSegments(event);
  if (segs.length > 0) {
    let text = '';
    for (const seg of segs) {
      if (seg?.type === 'text' && seg.data?.text != null) {
        text += String(seg.data.text);
      }
    }
    return text.replace(/\s+/g, '').trim();
  }
  // 无数组段时：仅用已解析的纯文本兜底，绝不解析 CQ
  return String(fallbackMessage ?? '')
    .replace(/\s+/g, '')
    .trim();
}

/** 仅从 at 消息段取 QQ（排除全体 / 自己 / 机器人） */
function extractAtQqFromSegments(event: MkMessageEvent, excludeQq?: string): string | null {
  const skip = new Set(
    [excludeQq, event.self_id != null ? String(event.self_id) : '']
      .map((v) => String(v ?? '').trim())
      .filter(Boolean),
  );
  for (const seg of asSegments(event)) {
    if (seg?.type !== 'at') continue;
    const qq = String(seg.data?.qq ?? '').trim();
    if (!qq || qq === 'all' || skip.has(qq)) continue;
    if (!/^\d{5,12}$/.test(qq)) continue;
    return qq;
  }
  return null;
}

type AvatarSource =
  | { type: 'image'; buffer: Buffer }
  | { type: 'qq'; qq: string };

/**
 * 统一头像取源（单人头像类）
 * 优先级：
 * - 本条消息图片（第 1 张）
 * - 引用消息图片（第 1 张）
 * - 引用消息发送者头像（无图但引用存在）
 * - @ 目标头像
 * - 自己头像
 */
async function resolveSingleAvatarSource(
  message: string,
  event: MkMessageEvent,
  ctx: MkPluginContext,
  d: BqbDeps,
  selfQq: string,
): Promise<AvatarSource> {
  // 1) 当前消息图片
  const curImgs = extractImageRefsFromSegments(asSegments(event));
  if (curImgs.length > 0) {
    const buf = await fetchImageBufferFromRef(curImgs[0]);
    if (buf) return { type: 'image', buffer: buf };
  }

  // 2) 引用消息图片 / 引用发送者头像
  const replyId = extractReplyMessageId(event);
  if (replyId) {
    const quoted = await getQuotedMessage(ctx, d, replyId);
    const qImgs = quoted?.message ? extractImageRefsFromSegments(quoted.message) : [];
    if (qImgs.length > 0) {
      const buf = await fetchImageBufferFromRef(qImgs[0]);
      if (buf) return { type: 'image', buffer: buf };
    }
    const quotedUser = String(quoted?.user_id ?? '').trim();
    if (quotedUser) return { type: 'qq', qq: quotedUser };
  }

  // 3) @ 头像
  const atQq = extractAtQqFromSegments(event, selfQq);
  if (atQq) return { type: 'qq', qq: atQq };

  // 4) 自己
  return { type: 'qq', qq: selfQq };
}

/**
 * 贴贴（双头像）取源：
 * - 若本条消息带 2+ 张图：用前两张当两个头像
 * - 若本条消息带 1 张图：优先当 target；self 用发送者头像
 * - 若引用消息带图：优先补 target
 * - 否则 target 取 @；再不行取引用发送者；都没有则报错
 */
async function resolveRubSources(
  event: MkMessageEvent,
  ctx: MkPluginContext,
  d: BqbDeps,
  selfQq: string,
): Promise<{ selfAvatar: Buffer; targetAvatar: Buffer } | null> {
  const curImgs = extractImageRefsFromSegments(asSegments(event));
  const bufs: Buffer[] = [];
  for (const ref of curImgs.slice(0, 2)) {
    const b = await fetchImageBufferFromRef(ref);
    if (b) bufs.push(b);
  }

  // 引用消息补图（只补 1 张，避免歧义）
  if (bufs.length < 2) {
    const replyId = extractReplyMessageId(event);
    if (replyId) {
      const quoted = await getQuotedMessage(ctx, d, replyId);
      const qImgs = quoted?.message ? extractImageRefsFromSegments(quoted.message) : [];
      if (qImgs.length > 0) {
        const b = await fetchImageBufferFromRef(qImgs[0]);
        if (b) bufs.push(b);
      }
    }
  }

  // 2 张图：直接用
  if (bufs.length >= 2) {
    return { selfAvatar: bufs[0], targetAvatar: bufs[1] };
  }

  // 1 张图：默认当 target；self 用头像
  if (bufs.length === 1) {
    const selfAvatar = await fetchQqAvatarBuffer(selfQq);
    if (!selfAvatar) return null;
    return { selfAvatar, targetAvatar: bufs[0] };
  }

  // 没图：按 @ / 引用发送者补 target
  const replyId = extractReplyMessageId(event);
  let quotedUser = '';
  if (replyId) {
    const quoted = await getQuotedMessage(ctx, d, replyId);
    quotedUser = String(quoted?.user_id ?? '').trim();
  }
  const atQq = extractAtQqFromSegments(event, selfQq);
  const targetQq = quotedUser || atQq || '';
  if (!targetQq) return null;

  const [selfAvatar, targetAvatar] = await Promise.all([
    fetchQqAvatarBuffer(selfQq),
    fetchQqAvatarBuffer(targetQq),
  ]);
  if (!selfAvatar || !targetAvatar) return null;
  return { selfAvatar, targetAvatar };
}

export async function handleBqbCommands(
  message: string,
  event: MkMessageEvent,
  ctx: MkPluginContext,
  RC_sq: AuthRcStatus,
  d: BqbDeps,
): Promise<MkCommandHandleResult> {
  const text = resolveTriggerFromSegments(event, message);
  const resolved = resolveBqbCommand(text);
  if (!resolved) return false;
  const { kind, date: abstinenceDate } = resolved;

  // 未开启表情制作：静默跳过，不回复、不占指令（避免「爬/吃/摸头」等日常聊天被打断）
  if (!isBqbEventEnabled(event, d.readB)) {
    return false;
  }

  if (!(await requireAuthorized(RC_sq, event, d.readB))) {
    return 'halt';
  }

  const selfQq = resolveSelfQq(event);
  if (!selfQq) {
    await 发消息(event, [段_引用(event.message_id), 段_文本('没法确定你的 QQ 号～')]);
    return 'halt';
  }

  const commonBase = {
    dataPath: d.getDataPath(),
    pluginDir: String(d.pluginDir || ctx.pluginPath || '').trim(),
  };

  try {
    let result;
    if (kind === 'rub') {
      const rub = await resolveRubSources(event, ctx, d, selfQq);
      if (!rub) {
        await 发消息(event, [
          段_引用(event.message_id),
          段_文本('贴贴需要 @一位小伙伴哦～（或发送两张图片/引用带图消息）'),
        ]);
        return 'halt';
      }
      result = await runBqbSharpJob(
        { subKind: 'rub', ...commonBase },
        [
          { key: 'selfAvatar', data: rub.selfAvatar },
          { key: 'targetAvatar', data: rub.targetAvatar },
        ],
        () => renderRub({ ...rub, ...commonBase }),
      );
    } else if (kind === 'abstinence') {
      const src = await resolveSingleAvatarSource(message, event, ctx, d, selfQq);
      const avatar =
        src.type === 'image'
          ? src.buffer
          : await fetchQqAvatarBuffer(src.qq);
      if (!avatar) {
        await 发消息(event, [段_引用(event.message_id), 段_文本('图片/头像获取失败，请稍后再试～')]);
        return 'halt';
      }
      const displayQq = src.type === 'qq' ? src.qq : selfQq;
      const displayName = await resolveSubjectDisplayName(event, ctx, d, displayQq);
      result = await runBqbSharpJob(
        { subKind: 'abstinence', displayName, date: abstinenceDate, ...commonBase },
        [{ key: 'avatar', data: avatar }],
        () =>
          renderAbstinence({
            avatar,
            displayName,
            date: abstinenceDate,
            ...commonBase,
          }),
      );
    } else {
      const src = await resolveSingleAvatarSource(message, event, ctx, d, selfQq);
      const avatar =
        src.type === 'image'
          ? src.buffer
          : await fetchQqAvatarBuffer(src.qq);
      if (!avatar) {
        await 发消息(event, [段_引用(event.message_id), 段_文本('图片/头像获取失败，请稍后再试～')]);
        return 'halt';
      }
      const common = { avatar, ...commonBase };
      const renderDirect = async () => {
        if (kind === 'crawl') return renderCrawl(common);
        if (kind === 'play') return renderPlay(common);
        if (kind === 'bite') return renderBite(common);
        if (kind === 'petpet') return renderPetpet(common);
        if (kind === 'eat') return renderEat(common);
        if (kind === 'suck') return renderSuck(common);
        if (kind === 'jiujiu') return renderJiujiu(common);
        if (kind === 'acg_entrance') return renderAcgEntrance(common);
        if (kind === 'addiction') return renderAddiction(common);
        if (kind === 'dont_touch') return renderDontTouch(common);
        if (kind === 'fade_away') return renderFadeAway(common);
        if (kind === 'pound') return renderPound(common);
        if (kind === 'sold_out') return renderSoldOut(common);
        if (kind === 'taunt') return renderTaunt(common);
        if (kind === 'think_what') return renderThinkWhat(common);
        if (kind === 'what_i_want_to_do') return renderWhatIWantToDo(common);
        if (kind === 'you_dont_get') return renderYouDontGet(common);
        return renderScratchHead(common);
      };
      result = await runBqbSharpJob(
        { subKind: kind, ...commonBase },
        [{ key: 'avatar', data: avatar }],
        renderDirect,
      );
    }

    const b64 = result.buffer.toString('base64');
    await 发消息(event, [段_引用(event.message_id), 段_图片(`base64://${b64}`)]);
  } catch (error) {
    d.logger?.error?.('[表情包系统] 渲染失败:', error);
    await 发消息(event, [
      段_引用(event.message_id),
      段_文本('表情包制作失败了，请确认 Sharp 已安装且素材完整～'),
    ]);
  }

  return 'halt';
}
