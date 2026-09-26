// ---------------------------------------------------------------------------
// Sharp 渲染：运行状态卡片（竖屏 · 清澈玻璃主卡 + 卡通配色小组件）
// 默认背景：默认资源/image/运势5.png
// ---------------------------------------------------------------------------

import fs from 'fs';
import https from 'https';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import type { MkLoggerResolved } from '../types';
import { loadSharp } from './sharp-loader';
import { runCardSharpJob } from './sharp-worker-client';
import { loadSharpBgEffectsFromDataPath, type SharpBgEffects } from './sharp-bg-effects';
import { loadSharpTextColorFromDataPath, resolveSharpTextFill } from './sharp-text-color';
import { MDI_ICON_PATHS, MDI_ICON_VIEWBOX } from './mdi-icons';

export interface StatusKeyProcessRow {
  /** 展示名：宿主框架名 / MKbot / QQ / 协议框架 */
  label: string;
  /** 实际进程名或说明（如「同宿主进程」「未检测到」） */
  name: string;
  pid: string;
  memoryMB: string;
  cpuPercent: string;
  running?: boolean;
}

/** 单个磁盘：字节为原始数值，格式化交给渲染端统一处理 */
export interface StatusDiskVolume {
  /** 盘符或挂载点，如 C: 或 / */
  name: string;
  /** 卷标 / 文件系统，可为空 */
  label?: string;
  total: number;
  free: number;
  used: number;
}

/**
 * 置顶卡里的单个账号（多账号时逐行展示）。
 * avatar 为空 = 该账号没有头像，位置留空，不画占位图。
 */
export interface StatusAccountEntry {
  /** 机器人 QQ 号（官方机器人可能没有，留空即可不显示） */
  qq?: string;
  /** 官方机器人的 AppID（QQ 号为空时名字下方改为显示它） */
  appId?: string;
  name: string;
  avatar?: string;
  /** 连接类型文案，如 OneBot / QQ 官方机器人 */
  typeText?: string;
  /** 正反向文案，如 反向 WS / 正向 WS / 官方 HTTPS */
  directionText?: string;
  /** 连接状态文案，如 已连接 / 未连接 / 已关闭 */
  statusText?: string;
  /**
   * 连接阶段（决定头像描边颜色）：
   * connected 绿 / reconnecting·connecting·waiting 黄 / failed 红 / disabled 及其他白
   */
  phase?: string;
  connected?: boolean;
}

export interface StatusSharpRenderOptions {
  name: string;
  qq: string;
  type: string;
  arch: string;
  hostname?: string;
  cpuModel?: string;
  cpuCount: number;
  cpuUsagePercent: string | number;
  totalMemoryGB: string;
  usedMemoryGB?: string;
  freeMemoryGB?: string;
  memoryUsagePercent: string | number;
  diskTotalGB: string;
  diskUsedGB: string;
  diskFreeGB: string;
  diskUsagePercent: string | number;
  /** 各磁盘明细：为空时退回单条「系统磁盘」汇总显示 */
  diskVolumes?: StatusDiskVolume[];
  /** 今日日志统计：收到 / 发出的条数（undefined 表示取不到，显示 —） */
  recvCount?: number;
  sentCount?: number;
  nodeVersion?: string;
  pluginVersion?: string;
  frameworkName?: string;
  /** 宿主框架版本号（页脚「框架名 + 版本」气泡用） */
  frameworkVersion?: string;
  systemUptimeSec?: number;
  pluginUptimeSec?: number;
  processMemoryMB?: string;
  /** 主网卡展示名 */
  netInterface?: string;
  /** 实时下行 / 上行速率（字节每秒） */
  netRxRate?: number;
  netTxRate?: number;
  /** 累计接收 / 发送字节 */
  netRxTotal?: number;
  netTxTotal?: number;
  /** 网卡计数器是否取到 */
  netAvailable?: boolean;
  generatedAt?: string;
  backgroundImageUrl?: string;
  bgLocalPath?: string;
  pluginPath?: string;
  keyProcesses?: StatusKeyProcessRow[];
  /**
   * 多账号列表（置顶卡展示）。为空时退回单账号：把 name / qq 当成唯一账号。
   * 头像缺失（avatar 为空）时该位置留空，不画占位头像。
   */
  accounts?: StatusAccountEntry[];
  pluginDir?: string;
  dataPath?: string;
  width?: number;
  height?: number;
}
const STATUS_BG_REMOTE_URL =
  'http://xn--mk-ub3cl61ae1v.xn--c5w857b.xn--fiqs8s/mkbot/image/yunxing.jpg';

/** 竖屏宽度固定，高度由内容排布推导（见 computeLayout / STATUS_CARD_HEIGHT） */
export const STATUS_CARD_WIDTH = 800;

/** 本地默认背景候选：优先 运势5，其次旧的运行状态图 */
const LOCAL_BG_NAMES = [
  '运势5.png',
  '运势5.jpg',
  '运势5.jpeg',
  '运势5.webp',
  '运行状态.jpg',
  '运行状态.png',
  'yunxing.jpg',
];

const FONT = 'Microsoft YaHei, PingFang SC, Noto Sans SC, sans-serif';

/** 二次元糖果配色：纯色扁平填充，饱和度统一，不做立体渐变 */
const HUE = {
  blue: '#5B9CFF',
  purple: '#A183FF',
  green: '#3FCF9A',
  pink: '#FF8FB4',
  orange: '#FFAC5B',
  cyan: '#4FCBE3',
  yellow: '#FFCF5C',
  red: '#FF7B8A',
} as const;

const INK = '#2B2440';
const INK_SOFT = 'rgba(43,36,64,0.68)';
// —— 清澈玻璃参数（卡面透光/折射全部由光栅层负责，SVG 只画一圈边缘）——
/**
 * 玻璃体模糊半径：几乎不模糊——要的是「透明玻璃板」，
 * 只留 1px 级别的柔化让背景边界略微软化，看得出隔着一层介质。
 */
const GLASS_BLUR = 0.7;
/** 玻璃体饱和度增益：玻璃透光会略微加深色彩 */
const GLASS_SATURATION = 1.06;
/**
 * 透光曲线：out = in * CONTRAST + LIFT。
 * CONTRAST 越接近 1 越清澈（背景细节保留），LIFT 只把暗部抬起来给文字保底亮度。
 */
const GLASS_CONTRAST = 0.88;
const GLASS_LIFT = 26;
/**
 * 玻璃透镜：由内向外多层折射带（from/to 为距卡边的内缩距离）。
 * push = 把卡外多少像素的景物压缩进卡内，越贴边压得越多，
 * 于是边缘会像真实玻璃板的磨边一样把周围景物折进来，并且保持清晰而不是糊成一片。
 */
const LENS_BANDS: { from: number; to: number; push: number; feather: number; soft: number; disperse?: boolean }[] = [
  { from: 15, to: 30, push: 5, feather: 4, soft: 0.6 },
  { from: 5, to: 17, push: 15, feather: 3.5, soft: 0.5 },
  { from: 0, to: 8, push: 32, feather: 2.4, soft: 0.4, disperse: true },
];
/** 卡内整体压缩取样量：让卡面内部也处在玻璃之下 */
const BODY_PUSH = 6;
/** 透镜总深度基准（按卡片短边自适应缩放） */
const LENS_DEPTH = 30;
/** 边缘色散：红/蓝通道压缩量的相对差，制造玻璃边的棱镜光 */
const LENS_DISPERSION = 0.14;
/** 磨边高光：贴边内侧的一圈亮光（玻璃厚度的反光） */
const MENISCUS_FROM = 1.2;
const MENISCUS_TO = 10;
const MENISCUS_BLUR = 2.6;
const MENISCUS_ALPHA = 0.5;
/** 虚线分割线 */
const DASH_PATTERN = '9 7';
/** 各主卡的描边点缀色（与 layout.glass 顺序一致） */
const CARD_HUES: string[] = [
  HUE.pink,
  HUE.blue,
  HUE.pink,
  HUE.purple,
  HUE.green,
  HUE.blue,
  HUE.cyan,
  HUE.pink,
];

function escapeXml(text: string): string {
  return String(text ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function toPercentNum(v: string | number): number {
  const n = Number(String(v ?? '').replace('%', '').trim());
  return Number.isFinite(n) ? Math.min(100, Math.max(0, n)) : 0;
}

function fmtPercent(v: number): string {
  return `${v.toFixed(v % 1 === 0 ? 0 : 1)}%`;
}

/** #RRGGBB → rgba(r,g,b,a) */
function alpha(hex: string, a: number): string {
  const m = /^#([0-9a-f]{6})$/i.exec(String(hex || '').trim());
  if (!m) return `rgba(255,255,255,${a})`;
  const int = parseInt(m[1], 16);
  const r = (int >> 16) & 255;
  const g = (int >> 8) & 255;
  const b = int & 255;
  return `rgba(${r},${g},${b},${a})`;
}

/** 负载配色：低=绿 / 中=橙 / 高=红 */
function usageHue(percent: number): string {
  if (percent < 60) return HUE.green;
  if (percent < 85) return HUE.orange;
  return HUE.red;
}

/** #RRGGBB 提亮（amt>0）/ 压暗（amt<0），范围 -1 ~ 1 */
function shade(hex: string, amt: number): string {
  const m = /^#([0-9a-f]{6})$/i.exec(String(hex || '').trim());
  if (!m) return String(hex || '#ffffff');
  const int = parseInt(m[1], 16);
  const mix = (c: number) =>
    amt >= 0 ? Math.round(c + (255 - c) * amt) : Math.round(c * (1 + amt));
  const hex2 = (c: number) => Math.max(0, Math.min(255, c)).toString(16).padStart(2, '0');
  return `#${hex2(mix((int >> 16) & 255))}${hex2(mix((int >> 8) & 255))}${hex2(mix(int & 255))}`;
}

/** 粗略文本宽度：中日韩全宽字符按字号计，其余按 0.56 字号计 */
function textWidth(text: string, fontSize: number): number {
  let w = 0;
  for (const ch of String(text || '')) {
    w += /[\u2e80-\u9fff\uff00-\uffef]/.test(ch) ? fontSize : fontSize * 0.56;
  }
  return w;
}

/** 字节 → 1.23 GB / 456.7 MB（卡片里的累计流量） */
function formatTraffic(bytes?: number): string {
  const v = Math.max(0, Number(bytes) || 0);
  if (v <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
  let i = 0;
  let n = v;
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024;
    i += 1;
  }
  return `${n.toFixed(n >= 100 || i === 0 ? 0 : n >= 10 ? 1 : 2)} ${units[i]}`;
}

/** 字节每秒 → 1.2 MB/s（速率单独一个格式，带 /s） */
function formatRate(bytesPerSec?: number): string {
  return `${formatTraffic(bytesPerSec)}/s`;
}

/** 宽度自适应截断：能完整放下就绝不加省略号；放不下才截断并补一个省略号（永不换行） */
function fitText(text: string, fontSize: number, maxWidth: number): string {
  const s = String(text ?? '').trim();
  if (!s || maxWidth <= 0) return s;
  if (textWidth(s, fontSize) <= maxWidth) return s;
  const dotW = textWidth('…', fontSize);
  let out = '';
  let w = 0;
  for (const ch of s) {
    const cw = textWidth(ch, fontSize);
    if (w + cw + dotW > maxWidth) break;
    out += ch;
    w += cw;
  }
  return `${out.trimEnd()}…`;
}

/** 图标库图标（Material Design Icons，24x24 填充路径），按中心点摆放 */
function mdiIcon(name: string, cx: number, cy: number, size: number, fill = '#ffffff'): string {
  const paths = MDI_ICON_PATHS[name];
  if (!paths || !paths.length) return '';
  const scale = size / MDI_ICON_VIEWBOX;
  const tx = cx - size / 2;
  const ty = cy - size / 2;
  const body = paths.map((d) => `<path d="${d}"/>`).join('');
  return `<g transform="translate(${tx.toFixed(2)} ${ty.toFixed(2)}) scale(${scale.toFixed(4)})" fill="${fill}">${body}</g>`;
}

function healthLabel(worst: number): string {
  if (worst < 60) return '状态良好';
  if (worst < 85) return '负载偏高';
  return '负载告警';
}

/** 秒 → “3天05时12分” / “05时12分” / “12分34秒” */
function formatUptime(seconds?: number): string {
  const total = Math.max(0, Math.floor(Number(seconds) || 0));
  const d = Math.floor(total / 86400);
  const h = Math.floor((total % 86400) / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const p2 = (n: number) => String(n).padStart(2, '0');
  if (d > 0) return `${d}天${p2(h)}时${p2(m)}分`;
  if (h > 0) return `${p2(h)}时${p2(m)}分`;
  if (m > 0) return `${p2(m)}分${p2(s)}秒`;
  return `${s}秒`;
}
function fetchUrlBuffer(url: string, timeoutMs = 20000): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith('https') ? https : http;
    const req = lib.get(
      url,
      { timeout: timeoutMs, headers: { 'User-Agent': 'MKbot-StatusSharp/2.0' } },
      (res) => {
        if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          fetchUrlBuffer(res.headers.location, timeoutMs).then(resolve).catch(reject);
          return;
        }
        if (res.statusCode && res.statusCode >= 400) {
          reject(new Error(`HTTP ${res.statusCode}`));
          res.resume();
          return;
        }
        const chunks: Buffer[] = [];
        res.on('data', (c) => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)));
        res.on('end', () => resolve(Buffer.concat(chunks)));
        res.on('error', reject);
      },
    );
    req.on('error', reject);
    req.on('timeout', () => req.destroy(new Error('timeout')));
  });
}

