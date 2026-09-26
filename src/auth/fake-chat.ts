// ---------------------------------------------------------------------------
// 伪造聊天：JSON 格式解析 → 合并转发节点
// ---------------------------------------------------------------------------

import fs from 'fs';
import path from 'path';
import { pathToFileURL } from 'url';

export interface FakeChatForwardMessage {
  name: string;
  qq: string;
  time: number;
  content: Array<Record<string, unknown>>;
}

export type FakeChatParseResult =
  | { ok: true; messages: FakeChatForwardMessage[] }
  | { ok: false; error: string };

export interface FakeChatMediaDeps {
  downloadFile: (url: string, savePath: string, isAbsolute?: boolean) => Promise<unknown>;
  getDataPath: () => string;
  rand: (min: number, max: number) => number;
}

type ObSegment = Record<string, unknown>;
type SegmentBuildError = { error: string };
type SegmentBuildResult = ObSegment | SegmentBuildError;

function isSegmentBuildError(r: SegmentBuildResult): r is SegmentBuildError {
  return 'error' in r && typeof (r as SegmentBuildError).error === 'string';
}

const FAKE_CHAT_CACHE_REL = '筱筱吖/伪造聊天/缓存';
/** 单个远程图片链接的下载时限（秒） */
const MEDIA_DOWNLOAD_TIMEOUT_IMAGE_SEC = 25;
const MEDIA_DOWNLOAD_TIMEOUT_IMAGE_MS = MEDIA_DOWNLOAD_TIMEOUT_IMAGE_SEC * 1000;
/** 单个远程视频链接的下载时限（秒） */
const MEDIA_DOWNLOAD_TIMEOUT_VIDEO_SEC = 35;
const MEDIA_DOWNLOAD_TIMEOUT_VIDEO_MS = MEDIA_DOWNLOAD_TIMEOUT_VIDEO_SEC * 1000;
/** 多链接叠加后的总下载时限上限（秒） */
const MEDIA_DOWNLOAD_BATCH_MAX_SEC = 600;
const MEDIA_DOWNLOAD_BATCH_MAX_MS = MEDIA_DOWNLOAD_BATCH_MAX_SEC * 1000;
/** 格式校验通过：对指令消息表情回应（吃糖 :/吃糖） */
export const FAKE_CHAT_EMOJI_REACT_PARSE_OK = '324';
/** 合并转发发送成功：对指令消息表情回应 */
export const FAKE_CHAT_EMOJI_REACT_SEND_OK = '76';
/** NapCat 合并转发中经典 QQ 小黄脸表情 ID 大致范围 */
const CLASSIC_FACE_ID_MAX = 103;

type FakeChatBotApi = (
  ctx: unknown,
  action: string,
  params: Record<string, unknown>,
) => Promise<unknown>;

/** 对指定消息调用 NapCat set_msg_emoji_like 表情回应 */
export async function reactFakeChatCommandMessage(
  ctx: unknown,
  messageId: string | number,
  emojiId: string,
  botApi: FakeChatBotApi,
): Promise<void> {
  if (messageId == null || String(messageId).trim() === '') return;
  try {
    await botApi(ctx, 'set_msg_emoji_like', {
      message_id: messageId,
      emoji_id: emojiId,
      set: true,
    });
  } catch {
    // 表情回应失败不影响主流程
  }
}

function concatEventTextSegments(event: { message?: unknown }): string {
  const msg = event?.message;
  if (typeof msg === 'string') return msg;
  if (!Array.isArray(msg)) return '';
  let out = '';
  for (const seg of msg) {
    if (seg && typeof seg === 'object' && (seg as Record<string, unknown>).type === 'text') {
      const data = (seg as Record<string, unknown>).data as Record<string, unknown> | undefined;
      if (data?.text != null) out += String(data.text);
    }
  }
  return out;
}

/** 第二条消息仅发 JSON 数组（上一条发过「伪造聊天」时 QQ 常会拆成两条） */
export function isStandaloneFakeChatJson(message: string): boolean {
  const t = String(message ?? '').trim();
  if (!t.startsWith('[')) return false;
  try {
    const arr = JSON.parse(t) as unknown;
    if (!Array.isArray(arr) || arr.length === 0) return false;
    return arr.every((item) => {
      if (!item || typeof item !== 'object' || Array.isArray(item)) return false;
      const row = item as Record<string, unknown>;
      return (
        typeof row.name === 'string' &&
        (typeof row.qq === 'string' || typeof row.qq === 'number') &&
        Array.isArray(row.data)
      );
    });
  } catch {
    return false;
  }
}

