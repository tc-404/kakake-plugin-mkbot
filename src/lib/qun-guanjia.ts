// ---------------------------------------------------------------------------
// Q群管家代发：Cookie 走 NapCat get_cookies，token 从管家 JSON 消息采集
// 无 token 时：写临时 Q&A + @管家，等待 autoreply JSON 中的 metadata.token
// ---------------------------------------------------------------------------

import type { MkMessageEvent, MkPluginContext, MkReadB, MkWriteB } from '../types';

export const GUANJIA_BOT_UIN = 2854196310;
const QUN_DOMAIN = 'qun.qq.com';
const QQ_DOMAIN = 'qq.com';

const SET_QNA_URL =
  'https://web.qun.qq.com/qunrobot/proxy/domain/app.qun.qq.com/cgi-bin/guanjia_robot/qna_setting/set_qna';
const GET_ANSWER_URL =
  'https://app.qun.qq.com/cgi-bin/guanjia_robot/qna_callback/get_answer';
const GET_QNA_URL =
  'https://web.qun.qq.com/qunrobot/proxy/domain/app.qun.qq.com/cgi-bin/guanjia_robot/qna_setting/get_qna';

const TOKEN_FILE_PREFIX = '筱筱吖/扩展功能/群管家/';
const TOKEN_PROBE_ANSWER = 'MKbot_token_probe';

const QNA_CHARSET = '0123456789ABCDEFabcdef';
const DEFAULT_UA =
  'Mozilla/5.0 (Windows; U; Windows NT 5.2; en-US) AppleWebKit/537.36 (KHTML, like Gecko) Safari/537.36 VivoBrowser/14.5.12.0 Chrome/87.0.4280.141';

const SESSION_TTL_MS = 5 * 60 * 1000;
const TOKEN_WAIT_DEFAULT_MS = 20_000;

const sessionCache = new Map<number, GuanjiaSession>();

