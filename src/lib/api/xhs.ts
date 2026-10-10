// ---------------------------------------------------------------------------
// 小红书视频/图文解析（由 xhs.php 迁移）
// ---------------------------------------------------------------------------

import {
  cleanUrlTail,
  DEFAULT_USER_AGENT,
  EDGE_USER_AGENT,
  fetchText,
  followRedirect,
  isAllowedDomain,
} from './http-utils';
import type { LocalVideoApiCtx } from './loader';

const ALLOWED_DOMAINS = [
  'xiaohongshu.com',
  // 小红书现在的分享短链用 xhslink.cn（老的是 xhslink.com，两者都要收）
  'xhslink.com',
  'xhslink.cn',
  'xhs.com',
  'www.xiaohongshu.com',
  'sns-img-hw.xhscdn.com',
  'sns-video-bd.xhscdn.com',
];

const BACKUP_UA =
  'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Mobile Safari/537.36 EdgA/143.0.0.0';

/** 小红书当前对匿名请求基本必弹登录墙：a1（设备）/ web_session（登录会话）缺一不可 */
function resolveCookie(ctx?: LocalVideoApiCtx): string {
  const c = String(ctx?.cookies?.['小红书'] || '').trim();
  return c;
}

export interface XhsAuthor {
  名称: string;
  ID: string;
  头像: string;
}

export interface XhsLiveItem {
  图片: string;
  视频: string;
}

export interface XhsNoteData {
  类型: string;
  标题: string;
  描述: string;
  作者: XhsAuthor;
  封面: string;
  视频链接: string | null;
  备用视频链接?: string | null;
  图片: string[];
  实况图: XhsLiveItem[];
}

export interface XhsParseSuccess {
  success: true;
  data: XhsNoteData;
}

export interface XhsParseFailure {
  success: false;
  error: string;
  code: number;
}

export type XhsParseResult = XhsParseSuccess | XhsParseFailure;

function extractId(url: string): string | null {
  const patterns = [
    /discovery\/item\/([a-zA-Z0-9]+)/,
    /explore\/([a-zA-Z0-9]+)/,
    /item\/([a-zA-Z0-9]+)/,
    /note\/([a-zA-Z0-9]+)/,
  ];
  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) return match[1];
  }
  return null;
}

async function getRealUrl(url: string): Promise<string> {
  try {
    const res = await fetch(url, {
      method: 'GET',
      redirect: 'manual',
      headers: { 'User-Agent': EDGE_USER_AGENT },
    });

    const location = res.headers.get('location');
    if (location) {
      const loc = location;
      if (extractId(loc)) return loc;
      return loc;
    }
  } catch {
    // fallback to followRedirect
  }

  return followRedirect(url, EDGE_USER_AGENT);
}

async function requestPage(url: string, userAgent = EDGE_USER_AGENT, cookie = ''): Promise<string | false> {
  if (!isAllowedDomain(url, ALLOWED_DOMAINS)) return false;

  try {
    return await fetchText(
      url,
      {
        headers: {
          Accept:
            'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
          'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8,en-GB;q=0.7,en-US;q=0.6',
          ...(cookie ? { Cookie: cookie } : {}),
        },
      },
      userAgent,
    );
  } catch {
    return false;
  }
}

function processImageUrl(url: string): string {
  if (!url) return '';

  const notesMatch = url.match(/\/([a-zA-Z0-9_]+)\/([a-zA-Z0-9]+)!/);
  if (notesMatch) {
    const dir = notesMatch[1];
    if (!/^[a-f0-9]{32}$/.test(dir) && !/^\d+$/.test(dir)) {
      return `https://sns-img-hw.xhscdn.com/${dir}/${notesMatch[2]}?imageView2/2/w/1080/format/jpg`;
    }
  }

  const shortMatch = url.match(/(notes_pre_post|spectrum|notes_uhdr)\/([a-zA-Z0-9]+)/);
  if (shortMatch) {
    return `https://sns-img-hw.xhscdn.com/${shortMatch[1]}/${shortMatch[2]}?imageView2/2/w/1080/format/jpg`;
  }

  const bangMatch = url.match(/\/([a-zA-Z0-9]+)!/);
  if (bangMatch) {
    return `https://ci.xiaohongshu.com/${bangMatch[1]}?imageView2/2/w/1080/format/jpg`;
  }

  return url;
}

interface StreamItem {
  masterUrl?: string;
  avgBitrate?: number;
  videoBitrate?: number;
  _codec?: string;
}

