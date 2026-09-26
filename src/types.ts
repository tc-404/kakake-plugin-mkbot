// ---------------------------------------------------------------------------
// MKbot 公共类型：事件、ctx、文件读写注入、卡密/授权等。
// 与 `napcat-types` 可并存；此处为历史逻辑提供最小可用形状，避免 any 滥用。
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// 配置（config.json 等，仅列 WebUI/常用键；其余用索引或 unknown）
// ---------------------------------------------------------------------------

export interface MkbotWebUiConfig {
  OwnerQQs?: string[] | string;
  nowoner?: boolean;
  nowonernr?: string;
  noauth?: boolean;
  noauthnr?: string;
  自触开关?: boolean;
  启动时间?: number;
  group_of?: string[];
  haoyou_of?: string[];
  助手模式?: boolean;
  深度娱乐路径?: string;
  绕过授权?: boolean;
  mkbot_render_api_base?: string;
  今日运势失败不发原图?: boolean;
  mkbot_bg_inline_max_kb?: number;
  图片渲染?: boolean;
  渲染开关?: boolean;
  渲染模式?: 'html' | 'sharp' | string;
  Sharp背景暗度?: number;
  Sharp背景模糊?: number;
  Sharp全局字体色?: string;
  cs_of?: boolean;
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// 日志
// ---------------------------------------------------------------------------

export type MkLogMethod = (msg: string, ...args: unknown[]) => void;

export interface MkLogger {
  info?: MkLogMethod;
  warn?: MkLogMethod;
  error?: MkLogMethod;
  log?: MkLogMethod;
  debug?: MkLogMethod;
}

/** 已合并默认实现、各级别均可直接调用的 logger（用于 mkbot-core 模块变量） */
export type MkLoggerResolved = Required<Pick<MkLogger, 'info' | 'warn' | 'error' | 'log' | 'debug'>>;

// ---------------------------------------------------------------------------
// 数据文件读写（注入签名，与 mkbot readB/writeB 等一致）
// ---------------------------------------------------------------------------

export type MkReadB = (filename: string, key: string, defaultValue: unknown) => unknown;
export type MkWriteB = (filename: string, key: string, value: unknown) => boolean;
export type MkReadA = (filename: string) => string;
export type MkWriteA = (filename: string, content: string) => boolean;
export type MkDeleteKey = (filename: string, key: string) => boolean;

export type MkTimeA = (format: string, tsSec: number) => string;
export type MkTimeB = (format: string, deltaSec: number) => string;
export type MkRand = (min: number, max: number) => number;

// ---------------------------------------------------------------------------
// OneBot 事件与插件上下文
// ---------------------------------------------------------------------------

/** OneBot / NapCat 消息事件（插件内常用字段） */
export interface MkMessageEvent {
  post_type?: string;
  message_type?: string;
  group_id?: number;
  group_name?: string;
  user_id?: number;
  self_id?: number;
  message_id?: string | number;
  message?: unknown;
  raw_message?: string;
  sender?: { nickname?: string };
  raw?: { elements?: unknown[] };
}

/** ctx 最小形状（消息发送、卡密、路由） */
export interface MkPluginContext {
  logger?: MkLogger;
  configPath?: string;
  pluginPath?: string;
  pluginName?: string;
  adapterName?: string;
  actions?: { call: (action: string, params: unknown, ...rest: unknown[]) => Promise<unknown> };
  router?: unknown;
  NapCatConfig?: Record<string, unknown>;
  frameworkEnv?: Record<string, unknown>;
  core?: {
    context?: { pathWrapper?: { configPath?: string } };
    selfInfo?: { uin?: number };
  };
  pluginManager?: { config?: unknown };
}

// ---------------------------------------------------------------------------
// 消息发送 / 合并转发 / 权限
// ---------------------------------------------------------------------------

/** 单发消息（OB11 JSON 段数组，见 BOT.ts 发消息；ctx 由 bindBotCtx 注入） */
export type MkSendMessage = (
  event: MkMessageEvent,
  message: MkOb11Segment[],
  extra?: { group_id?: string | number },
) => Promise<unknown | null>;

/** 单发语音（OB11 record 段，见 BOT.ts 发语音） */
export type MkSendVoice = (
  event: MkMessageEvent,
  file: string,
  extra?: { group_id?: string | number },
) => Promise<unknown | null>;

/** OneBot11 消息段（单发） */
export interface MkOb11Segment {
  type: string;
  data: Record<string, unknown>;
}

/** 合并转发节点（纯 OB11 JSON，见 BOT.ts） */
export interface MkForwardNode {
  name?: string;
  qq?: number | string;
  time?: number;
  id?: string | number;
  content?: Array<{ type: string; data: Record<string, unknown> }>;
}

/** 合并转发（OB11 JSON 节点，见 BOT.ts；ctx 由 bindBotCtx 注入） */
export type MkSendMergeForward = (
  event: MkMessageEvent,
  nodes: MkForwardNode[],
) => Promise<boolean>;

/** @deprecated 请使用 MkSendMergeForward / 发合并消息 */
export type MkSendForward = MkSendMergeForward;

/** 单发视频（OB11 JSON 段，见 BOT.ts；ctx 由 bindBotCtx 注入） */
export type MkSendVideo = (
  event: MkMessageEvent,
  cover: string,
  video: string,
  name?: string,
) => Promise<unknown | null>;

/** 单发 JSON 卡片（OB11 json 消息段，见 BOT.ts） */
export type MkSendCard = (
  event: MkMessageEvent,
  jsonData: string | Record<string, unknown>,
) => Promise<unknown | null>;

/** 单发音乐卡片（OB11 music 消息段，见 BOT.ts） */
export type MkSendMusicCard = (
  event: MkMessageEvent,
  title: string,
  singer: string,
  cover: string,
  jumpUrl: string,
  audioUrl: string,
) => Promise<unknown | null>;

export type MkCheckOwner3 = (
  event: MkMessageEvent,
  ctx: MkPluginContext,
  enableGroupAdmin?: boolean,
  replyOnFail?: boolean
) => Promise<boolean>;

// ---------------------------------------------------------------------------
// 卡密 / 授权
// ---------------------------------------------------------------------------

export type AuthRcStatus = '已授权' | '未授权';

export interface LicenseGlobalState {
  RC_sq: AuthRcStatus;
}

/** 卡密 JSON 中单条记录 */
export interface CardKmPayload {
  类型?: string;
  时长?: number;
}

export type KmDurationKind = '天' | '周' | '月' | '半年' | '年' | '永久';

/** card-license 模块注入依赖 */
export interface CardLicenseDeps {
  readB: MkReadB;
  writeB: MkWriteB;
  readA: MkReadA;
  writeA: MkWriteA;
  deleteKey: MkDeleteKey;
  timeA: MkTimeA;
  timeB: MkTimeB;
  rand: MkRand;
  checkOwner3: MkCheckOwner3;
}

export type MkBotApi = (
  ctx: MkPluginContext,
  action: string,
  params: Record<string, unknown>
) => Promise<unknown>;

/** group-wife 模块注入依赖 */
export interface GroupWifeDeps {
  readB: MkReadB;
  writeB: MkWriteB;
  readA: MkReadA;
  writeA: MkWriteA;
  timeA: MkTimeA;
  rand: MkRand;
  BOTAPI: MkBotApi;
  checkOwner3: MkCheckOwner3;
}

/** 指令模块 handleMessage 返回值（halt=终止；pass=已处理但继续后续指令） */
export type MkCommandHandleResult = false | 'halt' | 'pass';

/** api-interface 模块 handleMessage 返回值 */
export type ApiInterfaceHandleResult = MkCommandHandleResult;

/** drift-bottle 模块 handleMessage 返回值 */
export type DriftBottleHandleResult = MkCommandHandleResult;

export type CardShopHandleResult = MkCommandHandleResult;

/** 今日运势 HTML 渲染卡片数据 */
export interface FortuneRenderCard {
  qq?: string;
  time?: string;
  Sorte?: string;
  Estrelas?: string;
  signText?: string;
  unSignText?: string;
  image_name?: string;
  backgroundImageCSS?: string;
  backgroundImageUrl?: string;
}

/** Puppeteer / HTML 渲染可选参数 */
export interface MkHtmlRenderOptions {
  data?: Record<string, unknown>;
  width?: number;
  height?: number;
  waitForSelector?: string;
  pageGotoTimeoutMs?: number;
  waitForTimeout?: number;
  suppressErrorLog?: boolean;
}

/** api-interface 模块注入依赖 */
export interface ApiInterfaceDeps {
  readB: MkReadB;
  readA: MkReadA;
  writeB: MkWriteB;
  timeA: MkTimeA;
  rand: MkRand;
  logger: MkLoggerResolved;
  resolveFortuneNetworkBgUrl: (图片Str: unknown, 图片远程Str: unknown) => string;
  buildBgImageCss: (imageName: unknown) => string;
  buildHtmlBackgroundFields: (imageName: unknown) => {
    backgroundImageCSS: string;
    backgroundImageUrl: string;
  };
  isKakakeLikeFramework: (ctx: MkPluginContext) => boolean;
  resolveDefaultResourceImageAbs: (rawName: unknown) => string;
  resolveEffectiveBgAbs?: (id: string) => string;
  resolveFortuneLocalImageFileName: (图片序号: unknown) => string;
  resolveImageForCq: (imageName: unknown) => string;
  renderHtmlWithCompat: (
    htmlContent: string,
    options?: MkHtmlRenderOptions
  ) => Promise<string | null | undefined>;
  puppeteer: (
    html: string,
    data?: MkHtmlRenderOptions | Record<string, unknown> | null
  ) => Promise<string | null | undefined>;
  buildSimpleFortuneHtml: (card?: FortuneRenderCard) => string;
  getDataPath: () => string;
}

/** drift-bottle 模块注入依赖 */
export interface DriftBottleDeps {
  readB: MkReadB;
  writeB: MkWriteB;
  readA: MkReadA;
  writeA: MkWriteA;
  timeA: MkTimeA;
  rand: MkRand;
  checkOwner3: MkCheckOwner3;
  getDataPath: () => string;
  giveText: (message: unknown) => string;
  giveImages: (message: unknown) => string[];
  downloadFile: (url: string, savePath: string, isAbsolute?: boolean) => Promise<unknown>;
}

/** 发卡系统：商品维护、商店浏览、归笺兑换 */
export interface CardShopDeps {
  readB: MkReadB;
  writeB: MkWriteB;
  readA: MkReadA;
  writeA: MkWriteA;
  rand: MkRand;
  checkOwner3: MkCheckOwner3;
  getDataPath: () => string;
  /** MK 内部邮箱发信（多邮箱绑定，失败自动轮替），可选注入 */
  发邮箱?: (provider: string, ...args: unknown[]) => Promise<{ ok: boolean; message?: string }>;
}

/** 表情制作（bqb） */
export interface BqbDeps {
  readB: MkReadB;
  getDataPath: () => string;
  /** 插件代码目录（含 默认资源/） */
  pluginDir: string;
  logger?: MkLoggerResolved;
  /** 查询群成员/陌生人昵称（戒导 @ 他人时署名） */
  botApi?: MkBotApi;
}

/** 入群私聊：forward 解析收录 / 查看记录回放 */
export interface JoinGroupPmDeps {
  readA: MkReadA;
  writeA: MkWriteA;
  getDataPath: () => string;
  giveText: (message: unknown) => string;
  giveImages: (message: unknown) => string[];
  downloadFile: (url: string, savePath: string, isAbsolute?: boolean) => Promise<unknown>;
  botApi: MkBotApi;
  rand: MkRand;
  logger?: MkLogger;
}