// ---------------------------------------------------------------------------
// 入群私聊：forward 解析收录 + 查看记录回放 + 入群事件正式发送
// ---------------------------------------------------------------------------

import fs from 'fs';
import path from 'path';
import { pathToFileURL } from 'url';
import type {
  JoinGroupPmDeps,
  MkMessageEvent,
  MkPluginContext,
} from '../types';
import { 发消息, 发合并消息, 段_文本, 段_图片, 段_视频, 构建合并转发预览, attachForwardPreviewToParams, 合并预览 } from '../BOT';
import { mkAppendInlineForwardToContent, mkIsSnowLumaBackend } from '../lib/snowluma-compat';

const JOIN_PM_STORAGE_REL = '筱筱吖/扩展功能/入群私聊/分群';
export const JOIN_PM_PROBABILITY_FILE = '筱筱吖/扩展功能/入群私聊/概率.json';
const MAX_FORWARD_DEPTH = 3;

type MkReadBFn = (filename: string, key: string, defaultValue: unknown) => unknown;

/** 读取群入群私聊触发概率（小数，如 0.01 = 1%）；未配置时默认 1（100%） */
export function getJoinPmProbability(readB: MkReadBFn, groupId: string): number {
  const raw = readB(JOIN_PM_PROBABILITY_FILE, String(groupId), 1);
  const prob = Number(raw);
  if (!Number.isFinite(prob) || prob < 0) return 1;
  return Math.min(prob, 1);
}

/**
 * 按概率判断是否触发入群私聊。
 * 100%（prob >= 1）恒触发；0% 恒不触发；其余用 Math.random() <= prob。
 */
export function shouldTriggerJoinGroupPm(readB: MkReadBFn, groupId: string): boolean {
  const prob = getJoinPmProbability(readB, groupId);
  if (prob >= 1) return true;
  if (prob <= 0) return false;
  return Math.random() <= prob;
}

type JoinPmSegmentKind = 'text' | 'json' | 'xml' | 'image' | 'video' | 'file' | 'forward';

export interface JoinPmSegment {
  kind: JoinPmSegmentKind;
  内容?: string;
  文件?: string;
  名称?: string;
  节点?: JoinPmForwardNode[];
}

export interface JoinPmForwardNode {
  name: string;
  uin: string;
  time?: number;
  segments: JoinPmSegment[];
}

export interface JoinPmRecordEntry {
  类型: string;
  内容?: string;
  图片?: string[];
  文件?: string;
  名称?: string;
  节点?: JoinPmForwardNode[];
}

function joinPmStorageDir(groupId: string): string {
  return `${JOIN_PM_STORAGE_REL}/${groupId}`;
}

function joinPmMediaRel(fileName: string): string {
  return `${JOIN_PM_STORAGE_REL}/${fileName}`;
}

function joinPmRecordPath(groupId: string): string {
  return `${joinPmStorageDir(groupId)}.json`;
}

function resolveLocalMediaPath(deps: JoinGroupPmDeps, fileRef: string): string {
  if (path.isAbsolute(fileRef)) return fileRef;
  return path.join(deps.getDataPath(), JOIN_PM_STORAGE_REL, fileRef);
}

/** NapCat 发送本地图片/视频/文件时优先 file:/// URI */
function toNapCatFileRef(deps: JoinGroupPmDeps, fileRef: string): string {
  const abs = resolveLocalMediaPath(deps, fileRef);
  if (fs.existsSync(abs)) {
    return pathToFileURL(abs).href;
  }
  deps.logger?.warn?.('[入群私聊] 本地文件不存在，仍尝试发送:', abs);
  return pathToFileURL(abs).href;
}

/** 纯 CQ 发图，避免仅 image 段数组在私聊 send_msg 中发不出去 */
function buildJoinPmImageSegments(deps: JoinGroupPmDeps, fileNames: string[]) {
  return fileNames.map((name) => 段_图片(toNapCatFileRef(deps, name)));
}

