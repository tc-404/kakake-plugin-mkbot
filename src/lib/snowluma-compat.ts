// @ts-nocheck
// SnowLuma 协议兼容：探测、合并转发嵌套格式、OB11 响应解析、收消息文本提取

/** 插件 config.json → mkbot_protocol_backend: auto | snowluma | napcat */
export type MkProtocolBackendSetting = 'auto' | 'snowluma' | 'napcat';

let configBackend: MkProtocolBackendSetting = 'auto';
/** 探测结果；config 强制 napcat/snowluma 时同步写入 */
let resolvedSnowLuma: boolean | null = null;
const probeCache = new Map<string, boolean>();
/** 同一连接并发探测共用一个 Promise，避免启动瞬间打爆 get_version_info */
const probeInflight = new Map<string, Promise<boolean>>();
let lastProbeCtxKey = '';

function ctxProbeKey(ctx) {
  const fw = ctx?.frameworkEnv;
  const conn = ctx?.connectionId ?? fw?.connectionId ?? '';
  return `${fw?.frameworkId ?? 'unknown'}:${conn}`;
}

export function mkSetProtocolBackendSetting(value) {
  const v = String(value ?? 'auto').trim().toLowerCase();
  if (v === 'snowluma' || v === 'napcat') {
    configBackend = v;
    resolvedSnowLuma = v === 'snowluma';
    return;
  }
  configBackend = 'auto';
  resolvedSnowLuma = null;
}

/** 运行时强制标记协议（换框架 / 发送报错自愈）；config 强制 napcat/snowluma 时不覆盖 */
export function mkMarkSnowLumaBackend(isSnow, ctx = null) {
  if (configBackend === 'napcat' || configBackend === 'snowluma') return;
  const flag = !!isSnow;
  resolvedSnowLuma = flag;
  if (ctx) probeCache.set(ctxProbeKey(ctx), flag);
  else {
    for (const key of probeCache.keys()) probeCache.set(key, flag);
  }
}

export function mkInvalidateProtocolProbeCache() {
  probeCache.clear();
  probeInflight.clear();
  if (configBackend === 'auto') resolvedSnowLuma = null;
}

export function mkIsSnowLumaBackend() {
  if (configBackend === 'snowluma') return true;
  if (configBackend === 'napcat') return false;
  return resolvedSnowLuma === true;
}

export function mkIsSnowLumaBackendForCtx(ctx) {
  if (configBackend === 'snowluma') return true;
  if (configBackend === 'napcat') return false;
  const key = ctxProbeKey(ctx);
  if (probeCache.has(key)) return probeCache.get(key) === true;
  return resolvedSnowLuma === true;
}

