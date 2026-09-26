// ---------------------------------------------------------------------------
// 背景修改：自定义图写入读写目录，默认图只读插件包「默认资源/image」
// ---------------------------------------------------------------------------

import fs from 'fs';
import path from 'path';
import { getDataPath, getPluginPath, readB } from '../data-fs';
import { getRenderMode } from './image-render';
import type { MkReadB } from '../types';

export const BG_EDIT_REL_DIR = path.join('筱筱吖', '扩展功能', '背景修改');
export const BG_EDIT_EXTS = ['.png', '.jpg', '.jpeg', '.webp'] as const;

export type BgEditSlotId =
  | 'menu'
  | 'menu-portrait'
  | 'api-menu'
  | 'status'
  | 'wallet'
  | 'fish-basket'
  | 'music-list'
  | 'join-identity'
  | `fortune-${number}`;

export interface BgEditSlot {
  id: string;
  label: string;
  customStem: string;
  defaultName: string;
  /** 默认图方向，供 WebUI 预览框按比例显示 */
  orientation: BgEditOrientation;
  /** Sharp 模式下另有默认图时填写（如运行状态竖版卡） */
  defaultNameSharp?: string;
  orientationSharp?: BgEditOrientation;
}

export type BgEditOrientation = 'landscape' | 'portrait';

export const BG_EDIT_SLOTS: BgEditSlot[] = [
  { id: 'menu', label: '导航菜单（横）', customStem: '自定义-菜单', defaultName: 'heng.jpg', orientation: 'landscape' },
  { id: 'menu-portrait', label: '导航菜单（竖）', customStem: '自定义-菜单竖', defaultName: 'shu.jpg', orientation: 'portrait' },
  { id: 'api-menu', label: '接口功能菜单', customStem: '自定义-接口菜单', defaultName: 'shu.jpg', orientation: 'portrait' },
  {
    id: 'status',
    label: '运行状态',
    customStem: '自定义-运行状态',
    // HTML 渲染仍是 1400x900 横版；Sharp 渲染已改竖版卡，默认底图为运势5
    defaultName: '运行状态.jpg',
    orientation: 'landscape',
    defaultNameSharp: '运势5.png',
    orientationSharp: 'portrait',
  },
  { id: 'wallet', label: '我的信息', customStem: '自定义-我的信息', defaultName: '运行状态.jpg', orientation: 'landscape' },
  { id: 'fish-basket', label: '我的鱼篓', customStem: '自定义-我的鱼篓', defaultName: '运势13.png', orientation: 'portrait' },
  { id: 'music-list', label: '点歌列表', customStem: '自定义-点歌列表', defaultName: '运势6.png', orientation: 'portrait' },
  { id: 'join-identity', label: '入群身份', customStem: '自定义-入群身份', defaultName: 'heng.jpg', orientation: 'landscape' },
  ...Array.from({ length: 17 }, (_, i) => ({
    id: `fortune-${i + 1}`,
    label: `今日运势 ${i + 1}`,
    customStem: `自定义-运势${i + 1}`,
    defaultName: `运势${i + 1}.png`,
    orientation: 'portrait' as BgEditOrientation,
  })),
];

const MIME_BY_EXT: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
};

const EXT_BY_MIME: Record<string, string> = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/jpg': '.jpg',
  'image/webp': '.webp',
};

export function getBgEditSlot(id: string): BgEditSlot | null {
  const key = String(id || '').trim();
  return BG_EDIT_SLOTS.find((s) => s.id === key) || null;
}

/** 当前渲染模式；读不到配置时按 html 处理 */
function currentRenderMode(): 'html' | 'sharp' {
  try {
    return getRenderMode(readB as MkReadB);
  } catch {
    return 'html';
  }
}

/** 槽位在指定渲染模式下的默认图文件名 */
export function resolveSlotDefaultName(slot: BgEditSlot | null, mode?: 'html' | 'sharp'): string {
  if (!slot) return '';
  const useMode = mode || currentRenderMode();
  if (useMode === 'sharp' && slot.defaultNameSharp) return slot.defaultNameSharp;
  return slot.defaultName;
}

/** 槽位在指定渲染模式下的图片方向，WebUI 预览框据此选比例 */
export function resolveSlotOrientation(
  slot: BgEditSlot | null,
  mode?: 'html' | 'sharp',
): BgEditOrientation {
  if (!slot) return 'landscape';
  const useMode = mode || currentRenderMode();
  if (useMode === 'sharp' && slot.orientationSharp) return slot.orientationSharp;
  return slot.orientation;
}

export function getBgEditDirAbs(): string {
  return path.join(getDataPath(), BG_EDIT_REL_DIR);
}