export interface JoinGroupPmReplayOptions {
  /** 群来源临时会话：新人入群私聊时需带上群号 */
  groupId?: string | number;
}

function joinPmPrivateSendBase(
  event: MkMessageEvent,
  options?: JoinGroupPmReplayOptions
): { message_type: 'private'; user_id: string; group_id?: string } {
  const base: { message_type: 'private'; user_id: string; group_id?: string } = {
    message_type: 'private',
    user_id: String(event.user_id),
  };
  if (options?.groupId != null && String(options.groupId).trim() !== '') {
    base.group_id = String(options.groupId);
  }
  return base;
}

function joinPmReplyExtra(options?: JoinGroupPmReplayOptions): Record<string, unknown> {
  if (options?.groupId != null && String(options.groupId).trim() !== '') {
    return { group_id: String(options.groupId) };
  }
  return {};
}

async function sendJoinPmImageReply(
  event: MkMessageEvent,
  ctx: MkPluginContext,
  fileNames: string[],
  deps: JoinGroupPmDeps,
  textPrefix = '',
  options?: JoinGroupPmReplayOptions
): Promise<void> {
  if (!fileNames.length) return;
  const segments = [];
  if (textPrefix) segments.push(段_文本(textPrefix));
  segments.push(...buildJoinPmImageSegments(deps, fileNames));
  await 发消息(event, segments, joinPmReplyExtra(options));
}