function decodeDataUrl(dataUrl: string): Buffer | null {
  const m = String(dataUrl || '').match(/^data:[^;]+;base64,(.+)$/i);
  if (!m) return null;
  try {
    return Buffer.from(m[1], 'base64');
  } catch {
    return null;
  }
}

async function loadStatusBackground(
  backgroundImageUrl: string,
  bgLocalPath: string,
  pluginDir: string,
  pluginPath: string,
  dataPath: string,
): Promise<Buffer | null> {
  const candidates: string[] = [];
  const push = (v?: string) => {
    const s = String(v || '').trim();
    if (s && !candidates.includes(s)) candidates.push(s);
  };
  push(bgLocalPath);

  const roots = [
    path.join(String(dataPath || '').trim(), '默认资源', 'image'),
    path.join(String(pluginPath || '').trim(), 'data', '默认资源', 'image'),
    path.join(String(pluginDir || '').trim(), 'data', '默认资源', 'image'),
    path.join(String(pluginDir || '').trim(), '默认资源', 'image'),
  ];
  for (const root of roots) {
    if (!String(root || '').trim()) continue;
    for (const name of LOCAL_BG_NAMES) push(path.join(root, name));
  }

  push(backgroundImageUrl);
  if (backgroundImageUrl !== STATUS_BG_REMOTE_URL) push(STATUS_BG_REMOTE_URL);

  for (const src of candidates) {
    try {
      if (/^data:/i.test(src)) {
        const buf = decodeDataUrl(src);
        if (buf && buf.length) return buf;
        continue;
      }
      if (/^file:\/\//i.test(src)) {
        const abs = fileURLToPath(src);
        if (fs.existsSync(abs)) return fs.readFileSync(abs);
        continue;
      }
      if (/^https?:\/\//i.test(src)) {
        const buf = await fetchUrlBuffer(src, 12000);
        if (buf.length > 0) return buf;
        continue;
      }
      if (fs.existsSync(src)) return fs.readFileSync(src);
    } catch (_e) {
      /* try next */
    }
  }
  return null;
}

// ============================== 布局 ==============================

interface GlassRect {
  x: number;
  y: number;
  w: number;
  h: number;
  rx: number;
}
interface EnvGroupBox {
  /** 分组顶部（标题行）*/
  y: number;
  /** 分组内容起始 y */
  bodyY: number;
  rows: number;
  kind: 'chip' | 'proc';
  height: number;
}

/** 账号卡片落位（每个连接一张独立卡片） */
interface AccountCardBox {
  /** 账号下标（对应 accounts 数组） */
  index: number;
  x: number;
  y: number;
  w: number;
  h: number;
  /** wide：单列满宽（气泡排右侧）；grid：双列窄卡（气泡落到第二行） */
  variant: 'wide' | 'grid';
  /** 头像落位，size 为直径；账号没有头像时该位置留空不画 */
  avatar: { x: number; y: number; size: number };
}

/** 负载环落位 */
interface DonutSlot {
  cx: number;
  cy: number;
  colW: number;
}

interface StatusLayout {
  width: number;
  height: number;
  pad: number;
  cardW: number;
  titlePill: GlassRect;
  /** 顶部行：接收 / 发送两枚等宽气泡，靠右上角 */
  recvPill: GlassRect;
  sentPill: GlassRect;
  /** 账号卡片（每个连接一张独立卡片，不再嵌套在置顶卡里） */
  accountCards: AccountCardBox[];
  /** 账号卡片是否双列（≥4 个） */
  accountTwoCols: boolean;
  /** 基本数据卡（承载四枚负载环，原「运行内存」卡） */
  basic: GlassRect;
  /** 基本数据卡内的四枚负载环落位 */
  basicDonuts: DonutSlot[];
  disk: GlassRect;
  /** 磁盘卡实际渲染的行数（1~5） */
  diskRows: number;
  net: GlassRect;
  env: GlassRect;
  envGroups: EnvGroupBox[];
  /** 页脚：每项内容一张独立的窄气泡卡片 */
  footerBubbles: GlassRect[];
  /** 页脚气泡对应的文案（与 footerBubbles 一一对应） */
  footerTexts: string[];
  glass: GlassRect[];
  footerY: number;
}

/** 卡片外边距与卡间距：统一 18px，避免出现大片空白 */
const CARD_PAD = 26;
const CARD_GAP = 18;
/** 各卡片内部：标题基线 42 → 虚线 58 → 正文 74，正文不会压到分割线 */
const TITLE_BASE = 42;
const DASH_OFFSET = 16;
const BODY_TOP = 74;
/**
 * 顶部一行：标题胶囊 + 接收气泡 + 发送气泡 + 更新时间胶囊。
 * 四者同行、不换行，宽度精确分配（合计 = 卡片可用宽度）。
 */
const TOP_ROW_H = 44;
const TOP_ROW_GAP = 8;
const TOP_TITLE_W = 256;
/** 接收 / 发送两枚气泡：固定同宽（必须一模一样），靠右上角摆放 */
const TOP_TAG_W = 136;

/**
 * 账号卡片：每个连接独立成卡，不再嵌在置顶卡里。
 * - 1 个：默认单列满宽（wide），两枚标签同一行居右；
 * - ≥2 个：双列（grid）窄卡，两枚标签上下排在右上角；奇数个时最后一张占满整行。
 * 两种形态**等高、头像同径**，内容在卡内垂直居中，这样头像下方不会留出一块空位。
 */
const ACC_WIDE_H = 84;
const ACC_GRID_H = 84;
const ACC_CARD_GAP = 14;
const ACC_CARD_PAD = 14;
const ACC_AV_WIDE = 52;
const ACC_AV_GRID = 52;
/** 卡片内的气泡标签：高度 / 间距 */
const ACC_CHIP_H = 22;
const ACC_CHIP_GAP = 6;

/** 基本数据卡：四枚负载环整块高度与环心相对块顶的偏移 */
const DONUT_BLOCK_H = 130;
const DONUT_CY_IN_BLOCK = 59;
/** 页脚：每项内容独立成气泡卡片 */
const FOOT_H = 34;
const FOOT_GAP = 10;
/** 迷你负载环：外半径 / 环宽 / 列宽 / 列间距 / 右侧留白 */
const MINI_R = 33;
const MINI_STROKE = 10;
const MINI_COL_W = 92;
const MINI_COL_GAP = 6;
const MINI_RIGHT_PAD = 14;
/** 迷你负载环文字：中文名在环上方（距环 GAP），百分比与说明在环下方 */
const MINI_ICON = 30;
const MINI_NAME_GAP = 11;
const MINI_PCT_GAP = 21;
const MINI_SUB_GAP = 34;
/** 迷你负载环组的圆心距资料卡顶部的距离（下方要留出标签行） */
const MINI_CY_OFFSET = 68;
/** 资料卡：昵称 / QQ 号字号（QQ 号加大，彩虹渐变字看得清） */
const QQ_FONT = 18;
/** 资料卡底部标签行：群聊 / 好友 / 接收 / 发送，整行等分格子后逐枚居中 */
const TAG_ROW_H = 27;
const TAG_ROW_SIDE = 24;
const TAG_ROW_BOTTOM = 8;
/** 容量小卡（内存） */
const BAR_TILE_H = 96;
/** 磁盘储存卡：每行一个磁盘，最多 5 行（超出时第 5 行合并剩余） */
const DISK_ROW_H = 52;
const DISK_ROW_STEP = 58;
const MAX_DISK_ROWS = 5;
/** 磁盘行：名称列自适应宽度（短盘符时收窄，进度条随之变长）+ 右侧占用文字预留 */
const DISK_NAME_MIN_W = 46;
const DISK_NAME_MAX_W = 190;
const DISK_NAME_GAP = 18;
const DISK_RIGHT_RESERVE = 250;
/** 网络数据卡：上方数据流动场景 + 下方四枚流量小卡 */
const NET_FLOW_H = 124;
const NET_STAT_H = 60;
const NET_STAT_GAP = 12;
/** 运行环境卡：分组标题 + 参数胶囊 / 关键进程行 */
const ENV_CAPTION_H = 26;
const ENV_CHIP_H = 34;
const ENV_CHIP_STEP = 40;
const ENV_PROC_H = 28;
const ENV_PROC_STEP = 32;
/** 关键进程分组：行上方的列名行高度 */
const ENV_PROC_HEAD_H = 18;
/** 关键进程列位置：进程名列左边界 / PID 列右边界（距行右侧） */
const PROC_NAME_X = 118;
const PROC_PID_R = 186;
const ENV_GROUP_GAP = 20;
/** 四个分组：系统 3 行胶囊 / 版本 2 行 / 时长 1 行 / 关键进程 3 行 */
const ENV_GROUP_SPEC: { kind: 'chip' | 'proc'; rows: number }[] = [
  { kind: 'chip', rows: 3 },
  { kind: 'chip', rows: 2 },
  { kind: 'chip', rows: 1 },
  { kind: 'proc', rows: 3 },
];

function layoutEnvGroups(envY: number): { groups: EnvGroupBox[]; height: number } {
  const groups: EnvGroupBox[] = [];
  let y = envY + BODY_TOP;
  ENV_GROUP_SPEC.forEach((spec, i) => {
    const step = spec.kind === 'chip' ? ENV_CHIP_STEP : ENV_PROC_STEP;
    // 关键进程组在标题下多留一行放列名（PID / 内存 / CPU）
    const head = ENV_CAPTION_H + (spec.kind === 'proc' ? ENV_PROC_HEAD_H : 0);
    const height = head + spec.rows * step;
    groups.push({ y, bodyY: y + head, rows: spec.rows, kind: spec.kind, height });
    y += height;
    if (i < ENV_GROUP_SPEC.length - 1) y += ENV_GROUP_GAP;
  });
  return { groups, height: y - envY + 12 };
}

// ============================== 账号卡片布局 ==============================

/**
 * 账号卡片落位：每个连接一张独立卡片（不再嵌套在置顶卡里）。
 * - 1 个：默认单列满宽（wide），头像偏大、两枚标签同一行居右；
 * - ≥2 个：双列（grid）窄卡，两枚标签上下排在右上角；奇数个时最后一张占满整行，右侧不留空缺。
 */
function makeAccountCard(
  index: number,
  variant: 'wide' | 'grid',
  x: number,
  y: number,
  w: number,
): AccountCardBox {
  const size = variant === 'wide' ? ACC_AV_WIDE : ACC_AV_GRID;
  const h = variant === 'wide' ? ACC_WIDE_H : ACC_GRID_H;
  return {
    index,
    x,
    y,
    w,
    h,
    variant,
    // 头像在卡片内垂直居中（两种形态等高、头像同径）
    avatar: { x: x + ACC_CARD_PAD, y: y + (h - size) / 2, size },
  };
}

function planAccountCards(
  y: number,
  pad: number,
  cardW: number,
  count: number,
): { cards: AccountCardBox[]; height: number; twoCols: boolean } {
  // 只要满足 2 个连接就启用双列；只有 1 个时用默认（单列满宽）
  const twoCols = count >= 2;
  const cards: AccountCardBox[] = [];
  let cursor = y;
  let i = 0;
  if (!twoCols) {
    for (; i < count; i += 1) {
      cards.push(makeAccountCard(i, 'wide', pad, cursor, cardW));
      cursor += ACC_WIDE_H + ACC_CARD_GAP;
    }
  } else {
    const halfW = (cardW - ACC_CARD_GAP) / 2;
    while (i < count) {
      if (count - i === 1) {
        // 奇数个：最后一张占满整行，避免右侧空出一块
        cards.push(makeAccountCard(i, 'wide', pad, cursor, cardW));
        cursor += ACC_WIDE_H + ACC_CARD_GAP;
        i += 1;
      } else {
        cards.push(makeAccountCard(i, 'grid', pad, cursor, halfW));
        cards.push(makeAccountCard(i + 1, 'grid', pad + halfW + ACC_CARD_GAP, cursor, halfW));
        cursor += ACC_GRID_H + ACC_CARD_GAP;
        i += 2;
      }
    }
  }
  return { cards, height: cards.length ? cursor - ACC_CARD_GAP - y : 0, twoCols };
}

