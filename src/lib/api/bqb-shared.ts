// ---------------------------------------------------------------------------
// 表情制作（bqb）公共：头像拉取、圆形裁剪、透明画布合成、多帧 GIF
// ---------------------------------------------------------------------------

import fs from 'fs';
import path from 'path';
import { loadSharp, type SharpFactory } from '../sharp-loader';

export type BqbSharp = SharpFactory;

export interface BqbFrameLoc {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface BqbFrameLocRot extends BqbFrameLoc {
  angle?: number;
}

export type BqbAssetKind =
  | 'crawl'
  | 'play'
  | 'bite'
  | 'petpet'
  | 'eat'
  | 'suck'
  | 'jiujiu'
  | 'scratch_head'
  | 'rub'
  | 'abstinence'
  | 'acg_entrance'
  | 'addiction'
  | 'dont_touch'
  | 'fade_away'
  | 'pound'
  | 'sold_out'
  | 'taunt'
  | 'think_what'
  | 'what_i_want_to_do'
  | 'you_dont_get';

/** 拉取 QQ 头像（失败返回 null） */
export async function fetchQqAvatarBuffer(qq: string | number): Promise<Buffer | null> {
  const id = String(qq ?? '').trim();
  if (!id || !/^\d{5,12}$/.test(id)) return null;
  // s=5：按现有项目约定取小尺寸头像（更快、足够合成用途）
  const url = `https://q1.qlogo.cn/g?b=qq&nk=${id}&s=5`;
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(5000),
      headers: { 'User-Agent': 'Mozilla/5.0' },
    });
    if (!res.ok) return null;
    const ab = await res.arrayBuffer();
    if (!ab || ab.byteLength < 32) return null;
    return Buffer.from(ab);
  } catch {
    return null;
  }
}

/** 按 URL 拉取头像/图片 */
export async function fetchUrlImageBuffer(url: string): Promise<Buffer | null> {
  const u = String(url ?? '').trim();
  if (!/^https?:\/\//i.test(u)) return null;
  try {
    const res = await fetch(u, {
      signal: AbortSignal.timeout(8000),
      headers: { 'User-Agent': 'Mozilla/5.0' },
    });
    if (!res.ok) return null;
    const ab = await res.arrayBuffer();
    if (!ab || ab.byteLength < 32) return null;
    return Buffer.from(ab);
  } catch {
    return null;
  }
}

/** 居中裁方 + 可选圆形遮罩 */
export async function prepareAvatarPng(
  sharp: BqbSharp,
  avatarBuf: Buffer,
  options: { circle?: boolean; size?: number } = {},
): Promise<Buffer> {
  const circle = options.circle !== false;
  const size = Math.max(0, Math.floor(Number(options.size) || 0));

  const meta = await sharp(avatarBuf).metadata();
  const aw = Number(meta.width) || 0;
  const ah = Number(meta.height) || 0;

  let pipeline = sharp(avatarBuf).rotate().ensureAlpha();
  if (aw > 0 && ah > 0 && aw !== ah) {
    const side = Math.min(aw, ah);
    const left = Math.floor((aw - side) / 2);
    const top = Math.floor((ah - side) / 2);
    pipeline = sharp(avatarBuf).rotate().extract({ left, top, width: side, height: side }).ensureAlpha();
  }

  if (size > 0) {
    pipeline = pipeline.resize(size, size, { fit: 'fill', kernel: 'lanczos3' });
  }

  let png = await pipeline.png().toBuffer();
  if (!circle) return png;

  const info = await sharp(png).metadata();
  const side = Math.max(1, Number(info.width) || size || 100);
  const mask = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${side}" height="${side}">` +
      `<circle cx="${side / 2}" cy="${side / 2}" r="${side / 2}" fill="white"/></svg>`,
  );
  return sharp(png)
    .ensureAlpha()
    .composite([{ input: mask, blend: 'dest-in' }])
    .png()
    .toBuffer();
}

