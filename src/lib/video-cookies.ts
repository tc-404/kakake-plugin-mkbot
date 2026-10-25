// ---------------------------------------------------------------------------
// 视频解析平台 Cookie 存储 / 续期
//
// 设计：
//   · 用户在 WebUI「视频解析」页粘贴各平台登录后的 Cookie（可只给小号）
//   · 持久化在数据目录的「视频解析Cookie.json」（readB/writeB 体系，与其它配置同源）
//   · 解析时由 loader 透传给 lib/api/*.mjs，各平台请求头自动携带
//   · 「刷新」= 用当前 Cookie 请求平台轻量端点，把响应 Set-Cookie 合并回存，
//     让服务端滚动续期（a1 / did / buvid 这类设备 Cookie 都会翻新）
//
// 失效判定：
//   · 哔哩哔哩 nav 接口 code!==0 或 data.isLogin=false → Cookie 失效
//   · 其余平台以「HTTP 200 且 Set-Cookie 里仍有会话键」为准，无法严格判定登录态
// ---------------------------------------------------------------------------

import { fetchText } from './api/http-utils';

export const VIDEO_COOKIE_FILE = '视频解析Cookie.json';
export const VIDEO_COOKIE_UPDATED_KEY = '更新时间';

/** 顺序即 WebUI 展示顺序 */
export const VIDEO_COOKIE_PLATFORMS = ['哔哩哔哩', '抖音', '小红书', '快手'] as const;
export type VideoCookiePlatform = (typeof VIDEO_COOKIE_PLATFORMS)[number];

type ReadB = (file: string, key: string, def?: unknown) => unknown;
type WriteB = (file: string, key: string, value: unknown) => void;
type MkLogger = { info?: (...a: unknown[]) => void; warn?: (...a: unknown[]) => void };

/** 各平台登录 Cookie 对应的会话键（用于判定“看起来还有效”） */
const PLATFORM_SESSION_KEYS: Record<string, string[]> = {
  哔哩哔哩: ['SESSDATA'],
  抖音: ['sessionid', 'ttwid'],
  小红书: ['web_session', 'a1'],
  快手: ['did', 'kuaishou.server.webday7_st', 'passToken'],
};

/** UA 与 lib/api 各模块保持同一口径，避免服务端因 UA 突变重发风控 */
const UA_DESKTOP =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36 Edg/122.0.0.0';

export function mkVideoCookieReadAll(readB?: ReadB): Record<string, string> {
  const out: Record<string, string> = {};
  if (!readB) return out;
  for (const p of VIDEO_COOKIE_PLATFORMS) {
    const v = readB(VIDEO_COOKIE_FILE, p, '');
    out[p] = typeof v === 'string' ? v.trim() : '';
  }
  return out;
}

export function mkVideoCookieReadUpdatedAt(readB?: ReadB): Record<string, number> {
  const out: Record<string, number> = {};
  if (!readB) return out;
  const raw = readB(VIDEO_COOKIE_FILE, VIDEO_COOKIE_UPDATED_KEY, {}) as Record<string, unknown> | undefined;
  if (raw && typeof raw === 'object') {
    for (const p of VIDEO_COOKIE_PLATFORMS) {
      const n = Number(raw[p]);
      if (Number.isFinite(n) && n > 0) out[p] = Math.floor(n);
    }
  }
  return out;
}

export function mkVideoCookieWrite(
  writeB: WriteB | undefined,
  platform: string,
  cookie: string,
  readB?: ReadB,
): boolean {
  if (!writeB) return false;
  if (!(VIDEO_COOKIE_PLATFORMS as readonly string[]).includes(platform)) return false;
  const value = String(cookie ?? '').trim();
  writeB(VIDEO_COOKIE_FILE, platform, value);
  const stamps = mkVideoCookieReadUpdatedAt(readB);
  stamps[platform] = value ? Date.now() : 0;
  writeB(VIDEO_COOKIE_FILE, VIDEO_COOKIE_UPDATED_KEY, stamps);
  return true;
}

/**
 * 合并 Set-Cookie：新值覆盖旧值中同名键，旧值中独有的键保留。
 * 这样「登录会话键」不会被匿名刷新请求冲掉。
 */
