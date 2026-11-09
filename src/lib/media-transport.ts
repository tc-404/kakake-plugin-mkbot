// ---------------------------------------------------------------------------
// 媒体跨文件系统投递（插件侧，不依赖宿主框架改动）
//
// 场景：咔咔珂跑在宿主机 /root/kakake，协议端（SnowLuma / NapCat / Lagrange…）
// 跑在 Docker 容器里且没把 /root/kakake 挂进去。此时：
//   · 插件把 sharp 渲染出的图片落盘成 file:///root/kakake/data/临时图片/xxx.png，
//     协议端容器内没有这个文件 → send_msg 直接 retcode=100；
//   · 改成 base64 内联后又可能因为 1.6~5MB 的 WS 帧超出协议端 WS 载荷上限，
//     帧被拒/连接被断 → 协议端同样「读不到」。
//
// 这里的对策（全部在插件内完成）：
//   1. 把「宿主本地路径」在发送前转成 base64://（自包含，不依赖共享文件系统）；
//   2. 超过体积上限的静态图片用 sharp 自动压成 JPEG（带降级档位），把 WS 帧
//      压到 1~2MB 以内；sharp 不在时保持原样，绝不因此丢消息；
//   3. 提供错误识别函数：协议端回「读不到本地文件」/「帧过大」时，由 BOT.ts
//      自动换形态重试一次，并把「协议端读不到宿主文件」记为运行时事实，
//      后续消息不再走 file://（首条失败后自愈）。
//
// 注意：GIF 动图与未知格式不压缩（转成 JPEG 会丢帧）；非图片媒体不自动内联
//      （60MB 视频塞进 WS 会拖垮连接，仍由上层降级成链接）。
// ---------------------------------------------------------------------------

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { loadSharp } from './sharp-loader';
import { canProtocolReadLocalFile, getInlineImageMaxBytes } from './media-inline';

/** 本地文件转内联时允许读取的最大体积；只用于「读取」，之后还会压缩 */
const MK_LOCAL_INLINE_MAX_READ_BYTES = 32 * 1024 * 1024;

const MK_MEDIA_SEGMENT_TYPES = new Set(['image', 'video', 'record', 'voice', 'file', 'audio']);

export interface InlinePayload {
  mime: string;
  b64: string;
}