function listImageNameCandidates(rawName: string): string[] {
  const base = String(rawName || '').trim();
  if (!base) return [];
  const out: string[] = [];
  const add = (name: string) => {
    const s = String(name || '').trim();
    if (s && !out.includes(s)) out.push(s);
  };
  add(base);
  const ext = path.extname(base);
  const stem = ext ? path.basename(base, ext) : base;
  if (!ext) {
    for (const e of BG_EDIT_EXTS) add(`${stem}${e}`);
  }
  return out;
}

export function resolveBundledDefaultImageAbs(defaultName: string): string {
  const plugin = String(getPluginPath() || '').trim();
  if (!plugin) return '';
  const dir = path.join(plugin, '默认资源', 'image');
  for (const name of listImageNameCandidates(defaultName)) {
    if (path.isAbsolute(name) && fs.existsSync(name)) return name;
    const abs = path.join(dir, name);
    if (fs.existsSync(abs)) return abs;
  }
  return '';
}

export function resolveCustomBgAbs(id: string): string {
  const slot = getBgEditSlot(id);
  if (!slot) return '';
  const dir = getBgEditDirAbs();
  if (!dir || !fs.existsSync(dir)) return '';
  for (const ext of BG_EDIT_EXTS) {
    const abs = path.join(dir, `${slot.customStem}${ext}`);
    if (fs.existsSync(abs)) return abs;
  }
  return '';
}

export function resolveEffectiveBgAbs(id: string, mode?: 'html' | 'sharp'): string {
  return (
    resolveCustomBgAbs(id) ||
    resolveBundledDefaultImageAbs(resolveSlotDefaultName(getBgEditSlot(id), mode))
  );
}

export function fileToDataUrl(absPath: string): string {
  if (!absPath || !fs.existsSync(absPath)) return '';
  try {
    const ext = String(path.extname(absPath) || '').toLowerCase();
    const mime = MIME_BY_EXT[ext] || 'application/octet-stream';
    const buf = fs.readFileSync(absPath);
    if (!buf || !buf.length) return '';
    return `data:${mime};base64,${buf.toString('base64')}`;
  } catch {
    return '';
  }
}

function removeCustomFiles(slot: BgEditSlot): void {
  const dir = getBgEditDirAbs();
  if (!dir || !fs.existsSync(dir)) return;
  for (const ext of BG_EDIT_EXTS) {
    const abs = path.join(dir, `${slot.customStem}${ext}`);
    try {
      if (fs.existsSync(abs)) fs.unlinkSync(abs);
    } catch {
      /* ignore */
    }
  }
}

export function resetCustomBg(id: string): boolean {
  const slot = getBgEditSlot(id);
  if (!slot) return false;
  removeCustomFiles(slot);
  return true;
}

export function parseImageDataUrl(dataUrl: string): { ext: string; buffer: Buffer } | null {
  const raw = String(dataUrl || '').trim();
  const m = raw.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,([A-Za-z0-9+/=\s]+)$/);
  if (!m) return null;
  const mime = m[1].toLowerCase();
  const ext = EXT_BY_MIME[mime];
  if (!ext) return null;
  try {
    const buffer = Buffer.from(m[2].replace(/\s+/g, ''), 'base64');
    if (!buffer.length) return null;
    return { ext, buffer };
  } catch {
    return null;
  }
}

export function setCustomBg(id: string, buffer: Buffer, ext: string): string {
  const slot = getBgEditSlot(id);
  if (!slot) throw new Error('未知背景槽位');
  const normalized = String(ext || '').toLowerCase();
  const useExt = (BG_EDIT_EXTS as readonly string[]).includes(normalized)
    ? normalized
    : normalized === '.jpeg'
      ? '.jpg'
      : '';
  if (!useExt) throw new Error('仅支持 png / jpg / webp');
  const dir = getBgEditDirAbs();
  fs.mkdirSync(dir, { recursive: true });
  removeCustomFiles(slot);
  const abs = path.join(dir, `${slot.customStem}${useExt === '.jpeg' ? '.jpg' : useExt}`);
  fs.writeFileSync(abs, buffer);
  return abs;
}

export function listBgEditSlotsPayload(): Array<{
  id: string;
  label: string;
  defaultName: string;
  orientation: BgEditOrientation;
  hasCustom: boolean;
  customStem: string;
}> {
  const mode = currentRenderMode();
  return BG_EDIT_SLOTS.map((slot) => ({
    id: slot.id,
    label: slot.label,
    defaultName: resolveSlotDefaultName(slot, mode),
    orientation: resolveSlotOrientation(slot, mode),
    customStem: slot.customStem,
    hasCustom: Boolean(resolveCustomBgAbs(slot.id)),
  }));
}
