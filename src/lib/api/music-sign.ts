// ---------------------------------------------------------------------------
// QQ 音乐 Ark 签名（CZ 上游）— 纯文件子 API，供点歌发卡片使用
// 对应原 qq音乐签名调用/music_sign_proxy_v4.py 的上游调用部分（无本地 HTTP 服务）
// ---------------------------------------------------------------------------

export type MusicSignInput = {
  /** 歌名 */
  title: string;
  /** 歌手 */
  singer?: string;
  /** 封面 */
  image: string;
  /** 跳转页（与 audio 相同时可共用播放链） */
  url: string;
  /** 音频直链 */
  audio: string;
  /** 上游 type，默认 qq（qqyykp） */
  type?: string;
};

export type MusicSignResult = {
  ok: boolean;
  /** 可直接交给 发卡片 的 JSON 文本 */
  ark?: string;
  /** 解析后的对象（若上游返回对象） */
  payload?: Record<string, unknown>;
  error?: string;
};

const CZ_API = 'https://api.czcn.xyz/api/qqyykp';
const UPSTREAM_TIMEOUT_MS = 15000;

function scalar(value: unknown, fallback = ''): string {
  if (value == null) return fallback;
  if (Array.isArray(value)) return scalar(value[0], fallback);
  if (typeof value === 'object') return fallback;
  return String(value).trim();
}

function isMusicPayload(payload: unknown): payload is Record<string, unknown> {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return false;
  const obj = payload as Record<string, unknown>;
  const meta = obj.meta;
  const music = meta && typeof meta === 'object' && !Array.isArray(meta)
    ? (meta as Record<string, unknown>).music
    : null;
  return String(obj.view ?? '').toLowerCase() === 'music' && !!music && typeof music === 'object';
}

async function fetchJson(url: string, init?: RequestInit): Promise<unknown> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), UPSTREAM_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      ...init,
      signal: ctrl.signal,
      headers: {
        Accept: 'application/json',
        'User-Agent': 'MKbot-MusicSign/1.0',
        ...(init?.headers || {}),
      },
    });
    const text = (await res.text()).replace(/^\uFEFF/, '').trim();
    if (!text) throw new Error(`上游空响应 HTTP ${res.status}`);
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      throw new Error(`上游非 JSON HTTP ${res.status}: ${text.slice(0, 200)}`);
    }
    if (!res.ok) {
      throw new Error(`上游 HTTP ${res.status}: ${text.slice(0, 200)}`);
    }
    return parsed;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * 调用 CZ qqyykp，生成 QQ 音乐 Ark JSON。
 * 不需要 key（上游当前可直接签）。
 */
export async function sign(input: MusicSignInput): Promise<MusicSignResult> {
  const title = scalar(input.title);
  const singer = scalar(input.singer);
  const image = scalar(input.image);
  const jump = scalar(input.url);
  const audio = scalar(input.audio);
  const type = scalar(input.type, 'qq') || 'qq';

  const missing: string[] = [];
  if (!title) missing.push('title');
  if (!image) missing.push('image');
  if (!jump) missing.push('url');
  if (!audio) missing.push('audio');
  if (missing.length) {
    return { ok: false, error: `缺少参数: ${missing.join(', ')}` };
  }

  const params = new URLSearchParams({
    type,
    url: jump,
    audio,
    title,
    desc: singer,
    image,
  });

  const errors: string[] = [];

  // GET 优先
  try {
    const payload = await fetchJson(`${CZ_API}?${params.toString()}`, { method: 'GET' });
    if (isMusicPayload(payload)) {
      return {
        ok: true,
        payload,
        ark: JSON.stringify(payload),
      };
    }
    errors.push(`GET 返回非音乐 Ark: ${JSON.stringify(payload).slice(0, 200)}`);
  } catch (e) {
    errors.push(`GET: ${e instanceof Error ? e.message : String(e)}`);
  }

  // POST form 兜底
  try {
    const payload = await fetchJson(CZ_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=utf-8' },
      body: params.toString(),
    });
    if (isMusicPayload(payload)) {
      return {
        ok: true,
        payload,
        ark: JSON.stringify(payload),
      };
    }
    errors.push(`POST 返回非音乐 Ark: ${JSON.stringify(payload).slice(0, 200)}`);
  } catch (e) {
    errors.push(`POST: ${e instanceof Error ? e.message : String(e)}`);
  }

  return { ok: false, error: errors.join('；') || 'CZ 签名失败' };
}