/** 排布计算：顶部一行、账号卡片、各数据卡与页脚气泡（导出便于单测与工具复用） */
export function computeLayout(
  width: number,
  minHeight = 0,
  diskRowCount = 2,
  accountCount = 1,
  footerParts: string[] = [],
): StatusLayout {
  const pad = CARD_PAD;
  const gap = CARD_GAP;
  const cardW = width - pad * 2;

  // 顶部一行：左侧标题胶囊 + 右上角两枚等宽接发气泡（同行、不换行）
  const topY = 24;
  const titlePill: GlassRect = { x: pad, y: topY, w: TOP_TITLE_W, h: TOP_ROW_H, rx: TOP_ROW_H / 2 };
  const sentPill: GlassRect = { x: width - pad - TOP_TAG_W, y: topY, w: TOP_TAG_W, h: TOP_ROW_H, rx: TOP_ROW_H / 2 };
  const recvPill: GlassRect = {
    x: sentPill.x - TOP_ROW_GAP - TOP_TAG_W,
    y: topY,
    w: TOP_TAG_W,
    h: TOP_ROW_H,
    rx: TOP_ROW_H / 2,
  };

  // 账号卡片：每个连接一张独立卡片
  const count = Math.max(1, Math.floor(accountCount) || 1);
  const accountPlan = planAccountCards(topY + TOP_ROW_H + gap, pad, cardW, count);
  const accBottom = accountPlan.cards.length
    ? Math.max(...accountPlan.cards.map((c) => c.y + c.h))
    : topY + TOP_ROW_H;

  // 基本数据卡：只放四枚负载环（原「运行内存」的容量条已移除）
  const basic: GlassRect = { x: pad, y: accBottom + gap, w: cardW, h: BODY_TOP + DONUT_BLOCK_H + 12, rx: 28 };
  const donutInnerX = basic.x + 22;
  const donutInnerW = basic.w - 44;
  const donutColW = (donutInnerW - MINI_COL_GAP * 3) / 4;
  const basicDonuts: DonutSlot[] = Array.from({ length: 4 }, (_, i) => ({
    cx: donutInnerX + donutColW / 2 + i * (donutColW + MINI_COL_GAP),
    cy: basic.y + BODY_TOP + DONUT_CY_IN_BLOCK,
    colW: donutColW,
  }));

  // 磁盘储存卡：每个磁盘一行，独立显示
  const diskRows = Math.max(1, Math.min(MAX_DISK_ROWS, Math.floor(diskRowCount) || 1));
  const diskH = BODY_TOP + diskRows * DISK_ROW_STEP - (DISK_ROW_STEP - DISK_ROW_H) + 12;
  const disk: GlassRect = { x: pad, y: basic.y + basic.h + gap, w: cardW, h: diskH, rx: 28 };

  // 网络数据卡：夹在「磁盘储存」与「运行环境」之间
  const netH = BODY_TOP + NET_FLOW_H + NET_STAT_GAP + NET_STAT_H + 14;
  const net: GlassRect = { x: pad, y: disk.y + disk.h + gap, w: cardW, h: netH, rx: 28 };

  const envY = net.y + net.h + gap;
  const envLayout = layoutEnvGroups(envY);
  const env: GlassRect = { x: pad, y: envY, w: cardW, h: envLayout.height, rx: 28 };

  // 页脚：每项内容一张独立气泡卡片，整行居中；内容为空则不出页脚
  const footTexts = footerParts.map((t) => String(t || '').trim()).filter(Boolean);
  const footWidths = footTexts.map((t) => Math.max(74, 26 + textWidth(t, 12.5) + 26));
  const footTotal = footWidths.reduce((a, b) => a + b, 0) + Math.max(0, footTexts.length - 1) * FOOT_GAP;
  const footH = footTexts.length ? FOOT_H : 0;
  const height = Math.max(minHeight, env.y + env.h + 12 + footH + 22);
  const footerBubbles: GlassRect[] = [];
  if (footH) {
    let fx = (width - footTotal) / 2;
    for (const w of footWidths) {
      footerBubbles.push({ x: fx, y: height - 22 - FOOT_H, w, h: FOOT_H, rx: FOOT_H / 2 });
      fx += w + FOOT_GAP;
    }
  }

  return {
    width,
    height,
    pad,
    cardW,
    titlePill,
    recvPill,
    sentPill,
    accountCards: accountPlan.cards,
    accountTwoCols: accountPlan.twoCols,
    basic,
    basicDonuts,
    disk,
    diskRows,
    net,
    env,
    envGroups: envLayout.groups,
    footerBubbles,
    footerTexts: footTexts,
    glass: [
      titlePill,
      recvPill,
      sentPill,
      ...accountPlan.cards.map((c) => ({ x: c.x, y: c.y, w: c.w, h: c.h, rx: 22 })),
      basic,
      disk,
      net,
      env,
      ...footerBubbles,
    ],
    footerY: footerBubbles.length ? footerBubbles[0].y + FOOT_H / 2 + 4.5 : height - 22 - FOOT_H / 2 + 4.5,
  };
}

/** 画布高度：由内容排布推导，保证底部不留空白 */
export const STATUS_CARD_HEIGHT = computeLayout(STATUS_CARD_WIDTH).height;

// ============================== SVG 组件 ==============================

/**
 * 主卡边缘：只画一圈玻璃镜边，其余光学（折射、磨边高光、光泽、底部沉影）
 * 全部在光栅层 buildCardGlass 里完成，避免多层描边把卡片框死。
 */
function glassCard(r: GlassRect, _hue: string, idx: number): string {
  const rimId = `gRim${idx}`;
  return [
    `<defs>`,
    // 玻璃边对环境光的包裹：顶部最亮，两侧收敛，底部回亮
    `<linearGradient id="${rimId}" x1="0" y1="0" x2="0.25" y2="1">`,
    `<stop offset="0%" stop-color="rgba(255,255,255,0.96)"/>`,
    `<stop offset="34%" stop-color="rgba(255,255,255,0.46)"/>`,
    `<stop offset="66%" stop-color="rgba(255,255,255,0.30)"/>`,
    `<stop offset="100%" stop-color="rgba(255,255,255,0.72)"/>`,
    `</linearGradient>`,
    `</defs>`,
    `<rect x="${r.x + 0.7}" y="${r.y + 0.7}" width="${r.w - 1.4}" height="${r.h - 1.4}" rx="${r.rx}" ry="${r.rx}" fill="none" stroke="url(#${rimId})" stroke-width="1.4"/>`,
  ].join('\n');
}

/** 图标标记：无底色，只有可换色的图标本体（图标库路径直接上色） */
function iconMark(x: number, y: number, size: number, hue: string, icon: string): string {
  return mdiIcon(icon, x + size / 2, y + size / 2, size, shade(hue, -0.14));
}

/** 小组件底：淡色磨砂片（卡面清澈后，密集小字靠这层保证清晰）+ 同色描边 */
function tileFlat(x: number, y: number, w: number, h: number, rx: number, hue: string, on = true): string {
  const fill = on ? alpha(shade(hue, 0.8), 0.5) : 'rgba(255,255,255,0.4)';
  const stroke = on ? alpha(hue, 0.36) : 'rgba(43,36,64,0.14)';
  return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}" ry="${rx}" fill="${fill}" stroke="${stroke}" stroke-width="1.3"/>`;
}

/** 卡片标题：图标徽章 + 标题（下方马克笔色块）+ 右侧说明 + 虚线分割 */
function sectionTitle(
  x: number,
  y: number,
  w: number,
  title: string,
  hint: string,
  hue: string,
  icon: string,
): string {
  const badge = 25;
  const textX = x + badge + 9;
  const titleW = textWidth(title, 20);
  return [
    iconMark(x, y - 19, badge, hue, icon),
    // 马克笔高亮：扁平色块压在标题文字下缘
    `<rect x="${textX - 2}" y="${y - 6}" width="${titleW + 6}" height="9" rx="4.5" fill="${alpha(hue, 0.34)}"/>`,
    `<text x="${textX}" y="${y}" font-family="${FONT}" font-size="20" font-weight="bold" fill="${INK}">${escapeXml(title)}</text>`,
    // 标题后的小星星：二次元点缀
    sparkle(textX + titleW + 13, y - 13, 11, hue, 0.7),
    hint
      ? `<text x="${x + w}" y="${y}" text-anchor="end" font-family="${FONT}" font-size="12.5" fill="${INK_SOFT}">${escapeXml(hint)}</text>`
      : '',
    `<line x1="${x}" y1="${y + DASH_OFFSET}" x2="${x + w}" y2="${y + DASH_OFFSET}" stroke="${alpha(hue, 0.5)}" stroke-width="2" stroke-linecap="round" stroke-dasharray="${DASH_PATTERN}"/>`,
  ].join('\n');
}

/** 圆角进度条：纯色轨道 + 纯色填充，两端圆头 */
function progressBar(x: number, y: number, w: number, h: number, percent: number, hue: string): string {
  const fillW = Math.max(h, Math.min(w, (w * percent) / 100));
  return [
    `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${h / 2}" fill="rgba(43,36,64,0.09)" stroke="${alpha(hue, 0.26)}" stroke-width="1.2"/>`,
    `<rect x="${x}" y="${y}" width="${fillW}" height="${h}" rx="${h / 2}" fill="${hue}"/>`,
  ].join('\n');
}

/** 装饰四角星：扁平点缀，用于头像与标题周围 */
function sparkle(cx: number, cy: number, size: number, color: string, opacity = 1): string {
  const g = mdiIcon('star-four-points', cx, cy, size, color);
  return opacity >= 1 ? g : `<g opacity="${opacity}">${g}</g>`;
}

/** 标准七彩：昵称 / QQ 号渐变字取色用 */
const RAINBOW = ['#FF5B6E', '#FF9F45', '#FFD84B', '#4BD98A', '#3FD0E8', '#5B9CFF', '#B072FF'] as const;

/**
 * 随机高亮彩虹渐变：从标准七彩里随机挑一个起点顺序取色，
 * 渐变按文字实际范围铺（userSpaceOnUse），所以每个字都吃到不同颜色而不是整体一个色。
 */
function rainbowTextGradient(id: string, x: number, y: number, w: number, h: number): string {
  const off = Math.floor(Math.random() * RAINBOW.length);
  const count = 5;
  const stops: string[] = [];
  for (let i = 0; i < count; i += 1) {
    const color = RAINBOW[(off + i) % RAINBOW.length];
    const at = (i / (count - 1)) * 100;
    stops.push(`<stop offset="${at.toFixed(1)}%" stop-color="${color}"/>`);
  }
  // 轻微随机斜角：不做成死板的水平渐变
  const tilt = (Math.random() * 0.5 - 0.25) * h;
  return [
    `<defs><linearGradient id="${id}" gradientUnits="userSpaceOnUse"`,
    ` x1="${x.toFixed(1)}" y1="${(y - tilt).toFixed(1)}" x2="${(x + w).toFixed(1)}" y2="${(y + h + tilt).toFixed(1)}">`,
    stops.join(''),
    `</linearGradient></defs>`,
  ].join('');
}

/** 透明标签的度量：宽度由内容撑开，供整行均匀分布时预先计算 */
const TAG_LABEL_FONT = 13.5;
const TAG_VALUE_FONT = 15;
function tagMetrics(h: number, label: string, value: string): {
  w: number;
  iconSize: number;
  padL: number;
  gapIcon: number;
  gapText: number;
} {
  const iconSize = h * 0.56;
  const padL = 11;
  const gapIcon = 6;
  const gapText = 6;
  const padR = 13;
  const w =
    padL + iconSize + gapIcon + textWidth(label, TAG_LABEL_FONT) + gapText + textWidth(value, TAG_VALUE_FONT) + padR;
  return { w, iconSize, padL, gapIcon, gapText };
}

/**
 * 透明标签：跟大卡片同一套玻璃语言——透光底 + 一圈亮边，不放高光横条也不用不透明糖果色；
 * 图标、文案、数值全部取自同一色相的深浅，数字比文案再深一档以便读数。
 */
function glassTag(
  x: number,
  y: number,
  h: number,
  hue: string,
  icon: string,
  label: string,
  value: string,
): { svg: string; w: number } {
  const { w, iconSize, padL, gapIcon, gapText } = tagMetrics(h, label, value);
  const r = h / 2;
  const cy = y + h / 2;
  const labelX = x + padL + iconSize + gapIcon;
  const valueX = labelX + textWidth(label, TAG_LABEL_FONT) + gapText;
  const svg = [
    `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" fill="#ffffff" fill-opacity="0.2"/>`,
    `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" fill="${alpha(hue, 0.16)}"/>`,
    `<rect x="${x + 0.6}" y="${y + 0.6}" width="${w - 1.2}" height="${h - 1.2}" rx="${r - 0.6}" fill="none" stroke="${alpha('#ffffff', 0.6)}" stroke-width="1.2"/>`,
    `<rect x="${x + 0.6}" y="${y + 0.6}" width="${w - 1.2}" height="${h - 1.2}" rx="${r - 0.6}" fill="none" stroke="${alpha(hue, 0.42)}" stroke-width="1"/>`,
    mdiIcon(icon, x + padL + iconSize / 2, cy, iconSize, shade(hue, -0.34)),
    `<text x="${labelX}" y="${cy + 4.8}" font-family="${FONT}" font-size="${TAG_LABEL_FONT}" font-weight="600" fill="${shade(hue, -0.36)}">${escapeXml(label)}</text>`,
    `<text x="${valueX}" y="${cy + 5}" font-family="${FONT}" font-size="${TAG_VALUE_FONT}" font-weight="bold" fill="${shade(hue, -0.52)}">${escapeXml(value)}</text>`,
  ].join('');
  return { svg, w };
}

