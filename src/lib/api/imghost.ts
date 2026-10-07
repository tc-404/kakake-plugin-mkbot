// ---------------------------------------------------------------------------
// 聚合图床：58同城 → fuliba(pngcm) → IMGDD，失败依次切换
// ---------------------------------------------------------------------------

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

const CDN58_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.6261.95 Safari/537.36';

export interface ImghostInput {
  buffer?: Buffer;
  filepath?: string;
  url?: string;
  filename?: string;
}

export interface ImghostResult {
  code: number;
  msg: string;
  data?: {
    url: string;
    source: ImghostSource;
  };
}

type ImghostSource = 'cdn58' | 'pngcm' | 'imgdd';

function ok(source: ImghostSource, url: string): ImghostResult {
  return { code: 0, msg: 'success', data: { url, source } };
}

function fail(msg: string): ImghostResult {
  return { code: -1, msg };
}

function guid(): string {
  const hex = crypto.randomBytes(16).toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(12, 15)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

function randomAlphaNum(len: number): string {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let out = '';
  for (let i = 0; i < len; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

function cdn58Encrypt(data: string): string {
  let str = Buffer.from(data, 'utf8').toString('base64');
  const equalCount = (str.match(/=/g) || []).length;
  str = str.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '') + String(equalCount);
  const half = Math.floor(str.length / 2);
  return str.slice(half) + str.slice(0, half);
}

function mimeByExt(ext: string): string {
  const map: Record<string, string> = {
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    gif: 'image/gif',
    bmp: 'image/bmp',
    webp: 'image/webp',
  };
  return map[ext.toLowerCase()] || 'application/octet-stream';
}

async function resolveUploadPayload(input: ImghostInput): Promise<{ buffer: Buffer; filename: string }> {
  if (input.buffer && input.buffer.length > 0) {
    const filename = input.filename || `upload_${Date.now()}.jpg`;
    return { buffer: input.buffer, filename };
  }
  if (input.filepath) {
    const abs = path.isAbsolute(input.filepath) ? input.filepath : path.resolve(input.filepath);
    if (!fs.existsSync(abs)) throw new Error('文件不存在');
    const buffer = fs.readFileSync(abs);
    const filename = input.filename || path.basename(abs);
    return { buffer, filename };
  }
  if (input.url) {
    const res = await fetch(input.url, { redirect: 'follow' });
    if (!res.ok) throw new Error(`下载图片失败 HTTP ${res.status}`);
    const ab = await res.arrayBuffer();
    const buffer = Buffer.from(ab);
    let filename = input.filename || 'upload.jpg';
    try {
      const u = new URL(input.url);
      const base = path.basename(u.pathname);
      if (base && base.includes('.')) filename = base;
    } catch (_e) {}
    return { buffer, filename };
  }
  throw new Error('缺少图片内容（buffer / filepath / url）');
}

async function uploadCdn58(buffer: Buffer, filename: string): Promise<string> {
  const ext = path.extname(filename).replace(/^\./, '').toLowerCase();
  if (!['jpg', 'jpeg', 'png', 'gif', 'bmp'].includes(ext)) {
    throw new Error('58同城不支持该格式');
  }

  const userId = `58Anonymous${guid()}`;
  const userInfo = {
    user_id: userId,
    source: '14',
    im_token: userId,
    client_version: '1.0',
    client_type: 'pcweb',
    os_type: 'Chrome',
    os_version: '122.0.6261.95',
    appid: '10140-mcs@jitmouQrcHs',
    extend_flag: '0',
    unread_index: '1',
    sdk_version: '6432',
    device_id: userId,
    xxzl_smartid: '',
    id58: 'CkwAd2e0U3tBNxbRAzQ2Ag==',
  };
  const params = cdn58Encrypt(new URLSearchParams(userInfo as Record<string, string>).toString());
  const postBody = cdn58Encrypt(
    JSON.stringify({
      sender_id: userId,
      sender_source: 14,
      to_id: '10002',
      to_source: 100,
      file_suffixs: [ext],
    }),
  );

  const getUrl = `https://im.58.com/msg/get_pic_upload_url?params=${encodeURIComponent(params)}&version=j1.0`;
  const getRes = await fetch(getUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'text/plain;charset=UTF-8',
      Origin: 'https://ai.58.com',
      Referer: 'https://ai.58.com/pc/',
      'User-Agent': CDN58_UA,
    },
    body: postBody,
  });
  const getText = await getRes.text();
  const getJson = JSON.parse(getText);
  if (getJson?.error_code !== 0 || !getJson?.data?.upload_info?.[0]?.url) {
    throw new Error(getJson?.error_msg || '58同城获取上传地址失败');
  }

  const putUrl = String(getJson.data.upload_info[0].url);
  const putRes = await fetch(putUrl, {
    method: 'PUT',
    headers: { 'Content-Type': mimeByExt(ext) },
    body: new Uint8Array(buffer),
  });
  if (!putRes.ok) throw new Error(`58同城上传失败 HTTP ${putRes.status}`);

  const marker = '/nowater/im/';
  const idx = putUrl.indexOf(marker);
  if (idx < 0) throw new Error('58同城上传地址解析失败');
  const tail = putUrl.slice(idx + marker.length).split('?')[0];
  return `https://pic${Math.floor(Math.random() * 8) + 1}.58cdn.com.cn/nowater/im/${tail}`;
}

async function uploadPngcm(buffer: Buffer, filename: string): Promise<string> {
  const form = new FormData();
  form.append('name', filename);
  form.append('uuid', `o_${randomAlphaNum(27)}`);
  form.append('sign', String(Math.floor(Date.now() / 1000)));
  form.append('file', new Blob([new Uint8Array(buffer)]), filename);

  const res = await fetch('https://img.wnflb2023.com/application/upload.php', {
    method: 'POST',
    body: form,
    headers: { Referer: 'https://img.wnflb2023.com/' },
  });
  const arr = await res.json();
  if (arr?.code === 200 && arr?.url) return String(arr.url);
  throw new Error(arr?.message || 'fuliba 上传失败');
}

async function uploadImgdd(buffer: Buffer, filename: string): Promise<string> {
  const form = new FormData();
  form.append('image', new Blob([new Uint8Array(buffer)]), filename);

  const res = await fetch('https://imgdd.com/upload', {
    method: 'POST',
    body: form,
    headers: { Referer: 'https://imgdd.com/' },
  });
  const arr = await res.json();
  if (arr?.url) return String(arr.url);
  throw new Error(arr?.message || 'IMGDD 上传失败');
}

/** 聚合上传：58同城 → fuliba → IMGDD */
export async function upload(input: ImghostInput): Promise<ImghostResult> {
  let buffer: Buffer;
  let filename: string;
  try {
    ({ buffer, filename } = await resolveUploadPayload(input));
  } catch (e) {
    return fail(e instanceof Error ? e.message : String(e));
  }

  if (buffer.length > 10 * 1024 * 1024) {
    return fail('文件最大10M');
  }

  const chain: Array<{ source: ImghostSource; fn: () => Promise<string> }> = [
    { source: 'cdn58', fn: () => uploadCdn58(buffer, filename) },
    { source: 'pngcm', fn: () => uploadPngcm(buffer, filename) },
    { source: 'imgdd', fn: () => uploadImgdd(buffer, filename) },
  ];

  const errors: string[] = [];
  for (const item of chain) {
    try {
      const url = await item.fn();
      return ok(item.source, url);
    } catch (e) {
      errors.push(`${item.source}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  return fail(errors.join(' | ') || '全部图床上传失败');
}