function formatNoteData(note: Record<string, unknown>): XhsNoteData {
  let type = (note.type as string) ?? 'unknown';
  if (type === 'normal') type = 'image';

  let coverUrl = '';
  const imageList = note.imageList as Array<Record<string, string>> | undefined;

  if (imageList?.length) {
    const firstImage = imageList[0];
    coverUrl = firstImage.urlPre || firstImage.urlDefault || firstImage.url || '';
  }

  const videoObj = note.video as Record<string, unknown> | undefined;
  const videoImage = videoObj?.image as { thumbnailFileid?: string } | undefined;
  if (!coverUrl && type === 'video' && videoImage?.thumbnailFileid) {
    coverUrl = `https://sns-img-hw.xhscdn.com/${videoImage.thumbnailFileid}`;
  }

  const cover = note.cover as { url?: string; fileId?: string } | undefined;
  if (!coverUrl && cover?.url) {
    coverUrl = cover.url;
  }
  if (!coverUrl && cover?.fileId) {
    coverUrl = `https://sns-img-hw.xhscdn.com/${cover.fileId}?imageView2/2/w/1080/format/jpg`;
  }

  const user = note.user as Record<string, string> | undefined;

  const result: XhsNoteData = {
    类型: type,
    标题: (note.title as string) ?? '',
    描述: (note.desc as string) ?? '',
    作者: {
      名称: user?.nickname ?? user?.nickName ?? '',
      ID: user?.userId ?? '',
      头像: user?.avatar ?? '',
    },
    封面: processImageUrl(coverUrl),
    视频链接: null,
    图片: [],
    实况图: [],
  };

  if (result.类型 === 'video' && videoObj) {
    const streams: StreamItem[] = [];
    const media = videoObj.media as { stream?: { h265?: StreamItem[]; h264?: StreamItem[] } } | undefined;

    if (media?.stream?.h265) {
      for (const stream of media.stream.h265) {
        streams.push({ ...stream, _codec: 'h265' });
      }
    }
    if (media?.stream?.h264) {
      for (const stream of media.stream.h264) {
        streams.push({ ...stream, _codec: 'h264' });
      }
    }

    if (streams.length) {
      streams.sort((a, b) => {
        if (a._codec !== b._codec) {
          if (a._codec === 'h265') return -1;
          if (b._codec === 'h265') return 1;
        }
        const bitrateA = a.avgBitrate ?? a.videoBitrate ?? 0;
        const bitrateB = b.avgBitrate ?? b.videoBitrate ?? 0;
        return bitrateB - bitrateA;
      });

      result.视频链接 = streams[0].masterUrl ?? null;
      if (streams.length > 1) {
        result.备用视频链接 = streams[1].masterUrl ?? null;
      }
    }

    const consumer = videoObj.consumer as { originVideoKey?: string } | undefined;
    if (!result.视频链接 && consumer?.originVideoKey) {
      result.视频链接 = `http://sns-video-bd.xhscdn.com/${consumer.originVideoKey}`;
    }
  }

  if (imageList?.length) {
    for (const img of imageList) {
      const imageUrl = img.url || img.urlDefault || img.urlPre;
      if (imageUrl) {
        result.图片.push(processImageUrl(imageUrl));
      }

      const stream = img.stream as { h264?: StreamItem[]; h265?: StreamItem[] } | undefined;
      let liveVideoUrl: string | null = null;
      if (stream?.h264?.[0]?.masterUrl) {
        liveVideoUrl = stream.h264[0].masterUrl;
      } else if (stream?.h265?.[0]?.masterUrl) {
        liveVideoUrl = stream.h265[0].masterUrl;
      }

      if (liveVideoUrl) {
        result.实况图.push({
          图片: processImageUrl(imageUrl ?? ''),
          视频: liveVideoUrl,
        });
      }
    }

    if (result.实况图.length) {
      result.类型 = 'live';
    }
  }

  return result;
}

function extractJson(html: string, id: string): XhsNoteData | null {
  const pattern = /<script>\s*window\.__INITIAL_STATE__\s*=\s*({[\s\S]*?})<\/script>/i;
  const match = html.match(pattern);
  if (!match) return null;

  const jsonStr = match[1].replace(/undefined/g, 'null');
  let json: Record<string, unknown>;
  try {
    json = JSON.parse(jsonStr) as Record<string, unknown>;
  } catch {
    return null;
  }

  const noteRoot = json.note as { noteDetailMap?: Record<string, { note?: Record<string, unknown> }> } | undefined;
  let note = noteRoot?.noteDetailMap?.[id]?.note ?? null;

  if (!note) {
    const noteData = json.noteData as { data?: { noteData?: Record<string, unknown> } } | undefined;
    note = noteData?.data?.noteData ?? null;
  }

  if (note) {
    return formatNoteData(note);
  }

  return null;
}