/**
 * 迷你环形仪表：中文名在环的正上方，环内只放一枚放大的图标，百分比落在环的正下方。
 * 名称与说明都按列宽自适应：放得下就完整显示，放不下才截断补省略号，绝不换行。
 */
function miniDonut(
  cx: number,
  cy: number,
  colW: number,
  percent: number,
  hue: string,
  name: string,
  sub: string,
  icon: string,
): string {
  const strokeW = MINI_STROKE;
  const r = MINI_R - strokeW / 2;
  const circ = 2 * Math.PI * r;
  const arc = circ * (Math.max(0, Math.min(100, percent)) / 100);
  const dash = `${arc} ${Math.max(0, circ - arc)}`;
  const rot = `rotate(-90 ${cx} ${cy})`;
  const innerR = r - strokeW / 2 - 1;
  const maxW = colW - 4;
  return [
    // 组件正上方：中文名
    `<text x="${cx}" y="${cy - MINI_R - MINI_NAME_GAP}" text-anchor="middle" font-family="${FONT}" font-size="15" font-weight="bold" fill="${INK}">${escapeXml(fitText(name, 15, maxW))}</text>`,
    // 环体：淡底 + 轨道 + 进度弧，环内只放一枚放大的图标
    `<circle cx="${cx}" cy="${cy}" r="${innerR}" fill="#ffffff" fill-opacity="0.5"/>`,
    `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${alpha(hue, 0.22)}" stroke-width="${strokeW}"/>`,
    `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${hue}" stroke-width="${strokeW}"
      stroke-dasharray="${dash}" stroke-linecap="round" transform="${rot}"/>`,
    mdiIcon(icon, cx, cy, MINI_ICON, shade(hue, -0.06)),
    // 组件正下方：百分比 + 说明
    `<text x="${cx}" y="${cy + MINI_R + MINI_PCT_GAP}" text-anchor="middle" font-family="${FONT}" font-size="17" font-weight="bold" fill="${shade(hue, -0.32)}">${fmtPercent(percent)}</text>`,
    `<text x="${cx}" y="${cy + MINI_R + MINI_SUB_GAP}" text-anchor="middle" font-family="${FONT}" font-size="11" fill="${INK_SOFT}">${escapeXml(fitText(sub, 11, maxW))}</text>`,
  ].join('\n');
}

/** 小色点：纯色圆点，扁平无高光 */
function flatDot(cx: number, cy: number, r: number, hue: string, on = true): string {
  const fill = on ? hue : 'rgba(43,36,64,0.28)';
  return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${fill}"/>`;
}

/** 参数胶囊：扁平淡底 + 色点 + 标签（左）+ 数值（右对齐，按剩余宽度自适应，够宽就完整显示） */
function paramChip(
  x: number,
  y: number,
  w: number,
  hue: string,
  label: string,
  value: string,
): string {
  const h = ENV_CHIP_H;
  const cy = y + h / 2;
  const labelW = textWidth(label, 12.5);
  const valueMaxW = w - 12 - (26 + labelW) - 12;
  return [
    tileFlat(x, y, w, h, 12, hue),
    flatDot(x + 14, cy, 4.6, hue),
    `<text x="${x + 26}" y="${cy + 4.5}" font-family="${FONT}" font-size="12.5" fill="${INK_SOFT}">${escapeXml(label)}</text>`,
    `<text x="${x + w - 12}" y="${cy + 4.5}" text-anchor="end" font-family="${FONT}" font-size="13" font-weight="bold" fill="${INK}">${escapeXml(fitText(value, 13, valueMaxW))}</text>`,
  ].join('\n');
}

/** 分组小标题：小图标徽章 + 组名（右侧可带说明） */
function groupCaption(x: number, y: number, w: number, hue: string, text: string, icon: string, hint = ''): string {
  const badge = 18;
  return [
    iconMark(x, y + 2, badge, hue, icon),
    `<text x="${x + badge + 7}" y="${y + 16}" font-family="${FONT}" font-size="13.5" font-weight="bold" fill="${INK}">${escapeXml(text)}</text>`,
    hint
      ? `<text x="${x + w}" y="${y + 16}" text-anchor="end" font-family="${FONT}" font-size="11" fill="${INK_SOFT}">${escapeXml(hint)}</text>`
      : '',
  ].join('\n');
}

/** 关键进程行：名称 + 进程名 / PID / 内存 / CPU（名称与进程名按列宽自适应，够宽就完整显示） */
function keyProcRow(
  x: number,
  y: number,
  w: number,
  hue: string,
  row: StatusKeyProcessRow,
): string {
  const h = ENV_PROC_H;
  const cy = y + h / 2;
  const on = row.running !== false;
  const nameX = x + PROC_NAME_X;
  return [
    tileFlat(x, y, w, h, 11, hue, on),
    flatDot(x + 14, cy, 4.4, hue, on),
    `<text x="${x + 26}" y="${cy + 4.5}" font-family="${FONT}" font-size="12.5" font-weight="bold" fill="${INK}">${escapeXml(fitText(row.label || '-', 12.5, PROC_NAME_X - 34))}</text>`,
    `<text x="${nameX}" y="${cy + 4.5}" font-family="${FONT}" font-size="11.5" fill="${INK_SOFT}">${escapeXml(fitText(row.name || '-', 11.5, w - PROC_PID_R - 46 - PROC_NAME_X))}</text>`,
    `<text x="${x + w - PROC_PID_R}" y="${cy + 4.5}" text-anchor="end" font-family="${FONT}" font-size="11.5" fill="${INK_SOFT}">${escapeXml(String(row.pid || '—'))}</text>`,
    `<text x="${x + w - 92}" y="${cy + 4.5}" text-anchor="end" font-family="${FONT}" font-size="12.5" font-weight="bold" fill="${INK}">${escapeXml(String(row.memoryMB || '—'))}${on ? ' MB' : ''}</text>`,
    `<text x="${x + w - 12}" y="${cy + 4.5}" text-anchor="end" font-family="${FONT}" font-size="12" fill="${INK_SOFT}">${escapeXml(String(row.cpuPercent || '—'))}${on ? '%' : ''}</text>`,
  ].join('\n');
}

/** 半圆百分比仪表：扁平轨道 + 纯色弧线，数值在半圆下方 */
function halfGauge(cx: number, cy: number, r: number, percent: number, hue: string): string {
  const strokeW = Math.max(8, r * 0.26);
  const rad = r - strokeW / 2;
  const len = Math.PI * rad;
  const arc = len * (Math.max(0, Math.min(100, percent)) / 100);
  const semi = (rr: number) => `M${cx - rr} ${cy} A${rr} ${rr} 0 0 1 ${cx + rr} ${cy}`;
  return [
    `<path d="${semi(rad)}" fill="none" stroke="${alpha(hue, 0.22)}" stroke-width="${strokeW}" stroke-linecap="round"/>`,
    `<path d="${semi(rad)}" fill="none" stroke="${hue}" stroke-width="${strokeW}" stroke-linecap="round" stroke-dasharray="${arc} ${Math.max(0, len - arc)}"/>`,
    `<text x="${cx}" y="${cy + 18}" text-anchor="middle" font-family="${FONT}" font-size="15.5" font-weight="bold" fill="${shade(hue, -0.32)}">${fmtPercent(percent)}</text>`,
  ].join('\n');
}

/** 半圆仪表整体高度：弧线半径 + 下方数值文字 */
function halfGaugeMetrics(r: number): { rad: number; total: number } {
  const rad = r - Math.max(8, r * 0.26) / 2;
  return { rad, total: rad + 23 };
}

/** 容量小卡：左半圆仪表 + 横向进度条，底部三段小字居中均分 */
function barTile(
  x: number,
  y: number,
  w: number,
  h: number,
  hue: string,
  title: string,
  percent: number,
  stats: { label: string; value: string }[],
): string {
  const barX = x + 100;
  const barW = w - 120;
  const cols = stats.length || 1;
  const statY = y + h - 14;
  const gaugeR = 38;
  const gm = halfGaugeMetrics(gaugeR);
  // 半圆仪表在小卡内竖向居中：弧线 + 下方数值作为一个整体
  const gaugeCy = y + (h - gm.total) / 2 + gm.rad;
  const statSvg = stats.map((s, i) => {
    const cx = barX + (barW * (i + 0.5)) / cols;
    return `<text x="${cx}" y="${statY}" text-anchor="middle" font-family="${FONT}" font-size="12.5" fill="${INK_SOFT}">${escapeXml(s.label)} <tspan font-size="13" font-weight="bold" fill="${INK}">${escapeXml(s.value)}</tspan></text>`;
  });
  return [
    tileFlat(x, y, w, h, 18, hue),
    halfGauge(x + 56, gaugeCy, gaugeR, percent, hue),
    `<text x="${barX}" y="${y + 30}" font-family="${FONT}" font-size="15.5" font-weight="bold" fill="${INK}">${escapeXml(title)}</text>`,
    progressBar(barX, y + 42, barW, 16, percent, hue),
    ...statSvg,
  ].join('\n');
}

// ============================== 磁盘储存组件 ==============================

/** 一行磁盘的展示数据 */
interface DiskRowData {
  name: string;
  sub: string;
  percent: number;
  usedText: string;
  totalText: string;
}

/** 盘符是否为 Windows 形式（用于合并行的名字拼接方式） */
function isDriveLetter(name: string): boolean {
  return /^[A-Za-z]:$/.test(String(name || '').trim());
}

/**
 * 磁盘明细 → 展示行：最多 MAX_DISK_ROWS 行；
 * 超出时最后一行把剩余磁盘合并成一条，名字形如「其余磁盘(E:F:G:)」。
 */
function buildDiskRows(opts: StatusSharpRenderOptions): DiskRowData[] {
  const vols = (opts.diskVolumes || []).filter((v) => v && Number(v.total) > 0);
  if (!vols.length) {
    // 取不到明细：退回单条汇总（沿用调用方已格式化好的文本）
    return [
      {
        name: '系统磁盘',
        sub: '全部分区汇总',
        percent: toPercentNum(opts.diskUsagePercent),
        usedText: String(opts.diskUsedGB || '-'),
        totalText: String(opts.diskTotalGB || '-'),
      },
    ];
  }
  const single = (v: StatusDiskVolume): DiskRowData => {
    const total = Math.max(0, Number(v.total) || 0);
    const used = Math.max(0, Math.min(total, Number(v.used) || Math.max(0, total - (Number(v.free) || 0))));
    return {
      name: String(v.name || '-'),
      sub: String(v.label || '').trim() || '本地磁盘',
      percent: total > 0 ? (used / total) * 100 : 0,
      usedText: formatTraffic(used),
      totalText: formatTraffic(total),
    };
  };
  if (vols.length <= MAX_DISK_ROWS) return vols.map(single);

  const head = vols.slice(0, MAX_DISK_ROWS - 1).map(single);
  const rest = vols.slice(MAX_DISK_ROWS - 1);
  const total = rest.reduce((s, v) => s + Math.max(0, Number(v.total) || 0), 0);
  const used = rest.reduce(
    (s, v) => s + Math.max(0, Number(v.used) || Math.max(0, (Number(v.total) || 0) - (Number(v.free) || 0))),
    0,
  );
  const names = rest.map((v) => String(v.name || '').trim()).filter(Boolean);
  // 盘符形态合并成「FGH:」这样一串，其他形态（挂载点）按空格连接
  const joined = names.every(isDriveLetter)
    ? `${names.map((n) => n.replace(/:$/, '')).join('')}:`
    : names.join(' ');
  head.push({
    name: `其余磁盘(${joined})`,
    sub: `合并 ${rest.length} 个磁盘`,
    percent: total > 0 ? (used / total) * 100 : 0,
    usedText: formatTraffic(used),
    totalText: formatTraffic(total),
  });
  return head;
}

/** 磁盘行：盘符 + 卷标 + 进度条 + 占用百分比 + 已用/总计（一行一个磁盘，不放图标） */
function diskRow(x: number, y: number, w: number, hue: string, row: DiskRowData, nameColW: number): string {
  const h = DISK_ROW_H;
  const cy = y + h / 2;
  const nameX = x + 16;
  const barX = nameX + nameColW + DISK_NAME_GAP;
  const barW = Math.max(80, w - (barX - x) - DISK_RIGHT_RESERVE);
  const pct = Math.max(0, Math.min(100, row.percent));
  const rowHue = usageHue(pct);
  return [
    tileFlat(x, y, w, h, 14, hue),
    `<text x="${nameX}" y="${cy - 3}" font-family="${FONT}" font-size="15" font-weight="bold" fill="${INK}">${escapeXml(fitText(row.name, 15, nameColW))}</text>`,
    `<text x="${nameX}" y="${cy + 14}" font-family="${FONT}" font-size="11" fill="${INK_SOFT}">${escapeXml(fitText(row.sub, 11, nameColW))}</text>`,
    progressBar(barX, cy - 7, barW, 14, pct, rowHue),
    `<text x="${barX + barW + 14}" y="${cy + 5}" font-family="${FONT}" font-size="15" font-weight="bold" fill="${shade(rowHue, -0.32)}">${fmtPercent(pct)}</text>`,
    `<text x="${x + w - 14}" y="${cy + 5}" text-anchor="end" font-family="${FONT}" font-size="12" fill="${INK_SOFT}">已用 <tspan font-size="12.5" font-weight="bold" fill="${INK}">${escapeXml(row.usedText)}</tspan> · 共 <tspan font-size="12.5" font-weight="bold" fill="${INK}">${escapeXml(row.totalText)}</tspan></text>`,
  ].join('\n');
}