export function mkMergeCookieStrings(...parts: Array<string | undefined | null>): string {
  const jar = new Map<string, string>();
  for (const part of parts) {
    for (const seg of String(part || '').split(/;\s*/)) {
      const kv = seg.trim();
      if (!kv) continue;
      const eq = kv.indexOf('=');
      if (eq <= 0) continue;
      const k = kv.slice(0, eq).trim();
      const v = kv.slice(eq + 1).trim();
      if (!k) continue;
      jar.set(k, v);
    }
  }
  return Array.from(jar.entries())
    .map(([k, v]) => `${k}=${v}`)
    .join('; ');
}

/** 从 fetch 响应收集 Set-Cookie（Node fetch 对多值头有 getSetCookie） */
function collectSetCookie(res: Response): string {
  try {
    const anyRes = res as unknown as { getSetCookie?: () => string[] };
    if (typeof anyRes.getSetCookie === 'function') return anyRes.getSetCookie().join('; ');
  } catch {
    // ignore
  }
  try {
    return res.headers.get('set-cookie') || '';
  } catch {
    return '';
  }
}

export interface MkCookieRefreshResult {
  ok: boolean;
  cookie: string;
  message: string;
  loginOk?: boolean;
}

/**
 * 用当前 Cookie 请求平台轻量端点做「滚动续期」。
 * 返回合并后的最新 Cookie（即使 ok=false 也尽量返回原 Cookie，避免误清）。
 */
export async function mkVideoCookieRefresh(
  platform: string,
  cookie: string,
  logger?: MkLogger,
): Promise<MkCookieRefreshResult> {  const base = String(cookie || '').trim();
  const keep = (merged: string, message: string, loginOk?: boolean, ok = true) => ({
    ok,
    cookie: merged || base,
    message,
    loginOk,
  });

  try {
    if (platform === '哔哩哔哩') {
      const res = await fetch('https://api.bilibili.com/x/web-interface/nav', {
        headers: {
          'User-Agent': UA_DESKTOP,
          Referer: 'https://www.bilibili.com/',
          ...(base ? { Cookie: base } : {}),
        },
      });
      const setCookie = collectSetCookie(res);
      const merged = mkMergeCookieStrings(base, setCookie);
      const body = (await res.json().catch(() => null)) as
        | { code?: number; data?: { isLogin?: boolean; uname?: string } }
        | null;
      const loginOk = body?.code === 0 && body?.data?.isLogin === true;
      const name = body?.data?.uname ? `（${body.data.uname}）` : '';
      if (!loginOk && base) {
        return keep(merged, `哔哩哔哩 Cookie 已失效（nav 接口未返回登录态）${body?.code ? ` code=${body.code}` : ''}`, false, false);
      }
      return keep(merged, `哔哩哔哩 Cookie 有效${loginOk ? name : '（未登录状态）'}`, loginOk);
    }

    if (platform === '小红书') {
      const res = await fetch('https://www.xiaohongshu.com/', {
        headers: {
          'User-Agent': UA_DESKTOP,
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'zh-CN,zh;q=0.9',
          ...(base ? { Cookie: base } : {}),
        },
        redirect: 'follow',
      });
      const setCookie = collectSetCookie(res);
      const merged = mkMergeCookieStrings(base, setCookie);
      if (!res.ok) return keep(merged, `小红书续期失败：HTTP ${res.status}`, undefined, false);
      const hasSession = PLATFORM_SESSION_KEYS.小红书.some((k) => merged.includes(`${k}=`));
      return keep(merged, hasSession ? '小红书 Cookie 已续期（含会话键）' : '小红书 已续期（当前无会话键，仅游客身份）', hasSession);
    }

    if (platform === '快手') {
      const res = await fetch('https://www.kuaishou.com/', {
        headers: {
          'User-Agent': UA_DESKTOP,
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'zh-CN,zh;q=0.9',
          ...(base ? { Cookie: base } : {}),
        },
        redirect: 'follow',
      });
      const setCookie = collectSetCookie(res);
      const merged = mkMergeCookieStrings(base, setCookie);
      if (!res.ok) return keep(merged, `快手续期失败：HTTP ${res.status}`, undefined, false);
      const hasSession = PLATFORM_SESSION_KEYS.快手.some((k) => merged.includes(`${k}=`));
      return keep(merged, hasSession ? '快手 Cookie 已续期（含会话键）' : '快手 已续期（当前无会话键，仅游客身份）', hasSession);
    }

    if (platform === '抖音') {
      // 抖音解析已改为免签名免 Cookie 的通道（开放平台来源头 / 移动端 Feed），
      // 不再申请 ttwid，登录 Cookie 也不再参与解析；这里只校验存在性，留作备用。
      const hasSession = PLATFORM_SESSION_KEYS.抖音.some((k) => base.includes(`${k}=`));
      return keep(
        base,
        hasSession ? '抖音 Cookie 有效（含会话键）' : '抖音 未配置登录 Cookie（当前解析已免签名免登录，通常不需要配置）',
        hasSession,
      );
    }

    return { ok: false, cookie: base, message: `不支持的平台：${platform}` };
  } catch (e) {
    logger?.warn?.(`[视频解析] ${platform} Cookie 续期失败:`, e);
    return { ok: false, cookie: base, message: `续期失败：${e instanceof Error ? e.message : '未知错误'}` };
  }
}