/** 从事件与已解析 message 中提取 JSON 正文 */
export function extractFakeChatJsonPayload(
  event: { message?: unknown; raw_message?: string },
  message: string,
): string {
  if (isStandaloneFakeChatJson(message)) return String(message).trim();

  const tryExtract = (text: string): string => {
    const m = String(text ?? '').match(/^伪造聊天([\s\S]*)$/);
    const body = m ? String(m[1]).trim() : '';
    if (body && body.startsWith('[')) return body;
    return '';
  };

  const sources = [message, concatEventTextSegments(event), String(event?.raw_message ?? '')];
  for (const src of sources) {
    const hit = tryExtract(src);
    if (hit) return hit;
  }
  return '';
}

function obSegText(data: unknown): ObSegment {
  return { type: 'text', data: { text: String(data ?? '') } };
}

function obSegFace(data: unknown, index: number, segIndex: number): SegmentBuildResult {
  const idStr = String(data ?? '').trim();
  if (!/^\d+$/.test(idStr)) {
    return { error: `第 ${index + 1} 条第 ${segIndex + 1} 段：face 的 data 须为数字 ID` };
  }
  const id = Number(idStr);
  if (id < 0 || id > CLASSIC_FACE_ID_MAX) {
    return {
      error:
        `第 ${index + 1} 条第 ${segIndex + 1} 段：表情 ID ${id} 超出 NapCat 合并转发支持的经典表情范围 0-${CLASSIC_FACE_ID_MAX}，商城表情请用 mface`,
    };
  }
  return { type: 'face', data: { id: idStr } };
}

function obSegMface(data: unknown, index: number, segIndex: number): SegmentBuildResult {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return {
      error: `第 ${index + 1} 条第 ${segIndex + 1} 段：mface 的 data 须为对象 {emoji_id, emoji_package_id, key}`,
    };
  }
  const row = data as Record<string, unknown>;
  const emoji_id = String(row.emoji_id ?? '').trim();
  const emoji_package_id = String(row.emoji_package_id ?? '').trim();
  const key = String(row.key ?? '').trim();
  if (!emoji_id || !emoji_package_id || !key) {
    return {
      error: `第 ${index + 1} 条第 ${segIndex + 1} 段：mface 缺少 emoji_id / emoji_package_id / key`,
    };
  }
  return {
    type: 'mface',
    data: {
      emoji_id,
      emoji_package_id,
      key,
      ...(row.summary != null && String(row.summary).trim() !== ''
        ? { summary: String(row.summary) }
        : {}),
    },
  };
}

function isHttpUrl(raw: string): boolean {
  try {
    const u = new URL(raw);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return false;
    if (!u.hostname || u.hostname.includes('...')) return false;
    return true;
  } catch {
    return false;
  }
}

function isLocalMediaRef(raw: string): boolean {
  const s = String(raw ?? '').trim();
  if (!s) return false;
  if (s.startsWith('file:')) return true;
  return path.isAbsolute(s);
}

function validateMediaUrl(raw: string, index: number, segIndex: number, label: string): string | { error: string } {
  const url = String(raw ?? '').trim();
  if (!url) {
    return { error: `第 ${index + 1} 条第 ${segIndex + 1} 段：${label}链接不能为空` };
  }
  if (isLocalMediaRef(url) || isHttpUrl(url)) return url;
  return {
    error: `第 ${index + 1} 条第 ${segIndex + 1} 段：${label}须为有效的 http(s) 链接或本地路径`,
  };
}

function obSegImage(data: unknown, index: number, segIndex: number): SegmentBuildResult {
  const checked = validateMediaUrl(String(data ?? ''), index, segIndex, '图片');
  if (typeof checked !== 'string') return checked;
  return { type: 'image', data: { file: checked } };
}

function obSegVideo(data: unknown, index: number, segIndex: number): SegmentBuildResult {
  const checked = validateMediaUrl(String(data ?? ''), index, segIndex, '视频');
  if (typeof checked !== 'string') return checked;
  return { type: 'video', data: { file: checked } };
}

function extFromUrl(url: string, fallback: string): string {
  try {
    const ext = path.extname(new URL(url).pathname);
    return ext || fallback;
  } catch {
    return fallback;
  }
}

