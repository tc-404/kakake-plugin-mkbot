import fs from 'fs';
import path from 'path';
import { readB } from '../data-fs';

type GetDataPath = () => string;

/** 消息记录根目录：与插件 data 同级的 data/消息记录 */
export function getMessageRecordBaseDir(getDataPath: GetDataPath): string {
  const 读写根 = getDataPath() || '.';
  return path.join(path.dirname(path.dirname(读写根)), '消息记录');
}

export function getMessageRecordMediaDir(getDataPath: GetDataPath): string {
  return path.join(getMessageRecordBaseDir(getDataPath), 'ziyuan');
}

/** 旧版单文件存储（兼容读取） */
export function getLegacyMessageRecordFile(getDataPath: GetDataPath): string {
  return path.join(getMessageRecordBaseDir(getDataPath), 'shuju.json');
}

/** 按群聊/私聊解析会话记录文件路径 */
export function resolveMessageRecordSessionFile(
  getDataPath: GetDataPath,
  hint: Record<string, unknown>,
): string {
  const baseDir = getMessageRecordBaseDir(getDataPath);
  const noticeType = String(hint?.notice_type ?? '');

  if (noticeType === 'group_recall' || hint?.message_type === 'group') {
    const gid = hint.group_id;
    if (gid != null && String(gid).trim()) {
      return path.join(baseDir, '群聊', `${String(gid).trim()}.json`);
    }
  }

  if (noticeType === 'friend_recall' || hint?.message_type === 'private') {
    const sender = hint.sender as { user_id?: string | number } | undefined;
    const qq = String(hint.user_id ?? sender?.user_id ?? '').trim();
    if (qq) return path.join(baseDir, '私聊', `${qq}.json`);
  }

  return path.join(baseDir, '私聊', 'unknown.json');
}

export function getMessageRecordPathsForEvent(
  getDataPath: GetDataPath,
  event: Record<string, unknown>,
) {
  const 记录目录 = getMessageRecordBaseDir(getDataPath);
  return {
    记录目录,
    资源目录: path.join(记录目录, 'ziyuan'),
    记录文件: resolveMessageRecordSessionFile(getDataPath, event),
    旧记录文件: getLegacyMessageRecordFile(getDataPath),
  };
}

/** 按 message_id 查找记录：优先会话文件，回退旧版 shuju.json */
export function lookupMessageRecordEntry(
  getDataPath: GetDataPath,
  readBFn: typeof readB,
  messageId: string,
  event: Record<string, unknown>,
): { entry: Record<string, unknown> | null; 记录文件: string } {
  const baseDir = getMessageRecordBaseDir(getDataPath);
  const legacyFile = getLegacyMessageRecordFile(getDataPath);
  const candidates: string[] = [];

  const push = (filePath: string) => {
    if (filePath && !candidates.includes(filePath)) candidates.push(filePath);
  };

  push(resolveMessageRecordSessionFile(getDataPath, event));

  const noticeType = String(event?.notice_type ?? '');
  if (noticeType === 'group_recall' && event.group_id != null) {
    push(path.join(baseDir, '群聊', `${String(event.group_id).trim()}.json`));
  }
  if (noticeType === 'friend_recall') {
    const qq = String(event.user_id ?? '').trim();
    if (qq) push(path.join(baseDir, '私聊', `${qq}.json`));
  }

  push(legacyFile);

  for (const 记录文件 of candidates) {
    const entry = readBFn(记录文件, messageId, null);
    if (entry && typeof entry === 'object') {
      return { entry: entry as Record<string, unknown>, 记录文件 };
    }
  }

  return { entry: null, 记录文件: candidates[0] || legacyFile };
}

export function ensureMessageRecordSessionDir(记录文件: string): void {
  const dir = path.dirname(记录文件);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

/** 按 time 升序排列 message_id（旧在上、新在下）；time 相同则按 id */
export function sortMessageRecordStoreKeys(store: Record<string, unknown>): string[] {
  return Object.keys(store).sort((a, b) => {
    const ta = Number((store[a] as { time?: number })?.time ?? 0);
    const tb = Number((store[b] as { time?: number })?.time ?? 0);
    if (ta !== tb) return ta - tb;
    const na = Number(a);
    const nb = Number(b);
    if (Number.isFinite(na) && Number.isFinite(nb)) return na - nb;
    return String(a).localeCompare(String(b));
  });
}

/**
 * 序列化消息记录库，保持 time 升序键顺序。
 * 不用 JSON.stringify(对象)，避免纯数字 message_id 被按 id 重排而非按 time。
 */
export function stringifyMessageRecordStore(store: Record<string, unknown>): string {
  const ids = sortMessageRecordStoreKeys(store);
  if (ids.length === 0) return '{}';
  const parts = ids.map((id) => {
    const key = JSON.stringify(id);
    const body = JSON.stringify(store[id], null, 2);
    const indented = body
      .split('\n')
      .map((line, i) => (i === 0 ? line : `  ${line}`))
      .join('\n');
    return `  ${key}: ${indented}`;
  });
  return `{\n${parts.join(',\n')}\n}`;
}

/** 撤回成功状态文件：data/消息记录/撤回状态.json */
export function getRecallStatusFile(getDataPath: GetDataPath): string {
  return path.join(getMessageRecordBaseDir(getDataPath), '撤回状态.json');
}

function readRecallStatusStore(filePath: string): Record<string, string> {
  if (!fs.existsSync(filePath)) return {};
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8') || '{}');
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, string>)
      : {};
  } catch {
    return {};
  }
}