/**
 * 磁盘名列宽：取所有行里最宽的盘符 / 卷标，夹在上下限之间。
 * 全是「C:」这类短名时列宽自动收窄，省下来的横向空间全给进度条。
 */
function diskNameColWidth(rows: DiskRowData[]): number {
  let need = 0;
  for (const r of rows) {
    need = Math.max(need, textWidth(r.name, 15), textWidth(r.sub, 11));
  }
  return Math.max(DISK_NAME_MIN_W, Math.min(DISK_NAME_MAX_W, Math.ceil(need) + 6));
}

// ============================== 网络数据组件 ==============================

/** 数据流两端的节点：圆形淡底 + 大图标 + 下方名称 */
function netNode(cx: number, cy: number, r: number, hue: string, icon: string, caption: string): string {
  return [
    `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${alpha(shade(hue, 0.74), 0.6)}" stroke="${alpha(hue, 0.5)}" stroke-width="1.6"/>`,
    mdiIcon(icon, cx, cy, r * 1.08, shade(hue, -0.12)),
    `<text x="${cx}" y="${cy + r + 18}" text-anchor="middle" font-family="${FONT}" font-size="12" font-weight="bold" fill="${INK}">${escapeXml(caption)}</text>`,
  ].join('\n');
}

/**
 * 数据流管道：胶囊轨道 + 沿流向逐渐变亮的数据包 + 末端箭头 + 速率标签。
 * 速率越高数据包越多，速率为 0 时轨道转灰且不画包，一眼看出有没有流量。
 */
function netLane(
  x0: number,
  x1: number,
  cy: number,
  h: number,
  hue: string,
  dir: 'right' | 'left',
  rate: number,
  label: string,
  value: string,
  labelAbove: boolean,
): string {
  const len = Math.max(48, x1 - x0);
  const live = rate > 0;
  const pw = 15;
  const ph = h - 7;
  // 数据包数量：按速率映射到 3~8 个（2 MB/s 以上视为满速）
  const busy = Math.min(1, rate / (2 * 1024 * 1024));
  const count = live ? 3 + Math.round(busy * 5) : 0;
  const span = Math.max(0, len - 22 - pw);
  const packets: string[] = [];
  for (let i = 0; i < count; i += 1) {
    const t = count === 1 ? 1 : i / (count - 1);
    const px = x0 + 11 + span * (dir === 'right' ? t : 1 - t);
    const op = 0.3 + 0.7 * t;
    packets.push(
      `<rect x="${px.toFixed(1)}" y="${(cy - ph / 2).toFixed(1)}" width="${pw}" height="${ph}" rx="${(ph / 2).toFixed(1)}" fill="${hue}" fill-opacity="${op.toFixed(2)}"/>`,
    );
  }
  const tip = dir === 'right' ? x1 + 13 : x0 - 13;
  const base = dir === 'right' ? x1 + 3 : x0 - 3;
  const labelY = labelAbove ? cy - h / 2 - 9 : cy + h / 2 + 19;
  return [
    `<rect x="${x0}" y="${cy - h / 2}" width="${len}" height="${h}" rx="${h / 2}" fill="${live ? alpha(hue, 0.18) : 'rgba(43,36,64,0.07)'}" stroke="${live ? alpha(hue, 0.4) : 'rgba(43,36,64,0.14)'}" stroke-width="1.3"/>`,
    ...packets,
    `<path d="M${tip} ${cy} L${base} ${cy - 7} L${base} ${cy + 7} Z" fill="${live ? hue : 'rgba(43,36,64,0.2)'}"/>`,
    `<text x="${(x0 + x1) / 2}" y="${labelY}" text-anchor="middle" font-family="${FONT}" font-size="11.5" fill="${INK_SOFT}">${escapeXml(label)} <tspan font-size="14.5" font-weight="bold" fill="${shade(hue, -0.3)}">${escapeXml(value)}</tspan></text>`,
  ].join('\n');
}

/** 数据流场景：互联网 ←→ 本机，两条反向管道分别是下行与上行 */
function netFlowScene(
  x: number,
  y: number,
  w: number,
  h: number,
  hue: string,
  rxRate: number,
  txRate: number,
  rxText: string,
  txText: string,
): string {
  const nodeR = 28;
  const nodeCy = y + 56;
  const leftCx = x + 64;
  const rightCx = x + w - 64;
  const laneX0 = leftCx + nodeR + 20;
  const laneX1 = rightCx - nodeR - 20;
  return [
    tileFlat(x, y, w, h, 18, hue),
    netNode(leftCx, nodeCy, nodeR, HUE.blue, 'cloud-outline', '互联网'),
    netNode(rightCx, nodeCy, nodeR, HUE.pink, 'robot-happy', '本机'),
    sparkle(leftCx - nodeR - 7, nodeCy - nodeR + 2, 11, HUE.cyan, 0.75),
    sparkle(rightCx + nodeR + 7, nodeCy + nodeR - 2, 10, HUE.yellow, 0.8),
    netLane(laneX0, laneX1, nodeCy - 19, 15, HUE.green, 'right', rxRate, '下行', rxText, true),
    netLane(laneX0, laneX1, nodeCy + 19, 15, HUE.orange, 'left', txRate, '上行', txText, false),
  ].join('\n');
}

/** 流量小卡：上排图标 + 名称，下排大号数值（三枚等宽并排） */
function netStat(
  x: number,
  y: number,
  w: number,
  h: number,
  hue: string,
  icon: string,
  label: string,
  value: string,
): string {
  const cx = x + w / 2;
  const iconSize = 15;
  const gw = iconSize + 6 + textWidth(label, 12);
  const gx = cx - gw / 2;
  return [
    tileFlat(x, y, w, h, 14, hue),
    mdiIcon(icon, gx + iconSize / 2, y + 20, iconSize, shade(hue, -0.1)),
    `<text x="${gx + iconSize + 6}" y="${y + 24.5}" font-family="${FONT}" font-size="12" fill="${INK_SOFT}">${escapeXml(label)}</text>`,
    `<text x="${cx}" y="${y + 47}" text-anchor="middle" font-family="${FONT}" font-size="17" font-weight="bold" fill="${shade(hue, -0.34)}">${escapeXml(fitText(value, 17, w - 20))}</text>`,
  ].join('\n');
}

// ============================== 主 overlay ==============================

/** 多账号行的配色（按顺序循环取用） */
const ACCOUNT_HUES: string[] = [
  HUE.blue,
  HUE.purple,
  HUE.green,
  HUE.pink,
  HUE.orange,
  HUE.cyan,
  HUE.yellow,
  HUE.red,
];

/**
 * 账号列表归一化：没有 accounts 时用 name / qq 合成唯一一条，
 * 保证 hero 版式与多账号版式共用同一份数据。
 */
export function normalizeStatusAccounts(opts: StatusSharpRenderOptions): StatusAccountEntry[] {
  const list = Array.isArray(opts.accounts) ? opts.accounts : [];
  const cleaned = list
    .filter((a) => a && String(a.name || '').trim())
    .map((a) => ({
      qq: String(a.qq || '').trim(),
      appId: String(a.appId || '').trim(),
      name: String(a.name || '').trim(),
      avatar: String(a.avatar || '').trim(),
      typeText: String(a.typeText || '').trim(),
      directionText: String(a.directionText || '').trim(),
      statusText: String(a.statusText || '').trim(),
      phase: String(a.phase || '').trim(),
      connected: a.connected !== false,
    }));
  if (cleaned.length) return cleaned;
  return [
    {
      qq: String(opts.qq || '').trim(),
      appId: '',
      name: String(opts.name || '').trim() || 'Bot',
      avatar: '',
      typeText: '',
      directionText: '',
      statusText: '',
      // 兜底单账号来自「正在发消息的这个账号」，必定是已连接
      phase: 'connected',
      connected: true,
    },
  ];
}

/**
 * 账号卡片右侧的气泡标签：机器人类型 / 连接方式。
 * 连接状态已改为「头像描边颜色」表达，不再出状态标签。
 */
function accountChips(account: StatusAccountEntry): { label: string; hue: string }[] {
  const chips: { label: string; hue: string }[] = [];
  const typeText = String(account.typeText || '').trim();
  const dirText = String(account.directionText || '').trim();
  if (typeText) chips.push({ label: typeText, hue: HUE.blue });
  if (dirText) chips.push({ label: dirText, hue: HUE.purple });
  return chips;
}

/**
 * 头像描边色：按连接阶段上色 —— 已连接绿 / 重连中·等待连接黄 / 失败红 / 其他白。
 * 空头像、透明头像也照画描边，因为状态就是靠它表达的。
 */
export function accountStrokeHue(account: StatusAccountEntry): string {
  const phase = String(account.phase || '').toLowerCase();
  if (phase === 'connected') return HUE.green;
  if (phase === 'failed') return HUE.red;
  if (phase === 'reconnecting' || phase === 'connecting' || phase === 'waiting') return HUE.yellow;
  if (phase === 'disabled') return '#ffffff';
  // 没有阶段信息时退回连通布尔值
  if (account.connected === false) return HUE.red;
  if (account.connected === true) return HUE.green;
  return '#ffffff';
}

/**
 * 气泡式小标签：淡色底 + 描边 + 小圆点 + 文案（宽度 = 32 + 文字宽，与调用处的测量保持一致）。
 * spacing 为字间距，用来把较短的文案撑到与另一枚同宽。
 */
function bubbleChip(x: number, y: number, w: number, h: number, hue: string, label: string, spacing = 0): string {
  const cy = y + h / 2;
  const spacingAttr = spacing > 0.05 ? ` letter-spacing="${spacing.toFixed(2)}"` : '';
  return [
    `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${h / 2}" fill="${alpha(shade(hue, 0.76), 0.58)}" stroke="${alpha(hue, 0.42)}" stroke-width="1.1"/>`,
    `<circle cx="${x + 11}" cy="${cy}" r="2.8" fill="${hue}"/>`,
    `<text x="${x + 20}" y="${cy + 3.8}"${spacingAttr} font-family="${FONT}" font-size="11" font-weight="bold" fill="${shade(hue, -0.4)}">${escapeXml(label)}</text>`,
  ].join('\n');
}

/** 页脚三张气泡卡片的色相（各不同，避免整排一个色） */
const FOOTER_HUES: string[] = [HUE.blue, HUE.pink, HUE.green];

/**
 * 账号卡片：头像（描边颜色 = 连接阶段，空头像也画）
 * + 昵称 / 名字下方一行身份（野生机器人显示 QQ 号，官方机器人显示 AppID）
 * + 右侧两枚等宽气泡标签（机器人类型 / 连接方式）。
 * 卡片本身由 layout.glass 统一画玻璃底，头像图片由光栅层按 card.avatar 落位合成。
 */
