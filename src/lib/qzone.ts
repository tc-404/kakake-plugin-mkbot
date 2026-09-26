// ---------------------------------------------------------------------------
// QQ 空间（说说/动态）封装：Cookie 自动拉取、发动态、GetFeeds 列表
// 依赖 NapCat get_cookies("qzone.qq.com") 获取 p_skey，无需扫码登录
// ---------------------------------------------------------------------------

import fs from 'fs';
import path from 'path';
import type { MkPluginContext } from '../types';

const QZONE_BASE = 'https://user.qzone.qq.com';
const QZONE_DOMAIN = 'qzone.qq.com';

const MSGLIST_URL =
  'https://user.qzone.qq.com/proxy/domain/taotao.qq.com/cgi-bin/emotion_cgi_msglist_v6';
const PUBLISH_URL =
  'https://user.qzone.qq.com/proxy/domain/taotao.qzone.qq.com/cgi-bin/emotion_cgi_publish_v6';
const UPLOAD_IMAGE_URL = 'https://up.qzone.qq.com/cgi-bin/upload/cgi_upload_image';
const DOLIKE_URL =
  'https://user.qzone.qq.com/proxy/domain/w.qzone.qq.com/cgi-bin/likes/internal_dolike_app';
const COMMENT_URL =
  'https://user.qzone.qq.com/proxy/domain/taotao.qzone.qq.com/cgi-bin/emotion_cgi_re_feeds';
const REPLY_URL =
  'https://h5.qzone.qq.com/proxy/domain/taotao.qzone.qq.com/cgi-bin/emotion_cgi_re_feeds';

const DEFAULT_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';

// ---------------------------------------------------------------------------
// 类型
// ---------------------------------------------------------------------------

export interface QzoneFeedComment {
  tid: number;
  uin: number;
  nickname: string;
  content: string;
  create_time: number;
  create_time_str?: string;
  parent_tid?: number | null;
}

export interface QzoneFeedItem {
  tid: string;
  uin: number;
  name: string;
  content: string;
  images: string[];
  videos: string[];
  rt_content: string;
  comments: QzoneFeedComment[];
  create_time: number;
  source_name?: string;
}

/** 获取动态列表返回结构（可直接 JSON.stringify） */
export interface QzoneFeedsResult {
  ok: boolean;
  uin: number;
  feeds: QzoneFeedItem[];
  total: number;
  error?: string;
}

/** 发动态参数：纯文本 / 纯图片 / 文本+图片 至少需有一项 */
export interface QzonePublishOptions {
  /** 说说文字，可省略（纯图） */
  text?: string;
  /**
   * 图片列表，支持：
   * - HTTP(S) URL
   * - 本地文件路径
   * - base64://... 或 data:image/...;base64,...
   */
  images?: string[];
}

/** 发动态返回结构（可直接 JSON.stringify） */
export interface QzonePublishResult {
  ok: boolean;
  tid?: string;
  message?: string;
  error?: string;
}

/** 点赞参数 */
export interface QzoneLikeOptions {
  /** 说说 ID（必填） */
  tid: string;
  /** 说说所属 QQ，默认机器人自身 */
  targetUin?: number | string;
}

/** 点赞返回结构（可直接 JSON.stringify） */
export interface QzoneLikeResult {
  ok: boolean;
  message?: string;
  error?: string;
}

/** 评论参数 */
export interface QzoneCommentOptions {
  /** 说说 ID（必填） */
  tid: string;
  /** 评论内容（必填） */
  content: string;
  /** 说说所属 QQ，默认机器人自身 */
  targetUin?: number | string;
}

/** 回复评论参数 */
export interface QzoneReplyCommentOptions {
  tid: string;
  content: string;
  /** 被回复的评论 ID */
  commentId: number | string;
  /** 被回复者 QQ */
  commentUin: number | string;
  targetUin?: number | string;
}

/** 评论/回复返回结构 */
export interface QzoneCommentResult {
  ok: boolean;
  commentId?: string;
  message?: string;
  error?: string;
}

