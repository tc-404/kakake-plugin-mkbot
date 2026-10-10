// ---------------------------------------------------------------------------
// 快手解析（移植 short_videos KuaishouSpider.php）
//
// 2026-10 修复：网页版匿名请求基本拿不到 INIT_STATE（tusjoh 键被风控吃掉）。
// 现在的策略：
//   ① 携带 Cookie（用户登录 Cookie 优先；没有则用自动生成的游客 did 设备号）
//   ② 先照旧抓页面解析 INIT_STATE / __APOLLO_STATE__
//   ③ 失败则走网页版 GraphQL visionVideoDetail（MediaCrawler 同款查询），拿真实播放地址
// ---------------------------------------------------------------------------

import { cleanUrlTail, extractBalancedJsonFrom, fetchText, followRedirect } from './http-utils';
import type { LocalVideoApiCtx } from './loader';

const USER_AGENT =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1 Edg/122.0.0.0';

/** GraphQL 用桌面 UA + Referer，混用移动 UA 会被判异常 */
const WEB_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

export interface KsMusic {
  name: string;
  artist: string;
  cover: string;
  url: string;
}

export interface KsMediaData {
  type: 'video' | 'image';
  title: string;
  author: string;
  avatar: string;
  cover: string;
  url: string;
  like: number;
  time: number;
  count?: number;
  images?: string[];
  music?: KsMusic | string;
  api?: number;
}

export interface KsApiResult {
  code: number;
  msg: string;
  data?: KsMediaData;
}