/** 从 base64://xxx / data:image/png;base64,xxx 拆出 mime 与纯 base64 串 */
export function parseInlinePayload(input: unknown): InlinePayload | null {
  const raw = String(input ?? '');
  const dm = raw.match(/^data:([^;,]*)(;base64)?,([\s\S]*)$/i);
  if (dm) {
    return { mime: String(dm[1] || '').toLowerCase(), b64: dm[2] ? String(dm[3] || '') : '' };
  }
  if (/^base64:\/\//i.test(raw)) {
    return { mime: '', b64: raw.replace(/^base64:\/\//i, '') };
  }
  return null;
}

export function isInlinePayload(input: unknown): boolean {
  const p = parseInlinePayload(input);
  return !!(p && p.b64);
}

export function isRemoteUrl(input: unknown): boolean {
  return /^https?:\/\//i.test(String(input ?? '').trim());
}

/** file:// / 绝对路径 / 带图片扩展名的相对路径 = 需要协议端读宿主盘 */
export function isLocalFileRef(input: unknown): boolean {
  const t = String(input ?? '').trim();
  if (!t) return false;
  if (/^file:\/\//i.test(t)) return true;
  if (/^[A-Za-z]:[\\/]/.test(t)) return true;
  if (t.startsWith('/') || t.startsWith('./') || t.startsWith('../') || t.startsWith('~')) return true;
  if (/^[a-z][a-z0-9+.-]*:/i.test(t)) return false;
  return /\.(png|jpe?g|gif|webp|bmp|ico|mp4|mkv|avi|mov|webm|mp3|wav|silk|amr|flac|zip|rar|7z|txt|json)$/i.test(t);
}

export function localFileToInline(input: unknown, maxBytes = MK_LOCAL_INLINE_MAX_READ_BYTES): string {
  try {
    let p = String(input ?? '').trim();
    if (/^file:\/\//i.test(p)) p = fileURLToPath(p);
    else p = path.resolve(p);
    const st = fs.statSync(p);
    if (!st.isFile() || st.size <= 0 || st.size > maxBytes) return '';
    const buf = fs.readFileSync(p);
    if (!buf.length) return '';
    return `base64://${buf.toString('base64')}`;
  } catch {
    return '';
  }
}

/** 精简的字节头嗅探，用于排除 GIF（动图不能压成 JPEG）与未知格式 */
function sniffImageKind(buf: Buffer): 'gif' | 'jpeg' | 'png' | 'webp' | 'bmp' | 'other' {
  if (buf.length >= 12) {
    if (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46) return 'gif';
    if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpeg';
    if (buf[0] === 0x89 && buf[1] === 0x50) return 'png';
    if (buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') return 'webp';
    if (buf[0] === 0x42 && buf[1] === 0x4d) return 'bmp';
  }
  return 'other';
}

/** 压缩结果缓存：同一张图重复发不重复编码（按内容 sha1） */
const compressCache = new Map<string, string>();

/**
 * 把超大的内联静态图片压成 JPEG 后再内联。
 * @returns 新的 base64:// 串；不需要压 / 不能压 / 压缩失败时返回空串
 */
export async function compressInlineImage(input: unknown, maxBytes: number): Promise<string> {
  const parsed = parseInlinePayload(input);
  if (!parsed?.b64) return '';
  const cap = Number(maxBytes) > 0 ? Number(maxBytes) : getInlineImageMaxBytes();
  let buf: Buffer;
  try {
    buf = Buffer.from(parsed.b64, 'base64');
  } catch {
    return '';
  }
  if (!buf.length || buf.length <= cap) return '';
  const kind = sniffImageKind(buf);
  if (kind === 'other' || kind === 'gif') return '';

  const key = crypto.createHash('sha1').update(buf).digest('hex');
  const cached = compressCache.get(key);
  if (cached) return cached;

  let factory: Awaited<ReturnType<typeof loadSharp>>;
  try {
    factory = await loadSharp();
  } catch {
    // sharp 未安装 / 原生模块损坏：保持原始内联形态，由上层按原样发送
    return '';
  }
  if (typeof factory !== 'function') return '';

  // 逐档降质：先只换编码格式，再逐步缩小宽度。任一档达标就停。
  const steps = [
    { quality: 84, width: 0 },
    { quality: 78, width: 1600 },
    { quality: 68, width: 1280 },
    { quality: 58, width: 1024 },
  ];
  let best = '';
  let bestLen = buf.length;
  for (const step of steps) {
    try {
      let pipe = factory(buf).rotate().flatten({ background: '#ffffff' });
      if (step.width > 0) {
        pipe = pipe.resize({ width: step.width, withoutEnlargement: true, fit: 'inside' });
      }
      const out = await pipe.jpeg({ quality: step.quality, mozjpeg: true }).toBuffer();
      if (out.length < bestLen) {
        bestLen = out.length;
        best = `base64://${out.toString('base64')}`;
      }
      if (out.length <= cap) break;
    } catch {
      // 某一档失败（如损坏图片）继续试下一档
    }
  }
  if (!best) return '';
  if (compressCache.size > 24) compressCache.clear();
  compressCache.set(key, best);
  return best;
}

function cloneShallowDeep(value: unknown, depth = 0): any {
  if (depth > 10 || value == null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map((v) => cloneShallowDeep(v, depth + 1));
  const out: Record<string, unknown> = {};
  for (const k of Object.keys(value as Record<string, unknown>)) {
    out[k] = cloneShallowDeep((value as Record<string, unknown>)[k], depth + 1);
  }
  return out;
}

/** 收集参数里所有带 data.file 的媒体段（含合并转发 node 的嵌套 content） */
function collectMediaSegments(node: unknown, out: any[], depth = 0): void {
  if (depth > 10 || node == null || typeof node !== 'object') return;
  if (Array.isArray(node)) {
    for (const item of node) collectMediaSegments(item, out, depth + 1);
    return;
  }
  const obj = node as Record<string, any>;
  const type = String(obj.type ?? '').toLowerCase();
  if (MK_MEDIA_SEGMENT_TYPES.has(type) && obj.data && typeof obj.data === 'object' && typeof obj.data.file === 'string') {
    out.push(obj);
  }
  for (const k of Object.keys(obj)) {
    const v = obj[k];
    if (v && typeof v === 'object') collectMediaSegments(v, out, depth + 1);
  }
}

export interface PrepareMediaResult {
  params: any;
  changed: boolean;
  /** 原始参数里是否含宿主本地路径（用于判断是否值得换形态重试） */
  hasLocalRef: boolean;
  /** 原始参数里是否含超限内联图片 */
  hasOversizedInline: boolean;
  compressed: number;
  inlined: number;
}

const EMPTY_RESULT = (params: any): PrepareMediaResult => ({
  params,
  changed: false,
  hasLocalRef: false,
  hasOversizedInline: false,
  compressed: 0,
  inlined: 0,
});

/**
 * 发送前统一处理媒体段（异步，因为压缩要用 sharp）。
 *
 * @param options.forceInline    true = 无论开关如何，都把图片本地路径改走内联（失败重试时用）
 * @param options.compressInline 是否允许压缩超限大图；false = 原图字节一个不动
 *                               （「原图优先」的首发与「不压缩」策略传 false）
 */
export async function prepareMediaParams(
  params: any,
  options: { forceInline?: boolean; compressInline?: boolean } = {},
): Promise<PrepareMediaResult> {
  if (!params || typeof params !== 'object' || Array.isArray(params)) return EMPTY_RESULT(params);
  const originalSegments: any[] = [];
  collectMediaSegments(params, originalSegments);
  if (!originalSegments.length) return EMPTY_RESULT(params);

  const cap = getInlineImageMaxBytes();
  const localSegs = originalSegments.filter((s) => isLocalFileRef(s.data.file));
  const bigInlineSegs = originalSegments.filter((s) => {
    const p = parseInlinePayload(s.data.file);
    if (!p?.b64) return false;
    return Math.floor(p.b64.length * 3 / 4) > cap && String(s.type).toLowerCase() === 'image';
  });

  const result = EMPTY_RESULT(params);
  result.hasLocalRef = localSegs.length > 0;
  result.hasOversizedInline = bigInlineSegs.length > 0;

  const shouldCompress = options.compressInline !== false;
  const shouldConvertLocal = !!options.forceInline || !canProtocolReadLocalFile();
  // 不允许压缩、又没有需要转换的本地路径时，原图原样发出，不做任何加工
  if (!((shouldCompress && bigInlineSegs.length) || (shouldConvertLocal && localSegs.length))) return result;

  const cloned = cloneShallowDeep(params);
  const clonedSegs: any[] = [];
  collectMediaSegments(cloned, clonedSegs);

  for (const seg of clonedSegs) {
    const f = String(seg?.data?.file ?? '').trim();
    if (!f || String(seg.type).toLowerCase() !== 'image') continue;
    if (isInlinePayload(f)) {
      if (!shouldCompress) continue; // 原图优先 / 不压缩：保持原始字节
      const compressed = await compressInlineImage(f, cap);
      if (compressed && compressed !== f) {
        seg.data.file = compressed;
        result.changed = true;
        result.compressed += 1;
      }
    } else if (isLocalFileRef(f) && shouldConvertLocal) {
      const inline = localFileToInline(f);
      if (!inline) continue;
      // 只换承载形态（路径 → 自包含内联），像素数据仍是原文件的字节
      const compressed = shouldCompress ? await compressInlineImage(inline, cap) : '';
      seg.data.file = compressed || inline;
      result.changed = true;
      result.inlined += 1;
    }
  }

  if (!result.changed) return EMPTY_RESULT(params);
  result.params = cloned;
  return result;
}

/** 协议端「读不到宿主本地文件」类错误（咔咔珂常把详情剥成 retcode=100） */
export function isUnreadableLocalFileError(error: unknown): boolean {
  const msg = String((error as { message?: unknown })?.message ?? error ?? '');
  if (!msg) return false;
  if (/ENOENT|EACCES|EPERM|EISDIR|realpath|no such file|file not found|cannot find|cannot read|读取文件失败|文件不存在|路径不存在|文件不可读/i.test(msg)) return true;
  // 咔咔珂把协议端返回的详情剥成「API 失败 retcode=100」；只认 100，
  // 不要连 retcode=1400 / 1200 之类的参数错误也误判成「本地文件读不到」。
  if (/retcode\s*=?\s*100\b/i.test(msg)) return true;
  return false;
}

/** WS 帧过大 / 连接被载荷撑断类错误 */
export function isOversizedPayloadError(error: unknown): boolean {
  const msg = String((error as { message?: unknown })?.message ?? error ?? '');
  if (!msg) return false;
  return /max payload|payload too large|1009|帧过大|消息过长|消息体过大|连接已断开|ECONNRESET/i.test(msg);
}
