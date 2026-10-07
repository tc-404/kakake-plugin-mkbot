// @ts-nocheck
// ================== OneBot11 协议调用（消息段 array，不用 CQ 字符串） ==================
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath, pathToFileURL } from 'url';
import { MK_MEDIA_BASE64_LIMIT } from './lib/download-timeout';
import { configureMediaInlineLimit, configureProtocolLocalRead, getMediaInlineLimitBytes, canProtocolReadLocalFile, shouldDownloadMediaForSend, shouldClampDownloadToInlineLimit, auditMediaConfig, getInlineMaterializeDir, getInlineMaterializeLogger } from './lib/media-inline';
import { configureMediaFetchConcurrency, getMediaFetchConcurrency, normalizeMediaFetchConcurrency, resetMediaFetchConcurrency, mapWithConcurrency, runThunksWithConcurrency } from './lib/media-fetch';
import {
  mkBuildNestedForwardOb11Node,
  mkConvertForwardContentToSnowLuma,
  mkForwardNodeIdentity,
  mkForwardParamsHaveNapCatInlineNest,
  mkIsForwardMsgParamError,
  mkIsSnowLumaBackend,
  mkMarkSnowLumaBackend,
  mkNormalizeOb11NodeTree,
} from './lib/snowluma-compat';

// ================== 当前上下文（plugin_onmessage / plugin_onevent 入口注入） ==================
let 当前上下文 = null;

function bindBotCtx(ctx) {
  当前上下文 = ctx;
}

// ================== 内联图片落盘（base64:// / data: → 本地文件 → file://） ==================
//
// 背景：渲染类图片（今日运势 / 菜单 / MC 服务器卡片等）从来不落盘，渲染服务直接返回
//   base64 字符串，于是整张图以 base64 形态塞进 send_msg 走 WS —— 实测 1.3~2.7MB。
//   而视频因为下载落盘、体积又超内联上限，走的是 file://，WS 只传几十字节。
//   同一台机器、同一个协议端，图片却被多扛了一次完整字节流，纯属浪费。
//
// 做法：协议端读得到本地文件时，把内联图片解码写进「临时图片」目录（与临时视频同级），
//   改成 file:// 下发。WS 载荷从 MB 级降到几十字节，协议端还能省掉一次 base64 解码。
//   写盘失败 / 目录未注入 / 协议端读不到（容器）→ 原样退回 base64，不影响可用性。
//
//   按内容哈希命名，同一张图重复发只存一份；顺带做按时间的过期清理。
const MK_INLINE_MATERIALIZE_MIN_BYTES = 32 * 1024; // 小于此体积直接带 base64，省一次磁盘 IO
const MK_INLINE_MATERIALIZE_MAX_BYTES = 64 * 1024 * 1024;
const MK_INLINE_MATERIALIZE_TTL_MS = 24 * 60 * 60 * 1000;

let mkInlineCleanupAt = 0;