export interface QzoneGetFeedsOptions {
  /** 目标 QQ，默认机器人自身 */
  uin?: number | string;
  /** 起始位置，默认 0 */
  pos?: number;
  /** 条数，默认 20 */
  num?: number;
  /** 每条说说附带评论数，默认 20 */
  replyNum?: number;
}

interface QzoneSession {
  uin: number;
  skey: string;
  pSkey: string;
  cookie: string;
  gtk2: string;
  updatedAt: number;
}

// ---------------------------------------------------------------------------
// 会话缓存
// ---------------------------------------------------------------------------

const sessionCache = new Map<number, QzoneSession>();
const SESSION_TTL_MS = 5 * 60 * 1000;

function logWarn(ctx: MkPluginContext | null | undefined, msg: string, detail?: unknown) {
  try {
    ctx?.logger?.warn?.(`[Qzone] ${msg}`, detail ?? '');
  } catch {
    /* ignore */
  }
}

function computeGtk(key: string, hash = 5381): string {
  for (let i = 0; i < key.length; i++) {
    hash += (hash << 5) + key.charCodeAt(i);
  }
  return String(hash & 0x7fffffff);
}

function parseCookieString(cookie: string): { uin: number; skey: string; pSkey: string } | null {
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
  if (!Number.isFinite(uin) || uin <= 0 || !pSkey) return null;
  return { uin, skey, pSkey };
}

function buildSession(cookie: string): QzoneSession | null {
  const parsed = parseCookieString(cookie);
  if (!parsed) return null;
  return {
    uin: parsed.uin,
    skey: parsed.skey,
    pSkey: parsed.pSkey,
    cookie: cookie.replace(/\s/g, ''),
    gtk2: computeGtk(parsed.pSkey),
    updatedAt: Date.now(),
  };
}

function getSelfUin(ctx: MkPluginContext | null | undefined): number {
  const fromCore = Number(ctx?.core?.selfInfo?.uin ?? 0);
  if (Number.isFinite(fromCore) && fromCore > 0) return fromCore;
  return 0;
}

async function callGetCookies(ctx: MkPluginContext): Promise<string | null> {
  if (!ctx?.actions?.call) return null;
  try {
    const result = (await ctx.actions.call(
      'get_cookies',
      { domain: QZONE_DOMAIN },
      ctx.adapterName,
      ctx.pluginManager?.config,
    )) as { data?: { cookies?: string }; cookies?: string } | null;
    const data = (result as { data?: { cookies?: string } })?.data ?? result;
    const cookies = data?.cookies;
    return typeof cookies === 'string' && cookies.trim() ? cookies.trim() : null;
  } catch (e) {
    logWarn(ctx, 'get_cookies 调用失败', e);
    return null;
  }
}