function accountCardSvg(card: AccountCardBox, account: StatusAccountEntry, hue: string): string {
  const av = card.avatar;
  const avCx = av.x + av.size / 2;
  const avCy = av.y + av.size / 2;
  const avR = av.size / 2;

  const wide = card.variant === 'wide';
  const nameFont = wide ? 16.5 : 14.5;
  const idFont = wide ? 12 : 11.5;
  const idRaw = account.qq
    ? `QQ · ${account.qq}`
    : account.appId
      ? `AppID · ${account.appId}`
      : '';

  // 两枚标签强制等宽：宽度按文字较长的那枚算
  const chips = accountChips(account);
  const chipTextW = chips.map((c) => textWidth(c.label, 11));
  const maxTextW = chipTextW.length ? Math.max(...chipTextW) : 0;
  const chipW = maxTextW ? maxTextW + 32 : 0;
  // 宽卡：两枚标签同一行居右；双列窄卡：两枚标签上下排在右上角、居右对齐
  const chipRows = wide ? 1 : chips.length;
  const chipBlockH = chipRows * ACC_CHIP_H + Math.max(0, chipRows - 1) * ACC_CHIP_GAP;

  const textX = av.x + av.size + 14;
  const textMaxW = Math.max(40, card.x + card.w - 14 - (chipW ? chipW + 14 : 0) - textX);
  const nameY = card.y + card.h / 2 - 6;
  const idY = nameY + 20;
  const nameText = fitText(String(account.name || 'Bot'), nameFont, textMaxW);
  const idText = idRaw ? fitText(idRaw, idFont, textMaxW) : '';

  // 描边：只画一圈，颜色即连接阶段（空头像 / 透明头像也照画）；
  // 粗细按原来那圈白色描边（1.6px）+1px = 2.6px，贴在头像边缘上
  const stroke = accountStrokeHue(account);
  const strokeW = 2.6;
  const out: string[] = [
    `<circle cx="${avCx}" cy="${avCy}" r="${avR + strokeW / 2}" fill="none" stroke="${stroke}" stroke-width="${strokeW}"/>`,
    `<text x="${textX}" y="${nameY}" font-family="${FONT}" font-size="${nameFont}" font-weight="bold" fill="${INK}">${escapeXml(nameText)}</text>`,
  ];
  if (idText) {
    out.push(
      `<text x="${textX}" y="${idY}" font-family="${FONT}" font-size="${idFont}" fill="${INK_SOFT}">${escapeXml(idText)}</text>`,
    );
  }

  if (chips.length && chipW > 0) {
    const rightX = card.x + card.w - 14;
    // 文字比最长的那枚短时，用字间距把它撑到同宽，避免右侧留下一段空白；
    // 两枚标签的中英文数量本来就一致时，间距自然算出来是 0，不做调整。
    const spacingOf = (i: number) => {
      const len = chips[i]!.label.length;
      if (len < 2 || maxTextW <= 0) return 0;
      return Math.max(0, (maxTextW - chipTextW[i]!) / len);
    };
    if (wide) {
      const total = chips.length * chipW + (chips.length - 1) * ACC_CHIP_GAP;
      const startX = rightX - total;
      const chipY = card.y + card.h / 2 - ACC_CHIP_H / 2;
      chips.forEach((c, i) => {
        out.push(bubbleChip(startX + i * (chipW + ACC_CHIP_GAP), chipY, chipW, ACC_CHIP_H, c.hue, c.label, spacingOf(i)));
      });
    } else {
      const blockTop = card.y + (card.h - chipBlockH) / 2;
      chips.forEach((c, i) => {
        out.push(bubbleChip(rightX - chipW, blockTop + i * (ACC_CHIP_H + ACC_CHIP_GAP), chipW, ACC_CHIP_H, c.hue, c.label, spacingOf(i)));
      });
    }
  }
  return out.filter(Boolean).join('\n');
}

function buildStatusOverlaySvg(
  layout: StatusLayout,
  opts: StatusSharpRenderOptions,
  customText: string | null,
): string {
  const ink = resolveSharpTextFill(customText, INK);
  const cpuPct = toPercentNum(opts.cpuUsagePercent);
  const memPct = toPercentNum(opts.memoryUsagePercent);
  const diskPct = toPercentNum(opts.diskUsagePercent);
  const worst = Math.max(cpuPct, memPct, diskPct);
  const parts: string[] = [];

  // —— 主卡：只画玻璃边缘光学，透光由光栅玻璃层负责 ——
  layout.glass.forEach((rect, i) => parts.push(glassCard(rect, CARD_HUES[i] || HUE.pink, i)));

  // —— 顶部一行：左侧标题胶囊 + 右上角两枚等宽接发气泡（同一行、不换行）——
  const tp = layout.titlePill;
  const tpCy = tp.y + tp.h / 2;
  const logoSize = 27;
  // 标题只留「MKbot」，「运行状态」四个字已按需求去掉
  const titleText = 'MKbot';
  const titleX = tp.x + 14 + logoSize + 9;
  parts.push(
    iconMark(tp.x + 14, tpCy - logoSize / 2, logoSize, HUE.pink, 'robot-happy'),
    `<text x="${titleX}" y="${tpCy + 7}" font-family="${FONT}" font-size="19" font-weight="bold" fill="${ink}">${titleText}</text>`,
  );
  const verFont = 12;
  // 「更新时间」胶囊已移除，标题右侧腾出的空间正好放下完整版本片
  const verAvail = tp.x + tp.w - 14 - (titleX + textWidth(titleText, 19) + 10);
  const verText = fitText(`v${String(opts.pluginVersion || '').replace(/^v/i, '') || '-'}`, verFont, Math.max(32, verAvail - 20));
  const verW = Math.max(52, 20 + textWidth(verText, verFont));
  const verX = tp.x + tp.w - 14 - verW;
  const verY = tpCy - 11;
  parts.push(
    `<rect x="${verX}" y="${verY}" width="${verW}" height="22" rx="11" fill="${alpha(HUE.purple, 0.2)}" stroke="${alpha(HUE.purple, 0.5)}" stroke-width="1.3"/>`,
    `<text x="${verX + verW / 2}" y="${tpCy + 4.5}" text-anchor="middle" font-family="${FONT}" font-size="${verFont}" font-weight="bold" fill="${shade(HUE.purple, -0.42)}">${escapeXml(verText)}</text>`,
  );

  // 接收 / 发送：两枚同宽气泡并排靠右上角；字号加大、内容整体居中，避免「气泡很大、字很小」的空感
  const recvText = opts.recvCount == null ? '—' : String(Math.max(0, Math.floor(opts.recvCount)));
  const sentText = opts.sentCount == null ? '—' : String(Math.max(0, Math.floor(opts.sentCount)));
  for (const t of [
    { rect: layout.recvPill, hue: HUE.green, icon: 'arrow-down-bold', label: '接收', value: recvText },
    { rect: layout.sentPill, hue: HUE.orange, icon: 'arrow-up-bold', label: '发送', value: sentText },
  ]) {
    const cy = t.rect.y + t.rect.h / 2;
    const iconSize = 17;
    const tagFont = 14.5;
    const gap = 8;
    // 数字特别长时退回「图标 + 数值」，保证内容一定放得下
    const withLabel = iconSize + gap + textWidth(t.label, tagFont) + gap + textWidth(t.value, tagFont) <= t.rect.w - 26;
    const contentW = iconSize + gap + (withLabel ? textWidth(t.label, tagFont) + gap : 0) + textWidth(t.value, tagFont);
    const startX = t.rect.x + (t.rect.w - contentW) / 2;
    parts.push(
      `<rect x="${t.rect.x}" y="${t.rect.y}" width="${t.rect.w}" height="${t.rect.h}" rx="${t.rect.rx}" fill="${alpha(shade(t.hue, 0.7), 0.5)}" stroke="${alpha(t.hue, 0.5)}" stroke-width="1.3"/>`,
      mdiIcon(t.icon, startX + iconSize / 2, cy, iconSize, alpha(t.hue, 0.95)),
      withLabel
        ? `<text x="${startX + iconSize + gap}" y="${cy + 5}" font-family="${FONT}" font-size="${tagFont}" fill="${shade(t.hue, -0.28)}">${escapeXml(t.label)}</text>`
        : '',
      `<text x="${startX + iconSize + gap + (withLabel ? textWidth(t.label, tagFont) + gap : 0)}" y="${cy + 5}" font-family="${FONT}" font-size="${tagFont}" font-weight="bold" fill="${shade(t.hue, -0.45)}">${escapeXml(t.value)}</text>`,
    );
  }

  // —— 账号卡片：每个连接一张独立卡片（头像图片由光栅层按其落位合成，没有头像就留空）——
  const accounts = normalizeStatusAccounts(opts);
  accounts.forEach((acc, i) => {
    const card = layout.accountCards.find((c) => c.index === i);
    if (!card) return;
    parts.push(accountCardSvg(card, acc, ACCOUNT_HUES[i % ACCOUNT_HUES.length]!));
  });


  // —— 基本数据：四枚负载环（原「运行内存」的容量条已移除，卡片改为承载 CPU / 内存 / 磁盘 / 健康度）——
  const bcs = layout.basic;
  parts.push(sectionTitle(bcs.x + 28, bcs.y + TITLE_BASE, bcs.w - 56, '基本数据', '实时负载', HUE.purple, 'database'));
  const miniCols = [
    { hue: HUE.blue, pct: cpuPct, name: 'CPU', sub: `${opts.cpuCount ?? 0} 核心`, icon: 'chip' },
    { hue: HUE.purple, pct: memPct, name: '内存', sub: `共 ${opts.totalMemoryGB || '-'}`, icon: 'memory' },
    { hue: HUE.green, pct: diskPct, name: '磁盘', sub: `共 ${opts.diskTotalGB || '-'}`, icon: 'harddisk' },
    { hue: usageHue(worst), pct: worst, name: '健康度', sub: healthLabel(worst), icon: 'speedometer' },
  ];
  layout.basicDonuts.forEach((slot, i) => {
    const g = miniCols[i];
    if (!g) return;
    parts.push(miniDonut(slot.cx, slot.cy, slot.colW, g.pct, g.hue, g.name, g.sub, g.icon));
  });

  // —— 磁盘储存：每个磁盘单独一行，最多 5 行（超出时第 5 行合并剩余）——
  const dk = layout.disk;
  const diskRowsData = buildDiskRows(opts).slice(0, MAX_DISK_ROWS);
  const diskNameW = diskNameColWidth(diskRowsData);
  const volCount = (opts.diskVolumes || []).filter((v) => v && Number(v.total) > 0).length;
  const diskHint = volCount > 0 ? `共 ${volCount} 个 · 总占用 ${fmtPercent(diskPct)}` : `总占用 ${fmtPercent(diskPct)}`;
  parts.push(sectionTitle(dk.x + 28, dk.y + TITLE_BASE, dk.w - 56, '磁盘储存', diskHint, HUE.green, 'harddisk'));
  diskRowsData.forEach((row, i) => {
    parts.push(diskRow(dk.x + 22, dk.y + BODY_TOP + i * DISK_ROW_STEP, dk.w - 44, HUE.green, row, diskNameW));
  });

  // —— 网络数据：上方数据流场景（下行 / 上行两条管道）+ 下方累计流量小卡 ——
  const nt = layout.net;
  const netOk = opts.netAvailable !== false;
  const rxRate = Math.max(0, Number(opts.netRxRate) || 0);
  const txRate = Math.max(0, Number(opts.netTxRate) || 0);
  const rxTotal = Math.max(0, Number(opts.netRxTotal) || 0);
  const txTotal = Math.max(0, Number(opts.netTxTotal) || 0);
  const netHint = netOk
    ? `网卡 ${fitText(String(opts.netInterface || '主网卡'), 12.5, 210)}`
    : '网卡数据不可用';
  parts.push(sectionTitle(nt.x + 28, nt.y + TITLE_BASE, nt.w - 56, '网络数据', netHint, HUE.blue, 'lan-connect'));
  const netX = nt.x + 22;
  const netW = nt.w - 44;
  parts.push(
    netFlowScene(
      netX,
      nt.y + BODY_TOP,
      netW,
      NET_FLOW_H,
      HUE.blue,
      netOk ? rxRate : 0,
      netOk ? txRate : 0,
      netOk ? formatRate(rxRate) : '—',
      netOk ? formatRate(txRate) : '—',
    ),
  );
  const netStatY = nt.y + BODY_TOP + NET_FLOW_H + NET_STAT_GAP;
  const netStatW = (netW - NET_STAT_GAP * 2) / 3;
  [
    { hue: HUE.green, icon: 'download', label: '总接收', value: netOk ? formatTraffic(rxTotal) : '—' },
    { hue: HUE.orange, icon: 'upload', label: '总发送', value: netOk ? formatTraffic(txTotal) : '—' },
    {
      hue: HUE.purple,
      icon: 'swap-vertical',
      label: '总流量',
      value: netOk ? formatTraffic(rxTotal + txTotal) : '—',
    },
  ].forEach((s, i) => {
    parts.push(
      netStat(
        netX + i * (netStatW + NET_STAT_GAP),
        netStatY,
        netStatW,
        NET_STAT_H,
        s.hue,
        s.icon,
        s.label,
        s.value,
      ),
    );
  });

  // —— 运行环境：四个分组，组间虚线分隔 ——
  const env = layout.env;
  parts.push(sectionTitle(env.x + 28, env.y + TITLE_BASE, env.w - 56, '运行环境', '', HUE.cyan, 'server-network'));
  const gridX = env.x + 24;
  const gridW = env.w - 48;
  const colGap = 14;
  const colW = (gridW - colGap) / 2;
  const groups = layout.envGroups;

  const chipGroups: {
    caption: string;
    hue: string;
    icon: string;
    hint?: string;
    items: { hue: string; label: string; value: string; full?: boolean }[];
  }[] = [
    {
      caption: '系统与硬件',
      hue: HUE.cyan,
      icon: 'monitor-dashboard',
      items: [
        { hue: HUE.cyan, label: '操作系统', value: `${opts.type || '-'} · ${opts.arch || '-'}` },
        { hue: HUE.blue, label: '主机名称', value: String(opts.hostname || '-') },
        { hue: HUE.purple, label: '处理器', value: String(opts.cpuModel || '-'), full: true },
        { hue: HUE.orange, label: 'CPU 负载', value: fmtPercent(cpuPct) },
        { hue: HUE.green, label: 'CPU 核心', value: `${opts.cpuCount ?? 0} 核` },
      ],
    },
    {
      caption: '版本与框架',
      hue: HUE.pink,
      icon: 'puzzle',
      items: [
        { hue: HUE.pink, label: '插件版本', value: `MKbot ${opts.pluginVersion || '-'}` },
        { hue: HUE.yellow, label: '运行框架', value: String(opts.frameworkName || '-') },
        { hue: HUE.green, label: 'Node', value: String(opts.nodeVersion || '-') },
        { hue: HUE.red, label: '插件内存', value: `${opts.processMemoryMB || '-'} MB` },
      ],
    },
    {
      caption: '运行时长',
      hue: HUE.blue,
      icon: 'clock-time-four',
      items: [
        { hue: HUE.blue, label: '插件运行', value: formatUptime(opts.pluginUptimeSec) },
        { hue: HUE.cyan, label: '系统运行', value: formatUptime(opts.systemUptimeSec) },
      ],
    },
  ];

  // 组间虚线（放在组间距正中，不与胶囊重叠）
  groups.forEach((g, i) => {
    if (i === 0) return;
    const lineY = g.y - ENV_GROUP_GAP / 2;
    parts.push(
      `<line x1="${gridX}" y1="${lineY}" x2="${gridX + gridW}" y2="${lineY}" stroke="rgba(36,31,51,0.16)" stroke-width="1.6" stroke-linecap="round" stroke-dasharray="${DASH_PATTERN}"/>`,
    );
  });

  chipGroups.forEach((group, gi) => {
    const box = groups[gi];
    if (!box) return;
    parts.push(groupCaption(gridX, box.y, gridW, group.hue, group.caption, group.icon, group.hint || ''));
    let slot = 0;
    for (const item of group.items) {
      const row = Math.floor(slot / 2);
      const col = slot % 2;
      const y = box.bodyY + row * ENV_CHIP_STEP;
      if (item.full) {
        // 整行胶囊：处理器型号较长，占满两列
        const fullY = box.bodyY + (col === 0 ? row : row + 1) * ENV_CHIP_STEP;
        parts.push(paramChip(gridX, fullY, gridW, item.hue, item.label, item.value));
        slot = (col === 0 ? row + 1 : row + 2) * 2;
        continue;
      }
      parts.push(paramChip(gridX + col * (colW + colGap), y, colW, item.hue, item.label, item.value));
      slot += 1;
    }
  });

  // —— 关键进程（并入运行环境卡最后一组） ——
  const procBox = groups[groups.length - 1];
  if (procBox) {
    parts.push(groupCaption(gridX, procBox.y, gridW, HUE.orange, '关键进程', 'chart-box', ''));
    // 列名：直接写在对应列内容的上方，而不是挤在标题右侧
    const headY = procBox.bodyY - 6;
    const colHead = `font-family="${FONT}" font-size="11" font-weight="bold" fill="rgba(43,36,64,0.86)"`;
    parts.push(
      `<text x="${gridX + 26}" y="${headY}" ${colHead}>组件</text>`,
      `<text x="${gridX + PROC_NAME_X}" y="${headY}" ${colHead}>进程名</text>`,
      `<text x="${gridX + gridW - PROC_PID_R}" y="${headY}" text-anchor="end" ${colHead}>PID</text>`,
      `<text x="${gridX + gridW - 92}" y="${headY}" text-anchor="end" ${colHead}>内存</text>`,
      `<text x="${gridX + gridW - 12}" y="${headY}" text-anchor="end" ${colHead}>CPU</text>`,
    );
    const keyRows = (opts.keyProcesses || []).slice(0, procBox.rows);
    const procHues = [HUE.orange, HUE.pink, HUE.blue, HUE.purple];
    if (keyRows.length) {
      keyRows.forEach((row, i) => {
        parts.push(
          keyProcRow(gridX, procBox.bodyY + i * ENV_PROC_STEP, gridW, procHues[i] || HUE.blue, row),
        );
      });
    } else {
      parts.push(
        `<text x="${gridX + gridW / 2}" y="${procBox.bodyY + 24}" text-anchor="middle" font-family="${FONT}" font-size="13" fill="${INK_SOFT}">暂无进程数据</text>`,
      );
    }
  }

  // —— 页脚：每项内容一张独立气泡卡片，三张各用一个色相（避免一个色太单调）——
  layout.footerBubbles.forEach((b, i) => {
    const hue = FOOTER_HUES[i % FOOTER_HUES.length]!;
    parts.push(
      `<rect x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" rx="${b.rx}" fill="${alpha(shade(hue, 0.7), 0.5)}" stroke="${alpha(hue, 0.5)}" stroke-width="1.3"/>`,
      `<text x="${b.x + b.w / 2}" y="${b.y + b.h / 2 + 4.5}" text-anchor="middle" font-family="${FONT}" font-size="12.5" font-weight="bold" fill="${shade(hue, -0.45)}">${escapeXml(layout.footerTexts[i] || '')}</text>`,
    );
  });

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${layout.width}" height="${layout.height}">${parts.join('\n')}</svg>`;
}
// ============================== 渲染 ==============================

