// ---------------------------------------------------------------------------
// 咔咔珂日志统计：今日「收 / 发」条数
// 数据源为宿主框架自己落盘的运行日志 <框架根>/log/YYYY-MM-DD.log，
// 只统计群聊 / 私聊 / 事件相关的行：
//   收 —— 上报（EVENT / GF_EVENT）里的消息、通知、请求；心跳等 meta 事件不算
//   发 —— 输出（ACTION / GF_ACTION）里的 send_* 请求行；动作回执（✓ / ✗）不重复计
// 系统日志、插件日志、报错与警告行一律不计入。
// 全异步流式读取，不阻塞事件循环；带短时缓存避免重复扫盘。
// ---------------------------------------------------------------------------

import fs from 'fs';
import path from 'path';
import readline from 'readline';
import type { MkLogger } from '../types';

export interface MkChatLogStats {
  /** 收到的条数（群聊 / 私聊 / 事件上报） */
  recv: number;
  /** 由本账号发出的条数（发送类动作） */
  sent: number;
  /** 命中的日志文件名（如 2026-09-01.log），未找到为空串 */
  file: string;
  /** 是否成功读到日志文件 */
  available: boolean;
}

const EMPTY_STATS: MkChatLogStats = { recv: 0, sent: 0, file: '', available: false };

/** 缓存时长：同一次渲染 / 连续触发直接复用 */
const STATS_TTL_MS = 5000;
/** 单个日志文件体积上限：超过则放弃统计，避免长时间占用 CPU */
const MAX_LOG_BYTES = 256 * 1024 * 1024;

let cache: { key: string; at: number; value: MkChatLogStats } | null = null;

function warn(logger: MkLogger | null | undefined, msg: string, ...args: unknown[]): void {
  try {
    logger?.warn?.(msg, ...args);
  } catch {
    /* logger 不可用时忽略 */
  }
}

function isDir(p: string): boolean {
  try {
    return fs.statSync(p).isDirectory();
  } catch {
    return false;
  }
}

/** 本地日期 YYYY-MM-DD（与宿主 formatLocalDate 一致，不用 UTC） */
function localDate(d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/**
 * 定位宿主框架的 log 目录。
 * 插件数据目录形如 <root>/data/<QQ>/<插件名>，插件目录形如 <root>/plugins/<插件名>
 * 或 <root>/plugins_two/<QQ>/<插件名>，因此从这些起点逐级向上找同时含 log 与
 * data / plugins 的目录即可，找不到就返回空串。
 */
export function resolveKakakeLogDir(hints: { dataPath?: string; pluginDir?: string; pluginPath?: string }): string {
  const starts = [hints.dataPath, hints.pluginDir, hints.pluginPath, process.cwd()]
    .map((s) => String(s || '').trim())
    .filter(Boolean);
  for (const start of starts) {
    let cur = path.resolve(start);
    for (let i = 0; i < 6; i += 1) {
      const logDir = path.join(cur, 'log');
      if (isDir(logDir) && (isDir(path.join(cur, 'data')) || isDir(path.join(cur, 'plugins')))) {
        return logDir;
      }
      const parent = path.dirname(cur);
      if (parent === cur) break;
      cur = parent;
    }
  }
  return '';
}

/** 判断上报行是否算「收」；返回 'recv' / 'sent' / null（不计入） */
function classifyEventLine(raw: string, official: boolean): 'recv' | 'sent' | null {
  if (official) {
    // QQ 官方 Gateway：只认带事件类型 t 的推送，握手 / 心跳一律不算
    const m = /"t"\s*:\s*"([A-Z_]+)"/.exec(raw);
    if (!m) return null;
    const t = m[1];
    if (t === 'READY' || t === 'RESUMED' || t.startsWith('HEARTBEAT')) return null;
    return 'recv';
  }
  const m = /"post_type"\s*:\s*"([a-z_]+)"/.exec(raw);
  if (!m) return null;
  const pt = m[1];
  // 自己发出的消息回显算「发」；心跳 / 生命周期等 meta 事件不算
  if (pt === 'message_sent') return 'sent';
  if (pt === 'message' || pt === 'notice' || pt === 'request') return 'recv';
  return null;
}

/** 判断输出行是否是一次真实的发送请求（回执行不重复计） */
function isSendRequestLine(body: string): boolean {
  const m = /^(send_[a-z0-9_]+)([\s\S]*)$/i.exec(body);
  if (!m) return false;
  return !/^\s*[✓✗]/.test(m[2]);
}

/** 统计单个日志文件 */
async function countLogFile(file: string): Promise<{ recv: number; sent: number }> {
  let recv = 0;
  let sent = 0;
  const stream = fs.createReadStream(file, { encoding: 'utf8' });
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });
  try {
    for await (const line of rl) {
      if (!line) continue;
      const head = /^\[[^\]]+\]\s\[([A-Z_]+)\]([\s\S]*)$/.exec(line);
      if (!head) continue;
      const tag = head[1];
      const rest = head[2];
      if (tag === 'EVENT' || tag === 'GF_EVENT') {
        // 上报行写盘格式为 [时间] [EVENT]\t{原始 JSON}；非 JSON 的提示行（校验失败等）不计
        if (rest.charCodeAt(0) !== 9) continue;
        const kind = classifyEventLine(rest.slice(1), tag === 'GF_EVENT');
        if (kind === 'recv') recv += 1;
        else if (kind === 'sent') sent += 1;
        continue;
      }
      if (tag === 'ACTION' || tag === 'GF_ACTION') {
        // 去掉 [输出:xxx] / [插件:xxx] 这层前缀后才是动作名
        const body = rest.replace(/^\s*\[[^\]]*\]\s*/, '').trim();
        if (isSendRequestLine(body)) sent += 1;
      }
      // SYSTEM / PLUGIN / GF_PLUGIN：系统信息与插件日志，不计入
    }
  } finally {
    rl.close();
    stream.destroy();
  }
  return { recv, sent };
}

/** 今日「收 / 发」统计；任何异常都返回 available:false 而不抛 */
export async function getTodayChatLogStats(
  hints: { dataPath?: string; pluginDir?: string; pluginPath?: string },
  logger?: MkLogger | null,
): Promise<MkChatLogStats> {
  const dir = resolveKakakeLogDir(hints);
  const date = localDate();
  const key = `${dir}|${date}`;
  const now = Date.now();
  if (cache && cache.key === key && now - cache.at < STATS_TTL_MS) return cache.value;

  let value: MkChatLogStats = { ...EMPTY_STATS };
  try {
    if (!dir) {
      warn(logger, '[日志统计] 未找到宿主框架 log 目录，收/发已显示 —');
    } else {
      const name = `${date}.log`;
      const file = path.join(dir, name);
      const st = await fs.promises.stat(file).catch(() => null);
      if (!st || !st.isFile()) {
        // 今天还没产生日志：视为可用的 0 条，而不是不可用
        value = { recv: 0, sent: 0, file: name, available: true };
      } else if (st.size > MAX_LOG_BYTES) {
        warn(logger, `[日志统计] ${name} 体积过大（${st.size} 字节），已跳过统计`);
      } else {
        const { recv, sent } = await countLogFile(file);
        value = { recv, sent, file: name, available: true };
      }
    }
  } catch (error) {
    warn(logger, '[日志统计] 读取今日日志失败:', error);
    value = { ...EMPTY_STATS };
  }
  cache = { key, at: now, value };
  return value;
}