interface TokenWaiter {
  resolve: (token: string) => void;
  reject: (err: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

/** 按群号等待管家 autoreply JSON 中的 token */
const tokenWaiters = new Map<string, TokenWaiter[]>();

export interface GuanjiaSendResult {
  ok: boolean;
  error?: string;
  detail?: string;
}

export interface GuanjiaSendOptions {
  groupId: string | number;
  text: string;
  /** get_answer / 采 token 失败时由调用方 @ 管家并撤回 */
  onNeedTrigger?: () => Promise<void>;
}

interface GuanjiaSession {
  uin: number;
  skey: string;
  pSkey: string;
  cookie: string;
  bkn: string;
  updatedAt: number;
}

function logWarn(ctx: MkPluginContext | null | undefined, msg: string, detail?: unknown) {
  try {
    ctx?.logger?.warn?.(`[群管家] ${msg}`, detail ?? '');
  } catch {
    /* ignore */
  }
}

function logInfo(ctx: MkPluginContext | null | undefined, msg: string) {
  try {
    ctx?.logger?.info?.(`[群管家] ${msg}`);
  } catch {
    /* ignore */
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function groupKey(groupId: string | number): string {
  return String(groupId);
}

function computeGtk(key: string, hash = 5381): string {
  for (let i = 0; i < key.length; i++) {
    hash += (hash << 5) + key.charCodeAt(i);
  }
  return String(hash & 0x7fffffff);
}

function mergeCookieStrings(...parts: string[]): string {
  const map = new Map<string, string>();
  for (const raw of parts) {
    const normalized = raw.replace(/\s/g, '');
    for (const part of normalized.split(';')) {
      if (!part) continue;
      const eq = part.indexOf('=');
      if (eq < 0) continue;
      map.set(part.slice(0, eq), part.slice(eq + 1));
    }
  }
  return Array.from(map.entries())
    .map(([k, v]) => `${k}=${v}`)
    .join(';');
}

function parseCookieFields(cookie: string): { uin: number; skey: string; pSkey: string } | null {
  const normalized = cookie.replace(/\s/g, '');
  let uinRaw = '';
  let skey = '';
  let pSkey = '';
  for (const part of normalized.split(';')) {
    if (!part) continue;
    const eq = part.indexOf('=');
    if (eq < 0) continue;
    const name = part.slice(0, eq);
    const val = part.slice(eq + 1);
    if (name === 'uin') uinRaw = val;
    else if (name === 'skey') skey = val;
    else if (name === 'p_skey') pSkey = val;
  }
  const qq = uinRaw.replace(/^o/i, '');
  const uin = Number.parseInt(qq, 10);
  if (!Number.isFinite(uin) || uin <= 0 || !skey || !pSkey) return null;
  return { uin, skey, pSkey };
}

function getSelfUin(ctx: MkPluginContext): number {
  const fromCore = Number(ctx?.core?.selfInfo?.uin ?? 0);
  return Number.isFinite(fromCore) && fromCore > 0 ? fromCore : 0;
}

async function callGetCookies(ctx: MkPluginContext, domain: string): Promise<{ cookies: string; bkn: string } | null> {
  if (!ctx?.actions?.call) return null;
  try {
    const result = (await ctx.actions.call(
      'get_cookies',
      { domain },
      ctx.adapterName,
      ctx.pluginManager?.config,
    )) as { data?: { cookies?: string; bkn?: string }; cookies?: string; bkn?: string } | null;
    const data = (result as { data?: { cookies?: string; bkn?: string } })?.data ?? result;
    const cookies = typeof data?.cookies === 'string' ? data.cookies.trim() : '';
    if (!cookies) return null;
    const bkn = typeof data?.bkn === 'string' ? data.bkn : '';
    return { cookies, bkn };
  } catch (e) {
    logWarn(ctx, `get_cookies(${domain}) 失败`, e);
    return null;
  }
}

async function ensureGuanjiaSession(ctx: MkPluginContext): Promise<GuanjiaSession | null> {
  const selfUin = getSelfUin(ctx);
  const cached = selfUin > 0 ? sessionCache.get(selfUin) : undefined;
  if (cached && Date.now() - cached.updatedAt < SESSION_TTL_MS) {
    return cached;
  }

  const qunPack = await callGetCookies(ctx, QUN_DOMAIN);
  if (!qunPack) {
    logWarn(ctx, '无法获取 qun.qq.com Cookie');
    return null;
  }

  let merged = qunPack.cookies;
  let parsed = parseCookieFields(merged);
  if (!parsed?.skey) {
    const qqPack = await callGetCookies(ctx, QQ_DOMAIN);
    if (qqPack?.cookies) {
      merged = mergeCookieStrings(qqPack.cookies, merged);
      parsed = parseCookieFields(merged);
    }
  }

  if (!parsed) {
    logWarn(ctx, 'Cookie 解析失败，缺少 uin/skey/p_skey');
    return null;
  }

  const bkn = qunPack.bkn || computeGtk(parsed.skey);
  const session: GuanjiaSession = {
    uin: parsed.uin,
    skey: parsed.skey,
    pSkey: parsed.pSkey,
    cookie: merged.replace(/\s/g, ''),
    bkn,
    updatedAt: Date.now(),
  };
  if (selfUin > 0) sessionCache.set(selfUin, session);
  return session;
}

function guanjiaHeaders(session: GuanjiaSession): Record<string, string> {
  return {
    'qname-service': '976321:131072',
    'qname-space': 'Production',
    'User-Agent': DEFAULT_UA,
    'Content-Type': 'application/json',
    Origin: 'https://web.qun.qq.com',
    Cookie: `uin=o${session.uin};skey=${session.skey};p_skey=${session.pSkey}`,
  };
}

function toRetcode(raw: Record<string, unknown> | null): number {
  if (!raw) return -1;
  const a = raw.retcode;
  const b = raw.ec;
  if (typeof a === 'number') return a;
  if (typeof a === 'string' && a.trim() !== '') return Number.parseInt(a, 10);
  if (typeof b === 'number') return b;
  if (typeof b === 'string' && b.trim() !== '') return Number.parseInt(b, 10);
  return -1;
}

async function guanjiaPostJson(
  session: GuanjiaSession,
  url: string,
  body: Record<string, unknown>,
  extraHeaders: Record<string, string> = {},
): Promise<Record<string, unknown> | null> {
  const u = new URL(url);
  u.searchParams.set('bkn', session.bkn);
  const res = await fetch(u.toString(), {
    method: 'POST',
    headers: { ...guanjiaHeaders(session), ...extraHeaders },
    body: JSON.stringify(body),
    redirect: 'follow',
  });
  const text = await res.text();
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    logWarn(null, '响应非 JSON', text.slice(0, 200));
    return null;
  }
}

function randomQuestion(len = 8): string {
  let out = '';
  for (let i = 0; i < len; i++) {
    out += QNA_CHARSET[Math.floor(Math.random() * QNA_CHARSET.length)];
  }
  return out;
}

function tokenFile(groupId: string | number): string {
  return `${TOKEN_FILE_PREFIX}${groupId}.json`;
}

export function readGuanjiaToken(readB: MkReadB, groupId: string | number): string {
  const t = readB(tokenFile(groupId), 'token', '');
  return typeof t === 'string' ? t.trim() : String(t ?? '').trim();
}

export function writeGuanjiaToken(writeB: MkWriteB, groupId: string | number, token: string): void {
  writeB(tokenFile(groupId), 'token', token);
  writeB(tokenFile(groupId), 'updatedAt', Math.floor(Date.now() / 1000));
}

function notifyGuanjiaTokenWaiters(groupId: string | number, token: string): void {
  const key = groupKey(groupId);
  const list = tokenWaiters.get(key);
  if (!list?.length) return;
  tokenWaiters.delete(key);
  for (const w of list) {
    clearTimeout(w.timer);
    w.resolve(token);
  }
}

/** 等待本群管家 autoreply JSON 写入 token（已有则立即返回） */
export function waitForGuanjiaToken(
  readB: MkReadB,
  groupId: string | number,
  timeoutMs = TOKEN_WAIT_DEFAULT_MS,
): Promise<string> {
  const existing = readGuanjiaToken(readB, groupId);
  if (existing) return Promise.resolve(existing);

  const key = groupKey(groupId);
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      const list = tokenWaiters.get(key) ?? [];
      tokenWaiters.set(
        key,
        list.filter((w) => w.resolve !== resolve),
      );
      reject(new Error('等待管家 token 超时'));
    }, timeoutMs);

    const waiter: TokenWaiter = {
      resolve: (token) => {
        clearTimeout(timer);
        resolve(token);
      },
      reject: (err) => {
        clearTimeout(timer);
        reject(err);
      },
      timer,
    };

    if (!tokenWaiters.has(key)) tokenWaiters.set(key, []);
    tokenWaiters.get(key)!.push(waiter);
  });
}