// ---------------------------------------------------------------------------
// 扫码登录（在线登录）：用户只需用手机 App 扫二维码确认，插件自动收取 Cookie
//
//   · 哔哩哔哩：passport QR（bilibili-API-collect 标准流程，稳定）
//       生成 GET /x/passport-login/web/qrcode/generate → {url, qrcode_key}
//       轮询 GET /x/passport-login/web/qrcode/poll?qrcode_key=
//             data.code: 86101 未扫 / 86090 已扫待确认 / 86038 过期 / 0 成功（Set-Cookie 带 SESSDATA）
//   · 小红书：web 端 QR（xiaohongshu-mcp / ReaJason xhs 同款接口）
//       生成 /api/sns/web/v1/login/qrcode/create → {qr_id, code, url}
//       轮询 /api/sns/web/v1/login/qrcode/status → code_status: 0 未扫 / 1 已扫 / 2 成功
//   · 抖音：passport QR（接口常变，失败时前端提示改用手动粘贴）
//       生成 /passport/web/get_qr_code/ → {token, qrcode_index_url}
//       轮询 /passport/web/check_qr_code/ → data.status: 1 未扫 / 2 已扫 / 3 成功 / 5 过期
//   · 快手：QR 接口需要额外的签名/设备注册，暂不支持，走手动粘贴
// ---------------------------------------------------------------------------

export interface MkQrStartResult {
  ok: boolean;
  /** 二维码内容（通常是登录确认页 URL），前端负责渲染 */
  qr?: string;
  /** 轮询凭证（qrcode_key / qr_id|code / token） */
  token?: string;
  message: string;
}

export interface MkQrPollResult {
  ok: boolean;
  status: 'waiting' | 'scanned' | 'confirmed' | 'expired' | 'error';
  cookie?: string;
  message: string;
}

async function mkQrFetchJson(url: string, init: Record<string, unknown> = {}): Promise<{ json: Record<string, unknown> | null; setCookie: string; status: number }> {
  const res = await fetch(url, {
    ...init,
    headers: {
      'User-Agent': UA_DESKTOP,
      Accept: 'application/json, text/plain, */*',
      'Accept-Language': 'zh-CN,zh;q=0.9',
      ...((init.headers as Record<string, string> | undefined) || {}),
    },
  } as RequestInit);
  let json: Record<string, unknown> | null = null;
  try {
    json = (await res.json()) as Record<string, unknown>;
  } catch {
    json = null;
  }
  return { json, setCookie: collectSetCookie(res), status: res.status };
}

function pick(obj: unknown, path: string[]): unknown {
  let cur: unknown = obj;
  for (const k of path) {
    if (cur && typeof cur === 'object' && k in (cur as Record<string, unknown>)) {
      cur = (cur as Record<string, unknown>)[k];
    } else {
      return undefined;
    }
  }
  return cur;
}