function calcHttpMediaDownloadBudget(messages: FakeChatForwardMessage[]): {
  imageCount: number;
  videoCount: number;
  totalTimeoutMs: number;
} {
  let imageCount = 0;
  let videoCount = 0;
  for (const msg of messages) {
    for (const seg of msg.content) {
      const type = String(seg.type ?? '').toLowerCase();
      const file = String(
        ((seg.data as Record<string, unknown> | undefined) ?? {}).file ?? '',
      ).trim();
      if (!isHttpUrl(file)) continue;
      if (type === 'image') imageCount++;
      else if (type === 'video') videoCount++;
    }
  }
  const budgetMs =
    imageCount * MEDIA_DOWNLOAD_TIMEOUT_IMAGE_MS +
    videoCount * MEDIA_DOWNLOAD_TIMEOUT_VIDEO_MS;
  return {
    imageCount,
    videoCount,
    totalTimeoutMs: Math.min(budgetMs, MEDIA_DOWNLOAD_BATCH_MAX_MS),
  };
}

function mediaDownloadTimeoutMs(type: string): number {
  return type === 'video' ? MEDIA_DOWNLOAD_TIMEOUT_VIDEO_MS : MEDIA_DOWNLOAD_TIMEOUT_IMAGE_MS;
}

function mediaDownloadTimeoutSec(type: string): number {
  return type === 'video' ? MEDIA_DOWNLOAD_TIMEOUT_VIDEO_SEC : MEDIA_DOWNLOAD_TIMEOUT_IMAGE_SEC;
}

async function downloadMediaToCache(
  url: string,
  saveRel: string,
  deps: FakeChatMediaDeps,
  batchStartedAt: number,
  batchTotalTimeoutMs: number,
  perLinkTimeoutMs: number,
): Promise<boolean> {
  const fullPath = path.join(deps.getDataPath(), saveRel);
  const dir = path.dirname(fullPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  const batchElapsed = Date.now() - batchStartedAt;
  const batchRemaining = batchTotalTimeoutMs - batchElapsed;
  if (batchRemaining <= 0) return false;
  const thisTimeoutMs = Math.min(perLinkTimeoutMs, batchRemaining);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), thisTimeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) return false;
    const buf = Buffer.from(await res.arrayBuffer());
    if (!buf.length) return false;
    fs.writeFileSync(fullPath, buf);
    return true;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

function buildNodeFromItem(
  item: unknown,
  index: number,
  nowSec: number,
): FakeChatForwardMessage | { error: string } {
  if (!item || typeof item !== 'object' || Array.isArray(item)) {
    return { error: `第 ${index + 1} 条消息格式无效` };
  }

  const row = item as Record<string, unknown>;
  const name = String(row.name ?? '').trim();
  const qq = String(row.qq ?? '').trim();
  const data = row.data;

  if (!name) return { error: `第 ${index + 1} 条缺少 name` };
  if (!qq) return { error: `第 ${index + 1} 条缺少 qq` };
  if (!Array.isArray(data) || data.length === 0) {
    return { error: `第 ${index + 1} 条 data 不能为空数组` };
  }

  const content: ObSegment[] = [];
  const types = data.map((seg) =>
    String((seg as Record<string, unknown>)?.type ?? '').toLowerCase(),
  );
  const hasVideo = types.includes('video');

  if (hasVideo) {
    if (data.length !== 1 || types[0] !== 'video') {
      return {
        error: `第 ${index + 1} 条：视频仅支持单独一个子消息，不可与文本/表情/图片混用`,
      };
    }
    const built = obSegVideo((data[0] as Record<string, unknown>)?.data, index, 0);
    if (isSegmentBuildError(built)) return built;
    content.push(built);
  } else {
    for (let j = 0; j < data.length; j++) {
      const seg = data[j] as Record<string, unknown>;
      const type = String(seg?.type ?? '').toLowerCase();
      const val = seg?.data;
      let built: SegmentBuildResult;

      switch (type) {
        case 'text':
          built = obSegText(val);
          break;
        case 'face':
          built = obSegFace(val, index, j);
          break;
        case 'mface':
          built = obSegMface(val, index, j);
          break;
        case 'image':
          built = obSegImage(val, index, j);
          break;
        case 'video':
          return {
            error: `第 ${index + 1} 条：视频不可与其他类型混用，且每条消息仅允许一个视频`,
          };
        default:
          return {
            error: `第 ${index + 1} 条第 ${j + 1} 段：不支持的类型「${type || '未知'}」`,
          };
      }

      if (isSegmentBuildError(built)) return built;
      content.push(built);
    }
  }

  if (!content.length) {
    return { error: `第 ${index + 1} 条未解析出有效内容` };
  }

  let time = nowSec;
  if (row.time != null && String(row.time).trim() !== '') {
    const t = Number(row.time);
    if (!Number.isFinite(t)) {
      return { error: `第 ${index + 1} 条 time 必须是有效的时间戳秒数` };
    }
    time = Math.floor(t);
  }

  return { name, qq, time, content };
}