function extractGuanjiaTokenFromEvent(event: MkMessageEvent): string | null {
  if (event.message_type !== 'group' || !event.group_id) return null;
  if (Number(event.user_id) !== GUANJIA_BOT_UIN) return null;

  const segs = Array.isArray(event.message) ? event.message : [];
  for (const seg of segs) {
    const s = seg as { type?: string; data?: { data?: unknown } };
    if (s.type !== 'json') continue;
    let payload: Record<string, unknown> | null = null;
    const raw = s.data?.data;
    if (typeof raw === 'string') {
      try {
        payload = JSON.parse(raw) as Record<string, unknown>;
      } catch {
        continue;
      }
    } else if (raw && typeof raw === 'object') {
      payload = raw as Record<string, unknown>;
    }
    if (!payload || payload.app !== 'com.tencent.autoreply') continue;

    const meta = payload.meta as { metadata?: { token?: string } } | undefined;
    const token = meta?.metadata?.token;
    if (token && typeof token === 'string' && token.trim()) {
      return token.trim();
    }
  }
  return null;
}

/** 从 Q群管家 JSON 消息采集 token（2854196310 · com.tencent.autoreply） */
export function captureGuanjiaTokenFromMessage(
  event: MkMessageEvent,
  readB: MkReadB,
  writeB: MkWriteB,
): boolean {
  const token = extractGuanjiaTokenFromEvent(event);
  if (!token || !event.group_id) return false;

  writeGuanjiaToken(writeB, event.group_id, token);
  notifyGuanjiaTokenWaiters(event.group_id, token);
  return true;
}