/** 开始扫码：返回二维码内容与轮询 token */
export async function mkVideoQrStart(platform: string, logger?: MkLogger): Promise<MkQrStartResult> {
  try {
    if (platform === '哔哩哔哩') {
      const { json } = await mkQrFetchJson('https://passport.bilibili.com/x/passport-login/web/qrcode/generate', {
        headers: { Referer: 'https://passport.bilibili.com/login' },
      });
      const url = pick(json, ['data', 'url']) as string | undefined;
      const key = pick(json, ['data', 'qrcode_key']) as string | undefined;
      if (url && key) return { ok: true, qr: url, token: key, message: '二维码已生成' };
      return { ok: false, message: '哔哩哔哩二维码生成失败' };
    }

    if (platform === '小红书') {
      const api = 'https://www.xiaohongshu.com/api/sns/web/v1/login/qrcode/create';
      let { json } = await mkQrFetchJson(api, { method: 'POST' });
      if (!json) {
        ({ json } = await mkQrFetchJson(api));
      }
      const url = (pick(json, ['data', 'url']) ?? pick(json, ['data', 'qrcode'])) as string | undefined;
      const qrId = (pick(json, ['data', 'qr_id']) ?? pick(json, ['data', 'qrId'])) as string | undefined;
      const code = (pick(json, ['data', 'code']) ?? pick(json, ['data', 'qr_code'])) as string | undefined;
      if (url && qrId) {
        // 轮询参数把 qr_id 与 code 一起带上（接口两种参数形态做兼容）
        const pollToken = code ? `${qrId}|${code}` : String(qrId);
        return { ok: true, qr: url, token: pollToken, message: '二维码已生成' };
      }
      return { ok: false, message: '小红书二维码生成失败（接口可能已变更，请手动粘贴 Cookie）' };
    }

    if (platform === '抖音') {
      // login.douyin.com 与 sso.douyin.com 同一套 passport；aid=6383 = 抖音 web 主站，
      // next 指回主站，登录态 Cookie 的域才是 .douyin.com（供 www.douyin.com 解析接口使用）
      const { json } = await mkQrFetchJson(
        `https://login.douyin.com/passport/web/get_qrcode/?aid=6383&next=${encodeURIComponent('https://www.douyin.com')}`,
        { headers: { Referer: 'https://www.douyin.com/' } },
      );
      const token = (pick(json, ['data', 'token']) ?? pick(json, ['data', 'qr_token'])) as string | undefined;
      const url = (pick(json, ['data', 'qrcode_index_url']) ?? pick(json, ['data', 'qrcode'])) as string | undefined;
      if (token && url) return { ok: true, qr: url, token, message: '二维码已生成' };
      return { ok: false, message: '抖音二维码生成失败（接口可能已变更，请手动粘贴 Cookie）' };
    }

    return { ok: false, message: `${platform} 暂不支持扫码登录，请手动粘贴 Cookie` };
  } catch (e) {
    logger?.warn?.(`[视频解析] ${platform} 扫码登录失败:`, e);
    return { ok: false, message: `${platform} 扫码登录失败：${e instanceof Error ? e.message : '网络错误'}` };
  }
}