/** 按比例缩放到框内 + 椭圆遮罩（啾啾） */
export async function prepareAvatarOvalFitPng(
  sharp: BqbSharp,
  avatarBuf: Buffer,
  maxW: number,
  maxH: number,
): Promise<Buffer> {
  const png = await sharp(avatarBuf)
    .rotate()
    .resize(maxW, maxH, { fit: 'inside', kernel: 'linear' })
    .ensureAlpha()
    .png()
    .toBuffer();
  const info = await sharp(png).metadata();
  const w = Math.max(1, Number(info.width) || maxW);
  const h = Math.max(1, Number(info.height) || maxH);
  const mask = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">` +
      `<ellipse cx="${w / 2}" cy="${h / 2}" rx="${w / 2}" ry="${h / 2}" fill="white"/></svg>`,
  );
  return sharp(png)
    .ensureAlpha()
    .composite([{ input: mask, blend: 'dest-in' }])
    .png()
    .toBuffer();
}

/** 透明画布：头像在下、模板在上（与 PHP below=true 一致） */
export async function composeAvatarUnderTemplate(
  sharp: BqbSharp,
  templatePath: string,
  avatarPng: Buffer,
  loc: BqbFrameLoc,
): Promise<Buffer> {
  const tplMeta = await sharp(templatePath).metadata();
  const cw = Math.max(1, Number(tplMeta.width) || 1);
  const ch = Math.max(1, Number(tplMeta.height) || 1);
  const w = Math.max(1, Math.floor(loc.w));
  const h = Math.max(1, Math.floor(loc.h));
  const x = Math.floor(loc.x);
  const y = Math.floor(loc.y);

  const avatarResized = await sharp(avatarPng)
    .resize(w, h, { fit: 'fill', kernel: 'linear' })
    .png()
    .toBuffer();

  const templatePng = await sharp(templatePath).ensureAlpha().png().toBuffer();

  return sharp({
    create: {
      width: cw,
      height: ch,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite([
      { input: avatarResized, left: x, top: y },
      { input: templatePng, left: 0, top: 0 },
    ])
    .png()
    .toBuffer();
}

/** 模板为底图，头像叠在上层（挠头等） */
export async function composeAvatarOverTemplate(
  sharp: BqbSharp,
  templatePath: string,
  avatarPng: Buffer,
  loc: BqbFrameLoc,
): Promise<Buffer> {
  const w = Math.max(1, Math.floor(loc.w));
  const h = Math.max(1, Math.floor(loc.h));
  const x = Math.floor(loc.x);
  const y = Math.floor(loc.y);
  const avatarResized = await sharp(avatarPng)
    .resize(w, h, { fit: 'fill', kernel: 'linear' })
    .png()
    .toBuffer();
  return sharp(templatePath)
    .ensureAlpha()
    .composite([{ input: avatarResized, left: x, top: y }])
    .png()
    .toBuffer();
}

/** 白底 + 头像 + 模板叠层（吸） */
export async function composeAvatarOnWhiteWithTemplate(
  sharp: BqbSharp,
  templatePath: string,
  avatarPng: Buffer,
  loc: BqbFrameLoc,
): Promise<Buffer> {
  const tplMeta = await sharp(templatePath).metadata();
  const cw = Math.max(1, Number(tplMeta.width) || 1);
  const ch = Math.max(1, Number(tplMeta.height) || 1);
  const w = Math.max(1, Math.floor(loc.w));
  const h = Math.max(1, Math.floor(loc.h));
  const x = Math.floor(loc.x);
  const y = Math.floor(loc.y);
  const avatarResized = await sharp(avatarPng)
    .resize(w, h, { fit: 'fill', kernel: 'linear' })
    .png()
    .toBuffer();
  const templatePng = await sharp(templatePath).ensureAlpha().png().toBuffer();
  return sharp({
    create: {
      width: cw,
      height: ch,
      channels: 4,
      background: { r: 255, g: 255, b: 255, alpha: 1 },
    },
  })
    .composite([
      { input: avatarResized, left: x, top: y },
      { input: templatePng, left: 0, top: 0 },
    ])
    .png()
    .toBuffer();
}

/** 贴贴：模板底 + 目标头像 + 发送者头像（可旋转） */
export async function composeRubFrame(
  sharp: BqbSharp,
  templatePath: string,
  selfAvatarPng: Buffer,
  targetAvatarPng: Buffer,
  targetLoc: BqbFrameLoc,
  selfLoc: BqbFrameLocRot,
): Promise<Buffer> {
  const targetResized = await sharp(targetAvatarPng)
    .resize(Math.max(1, Math.floor(targetLoc.w)), Math.max(1, Math.floor(targetLoc.h)), {
      fit: 'fill',
      kernel: 'lanczos3',
    })
    .png()
    .toBuffer();

  let selfPipeline = sharp(selfAvatarPng).resize(
    Math.max(1, Math.floor(selfLoc.w)),
    Math.max(1, Math.floor(selfLoc.h)),
    { fit: 'fill', kernel: 'lanczos3' },
  );
  const angle = Number(selfLoc.angle) || 0;
  if (angle !== 0) {
    selfPipeline = selfPipeline.rotate(angle, { background: { r: 0, g: 0, b: 0, alpha: 0 } });
  }
  const selfResized = await selfPipeline.png().toBuffer();

  return sharp(templatePath)
    .ensureAlpha()
    .composite([
      { input: targetResized, left: Math.floor(targetLoc.x), top: Math.floor(targetLoc.y) },
      { input: selfResized, left: Math.floor(selfLoc.x), top: Math.floor(selfLoc.y) },
    ])
    .png()
    .toBuffer();
}

/** 多帧 PNG → 动画 GIF（delay 毫秒；loop=0 无限） */
export async function encodeGifFromPngFrames(
  sharp: BqbSharp,
  frames: Buffer[],
  delayMs: number | number[],
): Promise<Buffer> {
  if (!frames.length) throw new Error('bqb: empty gif frames');

  const firstMeta = await sharp(frames[0]).metadata();
  const fw = Math.max(1, Number(firstMeta.width) || 1);
  const fh = Math.max(1, Number(firstMeta.height) || 1);

  const normalized: Buffer[] = [];
  for (const frame of frames) {
    normalized.push(
      await sharp(frame)
        .ensureAlpha()
        .resize(fw, fh, { fit: 'fill' })
        .png()
        .toBuffer(),
    );
  }

  const delays = Array.isArray(delayMs)
    ? delayMs.map((d) => Math.max(20, Math.floor(d)))
    : Math.max(20, Math.floor(delayMs));

  return sharp({
    create: {
      width: fw,
      height: fh * normalized.length,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
      pageHeight: fh,
    },
  })
    .composite(normalized.map((input, i) => ({ input, left: 0, top: i * fh })))
    .gif({
      delay: delays,
      loop: 0,
      effort: 1,
    })
    .toBuffer();
}

export async function getBqbSharp(): Promise<BqbSharp> {
  return loadSharp();
}

/** 解析素材子目录：优先数据目录，其次插件包内 data */
export function resolveBqbSubdir(
  kind: BqbAssetKind,
  dataPath: string,
  pluginDir: string,
): string {
  const rel = path.join('默认资源', 'image', 'api', 'bqb', kind);
  const pluginDirSafe = String(pluginDir || '').trim();
  const candidates = [
    path.join(pluginDirSafe, rel),
  ];
  for (const p of candidates) {
    if (p && fs.existsSync(p)) return p;
  }
  return candidates[0] || '';
}

export function listNumberedFiles(dir: string, ext: string, pad = 0): string[] {
  if (!dir || !fs.existsSync(dir)) return [];
  const want = ext.toLowerCase().replace(/^\./, '');
  return fs
    .readdirSync(dir)
    .filter((n) => n.toLowerCase().endsWith(`.${want}`))
    .sort((a, b) => {
      const na = Number(path.parse(a).name.replace(/\D/g, '')) || 0;
      const nb = Number(path.parse(b).name.replace(/\D/g, '')) || 0;
      return na - nb;
    })
    .map((n) => path.join(dir, n));
}

export function templatePath(dir: string, index: number, ext: string, pad = 0): string {
  const name =
    pad > 0
      ? `${String(index).padStart(pad, '0')}.${ext}`
      : `${index}.${ext}`;
  return path.join(dir, name);
}