function toInt(v: unknown): number {
  if (typeof v === 'number' && Number.isFinite(v)) return Math.trunc(v);
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number.parseInt(v, 10);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

function toStr(v: unknown): string {
  if (v == null) return '';
  if (typeof v === 'string') return v;
  return String(v);
}

function parseJsonp(text: string): Record<string, unknown> | null {
  const trimmed = text.trim();
  const jsonpMatch = trimmed.match(/callback\s*\(\s*(\{[\s\S]*\})\s*\)/i);
  let jsonStr = jsonpMatch?.[1];
  if (!jsonStr) {
    const start = trimmed.indexOf('{');
    const end = trimmed.lastIndexOf('}');
    if (start < 0 || end <= start) return null;
    jsonStr = trimmed.slice(start, end + 1);
  }
  jsonStr = jsonStr.replace(/\bundefined\b/g, 'null');
  try {
    return JSON.parse(jsonStr) as Record<string, unknown>;
  } catch {
    const fixed = jsonStr.replace(/([{,]\s*)([a-zA-Z_][a-zA-Z0-9_]*)\s*:/g, '$1"$2":');
    try {
      return JSON.parse(fixed) as Record<string, unknown>;
    } catch {
      return null;
    }
  }
}

function defaultHeaders(session: QzoneSession): Record<string, string> {
  return {
    'User-Agent': DEFAULT_UA,
    Referer: `${QZONE_BASE}/${session.uin}`,
    Origin: QZONE_BASE,
    Cookie: session.cookie,
  };
}

async function qzoneRequest(
  session: QzoneSession,
  method: 'GET' | 'POST',
  url: string,
  params: Record<string, string> = {},
  body: Record<string, string> | null = null,
  extraHeaders: Record<string, string> = {},
): Promise<Record<string, unknown> | null> {
  const u = new URL(url);
  for (const [k, v] of Object.entries(params)) {
    u.searchParams.set(k, v);
  }

  const headers = { ...defaultHeaders(session), ...extraHeaders };
  const init: RequestInit = { method, headers, redirect: 'follow' };

  if (method === 'POST' && body) {
    headers['Content-Type'] = 'application/x-www-form-urlencoded';
    init.body = new URLSearchParams(body).toString();
  }

  const res = await fetch(u.toString(), init);
  const text = await res.text();
  return parseJsonp(text);
}

function isAuthFailed(raw: Record<string, unknown> | null): boolean {
  if (!raw) return true;
  const code = toInt(raw.code);
  return code === -3000 || code === -100 || code === -3;
}

async function validateSession(session: QzoneSession): Promise<boolean> {
  try {
    const raw = await qzoneRequest(session, 'GET', MSGLIST_URL, {
      g_tk: session.gtk2,
      uin: String(session.uin),
      ftype: '0',
      sort: '0',
      pos: '0',
      num: '1',
      replynum: '0',
      callback: '_preloadCallback',
      code_version: '1',
      format: 'json',
      need_comment: '0',
      need_private_comment: '0',
    });
    if (!raw) return false;
    if (isAuthFailed(raw)) return false;
    return toInt(raw.code) === 0 || Array.isArray(raw.msglist);
  } catch {
    return false;
  }
}

/**
 * 确保 QQ 空间会话有效：优先用缓存，失效则通过 NapCat get_cookies 刷新 p_skey
 */
async function ensureQzoneSession(ctx: MkPluginContext): Promise<QzoneSession | null> {
  if (!ctx) return null;

  const selfUin = getSelfUin(ctx);
  const cached = selfUin > 0 ? sessionCache.get(selfUin) : undefined;
  if (cached && Date.now() - cached.updatedAt < SESSION_TTL_MS) {
    if (await validateSession(cached)) return cached;
  } else if (cached && (await validateSession(cached))) {
    cached.updatedAt = Date.now();
    return cached;
  }

  const cookie = await callGetCookies(ctx);
  if (!cookie) {
    logWarn(ctx, '无法从 NapCat 获取 qzone.qq.com Cookie');
    return null;
  }

  const session = buildSession(cookie);
  if (!session) {
    logWarn(ctx, 'Cookie 解析失败，缺少 uin 或 p_skey');
    return null;
  }

  if (!(await validateSession(session))) {
    logWarn(ctx, 'Cookie 校验失败，p_skey 可能已过期');
    return null;
  }

  sessionCache.set(session.uin, session);
  return session;
}

function parseCommentList(msg: Record<string, unknown>): QzoneFeedComment[] {
  const commentList = msg.commentlist;
  if (!Array.isArray(commentList)) return [];

  const comments: QzoneFeedComment[] = [];
  for (const item of commentList) {
    if (!item || typeof item !== 'object') continue;
    const cm = item as Record<string, unknown>;
    const mainTid = toInt(cm.tid);
    comments.push({
      tid: mainTid,
      uin: toInt(cm.uin),
      nickname: toStr(cm.name),
      content: toStr(cm.content),
      create_time: toInt(cm.create_time),
      create_time_str: toStr(cm.createTime2) || undefined,
      parent_tid: null,
    });

    const subs = cm.list_3;
    if (Array.isArray(subs)) {
      for (const subItem of subs) {
        if (!subItem || typeof subItem !== 'object') continue;
        const sub = subItem as Record<string, unknown>;
        comments.push({
          tid: toInt(sub.tid),
          uin: toInt(sub.uin),
          nickname: toStr(sub.name),
          content: toStr(sub.content),
          create_time: toInt(sub.create_time),
          create_time_str: toStr(sub.createTime2) || undefined,
          parent_tid: mainTid,
        });
      }
    }
  }
  return comments;
}

function parseFeeds(msglist: unknown[]): QzoneFeedItem[] {
  const posts: QzoneFeedItem[] = [];
  for (const item of msglist) {
    if (!item || typeof item !== 'object') continue;
    const msg = item as Record<string, unknown>;

    const images: string[] = [];
    if (Array.isArray(msg.pic)) {
      for (const p of msg.pic) {
        if (!p || typeof p !== 'object') continue;
        const pic = p as Record<string, unknown>;
        for (const key of ['url2', 'url3', 'url1', 'smallurl']) {
          const u = toStr(pic[key]);
          if (u) {
            images.push(u);
            break;
          }
        }
      }
    }

    const videos: string[] = [];
    if (Array.isArray(msg.video)) {
      for (const v of msg.video) {
        if (!v || typeof v !== 'object') continue;
        const vid = v as Record<string, unknown>;
        const cover = toStr(vid.url1) || toStr(vid.pic_url);
        if (cover) images.push(cover);
        const videoUrl = toStr(vid.url3);
        if (videoUrl) videos.push(videoUrl);
      }
    }

    let rtContent = '';
    const rt = msg.rt_con;
    if (rt && typeof rt === 'object') {
      rtContent = toStr((rt as Record<string, unknown>).content);
    }

    posts.push({
      tid: toStr(msg.tid),
      uin: toInt(msg.uin),
      name: toStr(msg.name),
      content: toStr(msg.content).trim(),
      images,
      videos,
      rt_content: rtContent,
      comments: parseCommentList(msg),
      create_time: toInt(msg.created_time),
      source_name: toStr(msg.source_name) || undefined,
    });
  }
  return posts;
}

function emptyFeedsResult(error?: string, uin = 0): QzoneFeedsResult {
  return {
    ok: false,
    uin,
    feeds: [],
    total: 0,
    ...(error ? { error } : {}),
  };
}

function emptyPublishResult(error?: string): QzonePublishResult {
  return {
    ok: false,
    ...(error ? { error } : {}),
  };
}

function emptyLikeResult(error?: string): QzoneLikeResult {
  return {
    ok: false,
    ...(error ? { error } : {}),
  };
}

function emptyCommentResult(error?: string): QzoneCommentResult {
  return {
    ok: false,
    ...(error ? { error } : {}),
  };
}

async function loadImageBytes(source: string): Promise<Buffer | null> {
  const raw = String(source || '').trim();
  if (!raw) return null;

  if (/^data:image\/[^;]+;base64,/i.test(raw)) {
    return Buffer.from(raw.replace(/^data:image\/[^;]+;base64,/i, ''), 'base64');
  }
  if (raw.startsWith('base64://')) {
    return Buffer.from(raw.slice('base64://'.length), 'base64');
  }
  if (/^https?:\/\//i.test(raw)) {
    const url = raw.replace(/^https:\/\//i, 'http://');
    const res = await fetch(url, { redirect: 'follow', headers: { 'User-Agent': DEFAULT_UA } });
    if (!res.ok) return null;
    return Buffer.from(await res.arrayBuffer());
  }
  const filePath = path.isAbsolute(raw) ? raw : path.resolve(raw);
  if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
    return fs.readFileSync(filePath);
  }
  return null;
}

function parseUploadResult(raw: Record<string, unknown>): { picBo: string; richVal: string } | null {
  const dataMap = raw.data;
  if (!dataMap || typeof dataMap !== 'object') return null;
  const data = dataMap as Record<string, unknown>;
  const urlStr = toStr(data.url);
  const parts = urlStr.split('&bo=');
  if (parts.length < 2) return null;
  const picBo = parts[1];
  const albumid = toStr(data.albumid);
  const lloc = toStr(data.lloc);
  const sloc = toStr(data.sloc);
  const typ = toInt(data.type);
  const height = toInt(data.height);
  const width = toInt(data.width);
  const richVal = `,${albumid},${lloc},${sloc},${typ},${height},${width},,${height},${width}`;
  return { picBo, richVal };
}

async function uploadQzoneImage(session: QzoneSession, imageData: Buffer): Promise<{ picBo: string; richVal: string } | null> {
  const raw = await qzoneRequest(
    session,
    'POST',
    UPLOAD_IMAGE_URL,
    {},
    {
      filename: 'filename',
      uploadtype: '1',
      albumtype: '7',
      skey: session.skey,
      uin: String(session.uin),
      p_skey: session.pSkey,
      output_type: 'json',
      base64: '1',
      picfile: imageData.toString('base64'),
    },
    {
      Referer: `${QZONE_BASE}/${session.uin}`,
      Origin: QZONE_BASE,
    },
  );
  if (!raw || toInt(raw.ret) !== 0) return null;
  return parseUploadResult(raw);
}

// ---------------------------------------------------------------------------
// 对外封装
// ---------------------------------------------------------------------------

/**
 * 获取 QQ 空间说说列表（GetFeeds / emotion_cgi_msglist_v6）
 * 每次调用拉取一次；未登录时自动 get_cookies 校验；失败返回空壳 JSON 结构
 */
export async function qzoneGetFeeds(
  ctx: MkPluginContext,
  options: QzoneGetFeedsOptions = {},
): Promise<QzoneFeedsResult> {
  const session = await ensureQzoneSession(ctx);
  if (!session) return emptyFeedsResult('QQ空间未登录或 Cookie 无效');

  const targetUin = options.uin != null ? Number.parseInt(String(options.uin), 10) : session.uin;
  if (!Number.isFinite(targetUin) || targetUin <= 0) {
    return emptyFeedsResult('无效的目标 QQ', session.uin);
  }

  const pos = options.pos ?? 0;
  const num = options.num ?? 20;
  const replyNum = options.replyNum ?? 20;

  try {
    const raw = await qzoneRequest(session, 'GET', MSGLIST_URL, {
      g_tk: session.gtk2,
      uin: String(targetUin),
      ftype: '0',
      sort: '0',
      pos: String(pos),
      num: String(num),
      replynum: String(replyNum),
      callback: '_preloadCallback',
      code_version: '1',
      format: 'json',
      need_comment: '1',
      need_private_comment: '1',
    });

    if (!raw || isAuthFailed(raw)) {
      sessionCache.delete(session.uin);
      return emptyFeedsResult('获取动态失败或登录已过期', targetUin);
    }

    const code = toInt(raw.code);
    if (code !== 0 && !Array.isArray(raw.msglist)) {
      return emptyFeedsResult(toStr(raw.message) || `接口返回 code=${code}`, targetUin);
    }

    const msglist = Array.isArray(raw.msglist) ? raw.msglist : [];
    const feeds = parseFeeds(msglist);
    return {
      ok: true,
      uin: targetUin,
      feeds,
      total: feeds.length,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return emptyFeedsResult(msg, targetUin);
  }
}

/**
 * 发布 QQ 空间动态（说说）
 * 支持纯文本 / 纯图片 / 文本+图片；Cookie 通过 NapCat get_cookies 自动获取
 */
export async function qzonePublishDynamic(
  ctx: MkPluginContext,
  options: QzonePublishOptions = {},
): Promise<QzonePublishResult> {
  const text = String(options.text ?? '').trim();
  const imageSources = Array.isArray(options.images) ? options.images.filter(Boolean) : [];

  if (!text && imageSources.length === 0) {
    return emptyPublishResult('内容不能为空，请提供 text 或 images');
  }

  const session = await ensureQzoneSession(ctx);
  if (!session) return emptyPublishResult('QQ空间未登录或 Cookie 无效');

  const form: Record<string, string> = {
    syn_tweet_verson: '1',
    paramstr: '1',
    who: '1',
    con: text,
    feedversion: '1',
    ver: '1',
    ugc_right: '1',
    to_sign: '0',
    hostuin: String(session.uin),
    code_version: '1',
    format: 'json',
    qzreferrer: `${QZONE_BASE}/${session.uin}`,
  };

  if (imageSources.length > 0) {
    const picBos: string[] = [];
    const richVals: string[] = [];
    for (const src of imageSources) {
      try {
        const bytes = await loadImageBytes(src);
        if (!bytes || bytes.length === 0) {
          logWarn(ctx, `图片加载失败: ${src}`);
          continue;
        }
        const uploaded = await uploadQzoneImage(session, bytes);
        if (!uploaded) {
          logWarn(ctx, `图片上传失败: ${src}`);
          continue;
        }
        picBos.push(uploaded.picBo);
        richVals.push(uploaded.richVal);
      } catch (e) {
        logWarn(ctx, `图片处理异常: ${src}`, e);
      }
    }
    if (picBos.length === 0 && !text) {
      return emptyPublishResult('图片均加载或上传失败');
    }
    if (picBos.length > 0) {
      form.pic_bo = picBos.join(',');
      form.richtype = '1';
      form.richval = richVals.join('\t');
    }
  }

  try {
    const raw = await qzoneRequest(
      session,
      'POST',
      PUBLISH_URL,
      {
        g_tk: session.gtk2,
        uin: String(session.uin),
      },
      form,
    );

    if (!raw || isAuthFailed(raw)) {
      sessionCache.delete(session.uin);
      return emptyPublishResult('发布失败或登录已过期');
    }

    const code = toInt(raw.code);
    if (code !== 0) {
      return emptyPublishResult(toStr(raw.message) || `发布失败 code=${code}`);
    }

    const tid = toStr(raw.t1_tid) || toStr(raw.tid);
    return {
      ok: true,
      tid: tid || undefined,
      message: toStr(raw.message) || '发表成功',
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return emptyPublishResult(msg);
  }
}

/**
 * 给 QQ 空间说说点赞
 * tid 必填；targetUin 省略时对机器人自身说说点赞
 */
export async function qzoneLike(
  ctx: MkPluginContext,
  options: QzoneLikeOptions,
): Promise<QzoneLikeResult> {
  const tid = String(options.tid ?? '').trim();
  if (!tid) return emptyLikeResult('tid 不能为空');

  const session = await ensureQzoneSession(ctx);
  if (!session) return emptyLikeResult('QQ空间未登录或 Cookie 无效');

  const targetUin =
    options.targetUin != null
      ? Number.parseInt(String(options.targetUin), 10)
      : session.uin;
  if (!Number.isFinite(targetUin) || targetUin <= 0) {
    return emptyLikeResult('无效的目标 QQ');
  }

  try {
    const abstime = Math.floor(Date.now() / 1000);
    const moodUrl = `${QZONE_BASE}/${targetUin}/mood/${tid}`;
    const raw = await qzoneRequest(
      session,
      'POST',
      DOLIKE_URL,
      { g_tk: session.gtk2 },
      {
        qzreferrer: `${QZONE_BASE}/${session.uin}`,
        opuin: String(session.uin),
        unikey: moodUrl,
        curkey: moodUrl,
        appid: '311',
        from: '1',
        typeid: '0',
        abstime: String(abstime),
        fid: tid,
        active: '0',
        format: 'json',
        fupdate: '1',
      },
    );

    if (!raw || isAuthFailed(raw)) {
      sessionCache.delete(session.uin);
      return emptyLikeResult('点赞失败或登录已过期');
    }

    const code = toInt(raw.code);
    if (code !== 0) {
      return emptyLikeResult(toStr(raw.message) || `点赞失败 code=${code}`);
    }

    return {
      ok: true,
      message: toStr(raw.message) || '点赞成功',
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return emptyLikeResult(msg);
  }
}

/**
 * 评论 QQ 空间说说
 */
export async function qzoneComment(
  ctx: MkPluginContext,
  options: QzoneCommentOptions,
): Promise<QzoneCommentResult> {
  const tid = String(options.tid ?? '').trim();
  const content = String(options.content ?? '').trim();
  if (!tid) return emptyCommentResult('tid 不能为空');
  if (!content) return emptyCommentResult('评论内容不能为空');

  const session = await ensureQzoneSession(ctx);
  if (!session) return emptyCommentResult('QQ空间未登录或 Cookie 无效');

  const targetUin =
    options.targetUin != null
      ? Number.parseInt(String(options.targetUin), 10)
      : session.uin;
  if (!Number.isFinite(targetUin) || targetUin <= 0) {
    return emptyCommentResult('无效的目标 QQ');
  }

  try {
    const raw = await qzoneRequest(
      session,
      'POST',
      COMMENT_URL,
      { g_tk: session.gtk2 },
      {
        topicId: `${targetUin}_${tid}__1`,
        uin: String(session.uin),
        hostUin: String(targetUin),
        feedsType: '100',
        inCharset: 'utf-8',
        outCharset: 'utf-8',
        plat: 'qzone',
        source: 'ic',
        platformid: '52',
        format: 'fs',
        ref: 'feeds',
        content,
      },
    );

    if (!raw || isAuthFailed(raw)) {
      sessionCache.delete(session.uin);
      return emptyCommentResult('评论失败或登录已过期');
    }

    const code = toInt(raw.code);
    if (code !== 0) {
      return emptyCommentResult(toStr(raw.message) || `评论失败 code=${code}`);
    }

    const commentId =
      toStr(raw.commentid) ||
      toStr(raw.commentId) ||
      toStr(raw.tid) ||
      undefined;

    return {
      ok: true,
      commentId,
      message: toStr(raw.message) || '评论成功',
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return emptyCommentResult(msg);
  }
}

/**
 * 回复 QQ 空间说说下的评论（楼中楼）
 */
export async function qzoneReplyComment(
  ctx: MkPluginContext,
  options: QzoneReplyCommentOptions,
): Promise<QzoneCommentResult> {
  const tid = String(options.tid ?? '').trim();
  const content = String(options.content ?? '').trim();
  if (!tid) return emptyCommentResult('tid 不能为空');
  if (!content) return emptyCommentResult('回复内容不能为空');

  const session = await ensureQzoneSession(ctx);
  if (!session) return emptyCommentResult('QQ空间未登录或 Cookie 无效');

  const targetUin =
    options.targetUin != null
      ? Number.parseInt(String(options.targetUin), 10)
      : session.uin;
  if (!Number.isFinite(targetUin) || targetUin <= 0) {
    return emptyCommentResult('无效的目标 QQ');
  }

  const commentId = toInt(options.commentId);
  const commentUin = Number.parseInt(String(options.commentUin), 10);
  if (!commentId || !Number.isFinite(commentUin) || commentUin <= 0) {
    return emptyCommentResult('无效的评论 ID 或评论者 QQ');
  }

  try {
    const raw = await qzoneRequest(
      session,
      'POST',
      REPLY_URL,
      { g_tk: session.gtk2 },
      {
        topicId: `${targetUin}_${tid}__1`,
        uin: String(session.uin),
        hostUin: String(targetUin),
        feedsType: '100',
        inCharset: 'utf-8',
        outCharset: 'utf-8',
        plat: 'qzone',
        source: 'ic',
        platformid: '52',
        format: 'fs',
        ref: 'feeds',
        content,
        commentId: String(commentId),
        commentUin: String(commentUin),
        richval: '',
        richtype: '',
        private: '0',
        paramstr: '2',
        qzreferrer: `${QZONE_BASE}/${session.uin}/main`,
      },
      {
        'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
        Referer: `${QZONE_BASE}/`,
        Origin: QZONE_BASE,
      },
    );

    if (!raw || isAuthFailed(raw)) {
      sessionCache.delete(session.uin);
      return emptyCommentResult('回复失败或登录已过期');
    }

    const code = toInt(raw.code);
    if (code !== 0) {
      return emptyCommentResult(toStr(raw.message) || `回复失败 code=${code}`);
    }

    return {
      ok: true,
      commentId: toStr(raw.commentid) || toStr(raw.commentId) || undefined,
      message: toStr(raw.message) || '回复成功',
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return emptyCommentResult(msg);
  }
}