/** 轮询扫码状态；confirmed 时返回合并后的 Cookie（未传旧 Cookie 则直接为新 Cookie） */
export async function mkVideoQrPoll(
  platform: string,
  token: string,
  oldCookie: string,
  logger?: MkLogger,
): Promise<MkQrPollResult> {
  try {
    if (platform === '哔哩哔哩') {
      const { json, setCookie } = await mkQrFetchJson(
        `https://passport.bilibili.com/x/passport-login/web/qrcode/poll?qrcode_key=${encodeURIComponent(token)}`,
        { headers: { Referer: 'https://passport.bilibili.com/login' } },
      );
      const code = Number(pick(json, ['data', 'code']) ?? -1);
      if (code === 0) {
        const merged = mkMergeCookieStrings(oldCookie, setCookie);
        const hasSess = merged.includes('SESSDATA=');
        return { ok: hasSess, status: 'confirmed', cookie: merged, message: hasSess ? '登录成功' : '登录成功但未取到 SESSDATA' };
      }
      if (code === 86090) return { ok: true, status: 'scanned', message: '已扫码，请在手机上确认' };
      if (code === 86038) return { ok: true, status: 'expired', message: '二维码已过期，请重新生成' };
      return { ok: true, status: 'waiting', message: '等待扫码' };
    }

    if (platform === '小红书') {
      const [qrId, code] = String(token || '').split('|');
      const api = `https://www.xiaohongshu.com/api/sns/web/v1/login/qrcode/status?qr_id=${encodeURIComponent(qrId)}&code=${encodeURIComponent(code || '')}`;
      const { json, setCookie } = await mkQrFetchJson(api);
      const codeStatus = Number(pick(json, ['data', 'code_status']) ?? -1);
      if (codeStatus === 2) {
        const merged = mkMergeCookieStrings(oldCookie, setCookie);
        const hasSession = PLATFORM_SESSION_KEYS.小红书.some((k) => merged.includes(`${k}=`));
        return { ok: hasSession, status: 'confirmed', cookie: merged, message: hasSession ? '登录成功' : '成功但未取到会话键' };
      }
      if (codeStatus === 1) return { ok: true, status: 'scanned', message: '已扫码，请在手机上确认' };
      if (codeStatus === 0) return { ok: true, status: 'waiting', message: '等待扫码' };
      return { ok: true, status: 'expired', message: '二维码已失效，请重新生成' };
    }

    if (platform === '抖音') {
      // 抖音扫码（Axbros/douyinLogin 等续火类脚本同款流程，已验证）：
      //   轮询 check_qrconnect → status: "1" 未扫 / "2" 已扫 / "5" 失效 / "3" 成功（注意是字符串）
      //   **status=3 后必须请求 data.redirect_url，登录态 Cookie（sessionid 等）是在那一步种下的**，
      //   只看 check 响应自己的 Set-Cookie 拿不到登录态。
      //   redirect_url 是一条 302 链，要 manual 跟跳、逐跳收 Set-Cookie 并带上累计 Cookie。
      const pollUrl =
        `https://login.douyin.com/passport/web/check_qrconnect?aid=6383` +
        `&next=${encodeURIComponent('https://www.douyin.com')}&token=${encodeURIComponent(token)}`;
      const { json, setCookie } = await mkQrFetchJson(pollUrl);
      const status = String(pick(json, ['data', 'status']) ?? '');
      if (status === '3') {
        let merged = mkMergeCookieStrings(oldCookie, setCookie);
        const redirectUrl = pick(json, ['data', 'redirect_url']) as string | undefined;
        if (redirectUrl) {
          let next: string | undefined = redirectUrl;
          for (let hop = 0; hop < 5 && next; hop++) {
            const res = await fetch(next, {
              redirect: 'manual',
              headers: {
                'User-Agent': UA_DESKTOP,
                Referer: 'https://www.douyin.com/',
                ...(merged ? { Cookie: merged } : {}),
              },
            });
            merged = mkMergeCookieStrings(merged, collectSetCookie(res));
            const loc = res.headers.get('location');
            if (!loc || res.status < 300 || res.status >= 400) break;
            try {
              next = new URL(loc, next).href;
            } catch {
              break;
            }
          }
        }
        const hasSession = merged.includes('sessionid=');
        return {
          ok: hasSession,
          status: 'confirmed',
          cookie: merged,
          message: hasSession ? '登录成功，Cookie 已入库' : '扫码成功但未取到会话键，请重试或手动粘贴',
        };
      }
      if (status === '2') return { ok: true, status: 'scanned', message: '已扫码，请在手机上确认' };
      if (status === '5') return { ok: true, status: 'expired', message: '二维码已过期，请重新生成' };
      return { ok: true, status: 'waiting', message: '等待扫码' };
    }

    return { ok: false, status: 'error', message: `${platform} 暂不支持扫码登录` };
  } catch (e) {
    logger?.warn?.(`[视频解析] ${platform} 扫码轮询失败:`, e);
    return { ok: false, status: 'error', message: `轮询失败：${e instanceof Error ? e.message : '网络错误'}` };
  }
}