type SharpFactory = Awaited<ReturnType<typeof loadSharp>>;

const SVG_NS = 'http://www.w3.org/2000/svg';

/** 圆角矩形子路径（顺时针） */
function rrPath(x: number, y: number, w: number, h: number, r: number): string {
  const rr = Math.max(0, Math.min(r, Math.min(w, h) / 2));
  return [
    `M${x + rr},${y}`,
    `H${x + w - rr}`,
    `A${rr},${rr} 0 0 1 ${x + w},${y + rr}`,
    `V${y + h - rr}`,
    `A${rr},${rr} 0 0 1 ${x + w - rr},${y + h}`,
    `H${x + rr}`,
    `A${rr},${rr} 0 0 1 ${x},${y + h - rr}`,
    `V${y + rr}`,
    `A${rr},${rr} 0 0 1 ${x + rr},${y}`,
    'Z',
  ].join(' ');
}

/**
 * 环形（甜甜圈）路径：外圈内缩 from、内圈内缩 to，用 evenodd 把中心真正挖空。
 * 折射带遮罩与磨边高光都用它，再经高斯羽化过渡。
 */
function ringPath(w: number, h: number, rx: number, from: number, to: number, a = 1): string {
  const oW = w - from * 2;
  const oH = h - from * 2;
  const iW = w - to * 2;
  const iH = h - to * 2;
  if (oW <= 2 || oH <= 2 || iW <= 0 || iH <= 0 || to - from < 0.6) return '';
  const outer = rrPath(from, from, oW, oH, Math.max(0.5, rx - from));
  const inner = rrPath(to, to, iW, iH, Math.max(0.5, rx - to));
  const op = a >= 1 ? '' : ` fill-opacity="${a.toFixed(3)}"`;
  return `<path fill="#ffffff" fill-rule="evenodd"${op} d="${outer} ${inner}"/>`;
}

/** 独立成图的环形遮罩 */
function ringSvg(w: number, h: number, rx: number, from: number, to: number, a = 1): string {
  const p = ringPath(w, h, rx, from, to, a);
  return p ? `<svg xmlns="${SVG_NS}" width="${w}" height="${h}">${p}</svg>` : '';
}

/**
 * 折射位移：把卡片外扩 push 像素的那块背景压缩回卡片尺寸。
 * 边缘因此显示的是卡外的景物，且被挤压变形——真实玻璃板的磨边就是这样。
 * disperse=true 时红/蓝通道用不同压缩量再合回三通道，得到水边的彩色色散。
 */
async function edgeSqueeze(
  sharp: SharpFactory,
  backdrop: Buffer,
  layout: StatusLayout,
  box: { left: number; top: number; w: number; h: number },
  push: number,
  disperse = false,
): Promise<Buffer> {
  const { left, top, w, h } = box;
  const once = async (p: number): Promise<Buffer> => {
    const x0 = Math.max(0, Math.round(left - p));
    const y0 = Math.max(0, Math.round(top - p));
    const x1 = Math.min(layout.width, Math.round(left + w + p));
    const y1 = Math.min(layout.height, Math.round(top + h + p));
    return await sharp(backdrop)
      .extract({ left: x0, top: y0, width: Math.max(2, x1 - x0), height: Math.max(2, y1 - y0) })
      .resize(w, h, { fit: 'fill' })
      .ensureAlpha()
      .png()
      .toBuffer();
  };
  if (!disperse) return once(push);
  try {
    const [rBuf, gBuf, bBuf] = await Promise.all([
      once(push * (1 + LENS_DISPERSION)),
      once(push),
      once(push * (1 - LENS_DISPERSION)),
    ]);
    const [rc, gc, bc] = await Promise.all([
      sharp(rBuf).extractChannel('red').png().toBuffer(),
      sharp(gBuf).extractChannel('green').png().toBuffer(),
      sharp(bBuf).extractChannel('blue').png().toBuffer(),
    ]);
    return await sharp(rc).joinChannel([gc, bc]).ensureAlpha().png().toBuffer();
  } catch {
    return once(push);
  }
}

/**
 * 单张卡的清澈玻璃：全部由真实图像运算叠出来，不是平涂蒙版。
 * ① 玻璃体——取卡片正下方的背景，几乎不模糊，只按透光曲线抬暗部（背景细节完整透出来）；
 * ② 边缘折射——同一块背景压缩取样，只在贴边羽化窄带里显示，模拟玻璃磨边的透镜位移与色散；
 * ③ 表面光泽——顶部天光带 + 斜向焦散 + 底部沉影，最后统一裁成圆角形状。
 */