/** 解析「伪造聊天」后的 JSON 正文 */
export function parseFakeChatJsonInput(raw: string): FakeChatParseResult {
  const trimmed = raw.trim();
  if (!trimmed) {
    return { ok: false, error: '内容不能为空' };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return { ok: false, error: 'JSON 解析失败，请检查括号、引号与逗号是否正确' };
  }

  if (!Array.isArray(parsed) || parsed.length === 0) {
    return { ok: false, error: '根节点必须是包含至少一条消息的 JSON 数组' };
  }

  const nowSec = Math.floor(Date.now() / 1000);
  const messages: FakeChatForwardMessage[] = [];

  for (let i = 0; i < parsed.length; i++) {
    const built = buildNodeFromItem(parsed[i], i, nowSec);
    if ('error' in built) {
      return { ok: false, error: built.error };
    }
    messages.push(built);
  }

  return { ok: true, messages };
}

/** 发送前将远程图片/视频下载到本地，避免 NapCat 合并转发解析 URL 失败 */
export async function prepareFakeChatForwardMessages(
  messages: FakeChatForwardMessage[],
  deps: FakeChatMediaDeps,
): Promise<{ ok: true; messages: FakeChatForwardMessage[] } | { ok: false; error: string }> {
  const out: FakeChatForwardMessage[] = [];
  const { imageCount, videoCount, totalTimeoutMs: batchTotalTimeoutMs } =
    calcHttpMediaDownloadBudget(messages);
  const mediaLinkCount = imageCount + videoCount;
  const batchStartedAt = Date.now();

  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];
    const newSegments: ObSegment[] = [];

    for (const seg of msg.content) {
      const type = String(seg.type ?? '').toLowerCase();
      const data = (seg.data as Record<string, unknown> | undefined) ?? {};
      const file = String(data.file ?? '').trim();

      if ((type === 'image' || type === 'video') && isHttpUrl(file)) {
        const ext = extFromUrl(file, type === 'image' ? '.png' : '.mp4');
        const savedName = `${deps.rand(10_000_000, 99_999_999)}${ext}`;
        const saveRel = `${FAKE_CHAT_CACHE_REL}/${savedName}`;
        const ok = await downloadMediaToCache(
          file,
          saveRel,
          deps,
          batchStartedAt,
          batchTotalTimeoutMs,
          mediaDownloadTimeoutMs(type),
        );
        if (!ok) {
          const totalSec = batchTotalTimeoutMs / 1000;
          const perLinkSec = mediaDownloadTimeoutSec(type);
          return {
            ok: false,
            error: `第 ${i + 1} 条${type === 'image' ? '图片' : '视频'}下载失败或超时（共 ${mediaLinkCount} 个链接，总限时 ${totalSec}s，本链 ${perLinkSec}s），请确认链接可访问且为直链`,
          };
        }
        const abs = path.join(deps.getDataPath(), saveRel);
        if (!fs.existsSync(abs)) {
          return { ok: false, error: `第 ${i + 1} 条媒体缓存失败` };
        }
        newSegments.push({
          type,
          data: { file: pathToFileURL(abs).href },
        });
      } else {
        newSegments.push(seg);
      }
    }

    out.push({ ...msg, content: newSegments });
  }

  return { ok: true, messages: out };
}

/** 空指令时的帮助文案 */
export function buildFakeChatHelpText(): string {
  let msg = `══════════════`;
  msg += `\n【伪造聊天】JSON 格式`;
  msg += `\n相关事件【伪造聊天】`;
  msg += `\n开启|关闭伪造声明`;
  msg += `\n`;
  msg += `\n指令后紧跟 JSON 数组，例：`;
  msg += `\n伪造聊天`;
  msg += `\n[{"name":"三个句号","qq":"864264375","data":[{"type":"text","data":"你好"},{"type":"face","data":"14"}]},{"name":"四个句号","qq":"3573995540","data":[{"type":"text","data":"看图"},{"type":"image","data":"https://example.com/a.png"}]}]`;
  msg += `\n`;
  msg += `\n说明：`;
  msg += `\n· face 经典表情 ID：0-103`;
  msg += `\n· 商城表情用 mface，data 为对象`;
  msg += `\n· image/video 须填真实可访问的 http(s) 直链`;
  msg += `\n· video 每条消息仅允许单独一段`;
  msg += `\n· 须在同一条消息内发送；若被拆成两条，第二条可直接发 JSON 数组`;
  msg += `\n══════════════`;
  return msg;
}