/** 从 base64://xxx 或 data:image/png;base64,xxx 拆出 mime 与纯 base64 串 */
function mkParseInlineImagePayload(s) {
  const raw = String(s || '');
  const dm = raw.match(/^data:([^;,]*)(;base64)?,([\s\S]*)$/i);
  if (dm) return { mime: String(dm[1] || '').toLowerCase(), b64: dm[2] ? String(dm[3] || '') : '' };
  if (/^base64:\/\//i.test(raw)) return { mime: '', b64: raw.replace(/^base64:\/\//i, '') };
  return null;
}

function mkInlineImageExt(mime, buf) {
  // 以字节头为准，不看声明的 mime：实测「默认资源/image/运势2.png」其实是 WebP 内容，
  // 只是扩展名叫 png。扩展名跟内容不符时协议端可能拒收，所以先嗅探真实字节。
  if (buf.length >= 12) {
    if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return '.png';
    if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return '.jpg';
    if (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46) return '.gif';
    if (buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') return '.webp';
    if (buf[0] === 0x42 && buf[1] === 0x4d) return '.bmp';
  }
  const m = String(mime || '').toLowerCase();
  if (m.includes('gif')) return '.gif';
  if (m.includes('webp')) return '.webp';
  if (m.includes('jpeg') || m.includes('jpg')) return '.jpg';
  if (m.includes('bmp')) return '.bmp';
  return '.png';
}

/** 清理过期文件（最多每小时扫一次） */
function mkMaybeCleanupInlineImageDir(dir) {
  const now = Date.now();
  if (now - mkInlineCleanupAt < 3600_000) return;
  mkInlineCleanupAt = now;
  try {
    const 过期线 = now - MK_INLINE_MATERIALIZE_TTL_MS;
    for (const name of fs.readdirSync(dir)) {
      try {
        const fp = path.join(dir, name);
        const st = fs.statSync(fp);
        if (st.isFile() && st.mtimeMs < 过期线) fs.unlinkSync(fp);
      } catch {
        // 单个文件失败不影响其余
      }
    }
  } catch {
    // ignore
  }
}

/**
 * 把内联图片落盘，返回 file:// URL；不适用或失败返回空串（调用方应原样退回 base64）。
 */
function mkMaterializeInlineImage(s) {
  // 容器部署、协议端读不到宿主文件 → 只能内联，落盘反而发不出去
  if (!canProtocolReadLocalFile()) return '';
  const dir = getInlineMaterializeDir();
  if (!dir) return '';
  const parsed = mkParseInlineImagePayload(s);
  if (!parsed || !parsed.b64) return '';
  const 估算 = Math.floor(parsed.b64.length * 3 / 4);
  if (估算 < MK_INLINE_MATERIALIZE_MIN_BYTES || 估算 > MK_INLINE_MATERIALIZE_MAX_BYTES) return '';
  try {
    const buf = Buffer.from(parsed.b64, 'base64');
    if (!buf.length) return '';
    fs.mkdirSync(dir, { recursive: true });
    // 内容哈希命名：同一张图重复发只存一份，也顺带避免文件名冲突
    const hash = crypto.createHash('sha1').update(buf).digest('hex').slice(0, 20);
    const fp = path.join(dir, `${hash}${mkInlineImageExt(parsed.mime, buf)}`);
    let 已存在 = false;
    try {
      已存在 = fs.existsSync(fp) && fs.statSync(fp).size === buf.length;
    } catch {
      已存在 = false;
    }
    if (!已存在) fs.writeFileSync(fp, buf);
    mkMaybeCleanupInlineImageDir(dir);
    // 只记体积够大的，小图的收益本来就不明显，别刷屏
    if (buf.length >= 100 * 1024) {
      try {
        getInlineMaterializeLogger()?.info?.(
          `[媒体] 内联图片已落盘改走 file://：${(buf.length / 1024).toFixed(0)}KB → WS 载荷由 ` +
            `${(Math.ceil(buf.length / 3) * 4 / 1024).toFixed(0)}KB 降到几十字节${已存在 ? '（复用已有文件）' : ''}`,
        );
      } catch {
        // ignore
      }
    }
    return pathToFileURL(fp).href;
  } catch {
    return '';
  }
}

// ================== 媒体路径（外链直通 / 本地 → 内联 或 file://） ==================
//
// 默认走「本地路径」：只往 WS 里塞一个路径字符串（几 KB），由协议端自己读盘上传。
// 60MB 视频走这条路，8Mbps 下约 140 秒完成，是正常的量级。
//
// 内联（base64）是**可选**的：只有协议端读不到宿主机文件时才开（SnowLuma 在容器里
// 会 realpath 报 EACCES）。但它会把整份文件塞进 WS 帧并膨胀 1/3，
// 大文件用它会拖垮连接（连接已断开），所以默认关闭、且只对小文件启用。
//
// 真要让大文件在容器环境下也能发，正解是把 data 目录以相同路径挂进容器
//（-v /root/kakake/data:/root/kakake/data），这样本地路径在容器里依旧可读。
//
// 唯一的约束是体积：ws 默认 maxPayload 100MB，而 base64 会膨胀 1/3。
// 所以按「base64 后的字符串长度」卡上限，超限就放弃内联，由调用方降级（放 URL）。
// 上限值来自 download-timeout，与下载预判共用同一口径。
const 本地媒体base64上限 = MK_MEDIA_BASE64_LIMIT;

function 本地媒体转base64(absPath, 内联上限字节) {
  try {
    const st = fs.statSync(absPath);
    if (!st.isFile() || st.size <= 0) return '';
    if (st.size > 内联上限字节) return '';
    // 先估 base64 长度，超了就别白编码一趟（省掉一次大文件的读+编码）
    if (Math.ceil(st.size / 3) * 4 > 本地媒体base64上限) return '';
    const buf = fs.readFileSync(absPath);
    if (!buf.length) return '';
    return `base64://${buf.toString('base64')}`;
  } catch {
    return '';
  }
}

function 媒体路径(input) {
  const s = String(input || "").trim();
  if (!s) return "";
  // 远端 URL 直通（最稳，协议端自己去拉）
  if (/^https?:\/\//i.test(s)) return s;
  // 已是内联形态：优先落盘改走 file://（详见 mkMaterializeInlineImage 注释）。
  // 落盘不适用（容器 / 未注入目录 / 太小 / 写盘失败）时原样退回 base64。
  if (/^base64:\/\//i.test(s) || /^data:/i.test(s)) {
    const 落盘 = mkMaterializeInlineImage(s);
    return 落盘 || s;
  }

  let local = '';
  if (/^file:\/\//i.test(s)) {
    // 历史遗留：有些调用点会自己先转成 file://，这里要剥开才能拿到真实路径
    try { local = fileURLToPath(s); } catch { local = ''; }
  } else {
    try { local = path.isAbsolute(s) ? s : path.resolve(s); } catch { return s; }
  }
  if (!local) return s;

  // 开了内联且文件够小 → 内联；否则回退本地路径
  const 内联上限 = getMediaInlineLimitBytes();
  if (内联上限 > 0) {
    const b64 = 本地媒体转base64(local, 内联上限);
    if (b64) return b64;
  }
  try {
    if (fs.existsSync(local)) return pathToFileURL(local).href;
  } catch {
    // ignore
  }
  return s;
}

/**
 * 段里的 file 是否已是协议端可直接消费的形态。
 *
 * - 远端 URL / base64 / data：一定可用。
 * - 本地路径：只有**协议端读得到宿主文件**才算可用。
 *   容器部署且未挂载 data 目录时读不到（realpath EACCES），节点里只要含本地路径，
 *   整条合并转发会被协议端拒绝（实测 retcode=100），所以这里必须判 false 走降级。
 */
function 段有可用媒体(seg) {
  const f = String(seg?.data?.file ?? '').trim();
  if (/^(https?|base64|data):/i.test(f)) return true;
  return canProtocolReadLocalFile();
}

// ================== 规范化 JSON 卡片数据 ==================
function 规范化Json(json数据) {
  if (json数据 == null || json数据 === "") return "";
  if (typeof json数据 === "string") {
    const s = json数据.trim();
    return s || "";
  }
  try {
    return JSON.stringify(json数据);
  } catch (_e) {
    return "";
  }
}

// ================== 构建 send_msg 参数 ==================
function 构建发送参数(event, message) {
  const params = {
    message_type: event.message_type,
    message,
  };
  if (event.message_type === "group") {
    const gid = Number(event.group_id);
    params.group_id = Number.isFinite(gid) ? gid : event.group_id;
  } else {
    const uid = Number(event.user_id);
    params.user_id = Number.isFinite(uid) ? uid : event.user_id;
  }
  return params;
}

async function 调用发送(params, options = {}) {
  const ctx = 当前上下文;
  if (!ctx?.actions) return null;
  const throwOnError = options.throwOnError === true;
  try {
    return await ctx.actions.call("send_msg", params, ctx.adapterName, ctx.pluginManager.config);
  } catch (error) {
    // send_msg 超时绝大多数是「回包晚于框架等待上限」，消息其实已投递成功，
    // 表现为先报一条错、十几秒后消息正常可见。按 error 记会让人误判为发送失败，
    // 甚至据此去补发/降级，造成重复消息。这里单独降级为 warn 并说明。
    if (isSendTimeoutError(error)) {
      if (ctx.logger?.warn) {
        ctx.logger.warn("发送消息等待响应超时（协议端通常已送达，稍后可在会话中确认）:", error?.message || error);
      }
      if (throwOnError) throw error;
      return null;
    }
    if (ctx.logger?.error) {
      ctx.logger.error("发送消息失败:" + (mkEnoentLocalFileHint(error) || ""), error);
    }
    if (throwOnError) throw error;
    return null;
  }
}

function isSendTimeoutError(error) {
  const msg = error instanceof Error ? error.message : String(error ?? "");
  if (!msg) return false;
  if (msg.includes("API 超时") || msg.includes("ETIMEDOUT") || msg === "terminated") return true;
  // NT 内核 / Kakake 侧形态：「Timeout: NTEvent serviceAndMethod:NodeIKernelMsgService/sendMsg ...」
  // 之前识别不到，导致这类超时不走重试/降级，直接冒泡成普通异常。
  if (/^timeout\s*:/i.test(msg.trim())) return true;
  if (msg.includes("NTEvent") && /timeout/i.test(msg)) return true;
  return false;
}

/**
 * 协议端读不到本地文件（ENOENT + file://）→ 几乎必然是「插件与协议端不在同一文件系统」：
 * 插件把 /root/kakake/data/临时视频/xxx 的本地路径下发给 WS 转发的远端协议端，
 * 那台机器上根本没有这个文件。给出明确的开关配置指引，而不是一条 ENOENT 让人摸不着头脑。
 */
function mkEnoentLocalFileHint(error) {
  const msg = String(error?.message ?? error ?? "");
  if (!/ENOENT/i.test(msg)) return "";
  return "｜协议端读不到本地文件：插件与协议端不在同一文件系统（WS 转发 / 容器未挂载 data 目录）。"
    + "请在 WebUI 将「协议端读本地文件」切为「读不到」，并设置「媒体内联上限」（图片走 base64，大文件改发链接）";
}

function 必填文本(v) {
  const s = String(v ?? "").trim();
  return s || "";
}

// ================== 合并转发 · 消息段构建（纯 OB11 JSON，不用 CQ 字符串） ==================
/** 把误写成字面量 \\n / \\r\\n 的文本转成真实换行，避免 QQ 里显示成反斜杠 n */
function normalizeOutboundText(text) {
  return String(text ?? '')
    .replace(/\\r\\n/g, '\n')
    .replace(/\\n/g, '\n')
    .replace(/\\r/g, '\n');
}

function 段_文本(text) {
  return { type: 'text', data: { text: normalizeOutboundText(text) } };
}

function 段_图片(file) {
  const f = String(file ?? "").trim();
  if (!f) return 段_文本("");
  const resolved = 媒体路径(f);
  return { type: "image", data: { file: resolved || f } };
}

function 段_视频(file) {
  const f = String(file ?? "").trim();
  if (!f) return 段_文本("");
  const resolved = 媒体路径(f);
  return { type: "video", data: { file: resolved || f } };
}

function 段_Json(json数据) {
  const jsonStr = 规范化Json(json数据);
  if (!jsonStr) return 段_文本("");
  return { type: "json", data: { data: jsonStr } };
}

/** 经典小黄脸表情（face ID 0–103） */
function 段_表情(id) {
  const idStr = String(id ?? "").trim();
  if (!idStr || !/^\d+$/.test(idStr)) return 段_文本("");
  return { type: "face", data: { id: idStr } };
}

/** 引用一条消息 */
function 段_引用(messageId) {
  const id = String(messageId ?? "").trim();
  if (!id) return null;
  return { type: "reply", data: { id } };
}

/** 艾特 QQ（qq 可为数字或 "all"） */
function 段_艾特(qq) {
  const q = String(qq ?? "").trim();
  if (!q) return null;
  return { type: "at", data: { qq: q } };
}

/** 语音消息（record 段，file 为 URL 或本地路径） */
function 段_语音(file) {
  const f = String(file ?? "").trim();
  if (!f) return 段_文本("");
  const resolved = 媒体路径(f);
  return { type: "record", data: { file: resolved || f } };
}

/** 文件消息（file 段，非语音；name 为展示文件名） */
function 段_文件(file, name) {
  const f = String(file ?? "").trim();
  if (!f) return 段_文本("");
  const resolved = 媒体路径(f);
  const n = String(name ?? "").trim() || path.basename(String(resolved || f).split("?")[0] || "file");
  return { type: "file", data: { file: resolved || f, name: n } };
}

/** 规范化单发消息段（仅 text / image / face；另含 reply / at 供回复场景） */
function 规范化消息段(message) {
  if (!Array.isArray(message) || message.length === 0) return [];
  const out = [];
  for (const seg of message) {
    if (!seg || typeof seg !== "object") continue;
    const type = String(seg.type ?? "").toLowerCase();
    const data = seg.data && typeof seg.data === "object" ? seg.data : {};

    if (type === "text") {
      out.push({ type: "text", data: { text: normalizeOutboundText(data.text) } });
      continue;
    }
    if (type === "image") {
      const file = String(data.file ?? data.url ?? "").trim();
      if (file) out.push(段_图片(file));
      continue;
    }
    if (type === "face") {
      const face = 段_表情(data.id ?? data.face_id);
      if (face.type === "face") out.push(face);
      continue;
    }
    if (type === "reply") {
      const rep = 段_引用(data.id ?? data.message_id);
      if (rep) out.push(rep);
      continue;
    }
    if (type === "at") {
      const at = 段_艾特(data.qq);
      if (at) out.push(at);
      continue;
    }
    // 已是合法 OB11 段则原样保留（如调用方传入完整 data）
    if (type) out.push(seg);
  }
  return out.length ? out : [段_文本("")];
}

/** 合并转发节点：{ name, qq, content: OB11 段[], time? } */
function 合并节点(name, qq, content, extra = {}) {
  return { name, qq, content, ...extra };
}

/** 引用已有合并转发消息 ID */
function 合并引用(id, name, qq, extra = {}) {
  return { id: String(id), name, qq, ...extra };
}

/** 文本在前，图片在后（顺序与旧 buildForwardContent 一致） */
function 合并图文节点(name, qq, text, images, extra = {}) {
  const content = [];
  if (text != null && String(text) !== "") content.push(段_文本(text));
  if (Array.isArray(images)) {
    for (const img of images) content.push(段_图片(img));
  } else if (images) {
    content.push(段_图片(images));
  }
  if (!content.length) content.push(段_文本(""));
  return 合并节点(name, qq, content, extra);
}

/** 文本在前，视频在后 */
function 合并视文节点(name, qq, text, video, extra = {}) {
  const content = [];
  if (text != null && String(text) !== "") content.push(段_文本(text));
  if (video) content.push(段_视频(video));
  if (!content.length) content.push(段_文本(""));
  return 合并节点(name, qq, content, extra);
}

// ================== 合并转发 · 卡片预览（source / summary / prompt / news） ==================
/** 手动指定合并转发卡片四要素；news 可选，为 string[] 或 {text}[] */
function 合并预览(source, summary, prompt, news) {
  const out = {};
  const s = String(source ?? "").trim();
  if (s) out.source = s;
  if (summary != null && String(summary).trim()) out.summary = String(summary).trim();
  out.prompt = String(prompt ?? "[聊天记录]").trim() || "[聊天记录]";
  if (Array.isArray(news) && news.length) {
    out.news = news
      .map((item) => {
        if (typeof item === "string") return { text: item };
        if (item && typeof item === "object" && item.text != null) return { text: String(item.text) };
        return { text: String(item ?? "") };
      })
      .filter((x) => x.text.trim());
  }
  return out;
}

function stripNodeDisplayName(name) {
  return (
    String(name ?? "")
      .replace(/^\[[^\]]*\]\s*/, "")
      .replace(/^[\u{1F300}-\u{1FAFF}\u2600-\u27BF]\s*/u, "")
      .trim() || "MKbot"
  );
}

function extractLogicalNodePreviewText(node) {
  if (Array.isArray(node?._mkNestedChildren) && node._mkNestedChildren.length) {
    const sub = extractLogicalNodePreviewText(node._mkNestedChildren[0]);
    return sub !== "[消息]" ? sub : `[${node._mkNestedChildren.length}条子模块]`;
  }
  const content = node?.content;
  if (!Array.isArray(content)) return "[消息]";
  for (const seg of content) {
    if (!seg || typeof seg !== "object") continue;
    const type = String(seg.type ?? "").toLowerCase();
    if (type === "node") {
      const sub = extractLogicalNodePreviewText({
        name: seg.data?.name,
        content: seg.data?.content,
      });
      if (sub !== "[消息]") return sub;
      continue;
    }
    if (type === "text" && seg.data?.text != null) {
      const t = String(seg.data.text).replace(/\s+/g, " ").trim();
      if (t) return t.length > 36 ? `${t.slice(0, 36)}…` : t;
    }
    if (type === "image") return "[图片]";
    if (type === "video") return "[视频]";
    if (type === "forward") return "[嵌套聊天记录]";
    if (type === "json" || type === "xml") return "[卡片消息]";
  }
  return "[消息]";
}

function pickMergeForwardTitle(nodes) {
  const nestedRoots = (nodes || []).filter(
    (n) => Array.isArray(n?._mkNestedChildren) && n._mkNestedChildren.length > 0,
  );
  if (nestedRoots.length >= 5) {
    const names = nestedRoots.map((n) => String(n.name ?? "")).join(" ");
    if (/群管|审核|头衔|骨灰|黑名单|违禁|发言|欢迎|马甲|基础群管/.test(names)) {
      return "MKbot 群管功能目录";
    }
    if (/授权|事件|群管系统|漂流|发卡/.test(names)) {
      return "MKbot 功能介绍";
    }
  }
  for (const n of nodes || []) {
    const name = String(n?.name ?? "").trim();
    const bracket = name.match(/^\[([^\]]+)\]/);
    if (bracket?.[1]) return bracket[1].trim();
    if (Array.isArray(n?._mkNestedChildren)) {
      const nestedName = stripNodeDisplayName(n.name);
      if (nestedName && nestedName !== "MKbot") return nestedName;
    }
  }
  const first = String(nodes?.[0]?.name ?? "").trim();
  if (first === "介绍" || first === "目录") return "MKbot 功能介绍";
  if (first) return stripNodeDisplayName(first);
  return "MKbot";
}

function inferMergeForwardSummary(title, count, isGroup) {
  const t = String(title ?? "");
  if (/MK介绍|功能介绍|功能手册|功能目录/.test(t)) return "点击查看 MKbot 各模块说明与演示";
  if (/群管.*目录|群管功能/.test(t)) return "群管八模块指令与子菜单一览";
  if (/排行榜|统计|发言/.test(t)) return `共 ${count} 条，完整排名见转发`;
  if (/列表|群员|骨灰|黑名单|违禁词|禁言|全员|本群全部/.test(t)) return `共 ${count} 条记录，点击查看详情`;
  if (/结果|操作|执行|提醒|总结|改头衔/.test(t)) return `操作结果（${count} 条）`;
  if (/发卡|商品|商店|卡密/.test(t)) return "商品库存与卡密明细";
  if (/伪造|聊天/.test(t)) return "自定义合并聊天记录预览";
  if (/音乐|歌单/.test(t)) return "音乐点歌与歌单说明";
  if (/空间|动态/.test(t)) return "QQ空间动态合集";
  if (/续火/.test(t)) return "群聊续火管理说明";
  if (/取数据|数据导出|扩展-/.test(t)) return "引用消息结构化数据导出";
  if (/EPIC|游戏|MC|饰品|服务器/.test(t)) return `共 ${count} 条，点击查看详情`;
  if (/文件|文件夹/.test(t)) return `群文件列表（${count} 条）`;
  if (/授权|卡密|群老婆|漂流/.test(t)) return "玩法与授权相关说明";
  if (/入群|记录/.test(t)) return "入群私聊收录内容回放";
  if (/全局|开关|变态/.test(t)) return `全局配置项（${count} 条）`;
  if (/公告|菜单/.test(t)) return `菜单说明（${count} 条）`;
  if (isGroup) return `群聊共 ${count} 条消息`;
  return `查看 ${count} 条转发消息`;
}

/** 根据节点与场景自动生成卡片预览；preview 传入时覆盖对应字段 */
function 构建合并转发预览(nodes, event, preview) {
  if (!Array.isArray(nodes) || nodes.length === 0) {
    return preview && typeof preview === "object" ? preview : 合并预览("MKbot", "聊天记录", "[聊天记录]", []);
  }
  const isGroup = event?.message_type === "group";
  const title = pickMergeForwardTitle(nodes);
  const count = nodes.length;
  let source = title;
  if (/MKbot/.test(title)) {
    source = title;
  } else if (isGroup) {
    source = `${title} · 群聊`;
  }

  const auto = 合并预览(
    source,
    inferMergeForwardSummary(title, count, isGroup),
    "[聊天记录]",
    nodes.slice(0, 4).map((n) => {
      const label = stripNodeDisplayName(n?.name || "用户");
      return `${label}: ${extractLogicalNodePreviewText(n)}`;
    }),
  );

  if (!preview || typeof preview !== "object") return auto;
  return {
    source: preview.source ?? auto.source,
    summary: preview.summary ?? auto.summary,
    prompt: preview.prompt ?? auto.prompt,
    news: preview.news ?? auto.news,
  };
}

function attachForwardPreviewToParams(params, preview) {
  if (!preview || typeof preview !== "object") return params;
  if (preview.source) params.source = preview.source;
  if (preview.summary) params.summary = preview.summary;
  if (preview.prompt) params.prompt = preview.prompt;
  if (Array.isArray(preview.news) && preview.news.length) params.news = preview.news;
  return params;
}

/** 仅图片（可多张） */
function 合并图片节点(name, qq, images, extra = {}) {
  const content = [];
  if (Array.isArray(images)) {
    for (const img of images) content.push(段_图片(img));
  } else if (images) {
    content.push(段_图片(images));
  }
  if (!content.length) content.push(段_文本(""));
  return 合并节点(name, qq, content, extra);
}

function 构建Ob11节点(node, defaultUin) {
  if (node?.id != null && String(node.id).trim() !== "") {
    return {
      type: "node",
      data: {
        id: String(node.id),
        ...mkForwardNodeIdentity(node.name || "用户", node.qq ?? defaultUin),
        ...(node.time != null ? { time: node.time } : {}),
      },
    };
  }

  const uin = String(node?.qq ?? defaultUin);
  const name = node?.name || "用户";

  if (Array.isArray(node?._mkNestedChildren)) {
    const childOb11 = (node._mkNestedChildren || []).map((c) => 构建Ob11节点(c, uin));
    const prefix = Array.isArray(node._mkNestedPrefix) ? node._mkNestedPrefix : [];
    return mkBuildNestedForwardOb11Node(name, uin, childOb11, prefix, {
      time: node?.time,
    });
  }

  let content =
    Array.isArray(node?.content) && node.content.length > 0
      ? node.content
      : [段_文本("")];

  if (mkIsSnowLumaBackend() && Array.isArray(content)) {
    content = mkConvertForwardContentToSnowLuma(content, uin, 构建Ob11节点);
  }

  const data = { ...mkForwardNodeIdentity(name, uin), content };
  if (node?.time != null) data.time = node.time;
  const built = { type: "node", data };
  if (mkIsSnowLumaBackend()) {
    return mkNormalizeOb11NodeTree(built, defaultUin, 构建Ob11节点);
  }
  return built;
}

/**
 * 嵌套合并转发：prefixContent 在前（如标题文本），其后为子节点列表。
 * children 为 { name, qq, content }[]，可递归嵌套。
 * NapCat：content 内 forward id:"0" + 子 node；SnowLuma：content 为纯 node 数组（见 snowluma-compat）。
 */
function 嵌套合并节点(name, qq, children, extra = {}, prefixContent = []) {
  const prefix = Array.isArray(prefixContent) ? prefixContent : [];
  return 合并节点(name, qq, null, {
    ...extra,
    qq,
    _mkNestedChildren: children || [],
    _mkNestedPrefix: prefix,
  });
}

/** 群聊贴小表情（NapCat set_msg_emoji_like；非发消息段） */
async function 设消息表情(messageId, emojiId) {
  const ctx = 当前上下文;
  if (!ctx?.actions) return null;
  const mid = messageId == null ? '' : String(messageId).trim();
  const eid = emojiId == null ? '' : String(emojiId).trim();
  if (!mid || !eid) return null;
  try {
    return await ctx.actions.call(
      'set_msg_emoji_like',
      { message_id: mid, emoji_id: eid, set: true },
      ctx.adapterName,
      ctx.pluginManager.config,
    );
  } catch (error) {
    if (ctx.logger?.warn) {
      ctx.logger.warn('贴表情失败:', error?.message || error);
    }
    return null;
  }
}

// ================== 单发消息（text / image / face 可组合，纯 OB11 JSON 段） ==================
// message: [{ type: "text", data: { text } }, { type: "image", data: { file } }, ...]
// extra.group_id：私聊时附带群号（临时会话）
async function 发消息(event, message, extra = {}) {
  const segments = 规范化消息段(message);
  if (!segments.length) return null;
  const params = 构建发送参数(event, segments);
  if (event.message_type === "private") {
    const gid = extra.group_id ?? event.group_id;
    if (gid != null && String(gid).trim() !== "") {
      const n = Number(gid);
      params.group_id = Number.isFinite(n) ? n : gid;
    }
  }
  return 调用发送(params);
}

// ================== 单发语音（OB11 record 段） ==================
// file: 音频 URL 或本地路径；extra.group_id：私聊临时会话
async function 发语音(event, file, extra = {}) {
  const seg = 段_语音(file);
  if (seg.type !== "record") return null;
  const params = 构建发送参数(event, [seg]);
  if (event.message_type === "private") {
    const gid = extra.group_id ?? event.group_id;
    if (gid != null && String(gid).trim() !== "") {
      const n = Number(gid);
      params.group_id = Number.isFinite(n) ? n : gid;
    }
  }
  return 调用发送(params);
}

// ================== 单发 JSON 卡片 ==================
async function 发卡片(event, json数据) {
  const jsonStr = 规范化Json(json数据);
  if (!jsonStr) return null;
  const params = 构建发送参数(event, [{ type: "json", data: { data: jsonStr } }]);
  return 调用发送(params);
}

// ================== 单发音乐卡片 ==================
async function 发音乐卡片(event, 歌名, 歌手, 封面, 跳转url, 音频url) {
  const title = 必填文本(歌名);
  const content = 必填文本(歌手);
  const image = 媒体路径(必填文本(封面)) || 必填文本(封面);
  const url = 必填文本(跳转url);
  const audio = 必填文本(音频url);
  if (!title || !content || !image || !url || !audio) return null;

  const data = {
    type: "custom",
    url,
    audio,
    title,
    content,
    image,
  };
  const params = 构建发送参数(event, [{ type: "music", data }]);
  return 调用发送(params);
}

// ================== 单发视频 ==================
async function 发视频(event, 封面, 视频, 名称) {
  const 视频地址 = String(视频 || "").trim();
  if (!视频地址) return null;

  const 解析视频 = 媒体路径(视频地址);
  const 解析封面 = 媒体路径(封面);
  const data = {
    file: 解析视频,
  };
  if (解析封面) data.thumb = 解析封面;
  if (名称) data.name = String(名称);

  const params = 构建发送参数(event, [{ type: "video", data }]);
  return 调用发送(params, { throwOnError: true });
}

// ================== 合并转发 ==================
// nodes: [{ name, qq, content: [...] }] 或 [{ id, name, qq }]

/** 合并转发发送耗时：只记慢的，用来定位「耗时是别人两倍」到底花在哪 */
function 合并转发记耗时(ctx, 开始毫秒, 节点数) {
  const 耗时 = Date.now() - 开始毫秒;
  if (耗时 >= 1000) {
    ctx?.logger?.info?.(`[合并转发] 发送耗时 ${耗时}ms（${节点数} 个节点）`);
  }
}

/**
 * 失败时把节点里的媒体形态摘出来（只取前缀，避免把整段 base64 打进日志）。
 * 用于快速判断「是不是本地路径害得整条合并转发被协议端拒绝」。
 */
function 诊断合并节点媒体(params) {
  const list = params?.messages ?? params?.message;
  if (!Array.isArray(list)) return '';
  const hits = [];
  const walk = (content, depth) => {
    if (!Array.isArray(content) || depth > 4) return;
    for (const seg of content) {
      if (!seg || typeof seg !== 'object') continue;
      const type = String(seg.type || '');
      if (['image', 'video', 'record', 'voice', 'file', 'audio'].includes(type)) {
        const f = String(seg?.data?.file ?? '');
        const head = f.length > 48 ? `${f.slice(0, 48)}…` : f;
        hits.push(`${type}=${head || '(空)'}`);
      }
      if (Array.isArray(seg.data?.content)) walk(seg.data.content, depth + 1);
    }
  };
  for (const node of list) {
    walk(node?.data?.content ?? node?.data?.message, 0);
  }
  return hits.length ? hits.slice(0, 8).join(' | ') : '';
}

// preview: 可选，合并预览() 或 构建合并转发预览 的返回值；省略则按节点内容自动生成
async function 发合并消息(event, nodes, preview, opts = {}) {
  const ctx = 当前上下文;
  if (!ctx?.actions || !Array.isArray(nodes) || nodes.length === 0) return false;

  // 优先机器人自身 QQ：合并转发上传时 SnowLuma 需把 UIN 换成 UID
  const defaultUin = event.self_id ?? event.user_id;
  const buildParams = () => {
    const forwardData = nodes.map((n) => 构建Ob11节点(n, defaultUin));
    const isGroup = event.message_type === "group";
    // NapCat 官方文档明确：合并转发三个接口的参数是 messages（复数），不是 message。
    // 之前同时传 message + messages，属于协议外的多余字段（普通 send_msg 才用 message）。
    // 这里只保留 messages；message_type 保留给 send_forward_msg 兜底分支（它需要区分群/私聊）。
    const params = {
      messages: forwardData,
      message_type: event.message_type,
      ...(isGroup
        ? { group_id: String(event.group_id) }
        : { user_id: String(event.user_id) }),
    };
    attachForwardPreviewToParams(params, 构建合并转发预览(nodes, event, preview));
    return { params, isGroup };
  };

  let { params, isGroup } = buildParams();
  const action = isGroup ? "send_group_forward_msg" : "send_private_forward_msg";
  const silent = !!opts.silent;

  const callForward = async (p) => {
    try {
      await ctx.actions.call(action, p, ctx.adapterName, ctx.pluginManager.config);
      return true;
    } catch (error) {
      // 超时是「协议端还在传 / 其实已送达」的假失败，立刻换个 action 重发会变成重复消息
      // （实测弱网下 0.5s 内连发两次：send_group_forward_msg 失败 → send_forward_msg 再发一遍）。
      // 超时直接抛出，不再重试。
      if (isSendTimeoutError(error)) throw error;
      try {
        await ctx.actions.call("send_forward_msg", p, ctx.adapterName, ctx.pluginManager.config);
        return true;
      } catch (error2) {
        throw error2 ?? error;
      }
    }
  };

  const 开始 = Date.now();
  try {
    await callForward(params);
    合并转发记耗时(ctx, 开始, nodes.length);
    return true;
  } catch (error) {
    // 大媒体合并转发（如 30 张图集）协议端要逐个上传媒体，弱网/跨境链路下 2~3 分钟才送达；
    // 框架 120s 等待上限先到 → 报「API 超时」。此时协议端仍在后台上传，消息绝大多数会送达
    // （实测报错后 3 分钟合并转发正常出现在群里）。若在这里当失败处理：
    //   ① ERROR 日志让人误判发送失败；② 上层一旦按 false 补发降级（链接文本/再来一条），
    //      迟到的合并转发 + 补发内容 = 群里收到两份。
    // 所以超时一律「视为已受理」返回成功，日志降为 warn 并说明。
    if (isSendTimeoutError(error)) {
      const 媒体数 = 诊断合并节点媒体(params);
      if (!silent && ctx.logger?.warn) {
        ctx.logger.warn(
          `[合并转发] ${nodes.length} 节点等待回包超时（协议端仍在上传媒体、稍后送达，视为已发送）` +
            (媒体数 ? `｜媒体: ${媒体数}` : '') +
            `｜${error?.message || error}`,
        );
      }
      return true;
    }
    // NapCat 内联嵌套被 SL 拒绝（常只有 retcode=1400）→ 改纯 node 列表重试一次
    const canRetryAsSnowLuma =
      !mkIsSnowLumaBackend() &&
      mkIsForwardMsgParamError(error) &&
      mkForwardParamsHaveNapCatInlineNest(params);
    if (canRetryAsSnowLuma) {
      mkMarkSnowLumaBackend(true, ctx);
      ({ params } = buildParams());
      try {
        await callForward(params);
        合并转发记耗时(ctx, 开始, nodes.length);
        return true;
      } catch (error3) {
        if (!silent && ctx.logger?.error) {
          ctx.logger.error("发送合并消息失败:", error3);
          const 媒体 = 诊断合并节点媒体(params);
          if (媒体) ctx.logger.error("[合并转发] 节点媒体形态:", 媒体);
        }
        return false;
      }
    }
    if (!silent && ctx.logger?.error) {
      ctx.logger.error("发送合并消息失败:" + (mkEnoentLocalFileHint(error) || ""), error);
      const 媒体 = 诊断合并节点媒体(params);
      if (媒体) ctx.logger.error("[合并转发] 节点媒体形态:", 媒体);
    }
    return false;
  }
}

export {
  发视频,
  发语音,
  发卡片,
  发音乐卡片,
  发合并消息,
  发消息,
  设消息表情,
  bindBotCtx,
  isSendTimeoutError,
  段_文本,
  段_图片,
  段_视频,
  段_语音,
  段_文件,
  段_Json,
  段_表情,
  段_引用,
  段_艾特,
  媒体路径,
  段有可用媒体,
  configureMediaInlineLimit,
  configureProtocolLocalRead,
  canProtocolReadLocalFile,
  shouldDownloadMediaForSend,
  shouldClampDownloadToInlineLimit,
  auditMediaConfig,
  configureMediaFetchConcurrency,
  getMediaFetchConcurrency,
  normalizeMediaFetchConcurrency,
  resetMediaFetchConcurrency,
  mapWithConcurrency,
  runThunksWithConcurrency,
  合并节点,
  嵌套合并节点,
  合并引用,
  合并图文节点,
  合并视文节点,
  合并图片节点,
  合并预览,
  构建合并转发预览,
  attachForwardPreviewToParams,
};