let recallStatusWriteChain = Promise.resolve();

/** 该 message_id 是否已记录为撤回成功 */
export function isRecallAlreadySuccess(getDataPath: GetDataPath, messageId: string): boolean {
  const id = String(messageId ?? '').trim();
  if (!id) return false;
  const store = readRecallStatusStore(getRecallStatusFile(getDataPath));
  return store[id] === '成功';
}

/** 标记撤回成功（紧凑 JSON，无格式化） */
export function markRecallSuccess(getDataPath: GetDataPath, messageId: string): Promise<void> {
  const id = String(messageId ?? '').trim();
  if (!id) return Promise.resolve();
  const filePath = getRecallStatusFile(getDataPath);
  recallStatusWriteChain = recallStatusWriteChain
    .then(async () => {
      const store = readRecallStatusStore(filePath);
      store[id] = '成功';
      const dir = path.dirname(filePath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(filePath, JSON.stringify(store), 'utf8');
    })
    .catch(() => {});
  return recallStatusWriteChain;
}

/** 消息记录时间线项（供快捷撤回按上一条/下一条索引） */
export type MsgRecordTimelineItem = {
  messageId: string;
  qq: string;
  time: number;
};

function readJsonObjectFile(filePath: string): Record<string, unknown> {
  if (!fs.existsSync(filePath)) return {};
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8') || '{}');
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

function parseRecordEntry(messageId: string, raw: unknown, groupId: string): MsgRecordTimelineItem | null {
  if (!raw || typeof raw !== 'object') return null;
  const entry = raw as { QQ?: string | number; time?: number; 群号?: string | number; 来源?: string };
  const gid = String(entry.群号 ?? '').trim();
  if (gid && gid !== groupId) return null;
  if (!gid && String(entry.来源 ?? '') === '私聊') return null;
  const qq = String(entry.QQ ?? '').trim();
  const time = Number(entry.time ?? 0);
  if (!qq || !Number.isFinite(time)) return null;
  return { messageId: String(messageId), qq, time };
}

/** 读取本群消息记录时间线（新路径 + 旧 shuju.json 兼容），按 time 升序 */
export function loadGroupMessageRecordTimeline(
  getDataPath: GetDataPath,
  groupId: string | number,
): MsgRecordTimelineItem[] {
  const gid = String(groupId).trim();
  if (!gid) return [];
  const map = new Map<string, MsgRecordTimelineItem>();

  const sessionFile = path.join(getMessageRecordBaseDir(getDataPath), '群聊', `${gid}.json`);
  for (const [messageId, raw] of Object.entries(readJsonObjectFile(sessionFile))) {
    const item = parseRecordEntry(messageId, raw, gid);
    if (item) map.set(item.messageId, item);
  }

  for (const [messageId, raw] of Object.entries(readJsonObjectFile(getLegacyMessageRecordFile(getDataPath)))) {
    if (map.has(String(messageId))) continue;
    const item = parseRecordEntry(messageId, raw, gid);
    if (item) map.set(item.messageId, item);
  }

  return Array.from(map.values()).sort((a, b) => {
    if (a.time !== b.time) return a.time - b.time;
    return String(a.messageId).localeCompare(String(b.messageId));
  });
}

/** 确保锚点消息在时间线中，返回排序后的列表与锚点下标 */
export function mergeAnchorIntoTimeline(
  timeline: MsgRecordTimelineItem[],
  anchor: MsgRecordTimelineItem,
): { timeline: MsgRecordTimelineItem[]; anchorIndex: number } {
  const list = [...timeline];
  const hit = list.findIndex((x) => x.messageId === anchor.messageId);
  if (hit >= 0) return { timeline: list, anchorIndex: hit };

  list.push(anchor);
  list.sort((a, b) => {
    if (a.time !== b.time) return a.time - b.time;
    return String(a.messageId).localeCompare(String(b.messageId));
  });
  const anchorIndex = list.findIndex((x) => x.messageId === anchor.messageId);
  return { timeline: list, anchorIndex };
}