function extractKuaishouUrl(text: string): string {
  const shortMatch = text.match(/https?:\/\/v\.kuaishou\.com\/[\w-]+/i);
  if (shortMatch) return shortMatch[0].trim();
  const anyMatch = text.match(/https?:\/\/[^\s]*kuaishou\.com[^\s]*/i);
  if (anyMatch) return anyMatch[0].trim().replace(/[^\w\-./?=&:#]+$/i, '');
  return text.trim();
}

/** 游客 did 设备号（进程内复用）：快手网页版没有它基本必被风控，但它本身不需要登录 */
let guestDid = '';

function buildGuestCookie(): string {
  if (!guestDid) {
    const hex = Array.from({ length: 32 }, () => '0123456789abcdef'[Math.floor(Math.random() * 16)]).join('');
    guestDid = `web_${hex}`;
  }
  return `did=${guestDid}; didv=${Date.now()}; kpf=PC_WEB; clientid=3; kpn=KUAISHOU_VISION`;
}

/** 用户 Cookie 优先；没有则用游客 did。两者都不需要登录态 */
function resolveCookie(ctx?: LocalVideoApiCtx): string {
  const user = String(ctx?.cookies?.['快手'] || '').trim();
  return user || buildGuestCookie();
}

/**
 * 网页版 GraphQL 兜底：visionVideoDetail。
 * 媒体优先取 manifest（多码率里挑最高），退回 photoUrl。
 */
async function parseViaGraphQL(photoId: string, cookie: string): Promise<KsApiResult | null> {
  const query = `query visionVideoDetail($photoId: String, $type: String) {
  visionVideoDetail(photoId: $photoId, type: $type) {
    status
    author { id name headerUrl }
    photo {
      id duration caption likeCount viewCount coverUrl photoUrl
      manifest { adaptationSet { representation { url qualityLabel height width } } }
    }
    tags { type name }
  }
}`;
  try {
    const res = await fetch('https://www.kuaishou.com/graphql', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json, text/plain, */*',
        'Accept-Language': 'zh-CN,zh;q=0.9',
        Origin: 'https://www.kuaishou.com',
        Referer: `https://www.kuaishou.com/short-video/${photoId}`,
        'User-Agent': WEB_UA,
        ...(cookie ? { Cookie: cookie } : {}),
      },
      body: JSON.stringify({
        operationName: 'visionVideoDetail',
        variables: { photoId, page: 'search' },
        query,
      }),
    });
    if (!res.ok) return null;
    const body = (await res.json().catch(() => null)) as {
      errors?: unknown;
      data?: {
        visionVideoDetail?: {
          status?: string;
          author?: { id?: string; name?: string; headerUrl?: string };
          photo?: {
            id?: string;
            duration?: number;
            caption?: string;
            likeCount?: number;
            viewCount?: number;
            coverUrl?: string;
            photoUrl?: string;
            manifest?: { adaptationSet?: Array<{ representation?: Array<{ url?: string; qualityLabel?: string }> }> };
          };
        };
      };
    } | null;
    if (!body || body.errors) return null;
    const detail = body.data?.visionVideoDetail;
    const photo = detail?.photo;
    if (!photo) return null;

    let videoUrl = '';
    let bestHeight = -1;
    const reps = photo.manifest?.adaptationSet?.flatMap((s) => s.representation ?? []) ?? [];
    for (const rep of reps) {
      if (!rep.url) continue;
      const h = Number((rep as { height?: unknown }).height ?? 0) || 0;
      if (h >= bestHeight) {
        bestHeight = h;
        videoUrl = rep.url;
      }
    }
    if (!videoUrl) videoUrl = photo.photoUrl ?? '';
    if (!videoUrl) return null;

    return {
      code: 200,
      msg: '解析成功',
      data: {
        type: 'video',
        author: detail?.author?.name ?? '',
        avatar: detail?.author?.headerUrl ?? '',
        title: photo.caption ?? '',
        cover: photo.coverUrl ?? '',
        url: videoUrl,
        like: Number(photo.likeCount) || 0,
        time: 0,
      },
    };
  } catch {
    return null;
  }
}

async function getRedirectedUrl(url: string): Promise<string | null> {
  try {
    return await followRedirect(url, USER_AGENT);
  } catch {
    return null;
  }
}

async function curlRequest(url: string, cookie = ''): Promise<string | false> {
  try {
    return await fetchText(
      url,
      {
        headers: {
          Accept:
            'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
          'Accept-Language': 'zh-CN,zh;q=0.9',
          'Cache-Control': 'no-cache',
          Pragma: 'no-cache',
          'Upgrade-Insecure-Requests': '1',
          ...(cookie ? { Cookie: cookie } : {}),
        },
      },
      USER_AGENT,
    );
  } catch {
    return false;
  }
}

function extractContentIdAndType(url: string): [string, string] {
  const patterns: Record<string, RegExp> = {
    'short-video': /short-video\/([^?]+)/,
    'long-video': /long-video\/([^?]+)/,
    photo: /photo\/([^?]+)/,
  };
  for (const [type, pattern] of Object.entries(patterns)) {
    const match = url.match(pattern);
    if (match) return [type, match[1]];
  }
  return ['', ''];
}

function filterMediaData(data: Record<string, unknown>): Record<string, unknown> {
  const filtered: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data)) {
    if (!key.startsWith('tusjoh')) continue;
    const item = value as { fid?: unknown; photo?: unknown };
    if (item.fid !== undefined || item.photo !== undefined) {
      filtered[key] = value;
    }
  }
  return filtered;
}

function buildMusicInfo(photo: Record<string, unknown>): KsMusic {
  const musicSource =
    (photo.music as Record<string, unknown> | undefined) ??
    (photo.soundTrack as Record<string, unknown> | undefined) ??
    {};
  return {
    name: (musicSource.name as string) ?? '',
    artist: (musicSource.artist as string) ?? '',
    cover:
      (musicSource.imageUrls as Array<{ url?: string }> | undefined)?.[0]?.url ??
      (musicSource.avatarUrls as Array<{ url?: string }> | undefined)?.[0]?.url ??
      '',
    url: (musicSource.audioUrls as Array<{ url?: string }> | undefined)?.[0]?.url ?? '',
  };
}

function parseInitState(pageContent: string): KsApiResult | null {
  let jsonString = extractBalancedJsonFrom(pageContent, 'window.INIT_STATE');
  if (!jsonString) return null;

  jsonString = jsonString.replace(/;\s*$/, '');

  let data: Record<string, unknown>;
  try {
    data = JSON.parse(jsonString) as Record<string, unknown>;
  } catch {
    let cleaned = jsonString
      .replace(/\\"/g, '"')
      .replace(
        /"\{"err_msg":"launchApplication:fail"\}"/g,
        '"err_msg","launchApplication:fail"',
      )
      .replace(
        /"\{"err_msg":"system:access_denied"\}"/g,
        '"err_msg","system:access_denied"',
      );
    try {
      data = JSON.parse(cleaned) as Record<string, unknown>;
    } catch (e) {
      return { code: 500, msg: `JSON解析错误: ${e instanceof Error ? e.message : 'unknown'}` };
    }
  }

  const filteredData = filterMediaData(data);
  if (!Object.keys(filteredData).length) return null;

  const firstItem = Object.values(filteredData)[0] as { photo?: Record<string, unknown> };
  const photo = firstItem.photo ?? {};
  const musicInfo = buildMusicInfo(photo);

  const atlas = photo.ext_params as { atlas?: { list?: string[]; music?: string } } | undefined;
  const imageList = atlas?.atlas?.list ?? [];
  if (imageList.length) {
    return {
      code: 200,
      msg: 'success',
      data: {
        type: 'image',
        title: (photo.caption as string) ?? '',
        author: (photo.userName as string) ?? '',
        avatar: (photo.headUrl as string) ?? '',
        count: imageList.length,
        like: Number(photo.likeCount) || 0,
        time: Number(photo.timestamp) || 0,
        music: 'http://txmov2.a.kwimgs.com' + (atlas?.atlas?.music ?? ''),
        images: imageList.map((path) => `http://tx2.a.yximgs.com/${path}`),
        cover: imageList[0] ? `http://tx2.a.yximgs.com/${imageList[0]}` : '',
        url: imageList[0] ? `http://tx2.a.yximgs.com/${imageList[0]}` : '',
        api: 1,
      },
    };
  }

  if (photo.photoType === 'SINGLE_PICTURE' || photo.singlePicture === true) {
    const coverUrls = photo.coverUrls as Array<{ url?: string }> | undefined;
    const imageUrl = coverUrls?.[0]?.url ?? '';
    if (imageUrl) {
      return {
        code: 200,
        msg: '解析成功',
        data: {
          type: 'image',
          author: (photo.userName as string) ?? '',
          avatar: (photo.headUrl as string) ?? '',
          like: Number(photo.likeCount) || 0,
          time: Number(photo.timestamp) || 0,
          title: (photo.caption as string) ?? '',
          cover: imageUrl,
          url: imageUrl,
          images: [imageUrl],
          music: musicInfo,
        },
      };
    }
  }

  if (photo.mainMvUrls || photo.photoType === 'VIDEO') {
    const mainMvUrls = photo.mainMvUrls as Array<{ url?: string }> | undefined;
    let videoUrl = mainMvUrls?.[0]?.url ?? '';
  const manifest = photo.manifest as {
      adaptationSet?: Array<{ representation?: Array<{ url?: string }> }>;
    } | undefined;
    if (!videoUrl) {
      videoUrl = manifest?.adaptationSet?.[0]?.representation?.[0]?.url ?? '';
    }
    if (videoUrl) {
      const coverUrls = photo.coverUrls as Array<{ url?: string }> | undefined;
      return {
        code: 200,
        msg: '解析成功',
        data: {
          type: 'video',
          author: (photo.userName as string) ?? '',
          avatar: (photo.headUrl as string) ?? '',
          like: Number(photo.likeCount) || 0,
          time: Number(photo.timestamp) || 0,
          title: (photo.caption as string) ?? '',
          cover: coverUrls?.[0]?.url ?? '',
          url: videoUrl,
          music: musicInfo,
        },
      };
    }
  }

  return null;
}

function parseApolloState(
  pageContent: string,
  contentId: string,
  contentType: string,
): KsApiResult | null {
  let raw = extractBalancedJsonFrom(pageContent, 'window.__APOLLO_STATE__');
  if (!raw) return null;

  let cleanedData = raw
    .replace(/function\s*\([^)]*\)\s*{[^}]*}/g, ':')
    .replace(/,\s*(?=}|])/g, '')
    .replace(/;\(:?\(\)\);/g, '');

  let apolloState: Record<string, unknown>;
  try {
    apolloState = JSON.parse(cleanedData) as Record<string, unknown>;
  } catch {
    return null;
  }

  const videoInfo = apolloState.defaultClient as Record<string, unknown> | undefined;
  if (!videoInfo) return null;

  const key = `VisionVideoDetailPhoto:${contentId}`;
  const videoData = videoInfo[key] as Record<string, unknown> | undefined;
  if (!videoData) return null;

  let authorData: Record<string, unknown> | null = null;
  for (const k of Object.keys(videoInfo)) {
    if (k.startsWith('VisionVideoDetailAuthor:')) {
      authorData = videoInfo[k] as Record<string, unknown>;
      break;
    }
  }

  let videoUrl = '';
  if (contentType === 'long-video') {
    const manifestH265 = videoData.manifestH265 as {
      json?: { adaptationSet?: Array<{ representation?: Array<{ backupUrl?: string[] }> }> };
    };
    videoUrl = manifestH265?.json?.adaptationSet?.[0]?.representation?.[0]?.backupUrl?.[0] ?? '';
  } else {
    videoUrl = (videoData.photoUrl as string) ?? '';
  }

  if (!videoUrl) return null;

  return {
    code: 200,
    msg: '解析成功',
    data: {
      type: contentType === 'photo' ? 'image' : 'video',
      author: (authorData?.name as string) ?? '',
      avatar: (authorData?.headerUrl as string) ?? '',
      title: (videoData.caption as string) ?? '',
      cover: (videoData.coverUrl as string) ?? '',
      url: videoUrl,
      like: 0,
      time: 0,
    },
  };
}

/**
 * 解析快手链接（视频 / 图集）
 * @param urlInput 原始链接
 * @param ctx 含「快手」Cookie（WebUI「视频解析」页配置；未配置时自动用游客 did）
 */
export async function parse(urlInput: string, ctx?: LocalVideoApiCtx): Promise<KsApiResult> {
  const url = cleanUrlTail(extractKuaishouUrl(urlInput));
  if (!url) return { code: 201, msg: 'url为空' };

  const cookie = resolveCookie(ctx);

  try {
    const redirectUrl = await getRedirectedUrl(url);
    if (!redirectUrl) return { code: 400, msg: '无法获取有效链接' };

    const [contentType, contentId] = extractContentIdAndType(redirectUrl);

    const pageContent = await curlRequest(redirectUrl, cookie);
    if (pageContent !== false) {
      const result = contentId
        ? parseInitState(pageContent) ?? parseApolloState(pageContent, contentId, contentType)
        : parseInitState(pageContent);
      if (result) return result;
    }

    // 页面被风控 / 拿不到 INIT_STATE → 走 GraphQL 兜底
    if (contentId) {
      const viaGraphQL = await parseViaGraphQL(contentId, cookie);
      if (viaGraphQL) return viaGraphQL;
    }

    return { code: 404, msg: '未找到有效媒体信息' };
  } catch (e) {
    return { code: 500, msg: e instanceof Error ? e.message : '解析失败' };
  }
}

export default { parse };