/** 从页面或链接里挖 xsec_token（分享短链重定向后 query 里就带着，这是最可靠来源） */
function extractXsecToken(...sources: string[]): string {
  for (const src of sources) {
    const s = String(src || '');
    if (!s) continue;
    const queryMatch = s.match(/[?&]xsec_token=([^&\s"']+)/i);
    if (queryMatch?.[1]) return queryMatch[1];
    const jsonMatch = s.match(/"xsec_token"\s*:\s*"([^"]+)"/);
    if (jsonMatch?.[1]) return jsonMatch[1];
    const legacyMatch = s.match(/token=(.*?)&/);
    if (legacyMatch?.[1]) return legacyMatch[1];
  }
  return '';
}

/**
 * 带 xsec_token 重试。两条路都试：
 *   ① web 页面 URL 拼 token（社区通用做法，Spider_XHS 等均如此）
 *   ② 旧版 discovery/item 接口（老实现，留作兜底）
 */
async function tryParseWithToken(url: string, id: string, response: string, cookie = ''): Promise<XhsNoteData | null> {
  const token = extractXsecToken(url, response);
  if (!token) return null;

  // ① web 页面 + xsec_token（xsec_source 用 pc_search，分享场景 pc_feed 也常见，两者都试）
  for (const source of ['pc_search', 'pc_feed']) {
    const webUrl = `https://www.xiaohongshu.com/explore/${id}?xsec_token=${token}&xsec_source=${source}`;
    const webResponse = await requestPage(webUrl, EDGE_USER_AGENT, cookie);
    if (webResponse) {
      const data = extractJson(webResponse, id);
      if (data) return data;
    }
  }

  // ② 旧版 app 接口兜底
  const apiUrl = `https://www.xiaohongshu.com/discovery/item/${id}?app_platform=android&ignoreEngage=true&app_version=8.69.5&share_from_user_hidden=true&xsec_source=app_share&type=video&xsec_token=${token}`;
  const apiResponse = await requestPage(apiUrl, EDGE_USER_AGENT, cookie);
  if (!apiResponse) return null;
  return extractJson(apiResponse, id);
}

/**
 * 解析小红书链接
 * @param urlInput 原始链接
 * @param ctx 含「小红书」登录 Cookie（a1/web_session，WebUI「视频解析」页配置）
 */
export async function parse(urlInput: string, ctx?: LocalVideoApiCtx): Promise<XhsParseResult> {
  try {
    const cookie = resolveCookie(ctx);
    let url = cleanUrlTail(stripTags(urlInput.trim()));
    if (!url) {
      throw new Error('请输入小红书链接');
    }

    if (!isAllowedDomain(url, ALLOWED_DOMAINS)) {
      throw new Error('不允许的域名，仅支持小红书官方链接');
    }

    // xhs.com → xhslink.com 修正；xhslink.cn 无需改（已是有效短链域）
    url = url.replace(/^https?:\/\/xhs\.com\//i, 'https://xhslink.com/');

    const domain = new URL(url).hostname;
    let id: string | null;

    if (domain === 'www.xiaohongshu.com') {
      id = extractId(url);
    } else {
      url = await getRealUrl(url);
      id = extractId(url);
    }

    if (!id) {
      throw new Error(`链接格式错误，无法提取ID。处理后的链接: ${url}`);
    }

    // 注意：getRealUrl 返回的重定向 URL 里通常带着 xsec_token，务必用完整 URL 请求
    let response = await requestPage(url, EDGE_USER_AGENT, cookie);
    if (!response) {
      throw new Error(cookie ? '请求失败（Cookie 已配置，可能已失效，请到「视频解析」页刷新）' : '请求失败（未配置 Cookie，请在「视频解析」页粘贴小红书网页版 Cookie）');
    }

    let data = extractJson(response, id);

    if (!data) {
      response = (await requestPage(url, BACKUP_UA, cookie)) || response;
      data = extractJson(response, id);
    }

    if (!data) {
      data = await tryParseWithToken(url, id, response, cookie);
    }

    if (data) {
      return { success: true, data };
    }

    throw new Error(
      cookie
        ? '解析失败，未找到有效内容（Cookie 可能已失效，请刷新）'
        : '解析失败，未找到有效内容（多数笔记需登录态，请在「视频解析」页配置小红书 Cookie）',
    );
  } catch (e) {
    return {
      success: false,
      error: e instanceof Error ? e.message : '解析失败',
      code: 400,
    };
  }
}

function stripTags(text: string): string {
  return text.replace(/<[^>]*>/g, '');
}

export default { parse };