async function buildCardGlass(
  sharp: SharpFactory,
  backdrop: Buffer,
  layout: StatusLayout,
  r: GlassRect,
): Promise<{ input: Buffer; top: number; left: number } | null> {
  const left = Math.max(0, Math.round(r.x));
  const top = Math.max(0, Math.round(r.y));
  const w = Math.min(layout.width - left, Math.round(r.w));
  const h = Math.min(layout.height - top, Math.round(r.h));
  if (w < 12 || h < 12) return null;

  const scale = Math.min(1, Math.min(w, h) / (LENS_DEPTH * 2.4));
  const limit = Math.min(w, h) / 2 - 1;

  // ① 玻璃体：整卡轻微压缩取样（卡内也在玻璃之下）+ 极轻柔化 + 增饱和 + 透光曲线
  // 小胶囊（标题 / 时间 / 页脚）上的文字直接压在玻璃上、没有小卡垫底，
  // 所以这里给它们换成更厚的乳白玻璃：透光大幅降低 + 多一点柔化，深色文字才读得清。
  const dense = h <= 56;
  const bodyContrast = dense ? 0.34 : GLASS_CONTRAST;
  const bodyLift = dense ? GLASS_LIFT + 128 : GLASS_LIFT;
  const bodyBlur = dense ? 3.2 : GLASS_BLUR;
  const region = await edgeSqueeze(sharp, backdrop, layout, { left, top, w, h }, BODY_PUSH * Math.max(0.5, scale));
  const body = await sharp(region)
    .blur(bodyBlur)
    .modulate({ saturation: GLASS_SATURATION })
    .linear(bodyContrast, bodyLift)
    .png()
    .toBuffer();

  // ② 液体透镜：由内向外多层渐进折射，越贴边位移越大，最外层带色散。
  // 小胶囊整高只有 44px，折射带会盖满整个胶囊、把乳白玻璃又压回暗色，所以这里直接跳过。
  const lensLayers: Buffer[] = [];
  for (const band of dense ? [] : LENS_BANDS) {
    const from = band.from * scale;
    const to = Math.min(band.to * scale, limit);
    if (to - from < 1.2) continue;
    const ring = ringSvg(w, h, r.rx, from, to);
    if (!ring) continue;
    const zoomed = await edgeSqueeze(
      sharp,
      backdrop,
      layout,
      { left, top, w, h },
      band.push * Math.max(0.5, scale),
      band.disperse === true,
    );
    const tuned = await sharp(zoomed)
      .blur(Math.max(0.4, band.soft * scale))
      .modulate({ saturation: GLASS_SATURATION + 0.24, brightness: 1.04 })
      .linear(GLASS_CONTRAST + 0.16, GLASS_LIFT - 28)
      .png()
      .toBuffer();
    const mask = await sharp(Buffer.from(ring))
      .blur(Math.max(0.4, band.feather * scale))
      .png()
      .toBuffer();
    lensLayers.push(
      await sharp(tuned)
        .composite([{ input: mask, blend: 'dest-in' }])
        .png()
        .toBuffer(),
    );
  }

  // ③ 磨边高光：贴边一圈由亮到淡的白光，模拟玻璃厚度的反光（羽化后不会像描边）
  const menOuter = ringPath(w, h, r.rx, MENISCUS_FROM * scale, Math.min(4.2 * scale, limit), MENISCUS_ALPHA);
  const menInner = ringPath(w, h, r.rx, 4 * scale, Math.min(MENISCUS_TO * scale, limit), MENISCUS_ALPHA * 0.42);
  const meniscus =
    menOuter || menInner
      ? await sharp(Buffer.from(`<svg xmlns="${SVG_NS}" width="${w}" height="${h}">${menInner}${menOuter}</svg>`))
          .blur(Math.max(0.4, MENISCUS_BLUR * scale))
          .png()
          .toBuffer()
      : null;

  // ④ 表面光学：贴顶天光反射带 + 冷调顶光 + 柔光斑 + 斜向焦散 + 底部沉影
  const skyH = Math.max(6, Math.min(h * 0.22, 34 * Math.max(0.5, scale)));
  const blobRx = w * 0.42;
  const blobRy = Math.max(10, h * 0.34);
  const sheenSvg = `<svg xmlns="${SVG_NS}" width="${w}" height="${h}">
    <defs>
      <linearGradient id="skyBand" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="rgba(255,255,255,0.30)"/>
        <stop offset="45%" stop-color="rgba(236,250,255,0.10)"/>
        <stop offset="100%" stop-color="rgba(255,255,255,0)"/>
      </linearGradient>
      <linearGradient id="sky" x1="0" y1="0" x2="0.18" y2="1">
        <stop offset="0%" stop-color="rgba(228,246,255,0.13)"/>
        <stop offset="34%" stop-color="rgba(255,255,255,0.05)"/>
        <stop offset="100%" stop-color="rgba(255,255,255,0.01)"/>
      </linearGradient>
      <radialGradient id="blob" cx="0.3" cy="0.16" r="0.62">
        <stop offset="0%" stop-color="rgba(255,255,255,0.16)"/>
        <stop offset="55%" stop-color="rgba(255,255,255,0.04)"/>
        <stop offset="100%" stop-color="rgba(255,255,255,0)"/>
      </radialGradient>
      <linearGradient id="caustic" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="rgba(255,255,255,0)"/>
        <stop offset="13%" stop-color="rgba(255,255,255,0.18)"/>
        <stop offset="21%" stop-color="rgba(255,255,255,0.02)"/>
        <stop offset="62%" stop-color="rgba(255,255,255,0)"/>
        <stop offset="73%" stop-color="rgba(255,255,255,0.11)"/>
        <stop offset="82%" stop-color="rgba(255,255,255,0)"/>
      </linearGradient>
      <linearGradient id="caustic2" x1="1" y1="0" x2="0.1" y2="1">
        <stop offset="0%" stop-color="rgba(255,255,255,0)"/>
        <stop offset="26%" stop-color="rgba(255,255,255,0.10)"/>
        <stop offset="36%" stop-color="rgba(255,255,255,0)"/>
        <stop offset="100%" stop-color="rgba(255,255,255,0)"/>
      </linearGradient>
      <linearGradient id="sink" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="rgba(34,40,64,0)"/>
        <stop offset="70%" stop-color="rgba(34,40,64,0.015)"/>
        <stop offset="100%" stop-color="rgba(34,40,64,0.09)"/>
      </linearGradient>
    </defs>
    <rect width="${w}" height="${h}" fill="url(#sky)"/>
    <rect width="${w}" height="${skyH.toFixed(1)}" fill="url(#skyBand)"/>
    <ellipse cx="${(w * 0.3).toFixed(1)}" cy="${(h * 0.14).toFixed(1)}" rx="${blobRx.toFixed(1)}" ry="${blobRy.toFixed(1)}" fill="url(#blob)"/>
    <rect width="${w}" height="${h}" fill="url(#caustic)"/>
    <rect width="${w}" height="${h}" fill="url(#caustic2)"/>
    <rect width="${w}" height="${h}" fill="url(#sink)"/>
  </svg>`;

  // ⑤ 圆角裁切
  const shapeSvg = `<svg xmlns="${SVG_NS}" width="${w}" height="${h}"><rect width="${w}" height="${h}" rx="${r.rx}" ry="${r.rx}" fill="#ffffff"/></svg>`;
  const overlays: { input: Buffer; blend: 'over' }[] = lensLayers.map((input) => ({ input, blend: 'over' as const }));
  if (meniscus) overlays.push({ input: meniscus, blend: 'over' });
  overlays.push({ input: Buffer.from(sheenSvg), blend: 'over' });
  const merged = await sharp(body).composite(overlays).png().toBuffer();
  const clipped = await sharp(merged)
    .composite([{ input: Buffer.from(shapeSvg), blend: 'dest-in' }])
    .png()
    .toBuffer();
  return { input: clipped, top, left };
}

/** 所有卡片的清澈玻璃层（逐卡采样其正下方的实际背景） */
async function buildLiquidGlassLayers(
  sharp: SharpFactory,
  backdrop: Buffer,
  layout: StatusLayout,
): Promise<{ input: Buffer; top: number; left: number }[]> {
  const layers: { input: Buffer; top: number; left: number }[] = [];
  for (const rect of layout.glass) {
    try {
      const layer = await buildCardGlass(sharp, backdrop, layout, rect);
      if (layer) layers.push(layer);
    } catch {
      /* 单张卡失败不影响其余 */
    }
  }
  return layers;
}

/** 背板：背景图（含用户设置的模糊/暗度）压平成一张整图，玻璃层从它上面取样 */
async function buildBackdrop(
  sharp: SharpFactory,
  bgBuf: Buffer,
  layout: StatusLayout,
  effects: SharpBgEffects,
): Promise<Buffer> {
  let pipeline = sharp(bgBuf).resize(layout.width, layout.height, { fit: 'cover', position: 'centre' });
  if (effects.blurSigma > 0) pipeline = pipeline.blur(effects.blurSigma);
  const base = await pipeline.ensureAlpha().png().toBuffer();
  if (effects.dimAlpha <= 0) return base;
  const dim = await sharp({
    create: {
      width: layout.width,
      height: layout.height,
      channels: 4,
      background: { r: 12, g: 10, b: 24, alpha: effects.dimAlpha },
    },
  })
    .png()
    .toBuffer();
  return await sharp(base)
    .composite([{ input: dim, blend: 'over' }])
    .png()
    .toBuffer();
}
/** 无背景图时的卡通渐变兜底 */
async function buildFallbackBackground(sharp: SharpFactory, layout: StatusLayout): Promise<Buffer> {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${layout.width}" height="${layout.height}">
    <defs>
      <linearGradient id="bgFall" x1="0" y1="0" x2="0.6" y2="1">
        <stop offset="0%" stop-color="#FFD9E8"/>
        <stop offset="50%" stop-color="#D9E4FF"/>
        <stop offset="100%" stop-color="#CFF3E6"/>
      </linearGradient>
    </defs>
    <rect width="${layout.width}" height="${layout.height}" fill="url(#bgFall)"/>
    <circle cx="${layout.width * 0.18}" cy="${layout.height * 0.22}" r="150" fill="rgba(255,255,255,0.35)"/>
    <circle cx="${layout.width * 0.86}" cy="${layout.height * 0.34}" r="110" fill="rgba(255,255,255,0.28)"/>
  </svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}

async function roundAvatar(sharp: SharpFactory, buf: Buffer, size: number): Promise<Buffer | null> {
  try {
    const mask = Buffer.from(
      `<svg width="${size}" height="${size}"><circle cx="${size / 2}" cy="${size / 2}" r="${size / 2}" fill="white"/></svg>`,
    );
    return await sharp(buf)
      .resize(size, size, { fit: 'cover' })
      .ensureAlpha()
      .composite([{ input: mask, blend: 'dest-in' }])
      .png()
      .toBuffer();
  } catch {
    return null;
  }
}
/** 竖屏运行状态卡片，返回 base64（不含 base64:// 前缀） */
/** 单张头像抓取超时（多账号并行拉取，超时就留空） */
const STATUS_AVATAR_TIMEOUT_MS = 10000;
/** 头像并发上限：多账号时一次最多拉 6 张 */
const STATUS_AVATAR_CONCURRENCY = 6;

/** 带并发上限的批量执行 */
async function mapWithLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let cursor = 0;
  const workerCount = Math.max(1, Math.min(limit, items.length));
  await Promise.all(
    Array.from({ length: workerCount }, async () => {
      for (;;) {
        const i = cursor;
        cursor += 1;
        if (i >= items.length) return;
        out[i] = await fn(items[i]!, i);
      }
    }),
  );
  return out;
}

/** 拉取一张头像并裁圆；失败返回 null（该位置留空，不画占位图） */
async function fetchRoundStatusAvatar(
  sharp: Parameters<typeof roundAvatar>[0],
  url: string,
  size: number,
): Promise<Buffer | null> {
  const target = String(url || '').trim();
  if (!target || size <= 0) return null;
  try {
    const buf = await fetchUrlBuffer(target, STATUS_AVATAR_TIMEOUT_MS);
    if (!buf || buf.length === 0) return null;
    return await roundAvatar(sharp, buf, size);
  } catch (_e) {
    return null;
  }
}

export async function renderStatusWithSharpImpl(
  options: StatusSharpRenderOptions,
  logger?: MkLoggerResolved,
): Promise<string | null> {
  const width = options.width ?? STATUS_CARD_WIDTH;
  // 账号卡片数量决定卡片组高度；页脚文案先算好，布局据此给每张气泡卡片分配宽度
  const accounts = normalizeStatusAccounts(options);
  // 页脚三张气泡：插件版本 / 框架名 + 框架版本（咔咔珂这里附带 kakake 版本号）/ Node 版本
  const fwName = String(options.frameworkName || '').trim();
  const fwVer = String(options.frameworkVersion || '').replace(/^v/i, '').trim();
  const footerParts = [
    `MKbot ${String(options.pluginVersion || '')}`.trim(),
    `${fwName}${fwVer ? ` v${fwVer}` : ''}`.trim(),
    `Node ${String(options.nodeVersion || '')}`.trim(),
  ].filter((t) => t.replace(/^(MKbot|Node)\s*$/, '').trim());
  const layout = computeLayout(width, 0, buildDiskRows(options).length, accounts.length, footerParts);
  const height = layout.height;
  const pluginDir = String(options.pluginDir || '').trim();
  const pluginPath = String(options.pluginPath || '').trim();
  const dataPath = String(options.dataPath || '').trim();
  const bgLocalPath = String(options.bgLocalPath || '').trim();

  try {
    const sharp = await loadSharp();
    const bgBuf = await loadStatusBackground(
      String(options.backgroundImageUrl || ''),
      bgLocalPath,
      pluginDir,
      pluginPath,
      dataPath,
    );
    const composites: { input: Buffer; top?: number; left?: number }[] = [];
    const effects = loadSharpBgEffectsFromDataPath(dataPath);
    let backdrop: Buffer;

    if (bgBuf && bgBuf.length > 0) {
      backdrop = await buildBackdrop(sharp, bgBuf, layout, effects);
    } else {
      backdrop = await buildFallbackBackground(sharp, layout);
      logger?.warn?.('[Sharp渲染] 运行状态背景图不可用，已使用卡通渐变底色');
    }
    composites.push({ input: backdrop, top: 0, left: 0 });
    composites.push(...(await buildLiquidGlassLayers(sharp, backdrop, layout)));

    const customText = loadSharpTextColorFromDataPath(dataPath);
    const overlaySvg = buildStatusOverlaySvg(layout, options, customText);
    const overlayLayer = await sharp(Buffer.from(overlaySvg)).png().toBuffer();
    composites.push({ input: overlayLayer, top: 0, left: 0 });

    // —— 头像：每张账号卡片按各自落位合成；账号没有头像地址就留空（不画占位图）——
    // 野生机器人只有 QQ 号时用 qlogo 兜底；官方机器人用接口给的头像地址。
    const avatarJobs: { url: string; size: number; x: number; y: number }[] = [];
    for (const card of layout.accountCards) {
      const account = accounts[card.index];
      const qq = String(account?.qq || '').trim();
      const url =
        String(account?.avatar || '').trim() || (qq ? `https://q4.qlogo.cn/g?b=qq&nk=${qq}&s=5` : '');
      if (!url) continue;
      avatarJobs.push({ url, size: card.avatar.size, x: card.avatar.x, y: card.avatar.y });
    }
    const avatarBufs = await mapWithLimit(avatarJobs, STATUS_AVATAR_CONCURRENCY, (job) =>
      fetchRoundStatusAvatar(sharp, job.url, job.size),
    );
    avatarBufs.forEach((buf, i) => {
      const job = avatarJobs[i];
      if (!buf || !job) return;
      composites.push({ input: buf, top: Math.round(job.y), left: Math.round(job.x) });
    });

    const out = await sharp({
      create: {
        width,
        height,
        channels: 4,
        background: { r: 20, g: 18, b: 32, alpha: 1 },
      },
    })
      .composite(composites)
      .png({ compressionLevel: 6 })
      .toBuffer();

    return out.toString('base64');
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    logger?.error?.('[Sharp渲染] 运行状态渲染失败:', msg);
    return null;
  }
}

export async function renderStatusWithSharp(
  options: Parameters<typeof renderStatusWithSharpImpl>[0],
  logger?: Parameters<typeof renderStatusWithSharpImpl>[1],
): Promise<string | null> {
  return runCardSharpJob('status', { options }, () => renderStatusWithSharpImpl(options, logger));
}