function ensureJoinPmStorageDir(deps: JoinGroupPmDeps): void {
  const dir = path.join(deps.getDataPath(), JOIN_PM_STORAGE_REL);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function isHttpUrl(v: unknown): v is string {
  return typeof v === 'string' && /^https?:\/\//i.test(v);
}

function extFromName(name?: string, fallback = ''): string {
  if (!name) return fallback;
  const ext = path.extname(name);
  return ext || fallback;
}

function extFromUrl(url: string, fallback = ''): string {
  try {
    const u = new URL(url);
    return extFromName(path.basename(u.pathname), fallback);
  } catch {
    return fallback;
  }
}

function defaultExtFor(kind: 'image' | 'video' | 'file', fileName?: string): string {
  const fromName = extFromName(fileName);
  if (fromName) return fromName;
  if (kind === 'image') return '.png';
  if (kind === 'video') return '.mp4';
  return '.bin';
}

function normalizeForwardMessages(result: unknown): unknown[] {
  if (!result || typeof result !== 'object') return [];
  const r = result as Record<string, unknown>;
  const data = r.data;
  if (data && typeof data === 'object' && !Array.isArray(data)) {
    const messages = (data as Record<string, unknown>).messages;
    if (Array.isArray(messages)) return messages;
  }
  if (Array.isArray(r.messages)) return r.messages;
  if (Array.isArray(data)) return data;
  return [];
}

function normalizeNodeContent(raw: unknown): Array<Record<string, unknown>> {
  if (Array.isArray(raw)) return raw as Array<Record<string, unknown>>;
  if (typeof raw === 'string' && raw.trim()) {
    return [{ type: 'text', data: { text: raw } }];
  }
  return [];
}

async function resolveDownloadUrl(
  ctx: MkPluginContext,
  seg: Record<string, unknown>,
  deps: JoinGroupPmDeps
): Promise<string | null> {
  const data = (seg.data as Record<string, unknown> | undefined) ?? {};
  const url = data.url ?? (isHttpUrl(data.file) ? data.file : null);
  if (isHttpUrl(url)) return url;

  const fileId = data.file_id ?? data.fileId;
  if (fileId && typeof fileId === 'string') {
    for (const action of ['get_private_file_url', 'get_group_file_url'] as const) {
      try {
        const r = await deps.botApi(ctx, action, { file_id: fileId });
        const got = (r as Record<string, unknown>)?.data ?? r;
        const u = (got as Record<string, unknown>)?.url;
        if (isHttpUrl(u)) return u;
      } catch {
        // try next
      }
    }
  }
  return null;
}

async function persistLocalCopy(
  srcPath: string,
  fileName: string,
  deps: JoinGroupPmDeps
): Promise<string | null> {
  if (!fs.existsSync(srcPath)) return null;
  ensureJoinPmStorageDir(deps);
  const destAbs = resolveLocalMediaPath(deps, fileName);
  fs.copyFileSync(srcPath, destAbs);
  return fileName;
}

async function saveJoinPmMedia(
  ctx: MkPluginContext,
  seg: Record<string, unknown>,
  kind: 'image' | 'video' | 'file',
  deps: JoinGroupPmDeps
): Promise<string | null> {
  const data = (seg.data as Record<string, unknown> | undefined) ?? {};
  const originalName = String(data.file_name ?? data.name ?? data.filename ?? '');

  const url = await resolveDownloadUrl(ctx, seg, deps);
  const ext = extFromUrl(url ?? '', defaultExtFor(kind, originalName)) || defaultExtFor(kind, originalName);
  const savedName = `${deps.rand(10_000_000, 999_999_999)}${ext}`;
  const saveRel = joinPmMediaRel(savedName);

  if (url) {
    ensureJoinPmStorageDir(deps);
    const ok = await deps.downloadFile(url, saveRel);
    return ok === false ? null : savedName;
  }

  const fileRef = data.file;
  if (typeof fileRef === 'string' && fileRef.trim()) {
    const local = path.isAbsolute(fileRef) ? fileRef : path.join(deps.getDataPath(), fileRef);
    if (fs.existsSync(local)) {
      return persistLocalCopy(local, savedName, deps);
    }
  }

  return null;
}

async function parseJoinPmContentSegments(
  ctx: MkPluginContext,
  segments: Array<Record<string, unknown>>,
  groupId: string,
  depth: number,
  deps: JoinGroupPmDeps
): Promise<JoinPmSegment[]> {
  const out: JoinPmSegment[] = [];

  for (const seg of segments) {
    const type = String(seg.type ?? '');
    const data = (seg.data as Record<string, unknown> | undefined) ?? {};

    switch (type) {
      case 'text': {
        const text = String(data.text ?? '');
        if (text) out.push({ kind: 'text', 内容: text });
        break;
      }
      case 'json': {
        const raw = data.data ?? data;
        const jsonStr = typeof raw === 'string' ? raw : JSON.stringify(raw);
        if (jsonStr) out.push({ kind: 'json', 内容: jsonStr });
        break;
      }
      case 'xml': {
        const xml = String(data.data ?? data.xml ?? '');
        if (xml) out.push({ kind: 'xml', 内容: xml });
        break;
      }
      case 'image': {
        const saved = await saveJoinPmMedia(ctx, seg, 'image', deps);
        if (saved) out.push({ kind: 'image', 文件: saved });
        break;
      }
      case 'video': {
        const saved = await saveJoinPmMedia(ctx, seg, 'video', deps);
        if (saved) out.push({ kind: 'video', 文件: saved });
        break;
      }
      case 'file':
      case 'offlinefile': {
        const saved = await saveJoinPmMedia(ctx, seg, 'file', deps);
        if (saved) {
          out.push({
            kind: 'file',
            文件: saved,
            名称: String(data.file_name ?? data.name ?? data.filename ?? saved),
          });
        }
        break;
      }
      case 'forward': {
        if (depth >= MAX_FORWARD_DEPTH) break;
        const nestedId = data.id;
        const nestedContent = data.content;
        let nestedNodes: JoinPmForwardNode[] = [];
        if (Array.isArray(nestedContent) && nestedContent.length) {
          nestedNodes = await parseJoinPmForwardMessageList(ctx, nestedContent, groupId, depth + 1, deps);
        } else if (nestedId != null && String(nestedId).trim()) {
          nestedNodes = await fetchJoinPmForwardNodes(ctx, String(nestedId), groupId, depth + 1, deps);
        }
        if (nestedNodes.length) out.push({ kind: 'forward', 节点: nestedNodes });
        break;
      }
      case 'node': {
        if (depth >= MAX_FORWARD_DEPTH) break;
        const nested = await parseJoinPmForwardMessageList(ctx, [seg], groupId, depth + 1, deps);
        if (nested.length === 1) {
          out.push({ kind: 'forward', 节点: nested });
        } else if (nested.length > 1) {
          out.push({ kind: 'forward', 节点: nested });
        }
        break;
      }
      case 'at': {
        const qq = data.qq;
        if (qq != null) out.push({ kind: 'text', 内容: `@${qq} ` });
        break;
      }
      case 'reply':
        break;
      case 'face':
      case 'mface': {
        const summary = String(data.summary ?? data.key ?? '');
        if (summary) out.push({ kind: 'text', 内容: summary });
        break;
      }
      default:
        break;
    }
  }

  return out;
}

async function parseJoinPmForwardMessageList(
  ctx: MkPluginContext,
  messages: unknown[],
  groupId: string,
  depth: number,
  deps: JoinGroupPmDeps
): Promise<JoinPmForwardNode[]> {
  const nodes: JoinPmForwardNode[] = [];

  for (const raw of messages) {
    if (!raw || typeof raw !== 'object') continue;
    const msg = raw as Record<string, unknown>;

    if (msg.type === 'node') {
      const d = (msg.data as Record<string, unknown> | undefined) ?? {};
      const name = String(d.name ?? d.nickname ?? '用户');
      const uin = String(d.uin ?? d.user_id ?? '');
      const timeRaw = d.time;
      const time = timeRaw != null && String(timeRaw).trim() !== '' ? Number(timeRaw) : undefined;
      const contentSegs = normalizeNodeContent(d.content ?? d.message);
      const segments = await parseJoinPmContentSegments(ctx, contentSegs, groupId, depth, deps);
      if (!segments.length) continue;
      nodes.push({
        name,
        uin,
        ...(Number.isFinite(time) ? { time: time as number } : {}),
        segments,
      });
      continue;
    }

    // NapCat / OB11 平铺消息：{ message, sender, user_id, time }
    const contentSegs = normalizeNodeContent(msg.message ?? msg.content);
    if (!contentSegs.length) continue;

    const sender = (msg.sender as Record<string, unknown> | undefined) ?? {};
    const name = String(sender.nickname ?? sender.card ?? msg.nickname ?? '用户');
    const uin = String(msg.user_id ?? sender.user_id ?? sender.uin ?? '');
    const timeRaw = msg.time;
    const time = timeRaw != null && String(timeRaw).trim() !== '' ? Number(timeRaw) : undefined;
    const segments = await parseJoinPmContentSegments(ctx, contentSegs, groupId, depth, deps);
    if (!segments.length) continue;
    nodes.push({
      name,
      uin,
      ...(Number.isFinite(time) ? { time: time as number } : {}),
      segments,
    });
  }

  return nodes;
}

async function fetchJoinPmForwardNodes(
  ctx: MkPluginContext,
  forwardId: string,
  groupId: string,
  depth: number,
  deps: JoinGroupPmDeps
): Promise<JoinPmForwardNode[]> {
  if (depth > MAX_FORWARD_DEPTH || !forwardId.trim()) return [];
  try {
    const result = await deps.botApi(ctx, 'get_forward_msg', { id: String(forwardId) });
    const messages = normalizeForwardMessages(result);
    return parseJoinPmForwardMessageList(ctx, messages, groupId, depth, deps);
  } catch (err) {
    deps.logger?.error?.('[入群私聊] get_forward_msg 失败:', err);
    return [];
  }
}

export async function recordJoinPmForwardEntry(
  ctx: MkPluginContext,
  forwardSeg: Record<string, unknown>,
  groupId: string,
  deps: JoinGroupPmDeps
): Promise<JoinPmRecordEntry | null> {
  const data = (forwardSeg.data as Record<string, unknown> | undefined) ?? {};
  let nodes: JoinPmForwardNode[] = [];

  if (Array.isArray(data.content) && data.content.length) {
    nodes = await parseJoinPmForwardMessageList(ctx, data.content as unknown[], groupId, 0, deps);
  } else if (data.id != null && String(data.id).trim()) {
    nodes = await fetchJoinPmForwardNodes(ctx, String(data.id), groupId, 0, deps);
  }

  if (!nodes.length) return null;
  return { 类型: 'forward', 节点: nodes };
}

/** 将 parseJoinPmContentSegments 结果转为存储条目（保持段顺序） */
function segmentsToRecordEntries(segments: JoinPmSegment[]): JoinPmRecordEntry[] {
  const items: JoinPmRecordEntry[] = [];
  let textBuf = '';
  let images: string[] = [];

  const flushTextImages = () => {
    if (textBuf && images.length) {
      items.push({ 类型: 'text+image', 内容: textBuf, 图片: [...images] });
    } else if (textBuf) {
      items.push({ 类型: 'text', 内容: textBuf });
    } else if (images.length) {
      items.push({ 类型: 'image', 图片: [...images] });
    }
    textBuf = '';
    images = [];
  };

  for (const seg of segments) {
    switch (seg.kind) {
      case 'text':
        textBuf += seg.内容 ?? '';
        break;
      case 'image':
        if (seg.文件) images.push(seg.文件);
        break;
      case 'video':
        if (seg.文件) {
          if (textBuf && images.length) {
            items.push({ 类型: 'text+image', 内容: textBuf, 图片: [...images] });
            textBuf = '';
            images = [];
          } else if (images.length) {
            items.push({ 类型: 'image', 图片: [...images] });
            images = [];
          }
          if (textBuf) {
            items.push({ 类型: 'text+video', 内容: textBuf, 文件: seg.文件 });
            textBuf = '';
          } else {
            items.push({ 类型: 'video', 文件: seg.文件 });
          }
        }
        break;
      case 'file':
        if (seg.文件) {
          if (textBuf && images.length) {
            items.push({ 类型: 'text+image', 内容: textBuf, 图片: [...images] });
            textBuf = '';
            images = [];
          } else if (images.length) {
            items.push({ 类型: 'image', 图片: [...images] });
            images = [];
          }
          if (textBuf) {
            items.push({
              类型: 'text+file',
              内容: textBuf,
              文件: seg.文件,
              名称: seg.名称,
            });
            textBuf = '';
          } else {
            items.push({ 类型: 'file', 文件: seg.文件, 名称: seg.名称 });
          }
        }
        break;
      case 'json':
        flushTextImages();
        if (seg.内容) items.push({ 类型: 'json', 内容: seg.内容 });
        break;
      case 'forward':
        flushTextImages();
        if (seg.节点?.length) items.push({ 类型: 'forward', 节点: seg.节点 });
        break;
      case 'xml':
        flushTextImages();
        if (seg.内容) items.push({ 类型: 'text', 内容: seg.内容 });
        break;
      default:
        break;
    }
  }

  flushTextImages();
  return items;
}

/** 收录一条私聊消息（文本 / 图片 / 视频 / 文件 / JSON / 合并转发） */
export async function recordJoinGroupPmMessage(
  event: MkMessageEvent,
  ctx: MkPluginContext,
  groupId: string,
  deps: JoinGroupPmDeps
): Promise<boolean> {
  const segs = Array.isArray(event.message) ? (event.message as Array<Record<string, unknown>>) : [];
  if (!segs.length) return false;

  const parsed = await parseJoinPmContentSegments(ctx, segs, groupId, 0, deps);
  const items = segmentsToRecordEntries(parsed);

  if (!items.length) return false;

  const filePath = joinPmRecordPath(groupId);
  const list = JSON.parse(String(deps.readA(filePath) || '[]')) as JoinPmRecordEntry[];
  list.push(...items);
  deps.writeA(filePath, JSON.stringify(list, null, 4));
  return true;
}

function buildOb11ContentFromSegments(
  segments: JoinPmSegment[],
  deps: JoinGroupPmDeps,
  depth: number
): Array<Record<string, unknown>> {
  const content: Array<Record<string, unknown>> = [];

  for (const seg of segments) {
    switch (seg.kind) {
      case 'text':
        if (seg.内容) content.push({ type: 'text', data: { text: seg.内容 } });
        break;
      case 'json':
        if (seg.内容) content.push({ type: 'json', data: { data: seg.内容 } });
        break;
      case 'xml':
        if (seg.内容) content.push({ type: 'xml', data: { data: seg.内容 } });
        break;
      case 'image':
        if (seg.文件) {
          content.push({
            type: 'image',
            data: { file: toNapCatFileRef(deps, seg.文件) },
          });
        }
        break;
      case 'video':
        if (seg.文件) {
          content.push({
            type: 'video',
            data: { file: toNapCatFileRef(deps, seg.文件) },
          });
        }
        break;
      case 'file':
        if (seg.文件) {
          content.push({
            type: 'file',
            data: {
              file: toNapCatFileRef(deps, seg.文件),
              name: seg.名称 ?? seg.文件,
            },
          });
        }
        break;
      case 'forward': {
        if (depth >= MAX_FORWARD_DEPTH || !seg.节点?.length) break;
        const childNodes = [];
        for (const child of seg.节点) {
          childNodes.push({
            type: 'node',
            data: {
              name: child.name,
              uin: child.uin,
              ...(child.time != null ? { time: child.time } : {}),
              content: buildOb11ContentFromSegments(child.segments, deps, depth + 1),
            },
          });
        }
        if (mkIsSnowLumaBackend()) {
          const merged = mkAppendInlineForwardToContent(
            [...content],
            childNodes,
            seg.节点[0]?.uin ?? '0',
            seg.节点[0]?.name,
          );
          content.length = 0;
          content.push(...merged);
        } else {
          content.push({ type: 'forward', data: { id: '0' } });
          content.push(...childNodes);
        }
        break;
      }
      default:
        break;
    }
  }

  return content.length ? content : [{ type: 'text', data: { text: '' } }];
}

async function sendJoinPmVideoReply(
  event: MkMessageEvent,
  fileRef: string,
  deps: JoinGroupPmDeps,
  textPrefix = '',
  options?: JoinGroupPmReplayOptions
): Promise<void> {
  const extra = joinPmReplyExtra(options);
  const file = toNapCatFileRef(deps, fileRef);
  if (textPrefix) {
    await 发消息(event, [段_文本(textPrefix), 段_视频(file)], extra);
  } else {
    await 发消息(event, [段_视频(file)], extra);
  }
}

async function sendJoinPmFileReply(
  event: MkMessageEvent,
  ctx: MkPluginContext,
  fileRef: string,
  deps: JoinGroupPmDeps,
  fileName?: string,
  textPrefix = '',
  options?: JoinGroupPmReplayOptions
): Promise<void> {
  if (!ctx.actions || !ctx.pluginManager) return;
  const segments: Array<Record<string, unknown>> = [];
  if (textPrefix) segments.push({ type: 'text', data: { text: textPrefix } });
  segments.push({
    type: 'file',
    data: {
      file: toNapCatFileRef(deps, fileRef),
      name: fileName ?? fileRef,
    },
  });
  await ctx.actions.call(
    'send_msg',
    {
      ...joinPmPrivateSendBase(event, options),
      message: segments,
    },
    ctx.adapterName,
    ctx.pluginManager.config
  );
}

async function replayJoinPmParsedForward(
  event: MkMessageEvent,
  ctx: MkPluginContext,
  nodes: JoinPmForwardNode[],
  deps: JoinGroupPmDeps,
  options?: JoinGroupPmReplayOptions
): Promise<void> {
  const ob11Nodes = nodes.map((node) => ({
    type: 'node',
    data: {
      name: node.name,
      uin: node.uin,
      ...(node.time != null ? { time: node.time } : {}),
      content: buildOb11ContentFromSegments(node.segments, deps, 0),
    },
  }));

  const logicalNodes = nodes.map((node) => ({
    name: node.name,
    qq: node.uin,
    time: node.time,
    content: buildOb11ContentFromSegments(node.segments, deps, 0),
  }));

  const params = {
    ...joinPmPrivateSendBase(event, options),
    message: ob11Nodes,
    messages: ob11Nodes,
  };
  attachForwardPreviewToParams(
    params,
    构建合并转发预览(
      logicalNodes,
      event,
      合并预览(
        '入群私聊收录',
        `共 ${nodes.length} 条入群欢迎/私聊记录`,
        '[聊天记录]',
        [],
      ),
    ),
  );

  try {
    await deps.botApi(ctx, 'send_private_forward_msg', params);
  } catch {
    await deps.botApi(ctx, 'send_forward_msg', params);
  }
}

/** 回放单条收录（查看记录内容 / 新人入群私聊） */
export async function replayJoinGroupPmEntry(
  event: MkMessageEvent,
  ctx: MkPluginContext,
  entry: JoinPmRecordEntry,
  deps: JoinGroupPmDeps,
  options?: JoinGroupPmReplayOptions
): Promise<void> {
  const 类型 = entry.类型;
  const 内容 = entry.内容 ?? '';
  const replyExtra = joinPmReplyExtra(options);

  switch (类型) {
    case 'json':
      if (!ctx.actions || !ctx.pluginManager) return;
      await ctx.actions.call(
        'send_msg',
        {
          ...joinPmPrivateSendBase(event, options),
          message: [{ type: 'json', data: { data: 内容 } }],
        },
        ctx.adapterName,
        ctx.pluginManager.config
      );
      break;

    case 'forward': {
      const nodes = entry.节点;
      if (Array.isArray(nodes) && nodes.length) {
        await replayJoinPmParsedForward(event, ctx, nodes, deps, options);
      } else if (内容) {
        await 发合并消息(
          event,
          [{ id: String(内容), name: '入群记录' }],
          合并预览('入群私聊历史', '查看已收录的合并转发记录', '[聊天记录]', ['入群记录: [聊天记录]']),
        );
      }
      break;
    }

    case 'text':
      await 发消息(event, [段_文本(内容)], replyExtra);
      break;

    case 'image': {
      const 图片列表 = (entry.图片 as string[] | undefined) ?? [];
      await sendJoinPmImageReply(event, ctx, 图片列表, deps, '', options);
      break;
    }

    case 'text+image': {
      const 图片列表 = (entry.图片 as string[] | undefined) ?? [];
      await sendJoinPmImageReply(event, ctx, 图片列表, deps, 内容, options);
      break;
    }

    case 'video': {
      const 文件 = entry.文件;
      if (文件) await sendJoinPmVideoReply(event, 文件, deps, '', options);
      break;
    }

    case 'text+video': {
      const 文件 = entry.文件;
      if (文件) await sendJoinPmVideoReply(event, 文件, deps, 内容, options);
      break;
    }

    case 'file': {
      const 文件 = entry.文件;
      if (文件) {
        await sendJoinPmFileReply(event, ctx, 文件, deps, entry.名称, '', options);
      }
      break;
    }

    case 'text+file': {
      const 文件 = entry.文件;
      if (文件) {
        await sendJoinPmFileReply(event, ctx, 文件, deps, entry.名称, 内容, options);
      }
      break;
    }

    default:
      deps.logger?.warn?.('[入群私聊] 未知类型:', 类型);
      break;
  }
}
