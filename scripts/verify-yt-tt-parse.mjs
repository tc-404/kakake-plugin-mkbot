/**
 * 验收：YouTube Shorts + TikTok /t/ 短链必须能解析出准确元数据与可达直链。
 * 用法：先 npm run build，再 node scripts/verify-yt-tt-parse.mjs
 */
import { pathToFileURL } from 'url';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import { KAKAKE_PLUGIN_NAME } from './plugin-constants.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
const apiDir = resolve(root, KAKAKE_PLUGIN_NAME, 'lib', 'api');

const YT_URL = 'https://youtube.com/shorts/K5AHxnWuf0k?si=_fJXs_Ul17AfcvHs';
const TT_URL = 'https://www.tiktok.com/t/ZP83m5oDY/';

function fail(msg) {
  console.error(`[verify-yt-tt] FAIL: ${msg}`);
  process.exitCode = 1;
}

function ok(msg) {
  console.log(`[verify-yt-tt] OK: ${msg}`);
}

async function loadParse(name) {
  const file = resolve(apiDir, `${name}.mjs`);
  if (!fs.existsSync(file)) {
    fail(`缺少构建产物 ${file}`);
    return null;
  }
  const mod = await import(`${pathToFileURL(file).href}?t=${Date.now()}`);
  if (typeof mod.parse !== 'function') {
    fail(`${name}.mjs 未导出 parse`);
    return null;
  }
  return mod.parse;
}

async function probeStream(url, extraHeaders = {}) {
  const headers = {
    'User-Agent':
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    Accept: '*/*',
    ...extraHeaders,
  };
  try {
    let res = await fetch(url, { method: 'HEAD', headers, redirect: 'follow' });
    if (res.ok || res.status === 206) return res.status;
    res = await fetch(url, {
      method: 'GET',
      headers: { ...headers, Range: 'bytes=0-1' },
      redirect: 'follow',
    });
    try {
      await res.arrayBuffer();
    } catch {
      // ignore
    }
    if (res.ok || res.status === 206) return res.status;
    return res.status;
  } catch (e) {
    throw new Error(e instanceof Error ? e.message : String(e));
  }
}

async function verifyYoutube() {
  const parse = await loadParse('yt');
  if (!parse) return;
  const r = await parse(YT_URL);
  console.log('[verify-yt-tt] YouTube result:', {
    code: r.code,
    msg: r.msg,
    title: r.data?.title,
    author: r.data?.author,
    video_id: r.data?.video_id,
    cover: r.data?.cover?.slice?.(0, 80),
    url: r.data?.url?.slice?.(0, 100),
  });
  if (r.code !== 200 || r.data?.type !== 'video') {
    fail(`YouTube code/type 异常: ${r.code} ${r.data?.type}`);
    return;
  }
  if (r.data.video_id !== 'K5AHxnWuf0k') fail(`videoId 期望 K5AHxnWuf0k 实际 ${r.data.video_id}`);
  if (!/SPIDER MAN vs RTX 5090/i.test(r.data.title || '')) fail(`标题未命中 SPIDER MAN vs RTX 5090: ${r.data.title}`);
  if (!/The Classic Ali/i.test(r.data.author || '')) fail(`作者未命中 The Classic Ali: ${r.data.author}`);
  if (!/^https?:\/\//i.test(r.data.cover || '')) fail('封面不是 http(s) URL');
  if (!/^https?:\/\//i.test(r.data.url || '')) fail('视频直链不是 http(s) URL');
  const status = await probeStream(r.data.url, { Referer: 'https://www.youtube.com/' });
  if (status < 200 || status >= 400) fail(`YouTube 直链探测失败 HTTP ${status}`);
  else ok(`YouTube 直链可达 HTTP ${status}`);
  ok('YouTube 验收通过');
}

async function verifyTikTok() {
  const parse = await loadParse('tt');
  if (!parse) return;
  const r = await parse(TT_URL);
  console.log('[verify-yt-tt] TikTok result:', {
    code: r.code,
    msg: r.msg,
    title: r.data?.title,
    author: r.data?.author,
    video_id: r.data?.video_id,
    cover: r.data?.cover?.slice?.(0, 80),
    url: r.data?.url?.slice?.(0, 100),
    hasCookie: Boolean(r.data?.cookie),
  });
  if (r.code !== 200 || r.data?.type !== 'video') {
    fail(`TikTok code/type 异常: ${r.code} ${r.data?.type}`);
    return;
  }
  if (!/daisiki/i.test(r.data.author || '')) fail(`作者未命中 daisiki: ${r.data.author}`);
  if (!/(messy sheets|bedsheetholder)/i.test(r.data.title || '')) {
    fail(`标题未命中 messy sheets / bedsheetholder: ${r.data.title}`);
  }
  if (r.data.video_id && r.data.video_id !== '7677523688740244758') {
    fail(`video_id 期望 7677523688740244758 实际 ${r.data.video_id}`);
  }
  if (!/^https?:\/\//i.test(r.data.cover || '')) fail('封面不是 http(s) URL');
  if (!/^https?:\/\//i.test(r.data.url || '')) fail('视频直链不是 http(s) URL');
  const headers = { Referer: 'https://www.tiktok.com/' };
  if (r.data.cookie) headers.Cookie = r.data.cookie;
  const status = await probeStream(r.data.url, headers);
  if (status < 200 || status >= 400) fail(`TikTok 直链探测失败 HTTP ${status}`);
  else ok(`TikTok 直链可达 HTTP ${status}`);
  ok('TikTok 验收通过');
}

/** 群内正则应能从样例原文抠出链接 */
function verifyRegexMatch() {
  const ytText = `看看这个 ${YT_URL} 哈哈`;
  const ttText = `分享 ${TT_URL}`;
  const yt =
    ytText.match(/https?:\/\/(?:www\.|m\.|music\.)?youtube\.com\/(?:shorts|embed|live)\/[\w-]+(?:\?[^\s\]]*)?/i)?.[0]
    || ytText.match(/https?:\/\/(?:www\.|m\.|music\.)?youtube\.com\/watch\?[^\s\]]+/i)?.[0]
    || ytText.match(/https?:\/\/youtu\.be\/[\w-]+(?:\?[^\s\]]*)?/i)?.[0];
  const tt =
    ttText.match(/https?:\/\/(?:www\.)?tiktok\.com\/t\/[\w-]+\/?(?:\?[^\s\]]*)?/i)?.[0]
    || ttText.match(/https?:\/\/(?:vm|vt|t)\.tiktok\.com\/[\w-]+\/?(?:\?[^\s\]]*)?/i)?.[0]
    || ttText.match(/https?:\/\/(?:www\.|m\.)?tiktok\.com\/@[^/\s\]]+\/video\/\d+(?:\?[^\s\]]*)?/i)?.[0];
  if (!yt || !yt.includes('K5AHxnWuf0k')) fail(`群正则未匹配 YouTube Shorts: ${yt}`);
  else ok(`群正则匹配 YouTube: ${yt}`);
  if (!tt || !tt.includes('/t/ZP83m5oDY')) fail(`群正则未匹配 TikTok /t/: ${tt}`);
  else ok(`群正则匹配 TikTok: ${tt}`);
}

verifyRegexMatch();
await verifyYoutube();
await verifyTikTok();
if (process.exitCode) {
  console.error('[verify-yt-tt] 验收未通过');
  process.exit(process.exitCode);
}
console.log('[verify-yt-tt] 全部验收通过');