async function setQnaItem(
  session: GuanjiaSession,
  groupId: string | number,
  slot: number,
  question: string,
  answer: string,
): Promise<Record<string, unknown> | null> {
  return guanjiaPostJson(session, SET_QNA_URL, {
    bkn: session.bkn,
    group_id: Number(groupId),
    qna_item: {
      slot,
      question,
      answer,
      keyword: question ? [question] : [],
    },
  });
}

async function setQnaWithRetry(
  session: GuanjiaSession,
  groupId: string | number,
  question: string,
  answer: string,
): Promise<{ ok: boolean; code: number; raw: Record<string, unknown> | null }> {
  let raw = await setQnaItem(session, groupId, 0, question, answer);
  let code = toRetcode(raw);
  if (code === 100420) {
    await setQnaItem(session, groupId, 1, '', '');
    raw = await setQnaItem(session, groupId, 0, question, answer);
    code = toRetcode(raw);
  }
  return { ok: isOkRetcode(code), code, raw };
}

async function getQnaList(session: GuanjiaSession, groupId: string | number): Promise<unknown[] | null> {
  const raw = await guanjiaPostJson(session, GET_QNA_URL, {
    bkn: session.bkn,
    group_id: Number(groupId),
  });
  if (!raw) return null;
  const data = raw.data as { qna_list?: unknown[] } | undefined;
  return Array.isArray(data?.qna_list) ? data.qna_list : null;
}

async function clearQnaByQuestion(
  session: GuanjiaSession,
  groupId: string | number,
  question: string,
): Promise<void> {
  let clearSlot = 0;
  const list = await getQnaList(session, groupId);
  if (list) {
    for (let i = 0; i < list.length; i++) {
      const item = list[i] as { question?: string };
      if (item?.question === question) {
        clearSlot = i + 1;
        break;
      }
    }
  }
  for (let i = 0; i < 5; i++) {
    const slot = clearSlot > 0 ? clearSlot : i;
    const clr = await setQnaItem(session, groupId, slot, '', '');
    if (isOkRetcode(toRetcode(clr))) break;
  }
}

async function triggerGetAnswer(
  session: GuanjiaSession,
  question: string,
  token: string,
): Promise<number> {
  const raw = await guanjiaPostJson(
    session,
    GET_ANSWER_URL,
    {
      anonymous: 1,
      question,
      token,
    },
    { Referer: 'https://web.qun.qq.com/' },
  );
  return toRetcode(raw);
}

function isOkRetcode(code: number): boolean {
  return code === 0 || code === 200;
}

/**
 * 无 token 时主动采集：写临时 Q&A → @管家 → 等 autoreply JSON
 */