/** SnowLuma：node 只能出现在合并转发的 node 列表里（不能跟 text/forward 混排） */
export function mkIsSnowLumaNestedNodeError(err) {
  const msg = String(err?.message ?? err?.error ?? err ?? '');
  return (
    /only valid inside a forward node list/i.test(msg) ||
    (/message segment ["']node["']/i.test(msg) && /forward node list/i.test(msg))
  );
}

/** 合并转发参数错误（咔咔常只透传 retcode=1400，无 SL 原文） */
export function mkIsForwardMsgParamError(err) {
  const msg = String(err?.message ?? err?.error ?? err ?? '');
  if (mkIsSnowLumaNestedNodeError(err)) return true;
  return /retcode\s*=?\s*1400/i.test(msg) || /API\s*失败.*1400/i.test(msg);
}

function contentHasNapCatInlineNest(content, depth = 0) {
  if (!Array.isArray(content) || depth > 8) return false;
  let hasForward0 = false;
  let hasNode = false;
  for (const seg of content) {
    if (!seg || typeof seg !== 'object') continue;
    if (isNapCatInlineForwardMarker(seg)) hasForward0 = true;
    if (isOb11NodeSegment(seg)) {
      hasNode = true;
      if (contentHasNapCatInlineNest(seg.data?.content ?? seg.data?.message, depth + 1)) {
        return true;
      }
    }
  }
  return hasForward0 && hasNode;
}

/** 已构建的 messages 是否含 NapCat「forward id:0 + 子 node」内联嵌套 */
export function mkForwardParamsHaveNapCatInlineNest(params) {
  const list = params?.messages ?? params?.message;
  if (!Array.isArray(list)) return false;
  for (const n of list) {
    if (contentHasNapCatInlineNest(n?.data?.content ?? n?.data?.message ?? n?.content)) {
      return true;
    }
  }
  return false;
}

function looksLikeSnowLumaAppName(appName) {
  const s = String(appName ?? '').toLowerCase();
  return s.includes('snowluma') || s.includes('snow-luma') || s.includes('snow_luma');
}

function isOb11NodeSegment(seg) {
  return seg && typeof seg === 'object' && String(seg.type ?? '').toLowerCase() === 'node';
}

/** SnowLuma：node.content 须为纯 {type:node}[] 才识别为嵌套合并 */
export function mkIsPureOb11NodeArray(content) {
  if (!Array.isArray(content) || content.length === 0) return false;
  for (const item of content) {
    if (!isOb11NodeSegment(item)) return false;
  }
  return true;
}

/**
 * 合并转发节点发送者字段：同时带 name/nickname、uin/user_id。
 * SnowLuma 解析优先 user_id / nickname，也认 uin / name。
 */
export function mkForwardNodeIdentity(displayName, uin) {
  const name = String(displayName || '用户');
  const id = String(uin ?? '');
  return {
    name,
    nickname: name,
    uin: id,
    user_id: id,
  };
}

function isNapCatInlineForwardMarker(seg) {
  return (
    seg &&
    typeof seg === 'object' &&
    String(seg.type ?? '').toLowerCase() === 'forward' &&
    String(seg.data?.id ?? '') === '0'
  );
}

/**
 * 将 NapCat 内联嵌套（prefix + forward id:0 + node…）转为 SnowLuma 纯 node 数组。
 * buildOb11Node: (logicalNode, defaultUin) => { type:'node', data }
 */
export function mkConvertForwardContentToSnowLuma(content, defaultUin, buildOb11Node) {
  if (!Array.isArray(content)) return content;
  if (mkIsPureOb11NodeArray(content)) {
    return content.map((n) => mkNormalizeOb11NodeTree(n, defaultUin, buildOb11Node));
  }

  const prefix = [];
  const inlineNodes = [];
  let i = 0;
  let sawInlineForward = false;

  for (; i < content.length; i++) {
    const seg = content[i];
    if (isNapCatInlineForwardMarker(seg)) {
      sawInlineForward = true;
      i++;
      break;
    }
    prefix.push(seg);
  }

  if (sawInlineForward) {
    for (; i < content.length; i++) {
      const seg = content[i];
      if (isOb11NodeSegment(seg)) inlineNodes.push(seg);
    }
    const out = [];
    if (prefix.length) {
      out.push({
        type: 'node',
        data: {
          ...mkForwardNodeIdentity('用户', defaultUin),
          content: prefix,
        },
      });
    }
    for (const n of inlineNodes) {
      out.push(mkNormalizeOb11NodeTree(n, defaultUin, buildOb11Node));
    }
    return out.length
      ? out
      : [{ type: 'node', data: { ...mkForwardNodeIdentity('用户', defaultUin), content: [段_文本('')] } }];
  }

  return content;
}

function 段_文本(text) {
  return { type: 'text', data: { text: String(text ?? '') } };
}

/** 递归规范化已构建的 OB11 node 树（内层 NapCat 嵌套 → SnowLuma） */
export function mkNormalizeOb11NodeTree(ob11Node, defaultUin, buildOb11Node) {
  if (!isOb11NodeSegment(ob11Node)) return ob11Node;
  const data = ob11Node.data && typeof ob11Node.data === 'object' ? { ...ob11Node.data } : {};
  const uin = String(data.uin ?? data.user_id ?? defaultUin);
  let content = data.content ?? data.message ?? [];

  if (Array.isArray(data._mkNestedChildren)) {
    const childOb11 = (data._mkNestedChildren || []).map((c) =>
      buildOb11Node(c, uin),
    );
    const prefix = Array.isArray(data._mkNestedPrefix) ? data._mkNestedPrefix : [];
    content = [];
    if (prefix.length) {
      content.push({
        type: 'node',
        data: {
          ...mkForwardNodeIdentity(data.name || data.nickname || '用户', uin),
          content: prefix,
        },
      });
    }
    content.push(...childOb11);
  } else if (Array.isArray(content)) {
    content = mkConvertForwardContentToSnowLuma(content, uin, buildOb11Node);
  }

  const cleaned = { ...data };
  delete cleaned._mkNestedChildren;
  delete cleaned._mkNestedPrefix;
  const displayName = cleaned.name || cleaned.nickname || '用户';

  return {
    type: 'node',
    data: {
      ...cleaned,
      ...mkForwardNodeIdentity(displayName, uin),
      content,
    },
  };
}

/** 构建嵌套合并 OB11 node（按当前协议分支） */
export function mkBuildNestedForwardOb11Node(name, uin, childOb11Nodes, prefixContent, extra = {}) {
  const displayName = name || '用户';
  const qq = String(uin);
  const identity = mkForwardNodeIdentity(displayName, qq);

  if (mkIsSnowLumaBackend()) {
    const content = [];
    if (Array.isArray(prefixContent) && prefixContent.length) {
      content.push({
        type: 'node',
        data: { ...identity, content: prefixContent },
      });
    }
    content.push(...childOb11Nodes);
    const data = { ...identity, content };
    if (extra.time != null) data.time = extra.time;
    return { type: 'node', data };
  }

  const content = [
    ...(Array.isArray(prefixContent) ? prefixContent : []),
    { type: 'forward', data: { id: '0' } },
    ...childOb11Nodes,
  ];
  const data = { ...identity, content };
  if (extra.time != null) data.time = extra.time;
  return { type: 'node', data };
}

/** SnowLuma / OB11 标准响应取 data 层 */
export function mkExtractBotApiPayload(result) {
  if (result == null) return result;
  if (typeof result !== 'object') return result;
  if (Array.isArray(result)) return result;
  if (result.data != null && (result.retcode != null || result.status != null)) {
    return result.data;
  }
  return result;
}

/** get_version_info 探测是否为 SnowLuma（按连接缓存，避免每条消息打 API 刷屏） */
export async function mkProbeSnowLumaBackend(ctx, callAction) {
  if (configBackend === 'snowluma') {
    resolvedSnowLuma = true;
    return true;
  }
  if (configBackend === 'napcat') {
    resolvedSnowLuma = false;
    return false;
  }

  const key = ctxProbeKey(ctx);
  mkSyncProtocolBackendFromFramework(ctx);
  if (configBackend === 'snowluma' || resolvedSnowLuma === true) {
    probeCache.set(key, true);
    resolvedSnowLuma = true;
    return true;
  }
  if (probeCache.has(key)) {
    resolvedSnowLuma = probeCache.get(key) === true;
    return resolvedSnowLuma;
  }
  if (probeInflight.has(key)) {
    return probeInflight.get(key);
  }

  const job = (async () => {
    try {
      const raw = await callAction('get_version_info', {});
      const info = mkExtractBotApiPayload(raw) ?? raw;
      const appName = String(info?.app_name ?? info?.appName ?? '');
      const isSnow = looksLikeSnowLumaAppName(appName);
      probeCache.set(key, isSnow);
      resolvedSnowLuma = isSnow;
      lastProbeCtxKey = key;
      return isSnow;
    } catch (_e) {
      // 探测失败不写死 false 进缓存，下次仍可再试；仅当全局尚无结论时暂当 NapCat
      if (lastProbeCtxKey === key || resolvedSnowLuma == null) {
        resolvedSnowLuma = false;
      }
      return resolvedSnowLuma === true;
    } finally {
      probeInflight.delete(key);
    }
  })();

  probeInflight.set(key, job);
  return job;
}

export async function mkEnsureProtocolBackend(ctx, callAction) {
  mkSyncProtocolBackendFromFramework(ctx);
  if (configBackend !== 'auto') return mkIsSnowLumaBackend();
  return mkProbeSnowLumaBackend(ctx, callAction);
}

/** NapCat Desktop bot.json backend_type:snowluma 等宿主提示 */
export function mkSyncProtocolBackendFromFramework(ctx) {
  const fw = ctx?.frameworkEnv;
  if (!fw || typeof fw !== 'object') return;
  const hint = String(
    fw.protocolBackend ?? fw.backendType ?? fw.backend_type ?? fw.obBackend ?? '',
  ).toLowerCase();
  const fwId = String(fw.frameworkId ?? fw.framework ?? fw.name ?? '').toLowerCase();
  const component = String(fw.component ?? fw.componentPath ?? fw.protocolPath ?? '').toLowerCase();
  if (
    hint === 'snowluma' ||
    hint.includes('snowluma') ||
    fwId.includes('snowluma') ||
    component.includes('snowluma')
  ) {
    // 仅在 auto 下提升为 snowluma，避免覆盖用户强制 napcat
    if (configBackend === 'auto') {
      resolvedSnowLuma = true;
      probeCache.set(ctxProbeKey(ctx), true);
    } else if (configBackend === 'snowluma') {
      resolvedSnowLuma = true;
    }
  }
}

/** SnowLuma 上报 HTML 实体解码 */
export function decodeObHtmlEntities(text) {
  return String(text ?? '')
    .replace(/&#(\d+);/g, (_, n) => {
      const code = parseInt(n, 10);
      return Number.isFinite(code) ? String.fromCharCode(code) : _;
    })
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => {
      const code = parseInt(h, 16);
      return Number.isFinite(code) ? String.fromCharCode(code) : _;
    })
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

/**
 * 提取纯文本指令内容。
 * 优先 OB11 message 数组中的 text 段；禁止用 raw_message / CQ 码判断（CQ 会把 @ 等膨胀，导致「贴贴@人」匹配失败）。
 */
export function resolveEventPlainMessage(event) {
  if (Array.isArray(event?.message)) {
    let fromSegs = '';
    for (const seg of event.message) {
      if (!seg || typeof seg !== 'object') continue;
      if (seg.type === 'text' && seg.data?.text != null) {
        fromSegs += decodeObHtmlEntities(String(seg.data.text));
      }
    }
    return fromSegs;
  }
  if (typeof event?.message === 'string' && event.message.trim()) {
    return decodeObHtmlEntities(event.message);
  }
  // 无结构化 message 时才回退；仍不解析 CQ，仅作兜底原文
  return decodeObHtmlEntities(String(event?.raw_message ?? ''));
}

/** 违禁词检测：跳过 image/video，其余段从 OB11 message JSON 提取可见文本（不扫 CQ/raw/url） */
const FORBIDDEN_WORD_SKIP_SEG_TYPES = new Set(['image', 'video']);

function pushForbiddenWordTextPart(parts: string[], value: unknown) {
  if (value == null) return;
  const text = decodeObHtmlEntities(String(value));
  if (text) parts.push(text);
}

function extractJsonSegmentVisibleText(data: unknown): string {
  if (data == null) return '';
  let obj: Record<string, unknown> | null = null;
  if (typeof data === 'string') {
    const trimmed = data.trim();
    if (!trimmed) return '';
    try {
      const parsed = JSON.parse(trimmed);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) obj = parsed as Record<string, unknown>;
      else return decodeObHtmlEntities(trimmed);
    } catch {
      return decodeObHtmlEntities(trimmed);
    }
  } else if (typeof data === 'object' && !Array.isArray(data)) {
    obj = data as Record<string, unknown>;
  }
  if (!obj) return '';
  const parts: string[] = [];
  const dataField = obj.data;
  if (typeof dataField === 'string' && dataField.trim()) {
    try {
      const inner = JSON.parse(dataField);
      if (inner && typeof inner === 'object' && !Array.isArray(inner)) {
        obj = inner as Record<string, unknown>;
      }
    } catch {
      return decodeObHtmlEntities(dataField);
    }
  } else if (dataField && typeof dataField === 'object' && !Array.isArray(dataField)) {
    obj = dataField as Record<string, unknown>;
  }
  for (const key of ['text', 'title', 'content', 'desc', 'prompt', 'summary', 'keyword']) {
    pushForbiddenWordTextPart(parts, obj[key]);
  }
  const nested = obj.data;
  if (nested && typeof nested === 'object' && !Array.isArray(nested)) {
    for (const key of ['text', 'title', 'content', 'desc', 'prompt', 'summary']) {
      pushForbiddenWordTextPart(parts, (nested as Record<string, unknown>)[key]);
    }
  }
  return parts.join('\n');
}

