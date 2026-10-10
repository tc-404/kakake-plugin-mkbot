// ---------------------------------------------------------------------------
// 视频解析 API 共用 HTTP 工具（本地 lib/api 模块）
// ---------------------------------------------------------------------------

export const DEFAULT_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/103.0.0.0 Safari/537.36';

export const EDGE_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36 Edg/122.0.0.0';

/**
 * 上游请求超时。
 *
 * 解析链路上任何一次请求都不该无限等待：上游半死不活时，没有超时会让这条
 * HTTP 请求一直挂到 Node 的 requestTimeout（默认 5 分钟），机器人只能干等，
 * 期间还占着一次限速额度。JSON 类响应给 15 秒，页面级请求给 20 秒。
 */
export const FETCH_TIMEOUT_MS = 15000;
export const PAGE_TIMEOUT_MS = 20000;

/** 带超时的 fetch（总时长上限，含读 body），用于 JSON / HTML 这类小响应 */
export function fetchWithTimeout(
  url: string,
  init: RequestInit = {},
  timeoutMs = FETCH_TIMEOUT_MS,
): Promise<Response> {
  const timer = AbortSignal.timeout(timeoutMs);
  if (!init.signal) return fetch(url, { ...init, signal: timer });

  // 调用方自带 signal 时手工合并，避免依赖 AbortSignal.any（Node 20.3+ 才有）
  const ctrl = new AbortController();
  const forward = () => ctrl.abort();
  init.signal.addEventListener('abort', forward, { once: true });
  timer.addEventListener('abort', forward, { once: true });
  return fetch(url, { ...init, signal: ctrl.signal }).finally(() => {
    init.signal?.removeEventListener('abort', forward);
  });
}

/**
 * 一次解析的总时限。
 *
 * 各平台都有「多地址 × 多 UA」的串行重试，上游整体变慢时单次解析可能拖到
 * 几分钟。循环里用 deadline.expired() 提前收手，让用户尽快拿到失败原因。
 */
export interface Deadline {
  /** 是否已超过总时限 */
  expired(): boolean;
  /** 剩余毫秒（不小于 0） */
  leftMs(): number;
}

export function createDeadline(ms: number): Deadline {
  const end = Date.now() + ms;
  return {
    expired: () => Date.now() >= end,
    leftMs: () => Math.max(0, end - Date.now()),
  };
}

export async function fetchText(
  url: string,
  init: RequestInit = {},
  userAgent = DEFAULT_USER_AGENT,
): Promise<string> {
  const headers = new Headers(init.headers);
  if (!headers.has('User-Agent')) {
    headers.set('User-Agent', userAgent);
  }

  const res = await fetchWithTimeout(url, {
    ...init,
    headers,
    redirect: init.redirect ?? 'follow',
  });

  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`);
  }

  return res.text();
}

/** 跟随重定向，返回最终 URL */
export async function followRedirect(
  url: string,
  userAgent = DEFAULT_USER_AGENT,
): Promise<string> {
  const res = await fetchWithTimeout(
    url,
    { method: 'GET', redirect: 'follow', headers: { 'User-Agent': userAgent } },
    PAGE_TIMEOUT_MS,
  );
  return res.url || url;
}

/** 清理 URL 末尾非法字符 */
export function cleanUrlTail(url: string): string {
  return url.replace(/[^\w\-./?=&:#]+$/u, '');
}

/** 域名白名单校验（防 SSRF） */
export function isAllowedDomain(url: string, allowedDomains: string[]): boolean {
  const cleaned = cleanUrlTail(url);
  return allowedDomains.some((allowed) =>
    new RegExp(`https?://[^/]*${allowed.replace(/\./g, '\\.')}`, 'i').test(cleaned),
  );
}

/** 从 HTML 中按 marker 后第一个 `{` 起做括号平衡，提取完整 JSON 字符串 */
export function extractBalancedJsonFrom(html: string, marker: string): string | null {
  const startIdx = html.indexOf(marker);
  if (startIdx < 0) return null;

  const eqIdx = html.indexOf('=', startIdx);
  if (eqIdx < 0) return null;

  const braceStart = html.indexOf('{', eqIdx);
  if (braceStart < 0) return null;

  let depth = 0;
  let inString = false;
  let escape = false;
  let quote = '';

  for (let i = braceStart; i < html.length; i++) {
    const ch = html[i];
    if (inString) {
      if (escape) {
        escape = false;
        continue;
      }
      if (ch === '\\') {
        escape = true;
        continue;
      }
      if (ch === quote) inString = false;
      continue;
    }
    if (ch === '"' || ch === "'") {
      inString = true;
      quote = ch;
      continue;
    }
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) {
        return html.slice(braceStart, i + 1);
      }
    }
  }
  return null;
}