export async function ensureGuanjiaToken(
  ctx: MkPluginContext,
  readB: MkReadB,
  writeB: MkWriteB,
  groupId: string | number,
  onNeedTrigger?: () => Promise<void>,
): Promise<string | null> {
  const cached = readGuanjiaToken(readB, groupId);
  if (cached) return cached;

  const session = await ensureGuanjiaSession(ctx);
  if (!session) return null;

  const probeQuestion = randomQuestion(8);
  logInfo(ctx, `群 ${groupId} 无 token，写入临时 Q&A 并 @管家（问:${probeQuestion}）`);

  const tokenWait = waitForGuanjiaToken(readB, groupId, TOKEN_WAIT_DEFAULT_MS);
  const setProbe = await setQnaWithRetry(session, groupId, probeQuestion, TOKEN_PROBE_ANSWER);
  if (!setProbe.ok) {
    logWarn(ctx, `临时 Q&A 写入失败 retcode=${setProbe.code}`);
    await clearQnaByQuestion(session, groupId, probeQuestion);
    return readGuanjiaToken(readB, groupId) || null;
  }

  try {
    for (let i = 0; i < 5; i++) {
      const mid = readGuanjiaToken(readB, groupId);
      if (mid) return mid;

      if (onNeedTrigger) {
        try {
          await onNeedTrigger();
        } catch (e) {
          logWarn(ctx, '采 token @管家 失败', e);
        }
      }
      await sleep(1200);
    }

    return await tokenWait;
  } catch (e) {
    logWarn(ctx, '等待管家 token 失败', e);
    return readGuanjiaToken(readB, groupId) || null;
  } finally {
    await clearQnaByQuestion(session, groupId, probeQuestion);
  }
}

/**
 * 借 Q群管家 Web API 在群内代发文本
 */
export async function guanjiaTestSend(
  ctx: MkPluginContext,
  readB: MkReadB,
  writeB: MkWriteB,
  options: GuanjiaSendOptions,
): Promise<GuanjiaSendResult> {
  const text = String(options.text ?? '').trim();
  if (!text) {
    return { ok: false, error: '发送内容为空' };
  }

  const groupId = options.groupId;
  let token = readGuanjiaToken(readB, groupId);
  if (!token) {
    token = (await ensureGuanjiaToken(ctx, readB, writeB, groupId, options.onNeedTrigger)) ?? '';
  }
  if (!token) {
    return {
      ok: false,
      error: '无法获取本群管家 token',
      detail: '已尝试临时 Q&A + @管家，但未收到 autoreply JSON。请确认本群已开启 Q群管家，且机器人为群主/有权限',
    };
  }

  const session = await ensureGuanjiaSession(ctx);
  if (!session) {
    return { ok: false, error: '无法获取登录 Cookie（get_cookies qun.qq.com）' };
  }

  const question = randomQuestion(8);
  const setMain = await setQnaWithRetry(session, groupId, question, text);
  if (!setMain.ok) {
    return {
      ok: false,
      error: `set_qna 失败 retcode=${setMain.code}`,
      detail: JSON.stringify(setMain.raw ?? {}).slice(0, 300),
    };
  }

  let answerOk = false;
  for (let i = 0; i < 5; i++) {
    const ec = await triggerGetAnswer(session, question, token);
    if (isOkRetcode(ec)) {
      answerOk = true;
      break;
    }
    if (options.onNeedTrigger) {
      try {
        await options.onNeedTrigger();
      } catch (e) {
        logWarn(ctx, 'onNeedTrigger 失败', e);
      }
      await sleep(1000);
    } else {
      break;
    }
  }

  if (!answerOk) {
    await clearQnaByQuestion(session, groupId, question);
    return {
      ok: false,
      error: 'get_answer 未成功，管家可能未触发',
      detail: `question=${question}`,
    };
  }

  await clearQnaByQuestion(session, groupId, question);
  return { ok: true, detail: `已通过群管家代发（问:${question}）` };
}

/** 插件停用/卸载：清 token 等待与缓存，避免定时器与 Promise 占用 */
export function cleanupGuanjiaOnPluginStop(): void {
  for (const list of tokenWaiters.values()) {
    for (const w of list) {
      clearTimeout(w.timer);
      try {
        w.reject(new Error('plugin stopped'));
      } catch {
        /* ignore */
      }
    }
  }
  tokenWaiters.clear();
  sessionCache.clear();
}