function extractFaceSegmentText(data: Record<string, unknown>): string {
  const parts: string[] = [];
  pushForbiddenWordTextPart(parts, data.faceText);
  const raw = data.raw;
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    pushForbiddenWordTextPart(parts, (raw as Record<string, unknown>).faceText);
  }
  return parts.join('\n');
}

/** 群管/问答/发言限制等：仅从 OB11 text 段提取用户输入（不含 CQ/raw/url/其它段） */
export function eventUserTextFromSegments(event: unknown): string {
  const e = event as { message?: unknown };
  if (Array.isArray(e?.message)) {
    const parts: string[] = [];
    for (const seg of e.message) {
      if (!seg || typeof seg !== 'object') continue;
      const typed = seg as { type?: string; data?: { text?: unknown } };
      if (typed.type === 'text' && typed.data?.text != null) {
        pushForbiddenWordTextPart(parts, typed.data.text);
      }
    }
    return parts.join('');
  }
  if (typeof e?.message === 'string') {
    const s = decodeObHtmlEntities(e.message);
    if (s && !/\[CQ:/i.test(s)) return s;
  }
  return '';
}

/** 从 OB11 message 段数组拼接违禁词匹配用文本 */
export function collectForbiddenWordMatchText(segments: unknown): string {
  if (!Array.isArray(segments)) return '';
  const parts: string[] = [];

  for (const seg of segments) {
    if (!seg || typeof seg !== 'object') continue;
    const typed = seg as {
      type?: string;
      data?: Record<string, unknown>;
      message?: unknown;
    };
    const type = String(typed.type ?? '').toLowerCase();
    const data = typed.data && typeof typed.data === 'object' ? typed.data : {};

    if (FORBIDDEN_WORD_SKIP_SEG_TYPES.has(type)) continue;

    if (type === 'text') {
      pushForbiddenWordTextPart(parts, data.text);
      continue;
    }
    if (type === 'face') {
      const faceText = extractFaceSegmentText(data);
      if (faceText) parts.push(faceText);
      continue;
    }
    if (type === 'json' || type === 'xml') {
      const jsonText = extractJsonSegmentVisibleText(data);
      if (jsonText) parts.push(jsonText);
      continue;
    }
    if (type === 'forward' || type === 'node') {
      if (Array.isArray(data.content)) parts.push(collectForbiddenWordMatchText(data.content));
      continue;
    }
    if (Array.isArray(typed.message)) {
      parts.push(collectForbiddenWordMatchText(typed.message));
    }
  }

  return parts.filter(Boolean).join('\n');
}

/** 从事件对象提取违禁词匹配文本（仅 OB11 JSON 段；string 消息仅接受无 CQ 的纯文本） */
export function eventForbiddenWordMatchText(event: unknown): string {
  const e = event as { message?: unknown };
  if (Array.isArray(e?.message)) {
    return collectForbiddenWordMatchText(e.message);
  }
  if (typeof e?.message === 'string') {
    const s = decodeObHtmlEntities(e.message);
    if (s && !/\[CQ:/i.test(s)) return s;
  }
  return '';
}

export function forbiddenWordsMatchText(haystack: unknown, words: unknown): boolean {
  const hay = String(haystack ?? '');
  if (!hay || !Array.isArray(words) || words.length === 0) return false;
  for (const word of words) {
    const key = String(word ?? '');
    if (key && hay.includes(key)) return true;
  }
  return false;
}

export function eventMessagePlainText(event) {
  const parts = [];
  const raw = decodeObHtmlEntities(String(event?.raw_message ?? '').trim());
  if (raw) parts.push(raw);
  const segText = resolveEventPlainMessage(event);
  if (segText && segText !== raw) parts.push(segText);
  if (Array.isArray(event?.message)) {
    for (const seg of event.message) {
      if (!seg || typeof seg !== 'object') continue;
      const t = String(seg.type || '');
      if (t === 'json' || t === 'xml') {
        try {
          parts.push(JSON.stringify(seg.data ?? {}));
        } catch {
          parts.push(String(seg.data ?? ''));
        }
      }
    }
  }
  return parts.join('\n');
}

export function isQqRedPacketLikeEvent(event) {
  const hay = eventMessagePlainText(event);
  if (/QQ红包|qq红包|红包/i.test(hay)) return true;
  const raw0 = String(event?.raw_message ?? '');
  const emptyLegacy =
    raw0 === '' && (!event?.message || (Array.isArray(event.message) && event.message.length === 0));
  return emptyLegacy;
}

/** OB11 参数：SnowLuma 对 message_id 等字段类型一致，保持数字规范化 */
export function normalizeObActionParams(params) {
  if (!params || typeof params !== 'object' || Array.isArray(params)) return params;
  const p = { ...params };
  for (const k of ['group_id', 'user_id', 'message_id']) {
    if (p[k] == null || p[k] === '') continue;
    // set_group_kick_members 等接口要求 user_id 为数组；
    // Number([123]) === 123，绝不能把数组压成标量（否则 SnowLuma retcode=1400）
    if (Array.isArray(p[k])) {
      p[k] = p[k].map((item) => {
        const n = Number(item);
        return Number.isFinite(n) ? n : item;
      });
      continue;
    }
    const n = Number(p[k]);
    if (Number.isFinite(n)) p[k] = n;
  }
  return p;
}

/**
 * 入群私聊等：segments 中含 forward 子段时，按协议写入 content。
 * flatPrefix：forward 之前的平铺段；forwardChildren：已构建的 OB11 node 列表。
 */
export function mkAppendInlineForwardToContent(flatPrefix, forwardChildren, defaultUin, displayName) {
  if (mkIsSnowLumaBackend()) {
    const nodes = [];
    if (Array.isArray(flatPrefix) && flatPrefix.length) {
      nodes.push({
        type: 'node',
        data: {
          ...mkForwardNodeIdentity(displayName || '用户', defaultUin),
          content: flatPrefix,
        },
      });
    }
    if (Array.isArray(forwardChildren)) nodes.push(...forwardChildren);
    return nodes.length ? nodes : [{ type: 'text', data: { text: '' } }];
  }
  const out = [...(flatPrefix || [])];
  out.push({ type: 'forward', data: { id: '0' } });
  if (Array.isArray(forwardChildren)) out.push(...forwardChildren);
  return out.length ? out : [{ type: 'text', data: { text: '' } }];
}

// ---------------------------------------------------------------------------
// 协议响应字段双端兼容（NapCat NT / OB11 示例 ↔ SnowLuma OB11）
// 在 BOTAPI 出口统一补齐别名，调用侧可读 uin/nick 或 user_id/nickname。
// ---------------------------------------------------------------------------

function mkPickFirst(...vals) {
  for (const v of vals) {
    if (v === undefined || v === null || v === '') continue;
    return v;
  }
  return undefined;
}

function mkNumOrUndef(...vals) {
  const v = mkPickFirst(...vals);
  if (v === undefined) return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

/** 用户标识：user_id ↔ uin */
export function mkCompatUserId(obj) {
  if (!obj || typeof obj !== 'object') return '';
  const v = mkPickFirst(obj.user_id, obj.uin, obj.userId);
  return v == null ? '' : String(v);
}

/** 昵称：nickname ↔ nick ↔ nick_name */
export function mkCompatNickname(obj) {
  if (!obj || typeof obj !== 'object') return '';
  return String(mkPickFirst(obj.nickname, obj.nick, obj.nick_name, obj.name) ?? '');
}

/** 禁言结束时间戳（秒）：shut_up_time ↔ shutUpTime ↔ shut_up_timestamp */
export function mkCompatShutUpTime(obj) {
  if (!obj || typeof obj !== 'object') return 0;
  const n = mkNumOrUndef(obj.shut_up_time, obj.shutUpTime, obj.shut_up_timestamp);
  return n != null && n > 0 ? n : 0;
}

export function mkNormalizeShutListItem(m) {
  if (!m || typeof m !== 'object' || Array.isArray(m)) return m;
  const user_id = mkPickFirst(m.user_id, m.uin);
  const nickname = mkCompatNickname(m);
  const shut_up_time = mkCompatShutUpTime(m);
  return {
    ...m,
    user_id,
    uin: mkPickFirst(m.uin, user_id),
    nickname,
    nick: mkPickFirst(m.nick, nickname),
    nick_name: mkPickFirst(m.nick_name, nickname),
    shut_up_time,
    shutUpTime: mkPickFirst(m.shutUpTime, shut_up_time),
    shut_up_timestamp: mkPickFirst(m.shut_up_timestamp, shut_up_time),
  };
}

export function mkNormalizeStrangerInfo(m) {
  if (!m || typeof m !== 'object' || Array.isArray(m)) return m;
  const user_id = mkPickFirst(m.user_id, m.uin);
  const nickname = mkCompatNickname(m);
  const qqLevel = mkPickFirst(m.qqLevel, m.qq_level, m.level);
  const regTime = mkPickFirst(m.regTime, m.reg_time);
  const longNick = mkPickFirst(m.longNick, m.long_nick, m.sign, m.personal_note);
  return {
    ...m,
    user_id,
    uin: mkPickFirst(m.uin, user_id),
    nickname,
    nick: mkPickFirst(m.nick, nickname),
    qqLevel,
    qq_level: mkPickFirst(m.qq_level, qqLevel),
    level: mkPickFirst(m.level, qqLevel),
    regTime,
    reg_time: mkPickFirst(m.reg_time, regTime),
    longNick,
    long_nick: mkPickFirst(m.long_nick, longNick),
  };
}

export function mkNormalizeGroupMember(m) {
  if (!m || typeof m !== 'object' || Array.isArray(m)) return m;
  const user_id = mkPickFirst(m.user_id, m.uin);
  const nickname = mkCompatNickname(m);
  const card = mkPickFirst(m.card, m.cardName, '');
  const title = mkPickFirst(m.title, m.memberSpecialTitle, '');
  const shut = mkCompatShutUpTime(m);
  const qqLevel = mkPickFirst(m.qq_level, m.qqLevel);
  return {
    ...m,
    group_id: mkPickFirst(m.group_id, m.groupCode),
    user_id,
    uin: mkPickFirst(m.uin, user_id),
    nickname,
    nick: mkPickFirst(m.nick, nickname),
    card,
    cardName: mkPickFirst(m.cardName, card),
    title,
    memberSpecialTitle: mkPickFirst(m.memberSpecialTitle, title),
    qq_level: qqLevel,
    qqLevel: mkPickFirst(m.qqLevel, qqLevel),
    shut_up_timestamp: mkPickFirst(m.shut_up_timestamp, shut || undefined),
    shutUpTime: mkPickFirst(m.shutUpTime, shut || undefined),
    shut_up_time: mkPickFirst(m.shut_up_time, shut || undefined),
    join_time: mkPickFirst(m.join_time, m.joinTime),
    last_sent_time: mkPickFirst(m.last_sent_time, m.lastSpeakTime, m.lastSentTime),
  };
}

export function mkNormalizeGroupInfo(g) {
  if (!g || typeof g !== 'object' || Array.isArray(g)) return g;
  return {
    ...g,
    group_id: mkPickFirst(g.group_id, g.groupCode, g.group_code),
    group_name: mkPickFirst(g.group_name, g.groupName),
    member_count: mkPickFirst(g.member_count, g.memberCount),
    max_member_count: mkPickFirst(g.max_member_count, g.maxMember, g.max_member),
    group_all_shut: mkPickFirst(g.group_all_shut, g.groupAllShut, 0),
    group_remark: mkPickFirst(g.group_remark, g.remarkName, g.groupRemark, ''),
    ownerUin: mkPickFirst(g.ownerUin, g.owner_uin, g.owner_id),
    groupCreateTime: mkPickFirst(g.groupCreateTime, g.group_create_time, g.create_time),
    richFingerMemo: mkPickFirst(g.richFingerMemo, g.rich_finger_memo, g.groupMemo, g.fingerMemo),
  };
}

export function mkNormalizeLoginInfo(info) {
  if (!info || typeof info !== 'object' || Array.isArray(info)) return info;
  const user_id = mkPickFirst(info.user_id, info.uin);
  const nickname = mkCompatNickname(info) || String(mkPickFirst(info.user_name, '') ?? '');
  return {
    ...info,
    user_id,
    uin: mkPickFirst(info.uin, user_id),
    nickname,
    nick: mkPickFirst(info.nick, nickname),
    user_name: mkPickFirst(info.user_name, nickname),
  };
}

export function mkNormalizeFriendInfo(f) {
  if (!f || typeof f !== 'object' || Array.isArray(f)) return f;
  const user_id = mkPickFirst(f.user_id, f.uin);
  const nickname = mkCompatNickname(f);
  return {
    ...f,
    user_id,
    uin: mkPickFirst(f.uin, user_id),
    nickname,
    nick: mkPickFirst(f.nick, nickname),
    remark: mkPickFirst(f.remark, ''),
  };
}

export function mkNormalizeImageInfo(img) {
  if (!img || typeof img !== 'object' || Array.isArray(img)) return img;
  const url = mkPickFirst(img.url, img.file);
  const file_size = mkPickFirst(img.file_size, img.size);
  return {
    ...img,
    url,
    file: mkPickFirst(img.file, url),
    file_size,
    size: mkPickFirst(img.size, file_size),
    file_name: mkPickFirst(img.file_name, img.filename, img.name),
  };
}

export function mkNormalizeFileEntry(f) {
  if (!f || typeof f !== 'object' || Array.isArray(f)) return f;
  const file_size = mkPickFirst(f.file_size, f.size);
  return {
    ...f,
    file_size,
    size: mkPickFirst(f.size, file_size),
    uploader: mkPickFirst(f.uploader, f.uploader_uin),
    uploader_name: mkPickFirst(f.uploader_name, f.uploaderName),
  };
}

export function mkNormalizeFolderEntry(f) {
  if (!f || typeof f !== 'object' || Array.isArray(f)) return f;
  const folder_id = mkPickFirst(f.folder_id, f.folder);
  return {
    ...f,
    folder_id,
    folder: mkPickFirst(f.folder, folder_id),
    folder_name: mkPickFirst(f.folder_name, f.folderName),
    create_name: mkPickFirst(f.create_name, f.creator_name),
    creator_name: mkPickFirst(f.creator_name, f.create_name),
    creator: mkPickFirst(f.creator, f.creator_uin),
  };
}

export function mkNormalizeGroupFilesPayload(data) {
  if (!data || typeof data !== 'object') return data;
  if (Array.isArray(data)) return data;
  return {
    ...data,
    files: Array.isArray(data.files) ? data.files.map(mkNormalizeFileEntry) : data.files,
    folders: Array.isArray(data.folders) ? data.folders.map(mkNormalizeFolderEntry) : data.folders,
  };
}

export function mkNormalizeVersionInfo(info) {
  if (!info || typeof info !== 'object' || Array.isArray(info)) return info;
  return {
    ...info,
    app_name: mkPickFirst(info.app_name, info.appName),
    app_version: mkPickFirst(info.app_version, info.appVersion),
    protocol_version: mkPickFirst(info.protocol_version, info.protocolVersion),
  };
}

export function mkNormalizeSender(sender) {
  if (!sender || typeof sender !== 'object' || Array.isArray(sender)) return sender;
  const user_id = mkPickFirst(sender.user_id, sender.uin);
  const nickname = mkCompatNickname(sender);
  return {
    ...sender,
    user_id,
    uin: mkPickFirst(sender.uin, user_id),
    nickname,
    nick: mkPickFirst(sender.nick, nickname),
    card: mkPickFirst(sender.card, sender.cardName, ''),
  };
}

export function mkNormalizeMessageInfo(msg) {
  if (!msg || typeof msg !== 'object' || Array.isArray(msg)) return msg;
  const user_id = mkPickFirst(msg.user_id, msg.uin, msg.sender?.user_id, msg.sender?.uin);
  return {
    ...msg,
    user_id,
    uin: mkPickFirst(msg.uin, user_id),
    message_id: mkPickFirst(msg.message_id, msg.messageId, msg.real_id),
    group_id: mkPickFirst(msg.group_id, msg.groupId),
    group_name: mkPickFirst(msg.group_name, msg.groupName),
    sender: mkNormalizeSender(msg.sender),
  };
}

/** get_forward_msg：统一成 { messages: [...] }，条目兼容 node 包装与扁平消息 */
export function mkNormalizeForwardMsgPayload(data) {
  if (data == null) return data;
  let messages = [];
  if (Array.isArray(data)) {
    messages = data;
  } else if (data && typeof data === 'object') {
    if (Array.isArray(data.messages)) messages = data.messages;
    else if (Array.isArray(data.data)) messages = data.data;
  }
  const normalized = messages.map((item) => {
    if (!item || typeof item !== 'object') return item;
    if (String(item.type || '').toLowerCase() === 'node') {
      const d = item.data && typeof item.data === 'object' ? item.data : {};
      const user_id = mkPickFirst(d.user_id, d.uin);
      const nickname = mkCompatNickname(d);
      return {
        ...item,
        data: {
          ...d,
          user_id,
          uin: mkPickFirst(d.uin, user_id),
          nickname,
          nick: mkPickFirst(d.nick, nickname),
          message: d.message ?? d.content,
          content: d.content ?? d.message,
        },
      };
    }
    return mkNormalizeMessageInfo(item);
  });
  if (data && typeof data === 'object' && !Array.isArray(data)) {
    return { ...data, messages: normalized };
  }
  return { messages: normalized };
}

export function mkNormalizeSendResult(data) {
  if (data == null) return data;
  if (typeof data !== 'object' || Array.isArray(data)) return data;
  const message_id = mkPickFirst(data.message_id, data.messageId);
  return {
    ...data,
    message_id,
    messageId: mkPickFirst(data.messageId, message_id),
  };
}

/**
 * 按 action 规范化 BOTAPI data 层（NapCat ↔ SnowLuma 字段别名）。
 * 未知 action：原样返回。
 */
export function mkNormalizeApiData(action, data) {
  const name = String(action || '')
    .trim()
    .replace(/_(async|rate_limited)$/i, '');
  if (data == null) return data;

  switch (name) {
    case 'get_group_shut_list':
      return Array.isArray(data) ? data.map(mkNormalizeShutListItem) : data;
    case 'get_stranger_info':
      return mkNormalizeStrangerInfo(data);
    case 'get_group_member_info':
      return mkNormalizeGroupMember(data);
    case 'get_group_member_list':
      return Array.isArray(data) ? data.map(mkNormalizeGroupMember) : data;
    case 'get_friend_list':
    case 'get_friends_with_category':
      return Array.isArray(data) ? data.map(mkNormalizeFriendInfo) : data;
    case 'get_group_list':
      return Array.isArray(data) ? data.map(mkNormalizeGroupInfo) : data;
    case 'get_group_info':
    case 'get_group_detail_info':
    case 'get_group_info_ex':
      return mkNormalizeGroupInfo(data);
    case 'get_login_info':
      return mkNormalizeLoginInfo(data);
    case 'get_image':
    case 'get_record':
    case 'get_file':
      return mkNormalizeImageInfo(data);
    case 'get_group_root_files':
    case 'get_group_files_by_folder':
      return mkNormalizeGroupFilesPayload(data);
    case 'get_version_info':
      return mkNormalizeVersionInfo(data);
    case 'get_msg':
      return mkNormalizeMessageInfo(data);
    case 'get_forward_msg':
      return mkNormalizeForwardMsgPayload(data);
    case 'send_group_msg':
    case 'send_private_msg':
    case 'send_msg':
    case 'send_group_forward_msg':
    case 'send_private_forward_msg':
    case 'send_forward_msg':
      return mkNormalizeSendResult(data);
    default:
      return data;
  }
}

/**
 * 统一 BOTAPI 出口形态：
 * - 成功的列表类：返回规范化后的数组（保证 .length / [i]）
 * - OB11 包装对象：保留 retcode/status，data 规范化，并把对象字段提升到顶层（dp.nick / dp.data.nick 均可）
 * - 已解包：直接返回规范化结果
 */
export function mkAdaptBotApiResult(action, result) {
  if (result === undefined) return result;

  const wrapped =
    result &&
    typeof result === 'object' &&
    !Array.isArray(result) &&
    (Object.prototype.hasOwnProperty.call(result, 'retcode') ||
      Object.prototype.hasOwnProperty.call(result, 'status'));

  const rawData = mkExtractBotApiPayload(result);
  const normalized = mkNormalizeApiData(action, rawData);

  if (!wrapped) {
    return normalized;
  }

  const out = { ...result, data: normalized };
  if (normalized && typeof normalized === 'object' && !Array.isArray(normalized)) {
    Object.assign(out, normalized);
  }

  // 读列表成功时优先返回数组，兼容历史 dp.length / for 循环
  if (Array.isArray(normalized) && (result.retcode == null || Number(result.retcode) === 0)) {
    return normalized;
  }

  return out;
}
