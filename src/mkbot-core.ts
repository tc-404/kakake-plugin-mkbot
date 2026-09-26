// @ts-nocheck
// 体量极大，完整 strict 检查需分模块逐步抽取；边界类型见 ./types.ts，卡密逻辑已迁至 ./auth/card-license.ts，群老婆已迁至 ./auth/group-wife.ts，API接口功能已迁至 ./auth/api-interface.ts，漂流瓶已迁至 ./auth/drift-bottle.ts，入群私聊收录已迁至 ./auth/join-group-pm.ts，发卡系统已迁至 ./auth/card-shop.ts，发卡 WebUI API 已迁至 ./auth/card-shop-web.ts
import fs from 'fs';
import { createWriteStream } from 'fs';
import path from 'path';
import https from 'https';
import os from 'os';
import { createHash, randomBytes } from 'crypto';
import { fileURLToPath, pathToFileURL } from 'url';
import {
  checkAuthStatusImpl,
  getAuthStatus,
  setAuthStatus,
  handleCardLicenseCommands,
} from './auth/card-license';
import { handleGroupWifeCommands } from './auth/group-wife';
import { handleApiInterfaceCommands } from './auth/api-interface';
import { handleDriftBottleCommands } from './auth/drift-bottle';
import { handleCardShopCommands } from './auth/card-shop';
import { registerCardShopWebGetRoutes, registerCardShopWebPostRoutes } from './auth/card-shop-web';
import { registerMailWebGetRoutes, registerMailWebPostRoutes } from './auth/mail-web';
import { registerOfflineNotifyWebGetRoutes, registerOfflineNotifyWebPostRoutes } from './auth/offline-notify-web';
import {
  registerEntertainmentSwitchWebGetRoutes,
  registerEntertainmentSwitchWebPostRoutes,
} from './auth/entertainment-switches-web';
import {
  registerGlobalForbiddenWebGetRoutes,
  registerGlobalForbiddenWebPostRoutes,
} from './auth/global-forbidden-web';
import {
  registerConfigClipboardWebGetRoutes,
  registerConfigClipboardWebPostRoutes,
} from './auth/config-clipboard-web';
import { clearConfigClipboard } from './lib/config-clipboard';
import {
  registerShopPriceWebGetRoutes,
  registerShopPriceWebPostRoutes,
} from './auth/shop-price-web';
import { handleOfflineNotifyBotOffline } from './auth/offline-notify';
import { handleBqbCommands, BQB_EVENT_KEY } from './auth/bqb';
import {
  ENT_FEATURE_KEYS,
  entSwitchFile,
  isEntertainmentFeatureOn,
  resolveEntertainmentSwitches,
} from './lib/entertainment-switches';
import {
  checkSpamFlood,
  cleanupSpamFloodGuard,
  handleSpamFloodConfigCommands,
  initSpamFloodGuard,
  applySpamFloodWebSave,
  getSpamFloodWebPayload,
  resetSpamFloodWebConfig,
} from './lib/spam-flood-guard';
import {
  getMessageRecordBaseDir,
  getMessageRecordPathsForEvent,
  lookupMessageRecordEntry,
  stringifyMessageRecordStore,
} from './lib/message-record-storage';
import { handleQuickRecallBlock } from './lib/quick-recall';
import { sendMkMail, setMkMailInternalSecret } from './lib/api/mail-send';
import {
  buildFakeChatHelpText,
  extractFakeChatJsonPayload,
  FAKE_CHAT_EMOJI_REACT_PARSE_OK,
  FAKE_CHAT_EMOJI_REACT_SEND_OK,
  isStandaloneFakeChatJson,
  parseFakeChatJsonInput,
  prepareFakeChatForwardMessages,
  reactFakeChatCommandMessage,
} from './auth/fake-chat';
import {
  JOIN_PM_PROBABILITY_FILE,
  recordJoinGroupPmMessage,
  replayJoinGroupPmEntry,
  shouldTriggerJoinGroupPm,
} from './auth/join-group-pm';
import { zipSync } from 'fflate';
import extractZip from 'extract-zip';
import type { MkLogMethod, MkLoggerResolved } from './types';
import { PLUGIN_ICON_PATH } from './plugin-asset';
import { sendUnauthReplyIfEnabled as sendUnauthReplyIfEnabledImpl, requireAuthorized as requireAuthorizedImpl } from './lib/unauth-reply';
import {
  bindMkbotLogger,
  setDataPath,
  getDataPath,
  setPluginPath,
  getPluginPath,
  readA,
  readB,
  writeA,
  writeB,
  deleteA,
  deleteKey,
  hasKey,
  getKeys,
  clear,
} from './data-fs';
import { resolveEffectiveBgAbs } from './lib/bg-edit';
import { registerBgEditWebGetRoutes, registerBgEditWebPostRoutes } from './auth/bg-edit-web';
import { 发视频, 发语音, 发卡片, 发音乐卡片, 发合并消息, 发消息, 设消息表情, bindBotCtx, isSendTimeoutError, 段_文本, 段_图片, 段_视频, 段_语音, 段_文件, 段_Json, 段_表情, 段_引用, 段_艾特, 合并节点, 嵌套合并节点, 合并引用, 合并图文节点, 合并视文节点, 合并图片节点, 合并预览 } from './BOT';
import { callLocalVideoApi, callLocalImghostApi, callLocalMusicSignApi } from './lib/api/loader';
import { isImageRenderEnabled, getRenderMode } from './lib/image-render';
import {
  getSystemInfo as collectSystemInfo,
  getProcessList as collectProcessList,
  getSystemStatusSnapshot,
} from './lib/system-status';
import { getTodayChatLogStats } from './lib/kakake-log-stats';
import { renderMenuWithSharp, resetSharpModuleCache } from './lib/sharp-render';
import { renderSignInWithSharp } from './lib/signin-sharp-render';
import { renderWalletWithSharp } from './lib/wallet-sharp-render';
import { renderShopWithSharp } from './lib/shop-sharp-render';
import {
  getShopBasePrice,
  getShopLimit,
  loadShopPriceConfig,
} from './lib/shop-price-config';
import {
  WORK_ENT_KEY,
  WORK_MAX_HOURS,
  WORK_STANDARD_HOURS,
  clearWorkState,
  computeShopPriceIndex,
  computeWorkStatus,
  computeWorkWage,
  formatWorkDuration,
  isNightShiftHour,
  isWorkArea,
  pickWorkPost,
  readWorkState,
  resolveDailyStandardWage,
  splitWorkHours,
  workAreaNames,
  workMenuLines,
  workStatePostDef,
  writeWorkState,
} from './lib/work-job';
import { renderStatusWithSharp, STATUS_CARD_WIDTH, STATUS_CARD_HEIGHT } from './lib/status-sharp-render';
import { renderJoinIdentityWithSharp } from './lib/join-identity-sharp-render';
import { renderFishBasketWithSharp, FISH_BASKET_MAX_ROWS, FISH_BASKET_PER_PAGE, FISH_BASKET_MAX_PAGES } from './lib/fish-basket-sharp-render';
import { renderMusicListWithSharp } from './lib/music-list-sharp-render';
import { buildMenuIconSpriteSvg } from './lib/menu-icons';
import { configureSharpRuntimePaths } from './lib/sharp-loader';
import { getSharpDependencyStatus, triggerSharpDependencyInstall, cancelSharpDependencyInstall } from './lib/plugin-deps';
import { configureSharpWorkerPaths, disposeSharpWorker } from './lib/sharp-worker-client';
import { buildMajiaCard, sanitizeMajiaNickname } from './lib/majia-sanitize';
import { qzonePublishDynamic, qzoneGetFeeds, qzoneLike, qzoneComment, qzoneReplyComment } from './lib/qzone';
import {
  captureGuanjiaTokenFromMessage,
  guanjiaTestSend,
  GUANJIA_BOT_UIN,
  ensureGuanjiaToken,
} from './lib/qun-guanjia';
import { cleanupGuanjiaOnPluginStop } from './lib/qun-guanjia';
import {
  decodeObHtmlEntities,
  resolveEventPlainMessage,
  eventMessagePlainText,
  collectForbiddenWordMatchText,
  eventForbiddenWordMatchText,
  eventUserTextFromSegments,
  forbiddenWordsMatchText,
  isQqRedPacketLikeEvent,
  normalizeObActionParams,
  mkExtractBotApiPayload,
  mkAdaptBotApiResult,
  mkCompatUserId,
  mkCompatNickname,
  mkCompatShutUpTime,
  mkSetProtocolBackendSetting,
  mkSyncProtocolBackendFromFramework,
  mkEnsureProtocolBackend,
  mkIsSnowLumaBackend,
} from './lib/snowluma-compat';
export type {
  QzonePublishOptions,
  QzonePublishResult,
  QzoneGetFeedsOptions,
  QzoneFeedsResult,
  QzoneFeedItem,
  QzoneFeedComment,
  QzoneLikeOptions,
  QzoneLikeResult,
  QzoneCommentOptions,
  QzoneCommentResult,
  QzoneReplyCommentOptions,
} from './lib/qzone';

// ================== 全局变量 ==================
const noopMkLog: MkLogMethod = () => {};
const defaultLogger: MkLoggerResolved = {
  error: noopMkLog,
  warn: noopMkLog,
  info: noopMkLog,
  log: noopMkLog,
  debug: noopMkLog,
};
let logger: MkLoggerResolved = defaultLogger;
let plugin_config_ui: unknown[] = [];
let renderApiBase = "http://localhost:6099";
let lastHtmlRenderError = "";
let preferKakakeFrameworkRender = false;
/** NapCat 默认；咔咔珂宿主在 plugin_init 中改为 kakake-plugin-puppeteer */
let renderPluginId = "napcat-plugin-puppeteer";

function mkBuildRenderApiUrl(base) {
  const b = String(base || "").replace(/\/+$/g, "");
  return `${b}/plugin/${renderPluginId}/api/render`;
}

function mkIsKakakeLikeFramework(ctx) {
  const fw = ctx?.frameworkEnv;
  return !!(fw && (fw.frameworkId === 'kakake' || fw.frameworkId === 'mk-jsbot'));
}

/** 与 kakake DEFAULT_API_TIMEOUT_MS / normalizeApiTimeoutMs 对齐（须在 module 顶层，勿放进 handleMessage） */
const MK_DEFAULT_API_TIMEOUT_MS = 120_000;

function mkNormalizeApiTimeoutMs(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return MK_DEFAULT_API_TIMEOUT_MS;
  return Math.min(600_000, Math.max(5_000, Math.floor(n)));
}

/**
 * 解析超时：Kakake 宿主读 data/config.json 的 apiTimeoutMs（与 send_msg 等 API 同一配置）；
 * 非 Kakake 或读取失败时回退 120s。
 */
function mkBotResolveHostApiTimeoutMs(botCtx) {
  if (mkIsKakakeLikeFramework(botCtx)) {
    const root = String(botCtx?.frameworkEnv?.projectRoot || "").trim();
    if (root) {
      try {
        const cfgPath = path.join(root, "data", "config.json");
        if (fs.existsSync(cfgPath)) {
          const raw = JSON.parse(fs.readFileSync(cfgPath, "utf-8"));
          if (raw && raw.apiTimeoutMs != null) {
            return mkNormalizeApiTimeoutMs(raw.apiTimeoutMs);
          }
        }
      } catch (_e) {}
    }
  }
  return MK_DEFAULT_API_TIMEOUT_MS;
}

async function bindBotCtxWithProtocol(ctx) {
  bindBotCtx(ctx);
  mkSyncProtocolBackendFromFramework(ctx);
  if (ctx?.actions?.call) {
    await mkEnsureProtocolBackend(ctx, (action, params) =>
      ctx.actions.call(action, params, ctx.adapterName, ctx.pluginManager.config),
    );
  }
}

function mkReadPackageJsonName(ctx) {
  try {
    const pkgPath = path.join(ctx.pluginPath, 'package.json');
    if (fs.existsSync(pkgPath)) {
      return String(JSON.parse(fs.readFileSync(pkgPath, 'utf-8'))?.name || '').trim();
    }
  } catch (_e) {}
  return '';
}

function mkReadPluginJson(ctx) {
  try {
    const pluginJsonPath = path.join(ctx.pluginPath, 'plugin.json');
    if (fs.existsSync(pluginJsonPath)) {
      return JSON.parse(fs.readFileSync(pluginJsonPath, 'utf-8'));
    }
  } catch (_e) {}
  return null;
}

/** 优先 plugin.json，兼容旧产物 package.json */
function mkReadPluginVersion(ctx) {
  try {
    const pj = mkReadPluginJson(ctx);
    if (pj?.version != null && String(pj.version).trim()) return String(pj.version).trim();
  } catch (_e) {}
  try {
    const pkgPath = path.join(ctx.pluginPath, 'package.json');
    if (fs.existsSync(pkgPath)) {
      const v = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'))?.version;
      if (v != null && String(v).trim()) return String(v).trim();
    }
  } catch (_e) {}
  return '';
}

/** 数据目录/备份命名：优先 ctx.pluginName / plugin.json，兼容旧 package.json */
function mkResolvePluginStorageName(ctx) {
  if (mkIsKakakeLikeFramework(ctx) && ctx.pluginName) {
    return ctx.pluginName;
  }
  const fromPlugin = String(mkReadPluginJson(ctx)?.name || '').trim();
  return fromPlugin || mkReadPackageJsonName(ctx) || ctx.pluginName || 'kakake-plugin-mkbot';
}

/** 插件运行时数据根目录（与 readA/writeA 的 getDataPath 一致） */
function mkResolvePluginRuntimeDataDir(ctx) {
  if (mkIsKakakeLikeFramework(ctx)) {
    const dp = getDataPath() || (ctx.configPath ? path.dirname(ctx.configPath) : '');
    if (dp) return dp;
  }
  const legacy = path.join(ctx.pluginPath, '..', '..', 'config', 'plugins', mkResolvePluginStorageName(ctx));
  if (fs.existsSync(legacy)) return legacy;
  if (ctx.configPath) return path.dirname(ctx.configPath);
  return getDataPath();
}

function mkSharpDepsPaths(ctx) {
  return {
    dataDir: mkResolvePluginRuntimeDataDir(ctx),
    pluginDir: String(ctx?.pluginPath || PLUGIN_DIR || '').trim(),
  };
}

const PLUGIN_DIR = path.dirname(fileURLToPath(import.meta.url));

/** 邮箱发信依赖（含内部密钥，不对外导出） */
let mkMailSendDeps = null;

/** 离线通知依赖（与邮箱发信共用 readA/writeA） */
let offlineNotifyDeps = null;

/** MK 插件内部发信：发邮箱("邮箱", { 标题, 名字, 内容, 收件人 })，失败自动轮替下一个绑定邮箱 */
async function 发邮箱(渠道, ...args) {
  if (!mkMailSendDeps) {
    return { ok: false, message: '邮箱服务尚未初始化' };
  }
  return sendMkMail(mkMailSendDeps, 渠道, args);
}

/** 聚合图床：58同城 → fuliba → IMGDD，统一返回 { code, msg, data:{ url, source } } */
const 上传图床 = async (input) => callLocalImghostApi(PLUGIN_DIR, input);

/** 音乐签名档：随框架 | 繁华 | CZ；兼容旧布尔键「音乐接口」 */
function mkResolveMusicSignMode() {
  const raw = readB("config.json", "音乐签名", "");
  const mode = String(raw ?? "").trim();
  if (mode === "随框架" || mode === "繁华" || mode === "CZ") return mode;
  // 旧版：音乐接口 true=繁华(s01s)，false=随框架
  return readB("config.json", "音乐接口", false) ? "繁华" : "随框架";
}

/**
 * 按基础设置「音乐签名」档发送点歌卡片。
 * 随框架 → OB11 music；繁华 → s01s music_ark JSON；CZ → 本地 lib/api/music-sign.mjs
 * CZ/繁华失败时回退随框架，避免点歌整段中断。
 */
async function mkSendMusicBySignMode(event, { 歌名, 歌手, 封面, 链接, 平台 = "qq" }) {
  const mode = mkResolveMusicSignMode();
  const title = String(歌名 ?? "");
  const singer = String(歌手 ?? "");
  const image = String(封面 ?? "");
  const audio = String(链接 ?? "");
  const jump = audio;

  const sendNative = async () => 发音乐卡片(event, title, singer, image, jump, audio);

  if (mode === "繁华") {
    try {
      const 参数 = `?title=${encodeURIComponent(title)}&singer=${encodeURIComponent(singer)}&pingtai=${encodeURIComponent(平台)}&audio=${encodeURIComponent(audio)}&img=${encodeURIComponent(image)}&wx=${encodeURIComponent("你也想听歌嘛？")}&link=${encodeURIComponent(jump)}`;
      const response = await fetch("https://api.s01s.cn/API/music_ark/" + 参数);
      const text = await response.text();
      await 发卡片(event, text);
      return { ok: true, mode };
    } catch (_e) {
      await sendNative();
      return { ok: true, mode, fallback: "随框架" };
    }
  }

  if (mode === "CZ") {
    try {
      const signed = await callLocalMusicSignApi(PLUGIN_DIR, {
        title,
        singer,
        image,
        url: jump,
        audio,
        type: "qq",
      });
      if (!signed?.ok || !signed.ark) {
        throw new Error(signed?.error || "CZ 签名失败");
      }
      await 发卡片(event, signed.ark);
      return { ok: true, mode };
    } catch (_e) {
      await sendNative();
      return { ok: true, mode, fallback: "随框架" };
    }
  }

  await sendNative();
  return { ok: true, mode: "随框架" };
}

/** 与远程「版本类」公告条数对齐：文件名或 version 以「数字.数字」开头 */
function isMkbotAnnouncementComparableStem(stem) {
  return /^\d+\.\d+/.test(String(stem || ""));
}

/** 剥离版本行/字符串中的 [url:] / [url2:] 标记（允许空链接） */
function stripMkbotAnnouncementUrlMarkers(text) {
  return String(text ?? "")
    .replace(/\s*\[url2:[^\]]*\]\s*/gi, " ")
    .replace(/\s*\[url:[^\]]*\]\s*/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** 解析 MKbot 版本号用于排序（正式版同数字段优先于 alpha 等测试后缀） */
function parseMkbotVersionParts(version) {
  const raw = stripMkbotAnnouncementUrlMarkers(version).replace(/\.+$/, "");
  const m = raw.match(/^(\d+)\.(\d+)\.(\d+)(.*)$/);
  if (!m) {
    return { major: 0, minor: 0, patch: 0, suffix: raw, isPrerelease: /alpha|beta|rc|preview/i.test(raw) };
  }
  const suffix = String(m[4] ?? "").trim().replace(/^[-.]+/, "");
  const isPrerelease = suffix.length > 0 && /[a-zA-Z]/.test(suffix);
  return {
    major: Number(m[1]),
    minor: Number(m[2]),
    patch: Number(m[3]),
    suffix,
    isPrerelease,
  };
}

/** 与公告排序一致：返回值 >0 表示 a 比 b 新 */
function compareMkbotVersions(a, b) {
  const pa = parseMkbotVersionParts(a);
  const pb = parseMkbotVersionParts(b);
  for (const k of ["major", "minor", "patch"]) {
    if (pa[k] !== pb[k]) return pa[k] - pb[k];
  }
  if (!pa.isPrerelease && pb.isPrerelease) return 1;
  if (pa.isPrerelease && !pb.isPrerelease) return -1;
  if (!pa.isPrerelease && !pb.isPrerelease) return 0;
  return pa.suffix.localeCompare(pb.suffix, undefined, { numeric: true, sensitivity: "base" });
}

function parseMkbotAnnouncementVersionLine(first, stem) {
  let version = String(stem ?? "").replace(/\.+$/, "");
  let url = "";
  let url2 = "";

  const urlMatch = first.match(/\[url:((?:https?:\/\/[^\]]*)?)\]/i);
  if (urlMatch) url = String(urlMatch[1] || "").trim();

  const url2Match = first.match(/\[url2:((?:https?:\/\/[^\]]*)?)\]/i);
  if (url2Match) url2 = String(url2Match[1] || "").trim();

  const clean = stripMkbotAnnouncementUrlMarkers(first);
  if (clean) {
    version = clean.replace(/\.+$/, "");
  } else if (first && !url && !url2) {
    version = stripMkbotAnnouncementUrlMarkers(first).replace(/\.+$/, "") || version;
  }

  return { version, url, url2 };
}

function parseMkbotLocalAnnouncementTxt(filePath, stem) {
  const raw = fs.readFileSync(filePath, "utf-8").replace(/^\uFEFF/, "");
  const lines = raw.split(/\r?\n/);
  const priority = !isMkbotAnnouncementComparableStem(stem);
  if (priority) {
    return {
      version: "置顶说明",
      url: "",
      url2: "",
      time: "",
      releaseTime: "",
      content: raw.trim(),
      isPrerelease: false,
      isPriority: true,
    };
  }
  const first = (lines[0] || "").trim();
  const parsed = parseMkbotAnnouncementVersionLine(first, stem);
  const time = (lines[1] || "").trim();
  const content = lines.slice(2).join("\n").trim();
  const isPrerelease = /alpha|beta|rc|preview/i.test(parsed.version);
  // WebUI 与远程接口均使用 releaseTime 展示发布时间
  return {
    version: parsed.version,
    url: parsed.url,
    url2: parsed.url2,
    time,
    releaseTime: time,
    content,
    isPrerelease,
    isPriority: false,
  };
}

function loadMkbotLocalAnnouncementsForWebUI() {
  const root = getPluginPath() || PLUGIN_DIR;
  const out = { items: [], comparableCount: 0 };
  if (!root) return out;
  const dir = path.join(root, "默认资源", "更新公告");
  let st;
  try {
    if (!fs.existsSync(dir)) return out;
    st = fs.statSync(dir);
  } catch {
    return out;
  }
  if (!st.isDirectory()) return out;
  let names;
  try {
    names = fs.readdirSync(dir);
  } catch {
    return out;
  }
  for (const name of names) {
    if (!name.toLowerCase().endsWith(".txt")) continue;
    const stem = name.slice(0, -4);
    const fp = path.join(dir, name);
    try {
      const item = parseMkbotLocalAnnouncementTxt(fp, stem);
      out.items.push(item);
      if (!item.isPriority) out.comparableCount++;
    } catch (e) {
      logger?.warn?.(`读取本地公告失败 ${fp}:`, e?.message || e);
    }
  }
  out.items.sort((a, b) => {
    if (a.isPriority !== b.isPriority) return a.isPriority ? -1 : 1;
    return compareMkbotVersions(b.version, a.version);
  });
  return out;
}

function countMkbotRemoteComparableAnnouncements(items) {
  if (!Array.isArray(items)) return 0;
  let n = 0;
  for (const it of items) {
    if (it && it.isPriority) continue;
    const v = String(it?.version ?? "").trim();
    if (isMkbotAnnouncementComparableStem(v)) n++;
  }
  return n;
}

async function fetchMkbotRemoteAnnouncementData(key) {
  const https = await import("https");
  let remoteUrl = "https://xn--mk-ub3cl61ae1v.xn--c5w857b.xn--fiqs8s/mkbot/";
  if (key) {
    remoteUrl += "?key=" + encodeURIComponent(key);
  }
  const MAX_ANNOUNCE_BODY = 2 * 1024 * 1024;
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (err, data) => {
      if (settled) return;
      settled = true;
      try {
        request.destroy();
      } catch {
        /* ignore */
      }
      if (err) reject(err);
      else resolve(Array.isArray(data) ? data : []);
    };
    const request = https.get(remoteUrl, (response) => {
      let data = "";
      let size = 0;
      response.on("data", (chunk) => {
        if (settled) return;
        size += chunk.length;
        if (size > MAX_ANNOUNCE_BODY) {
          finish(new Error("公告响应过大"));
          try {
            response.destroy();
          } catch {
            /* ignore */
          }
          return;
        }
        data += chunk;
      });
      response.on("end", () => {
        if (settled) return;
        try {
          const jsonData = JSON.parse(data);
          finish(null, jsonData.data || []);
        } catch (e) {
          finish(e);
        }
      });
      response.on("error", (error) => finish(error));
    });
    request.on("error", (error) => finish(error));
    request.setTimeout(5000, () => {
      if (settled) return;
      finish(new Error("获取公告超时"));
    });
  });
}

// 格式化字节为 GB/TB
function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return (bytes / Math.pow(k, i)).toFixed(2) + ' ' + sizes[i];
}

// ================== 工具函数 - 系统信息 ==================
// 采集实现已迁至 ./lib/system-status：全异步 execFile + 定时器采样，
// 带超时、输出上限与快照缓存，采集期间不会阻塞事件循环。
async function getSystemInfo() {
  return await collectSystemInfo(logger);
}

async function getProcessList() {
  return await collectProcessList(logger);
}

// ================== 工具函数 - 时间和随机 ==================
function timeA(format, timestamp) {
  const ts = timestamp ? timestamp : Math.floor(Date.now() / 1000);
  const date = new Date(ts * 1000);
  
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const seconds = String(date.getSeconds()).padStart(2, '0');
  
  return format
    .replace(/y/g, year)
    .replace(/m/g, month)
    .replace(/d/g, day)
    .replace(/H/g, hours)
    .replace(/i/g, minutes)
    .replace(/s/g, seconds);
}

/** group_increase 去重：QQ/协议层对官方机器人等会重复推送同一入群通知 */
const mkGroupIncreaseDedup = new Map();
const MK_GROUP_INCREASE_DEDUP_MS = 15000;
const MK_GROUP_INCREASE_FUZZY_MS = 5000;

function mkIsDuplicateGroupIncrease(event) {
  const gid = String(event?.group_id ?? "");
  const uid = String(event?.user_id ?? "");
  if (!gid || !uid) return false;
  const sub = String(event?.sub_type ?? "");
  const op = String(event?.operator_id ?? "0");
  const t = Number(event?.time) || Math.floor(Date.now() / 1000);
  const exactKey = `${gid}|${uid}|${sub}|${op}|${t}`;
  const now = Date.now();
  for (const [k, ts] of mkGroupIncreaseDedup) {
    if (now - ts > MK_GROUP_INCREASE_DEDUP_MS) mkGroupIncreaseDedup.delete(k);
  }
  if (mkGroupIncreaseDedup.has(exactKey)) return true;
  const fuzzyPrefix = `${gid}|${uid}|`;
  for (const [k, ts] of mkGroupIncreaseDedup) {
    if (!k.startsWith(fuzzyPrefix)) continue;
    if (now - ts < MK_GROUP_INCREASE_FUZZY_MS) return true;
  }
  mkGroupIncreaseDedup.set(exactKey, now);
  return false;
}

/** 插件数据备份：私聊文件显示名（中文、无空格）例：MKbot数据备份_2026年07月10日14时41分00秒.zip */
function mkBackupZipDisplayName(timestampSec) {
  const sec = timestampSec != null ? timestampSec : Math.floor(Date.now() / 1000);
  return `MKbot数据备份_${timeA("y", sec)}年${timeA("m", sec)}月${timeA("d", sec)}日${timeA("H", sec)}时${timeA("i", sec)}分${timeA("s", sec)}秒.zip`;
}

function timeB(format, timestamp) {
  let remaining = timestamp;
  
  const hasYear = format.includes('y');
  const hasMonth = format.includes('m');
  const hasDay = format.includes('d');
  const hasHour = format.includes('H');
  const hasMinute = format.includes('i');
  const hasSecond = format.includes('s');
  
  let years = 0, months = 0, days = 0, hours = 0, minutes = 0, seconds = 0;
  
  if (hasYear) {
    years = Math.floor(remaining / 31536000);
    remaining %= 31536000;
  }
  
  if (hasMonth) {
    months = Math.floor(remaining / 2678400);
    remaining %= 2678400;
  }
  
  if (hasDay) {
    days = Math.floor(remaining / 86400);
    remaining %= 86400;
  }
  
  if (hasHour) {
    hours = Math.floor(remaining / 3600);
    remaining %= 3600;
  }
  
  if (hasMinute) {
    minutes = Math.floor(remaining / 60);
    remaining %= 60;
  }
  
  if (hasSecond) {
    seconds = remaining;
  }
  
  const needsZeroPad = (value) => String(value).padStart(2, '0');
  
  let result = format;
  
  result = result.replace(/y+/g, (match) => {
    return match.length === 1 ? years : needsZeroPad(years);
  });
  
  result = result.replace(/m+/g, (match) => {
    return match.length === 1 ? months : needsZeroPad(months);
  });
  
  result = result.replace(/d+/g, (match) => {
    return match.length === 1 ? days : needsZeroPad(days);
  });
  
  result = result.replace(/H+/g, (match) => {
    return match.length === 1 ? hours : needsZeroPad(hours);
  });
  
  result = result.replace(/i+/g, (match) => {
    return match.length === 1 ? minutes : needsZeroPad(minutes);
  });
  
  result = result.replace(/s+/g, (match) => {
    return match.length === 1 ? seconds : needsZeroPad(seconds);
  });
  
  return result;
}

function rand(min, max) {
  if (typeof min === 'number' && typeof max === 'number') {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }
  
  if (typeof min === 'string' && typeof max === 'string') {
    const minChar = min.toLowerCase();
    const maxChar = max.toLowerCase();
    
    if (minChar === min && maxChar === max) {
      const minCode = min.charCodeAt(0);
      const maxCode = max.charCodeAt(0);
      const randomCode = Math.floor(Math.random() * (maxCode - minCode + 1)) + minCode;
      return String.fromCharCode(randomCode);
    } else if (minChar === min && maxChar !== max) {
      const allLetters = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
      return allLetters[Math.floor(Math.random() * allLetters.length)];
    } else if (minChar !== min && maxChar === max) {
      const allLetters = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
      return allLetters[Math.floor(Math.random() * allLetters.length)];
    } else {
      const minCode = min.charCodeAt(0);
      const maxCode = max.charCodeAt(0);
      const randomCode = Math.floor(Math.random() * (maxCode - minCode + 1)) + minCode;
      return String.fromCharCode(randomCode);
    }
  }
  
  return null;
}

function randB(min, max) {
    if (typeof min === 'number' && typeof max === 'number') {
        // 生成范围内的浮点数，并保留两位小数
        return parseFloat((Math.random() * (max - min) + min).toFixed(2));
    }
    return null; // 如果参数不是数字，返回 null
}


function moneyA(number) {
    let AC比例 = 100000;
    let BC比例 = 1000;
    const erci = Math.ceil(number);
    let RC_moneyA = "";
    if(erci != 0){
        let 利润_换算_玉令 = Math.floor(number / AC比例);
        let 利润_换算_玉笺 = Math.floor((number % AC比例) / BC比例);
        let 利润_换算_归笺 = Math.floor(number % BC比例);
        if(利润_换算_玉令 != 0){
            RC_moneyA += `${利润_换算_玉令}玉令`;
        }
        if(利润_换算_玉笺 != 0){
            RC_moneyA += `${利润_换算_玉笺}玉笺`;
        }
        RC_moneyA += `${利润_换算_归笺}归笺`;
    }else{
        RC_moneyA += `${erci}归笺`;
    }
    return RC_moneyA;
}

// 单次下载最大字节（防止异常大包导致堆内存暴涨 / OOM）
const MAX_DOWNLOAD_BYTES = 512 * 1024 * 1024;

// 下载浏览器 UA：B 站等 CDN 对空 UA 的长连接容易中途断流
const MK_DOWNLOAD_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';
// 网络中断时的总尝试次数（含首次），支持 Range 续传
const MK_DOWNLOAD_MAX_ATTEMPTS = 3;

/** 按域名补 Referer：B 站 CDN 缺 Referer 会被限速/掐断，其余平台同理 */
function mkResolveDownloadReferer(url) {
  let host = "";
  try {
    host = new URL(String(url)).hostname.toLowerCase();
  } catch {
    return "";
  }
  if (/(^|\.)(bilivideo\.(com|cn)|bilibili\.com|hdslb\.com|akamaized\.net)$/.test(host)) {
    return "https://www.bilibili.com/";
  }
  if (/(douyin|douyinvod|douyinpic|amemv|snssdk|byteimg|bytecdn)/.test(host)) {
    return "https://www.douyin.com/";
  }
  if (/(xhscdn|xiaohongshu)/.test(host)) return "https://www.xiaohongshu.com/";
  if (/(kuaishou|yximgs)/.test(host)) return "https://www.kuaishou.com/";
  if (/(googlevideo|ytimg|youtube)/.test(host)) return "https://www.youtube.com/";
  if (/(tiktok|tiktokcdn|tiktokv|musical\.ly)/.test(host)) return "https://www.tiktok.com/";
  return "";
}

/** 视频解析临时下载 Cookie（TikTok CDN 需要页面 tt_chain_token 等） */
const MK_VIDEO_DOWNLOAD_COOKIES = new Map();

function mkSetVideoDownloadCookie(scope, cookie) {
  const key = String(scope || "").trim();
  const val = String(cookie || "").trim();
  if (!key) return;
  if (val) MK_VIDEO_DOWNLOAD_COOKIES.set(key, val);
  else MK_VIDEO_DOWNLOAD_COOKIES.delete(key);
}

function mkLookupVideoDownloadCookie(url) {
  let host = "";
  try {
    host = new URL(String(url)).hostname.toLowerCase();
  } catch {
    return "";
  }
  if (/(tiktok|tiktokcdn|tiktokv|musical\.ly)/.test(host)) {
    return MK_VIDEO_DOWNLOAD_COOKIES.get("tiktok") || "";
  }
  return "";
}

/** 下载请求头：UA + Referer（+ 续传 Range） */
function mkBuildDownloadHeaders(url, startByte = 0) {
  const headers = {
    "User-Agent": MK_DOWNLOAD_USER_AGENT,
    Accept: "*/*",
    "Accept-Language": "zh-CN,zh;q=0.9",
  };
  const referer = mkResolveDownloadReferer(url);
  if (referer) headers.Referer = referer;
  const cookie = mkLookupVideoDownloadCookie(url);
  if (cookie) headers.Cookie = cookie;
  if (Number(startByte) > 0) headers.Range = `bytes=${Number(startByte)}-`;
  return headers;
}

/** 对端中途断流 / 连接被重置这类可重试错误 */
function mkIsRetryableDownloadError(error) {
  const code = String(error?.code || error?.cause?.code || "");
  if (/ECONNRESET|EPIPE|ENETRESET|ECONNABORTED|EAI_AGAIN|UND_ERR|ECONNREFUSED/i.test(code)) return true;
  const msg = String(error?.message || error?.cause?.message || error || "");
  return /terminated|socket hang up|premature close|other side closed|fetch failed|network|read ECONN/i.test(msg);
}

/**
 * 单次下载尝试。
 * @returns {Promise<{ok:boolean,timeout?:boolean,retryable?:boolean,received?:number,resumable?:boolean,error?:any}>}
 */
async function mkDownloadFileAttempt(url, fullPath, timeoutMs, startByte) {
  let timer = null;
  const controller = Number(timeoutMs) > 0 ? new AbortController() : null;
  if (controller) {
    timer = setTimeout(() => controller.abort(), Number(timeoutMs));
  }
  let 落盘字节 = Number(startByte) > 0 ? Number(startByte) : 0;
  try {
    const res = await fetch(url, {
      headers: mkBuildDownloadHeaders(url, 落盘字节),
      ...(controller ? { signal: controller.signal } : {}),
    });

    // 请求了 Range 但对端不支持 → 从头重下
    let 追加模式 = false;
    if (落盘字节 > 0) {
      if (res.status === 206) {
        追加模式 = true;
      } else {
        落盘字节 = 0;
      }
    }

    if (!res.ok) {
      logger.error(`[Function] 下载失败: HTTP ${res.status}`);
      return {
        ok: false,
        retryable: res.status === 429 || res.status >= 500,
        received: 0,
        resumable: false,
      };
    }

    const lenHeader = res.headers.get('content-length');
    if (lenHeader) {
      const n = parseInt(lenHeader, 10);
      if (Number.isFinite(n) && n + 落盘字节 > MAX_DOWNLOAD_BYTES) {
        logger.error(`[Function] 下载已拒绝: Content-Length 超过上限 (${n + 落盘字节})`);
        return { ok: false, retryable: false, received: 0, resumable: false };
      }
    }

    if (!res.body) {
      logger.error(`[Function] 下载失败: 无响应体`);
      return { ok: false, retryable: true, received: 0, resumable: false };
    }

    const 支持续传 = 追加模式 || /bytes/i.test(String(res.headers.get('accept-ranges') || ""));
    const reader = res.body.getReader();
    const writeStream = createWriteStream(fullPath, 追加模式 ? { flags: 'a' } : {});
    let received = 落盘字节;

    try {
      while (true) {
        if (controller?.signal?.aborted) {
          await reader.cancel().catch(() => {});
          writeStream.destroy();
          throw new Error(`ETIMEDOUT 下载超时 ${timeoutMs}ms`);
        }
        const { done, value } = await reader.read();
        if (done) break;
        if (value && value.byteLength) {
          received += value.byteLength;
          if (received > MAX_DOWNLOAD_BYTES) {
            await reader.cancel();
            writeStream.destroy();
            logger.error(`[Function] 下载已中止: 超过 ${MAX_DOWNLOAD_BYTES} 字节`);
            return { ok: false, retryable: false, received, resumable: false };
          }
          if (!writeStream.write(value)) {
            await new Promise((resolve, reject) => {
              writeStream.once('drain', resolve);
              writeStream.once('error', reject);
            });
          }
        }
      }
    } catch (e) {
      writeStream.destroy();
      throw e;
    }

    await new Promise((resolve, reject) => {
      writeStream.once('finish', resolve);
      writeStream.once('error', reject);
      writeStream.end();
    });

    return { ok: true, received };
  } catch (error) {
    if (
      error?.name === "AbortError" ||
      error?.code === "ABORT_ERR" ||
      String(error?.message || error).includes("ETIMEDOUT")
    ) {
      return { ok: false, timeout: true, retryable: false, error };
    }
    let 已落盘 = 0;
    try {
      已落盘 = fs.existsSync(fullPath) ? fs.statSync(fullPath).size : 0;
    } catch {
      已落盘 = 0;
    }
    return {
      ok: false,
      retryable: mkIsRetryableDownloadError(error),
      received: 已落盘,
      resumable: 已落盘 > 0,
      error,
    };
  } finally {
    if (timer) clearTimeout(timer);
  }
}

// ================== 文件下载 ==================
/**
 * 下载文件；网络中途断流时自动重试（能续传则带 Range 续传）。
 * @param {number} [timeoutMs=0] 大于 0 时单次尝试超时抛出含 ETIMEDOUT 的 Error，便于与发送超时统一处理
 */
async function downloadFile(url, savePath, isAbsolute = false, timeoutMs = 0) {
  const fullPath = isAbsolute ? savePath : path.join(getDataPath(), savePath);
  const dir = path.dirname(fullPath);
  const cleanupPartial = () => {
    try {
      if (fs.existsSync(fullPath)) fs.unlinkSync(fullPath);
    } catch {
      // ignore
    }
  };

  try {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  } catch (error) {
    logger.error(`[Function] 下载失败: 目录创建失败 ${dir}`, error);
    return false;
  }

  let 续传起点 = 0;
  for (let attempt = 1; attempt <= MK_DOWNLOAD_MAX_ATTEMPTS; attempt++) {
    const 结果 = await mkDownloadFileAttempt(url, fullPath, timeoutMs, 续传起点);
    if (结果.ok) return true;

    if (结果.timeout) {
      cleanupPartial();
      logger.error(`[Function] 下载超时: ${timeoutMs}ms`, 结果.error);
      throw new Error(`ETIMEDOUT 下载超时 ${timeoutMs}ms`);
    }

    const 还能重试 = 结果.retryable && attempt < MK_DOWNLOAD_MAX_ATTEMPTS;
    if (!还能重试) {
      cleanupPartial();
      if (结果.error) logger.error(`[Function] 下载文件失败:`, 结果.error);
      return false;
    }

    续传起点 = 结果.resumable ? Number(结果.received) || 0 : 0;
    if (续传起点 <= 0) cleanupPartial();
    logger?.warn?.(
      `[Function] 下载中断，第 ${attempt}/${MK_DOWNLOAD_MAX_ATTEMPTS - 1} 次重试` +
        `${续传起点 > 0 ? `（自 ${续传起点} 字节续传）` : ""}: ${String(结果.error?.message || 结果.error || "")}`,
    );
    await new Promise((r) => setTimeout(r, 500 * attempt));
  }

  cleanupPartial();
  return false;
}

// ================== ZIP（fflate + extract-zip，构建时打入 bundle，无需 PowerShell/unzip 命令） ==================

/** 递归收集相对路径 → 内容；目录压缩时顶层带文件夹名，贴近 PowerShell Compress-Archive 习惯 */
function collectZipEntriesFromSource(sourcePath) {
  const resolved = path.resolve(sourcePath);
  if (!fs.existsSync(resolved)) {
    throw new Error(`源路径不存在: ${sourcePath}`);
  }
  const stat = fs.statSync(resolved);
  const out = {};
  if (stat.isFile()) {
    out[path.basename(resolved)] = new Uint8Array(fs.readFileSync(resolved));
    return out;
  }
  if (!stat.isDirectory()) {
    throw new Error(`不支持的源类型: ${sourcePath}`);
  }
  const rootName = path.basename(resolved);
  function walk(absDir, zipPrefix) {
    const entries = fs.readdirSync(absDir, { withFileTypes: true });
    for (const ent of entries) {
      const abs = path.join(absDir, ent.name);
      const relWithinRoot = `${zipPrefix}/${ent.name}`;
      const zipRel = relWithinRoot.replace(/\\/g, '/');
      if (ent.isDirectory()) {
        walk(abs, `${zipPrefix}/${ent.name}`);
      } else if (ent.isFile()) {
        out[zipRel] = new Uint8Array(fs.readFileSync(abs));
      }
    }
  }
  walk(resolved, rootName);
  return out;
}

// ================== 解压 ZIP 文件 ==================
async function unzipFile(zipPath, extractPath) {
  try {
    const dir = path.resolve(extractPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    await extractZip(path.resolve(zipPath), { dir });
    if (logger?.info) logger.info(`[Function] 解压成功: ${zipPath} → ${extractPath}`);
    else if (logger?.log) logger.log(`[Function] 解压成功: ${zipPath} → ${extractPath}`);
    else console.log(`[Function] 解压成功: ${zipPath} → ${extractPath}`);
    return true;
  } catch (error) {
    logger.error(`[Function] 解压失败:`, error.message);
    return false;
  }
}






// ================== 压缩文件或文件夹 ==================
async function zipFile(sourcePath, outputZipPath) {
  try {
    const outputDir = path.dirname(outputZipPath);
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }
    const entries = collectZipEntriesFromSource(sourcePath);
    if (Object.keys(entries).length === 0) {
      logger?.error?.(`[Function] 压缩失败: 源路径下没有可压缩的文件`);
      return false;
    }
    const zipped = zipSync(entries, { level: 6 });
    fs.writeFileSync(outputZipPath, Buffer.from(zipped));
    if (logger?.info) logger.info(`[Function] 压缩成功: ${sourcePath} → ${outputZipPath}`);
    else if (logger?.log) logger.log(`[Function] 压缩成功: ${sourcePath} → ${outputZipPath}`);
    else console.log(`[Function] 压缩成功: ${sourcePath} → ${outputZipPath}`);
    return true;
  } catch (error) {
    logger.error(`[Function] 压缩失败:`, error.message);
    return false;
  }
}

/** NapCat 自签 HTTPS：用 node 内置 https，避免 Vite 对 node:undici 的告警且 rejectUnauthorized 可控 */
function mkbotPostRenderHttps(apiUrl, jsonBody) {
  const payload = JSON.stringify(jsonBody);
  const u = new URL(apiUrl);
  return new Promise((resolve, reject) => {
    const opts = {
      hostname: u.hostname,
      port: u.port || 443,
      path: `${u.pathname}${u.search}`,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(payload, "utf8"),
      },
      rejectUnauthorized: false,
    };
    const req = https.request(opts, (res) => {
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => {
        const text = Buffer.concat(chunks).toString("utf8");
        let parsed = null;
        try {
          parsed = text ? JSON.parse(text) : {};
        } catch (_e) {
          parsed = { code: -1, message: "invalid_json_response" };
        }
        resolve({
          ok: res.statusCode >= 200 && res.statusCode < 300,
          status: res.statusCode,
          json: async () => parsed,
        });
      });
    });
    req.on("error", reject);
    req.write(payload);
    req.end();
  });
}

async function puppeteer(html, data = null) {
  try {
    lastHtmlRenderError = "";
    const suppressErrorLog = !!(data && data.suppressErrorLog);
    const bases = [];
    const curBase = String(renderApiBase || "").replace(/\/+$/g, "");
    if (curBase) bases.push(curBase);
    if (preferKakakeFrameworkRender) {
      // 咔咔珂宿主：主基址不可用时回退到本机控制台默认端口
      bases.push("http://127.0.0.1:8787");
      bases.push("http://localhost:8787");
    }
    const waitForTimeout = (data && Number.isFinite(data.waitForTimeout)) ? Number(data.waitForTimeout) : 0;
    const waitForSelector = (data && typeof data.waitForSelector === 'string' && data.waitForSelector.trim())
      ? data.waitForSelector.trim()
      : undefined;
    const pageGotoTimeoutMs = (data && Number.isFinite(data.pageGotoTimeoutMs))
      ? Number(data.pageGotoTimeoutMs)
      : undefined;
    
    const json = {
      html: html,
      data: data?.data || {},
      setViewport: {
        width: data?.width || 800,
        height: data?.height || 600
      },
      waitForTimeout: waitForTimeout,
      waitForSelector: waitForSelector,
      pageGotoParams: Number.isFinite(pageGotoTimeoutMs) ? { timeout: pageGotoTimeoutMs } : undefined
    };

    let lastErr = "";
    for (const b of bases) {
      const api = mkBuildRenderApiUrl(b);
      try {
        const fetchOpts = {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(json),
        };
        let response;
        let result;
        if (/^https:/i.test(b)) {
          response = await mkbotPostRenderHttps(api, json);
          if (!response.ok) {
            lastErr = `HTTP ${response.status}`;
            continue;
          }
          result = await response.json();
        } else {
          response = await fetch(api, fetchOpts);
          if (!response.ok) {
            lastErr = `HTTP ${response.status}`;
            continue;
          }
          result = await response.json();
        }
        if (result && result.failedRequests && Array.isArray(result.failedRequests) && result.failedRequests.length) {
          try {
            logger.warn(`[Function] 渲染资源加载失败(${result.failedRequests.length}):\n` + result.failedRequests.slice(0, 12).join('\n'));
          } catch (_e) {}
        }
        if (result && result.code === 0 && result.data) {
          renderApiBase = b;
          return result.data;
        }
        lastErr = (result && result.message) ? String(result.message) : "未知错误";
      } catch (e) {
        lastErr = e?.message || String(e);
      }
    }
    lastHtmlRenderError = lastErr || "render_failed";
    if (!suppressErrorLog) {
      logger.error(`[Function] HTML渲染失败:`, lastHtmlRenderError);
    }
    return null;
  } catch (error) {
    lastHtmlRenderError = error?.message || String(error);
    if (!suppressErrorLog) {
      logger.error(`[Function] 调用 HTML 渲染接口失败:`, error);
    }
    return null;
  }
}

async function probeKakakeRenderApiBase() {
  const candidates = ["http://127.0.0.1:8787", "http://localhost:8787"];
  for (const b of candidates) {
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 900);
      const r = await fetch(`${b}/api/status`, { signal: ctrl.signal });
      clearTimeout(t);
      if (r && r.ok) return b;
    } catch (_e) {}
  }
  return "";
}

/** 运行状态置顶卡用的账号条目 */
type MkStatusAccount = {
  qq: string;
  appId: string;
  name: string;
  avatar: string;
  typeText: string;
  directionText: string;
  statusText: string;
  phase: string;
  connected: boolean;
};

/**
 * 读取咔咔珂本机连接列表（/api/local/connections），供「运行状态」置顶卡做多账号展示。
 * 只在咔咔珂宿主下尝试，端口优先取宿主的 WebUI 端口；取不到就返回空数组，
 * 调用方会退回「当前账号」单账号展示。
 */
async function fetchKakakeStatusAccounts(ctx, logger): Promise<MkStatusAccount[]> {
  if (!mkIsKakakeLikeFramework(ctx)) return [];
  try {
    const fw = ctx?.frameworkEnv || {};
    const port = Number(fw.adminPort || 0);
    const bases = [];
    if (port > 0) bases.push(`http://127.0.0.1:${port}`);
    bases.push("http://127.0.0.1:8787", "http://localhost:8787");

    const seen = new Set();
    for (const b of bases) {
      if (!b || seen.has(b)) continue;
      seen.add(b);
      try {
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), 1500);
        const r = await fetch(`${b}/api/local/connections`, { signal: ctrl.signal });
        clearTimeout(t);
        if (!r || !r.ok) continue;
        const j = await r.json();
        if (!j || j.ok !== true || !Array.isArray(j.connections)) continue;

        const list = j.connections
          .filter((c) => c && (c.type === "onebot" || c.type === "qq_official"))
          .slice(0, 40)
          .map((c) => {
            const qq = String(c.qq || "").trim();
            const name = String(c.name || "").trim() || (qq ? `QQ ${qq}` : "未知账号");
            return {
              qq,
              appId: String(c.appId || "").trim(),
              name,
              avatar: String(c.avatar || "").trim(),
              typeText: String(c.typeText || "").trim(),
              directionText: String(c.directionText || "").trim(),
              statusText: String(c.statusText || "").trim(),
              phase: String(c.phase || "").trim(),
              connected: c.connected !== false,
            };
          });
        if (list.length) return list;
      } catch (_e) {
        /* 试下一个基址 */
      }
    }
  } catch (e) {
    try {
      logger?.warn?.("[运行状态] 读取本机连接列表失败，已退回单账号展示:", e?.message || String(e));
    } catch (_e) {}
  }
  return [];
}

/** 运势「URL.json」：按本地文件名匹配远程图（与 buildBgImageCss / resolveImageForCq 内逻辑一致，供今日运势等复用） */
function resolveFortuneRemoteUrlFromList(rawName) {
  try {
    const s = String(rawName || "").trim();
    if (!s) return "";
    if (/^https?:\/\//i.test(s)) return s;
    const targetBase = path.basename(s).toLowerCase();
    if (!targetBase) return "";
    const raw = readA("默认资源/text/URL.json");
    if (!raw) return "";
    const list = JSON.parse(raw);
    if (!Array.isArray(list)) return "";
    for (const item of list) {
      if (typeof item === "string") {
        const url = item.trim();
        if (!/^https?:\/\//i.test(url)) continue;
        try {
          const pathname = decodeURIComponent(new URL(url).pathname || "");
          const base = path.basename(pathname).toLowerCase();
          if (base === targetBase) return url;
        } catch (_e) {}
        continue;
      }
      if (!item || typeof item !== "object") continue;
      const url = String(item.url ?? item.remote ?? item.link ?? "").trim();
      if (!/^https?:\/\//i.test(url)) continue;
      const nameFromItem = String(item.name ?? item.file ?? item.filename ?? "").trim().toLowerCase();
      if (nameFromItem && path.basename(nameFromItem) === targetBase) return url;
      try {
        const pathname = decodeURIComponent(new URL(url).pathname || "");
        const base = path.basename(pathname).toLowerCase();
        if (base === targetBase) return url;
      } catch (_e) {}
    }
  } catch (_e) {}
  return "";
}

const STATUS_BG_REMOTE_URL =
  "http://xn--mk-ub3cl61ae1v.xn--c5w857b.xn--fiqs8s/mkbot/image/yunxing.jpg";
const MENU_BG_REMOTE_LANDSCAPE =
  "http://xn--mk-ub3cl61ae1v.xn--c5w857b.xn--fiqs8s/mkbot/image/heng.jpg";
const MENU_BG_REMOTE_PORTRAIT =
  "http://xn--mk-ub3cl61ae1v.xn--c5w857b.xn--fiqs8s/mkbot/image/shu.jpg";

function resolveMenuBackgroundUrl(ctx, imageRenderOn) {
  if (imageRenderOn === false || imageRenderOn == false) {
    return "";
  }
  const fields = buildHtmlBackgroundFields(resolveEffectiveBgAbs("menu") || "heng.jpg");
  if (fields.backgroundImageUrl) return fields.backgroundImageUrl;
  if (mkIsKakakeLikeFramework(ctx)) {
    try {
      logger?.warn?.("[Function] 菜单本地背景 heng.jpg 不可用，已切换远程");
    } catch (_e) {}
  }
  return "";
}

/** HTML 菜单渲染：puppeteer 页面无法加载 file://，本地图必须内联 data URL */
function resolveMenuHtmlBackgroundUrl(ctx, imageRenderOn) {
  if (imageRenderOn === false || imageRenderOn == false) {
    return "";
  }
  const dataUrl = defaultResourceImageToDataUrl(resolveEffectiveBgAbs("menu") || "heng.jpg");
  if (dataUrl) return dataUrl;
  const fields = buildHtmlBackgroundFields(resolveEffectiveBgAbs("menu") || "heng.jpg");
  const url = String(fields.backgroundImageUrl || "").trim();
  if (url && !/^file:/i.test(url)) return url;
  try {
    logger?.warn?.("[Function] 菜单 HTML 本地背景不可用，已切换远程");
  } catch (_e) {}
  return MENU_BG_REMOTE_LANDSCAPE;
}

/** 默认资源/image 下本地图转 data URL（供 HTML puppeteer 内联背景） */
function defaultResourceImageToDataUrl(rawName) {
  const abs = resolveDefaultResourceImageAbs(rawName);
  if (!abs || !fs.existsSync(abs)) return "";
  try {
    const ext = String(path.extname(abs) || "").toLowerCase();
    const mimeMap = {
      ".png": "image/png",
      ".jpg": "image/jpeg",
      ".jpeg": "image/jpeg",
      ".webp": "image/webp",
      ".gif": "image/gif",
      ".svg": "image/svg+xml",
    };
    const mime = mimeMap[ext] || "application/octet-stream";
    const buf = fs.readFileSync(abs);
    if (!buf || !buf.length) return "";
    return `data:${mime};base64,${buf.toString("base64")}`;
  } catch (_e) {
    return "";
  }
}

/** 默认资源/image 下本地图候选名（精确名优先；无扩展名时再补常见后缀） */
function listDefaultResourceImageCandidateNames(rawName) {
  const base = String(rawName || "").trim();
  if (!base) return [];
  const out = [];
  const add = (name) => {
    const s = String(name || "").trim();
    if (s && !out.includes(s)) out.push(s);
  };
  add(base);
  const ext = path.extname(base);
  const stem = ext ? path.basename(base, ext) : base;
  if (!ext) {
    add(`${stem}.jpg`);
    add(`${stem}.jpeg`);
    add(`${stem}.png`);
    add(`${stem}.webp`);
  }
  return out;
}

/** 今日运势本地背景图：固定为 运势1.png ~ 运势17.png */
function resolveFortuneLocalImageFileName(图片序号) {
  const index = Math.max(1, Math.min(17, (Number(图片序号) || 0) + 1));
  return `运势${index}.png`;
}

function resolveDefaultResourceImageAbs(rawName) {
  const names = listDefaultResourceImageCandidateNames(rawName);
  const plugin = getPluginPath() || PLUGIN_DIR;
  for (const name of names) {
    if (path.isAbsolute(name) && fs.existsSync(name)) return name;
    const bundled = path.join(plugin, "默认资源", "image", name);
    if (fs.existsSync(bundled)) return bundled;
  }
  return "";
}

function resolveStatusBackgroundImageCss(ctx, imageRenderOn, preferLocal = true) {
  if (
    preferLocal &&
    mkIsKakakeLikeFramework(ctx) &&
    imageRenderOn !== false &&
    imageRenderOn != false
  ) {
    const localCss = buildBgImageCss(resolveEffectiveBgAbs("status", "html") || "运行状态.jpg");
    if (localCss) return localCss;
    try {
      logger?.warn?.("[Function] 运行状态本地背景不可用，已切换远程背景");
    } catch (_e) {}
  }
  return `url('${STATUS_BG_REMOTE_URL}')`;
}

/** 今日运势 URL 模式：背景使用 https（条目 url / 纯链接 / URL.json 匹配），非咔咔或未开测试功能时使用 */
function resolveFortuneNetworkBgUrl(图片Str, 图片远程Str) {
  const r = String(图片远程Str || "").trim();
  if (/^https?:\/\//i.test(r)) return r;
  const p = String(图片Str || "").trim();
  if (/^https?:\/\//i.test(p)) return p;
  if (p) return resolveFortuneRemoteUrlFromList(p);
  return "";
}

function buildBgImageCss(imageName) {
  const name = String(imageName || '').trim();
  if (!name) return '';
  if (/^https?:\/\//i.test(name) || /^data:/i.test(name)) {
    // 注意：这里不要再包一层引号，否则注入到 HTML 的 JS 字符串里会被单引号打断
    return `url(${name})`;
  }
  const resolveFortuneRemoteUrlFromConfig = (rawName) => resolveFortuneRemoteUrlFromList(rawName);
  const fileToDataUrl = (absPath) => {
    if (!absPath || !fs.existsSync(absPath)) return "";
    try {
      const ext = String(path.extname(absPath) || "").toLowerCase();
      const mimeMap = {
        ".png": "image/png",
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".webp": "image/webp",
        ".gif": "image/gif",
        ".svg": "image/svg+xml",
      };
      const mime = mimeMap[ext] || "application/octet-stream";
      const buf = fs.readFileSync(absPath);
      if (!buf || !buf.length) return "";
      return `data:${mime};base64,${buf.toString("base64")}`;
    } catch (_e) {
      return "";
    }
  };
  // 背景内联 dataURL 最大长度（可在 config.json 中配置 mkbot_bg_inline_max_kb，单位 KB）
  // 仅用于直属 NapCat 渲染：咔咔珂 puppeteer 直接走 file://，不受此限制。
  const cfgInlineKbRaw = Number(readB("config.json", "mkbot_bg_inline_max_kb", 180));
  const cfgInlineKb = Number.isFinite(cfgInlineKbRaw) ? cfgInlineKbRaw : 180;
  const MAX_INLINE_BG_DATA_URL_LEN = Math.max(32, Math.min(1024, Math.floor(cfgInlineKb))) * 1024;

  try {
    const abs = path.isAbsolute(name) && fs.existsSync(name)
      ? name
      : resolveDefaultResourceImageAbs(name);
    if (abs && fs.existsSync(abs)) {
      const dataUrl = fileToDataUrl(abs);
      // 咔咔珂 HTML 渲染：页面非 file 源，CSS/file:// 背景无法加载，必须内联 data URL
      if (preferKakakeFrameworkRender && dataUrl) {
        return `url(${dataUrl})`;
      }
      if (dataUrl && dataUrl.length <= MAX_INLINE_BG_DATA_URL_LEN) {
        return `url(${dataUrl})`;
      }
      if (dataUrl && dataUrl.length > MAX_INLINE_BG_DATA_URL_LEN) {
        try {
          logger?.warn?.(`[Function] 背景图 dataURL 过长(${dataUrl.length})，已改用 file:// 或远程地址`);
        } catch (_e) {}
        const remoteUrl = resolveFortuneRemoteUrlFromConfig(path.basename(abs));
        if (remoteUrl) {
          try {
            logger?.warn?.(`[Function] 背景图已切换远程版本: ${remoteUrl}`);
          } catch (_e) {}
          return `url(${remoteUrl})`;
        }
      }
      return `url(${pathToFileURL(abs).href})`;
    }
  } catch (_e) {}
  // 本地图片不存在时，尝试同名远程版本（适配 URL.json 存文件名场景）
  for (const candidate of listDefaultResourceImageCandidateNames(name)) {
    const remoteUrl = resolveFortuneRemoteUrlFromConfig(candidate);
    if (remoteUrl) return `url(${remoteUrl})`;
  }
  return '';
}

/** 从 buildBgImageCss 返回值提取可直接用于 img.src 的地址 */
function extractBgUrlFromCss(css) {
  const s = String(css || "").trim();
  if (!s) return "";
  if (/^(https?:|file:|data:)/i.test(s)) return s;
  const m = s.match(/^url\((['"]?)(.*?)\1\)$/i);
  return m && m[2] ? m[2] : "";
}

function buildHtmlBackgroundFields(imageName) {
  const backgroundImageCSS = buildBgImageCss(imageName);
  return {
    backgroundImageCSS,
    backgroundImageUrl: extractBgUrlFromCss(backgroundImageCSS),
  };
}

function resolveImageForCq(imageName) {
  const name = String(imageName || '').trim();
  if (!name) return '';
  if (/^https?:\/\//i.test(name) || /^file:\/\//i.test(name)) {
    return name;
  }
  const resolveFortuneRemoteUrlFromConfig = (rawName) => resolveFortuneRemoteUrlFromList(rawName);
  // data/base64 在直属 NapCat 中容易形成超长 CQ，触发 send_msg timeout
  if (/^data:/i.test(name) || /^base64:\/\//i.test(name)) return '';
  try {
    const candidates = [];
    if (path.isAbsolute(name)) {
      candidates.push(name);
    } else {
      const abs = resolveDefaultResourceImageAbs(name);
      if (abs) candidates.push(abs);
    }
    for (const abs of candidates) {
      if (!abs || !fs.existsSync(abs)) continue;
      // 直属 NapCat 优先使用 file://，消息更短、更稳定
      return pathToFileURL(abs).href;
    }
  } catch (_e) {}
  const remoteUrl = resolveFortuneRemoteUrlFromConfig(name);
  if (remoteUrl) return remoteUrl;
  return '';
}

async function renderHtmlWithCompat(htmlContent, options = {}) {
  // 先走增强参数（咔咔珂 / 新版 puppeteer 接口更稳定）
  let imageData = await puppeteer(htmlContent, {
    ...options,
    suppressErrorLog: true
  });
  if (imageData) return imageData;
  // 直属 NapCat 的旧渲染接口可能不兼容 waitForSelector/pageGotoParams 等字段，回退最简参数重试
  logger?.warn?.(`[Function] HTML渲染增强参数失败，尝试兼容模式重试: ${lastHtmlRenderError || "unknown"}`);
  const dataOnly = (options && typeof options.data === "object" && options.data) ? options.data : {};
  imageData = await puppeteer(htmlContent, {
    data: dataOnly,
    width: options?.width || 800,
    height: options?.height || 600,
    suppressErrorLog: true
  });
  return imageData;
}

function escapeHtml(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function buildSimpleFortuneHtml(card = {}) {
  const qq = escapeHtml(card.qq || "");
  const time = escapeHtml(card.time || "");
  const title = escapeHtml(card.Sorte || "大吉");
  const stars = escapeHtml(card.Estrelas || "★★★★★★★");
  const signText = escapeHtml(card.signText || "福星高照，万事如意");
  const unSignText = escapeHtml(card.unSignText || "此签为大吉之兆");
  const bgCss = String(card.backgroundImageCSS || "").trim();
  const safeBgCss = bgCss && /^url\((.|\n)*\)$/i.test(bgCss) ? bgCss : "none";
  const bgUrl = safeBgCss && /^url\((.|\n)*\)$/i.test(safeBgCss)
    ? String(safeBgCss).replace(/^url\((['"]?)(.*?)\1\)$/i, "$2")
    : "";
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <style>
    *{box-sizing:border-box}
    html,body{width:100%;height:100%;margin:0;padding:0;font-family:"Microsoft YaHei",sans-serif}
    body{
      background:#2e3147;
      display:flex;
      align-items:flex-end;
      justify-content:center;
      padding:42px 28px;
      position:relative;
      overflow:hidden;
    }
    .bg-image{
      position:fixed;
      inset:0;
      width:100%;
      height:100%;
      object-fit:cover;
      z-index:0;
    }
    .card{
      position:relative;
      z-index:1;
      width:100%;
      max-width:650px;
      background:rgba(20,20,24,.72);
      border:1px solid rgba(255,255,255,.16);
      border-radius:24px;
      color:#fff;
      padding:28px 26px;
    }
    .head{display:flex;align-items:center;gap:14px;margin-bottom:18px}
    .avatar{width:74px;height:74px;border-radius:50%;border:2px solid #fff;background:#ddd}
    .meta{font-size:14px;opacity:.86}
    .title{font-size:30px;font-weight:700;margin:6px 0}
    .stars{font-size:22px;color:#ffbfd2}
    .quote{margin-top:10px;font-size:25px;line-height:1.4;font-weight:600}
    .desc{margin-top:14px;font-size:20px;line-height:1.7;opacity:.92}
    .note{margin-top:20px;font-size:14px;opacity:.7;text-align:center}
  </style>
</head>
<body>
  ${bgUrl ? `<img id="bg-image" class="bg-image" alt="" src="${bgUrl.replace(/"/g, "&quot;")}" />` : ""}
  <div class="card">
    <div class="head">
      <img class="avatar" src="https://q4.qlogo.cn/g?b=qq&nk=${qq}&s=5" />
      <div>
        <div class="meta">${time}</div>
        <div class="title">${title}</div>
        <div class="stars">${stars}</div>
      </div>
    </div>
    <div class="quote">${signText}</div>
    <div class="desc">${unSignText}</div>
    <div class="note">本内容为虚拟生成，请勿迷信</div>
  </div>
  <script>
    (function () {
      function waitForDomImage(img, maxMs) {
        if (!img) return Promise.resolve(false);
        return Promise.race([
          new Promise(function (resolve) {
            var finish = function (ok) { resolve(!!ok); };
            if (img.complete && img.naturalWidth > 0) return finish(true);
            img.onload = function () { finish(true); };
            img.onerror = function () { finish(false); };
          }),
          new Promise(function (resolve) { setTimeout(function () { resolve(false); }, maxMs || 15000); }),
        ]);
      }
      function markReady() {
        try { document.body.setAttribute('data-render-ready', '1'); } catch (_e) {}
      }
      async function boot() {
        var bg = document.getElementById('bg-image');
        if (bg) await waitForDomImage(bg, 15000);
        var avatar = document.querySelector('.avatar');
        if (avatar) await waitForDomImage(avatar, 8000);
        await new Promise(function (resolve) {
          requestAnimationFrame(function () { requestAnimationFrame(resolve); });
        });
        markReady();
      }
      boot().catch(markReady);
    })();
  </script>
</body>
</html>`;
}


// ================== 工具函数 - Bot API ==================
/** 调用 send_msg 并返回 NapCat/OB11 原始响应（含 data.message_id 等）；失败或未发送时返回 null */
async function callSendMsg(params, ctx) {
  if (!ctx.actions) return null;
  try {
    return await ctx.actions.call("send_msg", params, ctx.adapterName, ctx.pluginManager.config);
  } catch (error) {
    logger.error("发送消息失败:", error);
    return null;
  }
}

/** puppeteer 返回的 base64 数据 → OB11 image 段 */
function 渲染Base64图片段(imageData) {
  if (!imageData) return null;
  const url = String(imageData).startsWith("base64://") ? String(imageData) : `base64://${imageData}`;
  return 段_图片(url);
}

function giveAT(message) {
  if (!Array.isArray(message)) {
    return [];
  }
  
  return message
    .filter(s => s.type === "at" && s.data?.qq && s.data.qq !== "all")
    .map(s => s.data.qq);
}

/** 从消息 JSON 段提取艾特 QQ：去重、排除全体，保持首次出现顺序 */
function giveATUnique(message) {
  const raw = giveAT(message);
  const seen = new Set();
  const out = [];
  for (const qq of raw) {
    const id = String(qq ?? "").trim();
    if (!id || id === "all") continue;
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

function giveImages(message) {
  if (!Array.isArray(message)) {
    return [];
  }
  
  return message
    .filter(s => s.type === "image" && s.data?.url)
    .map(s => s.data.url);
}

function giveImages_name(message) {
  if (!Array.isArray(message)) {
    return [];
  }
  
  return message
    .filter(s => s.type === "image" && s.data?.file)
    .map(s => s.data.file);
}

function giveText(message) {
  if (!Array.isArray(message)) {
    return "";
  }
  
  return message
    .filter(s => s.type === "text")
    .map(s => s.data?.text || "")
    .join("");
}

/** 去掉 CQ 码残留（raw_message 混入图片 CQ 时用） */
function stripCQCodes(text) {
  return String(text ?? "").replace(/\[CQ:[^\]]+\]/g, "").trim();
}

/** 问答答案标记 [img:文件名] / [face:id] → OB11 消息段（禁止 CQ） */
function mkQaAnswerToSegments(answer) {
  const text = String(answer ?? "");
  const segments = [];
  const re = /\[(img|face):([^\]]+)\]/g;
  let last = 0;
  let m;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) segments.push(段_文本(text.slice(last, m.index)));
    if (m[1] === "img") {
      segments.push(段_图片(`${getDataPath()}/筱筱吖/扩展功能/问答系统/图片数据/${m[2]}`));
    } else {
      const face = 段_表情(m[2]);
      if (face && face.type === "face") segments.push(face);
    }
    last = re.lastIndex;
  }
  if (last < text.length) segments.push(段_文本(text.slice(last)));
  return segments.length ? segments : [段_文本(text)];
}

const MK_QA_DATA_ROOT = "筱筱吖/扩展功能/问答系统";

function mkQaStorePath(scope, 类型) {
  return `${MK_QA_DATA_ROOT}/${scope}/${类型}.json`;
}

/** 艾特展示名：不写 QQ */
async function mkQaResolveAtName(event, ctx, qq, atData) {
  const fromSeg = String(atData?.name ?? atData?.nickname ?? "").trim();
  if (fromSeg) return fromSeg;
  try {
    if (event.message_type === "group" && event.group_id) {
      const dp = await BOTAPI(ctx, "get_group_member_info", {
        group_id: event.group_id,
        user_id: qq,
      });
      const card = String(dp?.card ?? dp?.data?.card ?? "").trim();
      const nick = String(dp?.nickname ?? dp?.data?.nickname ?? "").trim();
      if (card) return card;
      if (nick) return nick;
    } else {
      const dp = await BOTAPI(ctx, "get_stranger_info", { user_id: qq });
      const nick = String(dp?.nickname ?? dp?.data?.nickname ?? "").trim();
      if (nick) return nick;
    }
  } catch (_e) {
    /* ignore */
  }
  return "成员";
}

/**
 * 按 OB11 段顺序拼答案（禁 CQ）：text / at→@昵称 / face→[face:id] / image→[img:…]
 * 答案起点 = plain 文本中「添加…问答#问题#」之后
 */
async function mkQaBuildAnswerForStore(event, ctx) {
  const segs = Array.isArray(event?.message) ? event.message : [];
  let textJoined = "";
  for (const seg of segs) {
    if (seg && String(seg.type || "").toLowerCase() === "text") {
      textJoined += String(seg.data?.text ?? "");
    }
  }
  const prefixWithAnswerHash = textJoined.match(
    /^添加(?:全局|私聊)?(?:精准|模糊)问答#[^\r\n#]*#/,
  );
  const prefixQuestionOnly = textJoined.match(
    /^添加(?:全局|私聊)?(?:精准|模糊)问答#[^\r\n#]+/,
  );
  const answerStart = prefixWithAnswerHash
    ? prefixWithAnswerHash[0].length
    : prefixQuestionOnly
      ? prefixQuestionOnly[0].length
      : -1;
  if (answerStart < 0) {
    return { content: "", ok: false, imageCount: 0, error: "答案不能为空～文字、表情或图片至少要有一样哦" };
  }

  let textPos = 0;
  let out = "";
  let imageCount = 0;
  let imageIndex = 0;

  for (const seg of segs) {
    if (!seg || typeof seg !== "object") continue;
    const type = String(seg.type ?? "").toLowerCase();
    const data = seg.data && typeof seg.data === "object" ? seg.data : {};

    if (type === "text") {
      const t = String(data.text ?? "");
      const start = textPos;
      const end = textPos + t.length;
      textPos = end;
      if (end <= answerStart) continue;
      const sliceFrom = Math.max(0, answerStart - start);
      const piece = t.slice(sliceFrom);
      if (piece) out += piece;
      continue;
    }

    if (textPos < answerStart) continue;

    if (type === "at") {
      const qq = String(data.qq ?? "").trim();
      if (!qq || qq === "all") continue;
      const name = await mkQaResolveAtName(event, ctx, qq, data);
      out += `@${name}`;
      continue;
    }
    if (type === "face") {
      const id = String(data.id ?? data.face_id ?? "").trim();
      if (!/^\d+$/.test(id)) continue;
      out += `[face:${id}]`;
      continue;
    }
    if (type === "image") {
      imageIndex += 1;
      const url = String(data.url ?? "").trim();
      if (!url) {
        return {
          content: "",
          ok: false,
          imageCount,
          error: `第 ${imageIndex} 张图片没有可用链接，添加已取消`,
        };
      }
      const 随机数 = rand(10000, 99999);
      const rel = `${MK_QA_DATA_ROOT}/图片数据/${随机数}.png`;
      let okDown = false;
      try {
        okDown = await downloadFile(url, rel);
      } catch (e) {
        logger?.warn?.(`[问答系统] 图片下载异常: ${e?.message || e}`);
        okDown = false;
      }
      if (!okDown) {
        return {
          content: "",
          ok: false,
          imageCount,
          error: `第 ${imageIndex} 张图片下载失败，添加已取消`,
        };
      }
      out += `[img:${随机数}.png]`;
      imageCount += 1;
    }
  }

  if (!out.length) {
    return { content: "", ok: false, imageCount: 0, error: "答案不能为空～文字、表情或图片至少要有一样哦" };
  }
  return { content: out, ok: true, imageCount, error: "" };
}

/** 按 stores 优先级：每库先精准后模糊 */
async function mkQaTryMatchAndReply(event, 问答文本, stores) {
  if (!问答文本) return false;
  for (const store of stores || []) {
    const 精准数据 = store?.精准 || {};
    if (精准数据[问答文本]) {
      await 发消息(event, [段_引用(event.message_id), ...mkQaAnswerToSegments(精准数据[问答文本])]);
      return true;
    }
    const 模糊数据 = store?.模糊 || {};
    for (const 关键词 in 模糊数据) {
      if (问答文本.includes(关键词)) {
        await 发消息(event, [段_引用(event.message_id), ...mkQaAnswerToSegments(模糊数据[关键词])]);
        return true;
      }
    }
  }
  return false;
}

function mkQaLoadStore(scope) {
  return {
    精准: JSON.parse(readA(mkQaStorePath(scope, "精准")) || "{}"),
    模糊: JSON.parse(readA(mkQaStorePath(scope, "模糊")) || "{}"),
  };
}

/** 清空全部：全局 + 私聊 + 所有数字群号目录；返回清空的群目录数 */
function mkQaClearAllOfType(类型) {
  writeA(mkQaStorePath("全局", 类型), "{}");
  writeA(mkQaStorePath("私聊", 类型), "{}");
  const root = path.join(getDataPath() || ".", MK_QA_DATA_ROOT);
  let n = 0;
  try {
    if (!fs.existsSync(root)) return 0;
    for (const name of fs.readdirSync(root)) {
      if (!/^\d+$/.test(name)) continue;
      writeA(mkQaStorePath(name, 类型), "{}");
      n += 1;
    }
  } catch (e) {
    logger?.warn?.("[问答系统] 清空全部扫描失败", e?.message || e);
  }
  return n;
}

function mkQaFormatListBlock(title, dict) {
  const entries = Object.entries(dict || {});
  const count = entries.length;
  let body = `${title} :【${count}】个\n══════════════`;
  entries.forEach(([问题, 答案], index) => {
    body += `\n${index + 1}. [${问题}] → ${答案}`;
    if (index + 1 !== count) body += `\n----------------------`;
    else body += `\n══════════════`;
  });
  return body;
}

/** 某一范围（全局/私聊/本群）→ 嵌套合并：内含精准+模糊两个子节点 */
function mkQaScopeNestedNode(scopeLabel, store, selfId) {
  const 精准 = store?.精准 || {};
  const 模糊 = store?.模糊 || {};
  const nExact = Object.keys(精准).length;
  const nFuzzy = Object.keys(模糊).length;
  return 嵌套合并节点(
    scopeLabel,
    selfId,
    [
      合并节点(`${scopeLabel}·精准`, selfId, [段_文本(mkQaFormatListBlock(`${scopeLabel}精准问答`, 精准))]),
      合并节点(`${scopeLabel}·模糊`, selfId, [段_文本(mkQaFormatListBlock(`${scopeLabel}模糊问答`, 模糊))]),
    ],
    {},
    [段_文本(`${scopeLabel}词库\n精准 ${nExact} 条 · 模糊 ${nFuzzy} 条`)],
  );
}

/** 入群/退群模板占位符 → OB11 消息段（[艾特]/[本机头像]/[新人头像]/[退者头像]） */
function mkEventTemplateToSegments(template, { userId, selfId, textReplacements = {} }) {
  const segmentPlaceholders = {
    "[艾特]": () => 段_艾特(userId),
    "[本机头像]": () => 段_图片(`https://q4.qlogo.cn/g?b=qq&nk=${selfId}&s=5`),
    "[新人头像]": () => 段_图片(`https://q4.qlogo.cn/g?b=qq&nk=${userId}&s=5`),
    "[退者头像]": () => 段_图片(`https://q4.qlogo.cn/g?b=qq&nk=${userId}&s=5`),
  };
  const applyTextVars = (chunk) => {
    let text = chunk;
    for (const [k, v] of Object.entries(textReplacements)) {
      text = text.split(k).join(String(v ?? ""));
    }
    return text;
  };
  const segments = [];
  let rest = String(template ?? "");
  while (rest.length) {
    let earliest = { idx: rest.length, key: null };
    for (const key of Object.keys(segmentPlaceholders)) {
      const idx = rest.indexOf(key);
      if (idx !== -1 && idx < earliest.idx) earliest = { idx, key };
    }
    if (!earliest.key) {
      const text = applyTextVars(rest);
      if (text) segments.push(段_文本(text));
      break;
    }
    if (earliest.idx > 0) {
      const text = applyTextVars(rest.slice(0, earliest.idx));
      if (text) segments.push(段_文本(text));
    }
    const seg = segmentPlaceholders[earliest.key]();
    if (seg) segments.push(seg);
    rest = rest.slice(earliest.idx + earliest.key.length);
  }
  return segments.filter((s) => s && (s.type !== "text" || s.data.text !== ""));
}

/** 旧 CQ 字符串草稿 → OB11 消息段（迁移用） */
function legacyCqStringToSegments(cqLine) {
  const text = String(cqLine ?? "");
  const segments = [];
  const re = /\[CQ:([^\]]+)\]/g;
  let last = 0;
  let m;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) segments.push(段_文本(text.slice(last, m.index)));
    const parts = String(m[1]).split(",");
    const cqType = parts[0];
    const params = {};
    for (let i = 1; i < parts.length; i++) {
      const eq = parts[i].indexOf("=");
      if (eq > 0) params[parts[i].slice(0, eq).trim()] = parts[i].slice(eq + 1);
    }
    if (cqType === "image") segments.push(段_图片(params.file || params.url));
    else if (cqType === "at") segments.push(段_艾特(params.qq));
    else if (cqType === "face") segments.push(段_表情(params.id));
    else if (cqType === "text") segments.push(段_文本(params.text || ""));
    last = re.lastIndex;
  }
  if (last < text.length) segments.push(段_文本(text.slice(last)));
  if (!segments.length && text.trim()) segments.push(段_文本(text));
  return segments.filter((s) => s && (s.type !== "text" || s.data.text !== ""));
}

/** 群发草稿单条 → OB11 消息段数组（支持 JSON 段数组 / JSON 字符串 / 旧 CQ 字符串） */
function normalizeBroadcastMessageLine(raw) {
  if (Array.isArray(raw)) {
    const out = [];
    for (const seg of raw) {
      if (!seg || typeof seg !== "object") continue;
      const type = String(seg.type ?? "").toLowerCase();
      const data = seg.data && typeof seg.data === "object" ? seg.data : {};
      if (!type) continue;
      if (type === "text") out.push(段_文本(data.text));
      else if (type === "image") out.push(段_图片(data.file || data.url));
      else if (type === "at") out.push(段_艾特(data.qq));
      else if (type === "face") out.push(段_表情(data.id ?? data.face_id));
      else if (type === "video") out.push(段_视频(data.file || data.url));
      else if (type === "record") out.push(段_语音(data.file || data.url));
      else out.push(seg);
    }
    return out.length ? out : null;
  }
  const s = String(raw ?? "").trim();
  if (!s) return null;
  if (s.startsWith("[") || s.startsWith("{")) {
    try {
      const parsed = JSON.parse(s);
      if (Array.isArray(parsed)) return normalizeBroadcastMessageLine(parsed);
      if (parsed && typeof parsed === "object" && parsed.type) {
        return normalizeBroadcastMessageLine([parsed]);
      }
    } catch {
      /* fall through */
    }
  }
  if (/\[CQ:/i.test(s)) return legacyCqStringToSegments(s);
  return [段_文本(s)];
}

function clipBroadcastLinePreview(line, max = 72) {
  let t = "";
  if (Array.isArray(line)) {
    t = line
      .map((seg) => {
        if (!seg || typeof seg !== "object") return "";
        const type = String(seg.type ?? "");
        const data = seg.data && typeof seg.data === "object" ? seg.data : {};
        if (type === "text") return String(data.text ?? "");
        if (type === "image") return `[图:${String(data.file || data.url || "").slice(0, 24)}]`;
        if (type === "at") return `@${data.qq}`;
        return `[${type}]`;
      })
      .join("");
  } else {
    t = String(line ?? "");
  }
  t = t.replace(/\s+/g, " ").trim();
  if (!t) return "";
  if (t.length <= max) return t;
  return `${t.slice(0, max)}…`;
}

/** 通过 get_msg 获取被引用消息的发送者 QQ（咔咔珂 / SnowLuma 等 OB11 宿主无 NapCat raw.records） */
async function resolveQuotedMessageUserId(ctx, quotedMessageId) {
  if (quotedMessageId == null || quotedMessageId === "") return undefined;
  try {
    const dp = botApiPayload(await BOTAPI(ctx, "get_msg", { message_id: quotedMessageId }));
    const msg = (dp && typeof dp === "object") ? dp : {};
    return msg?.user_id ?? msg?.sender?.user_id ?? msg?.raw?.records?.[0]?.senderUin;
  } catch (_e) {
    return undefined;
  }
}

/** 消息记录：私聊按好友 QQ 单独开关（路径与「好友续火」同类） */
const MK_MSG_RECORD_HAOYOU_SWITCH = "筱筱吖/扩展功能/消息记录/好友开关.json";

/** 消息记录：当前会话是否已开启（群聊走事件系统，私聊走好友开关） */
function isMessageRecordEnabled(event) {
  if (event?.message_type === "group" && event.group_id != null) {
    return readB(`筱筱吖/事件系统/${event.group_id}.json`, "消息记录", "关闭") === "开启";
  }
  if (event?.message_type === "private") {
    const qq = String(event.user_id ?? event.sender?.user_id ?? "");
    if (!qq) return false;
    return readB(MK_MSG_RECORD_HAOYOU_SWITCH, qq, "关闭") === "开启";
  }
  return false;
}

const MK_PORN_IMAGE_API = "https://api.pearapi.ai/api/pornimage/";
const MK_PORN_IMAGE_TIMEOUT_MS = 15000;

/** 从消息段提取可鉴黄的 http(s) 图片 URL（去重；兼容 type=image，以及图片后缀的 file） */
function giveImageHttpUrls(message) {
  if (!Array.isArray(message)) return [];
  const out = [];
  const pushUrl = (u) => {
    const url = String(u ?? "").trim();
    if (/^https?:\/\//i.test(url) && !out.includes(url)) out.push(url);
  };
  for (const seg of message) {
    if (!seg || typeof seg !== "object") continue;
    const type = String(seg.type || "").toLowerCase();
    const data = seg.data && typeof seg.data === "object" ? seg.data : {};
    if (type === "image") {
      pushUrl(data.url);
      pushUrl(data.file);
      continue;
    }
    // 群文件形式发的图（type=file，文件名是图片）
    if (type === "file") {
      const name = String(data.file ?? data.name ?? "").toLowerCase();
      if (/\.(png|jpe?g|gif|webp|bmp|heic)$/i.test(name)) {
        pushUrl(data.url);
      }
    }
  }
  return out;
}

/** 读取鉴黄分数字段，非法则 0 */
function pornScoreNum(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/**
 * 三层免误杀判定：
 * 1) 加权风险分 = porn×0.7 + hentai×0.25 + sexy×0.05
 * 2) 硬拦截：porn>0.3 或 classification==色情
 * 3) 加权区（porn<0.3 且 加权>0.15）：豁免优先，否则 neutral<0.1 才拦截
 * @returns {{ action: 'hit'|'pass'|'warn', reason: string, weighted: number }}
 */
function evaluatePornImage(apiResult) {
  if (!apiResult || typeof apiResult !== "object") {
    return { action: "pass", reason: "无结果", weighted: 0 };
  }
  if (Number(apiResult.code) !== 200) {
    return { action: "pass", reason: `code=${apiResult.code}`, weighted: 0 };
  }
  const cls = String(apiResult.classification ?? "").trim();
  const data = apiResult.data && typeof apiResult.data === "object" ? apiResult.data : {};
  const porn = pornScoreNum(data.porn);
  const hentai = pornScoreNum(data.hentai);
  const sexy = pornScoreNum(data.sexy);
  const neutral = pornScoreNum(data.neutral);
  const weighted = porn * 0.7 + hentai * 0.25 + sexy * 0.05;

  // 第二层：硬拦截（红线）
  if (cls === "色情" || porn > 0.3) {
    return {
      action: "hit",
      reason: cls === "色情" ? "硬拦截:分类色情" : `硬拦截:porn=${porn.toFixed(3)}>0.3`,
      weighted,
    };
  }

  // 加权未过线 → 安全
  if (!(porn < 0.3 && weighted > 0.15)) {
    return { action: "pass", reason: `安全:加权=${weighted.toFixed(3)}`, weighted };
  }

  // 第三层：豁免优先（防误杀）
  // 豁免2：二次元光膀子男等 — 预警不封禁
  if (cls === "二次元" && porn < 0.01 && sexy < 0.001) {
    return {
      action: "warn",
      reason: `豁免2:二次元低色情展示 hentai=${hentai.toFixed(3)}`,
      weighted,
    };
  }
  // 豁免1：背景中性且几乎无性感 — 深空男团等严实穿搭
  if (neutral > 0.15 && sexy < 0.01) {
    return {
      action: "warn",
      reason: `豁免1:neutral=${neutral.toFixed(3)} sexy=${sexy.toFixed(3)}`,
      weighted,
    };
  }
  // 原规则：无明显无关背景 → 成人图拦截
  if (neutral < 0.1) {
    return {
      action: "hit",
      reason: `加权拦截:风险=${weighted.toFixed(3)} neutral=${neutral.toFixed(3)}<0.1`,
      weighted,
    };
  }

  // 灰区（如 0.1≤neutral≤0.15）：放行并预警
  return {
    action: "warn",
    reason: `灰区放行:风险=${weighted.toFixed(3)} neutral=${neutral.toFixed(3)}`,
    weighted,
  };
}

function formatPornImageScore(apiResult, evalResult) {
  if (!apiResult || typeof apiResult !== "object") return "无结果";
  const data = apiResult.data && typeof apiResult.data === "object" ? apiResult.data : {};
  const cls = String(apiResult.classification ?? "?");
  const f = (k) => {
    const n = Number(data[k]);
    return Number.isFinite(n) ? n.toFixed(3) : "?";
  };
  const w = evalResult && Number.isFinite(evalResult.weighted)
    ? evalResult.weighted.toFixed(3)
    : "?";
  const act = evalResult?.action || "?";
  const why = evalResult?.reason || "";
  return `cls=${cls} porn=${f("porn")} hentai=${f("hentai")} sexy=${f("sexy")} neutral=${f("neutral")} risk=${w} →${act} ${why}`;
}

async function fetchPornImageApi(imageUrl, timeoutMs) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), Math.max(1, Number(timeoutMs) || MK_PORN_IMAGE_TIMEOUT_MS));
  try {
    const response = await fetch(MK_PORN_IMAGE_API, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ file: String(imageUrl) }),
      signal: ctrl.signal,
    });
    if (!response.ok) {
      logger?.warn?.(`[图片鉴黄] HTTP ${response.status}`);
      return null;
    }
    return await response.json();
  } catch (e) {
    if (e?.name === "AbortError") return { __timeout: true };
    logger?.warn?.("[图片鉴黄] 请求失败:", e?.message || e);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * 群聊图片鉴黄：命中则按违禁处理方式执行，并返回 true（调用方应中断后续流程）。
 * 超时 / 无权限 / 禁发图片已开 / 无图 → 返回 false，消息正常往下走。
 */
async function runGroupImagePornCheck(ctx, event, authStatus) {
  if (event?.message_type !== "group" || event.group_id == null) return false;
  if (authStatus !== "已授权") return false;
  if (readB(`筱筱吖/事件系统/${event.group_id}.json`, "图片鉴黄", "关闭") !== "开启") return false;

  // 禁发图片已开：图片会直接被进阶检测撤回，无需再鉴黄
  if (readB(`筱筱吖/群管功能/违禁系统/${event.group_id}/禁发管理.json`, "image", "关闭") === "开启") {
    logger?.info?.(`[图片鉴黄] 跳过：本群禁发图片已开启 group=${event.group_id}`);
    return false;
  }

  const urls = giveImageHttpUrls(event.message);
  if (!urls.length) {
    // 有媒体但抽不到 http 图链时打日志，方便排查 file/闪照等
    const hasMedia = Array.isArray(event.message)
      && event.message.some((s) => s && ["image", "file"].includes(String(s.type || "").toLowerCase()));
    if (hasMedia) {
      logger?.info?.(`[图片鉴黄] 跳过：消息含文件/图片段但无可用 http URL group=${event.group_id}`);
    }
    return false;
  }

  const selfId = event.self_id;
  const userId = event.user_id ?? event.sender?.user_id;
  if (selfId == null || userId == null) return false;
  if (String(selfId) === String(userId)) return false;
  if (await mkIsPardonExempt(ctx, event, userId)) return false;

  let robotLv = 0;
  let userLv = 0;
  try {
    const dpBot = botApiPayload(await BOTAPI(ctx, "get_group_member_info", {
      group_id: event.group_id,
      user_id: selfId,
    })) || {};
    robotLv = RC_group_role[dpBot.role || "member"] || 0;
    const dpUser = botApiPayload(await BOTAPI(ctx, "get_group_member_info", {
      group_id: event.group_id,
      user_id: userId,
    })) || {};
    userLv = RC_group_role[dpUser.role || "member"] || 0;
  } catch (e) {
    logger?.warn?.("[图片鉴黄] 查询群成员失败:", e?.message || e);
    return false;
  }

  // 无管理权限，或对方同级/更高 → 不生效
  if (robotLv < 2 || robotLv <= userLv) {
    logger?.info?.(
      `[图片鉴黄] 跳过：权限不足 botLv=${robotLv} userLv=${userLv} group=${event.group_id} user=${userId}`,
    );
    return false;
  }

  logger?.info?.(
    `[图片鉴黄] 开始检测 group=${event.group_id} user=${userId} 图数=${urls.length}`,
  );

  const deadline = Date.now() + MK_PORN_IMAGE_TIMEOUT_MS;
  let hit = false;
  let lastScore = "";
  for (let i = 0; i < urls.length; i++) {
    const url = urls[i];
    const left = deadline - Date.now();
    if (left <= 0) {
      logger?.info?.("[图片鉴黄] 总超时，放行本条消息");
      return false;
    }
    const result = await fetchPornImageApi(url, left);
    if (result?.__timeout) {
      logger?.info?.("[图片鉴黄] 单次请求超时，放行本条消息");
      return false;
    }
    if (!result) {
      logger?.warn?.(`[图片鉴黄] 第${i + 1}张接口无有效返回，继续`);
      continue;
    }
    const verdict = evaluatePornImage(result);
    lastScore = formatPornImageScore(result, verdict);
    logger?.info?.(`[图片鉴黄] 第${i + 1}张 ${lastScore}`);
    if (verdict.action === "hit") {
      hit = true;
      break;
    }
    if (verdict.action === "warn") {
      logger?.warn?.(
        `[图片鉴黄] 预警放行 group=${event.group_id} user=${userId} ${verdict.reason}`,
      );
    }
  }
  if (!hit) {
    logger?.info?.(
      `[图片鉴黄] 未命中，放行 group=${event.group_id} user=${userId} last=${lastScore || "无"}`,
    );
    return false;
  }

  const 类型 = readB(`筱筱吖/群管系统/违禁系统/${event.group_id}/处理.json`, "方式", "撤回");
  const 时长 = Number(readB(`筱筱吖/群管系统/违禁系统/${event.group_id}/处理.json`, "时长", 600)) || 600;
  try {
    if (类型 === "禁言") {
      await BOTAPI(ctx, "set_group_ban", {
        group_id: event.group_id,
        user_id: userId,
        duration: 时长,
      });
    } else if (类型 === "撤回") {
      await BOTAPI(ctx, "delete_msg", { message_id: event.message_id });
    } else {
      // 撤回禁言（默认其它值也走这套）
      try {
        await BOTAPI(ctx, "set_group_ban", {
          group_id: event.group_id,
          user_id: userId,
          duration: 时长,
        });
      } catch (_e) { /* ignore */ }
      await BOTAPI(ctx, "delete_msg", { message_id: event.message_id });
    }
  } catch (e) {
    logger?.warn?.("[图片鉴黄] 处罚执行失败:", e?.message || e);
  }
  logger?.info?.(
    `[图片鉴黄] 命中 group=${event.group_id} user=${userId} 处理=${类型} ${lastScore}`,
  );
  return true;
}

/** 消息记录：过滤协议/CQ 解析残留（如纯表情后多出的 "]"） */
function isSpuriousRecordText(text) {
  const t = String(text ?? "").trim();
  if (!t) return true;
  if (/^[\[\]]+$/.test(t)) return true;
  return false;
}

/** 消息记录：仅使用结构化 message 段，保留原始顺序，不解析 CQ */
function normalizeEventRecordSegments(event) {
  if (Array.isArray(event?.message)) {
    return event.message
      .filter((seg) => seg && seg.type)
      .filter((seg) => seg.type !== "text" || !isSpuriousRecordText(seg.data?.text))
      .map((seg) => ({ type: seg.type, data: { ...(seg.data ?? {}) } }));
  }
  if (typeof event?.message === "string") {
    const msg = decodeObHtmlEntities(event.message).trim();
    if (!msg || isSpuriousRecordText(msg)) return [];
    return [{ type: "text", data: { text: msg } }];
  }
  return [];
}

/** 消息记录：从 get_image/get_record/get_file 返回值解析本地路径 */
function resolveApiMediaPath(result) {
  const p = String(result?.file ?? "").trim();
  if (!p) return null;
  if (/^file:\/\//i.test(p)) return fileURLToPath(p);
  if (fs.existsSync(p)) return p;
  const rel = path.join(getDataPath() || ".", p);
  if (fs.existsSync(rel)) return rel;
  return null;
}

function extFromMediaName(name, fallback) {
  const m = String(name ?? "").match(/(\.[a-z0-9]{1,8})(?:\?|$)/i);
  return m ? m[1].toLowerCase() : fallback;
}

const MK_VIDEO_EXT_RE = /\.(mp4|mov|mkv|webm|avi|flv|m4v|3gp)(?:\?|$)/i;

function mkRecordIsVideoLike(type, data) {
  if (String(type) === "video") return true;
  const names = [data?.file, data?.file_name, data?.name, data?.url].map((s) => String(s ?? ""));
  return String(type) === "file" && names.some((n) => MK_VIDEO_EXT_RE.test(n));
}

function mkRecordResolveMediaExt(type, data, localPath) {
  const names = [data?.file_name, data?.name, data?.file, localPath, data?.url];
  for (const n of names) {
    const e = extFromMediaName(String(n ?? ""), "");
    if (e) return e;
  }
  if (type === "record") return ".mp3";
  if (type === "video" || mkRecordIsVideoLike(type, data)) return ".mp4";
  return ".bin";
}

function mkRecordNormalizeMediaKind(type, data) {
  if (String(type) === "record") return "record";
  if (mkRecordIsVideoLike(type, data)) return "video";
  if (String(type) === "video") return "video";
  return "file";
}

function mkRecordIsThumbPath(p) {
  const low = String(p ?? "").toLowerCase();
  return /\.(jpg|jpeg|png|webp|gif|bmp)$/i.test(low) || /[/\\]thumb[/\\]/i.test(low);
}

function mkRecordGetFileApiParams(data) {
  const fileRef = String(data?.file ?? "").trim();
  const fileId = String(data?.file_id ?? data?.fileId ?? "").trim();
  if (fileRef && !fileRef.startsWith("/") && !/^https?:\/\//i.test(fileRef)) {
    return { file: fileRef };
  }
  if (fileId) return { file_id: fileId };
  if (fileRef) return { file: fileRef };
  return null;
}

/** 消息记录：顶层元数据（时间/来源/QQ/昵称等，每条消息只写一次） */
function buildMessageRecordMeta(event) {
  const meta = {
    time: Math.floor(Number(event?.time ?? Date.now() / 1000)),
    来源: event.message_type === "group" ? "群聊" : "私聊",
    QQ: String(event.user_id ?? event.sender?.user_id ?? ""),
  };
  const 昵称 = String(event.sender?.nickname ?? event.sender?.card ?? "").trim();
  if (昵称) meta.昵称 = 昵称;
  if (event.message_type === "group" && event.group_id != null) {
    meta.群号 = String(event.group_id);
  }
  return meta;
}

/** 消息记录：将语音/视频/文件保存到 ziyuan（仅下载/复制，不执行）；超限或失败返回 skipped */
const MK_MSG_RECORD_IMG_COOLDOWN_AFTER = 5;
const MK_MSG_RECORD_IMG_COOLDOWN_MS = 1000;
const MK_MSG_RECORD_MAX_FORWARD_DEPTH = 5;
const MK_MSG_RECORD_MEDIA_SAVE_MAX = 15 * 1024 * 1024;

async function saveRecordMediaToZiyuan(ctx, type, data, ziyuanDir, saveBaseName) {
  const kind = mkRecordNormalizeMediaKind(type, data);
  const size = Number(data.file_size ?? data.size ?? 0);
  const saveMax = MK_MSG_RECORD_MEDIA_SAVE_MAX;
  const typeName = kind === "record" ? "语音" : kind === "video" ? "视频" : "文件";
  if (Number.isFinite(size) && size > saveMax) {
    const mb = (size / (1024 * 1024)).toFixed(2);
    return {
      skipped: true,
      reason: `[未记录${typeName}] 大小约 ${mb}MB，超过 15MB 限制，未保存到 ziyuan`,
    };
  }

  const urlDirect = String(data.url ?? "").trim();
  let localPath = null;
  let ext = mkRecordResolveMediaExt(kind, data, "");

  // 优先 ftn/直链下载（带正确扩展名，避免落盘成 .bin）
  if (urlDirect && /^https?:\/\//i.test(urlDirect)) {
    const dest = path.join(ziyuanDir, `${saveBaseName}${ext}`);
    if (await downloadFile(urlDirect, dest, true)) return { path: `ziyuan/${saveBaseName}${ext}` };
  }

  if (kind === "record") {
    const fileRef = String(data.file ?? data.file_id ?? "").trim();
    if (fileRef) {
      const r = await mkRecordSafeBotApi(
        ctx,
        "get_record",
        { file: fileRef, out_format: "mp3" },
        12000,
      );
      localPath = resolveApiMediaPath(r);
      ext = ".mp3";
      if (!localPath && r?.url && /^https?:\/\//i.test(String(r.url))) {
        const dest = path.join(ziyuanDir, `${saveBaseName}.mp3`);
        if (await downloadFile(String(r.url), dest, true)) return { path: `ziyuan/${saveBaseName}.mp3` };
      }
    }
  } else {
    const apiParams = mkRecordGetFileApiParams(data);
    if (apiParams) {
      const r = await mkRecordSafeBotApi(ctx, "get_file", apiParams, 12000);
      const apiPath = resolveApiMediaPath(r);
      const name = String(r?.file_name ?? data.file_name ?? data.name ?? data.file ?? "");
      ext = mkRecordResolveMediaExt(kind, data, apiPath || name);
      if (apiPath && !(kind === "video" && mkRecordIsThumbPath(apiPath))) {
        localPath = apiPath;
      }
      const apiUrl = String(r?.url ?? "").trim();
      if (!localPath && apiUrl && /^https?:\/\//i.test(apiUrl) && !mkRecordIsThumbPath(apiUrl)) {
        const dest = path.join(ziyuanDir, `${saveBaseName}${ext}`);
        if (await downloadFile(apiUrl, dest, true)) return { path: `ziyuan/${saveBaseName}${ext}` };
      }
    }
  }

  if (localPath && fs.existsSync(localPath)) {
    try {
      const st = fs.statSync(localPath);
      if (st.size > saveMax) {
        const mb = (st.size / (1024 * 1024)).toFixed(2);
        return {
          skipped: true,
          reason: `[未记录${typeName}] 实际大小约 ${mb}MB，超过 15MB 限制，未保存到 ziyuan`,
        };
      }
    } catch (_e) {}
    ext = mkRecordResolveMediaExt(kind, data, localPath);
    const dest = path.join(ziyuanDir, `${saveBaseName}${ext}`);
    if (!fs.existsSync(ziyuanDir)) fs.mkdirSync(ziyuanDir, { recursive: true });
    fs.copyFileSync(localPath, dest);
    return { path: `ziyuan/${saveBaseName}${ext}` };
  }
  return {
    skipped: true,
    reason: `[未记录${typeName}] 无法下载或解析媒体文件（API 超时/无可用 url）`,
  };
}

/** 消息记录：图床上传队列（排队/单次超过 5 张则每张间隔 1 秒） */
let mkMsgRecImgChain = Promise.resolve();
let mkMsgRecImgQueued = 0;
let mkMsgRecImgCooldown = false;

function mkMsgRecordUploadImghost(input) {
  mkMsgRecImgQueued += 1;
  if (mkMsgRecImgQueued > MK_MSG_RECORD_IMG_COOLDOWN_AFTER) {
    mkMsgRecImgCooldown = true;
  }
  const run = mkMsgRecImgChain.then(async () => {
    try {
      if (mkMsgRecImgCooldown) {
        await new Promise((r) => setTimeout(r, MK_MSG_RECORD_IMG_COOLDOWN_MS));
      }
      return await 上传图床(input);
    } catch (e) {
      return { code: -1, msg: String(e?.message || e || "图床上传异常") };
    } finally {
      mkMsgRecImgQueued = Math.max(0, mkMsgRecImgQueued - 1);
      if (mkMsgRecImgQueued === 0) mkMsgRecImgCooldown = false;
    }
  });
  mkMsgRecImgChain = run.then(
    () => {},
    () => {},
  );
  return run;
}

function mkNormalizeForwardMessages(result) {
  if (!result || typeof result !== "object") return [];
  const data = result.data;
  if (data && typeof data === "object" && !Array.isArray(data)) {
    if (Array.isArray(data.messages)) return data.messages;
  }
  if (Array.isArray(result.messages)) return result.messages;
  if (Array.isArray(data)) return data;
  return [];
}

function mkNormalizeNodeContent(raw) {
  if (Array.isArray(raw)) return raw.filter((s) => s && s.type);
  if (typeof raw === "string" && raw.trim()) {
    return [{ type: "text", data: { text: raw } }];
  }
  return [];
}

/** 消息记录：带超时的 Promise（超时返回 null；吞掉迟到的 reject，避免整条记录卡死） */
function mkRecordWithTimeout(promise, ms) {
  let timer;
  const guarded = Promise.resolve(promise).then(
    (v) => v,
    () => null,
  );
  return Promise.race([
    guarded.finally(() => {
      if (timer) clearTimeout(timer);
    }),
    new Promise((resolve) => {
      timer = setTimeout(() => resolve(null), ms);
    }),
  ]);
}

async function mkRecordSafeBotApi(ctx, action, params, timeoutMs = 8000) {
  try {
    const raw = await mkRecordWithTimeout(BOTAPI(ctx, action, params), timeoutMs);
    if (raw == null) return null;
    return botApiPayload(raw);
  } catch (_e) {
    return null;
  }
}

function mkRecordPickImageSource(data, 图结果, 文件名) {
  const 原链 = String(data?.url || "").trim();
  if (原链 && /^https?:\/\//i.test(原链)) {
    return { url: 原链, filename: 文件名 };
  }
  const 解链 = String(图结果?.url || 图结果?.file || "").trim();
  if (!解链) return null;
  if (/^https?:\/\//i.test(解链)) return { url: 解链, filename: 文件名 };
  if (/^file:\/\//i.test(解链)) {
    try {
      return { filepath: fileURLToPath(解链), filename: 文件名 };
    } catch (_e) {
      return null;
    }
  }
  if (fs.existsSync(解链)) return { filepath: 解链, filename: 文件名 };
  return null;
}

async function mkRecordProcessImageSeg(ctx, data) {
  const safe = data && typeof data === "object" ? data : {};
  const 文件名 = String(safe.file || `mk_${Date.now()}.jpg`).trim();
  const 原链 = String(safe.url || "").trim();
  let 上传源 = null;

  // 优先直链，避免对 forward 内 uuid 文件名长时间卡在 get_image
  if (原链 && /^https?:\/\//i.test(原链)) {
    上传源 = { url: 原链, filename: 文件名 };
  } else if (safe.file) {
    const 图结果 = await mkRecordSafeBotApi(ctx, "get_image", { file: safe.file }, 8000);
    上传源 = mkRecordPickImageSource(safe, 图结果, 文件名);
  }

  if (上传源) {
    try {
      const 上传 = await mkMsgRecordUploadImghost(上传源);
      if (上传?.code === 0 && 上传?.data?.url) {
        return {
          type: "image",
          data: {
            file: 文件名,
            file_size: safe.file_size ?? safe.size ?? "",
            sub_type: safe.sub_type ?? 0,
            summary: safe.summary ?? "",
            url: 上传.data.url,
            source: 上传.data.source,
          },
        };
      }
      return {
        type: "text",
        data: {
          text: `[未记录图片] 图床上传失败：${上传?.msg || "未知错误"}${原链 ? `；原链保留失败` : ""}`,
        },
      };
    } catch (e) {
      return {
        type: "text",
        data: { text: `[未记录图片] 图床异常：${e?.message || e}` },
      };
    }
  }
  return {
    type: "text",
    data: {
      text: `[未记录图片] 无法解析图片源${文件名 ? `（${文件名}）` : ""}${原链 ? "" : "；get_image 超时或无 url"}`,
    },
  };
}

async function mkRecordProcessMediaSeg(ctx, type, data, 资源目录, saveBaseName) {
  const kind = mkRecordNormalizeMediaKind(type, data);
  try {
    const result = await saveRecordMediaToZiyuan(ctx, kind, data, 资源目录, saveBaseName);
    if (result?.skipped) {
      return { type: "text", data: { text: String(result.reason || `[未记录${kind}]`) } };
    }
    const 媒体data = {
      file_size: String(data?.file_size ?? data?.size ?? ""),
    };
    const fname = String(data?.file_name ?? data?.name ?? data?.file ?? "").trim();
    if (fname) 媒体data.file_name = fname;
    if (result?.path) 媒体data.path = result.path;
    return { type: kind, data: 媒体data };
  } catch (e) {
    const typeName = kind === "record" ? "语音" : kind === "video" ? "视频" : "文件";
    return {
      type: "text",
      data: { text: `[未记录${typeName}] 处理异常：${e?.message || e}` },
    };
  }
}

async function mkRecordParseForwardMessageList(ctx, messages, opts, depth) {
  const nodes = [];
  for (const raw of messages) {
    if (!raw || typeof raw !== "object") continue;
    const msg = raw;
    if (msg.type === "node") {
      const d = msg.data && typeof msg.data === "object" ? msg.data : {};
      const name = String(d.name ?? d.nickname ?? "用户");
      const uin = String(d.uin ?? d.user_id ?? "");
      const timeRaw = d.time;
      const time = timeRaw != null && String(timeRaw).trim() !== "" ? Number(timeRaw) : undefined;
      const contentSegs = mkNormalizeNodeContent(d.content ?? d.message);
      const 内容 = await mkRecordProcessSegments(ctx, contentSegs, opts, depth);
      if (!内容.length) continue;
      const node = { name, uin, 内容 };
      if (Number.isFinite(time)) node.time = time;
      nodes.push(node);
      continue;
    }
    const contentSegs = mkNormalizeNodeContent(msg.message ?? msg.content);
    if (!contentSegs.length) continue;
    const sender = msg.sender && typeof msg.sender === "object" ? msg.sender : {};
    const name = String(sender.nickname ?? sender.card ?? msg.nickname ?? "用户");
    const uin = String(msg.user_id ?? sender.user_id ?? sender.uin ?? "");
    const timeRaw = msg.time;
    const time = timeRaw != null && String(timeRaw).trim() !== "" ? Number(timeRaw) : undefined;
    const 内容 = await mkRecordProcessSegments(ctx, contentSegs, opts, depth);
    if (!内容.length) continue;
    const node = { name, uin, 内容 };
    if (Number.isFinite(time)) node.time = time;
    nodes.push(node);
  }
  return nodes;
}

async function mkRecordFetchForwardNodes(ctx, forwardId, opts, depth) {
  if (depth > MK_MSG_RECORD_MAX_FORWARD_DEPTH || !String(forwardId || "").trim()) return [];
  try {
    const raw = await mkRecordWithTimeout(
      BOTAPI(ctx, "get_forward_msg", { id: String(forwardId) }),
      15000,
    );
    if (raw == null) {
      logger?.warn?.("[消息记录] get_forward_msg 超时:", forwardId);
      return [];
    }
    const payload = botApiPayload(raw) ?? raw;
    let messages = mkNormalizeForwardMessages(payload);
    if (!messages.length) messages = mkNormalizeForwardMessages(raw);
    return mkRecordParseForwardMessageList(ctx, messages, opts, depth);
  } catch (err) {
    logger?.warn?.("[消息记录] get_forward_msg 失败:", err?.message || err);
    return [];
  }
}

/** 消息记录：递归处理消息段（含 forward 节点展开） */
async function mkRecordProcessSegments(ctx, segments, opts, depth = 0) {
  const { 消息id, 资源目录 } = opts;
  const 内容 = [];
  if (!Array.isArray(segments) || !segments.length) return 内容;
  if (!opts.mediaSeq) opts.mediaSeq = { n: 0 };

  for (const 段 of segments) {
    try {
      if (!段 || !段.type) continue;
      const 类型 = String(段.type);

      if (类型 === "face") {
        内容.push({
          type: "face",
          data: { id: String(段?.data?.id ?? 段?.data?.raw?.faceIndex ?? "") },
        });
        continue;
      }
      if (类型 === "text") {
        const text = String(段?.data?.text ?? "");
        if (isSpuriousRecordText(text)) continue;
        内容.push({ type: "text", data: { text } });
        continue;
      }
      if (类型 === "at") {
        内容.push({ type: "at", data: { qq: String(段?.data?.qq ?? "") } });
        continue;
      }
      if (类型 === "reply") {
        内容.push({ type: "reply", data: { id: String(段?.data?.id ?? "") } });
        continue;
      }
      if (类型 === "image") {
        内容.push(await mkRecordProcessImageSeg(ctx, 段?.data ?? {}));
        continue;
      }
      if (类型 === "json" || 类型 === "xml") {
        const raw = 段?.data?.data ?? 段?.data?.xml ?? 段?.data;
        let payload = raw;
        if (payload != null && typeof payload !== "string") {
          try {
            payload = JSON.stringify(payload);
          } catch (_e) {
            payload = String(payload);
          }
        }
        内容.push({ type: 类型, data: { data: String(payload ?? "") } });
        continue;
      }
      if (类型 === "record" || 类型 === "video" || 类型 === "file") {
        opts.mediaSeq.n += 1;
        const saveBaseName = `${消息id}_${opts.mediaSeq.n}`;
        内容.push(await mkRecordProcessMediaSeg(ctx, 类型, 段?.data ?? {}, 资源目录, saveBaseName));
        continue;
      }
      if (类型 === "forward" || 类型 === "node") {
        if (depth >= MK_MSG_RECORD_MAX_FORWARD_DEPTH) {
          内容.push({
            type: "text",
            data: { text: `[未记录转发] 嵌套深度超过 ${MK_MSG_RECORD_MAX_FORWARD_DEPTH} 层` },
          });
          continue;
        }
        let nodes = [];
        if (类型 === "node") {
          nodes = await mkRecordParseForwardMessageList(ctx, [段], opts, depth + 1);
        } else {
          const data = 段?.data && typeof 段.data === "object" ? 段.data : {};
          if (Array.isArray(data.content) && data.content.length) {
            nodes = await mkRecordParseForwardMessageList(ctx, data.content, opts, depth + 1);
          } else if (data.id != null && String(data.id).trim()) {
            nodes = await mkRecordFetchForwardNodes(ctx, String(data.id), opts, depth + 1);
          }
        }
        if (nodes.length) {
          for (const node of nodes) {
            内容.push({
              type: "node",
              data: {
                name: node.name,
                uin: node.uin,
                ...(node.time != null ? { time: node.time } : {}),
                内容: node.内容,
              },
            });
          }
        } else {
          内容.push({
            type: "text",
            data: { text: "[未记录转发] 未能解析 forward 节点内容（超时或空节点）" },
          });
        }
        continue;
      }
      内容.push({
        type: 类型,
        data: {
          ...(段?.data && typeof 段.data === "object"
            ? Object.fromEntries(
                Object.entries(段.data).filter(([, v]) => {
                  const t = typeof v;
                  return v == null || t === "string" || t === "number" || t === "boolean";
                }),
              )
            : {}),
        },
      });
    } catch (e) {
      内容.push({
        type: "text",
        data: { text: `[未记录段落] 处理异常：${e?.message || e}` },
      });
    }
  }
  return 内容;
}

/** 消息记录：后台队列（主流程只入队，多条并行处理，写入串行合并防丢） */
const mkMsgRecordPendingByFile = new Map();
let mkMsgRecordFlushChain = Promise.resolve();

function mkGetMessageRecordPaths(event) {
  return getMessageRecordPathsForEvent(getDataPath, event || {});
}

function mkPrepareMessageRecordJob(ctx, event) {
  const 消息id = String(event?.message_id ?? "").trim();
  const 消息段列表 = normalizeEventRecordSegments(event);
  if (!消息id || !消息段列表.length) return null;
  return {
    ctx,
    消息id,
    消息段列表,
    meta: buildMessageRecordMeta(event),
    paths: mkGetMessageRecordPaths(event),
  };
}

async function mkBuildMessageRecordContent(ctx, job) {
  const { 消息id, 消息段列表, paths } = job;
  return mkRecordProcessSegments(ctx, 消息段列表, {
    消息id,
    资源目录: paths.资源目录,
    mediaSeq: { n: 0 },
  }, 0);
}

function mkStageMessageRecordEntry(记录文件, 消息id, entry) {
  if (!mkMsgRecordPendingByFile.has(记录文件)) {
    mkMsgRecordPendingByFile.set(记录文件, new Map());
  }
  mkMsgRecordPendingByFile.get(记录文件).set(消息id, entry);
}

function mkFlushMessageRecordFile(记录文件) {
  const pending = mkMsgRecordPendingByFile.get(记录文件);
  if (!pending || pending.size === 0) return;
  const batch = new Map(pending);
  pending.clear();
  let 库 = {};
  if (fs.existsSync(记录文件)) {
    try {
      库 = JSON.parse(fs.readFileSync(记录文件, "utf8") || "{}");
    } catch (_e) {
      库 = {};
    }
  }
  for (const [id, entry] of batch) {
    库[id] = entry;
  }
  const dir = path.dirname(记录文件);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(记录文件, stringifyMessageRecordStore(库), "utf8");
}

function mkScheduleMessageRecordFlush(记录文件) {
  mkMsgRecordFlushChain = mkMsgRecordFlushChain
    .then(() => {
      mkFlushMessageRecordFile(记录文件);
    })
    .catch((err) => {
      logger?.warn?.("[消息记录] 刷盘失败:", err);
    });
}

async function mkProcessMessageRecordJob(job) {
  const { ctx, 消息id, meta, paths } = job;
  const { 记录目录, 资源目录, 记录文件 } = paths;
  if (!fs.existsSync(记录目录)) fs.mkdirSync(记录目录, { recursive: true });
  if (!fs.existsSync(资源目录)) fs.mkdirSync(资源目录, { recursive: true });
  const 内容 = await mkBuildMessageRecordContent(ctx, job);
  if (!内容.length) return;
  mkStageMessageRecordEntry(记录文件, 消息id, { ...meta, 内容 });
  mkScheduleMessageRecordFlush(记录文件);
}

/** 主流程调用：同步入队后立即返回，不 await */
function mkEnqueueMessageRecord(ctx, event) {
  const job = mkPrepareMessageRecordJob(ctx, event);
  if (!job) return;
  setImmediate(() => {
    mkProcessMessageRecordJob(job).catch((err) => {
      logger?.warn?.("[消息记录] 后台处理失败:", err);
    });
  });
}

function mkMsgRecordAbsMediaPath(relOrUrl) {
  const s = String(relOrUrl ?? "").trim();
  if (!s) return "";
  if (/^https?:\/\//i.test(s) || /^file:\/\//i.test(s)) return s;
  const norm = s.replace(/\\/g, "/");
  if (norm.startsWith("ziyuan/")) {
    return path.join(getMessageRecordBaseDir(getDataPath), norm);
  }
  if (path.isAbsolute(s) && fs.existsSync(s)) return s;
  return s;
}

function mkMsgRecordLooksLikeVideoFile(absPath) {
  const p = String(absPath ?? "").trim();
  if (!p || !fs.existsSync(p)) return false;
  try {
    const fd = fs.openSync(p, "r");
    const buf = Buffer.alloc(12);
    fs.readSync(fd, buf, 0, 12, 0);
    fs.closeSync(fd);
    if (buf.slice(4, 8).toString() === "ftyp") return true;
    if (buf[0] === 0x1a && buf[1] === 0x45 && buf[2] === 0xdf && buf[3] === 0xa3) return true;
  } catch (_e) {}
  return false;
}

function mkMsgRecordResolveVideoSrc(data) {
  const src = mkMsgRecordAbsMediaPath(data.path || data.url || data.file || "");
  if (!src) return "";
  if (mkRecordIsVideoLike("file", data) || mkMsgRecordLooksLikeVideoFile(src)) return src;
  return "";
}

function mkFormatRecordTime(sec) {
  const n = Number(sec);
  if (!Number.isFinite(n) || n <= 0) return "未知时间";
  try {
    return timeA("y-m-d H:i:s", Math.floor(n));
  } catch (_e) {
    const d = new Date(Math.floor(n) * 1000);
    if (Number.isNaN(d.getTime())) return String(sec);
    const p = (x) => String(x).padStart(2, "0");
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
  }
}

/** 将记录内容段转为 OB11 段；顶层语音可拆出单独发送，嵌套内语音只占位 */
function mkMsgRecordContentToOb11(内容, { extractVoice = false } = {}) {
  const segs = [];
  const voices = [];
  if (!Array.isArray(内容)) return { segs, voices };
  for (const item of 内容) {
    if (!item || typeof item !== "object") continue;
    const type = String(item.type ?? "");
    const data = item.data && typeof item.data === "object" ? item.data : {};
    if (type === "text") {
      const t = String(data.text ?? "");
      if (t) segs.push(段_文本(t));
      continue;
    }
    if (type === "image") {
      const src = String(data.url || data.file || "").trim();
      if (src) segs.push(段_图片(mkMsgRecordAbsMediaPath(src) || src));
      else segs.push(段_文本("[图片]"));
      continue;
    }
    if (type === "face") {
      const id = String(data.id ?? "").trim();
      if (id) segs.push(段_表情(id));
      continue;
    }
    if (type === "at") {
      segs.push(段_艾特(data.qq));
      continue;
    }
    if (type === "reply") {
      segs.push(段_文本(`[回复消息:${data.id ?? ""}]`));
      continue;
    }
    if (type === "json" || type === "xml") {
      const raw = data.data ?? data.xml ?? data;
      if (raw != null && String(raw).trim()) {
        segs.push(段_Json(raw));
      } else {
        segs.push(段_文本(`[${type === "json" ? "JSON卡片" : "XML卡片"}]`));
      }
      continue;
    }
    if (type === "video" || (type === "file" && mkRecordIsVideoLike("file", data))) {
      const src = mkMsgRecordResolveVideoSrc(data) || mkMsgRecordAbsMediaPath(data.path || data.url || data.file || "");
      if (src) segs.push(段_视频(src));
      else {
        const name = String(data.file_name || data.name || data.file || "视频");
        segs.push(段_文本(`[视频] ${name}`));
      }
      continue;
    }
    if (type === "file") {
      const src = mkMsgRecordAbsMediaPath(data.path || data.url || data.file || "");
      const name = String(data.file_name || data.name || "文件");
      if (src && mkMsgRecordLooksLikeVideoFile(src)) {
        segs.push(段_视频(src));
        continue;
      }
      if (src && /\.(png|jpe?g|gif|webp|bmp)$/i.test(src)) segs.push(段_图片(src));
      else segs.push(段_文本(`[文件] ${name}${data.file_size ? ` (${data.file_size}B)` : ""}`));
      continue;
    }
    if (type === "record") {
      const src = mkMsgRecordAbsMediaPath(data.path || data.url || data.file || "");
      if (extractVoice && src) {
        voices.push(src);
        segs.push(段_文本("[语音消息，已单独发送]"));
      } else {
        segs.push(段_文本("[语音消息]"));
      }
      continue;
    }
    if (type === "node") {
      // 嵌套由上层组 嵌套合并节点，这里不展开为平铺段
      continue;
    }
    segs.push(段_文本(`[${type || "未知"}消息]`));
  }
  if (!segs.length) segs.push(段_文本("[空内容]"));
  return { segs, voices };
}

function mkMsgRecordNestedChildrenFromNodes(节点列表) {
  const children = [];
  if (!Array.isArray(节点列表)) return children;
  for (const item of 节点列表) {
    if (!item || item.type !== "node") continue;
    const d = item.data && typeof item.data === "object" ? item.data : {};
    const name = String(d.name || "用户");
    const uin = String(d.uin || "0");
    const { segs } = mkMsgRecordContentToOb11(d.内容, { extractVoice: false });
    const extra = {};
    if (d.time != null && Number.isFinite(Number(d.time))) extra.time = Number(d.time);
    children.push(合并节点(name, uin, segs, extra));
  }
  return children;
}

async function mkHandleMessageRecallNotify(event, ctx) {
  const noticeType = String(event?.notice_type ?? "");
  if (noticeType !== "group_recall" && noticeType !== "friend_recall") return false;

  const fakeSwitchEvent =
    noticeType === "group_recall"
      ? { message_type: "group", group_id: event.group_id, user_id: event.user_id }
      : { message_type: "private", user_id: event.user_id };

  if (!isMessageRecordEnabled(fakeSwitchEvent)) {
    logger?.info?.("[消息记录·撤回] 未开启消息记录，忽略", {
      noticeType,
      group_id: event.group_id,
      user_id: event.user_id,
      message_id: event.message_id,
    });
    return true;
  }

  const 消息id = String(event.message_id ?? "").trim();
  if (!消息id) {
    logger?.info?.("[消息记录·撤回] 无 message_id，忽略");
    return true;
  }

  const { entry, 记录文件 } = lookupMessageRecordEntry(getDataPath, readB, 消息id, event);
  if (!entry) {
    logger?.info?.("[消息记录·撤回] 记录文件无对应条目", { 消息id, 记录文件 });
    return true;
  }

  const meta = entry;
  const 内容 = Array.isArray(entry.内容) ? entry.内容 : [];
  const 来源 = String(meta.来源 || (noticeType === "group_recall" ? "群聊" : "私聊"));
  const QQ = String(meta.QQ || event.user_id || "");
  const 昵称 = String(meta.昵称 || "").trim() || QQ || "未知";
  const 群号 = String(meta.群号 || event.group_id || "").trim();
  let 群名 = String(event.group_name || "").trim();
  if (群号 && !群名) {
    try {
      const gi = botApiPayload(await BOTAPI(ctx, "get_group_info", { group_id: 群号 }));
      群名 = String(gi?.group_name || "").trim();
    } catch (_e) {}
  }
  const 时间文 = mkFormatRecordTime(meta.time);
  const 操作者 = String(event.operator_id ?? event.user_id ?? "");
  const 头像 = `https://q4.qlogo.cn/g?b=qq&nk=${QQ || event.user_id}&s=100`;

  let 概览 =
    `【消息撤回通知】\n` +
    `来源：${来源}\n` +
    `时间：${时间文}\n` +
    `名字：${昵称}\n` +
    `QQ：${QQ}`;
  if (群号) 概览 += `\n群号：${群号}`;
  if (群名) 概览 += `\n群名：${群名}`;
  if (操作者) 概览 += `\n操作者：${操作者}`;
  概览 += `\n消息ID：${消息id}`;

  const selfId = String(event.self_id ?? ctx?.core?.selfInfo?.uin ?? "");
  const ownerQQs = readB("config.json", "OwnerQQs", []);
  const 主人 =
    Array.isArray(ownerQQs) && ownerQQs.length
      ? String(ownerQQs[0]).trim()
      : selfId;
  if (!主人) {
    logger?.warn?.("[消息记录·撤回] 无主人且无 self_id，无法推送", { 消息id });
    return true;
  }
  const fakeEvent = { message_type: "private", user_id: 主人 };
  const 显示名 = 昵称;
  const 显示QQ = QQ || selfId || "0";

  const nodes = [
    合并节点("消息概览", 显示QQ, [段_图片(头像), 段_文本(概览)], {
      time: Number(meta.time) || Math.floor(Date.now() / 1000),
    }),
  ];
  const topVoices = [];

  const onlyNodes = 内容.length > 0 && 内容.every((x) => x?.type === "node");
  const hasNode = 内容.some((x) => x?.type === "node");
  const flatItems = 内容.filter((x) => x?.type && x.type !== "node");

  if (onlyNodes) {
    const children = mkMsgRecordNestedChildrenFromNodes(内容);
    nodes.push(
      嵌套合并节点(
        "原合并转发",
        显示QQ,
        children.length ? children : [合并节点("空", 显示QQ, [段_文本("[空合并转发]")])],
        { time: Number(meta.time) || undefined },
        [段_文本("以下为被撤回的合并转发内容")],
      ),
    );
  } else {
    if (flatItems.length) {
      const { segs, voices } = mkMsgRecordContentToOb11(flatItems, { extractVoice: true });
      topVoices.push(...voices);
      nodes.push(合并节点(显示名, 显示QQ, segs, { time: Number(meta.time) || undefined }));
    }
    if (hasNode) {
      const children = mkMsgRecordNestedChildrenFromNodes(内容.filter((x) => x?.type === "node"));
      if (children.length) {
        nodes.push(
          嵌套合并节点("嵌套合并转发", 显示QQ, children, { time: Number(meta.time) || undefined }, [
            段_文本("内含嵌套合并转发"),
          ]),
        );
      }
    }
    if (nodes.length === 1) {
      nodes.push(合并节点(显示名, 显示QQ, [段_文本("[无正文内容]")], { time: Number(meta.time) || undefined }));
    }
  }

  const preview = 合并预览(
    "消息记录·撤回",
    `${昵称} 撤回了一条消息`,
    "[撤回消息追回]",
    [
      `来源：${来源}${群号 ? ` · ${群号}` : ""}`,
      `时间：${时间文}`,
      `名字：${昵称}（${QQ}）`,
      ...(群名 ? [`群名：${群名}`] : []),
      `消息ID：${消息id}`,
    ],
  );

  try {
    await 发合并消息(fakeEvent, nodes, preview);
    for (const vp of topVoices) {
      try {
        await 发语音(fakeEvent, vp);
      } catch (e) {
        logger?.warn?.("[消息记录·撤回] 单独发送语音失败:", e?.message || e);
        await 发消息(fakeEvent, [段_文本(`[语音发送失败] ${vp}`)]);
      }
    }
    logger?.info?.("[消息记录·撤回] 已推送给主人", { 主人, 消息id, 语音数: topVoices.length });
  } catch (e) {
    logger?.warn?.("[消息记录·撤回] 推送失败:", e?.message || e);
  }
  return true;
}

/** 从消息段收集图片 URL（每段只取一次，避免 url+file 重复） */
async function collectEventImages(event, ctx) {
  const urls = [];
  const seen = new Set();
  const add = (u) => {
    const v = String(u ?? "").trim();
    if (!v || seen.has(v)) return;
    seen.add(v);
    urls.push(v);
  };
  if (!Array.isArray(event?.message)) {
    for (const u of giveImages(event?.message)) add(u);
    return urls;
  }
  for (const seg of event.message) {
    if (!seg || seg.type !== "image") continue;
    const url = seg.data?.url;
    if (url) {
      add(url);
      continue;
    }
    const file = seg.data?.file;
    if (!file) continue;
    try {
      const dp = await BOTAPI(ctx, "get_image", { file });
      add(dp?.data?.url || dp?.url);
    } catch (_e) {}
  }
  return urls;
}

async function BOTAPI(ctx, action, params) {
  const p = normalizeObActionParams(params);
  try {
    const result = await ctx.actions.call(action, p, ctx.adapterName, ctx.pluginManager.config);
    if (result && typeof result === "object" && result.retcode != null && Number(result.retcode) !== 0) {
      const msg = result.wording || result.message || `retcode=${result.retcode}`;
      logger?.warn?.(`[BOTAPI] ${action} 失败: ${msg}`);
    }
    // NapCat / SnowLuma 字段与包装形态统一出口
    return mkAdaptBotApiResult(action, result);
  } catch (error) {
    if (typeof error === "object" && error.message && error.message.includes("No data returned")) {
      return mkAdaptBotApiResult(action, { status: "ok", retcode: 0, data: null });
    }
    logger?.warn?.(`[BOTAPI] ${action} 异常:`, error?.message || error);
    throw error;
  }
}

/** SnowLuma KickMembers/KickMember 常把 UID 误填进 errorMsg，咔咔侧往往只剩 retcode=100 */
function isSnowLumaKickApiFalseFail(msg) {
  const s = String(msg || "");
  if (/kick members? failed:\s*u_[A-Za-z0-9_-]+/i.test(s)) return true;
  // 咔咔剥离 wording 后只剩这个
  if (/API\s*失败\s*retcode\s*=?\s*100/i.test(s)) return true;
  if (/retcode\s*=?\s*100/i.test(s)) return true;
  return false;
}

function sleepMs(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * 成员是否仍在群。
 * SnowLuma 踢出后 get_group_member_info 仍可能返回空壳：
 * user_id 在、role=member，但 join_time/last_sent=0、昵称名片皆空。
 */
async function groupMemberStillPresent(ctx, group_id, user_id) {
  try {
    const info = await BOTAPI(ctx, "get_group_member_info", {
      group_id,
      user_id,
      no_cache: true,
    });
    if (info == null) return false;
    if (typeof info === "object" && info.retcode != null && Number(info.retcode) !== 0) return false;
    const data = info.data && typeof info.data === "object" ? info.data : info;
    const uid = mkCompatUserId(data) || data.user_id || data.uin;
    if (uid == null || uid === "" || uid === 0 || uid === "0") return false;

    const join = Number(data.join_time ?? data.joinTime ?? 0);
    const last = Number(data.last_sent_time ?? data.lastSentTime ?? 0);
    const nick = String(data.nickname ?? data.nick ?? "").trim();
    const card = String(data.card ?? "").trim();
    // 空壳：已不在群，但接口仍塞了占位成员
    if ((!Number.isFinite(join) || join <= 0) && (!Number.isFinite(last) || last <= 0) && !nick && !card) {
      return false;
    }
    return true;
  } catch (_e) {
    return false;
  }
}

/**
 * 踢人统一入口。
 * SnowLuma：批量/单踢都常「人已踢出仍 retcode=100」→ 复查（含空壳识别）后视为成功。
 */
async function kickGroupMembers(ctx, group_id, user_ids, reject_add_request = false) {
  const ids = (Array.isArray(user_ids) ? user_ids : [user_ids]).filter(
    (x) => x != null && x !== "",
  );
  if (!ids.length) return null;
  const reject = !!reject_add_request;
  const snowluma = mkIsSnowLumaBackend();

  const kickOne = async (user_id) => {
    try {
      return await BOTAPI(ctx, "set_group_kick", {
        group_id,
        user_id,
        reject_add_request: reject,
      });
    } catch (e) {
      const msg = e?.message || e;
      // 给退群事件/缓存一点时间，再查
      if (snowluma) await sleepMs(200);
      const still = await groupMemberStillPresent(ctx, group_id, user_id);
      if (!still) return null;
      if (snowluma && isSnowLumaKickApiFalseFail(msg)) return null;
      throw e;
    }
  };

  if (snowluma) {
    let last = null;
    for (const id of ids) last = await kickOne(id);
    return last;
  }

  try {
    return await BOTAPI(ctx, "set_group_kick_members", {
      group_id,
      user_id: ids,
      reject_add_request: reject,
    });
  } catch (e) {
    let last = null;
    for (const id of ids) last = await kickOne(id);
    return last;
  }
}

function kickGroupMembersFireAndForget(ctx, group_id, user_ids, reject_add_request = false) {
  void kickGroupMembers(ctx, group_id, user_ids, reject_add_request).catch((e) => {
    logger?.warn?.(`[kick] 异步踢人失败:`, e?.message || e);
  });
}

/** 从 BOTAPI / actions.call 返回值取 data 载荷（兼容 SnowLuma / NapCat OB11 包装） */
function botApiPayload(result) {
  return mkExtractBotApiPayload(result);
}

async function fetchAPI(url, method = "GET", data = null) {
  try {
    const options = {
      method: method.toUpperCase(),
      headers: {
        "Content-Type": "application/json"
      }
    };
    
    if (method.toUpperCase() === "POST" && data) {
      options.body = JSON.stringify(data);
    }
    
    const response = await fetch(url, options);
    
    if (!response.ok) {
      logger.error(`请求失败: HTTP ${response.status}`);
      return null;
    }
    
    const result = await response.json();
    return result;
  } catch (error) {
    logger.error("API 请求失败:", error);
    return null;
  }
}

/** 剥离 Minecraft 颜色码（§6 等） */
function stripMcColorCodes(text) {
  return String(text ?? "").replace(/§[0-9a-fk-or]/gi, "").trim();
}

/** online_players 单条是否为服务器状态（2b2t 队列/In-game 等），而非真实玩家名 */
function isMcOnlinePlayerStatusEntry(entry) {
  const name = stripMcColorCodes(entry?.name);
  const uuid = String(entry?.uuid ?? "").toLowerCase();
  if (!name) return false;
  if (uuid.startsWith("00000000-0000-0001")) return true;
  if (/^(in-game|queue|priority queue|waiting|playing|lobby)\s*:/i.test(name)) return true;
  if (/:\s*\d+\s*$/.test(name)) return true;
  return false;
}

/** 解析 online_players：普通服为在线玩家名单，2b2t 等为服务器玩家状态 */
function parseMcOnlinePlayers(onlinePlayers) {
  if (!Array.isArray(onlinePlayers) || onlinePlayers.length === 0) {
    return { kind: "none", lines: [] };
  }
  const entries = onlinePlayers.filter((p) => p && (p.name || p.uuid));
  if (entries.length === 0) return { kind: "none", lines: [] };
  const statusCount = entries.filter(isMcOnlinePlayerStatusEntry).length;
  const isStatus = statusCount === entries.length || statusCount >= Math.ceil(entries.length * 0.75);
  const lines = entries.map((p) => stripMcColorCodes(p.name)).filter(Boolean);
  return { kind: isStatus ? "status" : "players", lines };
}

// ================== 授权系统（实现见 ./auth/card-license.ts） ==================
async function checkAuthStatus(event) {
  return checkAuthStatusImpl(readB, writeB, event);
}

const array_shijian = ["禁言通知","入群审核","邀人统计","自助头衔","伪造聊天","黑白名单","退群拉黑","退群通知","整点报时","禁发红包","入群欢迎","违禁检测","进阶检测","发言统计","群聊续火","视频解析","问答系统","管理模式","入群验证","禁言免验","马甲系统","入群私聊","消息记录","表情制作","图片鉴黄","快捷撤回","图转连接","刷屏检测","免死金牌","锁名系统"];
const array_RCshijian = ["全群打卡","自动点赞","好友续火","自动备份","受邀同意","全群免开","全私免开"];
const MK_GLOBAL_EVENT_FILE = "筱筱吖/事件系统/全局.json";

/** 全局事件是否开启 */
function mkGlobalEventOn(name) {
  return readB(MK_GLOBAL_EVENT_FILE, name, "关闭") === "开启";
}

/** 群聊是否允许执行（全群免开 或 在 group_of） */
function mkGroupExecAllowed(groupId) {
  if (mkGlobalEventOn("全群免开")) return true;
  const list = readB("config.json", "group_of", []);
  return Array.isArray(list) && list.includes(String(groupId ?? ""));
}

/** 私聊是否允许执行（全私免开 或 在 haoyou_of；临时会话亦可） */
function mkPrivateExecAllowed(userId) {
  if (mkGlobalEventOn("全私免开")) return true;
  const list = readB("config.json", "haoyou_of", []);
  return Array.isArray(list) && list.includes(String(userId ?? ""));
}

// ================== 免死金牌（本群特殊事件） ==================
function mkPardonListPath(gid) {
  return `筱筱吖/群管系统/免死金牌/${gid}/人员.json`;
}
function mkPardonConfigPath(gid) {
  return `筱筱吖/群管系统/免死金牌/${gid}/配置.json`;
}
function mkPardonEventOn(gid) {
  return readB(`筱筱吖/事件系统/${gid}.json`, "免死金牌", "关闭") === "开启";
}
function mkPardonAdminExemptOn(gid) {
  return readB(mkPardonConfigPath(gid), "管理员免死金牌", "关闭") === "开启";
}
function mkPardonLoad(gid) {
  try {
    const raw = JSON.parse(readA(mkPardonListPath(gid)) || "[]");
    return Array.isArray(raw) ? raw.map(String) : [];
  } catch (_e) {
    return [];
  }
}
function mkPardonSave(gid, list) {
  const uniq = [];
  const seen = new Set();
  for (const qq of list || []) {
    const id = String(qq ?? "").trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    uniq.push(id);
  }
  writeA(mkPardonListPath(gid), JSON.stringify(uniq));
}
async function mkGetMemberRole(ctx, gid, uid) {
  try {
    const dp = botApiPayload(await BOTAPI(ctx, "get_group_member_info", {
      group_id: gid,
      user_id: uid,
    })) || {};
    return String(dp.role || "member");
  } catch (_e) {
    return "member";
  }
}
async function mkBotIsGroupOwner(ctx, gid, selfId) {
  return (await mkGetMemberRole(ctx, gid, selfId)) === "owner";
}
/** 免死金牌事件开，且在名单或（管理员免死开且目标为本群 admin） */
async function mkIsPardonExempt(ctx, event, uid) {
  if (event?.message_type !== "group" || event.group_id == null) return false;
  const gid = event.group_id;
  if (!mkPardonEventOn(gid)) return false;
  const id = String(uid ?? "").trim();
  if (!id) return false;
  if (mkPardonLoad(gid).includes(id)) return true;
  if (mkPardonAdminExemptOn(gid)) {
    const role = await mkGetMemberRole(ctx, gid, id);
    if (role === "admin") return true;
  }
  return false;
}

// ================== 锁名系统（本群事件；优先级高于马甲系统） ==================
function mkLockNamePath(gid) {
  return `筱筱吖/群管系统/锁名系统/${gid}/名单.json`;
}
function mkLockNameEventOn(gid) {
  return readB(`筱筱吖/事件系统/${gid}.json`, "锁名系统", "关闭") === "开启";
}
/** 名单：{ "QQ号": "锁定名称" } */
function mkLockNameLoad(gid) {
  try {
    const raw = JSON.parse(readA(mkLockNamePath(gid)) || "{}");
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
    const out = {};
    for (const key of Object.keys(raw)) {
      const qq = String(key ?? "").trim();
      const name = String(raw[key] ?? "").trim();
      if (!qq || !name) continue;
      out[qq] = name;
    }
    return out;
  } catch (_e) {
    return {};
  }
}
function mkLockNameSave(gid, data) {
  writeA(mkLockNamePath(gid), JSON.stringify(data || {}, null, 2));
}
/** 该用户的锁定名称（不在名单返回空串） */
function mkLockNameOf(gid, uid) {
  const id = String(uid ?? "").trim();
  if (!id) return "";
  return mkLockNameLoad(gid)[id] || "";
}

// ================== 违禁词共用取值 ==================
function mkForbiddenWordList(gid) {
  try {
    const raw = JSON.parse(readA(`筱筱吖/群管系统/违禁系统/${gid}/违禁词.json`) || "[]");
    return Array.isArray(raw) ? raw : [];
  } catch (_e) {
    return [];
  }
}
/** 文本是否命中本群违禁词（完全相等与部分包含都算命中） */
function mkTextHitsForbiddenWord(gid, text) {
  const s = String(text ?? "").trim();
  if (!s) return false;
  return forbiddenWordsMatchText(s, mkForbiddenWordList(gid));
}

// ================== 全局违禁词库（所有群共用，仅群聊） ==================
const GLOBAL_FORBIDDEN_WORDS_FILE = "筱筱吖/群管系统/违禁系统/全局/违禁词.json";
const GLOBAL_FORBIDDEN_PUNISH_FILE = "筱筱吖/群管系统/违禁系统/全局/处理.json";
const GLOBAL_FORBIDDEN_ENABLE_FILE = "筱筱吖/群管系统/违禁系统/全局/启用群.json";
const GLOBAL_FORBIDDEN_FOLLOW_FILE = "筱筱吖/群管系统/违禁系统/全局/跟随惩罚.json";

/** 全局违禁词库（清洗空串 / 非字符串项） */
function mkGlobalForbiddenList() {
  try {
    const raw = JSON.parse(readA(GLOBAL_FORBIDDEN_WORDS_FILE) || "[]");
    if (!Array.isArray(raw)) return [];
    return raw.filter((item) => typeof item === "string" && item.trim() !== "");
  } catch (_e) {
    return [];
  }
}
/** 开关B：本群是否启用全局违禁词匹配 */
function mkGlobalForbiddenEnabled(gid) {
  return readB(GLOBAL_FORBIDDEN_ENABLE_FILE, String(gid), "关闭") === "开启";
}
/** 开关A：本群命中全局词后是否跟随全局惩罚机制 */
function mkGroupFollowGlobal(gid) {
  return readB(GLOBAL_FORBIDDEN_FOLLOW_FILE, String(gid), "关闭") === "开启";
}
/** 全局惩罚配置（多选：禁言 / 撤回 / 踢出 + 子项） */
function mkGlobalPunishConfig() {
  const dur = Number(readB(GLOBAL_FORBIDDEN_PUNISH_FILE, "禁言时长", 600));
  const kick = String(readB(GLOBAL_FORBIDDEN_PUNISH_FILE, "踢出方式", "黑踢"));
  return {
    禁言: readB(GLOBAL_FORBIDDEN_PUNISH_FILE, "禁言", "关闭") === "开启",
    撤回: readB(GLOBAL_FORBIDDEN_PUNISH_FILE, "撤回", "关闭") === "开启",
    踢出: readB(GLOBAL_FORBIDDEN_PUNISH_FILE, "踢出", "关闭") === "开启",
    禁言时长: Number.isFinite(dur) && dur > 0 ? Math.min(dur, 2592000) : 600,
    踢出方式: kick === "普通" ? "普通" : "黑踢",
  };
}

/** 按本群 处理.json 执行（撤回 / 禁言 / 撤回禁言）；返回是否已撤回/移除消息可见性 */
async function mkApplyGroupPunish(ctx, event, 类型, 时长) {
  const gid = event.group_id;
  let recalled = false;
  try {
    if (类型 == "禁言") {
      BOTAPI(ctx, "set_group_ban", { group_id: gid, user_id: event.user_id, duration: 时长 });
    } else if (类型 == "撤回") {
      await BOTAPI(ctx, "delete_msg", { message_id: event.message_id });
      recalled = true;
    } else {
      BOTAPI(ctx, "set_group_ban", { group_id: gid, user_id: event.user_id, duration: 时长 });
      await BOTAPI(ctx, "delete_msg", { message_id: event.message_id });
      recalled = true;
    }
  } catch (e) {
    logger?.warn?.("[全局违禁] 本群处理执行异常:", e?.message || e);
  }
  return { recalled };
}

/** 按全局惩罚配置执行（多选逐项）；全不选=不处理 */
async function mkApplyGlobalPunish(ctx, event, punish) {
  const gid = event.group_id;
  let recalled = false;
  if (punish.撤回) {
    try {
      await BOTAPI(ctx, "delete_msg", { message_id: event.message_id });
      recalled = true;
    } catch (e) {
      logger?.warn?.("[全局违禁] 撤回失败:", e?.message || e);
    }
  }
  if (punish.禁言) {
    try {
      BOTAPI(ctx, "set_group_ban", {
        group_id: gid,
        user_id: event.user_id,
        duration: Number(punish.禁言时长) || 600,
      });
    } catch (e) {
      logger?.warn?.("[全局违禁] 禁言失败:", e?.message || e);
    }
  }
  if (punish.踢出) {
    try {
      await kickGroupMembers(ctx, gid, event.user_id, punish.踢出方式 === "黑踢");
      recalled = true; // 已移除该成员，后续禁发无需重复处理
    } catch (e) {
      logger?.warn?.("[全局违禁] 踢出失败:", e?.message || e);
    }
  }
  return { recalled };
}

/**
 * 违禁词统一处置：全局优先，命中即视为已处理（跳过本群词库二次判断）。
 * 原则：先文本匹配（无 API 开销），命中后才查身份，机器人有管理权且高于对方才执行，否则静默跳过。
 * @param levelCache 复用外层已查到的等级 { bot, user }（0 表示未知，按需查询）
 * @returns { handled: 是否命中并接管, recalled: 是否已撤回/移除消息 }
 */
async function mkApplyGlobalOrGroupForbidden(ctx, event, haystackText, levelCache) {
  const gid = event.group_id;
  const cache = levelCache || { bot: 0, user: 0 };

  const 全局启用 = mkGlobalForbiddenEnabled(gid);
  let hitGlobal = false;
  if (全局启用) {
    hitGlobal = forbiddenWordsMatchText(haystackText, mkGlobalForbiddenList());
  }
  let hitGroup = false;
  if (!hitGlobal) {
    hitGroup = forbiddenWordsMatchText(haystackText, mkForbiddenWordList(gid));
  }
  if (!hitGlobal && !hitGroup) return { handled: false, recalled: false };

  // ===== 命中后才判断身份，避免无谓的接口调用与报错 =====
  if (!cache.bot) {
    try {
      const dp = await BOTAPI(ctx, "get_group_member_info", { group_id: gid, user_id: event.self_id });
      cache.bot = RC_group_role[(dp?.role || "member")] || 0;
    } catch (_e) {
      cache.bot = 0;
    }
  }
  if (cache.bot < 2) return { handled: true, recalled: false };
  if (!cache.user) {
    try {
      const dp = await BOTAPI(ctx, "get_group_member_info", { group_id: gid, user_id: event.user_id });
      cache.user = RC_group_role[(dp?.role || "member")] || 0;
    } catch (_e) {
      cache.user = 0;
    }
  }
  if (cache.bot <= cache.user) return { handled: true, recalled: false };

  // ===== 执行处置 =====
  if (hitGlobal && mkGroupFollowGlobal(gid)) {
    const r = await mkApplyGlobalPunish(ctx, event, mkGlobalPunishConfig());
    return { handled: true, recalled: r.recalled };
  }
  const 类型 = readB(`筱筱吖/群管系统/违禁系统/${gid}/处理.json`, "方式", "撤回");
  const 时长 = readB(`筱筱吖/群管系统/违禁系统/${gid}/处理.json`, "时长", 600);
  const r = await mkApplyGroupPunish(ctx, event, 类型, 时长);
  return { handled: true, recalled: r.recalled };
}

// ================== 马甲系统：昵称违禁词兜底（须马甲系统 + 进阶检测同时开启） ==================
/** 马甲拼接用的「名字部分」：命中违禁词换 QQ 号，QQ 号也命中则用 - */
function mkMajiaNamePart(gid, nickname, uid, advancedOn) {
  const clean = sanitizeMajiaNickname(nickname);
  if (!advancedOn) return clean;
  const words = mkForbiddenWordList(gid);
  if (!words.length) return clean;
  const 命中 = forbiddenWordsMatchText(clean, words) || forbiddenWordsMatchText(String(nickname ?? ""), words);
  if (!命中) return clean;
  const qq = String(uid ?? "").trim();
  if (!qq || forbiddenWordsMatchText(qq, words)) return "-";
  return qq;
}
/** 马甲群名片：进阶检测开启时走违禁词兜底，否则与 buildMajiaCard 一致 */
function mkMajiaBuildCard(gid, prefix, nickname, uid, advancedOn) {
  if (!advancedOn) return buildMajiaCard(prefix, nickname);
  const part = mkMajiaNamePart(gid, nickname, uid, advancedOn);
  if (!part) return String(prefix ?? "");
  return String(prefix ?? "") + part;
}

const RC_group_role ={
  "owner":3,
  "admin":2,
  "member":1,
  "unknown":0
};

function mkSpamFloodManageModeOn(groupId) {
    return readB(`筱筱吖/事件系统/${groupId}.json`, "管理模式", "关闭") === "开启";
}

async function mkSpamFloodIsCountExempt(event, ctx) {
    const ownerQQs = readB("config.json", "OwnerQQs", []);
    const userQQ = String(event.user_id ?? "");
    if (Array.isArray(ownerQQs) && ownerQQs.map(String).includes(userQQ)) return true;
    if (event.message_type === "group" && mkSpamFloodManageModeOn(event.group_id)) {
        if (await checkOwner3(event, ctx, true, true)) return true;
    }
    if (await mkIsPardonExempt(ctx, event, event.user_id)) return true;
    return false;
}

async function mkSpamFloodCanManageConfig(event, ctx) {
    if (event.message_type !== "group") return false;
    return checkOwner3(event, ctx, mkSpamFloodManageModeOn(event.group_id));
}

function mkGetSpamFloodDeps() {
    return {
        readB,
        writeB,
        BOTAPI,
        botApiPayload,
        logger,
        RC_group_role,
        发消息,
        段_引用,
        段_文本,
        isCountExempt: mkSpamFloodIsCountExempt,
        canManageConfig: mkSpamFloodCanManageConfig,
    };
}

const MK_骨灰_秒上限 = 365 * 86400;
const MK_骨灰_秒下限 = 3600;
const MK_骨灰_默认标准秒 = 7 * 86400;
const MK_骨灰_预设标准秒 = {
    "七日": 7 * 86400,
    "半月": 15 * 86400,
    "一月": 30 * 86400,
};

function mk骨灰获取标准路径(groupId) {
    return `筱筱吖/群管系统/清理骨灰/${groupId}/获取标准.json`;
}

function mk读取骨灰获取标准秒(groupId) {
    const v = Number(readB(mk骨灰获取标准路径(groupId), "秒数", MK_骨灰_默认标准秒));
    return v > 0 ? v : MK_骨灰_默认标准秒;
}

function mk格式化骨灰标准秒(秒数) {
    const n = Number(秒数) || 0;
    const 月秒 = 30 * 86400;
    if (n > 0 && n % 月秒 === 0) {
        return `${n / 月秒}月`;
    }
    if (n > 0 && n % 86400 === 0) {
        return `${n / 86400}天`;
    }
    return `${n}秒`;
}

function mk骨灰筛选标准标签(前缀) {
    if (前缀 === "七日") return "七日";
    if (前缀 === "半月") return "半月";
    if (前缀 === "一月") return "一月";
    return "默认";
}

function mk解析骨灰获取标准指令(message) {
    const m = message.match(/^设置骨灰获取标准([0-9]+)(天|月|)$/);
    if (!m) return null;
    const 数值 = Number(m[1]);
    const 单位 = m[2];
    if (!Number.isFinite(数值) || 数值 <= 0) {
        return { ok: false, err: "数值无效，请携带正整数" };
    }
    let 秒数;
    if (单位 === "天") {
        if (数值 > 365) {
            return { ok: false, err: "天数不能超过365天" };
        }
        秒数 = 数值 * 86400;
    } else if (单位 === "月") {
        if (数值 > 12) {
            return { ok: false, err: "月数不能超过12月" };
        }
        秒数 = 数值 * 30 * 86400;
    } else {
        秒数 = 数值;
    }
    if (秒数 < MK_骨灰_秒下限) {
        return { ok: false, err: `最低标准为${MK_骨灰_秒下限}秒` };
    }
    if (秒数 > MK_骨灰_秒上限) {
        return { ok: false, err: `最高标准为365天（${MK_骨灰_秒上限}秒）` };
    }
    return { ok: true, 秒数, 展示: mk格式化骨灰标准秒(秒数) };
}

/** 与 QQ 客户端「需要身份验证 → 回答问题并由管理员审核」对齐的问题文案（仅 NapCat 已有 set_group_add_option 能改的部分） */
const MK_JOIN_AUDIT_QQ_QUESTION = "你来干什么的";

/**
 * 开启「入群审核」时：若机器人为群主/管理员，则调用 NapCat set_group_add_option（不改 napcat.mjs）。
 * add_type=5：回答问题并由管理员审核；邀请好友/邀请审核等需 NT 其它字段，此处不处理。
 */
async function mkTrySyncNapCatJoinOptionForAudit(ctx, groupId) {
    const gid = String(groupId ?? "").trim();
    if (!/^\d+$/.test(gid) || !ctx?.actions?.call) {
        return { ok: false, reason: "bad_ctx" };
    }
    const selfUin = Number(ctx?.core?.selfInfo?.uin ?? 0);
    if (!selfUin) {
        return { ok: false, reason: "no_self" };
    }
    try {
        const dp = await BOTAPI(ctx, "get_group_member_info", { group_id: gid, user_id: selfUin });
        const roleLv = RC_group_role[dp?.role || "member"] || 0;
        if (roleLv < 2) {
            return { ok: false, reason: "not_admin" };
        }
        await BOTAPI(ctx, "set_group_add_option", {
            group_id: gid,
            add_type: 5,
            group_question: MK_JOIN_AUDIT_QQ_QUESTION,
            group_answer: ""
        });
        return { ok: true };
    } catch (e) {
        logger?.warn?.("[MKbot] set_group_add_option 同步失败:", e?.message || e);
        return { ok: false, reason: "api_error", detail: String(e?.message || e) };
    }
}


// ================== 非主人被拒回复（nowoner / nowonernr）==================
async function sendNowonerDeniedReply(event) {
    const nowoner = readB("config.json", "nowoner", false);
    const nowonernr = readB("config.json", "nowonernr", "你不是她......");
    if (nowoner && nowonernr) {
        await 发消息(event, [段_引用(event.message_id), 段_文本(nowonernr)]);
    }
}

function mkIsOwnerUser(event) {
    const ownerQQs = readB("config.json", "OwnerQQs", []);
    const userQQ = String(event.user_id);
    const 消息自触 = readB("config.json", "自触开关", false);
    let isOwner = ownerQQs.includes(userQQ);
    if (消息自触 === true && event.self_id == event.user_id) {
        isOwner = true;
    }
    return isOwner;
}

// ================== 主人检测 - 有回复版（与 checkOwner2 行为一致）==================
async function checkOwner(event, ctx, silent = false) {
    if (mkIsOwnerUser(event)) return true;
    if (!silent) await sendNowonerDeniedReply(event);
    return false;
}

// ================== 主人检测 - 最高主人（可选非主人回复）==================
async function checkOwner2(event, ctx, silent = false) {
    if (mkIsOwnerUser(event)) return true;
    if (!silent) await sendNowonerDeniedReply(event);
    return false;
}

// ================== 主人检测 - 增强版（可含群管；默认非主人回复）==================
async function checkOwner3(event, ctx, enableGroupAdmin = false, silent = false) {
    if (mkIsOwnerUser(event)) return true;

    if (enableGroupAdmin && event.message_type === "group") {
        try {
            const 参数 = { group_id: event.group_id, user_id: event.user_id };
            const memberInfo = await BOTAPI(ctx, "get_group_member_info", 参数);
            const role = memberInfo?.role || "member";
            if (role === "owner" || role === "admin") return true;
        } catch (error) {
            logger.error('[checkOwner3] 获取群成员信息失败:', error);
        }
    }

    if (!silent) await sendNowonerDeniedReply(event);
    return false;
}

// ================== 未授权回复（noauth / noauthnr）==================
async function sendUnauthReplyIfEnabled(event) {
    await sendUnauthReplyIfEnabledImpl(event, readB);
}

async function requireAuthorized(RC_sq, event, silent = false) {
    return requireAuthorizedImpl(RC_sq, event, readB, silent);
}

// ================== 消息处理 ==================
async function handleMessage(message, event, ctx) {


// ================== 我的权限在你之上 ==================
if(message.match(/([\s\S]*)/)){
    // ================== 开关 ==================
    let 群_ofs = readB("变态.json", "群", []);
    let 人_ofs = readB("变态.json", "QQ", []);
    let is0Groups = 群_ofs.includes(String(event.group_id ?? ""));
    let is0Haoyou = 人_ofs.includes(String(event.user_id));
    if(event.message_type == "group" && is0Groups == true && is0Haoyou == true && event.user_id != event.self_id){
        // ================== 初始数据 ==================
        let 现在时间 = timeA("y-m-d H:i:s", Math.floor(Date.now() / 1000));
        let zuzu = `[时间]:${现在时间}\n[群号]:${event.group_id}\n[群名]:${event.group_name}\n[用户]:${event.user_id}\n[昵称]:${event.sender.nickname}`;
        const messages = [合并节点("[调试消息]", event.self_id, [段_文本(zuzu)])];
        // ================== 循环前置 ==================
        let 循环目标 = event.message;
        let 循环次数 = (循环目标.length || 0);
        let 组装消息 = ``;
        let 组装图片 = []; // 改为数组
        // ================== 开始循环 ==================
        for(let i = 0; i < 循环次数; i++){
            let oooooo = event.message[i]?.type; // 改为循环内判断每个消息
            if(oooooo == "json"){
                let jsonData = event.message[i].data.data;
                messages.push(合并节点(`[JSON消息]`, event.self_id, [段_Json(jsonData)]));
                continue;
            }
            if(oooooo == "forward"){
                let jsonData = event.raw?.elements?.[0]?.multiForwardMsgElement?.xmlContent;
                if(jsonData){
                    messages.push(合并节点(`[错误消息]`, event.self_id, [段_文本("[错误]:暂不支持解析xml卡片")]));
                }
                continue;
            }
            if(oooooo == "video"){
                let jsonData = event.message[0].data.url;
                messages.push(合并节点(`[视频消息]`, event.self_id, [段_视频(jsonData)]));
                continue;
            }
            if(oooooo == "record"){
                messages.push(合并节点(`[错误消息]`, event.self_id, [段_文本("[错误]:暂不支持解析语音消息")]));
                continue;
            }
            // ================== 获取纯文本数据 ==================
            if(oooooo == "at"){
                组装消息 += `[艾特了:${event.message[i].data.qq}]`;
                continue;
            }
            if(oooooo == "text"){
                组装消息 += `${event.message[i].data.text}`;
                continue;
            }
            if(oooooo == "image"){
                组装图片.push(event.message[i].data.url);
                continue;
            }
            if(oooooo == "face"){
                组装消息 += `[表情:${event.message[i].data.id}]`;
                continue;
            }
            // ================== 获取结束 ==================
        }
        // ================== 是否添加文本 ==================
        if(组装消息.length != 0 && 组装图片.length != 0){
            messages.push(合并图文节点(`[文本+图片]`, event.self_id, 组装消息, 组装图片));
        }else if(组装消息.length == 0 && 组装图片.length != 0){
            messages.push(合并图片节点(`[图片消息]`, event.self_id, 组装图片));
        }else if(组装消息.length != 0 && 组装图片.length == 0){
            messages.push(合并节点(`[文本消息]`, event.self_id, [段_文本(组装消息)]));
        }
        // ================== 输出方式 ==================
        let 输出方式 = readB("变态.json", "方式", "私聊");
        let 输出目标 = readB("变态.json", "转发", "");
        if(输出目标 != "" && 输出目标.length >= 4){
            let fakeEvent = {message_type: "group",group_id: 输出目标};
            if(输出方式 == "私聊"){
                fakeEvent = {message_type: "private",user_id: 输出目标};
            }
            await 发合并消息(fakeEvent, messages);
        }
        // ================== 检 ==================
    }
}

// ================== 全局开关 - 群聊&私聊 ==================
if(event.message_type == "group" && !mkGroupExecAllowed(event.group_id)){
    return null;
}
if(event.message_type == "private" && !mkPrivateExecAllowed(event.user_id)){
    return null;
}
// ================== 是否助手模式 ==================
const zhushou_of = readB("config.json", "助手模式", false);
if(zhushou_of == true){
    if(event.self_id != event.user_id){//发言人不是机器人
        return null;
    }
}
// ================== 全局变量 ==================
const RC_sq = await checkAuthStatus(event);
const RC_music_bbh = `1.1.0`;

// ================== Q群管家 token 采集（2854196310 · autoreply JSON） ==================
if (event.message_type === "group") {
    captureGuanjiaTokenFromMessage(event, readB, writeB);
}

// ================== 娱乐开关（分项；兼容旧版深度娱乐总开关） ==================
const 娱乐_来源 = event.message_type == "group" ? event.group_id : "私聊";
const 深度娱乐路径 = readB("config.json", "深度娱乐路径", "筱筱吖/娱乐系统/深度娱乐/娱乐模式.json");
/** @deprecated 仅兼容旧指令/旧逻辑；业务请用 娱乐功能(分项名) */
const 娱乐_开关 = readB(深度娱乐路径, 娱乐_来源, true);
const 娱乐功能 = (分项) => isEntertainmentFeatureOn(分项, 娱乐_来源, readB, 深度娱乐路径);




// ================== 字数限制&行数限制 ==================
if (event.message_type == "group") {
    // 判断开关 & 授权
    const 进阶开关 = readB(`筱筱吖/事件系统/${event.group_id}.json`, "进阶检测", "关闭");
    if (RC_sq == "已授权" && 进阶开关 == "开启" && !(await mkIsPardonExempt(ctx, event, event.user_id))) {
        // 统计艾特
        const atList = giveAT(event.message);
        const 艾特人数 = atList.length;
        // 获取各项限制配置
        const 限制字数 = Number(readB(`筱筱吖/群管功能/发言限制/${event.group_id}.json`, "字数", 0));
        const 限制行数 = Number(readB(`筱筱吖/群管功能/发言限制/${event.group_id}.json`, "行数", 0));
        const 限制艾特 = Number(readB(`筱筱吖/群管功能/发言限制/${event.group_id}.json`, "艾特", 0));
        // 任意限制开启则校验
        if (限制字数 !== 0 || 限制行数 !== 0 || 限制艾特 !== 0) {
            const 纯文字 = eventUserTextFromSegments(event);
            const 字数 = 纯文字.length || 0;
            const 行数 = 纯文字 ? 纯文字.split('\n').length : 0;
            let 超限 = false;
            let 提示 = "发言超出限制啦！";
            if (限制字数 != 0 && 字数 > 限制字数) {
                超限 = true;
                提示 += `\n字数上限：${限制字数}，当前：${字数}字`;
            }
            if (限制行数 != 0 && 行数 > 限制行数) {
                超限 = true;
                提示 += `\n行数上限：${限制行数}，当前：${行数}行`;
            }
            if (限制艾特 != 0 && 艾特人数 > 限制艾特) {
                超限 = true;
                提示 += `\n艾特上限：${限制艾特}，当前：${艾特人数}人`;
            }
            // 超限执行撤回
            if (超限) {
                try {
                    // 获取机器人自身身份
                    const dp188 = await BOTAPI(ctx, "get_group_member_info", {
                        group_id: event.group_id,
                        user_id: event.self_id
                    });
                    const Robot身份 = RC_group_role[(dp188?.role || "member")] || 0;
                    // 获取发言者标准身份（修复缺失user_id报错）
                    const dp199 = await BOTAPI(ctx, "get_group_member_info", {
                        group_id: event.group_id,
                        user_id: event.user_id
                    });
                    const 目标身份 = RC_group_role[(dp199?.role || "member")] || 0;
                    // 机器人权限高于对方 / 自己发的消息 可撤回
                    if (Robot身份 > 目标身份 || Robot身份 === 3 || event.user_id === event.self_id) {
                        await BOTAPI(ctx, "delete_msg", { message_id: event.message_id });
                    }
                } catch (err) {
                    logger.error("[发言限制] 查询群成员/撤回接口异常：", err);
                }
                return null;
            }
        }
    }
}


// ================== 刷屏检测（双窗口 · 内存计数） ==================
if (event.message_type === "group" && RC_sq === "已授权") {
    try {
        const spamHandled = await checkSpamFlood(ctx, event, mkGetSpamFloodDeps());
        if (spamHandled) return null;
    } catch (spamErr) {
        logger?.warn?.("[刷屏检测] 异常:", spamErr?.message || spamErr);
    }
}


// ================== 发言统计 ==================
//为了最大真实效果记录发言统计数量
//得在靠前面
if(message.match(/([\s\S]*)/)){//匹配全部消息
    if(event.message_type == "group"){//必须是群聊才触发
        // ================== 判断开关 & 授权 ==================
        if(RC_sq == "已授权"){
            // ================== 发言统计 ==================
            let 发言统计开关 = readB(`筱筱吖/事件系统/${event.group_id}.json`, "发言统计", "关闭");
            if(发言统计开关 == "开启"){
                let 今天 = timeA("y-m-d", Math.floor(Date.now() / 1000));
                let 数量 = Number(readB(`筱筱吖/扩展功能/发言统计/${event.group_id}/次数统计/${今天}.json`, event.user_id, 0));
                writeB(`筱筱吖/扩展功能/发言统计/${event.group_id}/次数统计/${今天}.json`, event.user_id, 数量 + 1);
            }
            // ================== 发言统计结束 ==================
            // ================== 入群验证 ==================
            let 验证开关 = readB(`筱筱吖/事件系统/${event.group_id}.json`, "入群验证", "关闭");
            if(验证开关 == "开启"){
                let 状态 = readB(`筱筱吖/群管系统/入群审核/${event.group_id}/审核状态.json`, event.user_id, "无");
                if(状态 == "验证中"){
                    let 值 = readB(`筱筱吖/群管系统/入群审核/${event.group_id}/验证码.json`, event.user_id, false);
                    if(值){
                        let 参数188 = {group_id : event.group_id,user_id : event.self_id};
                        let dp188 = await BOTAPI(ctx, "get_group_member_info", 参数188);
                        let Robot身份 = (RC_group_role[(dp188?.role || "member")] || 0);//机器人身份等级
                        let 参数199 = {group_id : event.group_id,user_id : event.user_id};
                        let dp199 = await BOTAPI(ctx, "get_group_member_info", 参数199);
                        let User身份 = (RC_group_role[(dp199?.role || "member")] || 0);//目标身份
                        if(Robot身份 > User身份){
                            let 内容 = eventUserTextFromSegments(event).trim();
                            let 可用次数 = readB(`筱筱吖/群管系统/入群审核/${event.group_id}/次数.json`, "可用次数", 5);
                            if(内容 != String(值)){
                                let 已用次数 = readB(`筱筱吖/群管系统/入群审核/${event.group_id}/次数.json`, event.user_id, 0);
                                // ================== 是否超标 ==================
                                if(已用次数 >= 可用次数){
                                    kickGroupMembersFireAndForget(ctx, event.group_id, [event.user_id], false);
                                    await 发消息(event, [段_文本(`【通报】\n[用户]:${event.user_id}\n在规定次数内未成功验证，已处理！`)]);
                                    writeB(`筱筱吖/群管系统/入群审核/${event.group_id}/审核状态.json`, event.user_id, "废物");
                                    writeB(`筱筱吖/群管系统/入群审核/${event.group_id}/验证码.json`, event.user_id, false);
                                    writeB(`筱筱吖/群管系统/入群审核/${event.group_id}/验证内容.json`, event.user_id, false);
                                    return null;
                                }else{
                                    writeB(`筱筱吖/群管系统/入群审核/${event.group_id}/次数.json`, event.user_id, 已用次数 + 1);
                                    await BOTAPI(ctx, "delete_msg", {message_id: event.message_id});//撤回
                                    let 已用_次数 = readB(`筱筱吖/群管系统/入群审核/${event.group_id}/次数.json`, event.user_id, 0);
                                    let 提示内容 = readB(`筱筱吖/群管系统/入群审核/${event.group_id}/验证内容.json`, event.user_id, 值);
                                    await 发消息(event, [段_艾特(event.user_id), 段_文本(` (${event.user_id})\n验证码错误！\n你的验证内容是:${提示内容}\n剩余验证次数:${可用次数 - 已用_次数}`)]);
                                    return null;
                                }
                            }else{
                                writeB(`筱筱吖/群管系统/入群审核/${event.group_id}/验证码.json`, event.user_id, false);
                                writeB(`筱筱吖/群管系统/入群审核/${event.group_id}/验证内容.json`, event.user_id, false);
                                writeB(`筱筱吖/群管系统/入群审核/${event.group_id}/审核状态.json`, event.user_id, "已通过");
                            }
                        }else{
                            writeB(`筱筱吖/群管系统/入群审核/${event.group_id}/验证码.json`, event.user_id, false);
                            writeB(`筱筱吖/群管系统/入群审核/${event.group_id}/验证内容.json`, event.user_id, false);
                            writeB(`筱筱吖/群管系统/入群审核/${event.group_id}/审核状态.json`, event.user_id, "无");
                        }
                    }
                }
            }
        }
    }
}



if(message.match(/^(结束|开始)记录([0-9]+|)$/)){
    if(event.message_type == "private"){//必须是私聊才触发
        // ================== 判断开关 & 授权 ==================
        if(RC_sq == "已授权"){
            // ================== 最高主人检测 ==================
            let 权限 = await checkOwner3(event, ctx, false);
            if(权限){
                // ================== 读取数据 ==================
                let 目标 = message.match(/^(结束|开始)记录([0-9]+|)$/)[1];
                let 群号 = message.match(/^(结束|开始)记录([0-9]+|)$/)[2];
                let 文件 = readB(`筱筱吖/扩展功能/入群私聊/收录状态.txt`, "状态", "结束");
                if(文件 == 目标){
                    await 发消息(event, [段_引用(event.message_id), 段_文本(`目前已是「${文件}」状态啦～`)]);
                    return null;
                }
                //如果是
                if(目标 == "开始"){
                    // ================== 事前判断 ==================
                    if(!群号){
                        await 发消息(event, [段_引用(event.message_id), 段_文本('群号参数为空！！！')]);
                        return null;
                    }
                    writeA(`筱筱吖/扩展功能/入群私聊/分群/${群号}.json`, "[]");//重置历史记录
                    writeB(`筱筱吖/扩展功能/入群私聊/收录状态.txt`, "状态", "开始");//写入
                    writeB(`筱筱吖/扩展功能/入群私聊/收录状态.txt`, "群号", 群号);//写入
                    await 发消息(event, [段_引用(event.message_id), 段_文本(`已开启收录，请在300秒内发送内容进行收录！当前收录群号为「${群号}」`)]);
                    for(let i = 0; i < 120; i++){//300秒后自动关闭
                        let 文件1 = readB(`筱筱吖/扩展功能/入群私聊/收录状态.txt`, "状态", "结束");
                        if(文件1 == "结束"){
                            return null;
                        }
                        await new Promise(resolve => setTimeout(resolve, 1*1000));//延迟
                    }
                    writeB(`筱筱吖/扩展功能/入群私聊/收录状态.txt`, "状态", "结束");
                    await 发消息(event, [段_引用(event.message_id), 段_文本('执行超时，已强制结束！')]);
                }else{
                    writeB(`筱筱吖/扩展功能/入群私聊/收录状态.txt`, "状态", "结束");
                    await 发消息(event, [段_引用(event.message_id), 段_文本('已结束本次收录！')]);
                }
                // ================== 强制中断 ==================
                return null;
            }
        }
    }
}


if(message.match(/^([\s\S]*)/)){//匹配全部消息 - 入群私聊
    if(event.message_type == "private"){//必须是私聊才触发
        // ================== 判断开关 & 授权 ==================
        if(RC_sq == "已授权"){
            // ================== 最高主人检测 ==================
            let 权限 = await checkOwner3(event, ctx, false, true);
            // ================== 执行开关判断 ==================
            let 群号 = readB(`筱筱吖/扩展功能/入群私聊/收录状态.txt`, "群号", 955682835);
            let 文件 = readB(`筱筱吖/扩展功能/入群私聊/收录状态.txt`, "状态", "结束");
            // ================== 判断 ==================
            if(文件 == "开始" && 权限 && event.user_id != event.self_id){
                try {
                    const recorded = await recordJoinGroupPmMessage(event, ctx, String(群号), {
                        readA,
                        writeA,
                        getDataPath,
                        giveText,
                        giveImages,
                        downloadFile,
                        botApi: BOTAPI,
                        rand,
                        logger,
                    });
                    if (recorded) {
                        await 发消息(event, [段_引用(event.message_id), 段_文本('记录成功！')]);
                    } else {
                        await 发消息(event, [段_引用(event.message_id), 段_文本('未能收录：不支持的消息类型或媒体下载失败')]);
                    }
                } catch (err) {
                    logger?.error?.('[入群私聊] 收录失败:', err);
                    await 发消息(event, [段_引用(event.message_id), 段_文本('收录失败，请查看日志')]);
                }
                return null;
            }
        }
    }
}

// ================== 查看记录内容 ==================
if(message.match(/^查看记录内容([0-9]+)$/)){
    // 仅在私聊中可用
    if(event.message_type !== "private"){
        await 发消息(event, [段_引用(event.message_id), 段_文本('请在私聊中使用本指令。')]);
        return null;
    }
    // 主人检测（无管理员权限加成）
    if(!(await checkOwner3(event, ctx, false))) return null;
    
    const 群号 = message.match(/^查看记录内容([0-9]+)$/)[1];
    const 文件路径 = `筱筱吖/扩展功能/入群私聊/分群/${群号}.json`;
    let 消息列表 = [];
    try {
        const raw = readA(文件路径);
        if(!raw || raw.trim() === ""){
            await 发消息(event, [段_引用(event.message_id), 段_文本('该群尚未收录任何入群私聊内容。')]);
            return null;
        }
        消息列表 = JSON.parse(raw);
        if(!Array.isArray(消息列表) || 消息列表.length === 0){
            await 发消息(event, [段_引用(event.message_id), 段_文本('该群记录为空。')]);
            return null;
        }
    } catch(e){
        logger?.error?.(`[查看记录内容] 读取文件失败: ${文件路径}`, e);
        await 发消息(event, [段_引用(event.message_id), 段_文本('读取记录失败，文件可能损坏。')]);
        return null;
    }
    const joinGroupPmDeps = {
        readA,
        writeA,
        getDataPath,
        giveText,
        giveImages,
        downloadFile,
        botApi: BOTAPI,
        rand,
        logger,
    };
    for(let i = 0; i < 消息列表.length; i++){
        const 条目 = 消息列表[i];
        try {
            await replayJoinGroupPmEntry(event, ctx, 条目, joinGroupPmDeps);
            await new Promise(resolve => setTimeout(resolve, 300));
        } catch(err){
            logger?.error?.(`[查看记录内容] 发送第 ${i+1} 条失败:`, err);
            await 发消息(event, [段_引用(event.message_id), 段_文本(`发送第 ${i+1} 条记录时出错，已跳过。`)]);
        }
    }
    await 发消息(event, [段_引用(event.message_id), 段_文本(`已展示「${群号}」的全部入群私聊记录。`)]);
    return null;
}

// ================== 设置概率值 ==================
if(message.match(/^设置入群私聊概率([0-9]+) ([0-9]+)%$/)){
    // 仅在私聊中可用
    if(event.message_type !== "private"){
        await 发消息(event, [段_引用(event.message_id), 段_文本('请在私聊中使用本指令。')]);
        return null;
    }
    // 主人检测（无管理员权限加成）
    if(!(await checkOwner3(event, ctx, false))) return null;
    const m = message.match(/^设置入群私聊概率([0-9]+) ([0-9]+)%$/);
    const 群号 = m[1];
    const 概率百分 = Number(m[2]);
    if(!Number.isInteger(概率百分) || 概率百分 < 0 || 概率百分 > 100){
        await 发消息(event, [段_引用(event.message_id), 段_文本('概率仅支持 0～100 的整数（代表 0%～100%）。')]);
        return null;
    }
    const 概率值 = 概率百分 / 100;
    writeB(JOIN_PM_PROBABILITY_FILE, 群号, 概率值);
    let 组装消息 = `入群私聊概率已更新`;
    组装消息 += `\n══════════════`;
    组装消息 += `\n群号：${群号}`;
    组装消息 += `\n概率：${概率百分}%`;
    组装消息 += `\n存储值：${概率值}`;
    await 发消息(event, [段_引用(event.message_id), 段_文本(`${组装消息}`)]);
    return null;
}

// ================== 授权部分（实现见 ./auth/card-license.ts） ==================
if (
  await handleCardLicenseCommands(message, event, ctx, {
    readB,
    writeB,
    readA,
    writeA,
    deleteKey,
    timeA,
    timeB,
    rand,
    checkOwner3,
  })
) {
  return null;
}






















if(message.match(/([\s\S]*)/)){
    // ================== 图片鉴黄（须在消息记录之前，命中则中断以免入档） ==================
    try {
        if (await runGroupImagePornCheck(ctx, event, RC_sq)) {
            return null;
        }
    } catch (pornCheckErr) {
        logger?.warn?.("[图片鉴黄] 异常:", pornCheckErr?.message || pornCheckErr);
    }
    // ================== 消息记录 ==================
    const 是自身消息 =
        event.post_type === "message_sent" ||
        String(event.self_id ?? "") === String(event.user_id ?? event.sender?.user_id ?? "");
    if(!是自身消息 && RC_sq == "已授权" && isMessageRecordEnabled(event)){
        mkEnqueueMessageRecord(ctx, event);
    }
}

// ================== 群管部分 ==================
if(message == "群管系统" || message == "群管功能" || message == "群管菜单"){
    // ================== 授权判断 ==================
    if(!(await requireAuthorized(RC_sq, event))) return null;
    // ================== 组装各个模块消息 ==================
    // 模块1 - 基础群管
    let 组装消息1 = "══════════════";
    组装消息1 += `\n【群管系统】`;
    组装消息1 += `\n - 禁言@人 [时间:秒]`;
    组装消息1 += `\n - 时/天/周/月禁言@人`;
    组装消息1 += `\n - 解禁@人`;
    组装消息1 += `\n - 上管@人`;
    组装消息1 += `\n - 下管@人`;
    组装消息1 += `\n - 踢出@人`;
    组装消息1 += `\n - 黑踢@人`;
    组装消息1 += `\n - 获取禁言列表`;
    组装消息1 += `\n - 全解群员`;
    组装消息1 += `\n══════════════`;
    组装消息1 += `\n【免死金牌】须开启事件「免死金牌」`;
    组装消息1 += `\n - 添加本群免死金牌@人 / QQ号`;
    组装消息1 += `\n - 删除本群免死金牌@人 / QQ号`;
    组装消息1 += `\n - 清空本群免死金牌`;
    组装消息1 += `\n - 查看本群免死金牌列表`;
    if(
        mkPardonEventOn(event.group_id)
        && (await mkBotIsGroupOwner(ctx, event.group_id, event.self_id))
    ){
        组装消息1 += `\n - 开启/关闭管理员免死金牌`;
    }
    组装消息1 += `\n══════════════`;
    组装消息1 += `\n【扩展】`;
    组装消息1 += `\n - 更改群名称[内容]`;
    组装消息1 += `\n - 更改群头像[图片]`;
    组装消息1 += `\n - 发公告[内容][图片:选]`;
    组装消息1 += `\n══════════════`;
    
    // 模块1.1 - 群发公告
    let 组装消息1_1 = `══════════════`;
    组装消息1_1 += `\n【群发公告】`;
    组装消息1_1 += `\n`;
    组装消息1_1 += `\n获取列表/名单的↓`;
    组装消息1_1 += `\n - 获取可群发列表`;
    组装消息1_1 += `\n - 查看可群发列表`;
    组装消息1_1 += `\n - 新增可群发目标[群号]`;
    组装消息1_1 += `\n - 取消可群发目标[群号]`;
    组装消息1_1 += `\n`;
    组装消息1_1 += `\n执行发送的↓`;
    组装消息1_1 += `\n - 执行群发文本[内容][图片:选]`;
    组装消息1_1 += `\n - 执行群发文本[公告][图片:选]`;
    组装消息1_1 += `\n══════════════`;
    组装消息1_1 += `\n在执行前面加个☆即可发送完后艾特全体哦～`;

    // 模块2 - 入群审核
    let 组装消息2 = `══════════════`;
    组装消息2 += `\n【入群审核】`;
    组装消息2 += `\n`;
    组装消息2 += `\n切换类型的↓`;
    组装消息2 += `\n - 设置入群审核条件[准确|包含|模糊多重|准确多重|字数]`;
    组装消息2 += `\n`;
    组装消息2 += `\n设置每人单天的可用次数的↓`;
    组装消息2 += `\n设置入群审核单日次数[数量]`;
    组装消息2 += `\n`;
    组装消息2 += `\n字数条件的↓`;
    组装消息2 += `\n - 设置入群审核字数数量[数量]`;
    组装消息2 += `\n`;
    组装消息2 += `\n准确&包含条件的↓`;
    组装消息2 += `\n - 设置入群审核答案[内容]`;
    组装消息2 += `\n`;
    组装消息2 += `\n多重条件的↓`;
    组装消息2 += `\n - 新增审核条件[内容]`;
    组装消息2 += `\n - 删除审核条件[内容]`;
    组装消息2 += `\n - 清空审核条件`;
    组装消息2 += `\n - 查看多重条件列表`;
    组装消息2 += `\n`;
    组装消息2 += `\nQQ等级门槛`;
    组装消息2 += `\n - 设置入群审核等级[数字]`;
    组装消息2 += `\n`;
    组装消息2 += `\n过滤词`;
    组装消息2 += `\n - 新增审核过滤词[内容]`;
    组装消息2 += `\n - 删除审核过滤词[内容]`;
    组装消息2 += `\n - 清空审核过滤词`;
    组装消息2 += `\n - 查看审核过滤词`;
    组装消息2 += `\n══════════════`;
    组装消息2 += `\n详细说明与演示对话见「MK介绍」`;

    let 组装消息2_2_受邀同意 = `══════════════`;
    组装消息2_2_受邀同意 += `\n【受邀同意】（全局事件）`;
    组装消息2_2_受邀同意 += `\n相关事件【受邀同意】写在「筱筱吖/事件系统/全局.json」`;
    组装消息2_2_受邀同意 += `\n开启后：任意群内有人邀请机器人进群时，自动同意（仅 request / sub_type 为 invite）`;
    组装消息2_2_受邀同意 += `\n说明：不受「group_of 群列表」限制；也不校验目标群的卡密授权（否则新群邀请会死锁）`;
    组装消息2_2_受邀同意 += `\n══════════════`;

    // 模块2.3 - 入群验证
    let 组装消息2_3 = `══════════════`;
    组装消息2_3 += `\n【入群验证】`;
    组装消息2_3 += `\n相关事件【入群验证】【禁言免验】`;
    组装消息2_3 += `\n`;
    组装消息2_3 += `\n - 取消入群验证[QQ号]`;
    组装消息2_3 += `\n - 设置入群验证次数[数字]`;
    组装消息2_3 += `\n - 设置入群验证时长[时长:秒]`;
    组装消息2_3 += `\n - 设置入群验证方式[随机数字|随机字母|随机算式]`;
    组装消息2_3 += `\n - 全体禁言时：若「禁言免验」开启则跳过验证码直接通过`;
    组装消息2_3 += `\n══════════════`;

    // 模块2.4 - 入群私聊
    let 组装消息2_4 = `══════════════`;
    组装消息2_4 += `\n【入群私聊】`;
    组装消息2_4 += `\n相关事件【入群私聊】`;
    组装消息2_4 += `\n`;
    组装消息2_4 += `\n - 开始记录[群号]`;
    组装消息2_4 += `\n - 结束记录`;
    组装消息2_4 += `\n - 查看记录内容[群号]`;
    组装消息2_4 += `\n - 设置入群私聊概率[群号] [0-100]%`;
    组装消息2_4 += `\n`;
    组装消息2_4 += `\ntips:该功能必须在机器人私聊发送指令，当前「不支持」管理模式`;
    组装消息2_4 += `\n══════════════`;
    
    // 模块3 - 头衔系统
    let 组装消息3 = `══════════════`;
    组装消息3 += `\n【头衔系统】- 自助`;
    组装消息3 += `\n相关事件【自助头衔】`;
    组装消息3 += `\n - 我要头衔[内容]`;
    组装消息3 += `\n---------------`;
    组装消息3 += `\n【头街系统】- 指令`;
    组装消息3 += `\n - 设置头衔@人 [内容]`;
    组装消息3 += `\n - 全员头衔[内容]`;
    组装消息3 += `\n══════════════`;

    // 模块4 - 清理骨灰
    let 组装消息4 = `══════════════`;
    组装消息4 += `\n【清理骨灰】`;
    组装消息4 += `\n - 获取骨灰群员列表`;
    组装消息4 += `\n - 获取七日骨灰群员列表`;
    组装消息4 += `\n - 获取半月骨灰群员列表`;
    组装消息4 += `\n - 获取一月骨灰群员列表`;
    组装消息4 += `\n - 设置骨灰获取标准[数值][天|月]`;
    组装消息4 += `\n - 查看骨灰群员列表`;
    组装消息4 += `\n - 取消骨灰群员QQ[QQ号]`;
    组装消息4 += `\n - 取消骨灰群员序号[序号]`;
    组装消息4 += `\n - 取消骨灰群员序号[序号]-[序号]`;
    组装消息4 += `\n - 确定清理全部骨灰群员`;
    组装消息4 += `\n------------------`;
    组装消息4 += `\n - 提醒骨灰群员`;
    组装消息4 += `\n - 提醒骨灰群员[内容]`;
    组装消息4 += `\n------------------`;
    组装消息4 += `\n【筛选标准说明】`;
    组装消息4 += `\n · 获取骨灰群员：按本群自定义标准筛选，初始为7天`;
    组装消息4 += `\n · 获取七日骨灰群员：固定筛选7天及以上未发言成员`;
    组装消息4 += `\n · 获取半月骨灰群员：固定筛选15天及以上未发言成员`;
    组装消息4 += `\n · 获取一月骨灰群员：固定筛选30天及以上未发言成员`;
    组装消息4 += `\n · 设置骨灰获取标准1天：带「天」按天×86400换算为秒存储`;
    组装消息4 += `\n · 设置骨灰获取标准1月：带「月」按月×30×86400换算为秒存储`;
    组装消息4 += `\n · 设置骨灰获取标准604800：不带单位则数值本身为秒`;
    组装消息4 += `\n · 可设范围3600秒~365天，配置存于获取标准.json`;
    组装消息4 += `\n · 获取结果仅显示筛选类型，具体天数以本群设置为准`;
    组装消息4 += `\n------------------`;
    组装消息4 += `\n【清理骨灰】- 使用说明`;
    组装消息4 += `\n1.先「获取骨灰群员」列表`;
    组装消息4 += `\n2.再「查看骨灰群员」列表，确定数据无误`;
    组装消息4 += `\n3.如需调整，那就「取消骨灰群员」选「QQ号」模式或「序号」模式`;
    组装消息4 += `\n4.确定无误后，发「确定清理全部骨灰群员」`;
    组装消息4 += `\n5.重新获取列表只需要再发一次「获取骨灰群员」`;
    组装消息4 += `\n6.「提醒骨灰群员」时，必须开启允许临时消息`;
    组装消息4 += `\n══════════════`;

    // 模块5 - 黑名单系统
    let 组装消息5 = `══════════════`;
    组装消息5 += `\n【黑名单系统】`;
    组装消息5 += `\n相关事件【黑白名单】`;
    组装消息5 += `\n`;
    组装消息5 += `\n↓查看列表的↓`;
    组装消息5 += `\n - 黑名单列表`;
    组装消息5 += `\n - 全局黑名单列表`;
    组装消息5 += `\n - 本群黑名单列表`;
    组装消息5 += `\n - 查黑名单[QQ号]`;
    组装消息5 += `\n`;
    组装消息5 += `\n↓添加/删除的↓`;
    组装消息5 += `\n - 清空黑名单`;
    组装消息5 += `\n - 清空全局黑名单`;
    组装消息5 += `\n - 添加本群黑名单@人`;
    组装消息5 += `\n - 添加全局黑名单[QQ号]`;
    组装消息5 += `\n - 删除本群黑名单[QQ号]`;
    组装消息5 += `\n`;
    组装消息5 += `\n↓设置处理方式的↓`;
    组装消息5 += `\n - 设置本群黑名单处理[踢出|黑踢]`;
    组装消息5 += `\n - 设置全局黑名单处理[踢出|黑踢]`;
    组装消息5 += `\n══════════════`;

    // 模块6 - 违禁词系统
    let 组装消息6 = `══════════════`;
    组装消息6 += `\n【违禁词系统】`;
    组装消息6 += `\n相关事件【违禁检测】`;
    组装消息6 += `\n`;
    组装消息6 += `\n - 违禁词列表`;
    组装消息6 += `\n - 添加违禁词[内容]`;
    组装消息6 += `\n - 删除违禁词[内容]`;
    组装消息6 += `\n - 清空违禁词`;
    组装消息6 += `\n`;
    组装消息6 += `\n - 设置违禁处理禁言`;
    组装消息6 += `\n - 设置违禁处理撤回`;
    组装消息6 += `\n - 设置违禁处理撤回禁言`;
    组装消息6 += `\n - 设置违禁处理禁言时长[秒数]`;
    组装消息6 += `\n`;
    组装消息6 += `\n【全局违禁词】所有群共用（仅群聊）`;
    组装消息6 += `\n - 开启全局违禁词处理机制`;
    组装消息6 += `\n - 关闭全局违禁词处理机制`;
    组装消息6 += `\n 💡词库与惩罚方式仅在 WebUI 后台`;
    组装消息6 += `\n    「扩展功能 → 全局违禁」维护`;
    组装消息6 += `\n    命中全局词优先处理，可设为跟随全局惩罚`;
    组装消息6 += `\n══════════════`;
    
    // 模块6.1 - 禁发
    let 组装消息6_1 = `══════════════`;
    组装消息6_1 += `\n【禁发】`;
    组装消息6_1 += `\n相关事件【进阶检测】`;
    组装消息6_1 += `\n`;
    组装消息6_1 += `\n - [开启|关闭]禁发图片`;
    组装消息6_1 += `\n - [开启|关闭]禁发卡片`;
    组装消息6_1 += `\n - [开启|关闭]禁发语音`;
    组装消息6_1 += `\n - [开启|关闭]禁发视频`;
    组装消息6_1 += `\n - [开启|关闭]禁发合并转发`;
    组装消息6_1 += `\n`;
    组装消息6_1 += `\n注意:该功能与「违禁系统」共用同一个处理方式！`;
    组装消息6_1 += `\n══════════════`;
    
    let 组装消息6_2 = `══════════════`;
    组装消息6_2 += `\n【限制文本发送】`;
    组装消息6_2 += `\n相关事件【进阶检测】`;
    组装消息6_2 += `\n - 发言限制 字数 [数字]`;
    组装消息6_2 += `\n - 发言限制 行数 [数字]`;
    组装消息6_2 += `\n - 发言限制 艾特 [数字]`;
    组装消息6_2 += `\n - 发言限制 [数字] [数字] [数值]`;
    组装消息6_2 += `\n - 查看发言限制`;
    组装消息6_2 += `\n`;
    组装消息6_2 += `\n注意：该配置需机器人有管理身份才可以执行，并且快捷设置时，参数分别是 字数 行数 艾特 先后顺序，每个指令均有空格，记得别忘了哦～`;
    组装消息6_2 += `\n══════════════`;

    // 模块7 - 群聊发言统计
    let 组装消息7 = `══════════════`;
    组装消息7 += `\n【群聊发言统计】`;
    组装消息7 += `\n相关事件【发言统计】`;
    组装消息7 += `\n`;
    组装消息7 += `\n↓查看排行列表的↓`;
    组装消息7 += `\n - 发言排行今日榜`;
    组装消息7 += `\n - 发言排行昨日榜`;
    组装消息7 += `\n - 发言排行七日榜`;
    组装消息7 += `\n - 发言排行本月榜`;
    组装消息7 += `\n - 发言排行个人榜`;
    组装消息7 += `\n══════════════`;

    // 模块8 - 新用户入群欢迎
    let 组装消息8 = `══════════════`;
    组装消息8 += `\n【新用户入群欢迎】`;
    组装消息8 += `\n相关事件【入群欢迎】`;
    组装消息8 += `\n`;
    组装消息8 += `\n修改欢迎语例子↓`;
    组装消息8 += `\n - 设置入群欢迎词#[艾特] 欢迎[昵称]([新人QQ])加入[群号]，你是在[时间]加入的`;
    组装消息8 += `\n`;
    组装消息8 += `\n自由搭配变量↓`;
    组装消息8 += `\n - 【机器人头像】: [本机头像]`;
    组装消息8 += `\n - 【新群员头像】: [新人头像]`;
    组装消息8 += `\n - 【艾特新人】: [艾特]`;
    组装消息8 += `\n - 【新人QQ】: [新人QQ]`;
    组装消息8 += `\n - 【新人昵称】: [昵称]`;
    组装消息8 += `\n - 【本群群号】: [群号]`;
    组装消息8 += `\n - 【入群时间】: [时间]`;
    组装消息8 += `\n - 【新人性别】: [性别]`;
    组装消息8 += `\n - 【新人年龄】: [年龄]`;
    组装消息8 += `\n - 【新人等级】: [等级]`;
    组装消息8 += `\n - 【注册时间】: [注册时间]`;
    组装消息8 += `\n══════════════`;
    
    // 模块9 - 马甲系统
    let 组装消息9 = `══════════════`;
    组装消息9 += `\n【群昵称马甲格式系统】`;
    组装消息9 += `\n相关事件【马甲系统】`;
    组装消息9 += `\n`;
    组装消息9 += `\n - 设置马甲内容[内容]`;
    组装消息9 += `\n - 全员马甲[内容]`;
    组装消息9 += `\n`;
    组装消息9 += `\n⚠️全员马甲执行过程中切勿取消权限`;
    组装消息9 += `\n⚠️如遇到官方机器人会主动绕开的！`;
    组装消息9 += `\n⚠️在大于25人时，每执行5人则冷却1秒`;
    组装消息9 += `\n`;
    组装消息9 += `\n💡马甲系统 + 进阶检测 同时开启时：`;
    组装消息9 += `\n昵称含违禁词 → 用「马甲+QQ号」`;
    组装消息9 += `\nQQ号也含违禁词 → 用「马甲-」`;
    组装消息9 += `\n免死金牌名单成员不走该兜底（仍套马甲）`;
    组装消息9 += `\n══════════════`;

    // 模块9_1 - 锁名系统
    let 组装消息9_1 = `══════════════`;
    组装消息9_1 += `\n【锁名系统】针对个体用户`;
    组装消息9_1 += `\n相关事件【锁名系统】`;
    组装消息9_1 += `\n`;
    组装消息9_1 += `\n - 添加锁名@人 [名字]（可艾特多人）`;
    组装消息9_1 += `\n - 更改锁名@人 [名字]（不在名单则自动添加）`;
    组装消息9_1 += `\n - 取消锁名@人（也可直接写QQ号）`;
    组装消息9_1 += `\n - 获取锁名列表`;
    组装消息9_1 += `\n - 清空锁名列表`;
    组装消息9_1 += `\n`;
    组装消息9_1 += `\n⚠️名字1 - 18字，且不能命中本群违禁词`;
    组装消息9_1 += `\n⚠️机器人须有管理权限才能改名片`;
    组装消息9_1 += `\n⚠️优先级高于马甲系统（已锁名的人不套马甲）`;
    组装消息9_1 += `\n══════════════`;

    let 组装消息10 = `══════════════`;
    组装消息10 += `\n【刷屏检测】`;
    组装消息10 += `\n相关事件【刷屏检测】`;
    组装消息10 += `\n`;
    组装消息10 += `\n - 查看刷屏检测`;
    组装消息10 += `\n - 设置刷屏间隔 [秒]`;
    组装消息10 += `\n - 设置刷屏次数 [条]`;
    组装消息10 += `\n - 设置慢刷窗口 [秒]`;
    组装消息10 += `\n - 设置慢刷次数 [条]`;
    组装消息10 += `\n - 设置刷屏禁言 [分钟]`;
    组装消息10 += `\n`;
    组装消息10 += `\n默认：短 10 秒 6 条 · 长 60 秒 12 条 · 禁言 10 分钟`;
    组装消息10 += `\n文本/表情/图片/语音/视频/卡片均按消息条数计`;
    组装消息10 += `\nWebUI：开关管理 → 群详情 → 刷屏配置`;
    组装消息10 += `\n══════════════`;
    
    //目录
    let 目录说明 = "【群管系列】- 共10个模块";
    目录说明 += "\n══════════════";
    目录说明 += "\n001 │ 群管系统 + 群发公告";
    目录说明 += "\n002 │ 入群审核 + 入群验证 + 禁言免验 + 入群私聊";
    目录说明 += "\n003 │ 头衔系统";
    目录说明 += "\n004 │ 清理骨灰";
    目录说明 += "\n005 │ 黑名单系统";
    目录说明 += "\n006 │ 违禁词 + 禁发 + 限制文本";
    目录说明 += "\n007 │ 发言统计";
    目录说明 += "\n008 │ 入群欢迎";
    目录说明 += "\n009 │ 马甲系统 + 锁名系统";
    目录说明 += "\n010 │ 刷屏检测";
    目录说明 += "\n══════════════";
    目录说明 += "\n指令速查发「群管菜单」；含演示对话的完整说明发「MK介绍」";
    // NapCat 合并转发须能解析每个节点 uin（Get Uid），不可用随机/虚构 QQ
    const mkForwardUin = Number(event.self_id);
    // ================== 构建嵌套转发消息 ==================
    const messages = [
        合并节点("📋 群管功能目录", mkForwardUin, [段_文本(目录说明)], { time: 1609459200 }),
        嵌套合并节点("🔧 基础群管", mkForwardUin, [
            合并节点("内容一", mkForwardUin, [段_文本("001")]),
            合并节点("群管系统", mkForwardUin, [段_文本(组装消息1)]),
            合并节点("群发系统", mkForwardUin, [段_文本(组装消息1_1)]),
        ], { time: 1609459200 }),
        嵌套合并节点("📝 入群审核", mkForwardUin, [
            合并节点("内容二", mkForwardUin, [段_文本("002")]),
            合并节点("入群审核", mkForwardUin, [段_文本(组装消息2)]),
            合并节点("受邀同意", mkForwardUin, [段_文本(组装消息2_2_受邀同意)]),
            合并节点("入群验证", mkForwardUin, [段_文本(组装消息2_3)]),
            合并节点("入群私聊", mkForwardUin, [段_文本(组装消息2_4)]),
        ], { time: 1609459200 }),
        嵌套合并节点("👑 头衔系统", mkForwardUin, [
            合并节点("内容三", mkForwardUin, [段_文本("003")]),
            合并节点("头衔系统", mkForwardUin, [段_文本(组装消息3)]),
        ], { time: 1609459200 }),
        嵌套合并节点("💀 清理骨灰", mkForwardUin, [
            合并节点("内容四", mkForwardUin, [段_文本("004")]),
            合并节点("清理骨灰", mkForwardUin, [段_文本(组装消息4)]),
        ], { time: 1609459200 }),
        嵌套合并节点("⚫ 黑名单系统", mkForwardUin, [
            合并节点("内容五", mkForwardUin, [段_文本("005")]),
            合并节点("黑名单系统", mkForwardUin, [段_文本(组装消息5)]),
        ], { time: 1609459200 }),
        嵌套合并节点("🚫 违禁词系统", mkForwardUin, [
            合并节点("内容六", mkForwardUin, [段_文本("006")]),
            合并节点("违禁词系统", mkForwardUin, [段_文本(组装消息6)]),
            合并节点("禁发消息", mkForwardUin, [段_文本(组装消息6_1)]),
            合并节点("限制消息", mkForwardUin, [段_文本(组装消息6_2)]),
        ], { time: 1609459200 }),
        嵌套合并节点("📊 发言统计", mkForwardUin, [
            合并节点("内容七", mkForwardUin, [段_文本("007")]),
            合并节点("发言统计", mkForwardUin, [段_文本(组装消息7)]),
        ], { time: 1609459200 }),
        嵌套合并节点("🎉 入群欢迎", mkForwardUin, [
            合并节点("内容八", mkForwardUin, [段_文本("008")]),
            合并节点("入群欢迎", mkForwardUin, [段_文本(组装消息8)]),
        ], { time: 1609459200 }),
        嵌套合并节点("♻️ 马甲系统", mkForwardUin, [
            合并节点("内容九", mkForwardUin, [段_文本("009")]),
            合并节点("马甲系统", mkForwardUin, [段_文本(组装消息9)]),
            合并节点("锁名系统", mkForwardUin, [段_文本(组装消息9_1)]),
        ], { time: 1609459200 }),
        嵌套合并节点("🛡️ 刷屏检测", mkForwardUin, [
            合并节点("内容十", mkForwardUin, [段_文本("010")]),
            合并节点("刷屏检测", mkForwardUin, [段_文本(组装消息10)]),
        ], { time: 1609459200 }),
    ];
    // ================== 发送嵌套转发 ==================
    await 发合并消息(event, messages, 合并预览(
        "MKbot 群管功能目录",
        "九大群管子模块指令与子菜单一览",
        "[聊天记录]",
        ["基础群管: 禁言/踢人/免死金牌/群发", "入群审核: 审核/验证/禁言免验/私聊/受邀", "头衔/骨灰/黑名单/违禁", "统计/欢迎/马甲+锁名: 见转发内嵌套卡片"],
    ));
    return null;
}

if(message == "MK介绍"){
    // ================== 授权判断 ==================
    if(!(await requireAuthorized(RC_sq, event))) return null;
    // ================== 内容区 ==================
    let 目录说明 = `感谢你能够有耐心阅读本插件的功能介绍\n在此之前，我认为有必要声明MK插件的原则:`;
    目录说明 += `\n1.MK插件绝对免费、绝对开源，不会采取任何付费更新措施！`;
    目录说明 += `\n2.MK开发者坚决不接定制插件！但如果在接技术范围之内可无偿帮忙`;
    目录说明 += `\n3.我没有收取你们的任何东西，所以不要压力我！`;
    目录说明 += `\n4.我们并不希望MK被使用在非法用途中`;
    目录说明 += `\n══════════════`;
    目录说明 += `\n【本介绍包含】授权系统 · 事件管理(30项群事件+7项全局) · 群管001~010 · 娱乐·禁言卡 · 发卡系统(用户+管理)`;
    目录说明 += `\n══════════════`;
    目录说明 += `\n001 基础群管+群发公告+免死金牌（禁言/踢人/改群资料/跨群群发）`;
    目录说明 += `\n002 入群审核+受邀同意+入群验证+禁言免验+入群私聊`;
    目录说明 += `\n003 头衔系统（自助头衔/设置头衔/全员头衔）`;
    目录说明 += `\n004 清理骨灰（获取/查看/取消/清理/提醒+筛选标准）`;
    目录说明 += `\n005 黑名单系统（本群/全局名单与自动拦截）`;
    目录说明 += `\n006 违禁词+禁发+限制文本（进阶检测）`;
    目录说明 += `\n007 发言统计（今日/昨日/七日/本月/个人榜）`;
    目录说明 += `\n008 入群欢迎（自定义欢迎词与变量）`;
    目录说明 += `\n009 马甲系统（前缀马甲/全员马甲）+ 锁名系统（个体锁定群名片）`;
    目录说明 += `\n010 刷屏检测（双窗口频率+权限门控+WebUI配置）`;
    目录说明 += `\n══════════════`;
    目录说明 += `\n【娱乐·禁言卡】商店购买道具 → 使用禁言卡@别人（受深度娱乐开关控制）`;
    目录说明 += `\n【扩展·发卡系统】归笺兑换卡密商店（全服共享库存，分用户端/管理端两节）`;
    目录说明 += `\n══════════════`;
    目录说明 += `\n指令速查发「群管菜单」；下面各模块含真实指令演示对话`;
    目录说明 += `\n📎 内容较多，将分【上下两篇】合并转发；下篇为娱乐·禁言卡 + 扩展·发卡系统`;
    //授权系统
    let 授权介绍_1 = `【授权系统】MK 插件级本地授权（非 QQ 官方）
数据存：筱筱吖/授权系统/授权信息/群号.json（私聊用 私聊.json）
到期或未授权时，群功能会提示「MK没能量啦～要充电电～～」`;
    let 授权介绍_2 = `发「授权系统」可查看完整指令菜单（合并转发 3 条）：
【用户指令】授权判断 / 授权判断[群号] / 使用卡密[卡密]
【后台指令】生成·添加·列表·删卡·取消授权（均需机器主人）`;
    let 授权介绍_3b = `六种卡密时长（秒）：
天86400 · 周604800 · 月2678400 · 半年15724800 · 年31622400 · 永久311040000
公式：授权时间 + 卡密时长 = 到期；未过期再充值为「续期」，已过期为「重新添加授权」`;
    let 授权介绍_4 = `授权系统`;//操作者
    let 授权介绍_5 = `（机器人回复合并转发，节选）
用户指令: 授权判断 / 使用卡密[卡密]
后台指令: 生成/添加各档卡密、卡密列表、删除卡密、清空卡密、删除授权…
后记: 纯本地文件；不需要可在 config 开「绕过授权」`;//机器人
    let 授权介绍_6 = `【方式一·发卡密】机器人生成卡密 → 用户在目标群/私聊「使用卡密」充值`;
    let 授权介绍_7 = `生成月卡授权`;//操作者（单次生成，>10张走私聊合并转发）
    let 授权介绍_8 = `已发给你的私聊啦，请查收～`;//机器人（群聊提示）
    let 授权介绍_9 = `已生成【1】张【月卡】
【1】MK2989961782443452`;//机器人（私聊卡密内容）
    let 授权介绍_10 = `批量例：生成月卡授权5（数量 1～100，否则「请正常给我参数哦～」）`;
    let 授权介绍_11 = `使用卡密MK2989961782443452`;//操作者（在目标群）
    let 授权介绍_12 = `══════════════
[使用目标]:群聊(1082631686)
[增加模式]:重新添加授权
[卡密类型]:月卡
[新增时长]:2678400秒
[到期时间]:2026-07-27 11:17:15
══════════════`;//机器人
    let 授权介绍_13 = `无效卡密：「卡密无效！」；使用后卡密会从 卡密数据.json 删除（一次性）`;
    let 授权介绍_14 = `【方式二·直接加授权】跳过卡密，主人直接在群里/私聊添加时长`;
    let 授权介绍_15 = `添加天卡授权`;//操作者（当前群）
    let 授权介绍_16 = `══════════════
已重新添加授权
[卡密类型]:天卡
[新增时长]:86400秒
[到期时间]:2026-06-27 11:19:49
══════════════`;//机器人
    let 授权介绍_17 = `未过期时再添加会显示「已续期卡密时长」，时长叠加而非清零重算
跨群：添加月卡授权1082631686（私聊也可给指定群加）`;
    let 授权介绍_18 = `【查询】授权判断 = 查当前群/私聊；授权判断1082631686 = 查指定群`;
    let 授权介绍_19 = `授权判断`;//操作者
    let 授权介绍_20 = `群聊(1082631686) - 授权数据
══════════════
[授权时间]:2026-06-26 11:19:49
[剩余时长]:0天23时54分6秒
[到期时间]:2026-06-27 11:19:49
══════════════`;//机器人
    let 授权介绍_21 = `【后台·卡密管理】卡密列表 → 私聊发统计+明细合并转发
删除卡密MKxxxx → 「已删除卡密【xxx】」
清空卡密 → 「已清空现在有的全部卡密啦～！」（菜单写「清空全部」，实际指令为清空卡密）`;
    let 授权介绍_22 = `卡密列表`;//操作者
    let 授权介绍_23 = `已发给你的私聊啦，请查收～`;//机器人
    let 授权介绍_24 = `【后台·取消授权】删除授权 = 清当前群/私聊；删除授权1082631686 = 清指定群
→「我这就去把【1082631686】的授权状态给bian了！」`;
    let 授权介绍_25 = `小总结：
· 出租/自用：生成卡密 → 客户群「使用卡密」
· 自己群省事：直接「添加X卡授权」
· 查余量：授权判断；管库存：卡密列表
· 自用不想授权：config.json 开「绕过授权」即可～`;
    //事件管理
    let 事件介绍_1 = `【事件管理】是 MK 大部分自动化功能的「总开关」
很多功能必须先在这里开启，对应的检测、统计、回复才会真正生效哦～`;
    let 事件介绍_2 = `MK 的事件分为两类：
「本群事件」只对当前群生效，写在「筱筱吖/事件系统/群号.json」
「全局事件」对所有群生效，写在「筱筱吖/事件系统/全局.json」，并且只有机器主人才可以开关！`;
    let 事件介绍_3 = `你可以先发【事件管理】查看全部事件名称、当前开关状态和简要说明
注意：该指令只能在群聊里使用，并且会以「合并转发」的形式回复你`;
    let 事件介绍_4 = `事件管理`;//操作者
    let 事件介绍_24 = `（机器人回复合并转发，共30项群事件+7项全局；每项含名称、开关状态、说明）
节选：
【入群欢迎】: ❌关闭
【违禁检测】: ❌关闭
【禁言免验】: ✅开启
全局【受邀同意】: ❌关闭
全局【自动备份】: ❌关闭
...（完整列表以群内实时查询为准）`;//机器人
    let 事件介绍_5 = `共计【37】个事件（本群30项 + 全局7项）
发「事件管理」可看每项实时开关与说明；下面按分类逐项介绍`;
    let 事件介绍_19 = `【本群事件 1/3】存储：筱筱吖/事件系统/群号.json
①禁言通知 — 有人禁言/解禁/全体禁言时群内自动通知
②入群审核 — 加群申请自动审核，须配合审核指令（详见群管002）
③邀人统计 — 记录本群拉人数量；查询发「邀人统计」
④自助头衔 — 群员「我要头衔」自改头衔，须本事件开启（群管003）
⑤伪造聊天 — 合并转发伪造聊天记录，指令后输入 JSON 数组
⑥黑白名单 — 黑名单拦截的前置开关（详见群管005）`;
    let 事件介绍_20 = `【本群事件 2/3】
⑦退群拉黑 — 退群自动拉黑；不开退群通知也生效但不回复
⑧退群通知 — 有人退群发通知（机器人踢的不通知）；可「设置退群通知词#模板」
⑨整点报时 — 整点自动播报；「更改整点报时文案[内容]」仅本群生效
⑩禁发红包 — 禁发全部类型红包，命中后仅撤回
⑪入群欢迎 — 新人进群发送欢迎语（详见群管008）
⑫违禁检测 — 违禁词自动撤回/禁言（详见群管006）
⑬进阶检测 — 禁发类型+合并内违禁+发言限制（详见群管006）
⑭发言统计 — 记录发言条数排行（详见群管007）
⑮刷屏检测 — 双窗口连发/慢刷检测（详见群管010）`;
    let 事件介绍_21 = `【本群事件 3/3】
⑯群聊续火 — 定时文本续火，维持群活跃标识
⑰视频解析 — 支持哔哩哔哩/抖音/小红书/快手/YouTube/TikTok链接解析
⑱问答系统 — 本群/全局/私聊精准与模糊；全局优先；发「问答系统」看指令
⑲管理模式 — 开启后本群群主/管理员也可操作本群指令
⑳入群验证 — 进群后验证码，默认随机数字（详见群管002）
㉑禁言免验 — 默认开启；本群全体禁言时入群验证直接通过、不发验证码
㉒马甲系统 — 群名片前缀格式化（详见群管009）
㉓入群私聊 — 新人概率私聊已收录内容（详见群管002）
㉔消息记录 — 自动记录本群消息；私聊记录另按好友单独开关
㉕表情制作 — 爬/吃/摸头/贴贴等表情合成（详见菜单「表情制作」）
㉖图片鉴黄 — 群图 NSFW 检测，命中后按违禁处理
㉗快捷撤回 — 引用+「撤回」撤单条；「向上撤回N」可无引用（从本条起算）/可引用；「向下撤回N」须引用（N≤100，须群管，静默；批量按消息记录JSON时间线索引）
㉘图转连接 — 发送「图转链接/转链接」提取图片或视频直链（默认关闭；支持引用消息）
㉙免死金牌 — 名单成员跳过鉴黄/违禁/发言限制/禁发/刷屏等自动处罚（详见群管001）
㉚锁名系统 — 按个体锁定群名片，发言时自动改回锁定名称；优先级高于马甲系统（详见群管009）`;
    let 事件介绍_22 = `【全局事件】存储：筱筱吖/事件系统/全局.json（仅主人可开关）
㉛全群打卡 — 每日00:00准时打卡（可能略有误差）
㉜自动点赞 — 互点回赞；扩展支持定时给全部/特定好友点赞
㉝好友续火 — 每日准时给好友发续火消息
㉞自动备份 — 每天12时与00时自动备份，以好友文件发给开启者
㉟受邀同意 — 被邀请进群时自动同意（仅 invite 请求）
㊱全群免开 — 所有群聊不受开关管理名单限制
㊲全私免开 — 所有私聊（含临时会话）不受好友开关名单限制`;
    let 事件介绍_6 = `看完列表后，切换开关就很简单啦～
本群事件用「开启+事件名」或「关闭+事件名」即可
例如：开启入群欢迎、关闭违禁检测`;
    let 事件介绍_7 = `开启入群欢迎`;//操作者
    let 事件介绍_8 = `这就把【入群欢迎】给开启！`;//机器人
    let 事件介绍_9 = `如果本来就是开启状态，再发一次会怎样呢？`;
    let 事件介绍_10 = `开启入群欢迎`;//操作者
    let 事件介绍_11 = `这个事件好像已经开启了吧～？`;//机器人
    let 事件介绍_12 = `全局事件比如「受邀同意」「自动备份」「全群打卡」「全群免开」等，必须机器主人才可操作
普通群管就算开了管理模式也改不了全局事件哦～`;
    let 事件介绍_13 = `开启受邀同意`;//操作者
    let 事件介绍_14 = `这就把【受邀同意】给开启！`;//机器人
    let 事件介绍_15 = `还有一种偷懒写法：一次性开关全部事件，同样需要主人权限`;
    let 事件介绍_16 = `开启全部事件`;//操作者
    let 事件介绍_17 = `已将以下事件统一「开启」\n══════════════\n【禁言通知】: ✅已开启！\n【入群审核】: ✅已开启！\n【入群欢迎】: ❌本就开启！\n...\n【受邀同意】: ✅已开启！\n══════════════\n（开启入群审核时，若机器人有群管权限，还会尝试同步 QQ 加群方式为问答审核）`;//机器人
    let 事件介绍_18 = `小提示：开启「管理模式」后，本群管理员和群主也可以开关本群事件；但「开启全部事件」「关闭全部事件」以及任意全局事件，仍然只有主人能操作！`;
    let 事件介绍_23 = `常见组合推荐：
· 新群迎新 → 入群欢迎 + 入群审核 + 违禁检测
· 严管群 → 黑白名单 + 进阶检测 + 管理模式 + 入群验证
· 全体禁言群 → 入群验证 + 禁言免验（默认开，禁言中不发验证码）
· 活跃统计 → 发言统计 + 自助头衔 + 群聊续火
· 自用维护 → 自动备份 + 受邀同意 + 好友续火
· 免名单调试 → 全群免开 / 全私免开（仍受授权约束）
单项指令细节见「群管菜单」或 MK介绍对应群管模块～`;
    //群管系统_001
    let 群管001_1 = `【群管系统·001】基础群管 + 扩展 + 群发公告
对应群管菜单第一模块；下面按「该发什么 → 机器人真实回复 → 常见坑点」顺序演示`;
    let 群管001_2 = `使用前必备（与代码 checkOwner3 一致）：
① 本群须已授权，否则回复「MK没能量啦～要充电电～～」
② 须机器主人；或开启「管理模式」后本群群主/管理员也可操作
③ 禁言/踢出/改资料/群发：机器人须是本群管理员
④ 上管/下管：机器人须是群主，且仅主人可发（不受管理模式加成）
⑤ 带@人的指令必须艾特目标；没@或权限不够时多数静默不回复
⑥ 免死金牌：须先「开启免死金牌」；名单存 筱筱吖/群管系统/免死金牌/群号/人员.json
⑦ 机器人为群主时：管理模式管理员可添加/查看，删除时不可删管理员目标，清空仅主人；「开启/关闭管理员免死金牌」仅主人且须机器人群主`;
    let 群管001_3 = `══════════════
【群管系统】
 - 禁言@人 [时间:秒]
 - 时/天/周/月禁言@人
 - 解禁@人
 - 上管@人 / 下管@人
 - 踢出@人 / 黑踢@人
 - 获取禁言列表 / 全解群员
══════════════
【免死金牌】开启事件后可用
 - 添加/删除本群免死金牌@人 或 QQ号
 - 清空本群免死金牌 / 查看本群免死金牌列表
 - （机器人群主时）开启/关闭管理员免死金牌
══════════════
【扩展】更改群名称 / 更改群头像 / 发公告
【群发公告】获取·查看·新增·取消目标 / 执行群发 / ☆艾特全体`;
    let 群管001_4 = `先从禁言和解禁开始：秒数可省略，默认 60 秒；也可写具体秒数或用快捷单位`;
    let 群管001_5 = `禁言@288888888`;//操作者
    let 群管001_6 = `已对【1】人有效禁言啦～
══════════════
✅1.288888888:禁言60秒`;//机器人
    let 群管001_7 = `自定义秒数示例：禁言@288888888 300 → 禁言300秒
快捷单位：时=3600 · 天=86400 · 周=604800 · 月=2592000`;
    let 群管001_8 = `天禁言@288888888`;//操作者
    let 群管001_9 = `已对【1】人有效天禁言啦～
══════════════
✅1.288888888:禁言86400秒`;//机器人
    let 群管001_10 = `解禁@288888888`;//操作者
    let 群管001_11 = `已对【1】人有效解禁啦～
══════════════
✅1.288888888:解禁成功`;//机器人
    let 群管001_12 = `上管/下管仅主人可发；机器人必须是群主，否则「窝没有群主权限唉～」
已是管理/不是管理时会分别提示「已经是啦」「已就不是」并跳过`;
    let 群管001_13 = `上管@288888888`;//操作者
    let 群管001_14 = `已对【1】人有效上管啦～
══════════════
✅1.288888888:新上位`;//机器人
    let 群管001_15 = `下管@288888888`;//操作者
    let 群管001_16 = `已对【1】人有效下管啦～
══════════════
✅1.288888888:被下台了`;//机器人
    let 群管001_17 = `踢出是普通踢，黑踢会勾选拒绝再次加群（QQ 黑名单拦截）`;
    let 群管001_18 = `踢出@288888888`;//操作者
    let 群管001_19 = `已对【1】人有效踢出啦～
══════════════
✅1.288888888:普通踢出`;//机器人
    let 群管001_20 = `黑踢@288888888`;//操作者
    let 群管001_21 = `已对【1】人有效黑踢啦～
══════════════
✅1.288888888:拉黑踢出`;//机器人
    let 群管001_52 = `【场景·机器人无群管】禁言/踢出/解禁等若机器人不是管理员：
「窝没有群管权限唉～」`;
    let 群管001_53 = `【场景·目标权限过高】对方是群主或同级管理时，批量结果里会标：
❌1.288888888:权限不足（不会强行操作）`;
    let 群管001_54 = `【场景·批量@】一次艾特 ≥15 人时，禁言/解禁/踢出等明细走合并转发
标题如「[禁言人数]」「[踢出人数]」，避免单条消息过长`;
    let 群管001_22 = `想看当前还有谁被禁言，直接发「获取禁言列表」`;
    let 群管001_23 = `获取禁言列表`;//操作者
    let 群管001_24 = `共有【1】人处于禁言状态:
══════════════
1.288888888(示例昵称)
[结束时间]:2026-06-27 12:00:00
══════════════`;//机器人
    let 群管001_25 = `想一次性解开全部能解的人，用「全解群员」`;
    let 群管001_26 = `全解群员`;//操作者
    let 群管001_27 = `全解群员执行完成
══════════════
[禁言总数] 1
[解除成功] 1
[权限跳过] 0
[执行失败] 0
══════════════
✅1.288888888(示例昵称)：解除成功
══════════════`;//机器人
    let 群管001_55 = `禁言列表人数 ≥15 时同样会以合并转发输出（标题「[禁言列表]」）`;
    let 群管001_28 = `扩展功能：改群资料 & 发本群公告（均需主人/群管 + 机器人有管理权限）`;
    let 群管001_29 = `更改群名称筱筱の测试群`;//操作者
    let 群管001_30 = `好哒！现在就把群名字改成↓
筱筱の测试群`;//机器人
    let 群管001_31 = `更改群头像`;//操作者（需携带图片）
    let 群管001_32 = `我马上就去把群头像改成介个图片的！`;//机器人
    let 群管001_33 = `发公告今晚八点群内活动，记得参加～`;//操作者
    let 群管001_34 = `（发公告成功时通常不会有文字回复，公告会直接出现在本群公告栏）`;//旁白
    let 群管001_35 = `「群发公告」子模块：先维护可群发列表，再批量发送
「获取可群发列表」= 扫描并写入（带群名）；「查看可群发列表」= 只读当前已存列表
目标群须已授权且机器人在该群有发言/公告权限，否则该群计入失败`;
    let 群管001_36 = `获取可群发列表`;//操作者
    let 群管001_37 = `共计可执行群聊为 2 个
══════════════
1.测试群A(1082631686)
2.测试群B(1099887766)
══════════════
扩展指令:
查看可群发列表
取消可群发目标[群号]
新增可群发目标[群号]
执行群发文本[内容]
执行群发公告[内容]
☆执行群发(跟前两个一样)`;//机器人
    let 群管001_38 = `查看可群发列表`;//操作者
    let 群管001_39 = `══════════════
共计已有 2 个群聊准备就绪
══════════════
1.1082631686
2.1099887766
══════════════
扩展指令:
获取可群发列表
取消可群发目标[群号]
新增可群发目标[群号]
执行群发文本[内容]
执行群发公告[内容]
☆执行群发(跟前两个一样)`;//机器人
    let 群管001_40 = `新增可群发目标1099887766`;//操作者
    let 群管001_41 = `好哒好哒！这就把「1099887766」介个群给加到列表里面！`;//机器人
    let 群管001_42 = `取消可群发目标1099887766`;//操作者
    let 群管001_43 = `好哒！介就把「1099887766」介个群给去掉！`;//机器人
    let 群管001_44 = `维护好列表后，就可以批量发消息或发群公告啦`;
    let 群管001_45 = `执行群发文本大家好，MKbot 群发测试～`;//操作者
    let 群管001_46 = `群发「文本」完成：成功 2/2`;//机器人
    let 群管001_47 = `执行群发公告本群重要通知：请查看群公告`;//操作者
    let 群管001_48 = `群发「公告」完成：成功 2/2`;//机器人
    let 群管001_49 = `想在每个群发送完后艾特全体，在指令前加「☆」即可`;
    let 群管001_50 = `☆执行群发文本更新完毕，请注意查看`;//操作者
    let 群管001_51 = `群发「文本」完成：成功 2/2
（各群发送成功后还会尝试艾特全体）`;//机器人
    let 群管001_57 = `【免死金牌】本群特殊事件：须先「开启免死金牌」
名单：筱筱吖/群管系统/免死金牌/群号/人员.json
子开关：同目录 配置.json → 管理员免死金牌（不进事件管理）
作用：名单成员（及开启管理员免死后的本群管理员）跳过鉴黄/违禁/发言限制/禁发/刷屏；不挡黑名单与手动踢禁`;
    let 群管001_58 = `添加本群免死金牌@288888888`;//操作者
    let 群管001_59 = `免死金牌添加完成～有效【1】人
══════════════
1.【288888888】✅已添加`;//机器人
    let 群管001_60 = `机器人为群主时：管理模式管理员可添加/查看；删除时不可删管理员目标；清空仅主人
「开启/关闭管理员免死金牌」仅主人，且机器人必须是群主`;
    let 群管001_56 = `小总结：
· 日常封禁 → 禁言@人 / 时天周月禁言@人 / 解禁@人
· 人员管理 → 踢出@人 / 黑踢@人 / 上管@人 / 下管@人
· 免死金牌 → 开启免死金牌 → 添加/删除/查看名单（特殊权限见上）
· 批量解封 → 获取禁言列表 → 全解群员
· 跨群通知 → 维护可群发列表 → 执行群发文本/公告（☆=发送后艾特全体）
· 机器人权限是 QQ 接口硬性要求，不是 MK 故意刁难～`;
    //群管系统_002
    const mkDemoNewbieQq = 288888888;
    const mkDemoNewbieAvatar = `https://q4.qlogo.cn/g?b=qq&nk=${mkDemoNewbieQq}&s=5`;
    let 群管002_1 = `【群管系统·002】入群审核 · 受邀同意 · 入群验证 · 禁言免验 · 入群私聊
对应群管菜单第二模块；子功能彼此独立，可按需组合开启`;
    let 群管002_2 = `指令一览（配置类需主人/群管 + 本群已授权）：
【入群审核】设置入群审核条件[准确|包含|模糊多重|准确多重|字数]
  设置入群审核答案 / 单日次数 / 字数数量 / 等级[0-256，0关闭]
  新增·删除·清空 审核条件 / 审核过滤词 · 查看列表
【受邀同意】开启受邀同意（全局事件，仅主人）
【入群验证】取消入群验证[QQ] / 设置次数 / 设置时长 / 设置方式[随机数字|随机字母|随机算式]
【禁言免验】默认开启；全体禁言时跳过入群验证码（可关闭禁言免验强制仍验）
【入群私聊】开始·结束记录 / 查看记录 / 设置概率（须在机器人私聊发送，不支持管理模式）`;
    let 群管002_3 = `先从「入群审核」开始：处理加群申请，需先在事件管理开启「入群审核」
数据目录：筱筱吖/群管系统/入群审核/群号/（数据.json · 条件库.json · 过滤库.json · 申请次数/）`;
    let 群管002_4 = `开启入群审核`;//操作者
    let 群管002_5 = `这就把【入群审核】给开启！
已同步本群 QQ 加群方式：需身份验证 + 回答问题并由管理员审核`;//机器人
    let 群管002_6 = `配置示例：准确模式 + 标准答案 + 每日申请次数 + 多重条件 + 过滤词`;
    let 群管002_7 = `设置入群审核条件准确`;//操作者
    let 群管002_8 = `已把本群的入群审核【条件】设置为「准确」模式
══════════════
记得本账号要有管理权限并且群聊是要为「发送验证消息」才生效哦～`;//机器人
    let 群管002_9 = `设置入群审核答案我已阅读群规并遵守`;//操作者
    let 群管002_10 = `已把本群的入群审核【答案】设置为我已阅读群规并遵守
══════════════
记得本账号要有管理权限并且群聊是要为「发送验证消息」才生效哦～`;//机器人
    let 群管002_11 = `设置入群审核单日次数3`;//操作者
    let 群管002_12 = `已把本群的入群审核【每日次数】设置为3次
══════════════
记得本账号要有管理权限并且群聊是要为「发送验证消息」才生效哦～`;//机器人
    let 群管002_13 = `设置入群审核条件字数`;//操作者
    let 群管002_14 = `已把本群的入群审核【条件】设置为「字数」模式
══════════════
记得本账号要有管理权限并且群聊是要为「发送验证消息」才生效哦～`;//机器人
    let 群管002_15 = `设置入群审核字数数量10`;//操作者
    let 群管002_16 = `已把本群的入群审核【字数审核】设置为10字
══════════════
记得本账号要有管理权限并且群聊是要为「发送验证消息」才生效哦～`;//机器人
    let 群管002_72 = `五种审核模式区别：
· 准确 — 答案须与「设置入群审核答案」完全一致
· 包含 — 答案须包含所设标准答案（子串匹配）
· 字数 — 只看字数 ≥「设置入群审核字数数量」，不看具体内容
· 模糊多重 — 答案包含条件库任一条即通过
· 准确多重 — 答案与条件库任一条完全一致即通过`;
    let 群管002_73 = `设置入群审核条件包含`;//操作者
    let 群管002_74 = `已把本群的入群审核【条件】设置为「包含」模式
══════════════
记得本账号要有管理权限并且群聊是要为「发送验证消息」才生效哦～`;//机器人
    let 群管002_75 = `设置入群审核条件模糊多重`;//操作者
    let 群管002_76 = `已把本群的入群审核【条件】设置为「模糊多重」模式
══════════════
记得本账号要有管理权限并且群聊是要为「发送验证消息」才生效哦～`;//机器人
    let 群管002_17 = `新增审核条件同意入群`;//操作者
    let 群管002_18 = `我这就去更新审核条件
【新增】: 同意入群`;//机器人
    let 群管002_19 = `新增审核过滤词广告`;//操作者
    let 群管002_20 = `我这就去更新审核过滤词
【新增】: 广告`;//机器人
    let 群管002_21 = `查看多重条件列表`;//操作者
    let 群管002_22 = `本群共有【1】个多重条件
══════════════
【1】同意入群`;//机器人
    let 群管002_23 = `查看审核过滤词`;//操作者
    let 群管002_24 = `本群共有【1】个审核过滤词
══════════════
【1】广告`;//机器人
    let 群管002_25 = `当有人申请加群时，MK 自动比对验证答案（QQ 加群方式须为「发送验证消息」）
过滤词优先级最高：答案含过滤词直接拒，不管其他条件是否满足`;
    let 群管002_77 = `【场景·无附加验证】若申请无验证附言（comment 为空）或非 add 类型，会直接同意并在群内通知：
QQ(xxx)通过入群审核，已同意进入～`;
    let 群管002_78 = `【场景·字数不足】字数模式下未达设定字数，QQ 侧可见：
「本群设定通过内容为:>=10个字」`;
    let 群管002_26 = `【场景·审核通过】假设 QQ(${mkDemoNewbieQq}) 申请加群，答案填写「我已阅读群规并遵守」`;
    let 群管002_27 = `QQ(${mkDemoNewbieQq})通过入群审核，已同意进入～`;//机器人
    let 群管002_28 = `【场景·审核失败】若答案不准确，申请会被拒绝，QQ 侧可见理由如：
「你的回答不符合本群设定！2」`;
    let 群管002_29 = `【场景·过滤拦截】若答案包含过滤词「广告」，会直接拒绝：
「你的回答不符合本群设定！3」`;
    let 群管002_30 = `【场景·次数用尽】同一用户当天超过「单日次数」后再申请：
「你今天的可用申请次数已用完咯～」`;
    let 群管002_31 = `删除审核条件同意入群`;//操作者
    let 群管002_32 = `我这就去更新审核条件
【删除】: 同意入群`;//机器人
    let 群管002_33 = `清空审核过滤词`;//操作者
    let 群管002_34 = `耗的，这就就把审核过滤词通通删除！`;//机器人
    let 群管002_79 = `清空审核条件`;//操作者
    let 群管002_80 = `耗的，这就就把审核条件通通删除！`;//机器人
    let 群管002_81 = `删除审核过滤词广告`;//操作者
    let 群管002_82 = `我这就去更新审核过滤词
【删除】: 广告`;//机器人
    let 群管002_83 = `关闭「入群审核」事件后，加群申请不再经 MK 处理（代码直接 return null）`;
    let 群管002_35 = `接下来是「受邀同意」：全局事件，主人用「开启受邀同意」打开`;
    let 群管002_36 = `开启受邀同意`;//操作者
    let 群管002_37 = `这就把【受邀同意】给开启！`;//机器人
    let 群管002_38 = `开启后：任意群内有人邀请机器人进群（invite 请求）时，会自动在后台同意
不校验目标群授权，也不受 group_of 限制；通常不会有群内文字回复`;
    let 群管002_39 = `「入群验证」发生在新人已成功进群之后，需开启事件「入群验证」`;
    let 群管002_40 = `开启入群验证`;//操作者
    let 群管002_41 = `这就把【入群验证】给开启！`;//机器人
    let 群管002_42 = `设置入群验证次数5`;//操作者
    let 群管002_43 = `好哒！这就把入群验证的【次数】参数改成「5」`;//机器人
    let 群管002_44 = `设置入群验证时长300`;//操作者
    let 群管002_45 = `好哒！这就把入群验证的【时长】参数改成「300」`;//机器人
    let 群管002_46 = `【场景·新人进群】QQ(${mkDemoNewbieQq}) 主动进群（非管理/群主邀请），触发数字验证`;
    let 群管002_47 = ` (${mkDemoNewbieQq})
请在5分钟内发送一下内容进行验证是否活人！
------------------
[验证内容]:8364
[可以机会]:5次
------------------
[现在时间]:2026-06-26 12:00:00
[截止时间]:2026-06-26 12:05:00`;//机器人（含头像）
    let 群管002_48 = `新人需在时限内发送验证码；管理员/群主邀请进群的人可免验证
另有事件「禁言免验」（默认开启）：本群处于全体禁言时（group_all_shut≠0），不发验证码、直接视为通过`;
    let 群管002_85 = `【场景·全体禁言免验】群已开全体禁言 +「禁言免验」开启 +「入群验证」开启时，新人进群不会收到验证码，审核状态保持「无」，后续欢迎语仍可正常发送；若关闭「禁言免验」则全体禁言下仍会验证`;
    let 群管002_49 = `5827`;//新人·输错验证码
    let 群管002_50 = `@${mkDemoNewbieQq} (${mkDemoNewbieQq})
验证码错误！
你的验证码是:8364
剩余验证次数:4`;//机器人
    let 群管002_51 = `8364`;//新人·验证正确
    let 群管002_52 = `验证通过后状态变为「已通过」，新人可正常发言；输错时错误消息会被撤回`;
    let 群管002_53 = `【场景·验证失败】若用完次数仍未通过，机器人会通报并踢出：
【通报】
[用户]:${mkDemoNewbieQq}
在规定次数内未成功验证，已处理！`;//机器人
    let 群管002_54 = `【场景·超时未验】超过「设置入群验证时长」仍未通过，同样会通报并处理`;
    let 群管002_55 = `取消入群验证${mkDemoNewbieQq}`;//操作者
    let 群管002_56 = `好哒！这就给「${mkDemoNewbieQq}」取消本次验证！`;//机器人
    let 群管002_57 = `最后是「入群私聊」：配置指令必须在机器人私聊发送（群聊发无效），且「不支持」管理模式
新人进群后按概率私聊发送已收录内容；须先开启事件「入群私聊」`;
    let 群管002_58 = `开始记录1082631686`;//操作者·私聊
    let 群管002_59 = `已开启收录，请在300秒内发送内容进行收录！当前收录群号为「1082631686」`;//机器人
    let 群管002_60 = `欢迎加入本群！请先阅读群规～`;//操作者·私聊·收录内容
    let 群管002_61 = `记录成功！`;//机器人
    let 群管002_62 = `结束记录`;//操作者·私聊
    let 群管002_63 = `已结束本次收录！`;//机器人
    let 群管002_64 = `查看记录内容1082631686`;//操作者·私聊
    let 群管002_65 = `（机器人将按收录顺序，逐条回放私聊内容）`;//旁白
    let 群管002_66 = `设置入群私聊概率1082631686 80%`;//操作者·私聊
    let 群管002_67 = `入群私聊概率已更新
══════════════
群号：1082631686
概率：80%
存储值：0.8`;//机器人
    let 群管002_68 = `开启入群私聊`;//操作者·群聊
    let 群管002_69 = `这就把【入群私聊】给开启！`;//机器人
    let 群管002_70 = `【场景·新人进群】QQ(${mkDemoNewbieQq}) 进群且概率命中时，机器人会私聊发送已收录内容`;
    let 群管002_71 = `欢迎加入本群！请先阅读群规～`;//机器人·私聊发给新人
    let 群管002_84 = `小总结：
· 加群把关 → 开「入群审核」→ 设模式/答案/次数/条件库/过滤词 → 等申请自动处理
· 防广告号 → 入群验证（进群后验证码）与入群审核可叠加使用
· 全体禁言群 → 「禁言免验」默认开，禁言中不发验证码；要强制验证可关闭禁言免验
· 拉 bot 进群 → 开「受邀同意」（全局，仅 invite 请求）
· 迎新私聊 → 私聊「开始记录」收录 → 设概率 → 开「入群私聊」
· 过滤词 > 其他检测；重复设同一条件模式会提示「目前本群设置的条件是一样的啦～！」`;
    //群管系统_003
    let 群管003_1 = `【群管系统·003】头衔系统
这一模块改的是 QQ 群「专属头衔」（special_title），就是显示在群名片昵称旁边的那一小段字，不是改群昵称，也不是改 QQ 昵称哦～`;
    let 群管003_2 = `菜单里分成两块：
①【头衔系统·自助】—— 群成员自己改自己的，需开事件「自助头衔」
②【头衔系统·指令】—— 管理批量改别人的，需主人/群管权限
══════════════
 - 我要头衔[内容]
 - 设置头衔@人 [内容]
 - 全员头衔[内容]（也支持「全体头衔」，效果一样）`;
    let 群管003_3 = `先说「自助头衔」：
它的设计思路是：让普通群友也能自定义头衔，但 MK 不会无条件响应——必须同时满足下面几个条件才会执行`;
    let 群管003_4 = `条件清单：
① 本群已在「事件管理」里开启【自助头衔】
② 本群已通过 MK 授权（未授权整个插件都不工作）
③ 机器人账号在本群有管理员/群主权限（否则改不了别人的专属头衔）
④ 发送者在群内发：我要头衔+想要的内容`;
    let 群管003_5 = `开启自助头衔`;//操作者
    let 群管003_6 = `这就把【自助头衔】给开启！`;//机器人
    let 群管003_7 = `条件都满足后，群友发送「我要头衔萌新一枚」，MK 会调用 set_group_special_title 接口写入
注意：成功时通常【不会有文字回复】，你需要看群名片上头衔有没有变`;
    let 群管003_8 = `【场景·事件未开】如果忘了开「自助头衔」，群友发我要头衔时 MK 会直接忽略（静默，不报错）
所以自助没反应时，先检查事件管理里开关是不是关着的`;
    let 群管003_9 = `我要头衔萌新一枚`;//群员演示
    let 群管003_10 = `（成功时无文字回复，头衔已写入群名片）`;//解说
    let 群管003_11 = `【场景·机器人无权限】若机器人不是本群管理，会明确提示：`;
    let 群管003_12 = `窝好像没有权限给你头衔哎～～`;//机器人
    let 群管003_13 = `【场景·接口异常】若 QQ 侧拒绝（头衔过长、含违禁字符、频率限制等），会返回：`;
    let 群管003_14 = `设置头衔失败：special_title invalid`;//机器人
    let 群管003_15 = `再说管理指令「设置头衔」：
用于群主/主人给指定成员改头衔，和自助不同，它必须【艾特目标】，且需要 checkOwner3 权限（主人，或开启管理模式后的群管/群主）`;
    let 群管003_16 = `设置头衔@288888888 群管大佬`;//操作者
    let 群管003_17 = `已把下面届些仁的头衔都改成一样的啦！
══════════════
1.【288888888】`;//机器人
    let 群管003_18 = `可以同时 @ 多个人，内容写在指令后面，所有人会被设成相同头衔
被 @ 超过 15 人时，结果会以「合并转发」输出，避免一条消息太长`;
    let 群管003_19 = `设置头衔群管大佬`;//操作者·未艾特
    let 群管003_20 = `介个功能需要艾特才能执行哦`;//机器人
    let 群管003_21 = `若机器人本身没有群管权限，同样会提示「窝好像没有权限设置头衔哎～～」`;
    let 群管003_22 = `最后是「全员头衔」（2.0.3 起支持，菜单也写作全体头衔）：
一次性遍历本群成员列表，给所有真人批量设置相同头衔；适合活动统一标识、整群改名场面`;
    let 群管003_23 = `执行逻辑要点：
① 需要主人/群管权限 + 机器人有群管权限
② 会自动拉取 get_group_member_list
③ 官方机器人账号（is_robot=true）会跳过，并在结果里标 ❌
④ 真人成功标 ✅，每处理一个调用一次 set_group_special_title
⑤ 群人数 ≥15 时结果走合并转发`;
    let 群管003_24 = `全员头衔吃瓜群众`;//操作者
    let 群管003_25 = `已对【2】位群友进行头衔更改～
══════════════
✅1.筱筱(288888888)
✅2.路人甲(277777777)
❌3.腾讯管家(2854196310)`;//机器人
    let 群管003_26 = `小总结：
· 想让大家自己玩 → 开「自助头衔」+ 教群友发「我要头衔xxx」
· 想精准改几个人 → 「设置头衔@人 内容」
· 想全群统一 → 「全员头衔内容」
· 三种方式都依赖机器人有管理权限，这是 QQ 接口硬性要求，不是 MK 故意刁难～`;
    //群管系统_004
    let 群管004_1 = `【群管系统·004】清理骨灰
「骨灰」= 长期不发言的群成员。MK 会扫描全群 last_sent_time，按未发言时长筛出目标成员，供你核对后再踢`;
    let 群管004_2 = `本模块全部指令（需主人/群管权限 + 本群已授权）：
 - 获取骨灰群员列表（默认标准，初始7天，可用「设置骨灰获取标准」修改）
 - 获取七日骨灰群员列表（固定7天）/ 获取半月骨灰群员列表（固定15天）/ 获取一月骨灰群员列表（固定30天）
 - 设置骨灰获取标准[数值][天|月]（天×86400、月×30×86400；不带单位则为秒，范围3600秒~365天）
 - 查看骨灰群员列表
 - 取消骨灰群员QQ[QQ号]
 - 取消骨灰群员序号[序号] / [序号]-[序号]
 - 确定清理全部骨灰群员
 - 提醒骨灰群员 / 提醒骨灰群员[内容]`;
    let 群管004_3 = `推荐标准流程（菜单里也写了）：
① 获取骨灰群员 → ② 查看列表确认 → ③ 有误则取消部分 → ④ 确定清理全部骨灰群员
⑤ 想先温和提醒可发「提醒骨灰群员」，通过群来源临时会话私聊`;
    let 群管004_4 = `重要：「获取」会先清空旧列表再重新扫描；「查看」只读当前缓存，不会重新拉群
数据保存在：筱筱吖/群管系统/清理骨灰/群号/目前数据.json
默认标准保存在：筱筱吖/群管系统/清理骨灰/群号/获取标准.json（字段「秒数」，默认604800）`;
    let 群管004_5 = `第一步：获取符合条件的长期潜水成员`;
    let 群管004_6 = `获取骨灰群员列表`;//操作者
    let 群管004_7 = `筛选标准：默认
共计有【2】位高冷人士
══════════════
1.潜水王(288888888)(12天)
2.路人甲(277777777)(9天)
══════════════`;//机器人
    let 群管004_8 = `筛选标准说明：
 · 获取骨灰群员走本群自定义标准，初始7天
 · 获取七日/半月/一月为固定档位，不受自定义标准影响
 · 设置骨灰获取标准14天 / 2月 / 604800秒均可（范围3600秒~365天）
若全群没有符合当前筛选标准的人，会回复「好像没获取到哎～」
若 ≥15 人，结果会以合并转发输出（标题「你这群这么多啊」）`;
    let 群管004_9 = `第二步：再次查看列表（附带后续可用指令提示）`;
    let 群管004_10 = `查看骨灰群员列表`;//操作者
    let 群管004_11 = `共计有【2】位高冷人士
----------------------
可用指令:
 - 取消骨灰群员QQ[QQ号]
 - 取消骨灰群员序号[序号]
 - 取消骨灰群员序号[序号]-[序号]
 - 确定清理全部骨灰群员
 - 提醒骨灰群员
 - 提醒骨灰群员[内容]
══════════════
1.潜水王(288888888)(12天)
2.路人甲(277777777)(9天)
══════════════`;//机器人
    let 群管004_12 = `若还没获取过就查看，会提示：
「木有数据哎～！你先去「获取骨灰群员」八～！」`;
    let 群管004_13 = `第三步（可选）：从待清理列表里排除误伤的人
支持按 QQ 精确删除，或按序号/序号区间批量删除`;
    let 群管004_14 = `取消骨灰群员QQ277777777`;//操作者
    let 群管004_15 = `这就把【277777777】给取消啦！你再看看列表吧！`;//机器人
    let 群管004_16 = `「取消骨灰群员序号1-2」也可一次删一段序号（演示略，逻辑同单条删除）`;
    let 群管004_17 = `第四步：确认无误后执行踢出
会跳过身份 ≥ 机器人的成员（群主/同级管理踢不掉），只踢权限允许的`;
    let 群管004_18 = `确定清理全部骨灰群员`;//操作者
    let 群管004_19 = `共有效清理【1】位骨灰
══════════════
1.【288888888】✅
══════════════`;//机器人
    let 群管004_20 = `【场景·机器人无权限】若机器人不是群管：
「窝好像没有权限清理吧？～～」`;
    let 群管004_21 = `【场景·全员权限不足】若列表里每个人都踢不了：
「可能是权限不足，导致列表页面我一个人都清不了！」
执行成功后列表文件会被清空，需要重新「获取」`;
    let 群管004_22 = `第五步（可选）：「提醒骨灰群员」（2.2.8 新增）
不踢人，改为通过【群来源临时会话】私聊提醒活跃；自定义文案用：
提醒骨灰群员你好呀，好久不见～ 或 提醒骨灰群员(内容)`;
    let 群管004_23 = `提醒前条件：
① 已有获取到的骨灰列表
② 群设置允许「群内发起临时会话」
③ 自动跳过群主、管理员、机器人`;
    let 群管004_24 = `提醒骨灰群员`;//操作者
    let 群管004_25 = `开始提醒骨灰群员啦～
总列表:1 人
可提醒:1 人
预计额外等待:0 秒（列表≤20，不启用延迟）`;//机器人
    let 群管004_26 = `（随后机器人私聊目标：默认文案为「喂喂喂，你还在嘛？群聊:1082631686 提醒你要活跃一下咯~」）`;//解说
    let 群管004_27 = `提醒结束后输出总结，含成功/失败/跳过明细；列表 >10 人时总结走合并转发
列表 >20 人时，每成功提醒 10 人额外延迟 2 秒防风控`;
    let 群管004_28 = `骨灰提醒执行完成
══════════════
[总列表] 1
[可提醒] 1
[成功] 1
[失败] 0
══════════════
【发送明细】
1.【288888888】✅
══════════════`;//机器人
    let 群管004_29 = `小总结：
· 想清潜水 → 获取 → 查看 → 确定清理
· 想给机会 → 先提醒骨灰群员，再观察一段时间
· 踢人/提醒都需要机器人有足够权限，且操作不可逆，建议先看列表再动手～`;
    //群管系统_005
    let 群管005_1 = `【群管系统·005】黑名单系统（2.0.6-alpha.1 新增）
维护「不想让其留在群里 / 禁止再次入群」的人员名单，分【本群】与【全局】两套数据`;
    let 群管005_2 = `本模块全部指令（增删改需主人/群管；全局操作需机器主人）：
↓查看↓ 黑名单列表 / 全局黑名单列表 / 本群黑名单列表 / 查黑名单[QQ]
↓增删↓ 添加本群黑名单@人 / 添加全局黑名单[QQ] / 删除本群黑名单[QQ] / 清空黑名单 / 清空全局黑名单
↓设置↓ 设置本群黑名单处理[踢出|黑踢] / 设置全局黑名单处理[踢出|黑踢]`;
    let 群管005_3 = `前置条件：事件【黑白名单】必须开启，否则添加/删除/清空指令会被静默忽略（无回复）
列表查看不受此限；自动拦截（发言/进群/加群申请）也依赖该事件`;
    let 群管005_4 = `开启黑白名单`;//操作者
    let 群管005_5 = `这就把【黑白名单】给开启！`;//机器人
    let 群管005_6 = `数据存储：
· 全局 → 筱筱吖/群管系统/黑白名单/全局/人员.json
· 本群 → 筱筱吖/群管系统/黑白名单/群聊/群号/人员.json
处理方式（踢出/黑踢）各存一份 处理方式.json`;
    let 群管005_7 = `「踢出」= 普通移出群聊；「黑踢」= 踢出并勾选拒绝再次加群（QQ 自带拦截）
默认均为【踢出】，可按本群/全局分别设置`;
    let 群管005_8 = `先看本群名单（「黑名单列表」与「本群黑名单列表」等价，省略前缀时默认本群）`;
    let 群管005_9 = `本群黑名单列表`;//操作者
    let 群管005_10 = `当前选择【本群】黑名单
共计人数【1】
══════════════
1.【288888888】
══════════════`;//机器人
    let 群管005_11 = `若名单为空，会回复：
「我好像没找到「本群」黑名单的人唉～？是不是没有啊～」
≥15 人时走合并转发（标题「黑名单列表」）`;
    let 群管005_12 = `跨群封禁用全局名单；仅本群生效则用本群名单
查看全局：发「全局黑名单列表」`;
    let 群管005_13 = `查黑名单可一次看某 QQ 在全局/本群是否上榜（需群管权限）`;
    let 群管005_14 = `查黑名单288888888`;//操作者
    let 群管005_15 = `黑名单 查询结果:
══════════════
查询目标：288888888
[全局黑名单]：false
[本群黑名单]：true
══════════════`;//机器人
    let 群管005_16 = `添加方式一：@ 目标（适合本群在场成员）
添加时会立刻按当前处理方式踢出，并写入名单`;
    let 群管005_17 = `已把下列人员添加至【本群】黑名单列表
══════════════
1.【288888888】✅新增
══════════════`;//机器人（@添加后）
    let 群管005_18 = `添加方式二：直接写 QQ 号（全局/本群均可）
例：添加全局黑名单277777777 — 需机器主人权限`;
    let 群管005_19 = `添加全局黑名单277777777`;//操作者
    let 群管005_20 = `✅已将【277777777】纳入「全局」黑名单列表！`;//机器人
    let 群管005_21 = `若已在名单中重复添加，会提示：
「❌【288888888】已存在于「本群」黑名单啦～」`;
    let 群管005_22 = `删除本群黑名单288888888`;//操作者
    let 群管005_23 = `✅好的，这就把【288888888】从「本群」黑名单移出！`;//机器人
    let 群管005_24 = `若本来就不在名单里：
「❌【288888888】本来就不在「本群」黑名单里面啦～！」
清空：「清空黑名单」清本群，「清空全局黑名单」清全局 → 「好叭～这就把「xxx」黑名单给清空～～」`;
    let 群管005_25 = `设置处理方式示例（本群改为黑踢）`;
    let 群管005_26 = `设置本群黑名单处理黑踢`;//操作者
    let 群管005_27 = `好哒！这就把「本群」黑名单的处理方式变为【黑踢】！`;//机器人
    let 群管005_28 = `若已是目标方式，会提示：
「目前的「本群」黑名单处理方式已经是【黑踢】啦！」`;
    let 群管005_29 = `【自动拦截·发言】事件开启后，黑名单成员在群内发言 → 机器人权限足够则踢出（按处理方式）并撤回该消息`;
    let 群管005_30 = `【自动拦截·已入群】黑名单成员已在群内（如刚被添加后未踢成功）→ 入群通知流程中再次踢出`;
    let 群管005_31 = `【自动拦截·加群申请】黑名单用户申请加群 → 直接拒绝，理由「你是黑名单用户！」
（与入群审核可叠加，黑名单优先）`;
    let 群管005_32 = `小总结：
· 本群封禁 vs 全局封禁，按场景选 scope
· 先开事件「黑白名单」，再维护名单
· 黑踢比踢出更狠，适合彻底拒之门外的账号
· 机器人需有管理权限且身份高于目标，否则只能存名单无法执行踢出～`;
    //群管系统_006
    let 群管006_1 = `【群管系统·006】违禁词系统（2.0.8-alpha.1 新增核心 · 含禁发/发言限制）
维护本群敏感词库，命中后按配置【撤回 / 禁言 / 撤回禁言】处理；进阶能力需事件「进阶检测」`;
    let 群管006_2 = `【违禁词】相关事件「违禁检测」
 - 违禁词列表 / 添加违禁词[内容] / 删除违禁词[内容] / 清空违禁词
 - 设置违禁处理禁言|撤回|撤回禁言 / 设置违禁处理禁言时长[秒数]`;
    let 群管006_3 = `【禁发】相关事件「进阶检测」（与违禁词共用处理方式）
 - 开启|关闭禁发图片/视频/语音/卡片/合并转发`;
    let 群管006_4 = `【限制文本发送】同样依赖「进阶检测」
 - 发言限制 字数/行数/艾特 [数字] 或 发言限制 [字数] [行数] [艾特]
 - 查看发言限制（0 = 不限制该项）`;
    let 群管006_5 = `第一步：开启事件「违禁检测」，否则词库配置后也不会自动拦截发言`;
    let 群管006_6 = `开启违禁检测`;//操作者
    let 群管006_7 = `这就把【违禁检测】给开启！`;//机器人
    let 群管006_8 = `数据路径：
· 词库 → 筱筱吖/群管系统/违禁系统/群号/违禁词.json
· 处理 → 同目录 处理.json（方式默认「撤回」，禁言时长默认 600 秒）
匹配方式：消息全文 includes 词库条目（子串命中即触发）`;
    let 群管006_9 = `添加违禁词（支持 添加/新增/增加 同义）`;
    let 群管006_10 = `添加违禁词广告`;//操作者
    let 群管006_11 = `我这就去添加违禁词！
【新增】: 广告`;//机器人
    let 群管006_12 = `重复添加会提示：「emmmm，介个违禁词好像也就有了哎～」
删除/取消/减少违禁词[内容]、清空违禁词 同理维护词库`;
    let 群管006_13 = `违禁词列表`;//操作者
    let 群管006_14 = `共计【2】个违禁词
当前处理方式 :【撤回】
当前禁言时长 :【600秒】
══════════════
【1】: 广告
【2】: 抽奖
══════════════`;//机器人
    let 群管006_15 = `词库为空时：「介个群好像木有添加违禁词哎」
≥10 个词走合并转发（标题「违禁词列表」）`;
    let 群管006_16 = `删除违禁词广告`;//操作者
    let 群管006_17 = `我这就去把介个违禁词给ban了！
【删除】: 广告`;//机器人
    let 群管006_18 = `第二步：设定命中后的处置方式`;
    let 群管006_19 = `设置违禁处理撤回禁言`;//操作者
    let 群管006_20 = `好哒～！这就把违禁词的处理方式改成【撤回禁言】
下一次即可触发了哦～`;//机器人
    let 群管006_21 = `若已是当前方式：「现在已经是【撤回禁言】的处理方式啦！补药再改啦！」
单独改禁言秒数：设置违禁处理禁言时长1200 → 「好哒！这就把违禁词的禁言时长改成【1200】秒！」`;
    let 群管006_22 = `【自动拦截·违禁词】事件开启后，普通文本消息命中词库 → 静默执行（无机器人回复）
机器人需群管且身份高于发言者；默认撤回，禁言/撤回禁言按 处理.json 执行`;
    let 群管006_23 = `第三步（可选）：「进阶检测」——禁发 + 合并转发内违禁词 + 发言限制`;
    let 群管006_24 = `开启进阶检测`;//操作者
    let 群管006_25 = `这就把【进阶检测】给开启！`;//机器人
    let 群管006_26 = `禁发与违禁词共用同一套处理方式（撤回/禁言/撤回禁言）
例：禁止群友发图片`;
    let 群管006_27 = `开启禁发图片`;//操作者
    let 群管006_28 = `好哒！本群【禁发图片】已开启～`;//机器人
    let 群管006_29 = `已开启的禁发类型命中后，同样按违禁处理方式执行；已是目标状态会提示「【禁发图片】已经是开启状态啦～」`;
    let 群管006_30 = `发言限制：控制单条消息的字数、行数、艾特人数上限`;
    let 群管006_31 = `发言限制 50 20 3`;//操作者（字数50 行数20 艾特3）
    let 群管006_32 = `✅ 发言限制设置完成
字数上限：50（0=不限制）
行数上限：20（0=不限制）
艾特上限：3（0=不限制）`;//机器人
    let 群管006_33 = `也可单项设置，如「发言限制 字数 50」→ 「✅ 字数已设置为50，0代表关闭该限制」`;
    let 群管006_34 = `查看发言限制`;//操作者
    let 群管006_35 = `📊本群发言限制配置
字数：50字
行数：20行
艾特：3人`;//机器人
    let 群管006_36 = `超限发言会被撤回（需机器人权限高于发言者）；不会额外 @ 提示
合并转发消息内的文本也会扫违禁词（需 NapCat 开启「启用上报解析合并消息」）`;
    let 群管006_37 = `小总结：
· 敏感词 → 开「违禁检测」→ 维护词库 → 设处理方式
· 禁图/禁卡片等 → 开「进阶检测」→ 禁发指令
· 控刷屏长度 → 「进阶检测」+ 发言限制
· 触发后均为静默处理，不会群里公告谁触发了～`;
    //群管系统_007
    let 群管007_1 = `【群管系统·007】群聊发言统计（2.1.4 新增）
开启后自动记录本群每人每日发言条数，支持查看今日/昨日/本月排行，以及个人历史汇总`;
    let 群管007_2 = `本模块指令（需本群已授权）：
 - 发言排行今日榜
 - 发言排行昨日榜
 - 发言排行七日榜
 - 发言排行本月榜
 - 发言排行个人榜`;
    let 群管007_3 = `前置：事件「发言统计」必须开启，否则不会写入数据
开启后从当下起计数，历史消息不会回溯补录`;
    let 群管007_4 = `开启发言统计`;//操作者
    let 群管007_5 = `这就把【发言统计】给开启！`;//机器人
    let 群管007_6 = `数据存储：筱筱吖/扩展功能/发言统计/群号/次数统计/YYYY-MM-DD.json
每条群消息触发时，对应 QQ 当日计数 +1（静默后台写入，无回复）`;
    let 群管007_7 = `注意：若有人极速刷屏，频繁写文件可能导致计数异常甚至文件被重置，事件说明里也有提醒～`;
    let 群管007_8 = `查看今日活跃排行`;
    let 群管007_9 = `发言排行今日榜`;//操作者
    let 群管007_10 = `共计有【3】人，消息总数:42
══════════════
【1】864264375 : 18条
【2】288888888 : 15条
【3】2071521294 : 9条`;//机器人
    let 群管007_11 = `今日无人发言时：「好像木有获取到数据哎！？」
≥15 人时走合并转发（标题「今日发言统计」）`;
    let 群管007_12 = `查看昨日数据`;
    let 群管007_13 = `发言排行昨日榜`;//操作者
    let 群管007_14 = `共计有【2】人，消息总数:28
══════════════
【1】864264375 : 16条
【2】288888888 : 12条`;//机器人
    let 群管007_15 = `昨日无数据：「昨日暂无数据！」
「发言排行七日榜」会汇总最近 7 天；「发言排行本月榜」从当月 1 号累计到今天`;
    let 群管007_16 = `查看本月累计`;
    let 群管007_17 = `发言排行本月榜`;//操作者
    let 群管007_18 = `共计有【3】人，消息总数:156
══════════════
【1】864264375 : 72条
【2】288888888 : 54条
【3】2071521294 : 30条`;//机器人
    let 群管007_19 = `「发言排行个人榜」= 查【发指令者本人】在各时间段的发言数，不是全群排行`;
    let 群管007_20 = `发言排行个人榜`;//操作者
    let 群管007_21 = `我的发言:
今日: 18
本周: 45
本月: 120
本年: 120
--------------
昨日: 12
上周: 30
上月: 85
总次: 520`;//机器人
    let 群管007_22 = `个人榜无历史文件时：「获取数据失败了唉！」
排行指令不需要群管权限，群员也可查自己的个人榜～`;
    let 群管007_23 = `小总结：
· 想统计活跃度 → 开「发言统计」→ 等群友正常聊天积累数据
· 看全群谁最话痨 → 今日/昨日/本月榜
· 看自己发了多少 → 个人榜
· 数据按天存文件，删文件 = 丢历史记录～`;
    //群管系统_008
    let 群管008_1 = `【群管系统·008】新用户入群欢迎（2.1.5 由「入群图片」更名并纳入群管）
新人成功进群后，机器人自动发送可自定义的欢迎语（文字 / 可选图片版）`;
    let 群管008_2 = `本模块指令（需主人/群管 + 本群已授权）：
 - 设置入群欢迎词#[内容]
相关事件【入群欢迎】`;
    let 群管008_3 = `可用变量（写在 # 后面自由搭配）：
[艾特] [本机头像] [新人头像] [新人QQ] [昵称] [群号] [时间] [性别] [年龄] [等级] [注册时间]`;
    let 群管008_4 = `第一步：开启事件「入群欢迎」`;
    let 群管008_5 = `开启入群欢迎`;//操作者
    let 群管008_6 = `这就把【入群欢迎】给开启！`;//机器人
    let 群管008_7 = `未自定义时默认模板：
[艾特] ([新人QQ])欢迎你的加入
[时间]
保存在：筱筱吖/群管系统/入群欢迎词/群号.json`;
    let 群管008_8 = `第二步：按需修改欢迎语（# 后面整段为模板，支持换行）`;
    let 群管008_9 = `设置入群欢迎词#[艾特] 欢迎[昵称]([新人QQ])加入[群号]，你是在[时间]加入的`;//操作者
    let 群管008_10 = `好哒！这就把本群的【入群欢迎语】设置为:
[艾特] 欢迎[昵称]([新人QQ])加入[群号]，你是在[时间]加入的`;//机器人
    let 群管008_11 = `字数须 >2，否则提示「请字数大于2个哦～」
QQ 会把 [ ] 转成 HTML 实体，MK 写入前会自动反转义还原`;
    let 群管008_12 = `【触发时机】监听 group_increase（已入群通知）
需同时满足：
① 事件「入群欢迎」开启
② 未被黑名单拦截（放行标准=true）
③ 入群审核状态为「无」或「已通过」（刚通过验证的新人也欢迎）`;
    let 群管008_13 = `【场景·新人进群】QQ(288888888) 完成入群流程后，机器人在群内发送欢迎（演示）`;
    let 群管008_14 = `@288888888 欢迎筱筱(288888888)加入1082631686，你是在2026-06-26 14:30:00加入的`;//机器人（文字版示意）
    let 群管008_15 = `变量 [昵称][性别][年龄][等级][注册时间] 来自 get_stranger_info 接口
[艾特]/[本机头像]/[新人头像] 会转成对应消息段（艾特、图片）`;
    let 群管008_16 = `【图片版（可选）】config.json 里 图片渲染 = true 时：
先用 Puppeteer 或 Python 渲染「入群身份.html」生成身份卡图，再拼接文字欢迎段
关闭图片渲染则仅发文字版`;
    let 群管008_17 = `与「入群验证」「入群审核」的关系：
· 黑名单/审核拒绝 → 不会欢迎
· 入群验证通过后才进群 → 仍会欢迎
· 仅「入群私聊」走私聊通道，与本模块独立`;
    let 群管008_18 = `小总结：
· 开「入群欢迎」→ 设置入群欢迎词#模板
· 想带头像/艾特 → 用 [新人头像][艾特] 等变量
· 想身份卡大图 → 开图片渲染（进阶设置）
· 改模板后立即生效，下一次新人进群就会用新文案～`;
    //群管系统_009
    let 群管009_1 = `【群管系统·009】群昵称马甲格式系统（2.2.5 新增）+ 锁名系统
给群成员群名片统一加「前缀 + 原名」，例如前缀「天宫☆」+ 原名「小明」→「天宫☆小明」
本模块后半部分是「锁名系统」：只针对个体用户锁定群名片`;
    let 群管009_2 = `本模块指令（需主人/群管 + 本群已授权）：
 - 设置马甲内容[内容]
 - 全员马甲[内容]
相关事件【马甲系统】`;
    let 群管009_3 = `前缀长度限制：1～18 字（超出或为空 →「请将内容控制在1 - 18个字之间！」）
默认前缀（未设置时）：天宫☆
存储：筱筱吖/群管系统/马甲系统/群号.json`;
    let 群管009_4 = `第一步：开启事件「马甲系统」—— 之后成员每次发言会静默检查并修正群名片`;
    let 群管009_5 = `开启马甲系统`;//操作者
    let 群管009_6 = `这就把【马甲系统】给开启！`;//机器人
    let 群管009_7 = `【自动修正·发言时】事件开启后，若当前群名片 ≠ 前缀+QQ昵称，且机器人有群管权限 → 自动 set_group_card 修正（无回复）`;
    let 群管009_8 = `第二步：设置本群马甲前缀（只改配置，不会立刻批量改名）`;
    let 群管009_9 = `设置马甲内容天宫☆`;//操作者
    let 群管009_10 = `已将本群的马甲前缀改成「天宫☆」啦！`;//机器人
    let 群管009_11 = `与原来相同会提示：「与原来的一样啦！不可以重复设置哦～」`;
    let 群管009_12 = `第三步（可选）：「全员马甲」= 立刻对全群批量改名，并写入前缀配置
⚠️ 执行过程中切勿取消机器人权限！`;
    let 群管009_13 = `全员马甲天宫☆`;//操作者
    let 群管009_14 = `正在执行改名，切勿把机器人的权限给下了！！！
（≥10 人时会提示采取冷却，并给出预计完成时间）`;//机器人（前置提示）
    let 群管009_15 = `「全员马甲」- 数据直接:
══════════════
有效人次：28
无效人次：2
跳过人次：5`;//机器人（合并转发·总结节点）
    let 群管009_16 = `结束后还会发 3 个嵌套节点：有效列表 / 无效列表 / 跳过列表
· 有效 = 改名成功
· 无效 = 官方机器人或接口失败
· 跳过 = 已是目标名片，无需再改`;
    let 群管009_17 = `机器人无群管权限时：「窝没有权限改名唉～！」
拉取成员失败：「获取群聊成员失败！1」`;
    let 群管009_18 = `小总结：
· 只想新人/发言时慢慢统一 → 开事件 + 设置马甲内容
· 想立刻全群统一 → 全员马甲（记得保持机器人权限）
· 前缀基于 QQ 昵称拼接，改 QQ 昵称后下次发言会再修正～`;
    let 群管009_19 = `【进阶联动】「马甲系统」+「进阶检测」同时开启时，昵称里的违禁词不会被拼进群名片：
· 昵称含违禁词（精准或模糊命中都算）→ 用「马甲 + QQ号」
· 连 QQ 号也命中违禁词（违禁词是数字时）→ 用「马甲 + -」，例如前缀「天外」→「天外-」
· 免死金牌名单成员（含开启「管理员免死金牌」时的本群管理员）豁免该兜底，仍是「马甲 + 原名」
· 只开马甲系统、没开进阶检测时不启用该兜底`;
    let 群管009_20 = `【锁名系统】同模块的第二个功能：按「个体用户」锁定群名片
名单存：筱筱吖/群管系统/锁名系统/群号/名单.json
优先级高于马甲系统 —— 已锁名的人不再套马甲、全员马甲也会跳过他`;
    let 群管009_21 = `本功能指令（需主人/群管 + 本群已授权 + 事件「锁名系统」开启）：
 - 添加锁名@人 [名字]（可艾特多人，一次性全部锁同一个名字）
 - 更改锁名@人 [名字]（不在名单里会自动添加）
 - 取消锁名@人（也可直接写 QQ 号）
 - 获取锁名列表 / 清空锁名列表
名字限制 1～18 字；命中本群违禁词会直接取消本次命令`;
    let 群管009_22 = `开启锁名系统`;//操作者
    let 群管009_23 = `这就把【锁名系统】给开启！`;//机器人
    let 群管009_24 = `添加锁名@288888888@188888888 天外来客`;//操作者
    let 群管009_25 = `锁名添加完成～有效【2】人
锁定名称：天外来客
══════════════
1.【288888888】✅已加入锁名，群名片已改
2.【188888888】✅已更新锁名，群名片已改`;//机器人
    let 群管009_26 = `名字命中违禁词时：「这个名字命中了本群违禁词，不给设置哦～本次命令已取消！」
机器人没有管理权限时：名单照样写入，但结果里会写「但窝没有管理权限改不了名片」`;
    let 群管009_27 = `获取锁名列表`;//操作者
    let 群管009_28 = `本群锁名列表
══════════════
名单人数：2
1. 288888888 → 天外来客
2. 188888888 → 天外来客
══════════════`;//机器人
    let 群管009_29 = `小总结：
· 全群统一格式 → 马甲系统；只治个别人 → 锁名系统
· 锁名后对方自己改名片，下次发言会被机器人改回锁定名称
· 不想管了 → 取消锁名@人；一键清空 → 清空锁名列表～`;
    //群管系统_010
    let 群管010_1 = `【群管系统·010】刷屏检测（双窗口 · 权限门控 · 内存计数）
检测短时间连发与慢速持续刷；文本/表情/图片/语音/视频/卡片等均按消息条数计`;
    let 群管010_2 = `本模块指令（需主人/群管 + 本群已授权）：
 - 查看刷屏检测
 - 设置刷屏间隔 [秒] / 设置刷屏次数 [条]
 - 设置慢刷窗口 [秒] / 设置慢刷次数 [条]
 - 设置刷屏禁言 [分钟]
相关事件【刷屏检测】`;
    let 群管010_3 = `默认参数：短 10 秒 6 条 · 长 60 秒 12 条 · 禁言 600 秒
正常聊天约 1 条/40 秒～10 条/分钟；仅机器人身份高于发言者时生效`;
    let 群管010_4 = `第一步：开启事件「刷屏检测」（或 WebUI → 开关管理 → 刷屏配置）`;
    let 群管010_5 = `开启刷屏检测`;//操作者
    let 群管010_6 = `这就把【刷屏检测】给开启！`;//机器人
    let 群管010_7 = `查看刷屏检测`;//操作者
    let 群管010_8 = `📊 本群刷屏检测
【事件】✅开启
【短窗口】10 秒内 6 条
【长窗口】60 秒内 12 条
【禁言】600 秒
【权限】仅机器人身份高于发言者时生效`;//机器人
    let 群管010_9 = `【短窗口·连发】普通成员 10 秒内连发第 6 条 → 静默撤回 + 禁言（争论时 4～5 连发不误伤）`;
    let 群管010_10 = `【长窗口·慢刷】每 3 秒 1 条约 36 秒触发；每秒 1 条约 6 秒由短窗口触发`;
    let 群管010_11 = `【权限】机器人非群管 / 对方群主或同级管理员 → 不计数、不调 API`;
    let 群管010_12 = `WebUI：开关管理 → 点群聊 → 【刷屏配置】→ 开关与五参数 → 保存/重置`;
    let 群管010_13 = `小总结：
· 快刷靠短窗口，慢刷靠长窗口，二者 OR
· 计数在内存，重启插件后窗口清零；配置写 JSON 保留
· 大群可同时关「发言统计」减轻写盘压力～`;
    //发卡系统（用户端）
    let 发卡用户_1 = `【发卡系统·用户端】用娱乐货币「归笺」兑换卡密/兑换码，成功后机器人私聊发货
⚠️ 与「授权系统·使用卡密」完全不同：那是给群/私聊充 MK 插件授权时长，这里是花归笺买虚拟商品
⚠️ 与娱乐「商店 / 禁言卡」也不同：娱乐商店买道具（诱饵、禁言卡）；发卡商店兑换卡密库存`;
    let 发卡用户_2 = `【范围·全服共享】商品、库存、价格全机器人共用一份数据，不是「每个群单独一家店」
存储根目录：筱筱吖/扩展功能/发卡系统/
· 商品代号.json — 商品名 → 内部代号（随机生成）
· 商品价格.json — 商品名 → 归笺单价
· 商品上下架.json — 商品名 → true/false（未记录默认上架）
· data/{代号}.txt — 该商品卡密库存（一行一条，先进先出）
· data/兑换日志.json — 每次兑换记录（时间/QQ/扣款/卡密）`;
    let 发卡用户_3 = `【归笺·也是全局】扣款读写的文件：筱筱吖/娱乐系统/游戏数据/归笺.json
按 QQ 号累计，跨群通用；在 A 群赚到的归笺，在 B 群也能用来兑换
归笺来源示例：签到、幸运轮盘、钓鱼、商店相关玩法等（见娱乐系统相关指令）`;
    let 发卡用户_4 = `【在哪能用】用户指令「发卡系统 / 发卡商店 / 兑换商品」群聊、私聊均可，无需 @
前提：当前会话须已授权（群未授权时匹配指令会静默无回复；私聊未授权同理）
发「发卡系统」可收 3 条合并菜单（总览 / 用户说明 / 管理员说明）`;
    let 发卡用户_5 = `发卡系统`;//操作者
    let 发卡用户_6 = `（机器人回复合并转发 3 条）
🎴 菜单总览 · 👤 用户说明（商店/兑换）· 🔐 管理员说明（维护指令）`;//机器人
    let 发卡用户_7 = `【浏览商店】只展示「已上架」商品；未定价显示「-」；已下架的在商店里完全不出现`;
    let 发卡用户_8 = `发卡商店`;//操作者
    let 发卡用户_9 = `🛒 发卡商店（仅展示上架商品）
══════════════
📦 月卡
💰 价格：500 归笺
📊 库存：12 条
──────────────
📦 测试商品1
💰 价格：-
📊 库存：0 条
══════════════
💡 购买：兑换商品 商品名 数量
📖 完整说明：发卡系统`;//机器人
    let 发卡用户_10 = `【兑换格式】兑换商品 商品名称 数量
例：兑换商品 月卡 1
数量须为 ≥1 的整数；商品须存在 + 已上架 + 已定价 + 库存足够 + 归笺足够，缺一不可`;
    let 发卡用户_11 = `兑换商品 月卡 1`;//操作者（群聊示例）
    let 发卡用户_12 = `✅ 兑换成功！卡密已通过私聊发送，请打开与机器人的私信查看。
已扣 500 归笺，剩余 1200`;//机器人（群聊提示）
    let 发卡用户_13 = `✅ 兑换成功（发卡系统）
══════════════
🛍️ 月卡 × 1
💰 已扣 500 归笺（单价 500）
📬 卡密如下，请妥善保管：
1. AAAA-BBBB-1111
══════════════
💠 当前剩余归笺：1200`;//机器人（私聊卡密正文）
    let 发卡用户_14 = `【私聊发货】无论你在群还是私聊发起兑换，卡密都只通过私聊发送（群聊仅提示「已私聊」）
群内需允许成员私聊机器人，否则用户收不到卡密
私聊直接兑换时，只发私聊成功消息，无群提示`;
    let 发卡用户_15 = `常见失败提示：
· 商品「xxx」不存在 — 无此商品，或已下架（下架对用户表现同不存在）
· 尚未定价 — 主人还没「发卡商品定价」
· 归笺不足 — 需要 X，当前 Y
· 库存不足 — 需要 N 条，当前 M 条
· 格式错误 — 须「兑换商品 名称 数量」`;
    let 发卡用户_16 = `兑换商品 不存在商品 1`;//操作者
    let 发卡用户_17 = `商品「不存在商品」不存在`;//机器人
    let 发卡用户_18 = `小总结（用户端）：
· 全服一家店，所有已授权群/私聊看到相同商品与库存
· 用全局归笺购买，成功后私聊收卡密
· 速查：发卡商店看货 → 兑换商品 名 数量
· 完整维护流程见 MK介绍「发卡系统·管理端」～`;
    //发卡系统（管理端）
    let 发卡管理_1 = `【发卡系统·管理端】仅机器主人可维护商品与卡密（checkOwner3，不受「管理模式」加成）
群聊、私聊均可发维护指令；唯一例外：「查看商品列表」必须私聊（含卡密明细，避免群里泄露）`;
    let 发卡管理_2 = `【与群无关】在任意群或私聊添加的商品，全服立即可见；在 A 群填充的库存，B 群用户兑换也会从同一文件扣
因此：这是机器人级「总仓」，适合统一发卡/卖码，不适合「每个群不同商品表」场景`;
    let 发卡管理_3 = `══════════════
【商品生命周期·推荐顺序】
① 添加发卡商品 名称 — 登记商品，生成专属代号
② 填充发卡商品 — 首行商品名，下列每行一条卡密
③ 发卡商品定价 名称 价格 — 单位：归笺
④ 发卡商品上架 名称 — 默认未写入上下架表时视为已上架
⑤ 用户即可在「发卡商店」看到并兑换
══════════════`;
    let 发卡管理_4 = `添加发卡商品 月卡`;//操作者
    let 发卡管理_5 = `好啦！已经成功添加这个商品啦，专属代号为ABC123456`;//机器人
    let 发卡管理_6 = `填充发卡商品（多行格式）：
填充发卡商品 月卡
AAAA-BBBB-1111
CCCC-DDDD-2222
会自动去重：与库存重复、同一条消息内重复的行会跳过并统计`;
    let 发卡管理_7 = `填充发卡商品 月卡
AAAA-BBBB-1111
CCCC-DDDD-2222`;//操作者
    let 发卡管理_8 = `已向商品「月卡」添加 2 条数据`;//机器人
    let 发卡管理_9 = `发卡商品定价 月卡 500`;//操作者
    let 发卡管理_10 = `已为「月卡」设定价格：500 归笺`;//机器人
    let 发卡管理_11 = `发卡商品上架 月卡 / 发卡商品下架 月卡
· 上架 → 商店展示且可兑换
· 下架 → 商店不展示，用户兑换时提示「不存在」
未在 商品上下架.json 记录的商品，默认视为上架`;
    let 发卡管理_12 = `发卡商品下架 测试商品`;//操作者
    let 发卡管理_13 = `已将「测试商品」设为下架（商店不展示，用户无法兑换）`;//机器人
    let 发卡管理_14 = `【其它维护指令】
· 修改发卡商品 原名->新名 — 迁移代号与上下架；改名后请重新「发卡商品定价」（价格按商品名存储）
· 清空发卡商品 名称 — 清空该商品全部卡密
· 删除发卡商品 名称 + 下列卡密行 — 按行精确删除
· 查看商品列表 — 仅私聊；合并转发含各商品库存、卡密分页（35条/页）、上下架状态`;
    let 发卡管理_15 = `查看商品列表`;//操作者（须私聊）
    let 发卡管理_16 = `（机器人私聊回复嵌套合并转发）
📋 发卡汇总：种类/在售/下架/库存合计/定价统计
🛒 各商品卡片：代号、定价、库存、状态、卡密明细`;//机器人
    let 发卡管理_17 = `在群里发「查看商品列表」会提示：
📋 「查看商品列表」仅限私聊使用，请私聊机器人发送该指令`;
    let 发卡管理_18 = `【库存机制】兑换时从 data/{代号}.txt 按行先进先出取出；取失败会自动退回归笺
兑换日志写入 data/兑换日志.json，键名：时间戳_QQ`;
    let 发卡管理_19 = `非主人发维护指令 → 静默无回复（不会提示「无权限」）
未授权群/私聊发任何发卡指令 → 静默无回复
速查菜单随时可发「发卡系统」；用户侧见上一节「发卡系统·用户端」～`;
    let 发卡管理_20 = `小总结（管理端）：
· 维护：群聊或私聊均可（查看商品列表→私聊）
· 数据：全服共享，一处上架处处可买，一处扣库存全局生效
· 流程：添加 → 填充卡密 → 定价 → 上架 → 用户兑换
· 与授权卡密、单群配置无关，是独立的扩展商店模块～`;
    let 目录说明_2 = `【MK介绍·下篇】娱乐功能 · 禁言卡 + 扩展 · 发卡系统
══════════════
上篇已发：插件原则、授权系统、事件管理(28项群事件+7项全局)、群管001～010
本篇含：娱乐·禁言卡、发卡系统·用户端、发卡系统·管理端
══════════════
Web 后台可在「扩展功能 → 修改价格 / 发卡系统」调整商店默认价与卡密库存`;

    // 娱乐·禁言卡
    let 禁言卡介绍_1 = `【娱乐·禁言卡】用归笺在「商店」购买禁言卡，再在群里对别人使用
属于娱乐道具玩法，受「深度娱乐」开关控制（关闭后相关指令不响应）`;
    let 禁言卡介绍_2 = `【获取】发「商店」查看今日货架 → 「买#禁言卡 #数量」
禁言卡为双模式商品：先扣个人额度，个人买满后再走全服额度
· 个人档：默认价 888，单天限购 2
· 全服档：默认价 1200，单天限购 15
（默认价与浮动比例可在 Web 后台「扩展功能 → 修改价格」调整）`;
    let 禁言卡介绍_3 = `商店`;//操作者
    let 禁言卡介绍_4 = `（机器人回复今日货架图/合并转发）
含诱饵、禁言卡（个人额度/全服额度）等商品与可买次数`;//机器人
    let 禁言卡介绍_5 = `买#禁言卡 #1`;//操作者
    let 禁言卡介绍_6 = `══════════════
♻️购买成功
✳️购买道具【禁言卡】
🏷️结算档位【个人】
💹购买数量【1】
💠消耗归笺【…】
══════════════`;//机器人
    let 禁言卡介绍_7 = `【使用】群聊发送：使用禁言卡@对方
· 可同时@多人，每人消耗 1 张；重复@只算 1 人；最多 10 人
· 不可空@、不可@全体；从消息 JSON 的 at 段识别，不解析 CQ
· 每人禁言时长独立随机 3～10 分钟
· 只要有成功扣卡，进入 10 分钟冷却（时间戳秒+600）`;
    let 禁言卡介绍_8 = `使用禁言卡@288888888`;//操作者
    let 禁言卡介绍_9 = `禁言卡生效【1】人，消耗【1】张
剩余禁言卡：… 张
冷却：10分钟
══════════════
✅1.288888888:禁言7分钟`;//机器人
    let 禁言卡介绍_10 = `【库存查看】发「我的信息 / 我的货币」可看禁言卡张数
数据路径：筱筱吖/娱乐系统/游戏数据/道具/禁言卡.json
冷却路径：筱筱吖/娱乐系统/游戏数据/道具/禁言卡冷却.json`;
    let 禁言卡介绍_11 = `小总结：
· 先「商店」买卡 → 再「使用禁言卡@人」
· 需机器人有群管权限，且身份高于目标
· 深度娱乐关闭时，购买与使用均不生效
· 与群管指令「禁言@人」无关，这是娱乐道具～`;

    // ================== 构建嵌套转发消息 ==================
    const mkIntroTime = 1782441000;       // 2.3.5.alpha.3 · MK介绍
    const authModuleTime = 1772460000;    // 2.2.0-alpha.1 · 授权系统
    const eventModuleTime = 1770458460;   // 2.0.2 · 事件管理
    const groupManage001Time = 1772544000; // 2.0.3-alpha.1 · 群管系统（模块001）
    const groupManage002Time = 1772544060; // 2.0.3-alpha.1 · 入群审核（模块002）
    const groupManage003Time = 1770458460; // 2.0.2 · 头衔系统（模块003）
    const groupManage004Time = 1770631200; // 2.0.4 · 清理骨灰（模块004）
    const groupManage005Time = 1770729600; // 2.0.6-alpha.1 · 黑名单系统（模块005）
    const groupManage006Time = 1771136400; // 2.0.8-alpha.1 · 违禁词系统（模块006）
    const groupManage007Time = 1772031300; // 2.1.4 · 发言统计（模块007）
    const groupManage008Time = 1772283600; // 2.1.5 · 入群欢迎（模块008）
    const groupManage009Time = 1775835900; // 2.2.5 · 马甲系统（模块009）
    const groupManage010Time = 1786636800; // 2.3.8 · 刷屏检测（模块010）
    const muteCardIntroTime = 1784265600; // 2.3.7 · 娱乐·禁言卡
    const cardShopUserTime = 1783699200;  // 2.3.6 · 发卡系统（用户端）
    const cardShopAdminTime = 1783699800; // 2.3.6 · 发卡系统（管理端）
    const mkIntroStep = 60;
    function mkIntroChatTime(base, index) {
        return base + index * mkIntroStep;
    }
    let 机器人账号 = 3573995540;// MK 官用演示 QQ
    let 操作者账号 = 864264375;// 开发者 QQ
    let 旁白账号 = 2071521294;// 旁白解说 QQ
    const messages = [
        合并节点("介绍", 864264375, [段_文本(目录说明)], { time: mkIntroTime }),
        嵌套合并节点("授权系统", 旁白账号, [
            合并节点("旁白", 旁白账号, [段_文本(授权介绍_1)], { time: mkIntroChatTime(authModuleTime, 0) }),
            合并节点("旁白", 旁白账号, [段_文本(授权介绍_2)], { time: mkIntroChatTime(authModuleTime, 1) }),
            合并节点("旁白", 旁白账号, [段_文本(授权介绍_3b)], { time: mkIntroChatTime(authModuleTime, 2) }),
            合并节点("操作者", 操作者账号, [段_文本(授权介绍_4)], { time: mkIntroChatTime(authModuleTime, 3) }),
            合并节点("机器人", 机器人账号, [段_文本(授权介绍_5)], { time: mkIntroChatTime(authModuleTime, 4) }),
            合并节点("旁白", 旁白账号, [段_文本(授权介绍_6)], { time: mkIntroChatTime(authModuleTime, 5) }),
            合并节点("操作者", 操作者账号, [段_文本(授权介绍_7)], { time: mkIntroChatTime(authModuleTime, 6) }),
            合并节点("机器人", 机器人账号, [段_文本(授权介绍_8)], { time: mkIntroChatTime(authModuleTime, 7) }),
            合并节点("机器人", 机器人账号, [段_文本(授权介绍_9)], { time: mkIntroChatTime(authModuleTime, 8) }),
            合并节点("旁白", 旁白账号, [段_文本(授权介绍_10)], { time: mkIntroChatTime(authModuleTime, 9) }),
            合并节点("操作者", 操作者账号, [段_文本(授权介绍_11)], { time: mkIntroChatTime(authModuleTime, 10) }),
            合并节点("机器人", 机器人账号, [段_文本(授权介绍_12)], { time: mkIntroChatTime(authModuleTime, 11) }),
            合并节点("旁白", 旁白账号, [段_文本(授权介绍_13)], { time: mkIntroChatTime(authModuleTime, 12) }),
            合并节点("旁白", 旁白账号, [段_文本(授权介绍_14)], { time: mkIntroChatTime(authModuleTime, 13) }),
            合并节点("操作者", 操作者账号, [段_文本(授权介绍_15)], { time: mkIntroChatTime(authModuleTime, 14) }),
            合并节点("机器人", 机器人账号, [段_文本(授权介绍_16)], { time: mkIntroChatTime(authModuleTime, 15) }),
            合并节点("旁白", 旁白账号, [段_文本(授权介绍_17)], { time: mkIntroChatTime(authModuleTime, 16) }),
            合并节点("旁白", 旁白账号, [段_文本(授权介绍_18)], { time: mkIntroChatTime(authModuleTime, 17) }),
            合并节点("操作者", 操作者账号, [段_文本(授权介绍_19)], { time: mkIntroChatTime(authModuleTime, 18) }),
            合并节点("机器人", 机器人账号, [段_文本(授权介绍_20)], { time: mkIntroChatTime(authModuleTime, 19) }),
            合并节点("旁白", 旁白账号, [段_文本(授权介绍_21)], { time: mkIntroChatTime(authModuleTime, 20) }),
            合并节点("操作者", 操作者账号, [段_文本(授权介绍_22)], { time: mkIntroChatTime(authModuleTime, 21) }),
            合并节点("机器人", 机器人账号, [段_文本(授权介绍_23)], { time: mkIntroChatTime(authModuleTime, 22) }),
            合并节点("旁白", 旁白账号, [段_文本(授权介绍_24)], { time: mkIntroChatTime(authModuleTime, 23) }),
            合并节点("旁白", 旁白账号, [段_文本(授权介绍_25)], { time: mkIntroChatTime(authModuleTime, 24) }),
        ], { time: authModuleTime }),
        嵌套合并节点("事件管理", 旁白账号, [
            合并节点("旁白", 旁白账号, [段_文本(事件介绍_1)], { time: mkIntroChatTime(eventModuleTime, 0) }),
            合并节点("旁白", 旁白账号, [段_文本(事件介绍_2)], { time: mkIntroChatTime(eventModuleTime, 1) }),
            合并节点("旁白", 旁白账号, [段_文本(事件介绍_3)], { time: mkIntroChatTime(eventModuleTime, 2) }),
            合并节点("操作者", 操作者账号, [段_文本(事件介绍_4)], { time: mkIntroChatTime(eventModuleTime, 3) }),
            合并节点("机器人", 机器人账号, [段_文本(事件介绍_24)], { time: mkIntroChatTime(eventModuleTime, 4) }),
            合并节点("旁白", 旁白账号, [段_文本(事件介绍_5)], { time: mkIntroChatTime(eventModuleTime, 5) }),
            合并节点("旁白", 旁白账号, [段_文本(事件介绍_19)], { time: mkIntroChatTime(eventModuleTime, 6) }),
            合并节点("旁白", 旁白账号, [段_文本(事件介绍_20)], { time: mkIntroChatTime(eventModuleTime, 7) }),
            合并节点("旁白", 旁白账号, [段_文本(事件介绍_21)], { time: mkIntroChatTime(eventModuleTime, 8) }),
            合并节点("旁白", 旁白账号, [段_文本(事件介绍_22)], { time: mkIntroChatTime(eventModuleTime, 9) }),
            合并节点("旁白", 旁白账号, [段_文本(事件介绍_6)], { time: mkIntroChatTime(eventModuleTime, 10) }),
            合并节点("操作者", 操作者账号, [段_文本(事件介绍_7)], { time: mkIntroChatTime(eventModuleTime, 11) }),
            合并节点("机器人", 机器人账号, [段_文本(事件介绍_8)], { time: mkIntroChatTime(eventModuleTime, 12) }),
            合并节点("旁白", 旁白账号, [段_文本(事件介绍_9)], { time: mkIntroChatTime(eventModuleTime, 13) }),
            合并节点("操作者", 操作者账号, [段_文本(事件介绍_10)], { time: mkIntroChatTime(eventModuleTime, 14) }),
            合并节点("机器人", 机器人账号, [段_文本(事件介绍_11)], { time: mkIntroChatTime(eventModuleTime, 15) }),
            合并节点("旁白", 旁白账号, [段_文本(事件介绍_12)], { time: mkIntroChatTime(eventModuleTime, 16) }),
            合并节点("操作者", 操作者账号, [段_文本(事件介绍_13)], { time: mkIntroChatTime(eventModuleTime, 17) }),
            合并节点("机器人", 机器人账号, [段_文本(事件介绍_14)], { time: mkIntroChatTime(eventModuleTime, 18) }),
            合并节点("旁白", 旁白账号, [段_文本(事件介绍_15)], { time: mkIntroChatTime(eventModuleTime, 19) }),
            合并节点("操作者", 操作者账号, [段_文本(事件介绍_16)], { time: mkIntroChatTime(eventModuleTime, 20) }),
            合并节点("机器人", 机器人账号, [段_文本(事件介绍_17)], { time: mkIntroChatTime(eventModuleTime, 21) }),
            合并节点("旁白", 旁白账号, [段_文本(事件介绍_18)], { time: mkIntroChatTime(eventModuleTime, 22) }),
            合并节点("旁白", 旁白账号, [段_文本(事件介绍_23)], { time: mkIntroChatTime(eventModuleTime, 23) }),
        ], { time: eventModuleTime }),
        嵌套合并节点("群管系统_001", 旁白账号, [
            合并节点("旁白", 旁白账号, [段_文本(群管001_1)], { time: mkIntroChatTime(groupManage001Time, 0) }),
            合并节点("旁白", 旁白账号, [段_文本(群管001_2)], { time: mkIntroChatTime(groupManage001Time, 1) }),
            合并节点("旁白", 旁白账号, [段_文本(群管001_3)], { time: mkIntroChatTime(groupManage001Time, 2) }),
            合并节点("旁白", 旁白账号, [段_文本(群管001_4)], { time: mkIntroChatTime(groupManage001Time, 3) }),
            合并节点("操作者", 操作者账号, [段_文本(群管001_5)], { time: mkIntroChatTime(groupManage001Time, 4) }),
            合并节点("机器人", 机器人账号, [段_文本(群管001_6)], { time: mkIntroChatTime(groupManage001Time, 5) }),
            合并节点("旁白", 旁白账号, [段_文本(群管001_7)], { time: mkIntroChatTime(groupManage001Time, 6) }),
            合并节点("操作者", 操作者账号, [段_文本(群管001_8)], { time: mkIntroChatTime(groupManage001Time, 7) }),
            合并节点("机器人", 机器人账号, [段_文本(群管001_9)], { time: mkIntroChatTime(groupManage001Time, 8) }),
            合并节点("操作者", 操作者账号, [段_文本(群管001_10)], { time: mkIntroChatTime(groupManage001Time, 9) }),
            合并节点("机器人", 机器人账号, [段_文本(群管001_11)], { time: mkIntroChatTime(groupManage001Time, 10) }),
            合并节点("旁白", 旁白账号, [段_文本(群管001_12)], { time: mkIntroChatTime(groupManage001Time, 11) }),
            合并节点("操作者", 操作者账号, [段_文本(群管001_13)], { time: mkIntroChatTime(groupManage001Time, 12) }),
            合并节点("机器人", 机器人账号, [段_文本(群管001_14)], { time: mkIntroChatTime(groupManage001Time, 13) }),
            合并节点("操作者", 操作者账号, [段_文本(群管001_15)], { time: mkIntroChatTime(groupManage001Time, 14) }),
            合并节点("机器人", 机器人账号, [段_文本(群管001_16)], { time: mkIntroChatTime(groupManage001Time, 15) }),
            合并节点("旁白", 旁白账号, [段_文本(群管001_17)], { time: mkIntroChatTime(groupManage001Time, 16) }),
            合并节点("操作者", 操作者账号, [段_文本(群管001_18)], { time: mkIntroChatTime(groupManage001Time, 17) }),
            合并节点("机器人", 机器人账号, [段_文本(群管001_19)], { time: mkIntroChatTime(groupManage001Time, 18) }),
            合并节点("操作者", 操作者账号, [段_文本(群管001_20)], { time: mkIntroChatTime(groupManage001Time, 19) }),
            合并节点("机器人", 机器人账号, [段_文本(群管001_21)], { time: mkIntroChatTime(groupManage001Time, 20) }),
            合并节点("旁白", 旁白账号, [段_文本(群管001_52)], { time: mkIntroChatTime(groupManage001Time, 21) }),
            合并节点("旁白", 旁白账号, [段_文本(群管001_53)], { time: mkIntroChatTime(groupManage001Time, 22) }),
            合并节点("旁白", 旁白账号, [段_文本(群管001_54)], { time: mkIntroChatTime(groupManage001Time, 23) }),
            合并节点("旁白", 旁白账号, [段_文本(群管001_22)], { time: mkIntroChatTime(groupManage001Time, 24) }),
            合并节点("操作者", 操作者账号, [段_文本(群管001_23)], { time: mkIntroChatTime(groupManage001Time, 25) }),
            合并节点("机器人", 机器人账号, [段_文本(群管001_24)], { time: mkIntroChatTime(groupManage001Time, 26) }),
            合并节点("旁白", 旁白账号, [段_文本(群管001_25)], { time: mkIntroChatTime(groupManage001Time, 27) }),
            合并节点("操作者", 操作者账号, [段_文本(群管001_26)], { time: mkIntroChatTime(groupManage001Time, 28) }),
            合并节点("机器人", 机器人账号, [段_文本(群管001_27)], { time: mkIntroChatTime(groupManage001Time, 29) }),
            合并节点("旁白", 旁白账号, [段_文本(群管001_55)], { time: mkIntroChatTime(groupManage001Time, 30) }),
            合并节点("旁白", 旁白账号, [段_文本(群管001_28)], { time: mkIntroChatTime(groupManage001Time, 31) }),
            合并节点("操作者", 操作者账号, [段_文本(群管001_29)], { time: mkIntroChatTime(groupManage001Time, 32) }),
            合并节点("机器人", 机器人账号, [段_文本(群管001_30)], { time: mkIntroChatTime(groupManage001Time, 33) }),
            合并节点("操作者", 操作者账号, [段_文本(群管001_31)], { time: mkIntroChatTime(groupManage001Time, 34) }),
            合并节点("机器人", 机器人账号, [段_文本(群管001_32)], { time: mkIntroChatTime(groupManage001Time, 35) }),
            合并节点("操作者", 操作者账号, [段_文本(群管001_33)], { time: mkIntroChatTime(groupManage001Time, 36) }),
            合并节点("旁白", 旁白账号, [段_文本(群管001_34)], { time: mkIntroChatTime(groupManage001Time, 37) }),
            合并节点("旁白", 旁白账号, [段_文本(群管001_35)], { time: mkIntroChatTime(groupManage001Time, 38) }),
            合并节点("操作者", 操作者账号, [段_文本(群管001_36)], { time: mkIntroChatTime(groupManage001Time, 39) }),
            合并节点("机器人", 机器人账号, [段_文本(群管001_37)], { time: mkIntroChatTime(groupManage001Time, 40) }),
            合并节点("操作者", 操作者账号, [段_文本(群管001_38)], { time: mkIntroChatTime(groupManage001Time, 41) }),
            合并节点("机器人", 机器人账号, [段_文本(群管001_39)], { time: mkIntroChatTime(groupManage001Time, 42) }),
            合并节点("操作者", 操作者账号, [段_文本(群管001_40)], { time: mkIntroChatTime(groupManage001Time, 43) }),
            合并节点("机器人", 机器人账号, [段_文本(群管001_41)], { time: mkIntroChatTime(groupManage001Time, 44) }),
            合并节点("操作者", 操作者账号, [段_文本(群管001_42)], { time: mkIntroChatTime(groupManage001Time, 45) }),
            合并节点("机器人", 机器人账号, [段_文本(群管001_43)], { time: mkIntroChatTime(groupManage001Time, 46) }),
            合并节点("旁白", 旁白账号, [段_文本(群管001_44)], { time: mkIntroChatTime(groupManage001Time, 47) }),
            合并节点("操作者", 操作者账号, [段_文本(群管001_45)], { time: mkIntroChatTime(groupManage001Time, 48) }),
            合并节点("机器人", 机器人账号, [段_文本(群管001_46)], { time: mkIntroChatTime(groupManage001Time, 49) }),
            合并节点("操作者", 操作者账号, [段_文本(群管001_47)], { time: mkIntroChatTime(groupManage001Time, 50) }),
            合并节点("机器人", 机器人账号, [段_文本(群管001_48)], { time: mkIntroChatTime(groupManage001Time, 51) }),
            合并节点("旁白", 旁白账号, [段_文本(群管001_49)], { time: mkIntroChatTime(groupManage001Time, 52) }),
            合并节点("操作者", 操作者账号, [段_文本(群管001_50)], { time: mkIntroChatTime(groupManage001Time, 53) }),
            合并节点("机器人", 机器人账号, [段_文本(群管001_51)], { time: mkIntroChatTime(groupManage001Time, 54) }),
            合并节点("旁白", 旁白账号, [段_文本(群管001_57)], { time: mkIntroChatTime(groupManage001Time, 55) }),
            合并节点("操作者", 操作者账号, [段_文本(群管001_58)], { time: mkIntroChatTime(groupManage001Time, 56) }),
            合并节点("机器人", 机器人账号, [段_文本(群管001_59)], { time: mkIntroChatTime(groupManage001Time, 57) }),
            合并节点("旁白", 旁白账号, [段_文本(群管001_60)], { time: mkIntroChatTime(groupManage001Time, 58) }),
            合并节点("旁白", 旁白账号, [段_文本(群管001_56)], { time: mkIntroChatTime(groupManage001Time, 59) }),
        ], { time: groupManage001Time }),
        嵌套合并节点("群管系统_002", 旁白账号, [
            合并节点("旁白", 旁白账号, [段_文本(群管002_1)], { time: mkIntroChatTime(groupManage002Time, 0) }),
            合并节点("旁白", 旁白账号, [段_文本(群管002_2)], { time: mkIntroChatTime(groupManage002Time, 1) }),
            合并节点("旁白", 旁白账号, [段_文本(群管002_3)], { time: mkIntroChatTime(groupManage002Time, 2) }),
            合并节点("操作者", 操作者账号, [段_文本(群管002_4)], { time: mkIntroChatTime(groupManage002Time, 3) }),
            合并节点("机器人", 机器人账号, [段_文本(群管002_5)], { time: mkIntroChatTime(groupManage002Time, 4) }),
            合并节点("旁白", 旁白账号, [段_文本(群管002_6)], { time: mkIntroChatTime(groupManage002Time, 5) }),
            合并节点("操作者", 操作者账号, [段_文本(群管002_7)], { time: mkIntroChatTime(groupManage002Time, 6) }),
            合并节点("机器人", 机器人账号, [段_文本(群管002_8)], { time: mkIntroChatTime(groupManage002Time, 7) }),
            合并节点("操作者", 操作者账号, [段_文本(群管002_9)], { time: mkIntroChatTime(groupManage002Time, 8) }),
            合并节点("机器人", 机器人账号, [段_文本(群管002_10)], { time: mkIntroChatTime(groupManage002Time, 9) }),
            合并节点("操作者", 操作者账号, [段_文本(群管002_11)], { time: mkIntroChatTime(groupManage002Time, 10) }),
            合并节点("机器人", 机器人账号, [段_文本(群管002_12)], { time: mkIntroChatTime(groupManage002Time, 11) }),
            合并节点("操作者", 操作者账号, [段_文本(群管002_13)], { time: mkIntroChatTime(groupManage002Time, 12) }),
            合并节点("机器人", 机器人账号, [段_文本(群管002_14)], { time: mkIntroChatTime(groupManage002Time, 13) }),
            合并节点("操作者", 操作者账号, [段_文本(群管002_15)], { time: mkIntroChatTime(groupManage002Time, 14) }),
            合并节点("机器人", 机器人账号, [段_文本(群管002_16)], { time: mkIntroChatTime(groupManage002Time, 15) }),
            合并节点("旁白", 旁白账号, [段_文本(群管002_72)], { time: mkIntroChatTime(groupManage002Time, 16) }),
            合并节点("操作者", 操作者账号, [段_文本(群管002_73)], { time: mkIntroChatTime(groupManage002Time, 17) }),
            合并节点("机器人", 机器人账号, [段_文本(群管002_74)], { time: mkIntroChatTime(groupManage002Time, 18) }),
            合并节点("操作者", 操作者账号, [段_文本(群管002_75)], { time: mkIntroChatTime(groupManage002Time, 19) }),
            合并节点("机器人", 机器人账号, [段_文本(群管002_76)], { time: mkIntroChatTime(groupManage002Time, 20) }),
            合并节点("操作者", 操作者账号, [段_文本(群管002_17)], { time: mkIntroChatTime(groupManage002Time, 21) }),
            合并节点("机器人", 机器人账号, [段_文本(群管002_18)], { time: mkIntroChatTime(groupManage002Time, 22) }),
            合并节点("操作者", 操作者账号, [段_文本(群管002_19)], { time: mkIntroChatTime(groupManage002Time, 23) }),
            合并节点("机器人", 机器人账号, [段_文本(群管002_20)], { time: mkIntroChatTime(groupManage002Time, 24) }),
            合并节点("操作者", 操作者账号, [段_文本(群管002_21)], { time: mkIntroChatTime(groupManage002Time, 25) }),
            合并节点("机器人", 机器人账号, [段_文本(群管002_22)], { time: mkIntroChatTime(groupManage002Time, 26) }),
            合并节点("操作者", 操作者账号, [段_文本(群管002_23)], { time: mkIntroChatTime(groupManage002Time, 27) }),
            合并节点("机器人", 机器人账号, [段_文本(群管002_24)], { time: mkIntroChatTime(groupManage002Time, 28) }),
            合并节点("旁白", 旁白账号, [段_文本(群管002_25)], { time: mkIntroChatTime(groupManage002Time, 29) }),
            合并节点("旁白", 旁白账号, [段_文本(群管002_77)], { time: mkIntroChatTime(groupManage002Time, 30) }),
            合并节点("旁白", 旁白账号, [段_文本(群管002_78)], { time: mkIntroChatTime(groupManage002Time, 31) }),
            合并节点("旁白", 旁白账号, [段_文本(群管002_26)], { time: mkIntroChatTime(groupManage002Time, 32) }),
            合并节点("机器人", 机器人账号, [段_文本(群管002_27)], { time: mkIntroChatTime(groupManage002Time, 33) }),
            合并节点("旁白", 旁白账号, [段_文本(群管002_28)], { time: mkIntroChatTime(groupManage002Time, 34) }),
            合并节点("旁白", 旁白账号, [段_文本(群管002_29)], { time: mkIntroChatTime(groupManage002Time, 35) }),
            合并节点("旁白", 旁白账号, [段_文本(群管002_30)], { time: mkIntroChatTime(groupManage002Time, 36) }),
            合并节点("操作者", 操作者账号, [段_文本(群管002_31)], { time: mkIntroChatTime(groupManage002Time, 37) }),
            合并节点("机器人", 机器人账号, [段_文本(群管002_32)], { time: mkIntroChatTime(groupManage002Time, 38) }),
            合并节点("操作者", 操作者账号, [段_文本(群管002_33)], { time: mkIntroChatTime(groupManage002Time, 39) }),
            合并节点("机器人", 机器人账号, [段_文本(群管002_34)], { time: mkIntroChatTime(groupManage002Time, 40) }),
            合并节点("操作者", 操作者账号, [段_文本(群管002_79)], { time: mkIntroChatTime(groupManage002Time, 41) }),
            合并节点("机器人", 机器人账号, [段_文本(群管002_80)], { time: mkIntroChatTime(groupManage002Time, 42) }),
            合并节点("操作者", 操作者账号, [段_文本(群管002_81)], { time: mkIntroChatTime(groupManage002Time, 43) }),
            合并节点("机器人", 机器人账号, [段_文本(群管002_82)], { time: mkIntroChatTime(groupManage002Time, 44) }),
            合并节点("旁白", 旁白账号, [段_文本(群管002_83)], { time: mkIntroChatTime(groupManage002Time, 45) }),
            合并节点("旁白", 旁白账号, [段_文本(群管002_35)], { time: mkIntroChatTime(groupManage002Time, 46) }),
            合并节点("操作者", 操作者账号, [段_文本(群管002_36)], { time: mkIntroChatTime(groupManage002Time, 47) }),
            合并节点("机器人", 机器人账号, [段_文本(群管002_37)], { time: mkIntroChatTime(groupManage002Time, 48) }),
            合并节点("旁白", 旁白账号, [段_文本(群管002_38)], { time: mkIntroChatTime(groupManage002Time, 49) }),
            合并节点("旁白", 旁白账号, [段_文本(群管002_39)], { time: mkIntroChatTime(groupManage002Time, 50) }),
            合并节点("操作者", 操作者账号, [段_文本(群管002_40)], { time: mkIntroChatTime(groupManage002Time, 51) }),
            合并节点("机器人", 机器人账号, [段_文本(群管002_41)], { time: mkIntroChatTime(groupManage002Time, 52) }),
            合并节点("操作者", 操作者账号, [段_文本(群管002_42)], { time: mkIntroChatTime(groupManage002Time, 53) }),
            合并节点("机器人", 机器人账号, [段_文本(群管002_43)], { time: mkIntroChatTime(groupManage002Time, 54) }),
            合并节点("操作者", 操作者账号, [段_文本(群管002_44)], { time: mkIntroChatTime(groupManage002Time, 55) }),
            合并节点("机器人", 机器人账号, [段_文本(群管002_45)], { time: mkIntroChatTime(groupManage002Time, 56) }),
            合并节点("旁白", 旁白账号, [段_文本(群管002_46)], { time: mkIntroChatTime(groupManage002Time, 57) }),
            合并节点("机器人", 机器人账号, [段_图片(mkDemoNewbieAvatar), 段_文本(群管002_47)], { time: mkIntroChatTime(groupManage002Time, 58) }),
            合并节点("旁白", 旁白账号, [段_文本(群管002_48)], { time: mkIntroChatTime(groupManage002Time, 59) }),
            合并节点("旁白", 旁白账号, [段_文本(群管002_85)], { time: mkIntroChatTime(groupManage002Time, 59.5) }),
            合并节点(`新人${mkDemoNewbieQq}`, 操作者账号, [段_文本(群管002_49)], { time: mkIntroChatTime(groupManage002Time, 60) }),
            合并节点("机器人", 机器人账号, [段_文本(群管002_50)], { time: mkIntroChatTime(groupManage002Time, 61) }),
            合并节点(`新人${mkDemoNewbieQq}`, 操作者账号, [段_文本(群管002_51)], { time: mkIntroChatTime(groupManage002Time, 62) }),
            合并节点("旁白", 旁白账号, [段_文本(群管002_52)], { time: mkIntroChatTime(groupManage002Time, 63) }),
            合并节点("机器人", 机器人账号, [段_文本(群管002_53)], { time: mkIntroChatTime(groupManage002Time, 64) }),
            合并节点("旁白", 旁白账号, [段_文本(群管002_54)], { time: mkIntroChatTime(groupManage002Time, 65) }),
            合并节点("操作者", 操作者账号, [段_文本(群管002_55)], { time: mkIntroChatTime(groupManage002Time, 66) }),
            合并节点("机器人", 机器人账号, [段_文本(群管002_56)], { time: mkIntroChatTime(groupManage002Time, 67) }),
            合并节点("旁白", 旁白账号, [段_文本(群管002_57)], { time: mkIntroChatTime(groupManage002Time, 68) }),
            合并节点("操作者", 操作者账号, [段_文本(群管002_58)], { time: mkIntroChatTime(groupManage002Time, 69) }),
            合并节点("机器人", 机器人账号, [段_文本(群管002_59)], { time: mkIntroChatTime(groupManage002Time, 70) }),
            合并节点("操作者", 操作者账号, [段_文本(群管002_60)], { time: mkIntroChatTime(groupManage002Time, 71) }),
            合并节点("机器人", 机器人账号, [段_文本(群管002_61)], { time: mkIntroChatTime(groupManage002Time, 72) }),
            合并节点("操作者", 操作者账号, [段_文本(群管002_62)], { time: mkIntroChatTime(groupManage002Time, 73) }),
            合并节点("机器人", 机器人账号, [段_文本(群管002_63)], { time: mkIntroChatTime(groupManage002Time, 74) }),
            合并节点("操作者", 操作者账号, [段_文本(群管002_64)], { time: mkIntroChatTime(groupManage002Time, 75) }),
            合并节点("旁白", 旁白账号, [段_文本(群管002_65)], { time: mkIntroChatTime(groupManage002Time, 76) }),
            合并节点("操作者", 操作者账号, [段_文本(群管002_66)], { time: mkIntroChatTime(groupManage002Time, 77) }),
            合并节点("机器人", 机器人账号, [段_文本(群管002_67)], { time: mkIntroChatTime(groupManage002Time, 78) }),
            合并节点("操作者", 操作者账号, [段_文本(群管002_68)], { time: mkIntroChatTime(groupManage002Time, 79) }),
            合并节点("机器人", 机器人账号, [段_文本(群管002_69)], { time: mkIntroChatTime(groupManage002Time, 80) }),
            合并节点("旁白", 旁白账号, [段_文本(群管002_70)], { time: mkIntroChatTime(groupManage002Time, 81) }),
            合并节点("机器人", 机器人账号, [段_文本(群管002_71)], { time: mkIntroChatTime(groupManage002Time, 82) }),
            合并节点("旁白", 旁白账号, [段_文本(群管002_84)], { time: mkIntroChatTime(groupManage002Time, 83) }),
        ], { time: groupManage002Time }),
        嵌套合并节点("群管系统_003", 旁白账号, [
            合并节点("旁白", 旁白账号, [段_文本(群管003_1)], { time: mkIntroChatTime(groupManage003Time, 0) }),
            合并节点("旁白", 旁白账号, [段_文本(群管003_2)], { time: mkIntroChatTime(groupManage003Time, 1) }),
            合并节点("旁白", 旁白账号, [段_文本(群管003_3)], { time: mkIntroChatTime(groupManage003Time, 2) }),
            合并节点("旁白", 旁白账号, [段_文本(群管003_4)], { time: mkIntroChatTime(groupManage003Time, 3) }),
            合并节点("操作者", 操作者账号, [段_文本(群管003_5)], { time: mkIntroChatTime(groupManage003Time, 4) }),
            合并节点("机器人", 机器人账号, [段_文本(群管003_6)], { time: mkIntroChatTime(groupManage003Time, 5) }),
            合并节点("旁白", 旁白账号, [段_文本(群管003_7)], { time: mkIntroChatTime(groupManage003Time, 6) }),
            合并节点("旁白", 旁白账号, [段_文本(群管003_8)], { time: mkIntroChatTime(groupManage003Time, 7) }),
            合并节点("群员演示", 操作者账号, [段_文本(群管003_9)], { time: mkIntroChatTime(groupManage003Time, 8) }),
            合并节点("旁白", 旁白账号, [段_文本(群管003_10)], { time: mkIntroChatTime(groupManage003Time, 9) }),
            合并节点("旁白", 旁白账号, [段_文本(群管003_11)], { time: mkIntroChatTime(groupManage003Time, 10) }),
            合并节点("机器人", 机器人账号, [段_文本(群管003_12)], { time: mkIntroChatTime(groupManage003Time, 11) }),
            合并节点("旁白", 旁白账号, [段_文本(群管003_13)], { time: mkIntroChatTime(groupManage003Time, 12) }),
            合并节点("机器人", 机器人账号, [段_文本(群管003_14)], { time: mkIntroChatTime(groupManage003Time, 13) }),
            合并节点("旁白", 旁白账号, [段_文本(群管003_15)], { time: mkIntroChatTime(groupManage003Time, 14) }),
            合并节点("操作者", 操作者账号, [段_文本(群管003_16)], { time: mkIntroChatTime(groupManage003Time, 15) }),
            合并节点("机器人", 机器人账号, [段_文本(群管003_17)], { time: mkIntroChatTime(groupManage003Time, 16) }),
            合并节点("旁白", 旁白账号, [段_文本(群管003_18)], { time: mkIntroChatTime(groupManage003Time, 17) }),
            合并节点("操作者", 操作者账号, [段_文本(群管003_19)], { time: mkIntroChatTime(groupManage003Time, 18) }),
            合并节点("机器人", 机器人账号, [段_文本(群管003_20)], { time: mkIntroChatTime(groupManage003Time, 19) }),
            合并节点("旁白", 旁白账号, [段_文本(群管003_21)], { time: mkIntroChatTime(groupManage003Time, 20) }),
            合并节点("旁白", 旁白账号, [段_文本(群管003_22)], { time: mkIntroChatTime(groupManage003Time, 21) }),
            合并节点("旁白", 旁白账号, [段_文本(群管003_23)], { time: mkIntroChatTime(groupManage003Time, 22) }),
            合并节点("操作者", 操作者账号, [段_文本(群管003_24)], { time: mkIntroChatTime(groupManage003Time, 23) }),
            合并节点("机器人", 机器人账号, [段_文本(群管003_25)], { time: mkIntroChatTime(groupManage003Time, 24) }),
            合并节点("旁白", 旁白账号, [段_文本(群管003_26)], { time: mkIntroChatTime(groupManage003Time, 25) }),
        ], { time: groupManage003Time }),
        嵌套合并节点("群管系统_004", 旁白账号, [
            合并节点("旁白", 旁白账号, [段_文本(群管004_1)], { time: mkIntroChatTime(groupManage004Time, 0) }),
            合并节点("旁白", 旁白账号, [段_文本(群管004_2)], { time: mkIntroChatTime(groupManage004Time, 1) }),
            合并节点("旁白", 旁白账号, [段_文本(群管004_3)], { time: mkIntroChatTime(groupManage004Time, 2) }),
            合并节点("旁白", 旁白账号, [段_文本(群管004_4)], { time: mkIntroChatTime(groupManage004Time, 3) }),
            合并节点("旁白", 旁白账号, [段_文本(群管004_5)], { time: mkIntroChatTime(groupManage004Time, 4) }),
            合并节点("操作者", 操作者账号, [段_文本(群管004_6)], { time: mkIntroChatTime(groupManage004Time, 5) }),
            合并节点("机器人", 机器人账号, [段_文本(群管004_7)], { time: mkIntroChatTime(groupManage004Time, 6) }),
            合并节点("旁白", 旁白账号, [段_文本(群管004_8)], { time: mkIntroChatTime(groupManage004Time, 7) }),
            合并节点("旁白", 旁白账号, [段_文本(群管004_9)], { time: mkIntroChatTime(groupManage004Time, 8) }),
            合并节点("操作者", 操作者账号, [段_文本(群管004_10)], { time: mkIntroChatTime(groupManage004Time, 9) }),
            合并节点("机器人", 机器人账号, [段_文本(群管004_11)], { time: mkIntroChatTime(groupManage004Time, 10) }),
            合并节点("旁白", 旁白账号, [段_文本(群管004_12)], { time: mkIntroChatTime(groupManage004Time, 11) }),
            合并节点("旁白", 旁白账号, [段_文本(群管004_13)], { time: mkIntroChatTime(groupManage004Time, 12) }),
            合并节点("操作者", 操作者账号, [段_文本(群管004_14)], { time: mkIntroChatTime(groupManage004Time, 13) }),
            合并节点("机器人", 机器人账号, [段_文本(群管004_15)], { time: mkIntroChatTime(groupManage004Time, 14) }),
            合并节点("旁白", 旁白账号, [段_文本(群管004_16)], { time: mkIntroChatTime(groupManage004Time, 15) }),
            合并节点("旁白", 旁白账号, [段_文本(群管004_17)], { time: mkIntroChatTime(groupManage004Time, 16) }),
            合并节点("操作者", 操作者账号, [段_文本(群管004_18)], { time: mkIntroChatTime(groupManage004Time, 17) }),
            合并节点("机器人", 机器人账号, [段_文本(群管004_19)], { time: mkIntroChatTime(groupManage004Time, 18) }),
            合并节点("旁白", 旁白账号, [段_文本(群管004_20)], { time: mkIntroChatTime(groupManage004Time, 19) }),
            合并节点("旁白", 旁白账号, [段_文本(群管004_21)], { time: mkIntroChatTime(groupManage004Time, 20) }),
            合并节点("旁白", 旁白账号, [段_文本(群管004_22)], { time: mkIntroChatTime(groupManage004Time, 21) }),
            合并节点("旁白", 旁白账号, [段_文本(群管004_23)], { time: mkIntroChatTime(groupManage004Time, 22) }),
            合并节点("操作者", 操作者账号, [段_文本(群管004_24)], { time: mkIntroChatTime(groupManage004Time, 23) }),
            合并节点("机器人", 机器人账号, [段_文本(群管004_25)], { time: mkIntroChatTime(groupManage004Time, 24) }),
            合并节点("旁白", 旁白账号, [段_文本(群管004_26)], { time: mkIntroChatTime(groupManage004Time, 25) }),
            合并节点("旁白", 旁白账号, [段_文本(群管004_27)], { time: mkIntroChatTime(groupManage004Time, 26) }),
            合并节点("机器人", 机器人账号, [段_文本(群管004_28)], { time: mkIntroChatTime(groupManage004Time, 27) }),
            合并节点("旁白", 旁白账号, [段_文本(群管004_29)], { time: mkIntroChatTime(groupManage004Time, 28) }),
        ], { time: groupManage004Time }),
        嵌套合并节点("群管系统_005", 旁白账号, [
            合并节点("旁白", 旁白账号, [段_文本(群管005_1)], { time: mkIntroChatTime(groupManage005Time, 0) }),
            合并节点("旁白", 旁白账号, [段_文本(群管005_2)], { time: mkIntroChatTime(groupManage005Time, 1) }),
            合并节点("旁白", 旁白账号, [段_文本(群管005_3)], { time: mkIntroChatTime(groupManage005Time, 2) }),
            合并节点("操作者", 操作者账号, [段_文本(群管005_4)], { time: mkIntroChatTime(groupManage005Time, 3) }),
            合并节点("机器人", 机器人账号, [段_文本(群管005_5)], { time: mkIntroChatTime(groupManage005Time, 4) }),
            合并节点("旁白", 旁白账号, [段_文本(群管005_6)], { time: mkIntroChatTime(groupManage005Time, 5) }),
            合并节点("旁白", 旁白账号, [段_文本(群管005_7)], { time: mkIntroChatTime(groupManage005Time, 6) }),
            合并节点("旁白", 旁白账号, [段_文本(群管005_8)], { time: mkIntroChatTime(groupManage005Time, 7) }),
            合并节点("操作者", 操作者账号, [段_文本(群管005_9)], { time: mkIntroChatTime(groupManage005Time, 8) }),
            合并节点("机器人", 机器人账号, [段_文本(群管005_10)], { time: mkIntroChatTime(groupManage005Time, 9) }),
            合并节点("旁白", 旁白账号, [段_文本(群管005_11)], { time: mkIntroChatTime(groupManage005Time, 10) }),
            合并节点("旁白", 旁白账号, [段_文本(群管005_12)], { time: mkIntroChatTime(groupManage005Time, 11) }),
            合并节点("旁白", 旁白账号, [段_文本(群管005_13)], { time: mkIntroChatTime(groupManage005Time, 12) }),
            合并节点("操作者", 操作者账号, [段_文本(群管005_14)], { time: mkIntroChatTime(groupManage005Time, 13) }),
            合并节点("机器人", 机器人账号, [段_文本(群管005_15)], { time: mkIntroChatTime(groupManage005Time, 14) }),
            合并节点("旁白", 旁白账号, [段_文本(群管005_16)], { time: mkIntroChatTime(groupManage005Time, 15) }),
            合并节点("操作者", 操作者账号, [段_文本("添加本群黑名单"), 段_艾特(操作者账号)], { time: mkIntroChatTime(groupManage005Time, 16) }),
            合并节点("机器人", 机器人账号, [段_文本(群管005_17)], { time: mkIntroChatTime(groupManage005Time, 17) }),
            合并节点("旁白", 旁白账号, [段_文本(群管005_18)], { time: mkIntroChatTime(groupManage005Time, 18) }),
            合并节点("操作者", 操作者账号, [段_文本(群管005_19)], { time: mkIntroChatTime(groupManage005Time, 19) }),
            合并节点("机器人", 机器人账号, [段_文本(群管005_20)], { time: mkIntroChatTime(groupManage005Time, 20) }),
            合并节点("旁白", 旁白账号, [段_文本(群管005_21)], { time: mkIntroChatTime(groupManage005Time, 21) }),
            合并节点("操作者", 操作者账号, [段_文本(群管005_22)], { time: mkIntroChatTime(groupManage005Time, 22) }),
            合并节点("机器人", 机器人账号, [段_文本(群管005_23)], { time: mkIntroChatTime(groupManage005Time, 23) }),
            合并节点("旁白", 旁白账号, [段_文本(群管005_24)], { time: mkIntroChatTime(groupManage005Time, 24) }),
            合并节点("旁白", 旁白账号, [段_文本(群管005_25)], { time: mkIntroChatTime(groupManage005Time, 25) }),
            合并节点("操作者", 操作者账号, [段_文本(群管005_26)], { time: mkIntroChatTime(groupManage005Time, 26) }),
            合并节点("机器人", 机器人账号, [段_文本(群管005_27)], { time: mkIntroChatTime(groupManage005Time, 27) }),
            合并节点("旁白", 旁白账号, [段_文本(群管005_28)], { time: mkIntroChatTime(groupManage005Time, 28) }),
            合并节点("旁白", 旁白账号, [段_文本(群管005_29)], { time: mkIntroChatTime(groupManage005Time, 29) }),
            合并节点("旁白", 旁白账号, [段_文本(群管005_30)], { time: mkIntroChatTime(groupManage005Time, 30) }),
            合并节点("旁白", 旁白账号, [段_文本(群管005_31)], { time: mkIntroChatTime(groupManage005Time, 31) }),
            合并节点("旁白", 旁白账号, [段_文本(群管005_32)], { time: mkIntroChatTime(groupManage005Time, 32) }),
        ], { time: groupManage005Time }),
        嵌套合并节点("群管系统_006", 旁白账号, [
            合并节点("旁白", 旁白账号, [段_文本(群管006_1)], { time: mkIntroChatTime(groupManage006Time, 0) }),
            合并节点("旁白", 旁白账号, [段_文本(群管006_2)], { time: mkIntroChatTime(groupManage006Time, 1) }),
            合并节点("旁白", 旁白账号, [段_文本(群管006_3)], { time: mkIntroChatTime(groupManage006Time, 2) }),
            合并节点("旁白", 旁白账号, [段_文本(群管006_4)], { time: mkIntroChatTime(groupManage006Time, 3) }),
            合并节点("旁白", 旁白账号, [段_文本(群管006_5)], { time: mkIntroChatTime(groupManage006Time, 4) }),
            合并节点("操作者", 操作者账号, [段_文本(群管006_6)], { time: mkIntroChatTime(groupManage006Time, 5) }),
            合并节点("机器人", 机器人账号, [段_文本(群管006_7)], { time: mkIntroChatTime(groupManage006Time, 6) }),
            合并节点("旁白", 旁白账号, [段_文本(群管006_8)], { time: mkIntroChatTime(groupManage006Time, 7) }),
            合并节点("旁白", 旁白账号, [段_文本(群管006_9)], { time: mkIntroChatTime(groupManage006Time, 8) }),
            合并节点("操作者", 操作者账号, [段_文本(群管006_10)], { time: mkIntroChatTime(groupManage006Time, 9) }),
            合并节点("机器人", 机器人账号, [段_文本(群管006_11)], { time: mkIntroChatTime(groupManage006Time, 10) }),
            合并节点("旁白", 旁白账号, [段_文本(群管006_12)], { time: mkIntroChatTime(groupManage006Time, 11) }),
            合并节点("操作者", 操作者账号, [段_文本(群管006_13)], { time: mkIntroChatTime(groupManage006Time, 12) }),
            合并节点("机器人", 机器人账号, [段_文本(群管006_14)], { time: mkIntroChatTime(groupManage006Time, 13) }),
            合并节点("旁白", 旁白账号, [段_文本(群管006_15)], { time: mkIntroChatTime(groupManage006Time, 14) }),
            合并节点("操作者", 操作者账号, [段_文本(群管006_16)], { time: mkIntroChatTime(groupManage006Time, 15) }),
            合并节点("机器人", 机器人账号, [段_文本(群管006_17)], { time: mkIntroChatTime(groupManage006Time, 16) }),
            合并节点("旁白", 旁白账号, [段_文本(群管006_18)], { time: mkIntroChatTime(groupManage006Time, 17) }),
            合并节点("操作者", 操作者账号, [段_文本(群管006_19)], { time: mkIntroChatTime(groupManage006Time, 18) }),
            合并节点("机器人", 机器人账号, [段_文本(群管006_20)], { time: mkIntroChatTime(groupManage006Time, 19) }),
            合并节点("旁白", 旁白账号, [段_文本(群管006_21)], { time: mkIntroChatTime(groupManage006Time, 20) }),
            合并节点("旁白", 旁白账号, [段_文本(群管006_22)], { time: mkIntroChatTime(groupManage006Time, 21) }),
            合并节点("旁白", 旁白账号, [段_文本(群管006_23)], { time: mkIntroChatTime(groupManage006Time, 22) }),
            合并节点("操作者", 操作者账号, [段_文本(群管006_24)], { time: mkIntroChatTime(groupManage006Time, 23) }),
            合并节点("机器人", 机器人账号, [段_文本(群管006_25)], { time: mkIntroChatTime(groupManage006Time, 24) }),
            合并节点("旁白", 旁白账号, [段_文本(群管006_26)], { time: mkIntroChatTime(groupManage006Time, 25) }),
            合并节点("操作者", 操作者账号, [段_文本(群管006_27)], { time: mkIntroChatTime(groupManage006Time, 26) }),
            合并节点("机器人", 机器人账号, [段_文本(群管006_28)], { time: mkIntroChatTime(groupManage006Time, 27) }),
            合并节点("旁白", 旁白账号, [段_文本(群管006_29)], { time: mkIntroChatTime(groupManage006Time, 28) }),
            合并节点("旁白", 旁白账号, [段_文本(群管006_30)], { time: mkIntroChatTime(groupManage006Time, 29) }),
            合并节点("操作者", 操作者账号, [段_文本(群管006_31)], { time: mkIntroChatTime(groupManage006Time, 30) }),
            合并节点("机器人", 机器人账号, [段_文本(群管006_32)], { time: mkIntroChatTime(groupManage006Time, 31) }),
            合并节点("旁白", 旁白账号, [段_文本(群管006_33)], { time: mkIntroChatTime(groupManage006Time, 32) }),
            合并节点("操作者", 操作者账号, [段_文本(群管006_34)], { time: mkIntroChatTime(groupManage006Time, 33) }),
            合并节点("机器人", 机器人账号, [段_文本(群管006_35)], { time: mkIntroChatTime(groupManage006Time, 34) }),
            合并节点("旁白", 旁白账号, [段_文本(群管006_36)], { time: mkIntroChatTime(groupManage006Time, 35) }),
            合并节点("旁白", 旁白账号, [段_文本(群管006_37)], { time: mkIntroChatTime(groupManage006Time, 36) }),
        ], { time: groupManage006Time }),
        嵌套合并节点("群管系统_007", 旁白账号, [
            合并节点("旁白", 旁白账号, [段_文本(群管007_1)], { time: mkIntroChatTime(groupManage007Time, 0) }),
            合并节点("旁白", 旁白账号, [段_文本(群管007_2)], { time: mkIntroChatTime(groupManage007Time, 1) }),
            合并节点("旁白", 旁白账号, [段_文本(群管007_3)], { time: mkIntroChatTime(groupManage007Time, 2) }),
            合并节点("操作者", 操作者账号, [段_文本(群管007_4)], { time: mkIntroChatTime(groupManage007Time, 3) }),
            合并节点("机器人", 机器人账号, [段_文本(群管007_5)], { time: mkIntroChatTime(groupManage007Time, 4) }),
            合并节点("旁白", 旁白账号, [段_文本(群管007_6)], { time: mkIntroChatTime(groupManage007Time, 5) }),
            合并节点("旁白", 旁白账号, [段_文本(群管007_7)], { time: mkIntroChatTime(groupManage007Time, 6) }),
            合并节点("旁白", 旁白账号, [段_文本(群管007_8)], { time: mkIntroChatTime(groupManage007Time, 7) }),
            合并节点("操作者", 操作者账号, [段_文本(群管007_9)], { time: mkIntroChatTime(groupManage007Time, 8) }),
            合并节点("机器人", 机器人账号, [段_文本(群管007_10)], { time: mkIntroChatTime(groupManage007Time, 9) }),
            合并节点("旁白", 旁白账号, [段_文本(群管007_11)], { time: mkIntroChatTime(groupManage007Time, 10) }),
            合并节点("旁白", 旁白账号, [段_文本(群管007_12)], { time: mkIntroChatTime(groupManage007Time, 11) }),
            合并节点("操作者", 操作者账号, [段_文本(群管007_13)], { time: mkIntroChatTime(groupManage007Time, 12) }),
            合并节点("机器人", 机器人账号, [段_文本(群管007_14)], { time: mkIntroChatTime(groupManage007Time, 13) }),
            合并节点("旁白", 旁白账号, [段_文本(群管007_15)], { time: mkIntroChatTime(groupManage007Time, 14) }),
            合并节点("旁白", 旁白账号, [段_文本(群管007_16)], { time: mkIntroChatTime(groupManage007Time, 15) }),
            合并节点("操作者", 操作者账号, [段_文本(群管007_17)], { time: mkIntroChatTime(groupManage007Time, 16) }),
            合并节点("机器人", 机器人账号, [段_文本(群管007_18)], { time: mkIntroChatTime(groupManage007Time, 17) }),
            合并节点("旁白", 旁白账号, [段_文本(群管007_19)], { time: mkIntroChatTime(groupManage007Time, 18) }),
            合并节点("操作者", 操作者账号, [段_文本(群管007_20)], { time: mkIntroChatTime(groupManage007Time, 19) }),
            合并节点("机器人", 机器人账号, [段_文本(群管007_21)], { time: mkIntroChatTime(groupManage007Time, 20) }),
            合并节点("旁白", 旁白账号, [段_文本(群管007_22)], { time: mkIntroChatTime(groupManage007Time, 21) }),
            合并节点("旁白", 旁白账号, [段_文本(群管007_23)], { time: mkIntroChatTime(groupManage007Time, 22) }),
        ], { time: groupManage007Time }),
        嵌套合并节点("群管系统_008", 旁白账号, [
            合并节点("旁白", 旁白账号, [段_文本(群管008_1)], { time: mkIntroChatTime(groupManage008Time, 0) }),
            合并节点("旁白", 旁白账号, [段_文本(群管008_2)], { time: mkIntroChatTime(groupManage008Time, 1) }),
            合并节点("旁白", 旁白账号, [段_文本(群管008_3)], { time: mkIntroChatTime(groupManage008Time, 2) }),
            合并节点("旁白", 旁白账号, [段_文本(群管008_4)], { time: mkIntroChatTime(groupManage008Time, 3) }),
            合并节点("操作者", 操作者账号, [段_文本(群管008_5)], { time: mkIntroChatTime(groupManage008Time, 4) }),
            合并节点("机器人", 机器人账号, [段_文本(群管008_6)], { time: mkIntroChatTime(groupManage008Time, 5) }),
            合并节点("旁白", 旁白账号, [段_文本(群管008_7)], { time: mkIntroChatTime(groupManage008Time, 6) }),
            合并节点("旁白", 旁白账号, [段_文本(群管008_8)], { time: mkIntroChatTime(groupManage008Time, 7) }),
            合并节点("操作者", 操作者账号, [段_文本(群管008_9)], { time: mkIntroChatTime(groupManage008Time, 8) }),
            合并节点("机器人", 机器人账号, [段_文本(群管008_10)], { time: mkIntroChatTime(groupManage008Time, 9) }),
            合并节点("旁白", 旁白账号, [段_文本(群管008_11)], { time: mkIntroChatTime(groupManage008Time, 10) }),
            合并节点("旁白", 旁白账号, [段_文本(群管008_12)], { time: mkIntroChatTime(groupManage008Time, 11) }),
            合并节点("旁白", 旁白账号, [段_文本(群管008_13)], { time: mkIntroChatTime(groupManage008Time, 12) }),
            合并节点("机器人", 机器人账号, [段_文本(群管008_14)], { time: mkIntroChatTime(groupManage008Time, 13) }),
            合并节点("旁白", 旁白账号, [段_文本(群管008_15)], { time: mkIntroChatTime(groupManage008Time, 14) }),
            合并节点("旁白", 旁白账号, [段_文本(群管008_16)], { time: mkIntroChatTime(groupManage008Time, 15) }),
            合并节点("旁白", 旁白账号, [段_文本(群管008_17)], { time: mkIntroChatTime(groupManage008Time, 16) }),
            合并节点("旁白", 旁白账号, [段_文本(群管008_18)], { time: mkIntroChatTime(groupManage008Time, 17) }),
        ], { time: groupManage008Time }),
        嵌套合并节点("群管系统_009", 旁白账号, [
            合并节点("旁白", 旁白账号, [段_文本(群管009_1)], { time: mkIntroChatTime(groupManage009Time, 0) }),
            合并节点("旁白", 旁白账号, [段_文本(群管009_2)], { time: mkIntroChatTime(groupManage009Time, 1) }),
            合并节点("旁白", 旁白账号, [段_文本(群管009_3)], { time: mkIntroChatTime(groupManage009Time, 2) }),
            合并节点("旁白", 旁白账号, [段_文本(群管009_4)], { time: mkIntroChatTime(groupManage009Time, 3) }),
            合并节点("操作者", 操作者账号, [段_文本(群管009_5)], { time: mkIntroChatTime(groupManage009Time, 4) }),
            合并节点("机器人", 机器人账号, [段_文本(群管009_6)], { time: mkIntroChatTime(groupManage009Time, 5) }),
            合并节点("旁白", 旁白账号, [段_文本(群管009_7)], { time: mkIntroChatTime(groupManage009Time, 6) }),
            合并节点("旁白", 旁白账号, [段_文本(群管009_8)], { time: mkIntroChatTime(groupManage009Time, 7) }),
            合并节点("操作者", 操作者账号, [段_文本(群管009_9)], { time: mkIntroChatTime(groupManage009Time, 8) }),
            合并节点("机器人", 机器人账号, [段_文本(群管009_10)], { time: mkIntroChatTime(groupManage009Time, 9) }),
            合并节点("旁白", 旁白账号, [段_文本(群管009_11)], { time: mkIntroChatTime(groupManage009Time, 10) }),
            合并节点("旁白", 旁白账号, [段_文本(群管009_12)], { time: mkIntroChatTime(groupManage009Time, 11) }),
            合并节点("操作者", 操作者账号, [段_文本(群管009_13)], { time: mkIntroChatTime(groupManage009Time, 12) }),
            合并节点("机器人", 机器人账号, [段_文本(群管009_14)], { time: mkIntroChatTime(groupManage009Time, 13) }),
            合并节点("机器人", 机器人账号, [段_文本(群管009_15)], { time: mkIntroChatTime(groupManage009Time, 14) }),
            合并节点("旁白", 旁白账号, [段_文本(群管009_16)], { time: mkIntroChatTime(groupManage009Time, 15) }),
            合并节点("旁白", 旁白账号, [段_文本(群管009_17)], { time: mkIntroChatTime(groupManage009Time, 16) }),
            合并节点("旁白", 旁白账号, [段_文本(群管009_18)], { time: mkIntroChatTime(groupManage009Time, 17) }),
            合并节点("旁白", 旁白账号, [段_文本(群管009_19)], { time: mkIntroChatTime(groupManage009Time, 18) }),
            合并节点("旁白", 旁白账号, [段_文本(群管009_20)], { time: mkIntroChatTime(groupManage009Time, 19) }),
            合并节点("旁白", 旁白账号, [段_文本(群管009_21)], { time: mkIntroChatTime(groupManage009Time, 20) }),
            合并节点("操作者", 操作者账号, [段_文本(群管009_22)], { time: mkIntroChatTime(groupManage009Time, 21) }),
            合并节点("机器人", 机器人账号, [段_文本(群管009_23)], { time: mkIntroChatTime(groupManage009Time, 22) }),
            合并节点("操作者", 操作者账号, [段_文本(群管009_24)], { time: mkIntroChatTime(groupManage009Time, 23) }),
            合并节点("机器人", 机器人账号, [段_文本(群管009_25)], { time: mkIntroChatTime(groupManage009Time, 24) }),
            合并节点("旁白", 旁白账号, [段_文本(群管009_26)], { time: mkIntroChatTime(groupManage009Time, 25) }),
            合并节点("操作者", 操作者账号, [段_文本(群管009_27)], { time: mkIntroChatTime(groupManage009Time, 26) }),
            合并节点("机器人", 机器人账号, [段_文本(群管009_28)], { time: mkIntroChatTime(groupManage009Time, 27) }),
            合并节点("旁白", 旁白账号, [段_文本(群管009_29)], { time: mkIntroChatTime(groupManage009Time, 28) }),
        ], { time: groupManage009Time }),
        嵌套合并节点("群管系统_010", 旁白账号, [
            合并节点("旁白", 旁白账号, [段_文本(群管010_1)], { time: mkIntroChatTime(groupManage010Time, 0) }),
            合并节点("旁白", 旁白账号, [段_文本(群管010_2)], { time: mkIntroChatTime(groupManage010Time, 1) }),
            合并节点("旁白", 旁白账号, [段_文本(群管010_3)], { time: mkIntroChatTime(groupManage010Time, 2) }),
            合并节点("旁白", 旁白账号, [段_文本(群管010_4)], { time: mkIntroChatTime(groupManage010Time, 3) }),
            合并节点("操作者", 操作者账号, [段_文本(群管010_5)], { time: mkIntroChatTime(groupManage010Time, 4) }),
            合并节点("机器人", 机器人账号, [段_文本(群管010_6)], { time: mkIntroChatTime(groupManage010Time, 5) }),
            合并节点("操作者", 操作者账号, [段_文本(群管010_7)], { time: mkIntroChatTime(groupManage010Time, 6) }),
            合并节点("机器人", 机器人账号, [段_文本(群管010_8)], { time: mkIntroChatTime(groupManage010Time, 7) }),
            合并节点("旁白", 旁白账号, [段_文本(群管010_9)], { time: mkIntroChatTime(groupManage010Time, 8) }),
            合并节点("旁白", 旁白账号, [段_文本(群管010_10)], { time: mkIntroChatTime(groupManage010Time, 9) }),
            合并节点("旁白", 旁白账号, [段_文本(群管010_11)], { time: mkIntroChatTime(groupManage010Time, 10) }),
            合并节点("旁白", 旁白账号, [段_文本(群管010_12)], { time: mkIntroChatTime(groupManage010Time, 11) }),
            合并节点("旁白", 旁白账号, [段_文本(群管010_13)], { time: mkIntroChatTime(groupManage010Time, 12) }),
        ], { time: groupManage010Time }),
    ];
    const messagesIntro2 = [
        合并节点("介绍·下篇", 864264375, [段_文本(目录说明_2)], { time: mkIntroTime + mkIntroStep }),
        嵌套合并节点("娱乐·禁言卡", 旁白账号, [
            合并节点("旁白", 旁白账号, [段_文本(禁言卡介绍_1)], { time: mkIntroChatTime(muteCardIntroTime, 0) }),
            合并节点("旁白", 旁白账号, [段_文本(禁言卡介绍_2)], { time: mkIntroChatTime(muteCardIntroTime, 1) }),
            合并节点("操作者", 操作者账号, [段_文本(禁言卡介绍_3)], { time: mkIntroChatTime(muteCardIntroTime, 2) }),
            合并节点("机器人", 机器人账号, [段_文本(禁言卡介绍_4)], { time: mkIntroChatTime(muteCardIntroTime, 3) }),
            合并节点("操作者", 操作者账号, [段_文本(禁言卡介绍_5)], { time: mkIntroChatTime(muteCardIntroTime, 4) }),
            合并节点("机器人", 机器人账号, [段_文本(禁言卡介绍_6)], { time: mkIntroChatTime(muteCardIntroTime, 5) }),
            合并节点("旁白", 旁白账号, [段_文本(禁言卡介绍_7)], { time: mkIntroChatTime(muteCardIntroTime, 6) }),
            合并节点("操作者", 操作者账号, [段_文本(禁言卡介绍_8)], { time: mkIntroChatTime(muteCardIntroTime, 7) }),
            合并节点("机器人", 机器人账号, [段_文本(禁言卡介绍_9)], { time: mkIntroChatTime(muteCardIntroTime, 8) }),
            合并节点("旁白", 旁白账号, [段_文本(禁言卡介绍_10)], { time: mkIntroChatTime(muteCardIntroTime, 9) }),
            合并节点("旁白", 旁白账号, [段_文本(禁言卡介绍_11)], { time: mkIntroChatTime(muteCardIntroTime, 10) }),
        ], { time: muteCardIntroTime }),
        嵌套合并节点("发卡系统·用户端", 旁白账号, [
            合并节点("旁白", 旁白账号, [段_文本(发卡用户_1)], { time: mkIntroChatTime(cardShopUserTime, 0) }),
            合并节点("旁白", 旁白账号, [段_文本(发卡用户_2)], { time: mkIntroChatTime(cardShopUserTime, 1) }),
            合并节点("旁白", 旁白账号, [段_文本(发卡用户_3)], { time: mkIntroChatTime(cardShopUserTime, 2) }),
            合并节点("旁白", 旁白账号, [段_文本(发卡用户_4)], { time: mkIntroChatTime(cardShopUserTime, 3) }),
            合并节点("操作者", 操作者账号, [段_文本(发卡用户_5)], { time: mkIntroChatTime(cardShopUserTime, 4) }),
            合并节点("机器人", 机器人账号, [段_文本(发卡用户_6)], { time: mkIntroChatTime(cardShopUserTime, 5) }),
            合并节点("旁白", 旁白账号, [段_文本(发卡用户_7)], { time: mkIntroChatTime(cardShopUserTime, 6) }),
            合并节点("操作者", 操作者账号, [段_文本(发卡用户_8)], { time: mkIntroChatTime(cardShopUserTime, 7) }),
            合并节点("机器人", 机器人账号, [段_文本(发卡用户_9)], { time: mkIntroChatTime(cardShopUserTime, 8) }),
            合并节点("旁白", 旁白账号, [段_文本(发卡用户_10)], { time: mkIntroChatTime(cardShopUserTime, 9) }),
            合并节点("操作者", 操作者账号, [段_文本(发卡用户_11)], { time: mkIntroChatTime(cardShopUserTime, 10) }),
            合并节点("机器人", 机器人账号, [段_文本(发卡用户_12)], { time: mkIntroChatTime(cardShopUserTime, 11) }),
            合并节点("机器人", 机器人账号, [段_文本(发卡用户_13)], { time: mkIntroChatTime(cardShopUserTime, 12) }),
            合并节点("旁白", 旁白账号, [段_文本(发卡用户_14)], { time: mkIntroChatTime(cardShopUserTime, 13) }),
            合并节点("旁白", 旁白账号, [段_文本(发卡用户_15)], { time: mkIntroChatTime(cardShopUserTime, 14) }),
            合并节点("操作者", 操作者账号, [段_文本(发卡用户_16)], { time: mkIntroChatTime(cardShopUserTime, 15) }),
            合并节点("机器人", 机器人账号, [段_文本(发卡用户_17)], { time: mkIntroChatTime(cardShopUserTime, 16) }),
            合并节点("旁白", 旁白账号, [段_文本(发卡用户_18)], { time: mkIntroChatTime(cardShopUserTime, 17) }),
        ], { time: cardShopUserTime }),
        嵌套合并节点("发卡系统·管理端", 旁白账号, [
            合并节点("旁白", 旁白账号, [段_文本(发卡管理_1)], { time: mkIntroChatTime(cardShopAdminTime, 0) }),
            合并节点("旁白", 旁白账号, [段_文本(发卡管理_2)], { time: mkIntroChatTime(cardShopAdminTime, 1) }),
            合并节点("旁白", 旁白账号, [段_文本(发卡管理_3)], { time: mkIntroChatTime(cardShopAdminTime, 2) }),
            合并节点("操作者", 操作者账号, [段_文本(发卡管理_4)], { time: mkIntroChatTime(cardShopAdminTime, 3) }),
            合并节点("机器人", 机器人账号, [段_文本(发卡管理_5)], { time: mkIntroChatTime(cardShopAdminTime, 4) }),
            合并节点("旁白", 旁白账号, [段_文本(发卡管理_6)], { time: mkIntroChatTime(cardShopAdminTime, 5) }),
            合并节点("操作者", 操作者账号, [段_文本(发卡管理_7)], { time: mkIntroChatTime(cardShopAdminTime, 6) }),
            合并节点("机器人", 机器人账号, [段_文本(发卡管理_8)], { time: mkIntroChatTime(cardShopAdminTime, 7) }),
            合并节点("操作者", 操作者账号, [段_文本(发卡管理_9)], { time: mkIntroChatTime(cardShopAdminTime, 8) }),
            合并节点("机器人", 机器人账号, [段_文本(发卡管理_10)], { time: mkIntroChatTime(cardShopAdminTime, 9) }),
            合并节点("旁白", 旁白账号, [段_文本(发卡管理_11)], { time: mkIntroChatTime(cardShopAdminTime, 10) }),
            合并节点("操作者", 操作者账号, [段_文本(发卡管理_12)], { time: mkIntroChatTime(cardShopAdminTime, 11) }),
            合并节点("机器人", 机器人账号, [段_文本(发卡管理_13)], { time: mkIntroChatTime(cardShopAdminTime, 12) }),
            合并节点("旁白", 旁白账号, [段_文本(发卡管理_14)], { time: mkIntroChatTime(cardShopAdminTime, 13) }),
            合并节点("操作者", 操作者账号, [段_文本(发卡管理_15)], { time: mkIntroChatTime(cardShopAdminTime, 14) }),
            合并节点("机器人", 机器人账号, [段_文本(发卡管理_16)], { time: mkIntroChatTime(cardShopAdminTime, 15) }),
            合并节点("旁白", 旁白账号, [段_文本(发卡管理_17)], { time: mkIntroChatTime(cardShopAdminTime, 16) }),
            合并节点("旁白", 旁白账号, [段_文本(发卡管理_18)], { time: mkIntroChatTime(cardShopAdminTime, 17) }),
            合并节点("旁白", 旁白账号, [段_文本(发卡管理_19)], { time: mkIntroChatTime(cardShopAdminTime, 18) }),
            合并节点("旁白", 旁白账号, [段_文本(发卡管理_20)], { time: mkIntroChatTime(cardShopAdminTime, 19) }),
        ], { time: cardShopAdminTime }),
    ];
    // ================== 发送嵌套转发（分上下两篇，避免单条合并过大导致 NapCat 上传失败） ==================
    await 发合并消息(event, messages, 合并预览(
        "MKbot 功能介绍（上篇）",
        "授权 · 事件 · 群管001～009",
        "[聊天记录]",
        ["介绍: 插件原则与群管目录", "授权系统: 卡密与授权", "事件管理: 群事件与全局事件全览", "群管001~009: 含子模块演示对话"],
    ));
    await 发合并消息(event, messagesIntro2, 合并预览(
        "MKbot 功能介绍（下篇）",
        "娱乐·禁言卡 · 扩展·发卡系统",
        "[聊天记录]",
        ["介绍: 下篇说明", "娱乐·禁言卡: 商店购买与使用", "发卡系统: 用户兑换与全服商店", "发卡系统: 主人维护与卡密库存"],
    ));
    return null;
}













if(message.match(/^(开启|关闭)禁发(图片|视频|语音|卡片|合并转发)$/)){
    // ================== 来源 ==================
    if(event.message_type != "group"){
        return null;
    }
    // ================== 授权判断 ==================
    if(!(await requireAuthorized(RC_sq, event))) return null;
    // ================== 最高主人检测 ==================
    let crr_开关 = false;
    if(event.message_type == "group"){
        let rrrrv = readB(`筱筱吖/事件系统/${event.group_id}.json`, "管理模式", "关闭");
        if (rrrrv == "开启"){
            crr_开关 = true;
        }
    }
    if(!(await checkOwner3(event, ctx, crr_开关))) return null;
    // ================== 取值 ==================
    const 操作 = message.match(/^(开启|关闭)禁发(图片|视频|语音|卡片|合并转发)$/)[1];
    const 目标 = message.match(/^(开启|关闭)禁发(图片|视频|语音|卡片|合并转发)$/)[2];
    const 状态值 = 操作 == "开启" ? "开启" : "关闭";
    const 类型映射 = {
        "图片": ["image"],
        "视频": ["video"],
        "语音": ["record"],
        "卡片": ["json", "xml"],
        "合并转发": ["forward"]
    };
    const 键列表 = 类型映射[目标] || [];
    if(键列表.length == 0){
        return null;
    }
    const 配置路径 = `筱筱吖/群管功能/违禁系统/${event.group_id}/禁发管理.json`;
    const 已经一致 = 键列表.every((键) => readB(配置路径, 键, "关闭") == 状态值);
    // ================== 判断 ==================
    if(已经一致){
        await 发消息(event, [段_引用(event.message_id), 段_文本(`【禁发${目标}】已经是${状态值}状态啦～`)]);
        return null;
    }
    for(let i = 0; i < 键列表.length; i++){
        writeB(配置路径, 键列表[i], 状态值);
    }
    await 发消息(event, [段_引用(event.message_id), 段_文本(`好哒！本群【禁发${目标}】已${状态值}～`)]);
    return null;
}

if(message.match(/^设置刷屏间隔\s*\d+$/) || message.match(/^设置刷屏次数\s*\d+$/) || message.match(/^设置慢刷窗口\s*\d+$/) || message.match(/^设置慢刷次数\s*\d+$/) || message.match(/^设置刷屏禁言\s*\d+$/) || message === "查看刷屏检测"){
    if(event.message_type != "group"){
        return null;
    }
    if(!(await requireAuthorized(RC_sq, event))) return null;
    const spamCmdHandled = await handleSpamFloodConfigCommands(message, event, ctx, mkGetSpamFloodDeps());
    if(spamCmdHandled) return null;
}

if(message.match(/^发言限制\s+\d+\s+\d+\s+\d+$/)){
    // ================== 来源 ==================
    if(event.message_type != "group"){
        return null;
    }
    // ================== 授权判断 ==================
    if(!(await requireAuthorized(RC_sq, event))) return null;
    // ================== 最高主人检测 ==================
    let crr_开关 = false;
    if(event.message_type == "group"){
        let rrrrv = readB(`筱筱吖/事件系统/${event.group_id}.json`, "管理模式", "关闭");
        if (rrrrv == "开启"){
            crr_开关 = true;
        }
    }
    if(!(await checkOwner3(event, ctx, crr_开关))) return null;
    // ================== 检 ==================
    let arr = message.split(/\s+/);
    let 字数数值 = Number(arr[1]);
    let 行数值 = Number(arr[2]);
    let 艾特数值 = Number(arr[3]);
    let 群ID = event.group_id;
    writeB(`筱筱吖/群管功能/发言限制/${群ID}.json`, "字数", 字数数值);
    writeB(`筱筱吖/群管功能/发言限制/${群ID}.json`, "行数", 行数值);
    writeB(`筱筱吖/群管功能/发言限制/${群ID}.json`, "艾特", 艾特数值);
    let 提示 = `✅ 发言限制设置完成`;
    提示 += `\n字数上限：${字数数值}（0=不限制）`;
    提示 += `\n行数上限：${行数值}（0=不限制）`;
    提示 += `\n艾特上限：${艾特数值}（0=不限制）`;
    await 发消息(event, [段_引用(event.message_id), 段_文本(`${提示}`)]);
    return;
}


if(message.match(/^发言限制\s+(字数|行数|艾特)\s+\d+$/)){
    // ================== 来源 ==================
    if(event.message_type != "group"){
        return null;
    }
    // ================== 授权判断 ==================
    if(!(await requireAuthorized(RC_sq, event))) return null;
    // ================== 最高主人检测 ==================
    let crr_开关 = false;
    if(event.message_type == "group"){
        let rrrrv = readB(`筱筱吖/事件系统/${event.group_id}.json`, "管理模式", "关闭");
        if (rrrrv == "开启"){
            crr_开关 = true;
        }
    }
    if(!(await checkOwner3(event, ctx, crr_开关))) return null;
    // ================== 检 ==================
    let arr = message.split(/\s+/);
    let 类型 = arr[1];
    let 数值 = Number(arr[2]);
    let 群ID = event.group_id;
    writeB(`筱筱吖/群管功能/发言限制/${群ID}.json`, 类型, 数值);
    await 发消息(event, [段_引用(event.message_id), 段_文本(`✅ ${类型}已设置为${数值}，0代表关闭该限制`)]);
    return;
}


if(message.match(/^(查看发言限制)$/)){
    // ================== 来源 ==================
    if(event.message_type != "group"){
        return null;
    }
    // ================== 授权判断 ==================
    if(!(await requireAuthorized(RC_sq, event))) return null;
    // ================== 最高主人检测 ==================
    let crr_开关 = false;
    if(event.message_type == "group"){
        let rrrrv = readB(`筱筱吖/事件系统/${event.group_id}.json`, "管理模式", "关闭");
        if (rrrrv == "开启"){
            crr_开关 = true;
        }
    }
    if(!(await checkOwner3(event, ctx, crr_开关))) return null;
    // ================== 检 ==================
    let 群ID = event.group_id;
    let 限制字数 = Number(readB(`筱筱吖/群管功能/发言限制/${群ID}.json`, "字数", 0));
    let 限制行数 = Number(readB(`筱筱吖/群管功能/发言限制/${群ID}.json`, "行数", 0));
    let 限制艾特 = Number(readB(`筱筱吖/群管功能/发言限制/${群ID}.json`, "艾特", 0));
    let 提示 = `📊本群发言限制配置`;
    提示 += `\n字数：${限制字数 == 0 ? "无限制" : 限制字数+"字"}`;
    提示 += `\n行数：${限制行数 == 0 ? "无限制" : 限制行数+"行"}`;
    提示 += `\n艾特：${限制艾特 == 0 ? "无限制" : 限制艾特+"人"}`;
    await 发消息(event, [段_引用(event.message_id), 段_文本(`${提示}`)]);
    return;
}


if(message == "清屏"){
    // ================== 来源 ==================
    if(event.message_type != "group"){
        return null;
    }
    // ================== 授权判断 ==================
    if(!(await requireAuthorized(RC_sq, event))) return null;
    // ================== 最高主人检测 ==================
    let crr_开关 = false;
    if(event.message_type == "group"){
        let rrrrv = readB(`筱筱吖/事件系统/${event.group_id}.json`, "管理模式", "关闭");
        if (rrrrv == "开启"){
            crr_开关 = true;
        }
    }
    if(!(await checkOwner3(event, ctx, crr_开关))) return null;
    // ================== 输出 ==================
    await 发消息(event, [段_文本(`\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n`)]);
    await 发消息(event, [段_文本(`\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n`)]);
    await 发消息(event, [段_文本(`\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n`)]);
    await 发消息(event, [段_文本(`\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n`)]);
    await 发消息(event, [段_文本(`\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n`)]);
    return null;
}


if(message.match(/^取消入群验证([0-9]+)$/)){
    // ================== 来源 ==================
    if(event.message_type != "group"){
        return null;
    }
    // ================== 授权判断 ==================
    if(!(await requireAuthorized(RC_sq, event))) return null;
    // ================== 最高主人检测 ==================
    let crr_开关 = false;
    if(event.message_type == "group"){
        let rrrrv = readB(`筱筱吖/事件系统/${event.group_id}.json`, "管理模式", "关闭");
        if (rrrrv == "开启"){
            crr_开关 = true;
        }
    }
    if(!(await checkOwner3(event, ctx, crr_开关))) return null;
    // ================== 取值 ==================
    let 目标 = message.match(/^取消入群验证([0-9]+)$/)[1];
    let sss = readB(`筱筱吖/群管系统/入群审核/${event.group_id}/审核状态.json`, 目标, "无");
    // ================== 判断 ==================
    if(sss == "无"){
        await 发消息(event, [段_引用(event.message_id), 段_文本(`「${目标}」不处于验证状态啦！`)]);
        return null;
    }else{
        await 发消息(event, [段_引用(event.message_id), 段_文本(`好哒！这就给「${目标}」取消本次验证！`)]);
        writeB(`筱筱吖/群管系统/入群审核/${event.group_id}/审核状态.json`, 目标, "无");
        writeB(`筱筱吖/群管系统/入群审核/${event.group_id}/验证码.json`, 目标, false);
        writeB(`筱筱吖/群管系统/入群审核/${event.group_id}/验证内容.json`, 目标, false);
        return null;
    }
}

if(message.match(/^设置入群验证方式(随机数字|随机字母|随机算式)$/)){
    // ================== 来源 ==================
    if(event.message_type != "group"){
        return null;
    }
    // ================== 授权判断 ==================
    if(!(await requireAuthorized(RC_sq, event))) return null;
    // ================== 最高主人检测 ==================
    let crr_开关 = false;
    if(event.message_type == "group"){
        let rrrrv = readB(`筱筱吖/事件系统/${event.group_id}.json`, "管理模式", "关闭");
        if (rrrrv == "开启"){
            crr_开关 = true;
        }
    }
    if(!(await checkOwner3(event, ctx, crr_开关))) return null;
    // ================== 取值 ==================
    const 方式 = message.match(/^设置入群验证方式(随机数字|随机字母|随机算式)$/)[1];
    const 当前方式 = readB(`筱筱吖/群管系统/入群审核/${event.group_id}/次数.json`, "验证方式", "随机数字");
    if(当前方式 == 方式){
        await 发消息(event, [段_引用(event.message_id), 段_文本(`本群入群验证方式已经是「${方式}」啦！`)]);
        return null;
    }
    writeB(`筱筱吖/群管系统/入群审核/${event.group_id}/次数.json`, "验证方式", 方式);
    await 发消息(event, [段_引用(event.message_id), 段_文本(`好哒！这就把入群验证的【方式】改成「${方式}」`)]);
    return null;
}

if(message.match(/^设置入群验证(次数|时长)([0-9]+)$/)){
    // ================== 来源 ==================
    if(event.message_type != "group"){
        return null;
    }
    // ================== 授权判断 ==================
    if(!(await requireAuthorized(RC_sq, event))) return null;
    // ================== 最高主人检测 ==================
    let crr_开关 = false;
    if(event.message_type == "group"){
        let rrrrv = readB(`筱筱吖/事件系统/${event.group_id}.json`, "管理模式", "关闭");
        if (rrrrv == "开启"){
            crr_开关 = true;
        }
    }
    if(!(await checkOwner3(event, ctx, crr_开关))) return null;
    // ================== 取值 ==================
    const 类型 = message.match(/^设置入群验证(次数|时长)([0-9]+)$/)[1];
    const 数字 = message.match(/^设置入群验证(次数|时长)([0-9]+)$/)[2];
    let 文件 = readB(`筱筱吖/群管系统/入群审核/${event.group_id}/次数.json`, "可用次数", 5);
    if(类型 == "时长"){
        文件 = readB(`筱筱吖/群管系统/入群审核/${event.group_id}/次数.json`, "可用时间", 300);
    }
    // ================== 判断值 ==================
    if(文件 == 数字 || 数字 == 0){
        await 发消息(event, [段_引用(event.message_id), 段_文本(`【${类型}】参数的值不能为0或等于原值！`)]);
        return null;
    }
    if(类型 == "时长" && 数字 >= 86400){
        await 发消息(event, [段_引用(event.message_id), 段_文本('这么长时间我会炸の！')]);
        return null;
    }
    // ================== 写入 ==================
    await 发消息(event, [段_引用(event.message_id), 段_文本(`好哒！这就把入群验证的【${类型}】参数改成「${数字}」`)]);
    if(类型 == "时长"){
        writeB(`筱筱吖/群管系统/入群审核/${event.group_id}/次数.json`, "可用时间", 数字);
    }else{
        writeB(`筱筱吖/群管系统/入群审核/${event.group_id}/次数.json`, "可用次数", 数字);
    }
    return null;
}



if(message.match(/^设置入群欢迎词#([\s\S]*)/)){
    // ================== 来源 ==================
    if(event.message_type != "group"){
        return null;
    }
    // ================== 授权判断 ==================
    if(!(await requireAuthorized(RC_sq, event))) return null;
    // ================== 最高主人检测 ==================
    let crr_开关 = false;
    if(event.message_type == "group"){
        let rrrrv = readB(`筱筱吖/事件系统/${event.group_id}.json`, "管理模式", "关闭");
        if (rrrrv == "开启"){
            crr_开关 = true;
        }
    }
    if(!(await checkOwner3(event, ctx, crr_开关))) return null;
    // ================== 检 ==================
    let 内容 = message.match(/^设置入群欢迎词#([\s\S]*)/)[1];
    
    // ================== 反转义HTML实体 ==================
    内容 = 内容
        .replace(/&#91;/g, '[')
        .replace(/&#93;/g, ']')
        .replace(/&amp;/g, '&')
        .replace(/</g, '<')
        .replace(/>/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/'/g, "'");
    
    const 字数 = (内容.length || 0);
    if(字数 < 2){
        await 发消息(event, [段_引用(event.message_id), 段_文本('请字数大于2个哦～')]);
        return null;
    }
    // ================== 写入 ==================
    await 发消息(event, [段_引用(event.message_id), 段_文本(`好哒！这就把本群的【入群欢迎语】设置为:\n${内容}`)]);
    writeA(`筱筱吖/群管系统/入群欢迎词/${event.group_id}.json`, 内容);
    return null;
}


// ---------------------------------------------------------------------------
// MKbot 退群通知自定义模板支持的变量：
// 变量名            说明
// [用户QQ]          退群者的 QQ 号码
// [用户昵称]        退群者的昵称（调用 get_stranger_info 获取，失败则回退为 QQ）
// [操作者QQ]       踢出执行者的 QQ（仅 sub_type === "kick" 时有效）
// [操作者昵称]      踢出执行者的昵称（仅 sub_type === "kick" 时有效）
// [群号]            当前群号
// [群名]            当前群名（调用 get_group_detail_info 获取）
// [时间]            退群事件发生时间（timeA 格式化，例：2026-05-16 14:30:25）
// [退群类型]       主动退群 / 被踢出
// 使用示例：设置退群通知模板#[用户昵称]([用户QQ]) 于 [时间] [退群类型]
// ---------------------------------------------------------------------------
if(message.match(/^设置退群通知词#([\s\S]*)/)){
    // ================== 来源 ==================
    if(event.message_type != "group"){
        return null;
    }
    // ================== 授权判断 ==================
    if(!(await requireAuthorized(RC_sq, event))) return null;
    // ================== 最高主人检测 ==================
    let crr_开关 = false;
    if(event.message_type == "group"){
        let rrrrv = readB(`筱筱吖/事件系统/${event.group_id}.json`, "管理模式", "关闭");
        if (rrrrv == "开启"){
            crr_开关 = true;
        }
    }
    if(!(await checkOwner3(event, ctx, crr_开关))) return null;
    // ================== 检 ==================
    let 内容 = message.match(/^设置退群通知词#([\s\S]*)/)[1];
    if(!内容 || 内容.trim().length === 0){
        await 发消息(event, [段_引用(event.message_id), 段_文本('模板内容不能为空哦～')]);
        return null;
    }
    // 保存模板到群专属文件
    let 模板路径 = `筱筱吖/群管系统/退群通知模板/${event.group_id}.json`;
    writeA(模板路径, 内容);
    await 发消息(event, [段_引用(event.message_id), 段_文本(`已设置本群的退群通知模板：\n${内容}`)]);
    return null;
}


if(message.match(/^更改群(名称|名字|头像)([\s\S]*)$/)){
    // ================== 来源 ==================
    if(event.message_type != "group"){
        return null;
    }
    // ================== 授权判断 ==================
    if(!(await requireAuthorized(RC_sq, event))) return null;
    // ================== 最高主人检测 ==================
    // ================== 最高主人检测 ==================
    let crr_开关 = false;
    if(event.message_type == "group"){
        let rrrrv = readB(`筱筱吖/事件系统/${event.group_id}.json`, "管理模式", "关闭");
        if (rrrrv == "开启"){
            crr_开关 = true;
        }
    }
    if(!(await checkOwner3(event, ctx, crr_开关))) return null;
    // ================== 判断身份 ==================
    let 参数188 = {group_id : event.group_id,user_id : event.self_id};
    const dp188 = await BOTAPI(ctx, "get_group_member_info", 参数188);
    let Robot身份 = (RC_group_role[(dp188?.role || "member")] || 0);//机器人身份等级
    if(Robot身份 < 2){
        await 发消息(event, [段_引用(event.message_id), 段_文本('窝好像木有权限改这个哎！～')]);
        return null;
    }
    // ================== 检 ==================
    const one_mub = message.match(/^更改群(名称|名字|头像)([\s\S]*)$/)[1];
    const two_mub = message.match(/^更改群(名称|名字|头像)([\s\S]*)$/)[2];
    const 字数 = (two_mub.length || 0);
    // ================== 改群头像的 ==================
    if(one_mub == "头像"){
        // ================== 检测图片数量 ==================
        const image = giveImages(event.message);//图片链接
        const 图片数量 = (image.length || 0);
        if(图片数量 == 0){
            await 发消息(event, [段_引用(event.message_id), 段_文本('请携带一张照片再发送哟～')]);
            return null;
        }
        // ================== 更改 ==================
        let 参数 = {"group_id":event.group_id, "file": image[0]};
        BOTAPI(ctx, "set_group_portrait", 参数);
        // ================== 输出 ==================
        await 发消息(event, [段_引用(event.message_id), 段_文本(`我马上就去把群头像改成介个图片的！`), 段_图片(image[0])]);
        return null;
    }else{
        // ================== 检 ==================
        if(字数 < 1 || two_mub == undefined){
            await 发消息(event, [段_引用(event.message_id), 段_文本('你介个内容好像无效唉？！')]);
            return null;
        }else{
            let 参数 = {"group_id": event.group_id, "group_name": two_mub};
            await BOTAPI(ctx, "set_group_name", 参数);
            await 发消息(event, [段_引用(event.message_id), 段_文本(`好哒！现在就把群名字改成↓\n${two_mub}`)]);
        }
        return null;
    }
}



if(message.match(/^我要头衔([\s\S]*)/)){
    // ================== 来源 ==================
    if(event.message_type != "group"){
        return null;
    }
    // ================== 授权判断 ==================
    if(!(await requireAuthorized(RC_sq, event))) return null;
    // ================== 判断 ==================
    let 开关 = readB(`筱筱吖/事件系统/${event.group_id}.json`, "自助头衔", "关闭");
    if(开关 == "关闭"){
        return null;
    }
    let 参数188 = {group_id : event.group_id,user_id : event.self_id};
    const dp188 = await BOTAPI(ctx, "get_group_member_info", 参数188);
    let Robot身份 = (RC_group_role[(dp188?.role || "member")] || 0);//机器人身份等级
    if(Robot身份 < 2){
        await 发消息(event, [段_引用(event.message_id), 段_文本('窝好像没有权限给你头衔哎～～')]);
        return null;
    }
    // ================== 正式 ==================
    const nr = (message.match(/^我要头衔([\s\S]*)/)[1] || "");
    let 参数 = {
        "group_id": event.group_id,
        "user_id": event.user_id,
        "special_title": nr
    };
    try {
        await BOTAPI(ctx, "set_group_special_title", 参数);
    } catch (e) {
        await 发消息(event, [段_引用(event.message_id), 段_文本(`设置头衔失败：${e?.message || e}`)]);
    }
}


if(message.match(/^设置头衔/)){
    // ================== 来源 ==================
    if(event.message_type != "group"){
        return null;
    }
    // ================== 授权判断 ==================
    if(!(await requireAuthorized(RC_sq, event))) return null;
    // ================== 最高主人检测 ==================
    let crr_开关 = false;
    if(event.message_type == "group"){
        let rrrrv = readB(`筱筱吖/事件系统/${event.group_id}.json`, "管理模式", "关闭");
        if (rrrrv == "开启"){
            crr_开关 = true;
        }
    }
    if(!(await checkOwner3(event, ctx, crr_开关))) return null;
    // ================== 判断权限 ==================
    let 参数188 = {group_id : event.group_id,user_id : event.self_id};
    const dp188 = await BOTAPI(ctx, "get_group_member_info", 参数188);
    let Robot身份 = (RC_group_role[(dp188?.role || "member")] || 0);//机器人身份等级
    if(Robot身份 < 2){
        await 发消息(event, [段_引用(event.message_id), 段_文本('窝好像没有权限设置头衔哎～～')]);
        return null;
    }
    // ================== 循环前置 ==================
    const pureText = giveText(event.message);
    const content = pureText.replace(/^设置头衔/, "").trim();
    const atUsers = giveAT(event.message);
    const rs = (atUsers.length || 0);//获取艾特人数
    if(rs == 0){
        await 发消息(event, [段_引用(event.message_id), 段_文本('介个功能需要艾特才能执行哦')]);
        return null;
    }
    let 组装消息 = `已把下面届些仁的头衔都改成一样的啦！`;
    组装消息 += `\n══════════════`;
    // ================== 循环开始 ==================
    for(let i = 0; i < rs; i++) {
        let 本次QQ = atUsers[i];
        let 参数 = {
            "group_id": event.group_id,
            "user_id": 本次QQ,
            "special_title": content
        };
        BOTAPI(ctx, "set_group_special_title", 参数);
        组装消息 += `\n${i + 1}.【${本次QQ}】`;
    }
    // ================== 输出方式 ==================
    if(rs > 15){
        const messages = [
            合并节点("[多选改头衔结果]", event.self_id, [段_文本(组装消息)])
        ];
    await 发合并消息(event, messages);
    }else{
        await 发消息(event, [段_引用(event.message_id), 段_文本(`${组装消息}`)]);
    }
    return null;
}



if(message.match(/^(全体头衔|全员头衔)([\s\S]*)/)){
    // ================== 来源 ==================
    if(event.message_type != "group"){
        return null;
    }
    // ================== 授权判断 ==================
    if(!(await requireAuthorized(RC_sq, event))) return null;
    // ================== 判断权限 ==================
    let 参数188 = {group_id : event.group_id,user_id : event.self_id};
    const dp188 = await BOTAPI(ctx, "get_group_member_info", 参数188);
    let Robot身份 = (RC_group_role[(dp188?.role || "member")] || 0);//机器人身份等级
    if(Robot身份 < 2){
        await 发消息(event, [段_引用(event.message_id), 段_文本('窝好像没有权限设置头衔哎～～')]);
        return null;
    }
    // ================== 最高主人检测 ==================
    let crr_开关 = false;
    if(event.message_type == "group"){
        let rrrrv = readB(`筱筱吖/事件系统/${event.group_id}.json`, "管理模式", "关闭");
        if (rrrrv == "开启"){
            crr_开关 = true;
        }
    }
    if(!(await checkOwner3(event, ctx, crr_开关))) return null;
    // ================== 访问接口 ==================
    let 参数 = {
        group_id : event.group_id
    };
    const dp = await BOTAPI(ctx, "get_group_member_list", 参数);
    // ================== 循环前置 ==================
    let data = dp;
    let 总人数 = Object.keys(data).length;
    if(总人数 == 0){
        //什么群tm0个人
        await 发消息(event, [段_引用(event.message_id), 段_文本('获取失败！1')]);
    }
    // ================== 循环前置 ==================
    const content = message.match(/^(全体头衔|全员头衔)([\s\S]*)/)[2] || "";
    let 组装消息 = ``;
    let 有效人数 = 0;
    // ================== 循环 ==================
    for(let i = 0; i < 总人数; i++) {
        let 是否机器人 = (data[i].is_robot || false);
        if(是否机器人){
            组装消息 += `\n❌${i+1}.${data[i].nickname}(${data[i].user_id})`;
        }else{
            组装消息 += `\n✅${i+1}.${data[i].nickname}(${data[i].user_id})`;
            let 参数 = {
                "group_id": event.group_id,
                "user_id": data[i].user_id,
                "special_title": content
            };
            BOTAPI(ctx, "set_group_special_title", 参数);
            有效人数++;
        }
    }
    // ================== 输出结果 ==================
    let 返回内容 = `已对【${有效人数}】位群友进行头衔更改～`;
    返回内容 += `\n══════════════`;
    返回内容 += 组装消息;
    if(总人数 >= 15){//合并输出
        const messages = [
            合并节点("[全员头衔]", event.self_id, [段_文本(返回内容)])
        ];
        await 发合并消息(event, messages);
    }else{//普通输出
        await 发消息(event, [段_引用(event.message_id), 段_文本(`${返回内容}`)]);
    }
    return null;
}





if(message.match(/^(全体|全)(禁言|解禁|禁|解)$/)){
    // ================== 来源 ==================
    if(event.message_type != "group"){
        return null;
    }
    
    // ================== 授权判断 ==================
    if(!(await requireAuthorized(RC_sq, event))) return null;
    // ================== 最高主人检测 ==================
    let crr_开关 = false;
    if(event.message_type == "group"){
        let rrrrv = readB(`筱筱吖/事件系统/${event.group_id}.json`, "管理模式", "关闭");
        if (rrrrv == "开启"){
            crr_开关 = true;
        }
    }
    if(!(await checkOwner3(event, ctx, crr_开关))) return null;
    
    // ================== 取类型 ==================
    const jy_tok = message.match(/^(全体|全)(禁言|解禁|禁|解)$/)[2];//值
    let jy_token = true;
    if(jy_tok == "禁言" || jy_tok == "禁"){
        jy_token = true;
    }else{
        jy_token = false;
    }
    
    // ================== 管理员身份验证 ==================
    let 参数188 = {group_id : event.group_id,user_id : event.self_id};
    const dp188 = await BOTAPI(ctx, "get_group_member_info", 参数188);
    let Robot身份 = (RC_group_role[(dp188?.role || "member")] || 0);
    if(Robot身份 < 2){
        await 发消息(event, [段_引用(event.message_id), 段_文本('窝没有群管权限唉～')]);
        return null;
    }
    
    // ================== 访问接口 ==================
    let 参数 = {
        group_id : event.group_id,
        enable : jy_token
    };
    //调用
    const dp = await BOTAPI(ctx, "set_group_whole_ban", 参数);
    
    // ================== 输出 ==================
    if(jy_tok == "禁言" || jy_tok == "禁"){
        await 发消息(event, [段_引用(event.message_id), 段_文本('这就把全体禁言给打开，让大家都不能说话！')]);
    }else{
        await 发消息(event, [段_引用(event.message_id), 段_文本('大家又可以说话啦！')]);
    }
    return null;
}


// 入口收紧：定长禁言只认「X禁 / X禁言」整词；经典禁言只认「禁言/解禁 + 可选秒数」。
// 旧版前缀匹配会让「禁言你」「禁言你行不行」这类日常语句也进入本分支（非主人还会先吃到主人校验的拒绝回复）。
if(message.match(/^(时|天|周|月)(禁言|禁)\s*$/) || message.match(/^(禁言|解禁)\s*(\d+)?\s*$/)){
    // ================== 授权判断 ==================
    if(!(await requireAuthorized(RC_sq, event))) return null;
    
    // ================== 最高主人检测 ==================
    let crr_开关 = false;
    if(event.message_type == "group"){
        let rrrrv = readB(`筱筱吖/事件系统/${event.group_id}.json`, "管理模式", "关闭");
        if (rrrrv == "开启"){
            crr_开关 = true;
        }
    }
    if(!(await checkOwner3(event, ctx, crr_开关))) return null;
    
    // ================== 解析指令：时/天/周/月禁言@人，或原 禁言@人 [秒] / 解禁@人 ==================
    const 单位禁言秒数 = { 时: 3600, 天: 86400, 周: 604800, 月: 2592000 };
    let mub_ly = "";
    let mub_time = 60;
    let mub_ly显示 = "";
    const 单位禁言匹配 = message.match(/^(时|天|周|月)(禁言|禁)\s*$/);
    if(单位禁言匹配){
        mub_ly = "禁言";
        mub_time = 单位禁言秒数[单位禁言匹配[1]] || 60;
        mub_ly显示 = `${单位禁言匹配[1]}${单位禁言匹配[2]}`;
    }else{
        // 只接受「禁言/解禁」后跟可选空白和纯数字秒数；中间夹任何其它文字都不算禁言指令
        const 经典匹配 = message.match(/^(禁言|解禁)\s*(\d+)?\s*$/);
        if(!经典匹配){
            return null;
        }
        mub_ly = 经典匹配[1];
        mub_ly显示 = mub_ly;
        mub_time = 经典匹配[2] ? Number(经典匹配[2]) : 60;
        if(mub_ly == "解禁"){
            mub_time = 0;
        }
    }
    const atUsers = giveATUnique(event.message);
    const rs = (atUsers.length || 0);//获取艾特人数
    
    // ================== 判断人数 ==================
    if(rs == 0){
        //await 发消息(event, [段_引用(event.message_id), 段_文本('请要艾特别人发送哦～')]);
        return null;
    }
    
    // ================== 事前准备 ==================
    let 参数188 = {group_id : event.group_id,user_id : event.self_id};
    const dp188 = await BOTAPI(ctx, "get_group_member_info", 参数188);
    let Robot身份 = (RC_group_role[(dp188?.role || "member")] || 0);//机器人身份等级
    if(Robot身份 < 2){
        await 发消息(event, [段_引用(event.message_id), 段_文本('窝没有群管权限唉～')]);
        return null;
    }
    
    // ================== 循环 ==================
    let 组装消息 = "";
    let 有效人数 = 0;
    for(let i = 0; i <  rs; i++) {
        let 本次QQ = atUsers[i];
        // ================== 身份验证 ==================
        let 参数199 = {group_id : event.group_id,user_id : 本次QQ};
        let dp199 = await BOTAPI(ctx, "get_group_member_info", 参数199);
        let User身份 = (RC_group_role[(dp199?.role || "member")] || 0);//目标身份
        if(User身份 >= Robot身份){//比机器人大 | 同级
            组装消息 += `\n❌${i+1}.${本次QQ}:权限不足`;
            continue;
        }else{
            // ================== 调用接口 ==================
            let 参数 = {
                group_id : event.group_id,
                user_id : 本次QQ,
                duration : mub_time
            };
            // BOTAPI 对 retcode≠0 只告警不抛错，需 await 后自查返回值，成功/失败分别入明细
            try{
                const dp_ban = await BOTAPI(ctx, "set_group_ban", 参数);
                const ban失败 = (dp_ban && typeof dp_ban === "object" && dp_ban.retcode != null && Number(dp_ban.retcode) !== 0);
                if(ban失败){
                    const 失败原因 = dp_ban.wording || dp_ban.message || `retcode=${dp_ban.retcode}`;
                    组装消息 += `\n❌${i+1}.${本次QQ}:${mub_ly}失败(${失败原因})`;
                }else if(mub_ly == "禁言"){
                    组装消息 += `\n✅${i+1}.${本次QQ}:禁言${mub_time}秒`;
                    有效人数++;
                }else{
                    组装消息 += `\n✅${i+1}.${本次QQ}:解禁成功`;
                    有效人数++;
                }
            }catch(e){
                组装消息 += `\n❌${i+1}.${本次QQ}:${mub_ly}失败(${e?.message || "未知错误"})`;
            }
        }
    }
    
    // ================== 二次组装 ==================
    let 返回内容 = `已对【${有效人数}】人有效${mub_ly显示}啦～`;
    返回内容 += "\n══════════════";
    返回内容 += 组装消息;
    
    // ================== 输出方式 ==================
    if(rs >= 15){
        const messages = [
            合并节点(`[${mub_ly显示}人数]`, event.self_id, [段_文本(返回内容)])
        ];
        await 发合并消息(event, messages);
    }else{
        await 发消息(event, [段_引用(event.message_id), 段_文本(`${返回内容}`)]);
    }
    return null;
}




// 入口收紧：踢出/黑踢不带文本参数（目标只来自@），只认整词，杜绝「踢出你」等日常语句误触发
if(message.match(/^(踢出|黑踢)\s*$/)){
    // ================== 授权判断 ==================
    if(!(await requireAuthorized(RC_sq, event))) return null;

    // ================== 最高主人检测 ==================
    let crr_开关 = false;
    if(event.message_type == "group"){
        let rrrrv = readB(`筱筱吖/事件系统/${event.group_id}.json`, "管理模式", "关闭");
        if (rrrrv == "开启"){
            crr_开关 = true;
        }
    }
    if(!(await checkOwner3(event, ctx, crr_开关))) return null;

    // ================== 获取数值 ==================
    const mub_ly = message.match(/^(踢出|黑踢)\s*$/)[1];//值
    const atUsers = giveATUnique(event.message);//目标去重：重复@只算一次
    const rs = (atUsers.length || 0);//获取艾特人数
    
    // ================== 判断人数 ==================
    if(rs == 0){
        //await 发消息(event, [段_引用(event.message_id), 段_文本('请要艾特别人发送哦～')]);
        return null;
    }
    
    // ================== 事前准备 ==================
    let 参数188 = {group_id : event.group_id,user_id : event.self_id};
    const dp188 = await BOTAPI(ctx, "get_group_member_info", 参数188);
    let Robot身份 = (RC_group_role[(dp188?.role || "member")] || 0);//机器人身份等级
    if(Robot身份 < 2){
        await 发消息(event, [段_引用(event.message_id), 段_文本('窝没有群管权限唉～')]);
        return null;
    }
    
    // ================== 获取参数 ==================
    let type = false;
    if(mub_ly == "黑踢"){
        type = true;
    }else{
        type = false;
    }
    
    // ================== 循环（逐人真实踢出，按调用结果上报） ==================
    let 组装消息 = "";
    let 有效人数 = 0;
    for(let i = 0; i <  rs; i++) {
        let 本次QQ = atUsers[i];
        // ================== 身份验证 ==================
        let 参数199 = {group_id : event.group_id,user_id : 本次QQ};
        let dp199 = await BOTAPI(ctx, "get_group_member_info", 参数199);
        let User身份 = (RC_group_role[(dp199?.role || "member")] || 0);//目标身份
        if(User身份 >= Robot身份){//比机器人大 | 同级
            组装消息 += `\n❌${i+1}.${本次QQ}:权限不足`;
            continue;
        }else{
            // ================== 调用接口 ==================
            // kickGroupMembers 内含 SnowLuma 假失败兜底；BOTAPI 对 retcode≠0 只告警不抛错，需自查返回值
            try{
                const dp_kick = await kickGroupMembers(ctx, event.group_id, [本次QQ], type);
                const kick失败 = (dp_kick && typeof dp_kick === "object" && dp_kick.retcode != null && Number(dp_kick.retcode) !== 0);
                if(kick失败){
                    const 失败原因 = dp_kick.wording || dp_kick.message || `retcode=${dp_kick.retcode}`;
                    组装消息 += `\n❌${i+1}.${本次QQ}:${mub_ly}失败(${失败原因})`;
                }else{
                    组装消息 += `\n✅${i+1}.${本次QQ}:${mub_ly == "踢出" ? "普通踢出" : "拉黑踢出"}`;
                    有效人数++;
                }
            }catch(e){
                组装消息 += `\n❌${i+1}.${本次QQ}:${mub_ly}失败(${e?.message || "未知错误"})`;
            }
        }
    }
    
    // ================== 二次组装 ==================
    let 返回内容 = `已对【${有效人数}】人有效${mub_ly}啦～`;
    返回内容 += "\n══════════════";
    返回内容 += 组装消息;
    
    // ================== 输出方式 ==================
    if(rs >= 15){
        const messages = [
            合并节点(`[${mub_ly}人数]`, event.self_id, [段_文本(返回内容)])
        ];
        await 发合并消息(event, messages);
    }else{
        await 发消息(event, [段_引用(event.message_id), 段_文本(`${返回内容}`)]);
    }
    return null;
}



// 入口收紧：上管/下管不带文本参数（目标只来自@），只认整词，杜绝「上管你」等日常语句误触发
if(message.match(/^(上管|下管)\s*$/)){
    // ================== 授权判断 ==================
    if(!(await requireAuthorized(RC_sq, event))) return null;

    // ================== 最高主人检测 ==================
    if(!(await checkOwner3(event, ctx, false))) return null;

    // ================== 获取数值 ==================
    const mub_ly = message.match(/^(上管|下管)\s*$/)[1];//值
    const atUsers = giveATUnique(event.message);//目标去重：重复@只算一次
    const rs = (atUsers.length || 0);//获取艾特人数
    
    // ================== 判断人数 ==================
    if(rs == 0){
        //await 发消息(event, [段_引用(event.message_id), 段_文本('请要艾特别人发送哦～')]);
        return null;
    }
    
    // ================== 事前准备 ==================
    let 参数188 = {group_id : event.group_id,user_id : event.self_id};
    const dp188 = await BOTAPI(ctx, "get_group_member_info", 参数188);
    let Robot身份 = (RC_group_role[(dp188?.role || "member")] || 0);//机器人身份等级
    if(Robot身份 != 3){
        await 发消息(event, [段_引用(event.message_id), 段_文本('窝没有群主权限唉～')]);
        return null;
    }
    
    // ================== 获取参数 ==================
    let type = false;
    if(mub_ly == "上管"){
        type = true;
    }else{
        type = false;
    }
    
    // ================== 循环 ==================
    let 组装消息 = "";
    let 有效人数 = 0;
    for(let i = 0; i <  rs; i++) {
        let 本次QQ = atUsers[i];
        // ================== 身份验证 ==================
        let 参数199 = {group_id : event.group_id,user_id : 本次QQ};
        let dp199 = await BOTAPI(ctx, "get_group_member_info", 参数199);
        let User身份 = (RC_group_role[(dp199?.role || "member")] || 0);//目标身份
        // ================== 前置判断 ==================
        if(mub_ly == "上管"){
            if(User身份 >= 2){//已是管理/群主
                组装消息 += `\n❌${i+1}.${本次QQ}:已经是啦`;
                continue;
            }
        }else{
            if(User身份 < 2){//本就不是管理
                组装消息 += `\n❌${i+1}.${本次QQ}:已就不是`;
                continue;
            }
        }
        // ================== 访问接口 ==================
        // BOTAPI 对 retcode≠0 只告警不抛错，需 await 后自查返回值，成功/失败分别入明细
        let 参数 = {
            group_id : event.group_id,
            user_id : 本次QQ,
            enable : type
        };
        try{
            const dp_admin = await BOTAPI(ctx, "set_group_admin", 参数);
            const admin失败 = (dp_admin && typeof dp_admin === "object" && dp_admin.retcode != null && Number(dp_admin.retcode) !== 0);
            if(admin失败){
                const 失败原因 = dp_admin.wording || dp_admin.message || `retcode=${dp_admin.retcode}`;
                组装消息 += `\n❌${i+1}.${本次QQ}:${mub_ly}失败(${失败原因})`;
            }else{
                组装消息 += `\n✅${i+1}.${本次QQ}:${mub_ly == "上管" ? "新上位" : "被下台了"}`;
                有效人数++;
            }
        }catch(e){
            组装消息 += `\n❌${i+1}.${本次QQ}:${mub_ly}失败(${e?.message || "未知错误"})`;
        }
    }
    
    // ================== 二次组装 ==================
    let 返回内容 = `已对【${有效人数}】人有效${mub_ly}啦～`;
    返回内容 += "\n══════════════";
    返回内容 += 组装消息;
    
    // ================== 输出方式 ==================
    if(rs >= 15){
        const messages = [
            合并节点(`[${mub_ly}人数]`, event.self_id, [段_文本(返回内容)])
        ];
        await 发合并消息(event, messages);
    }else{
        await 发消息(event, [段_引用(event.message_id), 段_文本(`${返回内容}`)]);
    }
    return null;
}


if(message == "获取禁言列表"){
    // ================== 来源 ==================
    if(event.message_type != "group"){
        return null;
    }
    
    // ================== 授权判断 ==================
    if(!(await requireAuthorized(RC_sq, event))) return null;
    
    // ================== 调用接口 ==================
    let 参数 = {
        group_id : event.group_id
    };
    const dp = await BOTAPI(ctx, "get_group_shut_list", 参数);
    const count =(dp.length || 0);
    
    // ================== 判断 ==================
    if(count == 0){
        await 发消息(event, [段_引用(event.message_id), 段_文本('没有人被禁言啦～')]);
        return null;
    }
    
    // ================== 循环 ==================
    let 组装消息 = `共有【${count}】人处于禁言状态:`;
    组装消息 += "\n══════════════";
    for(let i = 0; i < count; i++) {
        let QQ = mkCompatUserId(dp[i]) || "0";
        let 昵称 = mkCompatNickname(dp[i]);
        const shutTs = mkCompatShutUpTime(dp[i]);
        let 禁言结束时间 = shutTs > 0 ? timeA("y-m-d H:i:s", shutTs) : "-";
        组装消息 += `\n${i+1}.${QQ}(${昵称})`;
        组装消息 += `\n[结束时间]:${禁言结束时间}`;
        if(i+1 == count){
            组装消息 += `\n══════════════`;
        }else{
            组装消息 += `\n-----------------`;
        }
    }
    
    // ================== 输出 ==================
    if(count >= 10){
        const messages = [
            合并节点("[禁言列表]", event.self_id, [段_文本(组装消息)])
        ];
        await 发合并消息(event, messages);
    }else{
        await 发消息(event, [段_引用(event.message_id), 段_文本(`${组装消息}`)]);
    }
    return null;
}

if(message == "全解群员"){
    // ================== 来源 ==================
    if(event.message_type != "group"){
        return null;
    }
    // ================== 授权判断 ==================
    if(!(await requireAuthorized(RC_sq, event))) return null;
    // ================== 最高主人检测 ==================
    let crr_开关 = false;
    if(event.message_type == "group"){
        let rrrrv = readB(`筱筱吖/事件系统/${event.group_id}.json`, "管理模式", "关闭");
        if (rrrrv == "开启"){
            crr_开关 = true;
        }
    }
    if(!(await checkOwner3(event, ctx, crr_开关))) return null;

    // ================== 机器人权限检测 ==================
    let 参数188 = {group_id : event.group_id,user_id : event.self_id};
    const dp188 = await BOTAPI(ctx, "get_group_member_info", 参数188);
    let Robot身份 = (RC_group_role[(dp188?.role || "member")] || 0);//机器人身份等级
    if(Robot身份 < 2){
        await 发消息(event, [段_引用(event.message_id), 段_文本('窝没有群管权限唉～')]);
        return null;
    }

    // ================== 获取禁言列表 ==================
    let 禁言列表 = [];
    try{
        禁言列表 = await BOTAPI(ctx, "get_group_shut_list", { group_id: event.group_id });
    }catch(e){
        await 发消息(event, [段_引用(event.message_id), 段_文本(`获取禁言列表失败：${e?.message || "未知错误"}`)]);
        return null;
    }
    const count = (禁言列表?.length || 0);
    if(count == 0){
        await 发消息(event, [段_引用(event.message_id), 段_文本('没有人被禁言啦～')]);
        return null;
    }

    // ================== 循环解除禁言 ==================
    let 成功人数 = 0;
    let 跳过人数 = 0;
    let 失败人数 = 0;
    let 明细 = ``;
    for(let i = 0; i < count; i++){
        const 本次QQ = mkCompatUserId(禁言列表[i]);
        const 本次昵称 = mkCompatNickname(禁言列表[i]);
        if(!/^\d+$/.test(本次QQ)){
            失败人数++;
            明细 += `\n❌${i+1}.${本次QQ || "unknown"}(${本次昵称})：QQ无效`;
            continue;
        }
        try{
            const dp199 = await BOTAPI(ctx, "get_group_member_info", { group_id: event.group_id, user_id: 本次QQ });
            const User身份 = (RC_group_role[(dp199?.role || "member")] || 0);//目标身份
            if(User身份 >= Robot身份){
                跳过人数++;
                明细 += `\n⏭️${i+1}.${本次QQ}(${本次昵称})：权限不足(同级/更高)`;
                continue;
            }

            await BOTAPI(ctx, "set_group_ban", {
                group_id : event.group_id,
                user_id : 本次QQ,
                duration : 0
            });
            成功人数++;
            明细 += `\n✅${i+1}.${本次QQ}(${本次昵称})：解除成功`;
        }catch(e){
            失败人数++;
            明细 += `\n❌${i+1}.${本次QQ}(${本次昵称})：${e?.message || "解除失败"}`;
        }
    }

    // ================== 输出 ==================
    let 返回内容 = `全解群员执行完成`;
    返回内容 += `\n══════════════`;
    返回内容 += `\n[禁言总数] ${count}`;
    返回内容 += `\n[解除成功] ${成功人数}`;
    返回内容 += `\n[权限跳过] ${跳过人数}`;
    返回内容 += `\n[执行失败] ${失败人数}`;
    返回内容 += `\n══════════════`;
    返回内容 += 明细;
    返回内容 += `\n══════════════`;

    if(count > 10){
        const messages = [
            合并节点("[全解群员]", event.self_id, [段_文本(返回内容)])
        ];
        await 发合并消息(event, messages);
    }else{
        await 发消息(event, [段_引用(event.message_id), 段_文本(`${返回内容}`)]);
    }
    return null;
}


if(message.match(/^设置骨灰获取标准([0-9]+)(天|月|)$/)){
    // ================== 来源 ==================
    if(event.message_type != "group"){
        return null;
    }
    // ================== 授权判断 ==================
    if(!(await requireAuthorized(RC_sq, event))) return null;
    // ================== 最高主人检测 ==================
    let crr_开关 = false;
    if(event.message_type == "group"){
        let rrrrv = readB(`筱筱吖/事件系统/${event.group_id}.json`, "管理模式", "关闭");
        if (rrrrv == "开启"){
            crr_开关 = true;
        }
    }
    if(!(await checkOwner3(event, ctx, crr_开关))) return null;
    // ================== 解析参数 ==================
    const parsed = mk解析骨灰获取标准指令(message);
    if(!parsed){
        await 发消息(event, [段_引用(event.message_id), 段_文本('指令格式有误')]);
        return null;
    }
    if(!parsed.ok){
        await 发消息(event, [段_引用(event.message_id), 段_文本(parsed.err)]);
        return null;
    }
    const 旧秒 = mk读取骨灰获取标准秒(event.group_id);
    if(旧秒 === parsed.秒数){
        await 发消息(event, [段_引用(event.message_id), 段_文本(`当前标准已是【${parsed.展示}】啦！`)]);
        return null;
    }
    writeB(mk骨灰获取标准路径(event.group_id), "秒数", parsed.秒数);
    await 发消息(event, [段_引用(event.message_id), 段_文本(`好哒！「获取骨灰群员」的筛选标准已设为【${parsed.展示}】`)]);
    return null;
}


if(message.match(/^获取(?:七日|半月|一月|)骨灰群员(列表|)$/)){
    // ================== 来源 ==================
    if(event.message_type != "group"){
        return null;
    }
    // ================== 授权判断 ==================
    if(!(await requireAuthorized(RC_sq, event))) return null;
    // ================== 最高主人检测 ==================
    let crr_开关 = false;
    if(event.message_type == "group"){
        let rrrrv = readB(`筱筱吖/事件系统/${event.group_id}.json`, "管理模式", "关闭");
        if (rrrrv == "开启"){
            crr_开关 = true;
        }
    }
    if(!(await checkOwner3(event, ctx, crr_开关))) return null;

    // ================== 筛选标准 ==================
    const 前缀 = (message.match(/^获取(七日|半月|一月|)骨灰群员/)?.[1] || "");
    let 标准秒;
    const 标准标签 = mk骨灰筛选标准标签(前缀);
    if(前缀 === "七日"){
        标准秒 = MK_骨灰_预设标准秒["七日"];
    }else if(前缀 === "半月"){
        标准秒 = MK_骨灰_预设标准秒["半月"];
    }else if(前缀 === "一月"){
        标准秒 = MK_骨灰_预设标准秒["一月"];
    }else{
        标准秒 = mk读取骨灰获取标准秒(event.group_id);
    }
    
    writeA(`筱筱吖/群管系统/清理骨灰/${event.group_id}/目前数据.json`, "[]");
    // ================== 访问接口 ==================
    let 参数 = {
        group_id : event.group_id
    };
    const dp = await BOTAPI(ctx, "get_group_member_list", 参数);
    // ================== 循环前置 ==================
    let data = dp;
    let 总人数 = Object.keys(data).length;
    if(总人数 == 0){
        await 发消息(event, [段_引用(event.message_id), 段_文本('获取失败！')]);
    }
    let 现在时间 = Math.floor(Date.now() / 1000);
    let 数据_one = [];
    // ================== 循环 ==================
    for(let i = 0; i < 总人数; i++) {
        let 最后发言 = data[i].last_sent_time;
        let 未发言时长 = 现在时间 - 最后发言;
        // ================== 记录 ==================
        if(未发言时长 >= 标准秒){
            数据_one.push({
                "QQ":data[i]["user_id"],
                "昵称":data[i]["nickname"],
                "时长":未发言时长,
                "身份":data[i]["role"]
            });
        }
    }
    // ================== 二次验证 ==================
    let 总人数_2 = (数据_one.length || 0);
    if(总人数_2 == 0){
        await 发消息(event, [段_引用(event.message_id), 段_文本(`好像没获取到哎～\n当前筛选标准：${标准标签}`)]);
        return null;
    }
    let 组装消息 = ``;
    数据_one.sort((a, b) => b.时长 - a.时长);
    writeA(`筱筱吖/群管系统/清理骨灰/${event.group_id}/目前数据.json`, JSON.stringify(数据_one));
    // ================== 二次循环 ==================
    for(let i = 0; i < 总人数_2; i++) {
        let 本次QQ = 数据_one[i]["QQ"];
        let 本次昵称 = 数据_one[i]["昵称"];
        let 时长 = timeB("d", 数据_one[i]["时长"]);
        组装消息 += `\n${i + 1}.${本次昵称}(${本次QQ})(${时长}天)`;
    }
    // ================== 组装消息 ==================
    let 返回内容 = `筛选标准：${标准标签}`;
    返回内容 += `\n共计有【${总人数_2}】位高冷人士`;
    返回内容 += `\n══════════════`;
    返回内容 += 组装消息;
    返回内容 += `\n══════════════`;
    // ================== 输出方式 ==================
    if(总人数_2 >= 15){
        const messages = [合并节点("[你这群这么多啊]", event.self_id, [段_文本(返回内容)])];
        await 发合并消息(event, messages);
    }else{
        await 发消息(event, [段_引用(event.message_id), 段_文本(`${返回内容}`)]);
    }
    return null;
}



if(message.match(/^查看骨灰群员(列表|)$/)){
    // ================== 来源 ==================
    if(event.message_type != "group"){
        return null;
    }
    // ================== 授权判断 ==================
    if(!(await requireAuthorized(RC_sq, event))) return null;
    // ================== 获取数据 ==================
    const data = JSON.parse(readA(`筱筱吖/群管系统/清理骨灰/${event.group_id}/目前数据.json`) || "[]");
    const count = (data.length || 0);
    // ================== 判断 ==================
    if(count == 0){
        await 发消息(event, [段_引用(event.message_id), 段_文本('木有数据哎～！\n你先去「获取骨灰群员」八～！')]);
        return null;
    }
    // ================== 循环前置 ==================
    let 组装消息 = ``;
    // ================== 循环 ==================
    for(let i = 0; i < count; i++) {
        let 本次QQ = data[i]["QQ"];
        let 本次昵称 = data[i]["昵称"];
        let 时长 = timeB("d", data[i]["时长"]);
        组装消息 += `\n${i + 1}.${本次昵称}(${本次QQ})(${时长}天)`;
    }
    // ================== 组装消息 ==================
    let 返回内容 = `共计有【${count}】位高冷人士`;
    返回内容 += `\n----------------------`;
    返回内容 += `\n可用指令:`;
    返回内容 += `\n - 取消骨灰群员QQ[QQ号]`;
    返回内容 += `\n - 取消骨灰群员序号[序号]`;
    返回内容 += `\n - 取消骨灰群员序号[序号]-[序号]`;
    返回内容 += `\n - 确定清理全部骨灰群员`;
    返回内容 += `\n - 提醒骨灰群员`;
    返回内容 += `\n - 提醒骨灰群员[内容]`;
    返回内容 += `\n══════════════`;
    返回内容 += 组装消息;
    返回内容 += `\n══════════════`;
    // ================== 输出方式 ==================
    if(count >= 15){
        const messages = [
            合并节点("[骨灰群员列表]", event.self_id, [段_文本(返回内容)])
        ];
        await 发合并消息(event, messages);
    }else{
        await 发消息(event, [段_引用(event.message_id), 段_文本(`${返回内容}`)]);
    }
    return null;
}



if(message.match(/^取消骨灰群员(序号|QQ)([0-9]+)(-|_|.|)([0-9]+|)$/)){
    // ================== 来源 ==================
    if(event.message_type != "group"){
        return null;
    }
    // ================== 授权判断 ==================
    if(!(await requireAuthorized(RC_sq, event))) return null;
    // ================== 最高主人检测 ==================
    let crr_开关 = false;
    if(event.message_type == "group"){
        let rrrrv = readB(`筱筱吖/事件系统/${event.group_id}.json`, "管理模式", "关闭");
        if (rrrrv == "开启"){
            crr_开关 = true;
        }
    }
    if(!(await checkOwner3(event, ctx, crr_开关))) return null;
    // ================== 获取数据 ==================
    let data = JSON.parse(readA(`筱筱吖/群管系统/清理骨灰/${event.group_id}/目前数据.json`) || "[]");
    const count = (data.length || 0);
    const 类型 = message.match(/^取消骨灰群员(序号|QQ)([0-9]+)(-|_|.|)([0-9]+|)$/)[1];
    const 值1 = Number(message.match(/^取消骨灰群员(序号|QQ)([0-9]+)(-|_|.|)([0-9]+|)$/)[2]);
    const 值2 = Number(message.match(/^取消骨灰群员(序号|QQ)([0-9]+)(-|_|.|)([0-9]+|)$/)[4]);
    // ================== 判断 ==================
    if(count == 0){
        await 发消息(event, [段_引用(event.message_id), 段_文本('木有数据哎～！\n你先去「获取骨灰群员」八～！')]);
        return null;
    }
    let 返回内容 = ``;
    // ================== 方式 ==================
    if(类型 == "QQ"){
        let 被删除用户 = data.find(item => item.QQ === 值1);
        if(!被删除用户){
            await 发消息(event, [段_引用(event.message_id), 段_文本('用户不存在列表！')]);
            return null;
        }
        data = data.filter(item => item.QQ !== 值1);//过滤目标
        返回内容 += `这就把【${值1}】给取消啦！你再看看列表吧！`;
    }
    if(类型 == "序号"){
        if(值2 && (值1 == 值2 || 值1 > 值2 || 值1 == 0 || 值2 == 0)){
            await 发消息(event, [段_引用(event.message_id), 段_文本('操作无效')]);
            return null;
        }
        let 范围 = 1;
        if(值2){
            范围 = 值2 - 值1 + 1;
        }else{
            范围 = 1;
        }
        // ================== 循环前置 ==================
        let 被删除用户 = data[值1 - 1];
        if(!被删除用户){
            await 发消息(event, [段_引用(event.message_id), 段_文本(`序号${值1}不存在列表！`)]);
            return null;
        }
        // ================== 循环 ==================
        for(let i = 值1 - 1; i < 值1 - 1 + 范围; i++){
            let yh_qq = data[i]["QQ"];
            返回内容 += `\n${i + 1}.【${yh_qq}】`;
        }
        data.splice(值1 - 1, 范围);//删除几个
    }
    // ================== 输出 ==================
    writeA(`筱筱吖/群管系统/清理骨灰/${event.group_id}/目前数据.json`, JSON.stringify(data));
    await 发消息(event, [段_引用(event.message_id), 段_文本(`${返回内容}`)]);
    return null;
}


if(message.match(/^确定清理全部骨灰群员$/)){
    // ================== 来源 ==================
    if(event.message_type != "group"){
        return null;
    }
    // ================== 授权判断 ==================
    if(!(await requireAuthorized(RC_sq, event))) return null;
    // ================== 最高主人检测 ==================
    let crr_开关 = false;
    if(event.message_type == "group"){
        let rrrrv = readB(`筱筱吖/事件系统/${event.group_id}.json`, "管理模式", "关闭");
        if (rrrrv == "开启"){
            crr_开关 = true;
        }
    }
    if(!(await checkOwner3(event, ctx, crr_开关))) return null;
    // ================== 获取数据 ==================
    let data = JSON.parse(readA(`筱筱吖/群管系统/清理骨灰/${event.group_id}/目前数据.json`) || "[]");
    const count = (data.length || 0);
    // ================== 判断 ==================
    if(count == 0){
        await 发消息(event, [段_引用(event.message_id), 段_文本('木有数据哎～！\n你先去「获取骨灰群员」八～！')]);
        return null;
    }
    let 参数188 = {group_id : event.group_id,user_id : event.self_id};
    const dp188 = await BOTAPI(ctx, "get_group_member_info", 参数188);
    let Robot身份 = (RC_group_role[(dp188?.role || "member")] || 0);//机器人身份等级
    if(Robot身份 < 2){
        await 发消息(event, [段_引用(event.message_id), 段_文本('窝好像没有权限清理吧？～～')]);
        return null;
    }
    let 真数据 = [];
    let 有效人数 = 0;
    let 表面工作 = ``;
    // ================== 循环 ==================
    for(let i = 0; i < count; i++){
        let 本次身份等级 = (RC_group_role[(data[i]["身份"] || "member")] || 0);
        let 本次QQ = data[i]["QQ"];
        if(本次身份等级 >= Robot身份){
            表面工作 += `\n${i + 1}.【${本次QQ}】❌权限不足`;
        }else{
            表面工作 += `\n${i + 1}.【${本次QQ}】✅`;
            真数据.push(本次QQ);
            有效人数++;
        }
    }
    // ================== 人数判断 ==================
    if(有效人数 == 0){
        await 发消息(event, [段_引用(event.message_id), 段_文本('可能是权限不足，导致列表页面我一个人都清不了！')]);
        return null;
    }
    // ================== 执行清理 ==================
    writeA(`筱筱吖/群管系统/清理骨灰/${event.group_id}/目前数据.json`, "[]");
    kickGroupMembersFireAndForget(ctx, event.group_id, 真数据, false);
    // ================== 输出 ==================
    let 返回内容 = `共有效清理【${有效人数}】位骨灰`;
    返回内容 += `\n══════════════`;
    返回内容 += 表面工作;
    返回内容 += `\n══════════════`;
    if(有效人数 >= 15){
        const messages = [合并节点("[清空列表]", event.self_id, [段_文本(返回内容)])];
        await 发合并消息(event, messages);
    }else{
        await 发消息(event, [段_引用(event.message_id), 段_文本(`${返回内容}`)]);
    }
    return null;
}


if(message.match(/^提醒骨灰群员(?:\(([\s\S]*)\)|([\s\S]*))?$/)){
    // ================== 来源 ==================
    if(event.message_type != "group"){
        return null;
    }
    // ================== 授权判断 ==================
    if(!(await requireAuthorized(RC_sq, event))) return null;
    // ================== 最高主人检测 ==================
    let crr_开关 = false;
    if(event.message_type == "group"){
        let rrrrv = readB(`筱筱吖/事件系统/${event.group_id}.json`, "管理模式", "关闭");
        if (rrrrv == "开启"){
            crr_开关 = true;
        }
    }
    if(!(await checkOwner3(event, ctx, crr_开关))) return null;
    // ================== 获取数据 ==================
    const data = JSON.parse(readA(`筱筱吖/群管系统/清理骨灰/${event.group_id}/目前数据.json`) || "[]");
    const count = (data.length || 0);
    if(count == 0){
        await 发消息(event, [段_引用(event.message_id), 段_文本('木有数据哎～！\n你先去「获取骨灰群员」八～！')]);
        return null;
    }
    // ================== 提醒内容 ==================
    let 自定义内容 = "";
    try {
        const 匹配结果 = message.match(/^提醒骨灰群员(?:\(([\s\S]*)\)|([\s\S]*))?$/);
        自定义内容 = ((匹配结果?.[1] ?? 匹配结果?.[2] ?? "") + "").trim();
    } catch {
        自定义内容 = "";
    }
    let 提醒内容 = 自定义内容 || `喂喂喂，你还在嘛？群聊:${event.group_id} 提醒你要活跃一下咯~`;

    // ================== 过滤可提醒对象（跳过群主/管理员/机器人） ==================
    // 以实时群成员信息为准，避免仅依赖缓存列表字段导致误发
    let 群成员实时映射 = {};
    try{
        const 实时成员列表 = await BOTAPI(ctx, "get_group_member_list", { group_id: event.group_id });
        const arr = Array.isArray(实时成员列表) ? 实时成员列表 : [];
        for(let i = 0; i < arr.length; i++){
            const m = arr[i] || {};
            群成员实时映射[String(m.user_id || "")] = m;
        }
    }catch(e){
        logger.error(`[提醒骨灰群员] 拉取实时成员失败: ${e?.message || e}`);
    }
    const 机器人QQ = String(event.self_id || "");
    const 待提醒列表 = [];
    const 跳过明细 = [];
    for(let i = 0; i < count; i++){
        const item = data[i] || {};
        const qq = String(item["QQ"] || "").trim();
        const 实时成员 = 群成员实时映射[qq] || {};
        const 身份 = String(实时成员.role || item["身份"] || "member");
        const isRobot = (
            qq === 机器人QQ ||
            实时成员.is_robot === true ||
            实时成员.is_bot === true ||
            item["是机器人"] === true ||
            item["is_robot"] === true
        );
        if(!/^\d+$/.test(qq)){
            跳过明细.push(`${i + 1}.【${qq || "unknown"}】❌QQ无效`);
            continue;
        }
        if(身份 === "owner" || 身份 === "admin" || isRobot){
            跳过明细.push(`${i + 1}.【${qq}】⏭️已跳过(${isRobot ? "机器人" : (身份 === "owner" ? "群主" : "管理员")})`);
            continue;
        }
        待提醒列表.push({ qq, idx: i + 1 });
    }
    const 总待提醒 = 待提醒列表.length;
    if(总待提醒 == 0){
        await 发消息(event, [段_引用(event.message_id), 段_文本('可提醒对象为0（群主/管理员/机器人已自动跳过）')]);
        return null;
    }

    // ================== 预计耗时（仅在列表总数 > 20 时启用节流） ==================
    const 启用节流 = count > 20;
    const 预计延迟次数 = 启用节流 ? Math.floor((总待提醒 - 1) / 10) : 0;
    const 预计延迟秒 = 预计延迟次数 * 2;
    await 发消息(event, [
        段_引用(event.message_id),
        段_文本(
            `开始提醒骨灰群员啦～\n` +
            `总列表:${count} 人\n可提醒:${总待提醒} 人\n` +
            `预计额外等待:${预计延迟秒} 秒${启用节流 ? "（每完成10人延迟2秒）" : "（列表≤20，不启用延迟）"}`,
        ),
    ]);

    // ================== 执行提醒（群来源临时会话） ==================
    let 成功 = 0;
    let 失败 = 0;
    let 执行明细 = ``;
    for(let i = 0; i < 总待提醒; i++){
        const qq = 待提醒列表[i].qq;
        try{
            const fakePrivateEvent = { message_type: "private", user_id: qq, group_id: event.group_id };
            await 发消息(fakePrivateEvent, [段_文本(提醒内容)], { group_id: event.group_id });
            成功++;
            执行明细 += `\n${待提醒列表[i].idx}.【${qq}】✅`;
        }catch(e){
            失败++;
            执行明细 += `\n${待提醒列表[i].idx}.【${qq}】❌${e?.message || "发送失败"}`;
        }
        // 列表总数 > 20 时，每完成有效发送10人次，延迟2秒再继续
        if(启用节流 && 成功 > 0 && 成功 % 10 == 0 && i < 总待提醒 - 1){
            await new Promise(resolve => setTimeout(resolve, 2000));
        }
    }

    // ================== 总结输出 ==================
    let 返回内容 = `骨灰提醒执行完成`;
    返回内容 += `\n══════════════`;
    返回内容 += `\n[总列表] ${count}`;
    返回内容 += `\n[可提醒] ${总待提醒}`;
    返回内容 += `\n[成功] ${成功}`;
    返回内容 += `\n[失败] ${失败}`;
    if(跳过明细.length){
        返回内容 += `\n[跳过] ${跳过明细.length}`;
    }
    返回内容 += `\n══════════════`;
    if(跳过明细.length){
        返回内容 += `\n【跳过明细】`;
        返回内容 += `\n${跳过明细.join("\n")}`;
        返回内容 += `\n══════════════`;
    }
    返回内容 += `\n【发送明细】`;
    返回内容 += 执行明细;
    返回内容 += `\n══════════════`;

    if(count > 10){
        const messages = [合并节点("[骨灰提醒总结]", event.self_id, [段_文本(返回内容)])];
        await 发合并消息(event, messages);
    }else{
        await 发消息(event, [段_引用(event.message_id), 段_文本(`${返回内容}`)]);
    }
    return null;
}


if(message == "获取群文件列表"){
    // ================== 来源 ==================
    if(event.message_type != "group"){
        return null;
    }
    // ================== 授权判断 ==================
    if(!(await requireAuthorized(RC_sq, event))) return null;
    // ================== 测试功能开关 ==================
    if(readB("config.json", "cs_of", false) != true){
        await 发消息(event, [段_引用(event.message_id), 段_文本('请先在配置中开启测试功能开关后再使用')]);
        return null;
    }
    // ================== 最高主人检测 ==================
    let crr_开关 = false;
    if(event.message_type == "group"){
        let rrrrv = readB(`筱筱吖/事件系统/${event.group_id}.json`, "管理模式", "关闭");
        if (rrrrv == "开启"){
            crr_开关 = true;
        }
    }
    if(!(await checkOwner3(event, ctx, crr_开关))) return null;

    const toNum = (v, d = 0) => Number.isFinite(Number(v)) ? Number(v) : d;
    const safeTime = (ts) => {
        const n = toNum(ts, 0);
        if(n <= 0) return "未知";
        try{
            return timeA("y-m-d H:i:s", n);
        }catch{
            return "未知";
        }
    };
    const safeSize = (bytes) => {
        const n = toNum(bytes, 0);
        if(n < 1024) return `${n} B`;
        if(n < 1024 * 1024) return `${(n / 1024).toFixed(2)} KB`;
        if(n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(2)} MB`;
        return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
    };
    const formatFileDetail = (f, idx, depth = 0) => {
        const prefix = "  ".repeat(depth);
        let s = `${prefix}${idx}. ${f?.file_name || "未知文件"}`;
        s += `\n${prefix}══════════════`;
        if(f?.__fromFolder){
            s += `\n${prefix}[所属目录] ${f.__fromFolder}`;
        }else{
            s += `\n${prefix}[所属目录] 根目录`;
        }
        s += `\n${prefix}[上传用户] ${f?.uploader_name || "未知"}(${f?.uploader || 0})`;
        s += `\n${prefix}[上传时间] ${safeTime(f?.upload_time)}`;
        s += `\n${prefix}[修改时间] ${safeTime(f?.modify_time)}`;
        s += `\n${prefix}[过期时间] ${safeTime(f?.dead_time)}`;
        s += `\n${prefix}[下载次数] ${toNum(f?.download_times, 0)}`;
        s += `\n${prefix}[业务标识] ${f?.busid ?? "-"}`;
        s += `\n${prefix}[文件大小] ${safeSize(f?.size || f?.file_size || 0)} (${toNum(f?.size || f?.file_size, 0)} B)`;
        s += `\n${prefix}[文件ID] ${f?.file_id || "-"}`;
        return s;
    };
    const buildFileNode = (f, idx, 节点名 = "[文件详情]") =>
        合并节点(节点名, event.self_id, [段_文本(formatFileDetail(f, idx, 0))]);
    const CHUNK_LIMIT = 100;
    const chunkArray = (arr, size = CHUNK_LIMIT) => {
        const out = [];
        for(let i = 0; i < arr.length; i += size){
            out.push(arr.slice(i, i + size));
        }
        return out;
    };
    const wrapNodesAsSubForward = (nodes, 类型名, 名称前缀) => {
        if(!Array.isArray(nodes) || nodes.length === 0) return [];
        const blocks = chunkArray(nodes, CHUNK_LIMIT);
        return blocks.map((block, idx) => 嵌套合并节点(
            `${名称前缀}-${idx + 1}`,
            event.self_id,
            block,
            {},
            [段_文本(
                `类型:${类型名}\n` +
                `本包条目:${block.length}\n` +
                `包序号:${idx + 1}/${blocks.length}`
            )],
        ));
    };

    const visitedFolders = new Set();
    const MAX_FOLDER_DEPTH = 5;
    const MAX_PER_FOLDER = 1000;
    const collectFolderFiles = async (folder, depth = 1, pathName = "") => {
        const fid = String(folder?.folder_id || folder?.folder || "");
        const folderName = String(folder?.folder_name || "未命名文件夹");
        const fullPath = pathName ? `${pathName}/${folderName}` : folderName;
        if(!fid){
            return { files: [], errors: [`文件夹【${fullPath}】缺少文件夹ID`] };
        }
        if(visitedFolders.has(fid)){
            return { files: [], errors: [`文件夹【${fullPath}】重复，已跳过`] };
        }
        if(depth > MAX_FOLDER_DEPTH){
            return { files: [], errors: [`文件夹【${fullPath}】超过递归深度限制(${MAX_FOLDER_DEPTH})`] };
        }
        visitedFolders.add(fid);
        try{
            const child = await BOTAPI(ctx, "get_group_files_by_folder", { group_id: event.group_id, folder_id: fid, file_count: MAX_PER_FOLDER });
            const childFiles = Array.isArray(child?.files) ? child.files : [];
            const childFolders = Array.isArray(child?.folders) ? child.folders : [];
            const files = childFiles.map((f) => ({ ...f, __fromFolder: fullPath }));
            const errors = [];
            for(let i = 0; i < childFolders.length; i++){
                const sub = await collectFolderFiles(childFolders[i], depth + 1, fullPath);
                files.push(...sub.files);
                errors.push(...sub.errors);
            }
            return { files, errors };
        }catch(e){
            return { files: [], errors: [`文件夹【${fullPath}】读取失败:${e?.message || "未知错误"}`] };
        }
    };

    try{
        const 系统信息 = await BOTAPI(ctx, "get_group_file_system_info", { group_id: event.group_id });
        const 根目录 = await BOTAPI(ctx, "get_group_root_files", { group_id: event.group_id, file_count: MAX_PER_FOLDER });
        const rootFiles = Array.isArray(根目录?.files) ? 根目录.files : [];
        const rootFolders = Array.isArray(根目录?.folders) ? 根目录.folders : [];

        let 概览 = `群文件系统状态`;
        概览 += `\n══════════════`;
        概览 += `\n[群号] ${event.group_id}`;
        概览 += `\n[文件总数] ${toNum(系统信息?.file_count, 0)} / ${toNum(系统信息?.limit_count, 0)}`;
        概览 += `\n[已用空间] ${safeSize(系统信息?.used_space || 0)}`;
        概览 += `\n[总空间] ${safeSize(系统信息?.total_space || 0)}`;
        概览 += `\n[根目录文件数] ${rootFiles.length}`;
        概览 += `\n[根目录文件夹数] ${rootFolders.length}`;
        if(rootFiles.length >= MAX_PER_FOLDER){
            概览 += `\n[提示] 根目录文件可能被接口上限截断（当前请求上限:${MAX_PER_FOLDER}）`;
        }
        概览 += `\n══════════════`;

        const messages = [合并节点("[群文件概览]", event.self_id, [段_文本(概览)])];

        if(rootFolders.length === 0){
            if(rootFiles.length === 0){
                messages.push(合并节点("[根目录文件]", event.self_id, [段_文本(`根目录无文件`)]));
            }
            const rootFileNodes = rootFiles.map((f, i) => buildFileNode({ ...f, __fromFolder: "" }, i + 1, "[根目录文件详情]"));
            const rootFilePacks = wrapNodesAsSubForward(rootFileNodes, "无文件夹文件", "[根目录无文件夹包]");
            messages.push(...rootFilePacks);
        }else{
            let rootText = `根目录文件概览`;
            rootText += `\n══════════════`;
            rootText += `\n[文件数量] ${rootFiles.length}`;
            rootText += `\n[文件夹数量] ${rootFolders.length}`;
            rootText += `\n══════════════`;
            messages.push(合并节点("[根目录文件]", event.self_id, [段_文本(rootText)]));
            const rootFileNodes = rootFiles.map((f, i) => buildFileNode({ ...f, __fromFolder: "" }, i + 1, "[根目录文件详情]"));
            const rootFilePacks = wrapNodesAsSubForward(rootFileNodes, "无文件夹文件", "[根目录无文件夹包]");
            const folderFilesAll = [];
            const folderErrors = [];
            for(let i = 0; i < rootFolders.length; i++){
                const ret = await collectFolderFiles(rootFolders[i], 1, "");
                folderFilesAll.push(...ret.files);
                folderErrors.push(...ret.errors);
            }
            // 按文件夹路径分组：一个文件夹一个子合并（超100时该文件夹继续分包）
            const folderGroups = new Map();
            for(let i = 0; i < folderFilesAll.length; i++){
                const f = folderFilesAll[i] || {};
                const key = String(f.__fromFolder || "未归类文件夹");
                if(!folderGroups.has(key)){
                    folderGroups.set(key, []);
                }
                folderGroups.get(key).push(f);
            }
            const folderFilePacks = [];
            for(const [folderPath, files] of folderGroups.entries()){
                const nodes = files.map((f, i) => buildFileNode(
                    { ...f, file_name: (f?.file_name || "未知文件") },
                    i + 1,
                    `[文件夹] ${folderPath}`
                ));
                const packs = wrapNodesAsSubForward(nodes, `文件夹文件(${folderPath})`, `[文件夹文件包] ${folderPath}`);
                folderFilePacks.push(...packs);
            }
            const errNodes = folderErrors.map((txt, i) => 合并节点("[文件夹读取提示]", event.self_id, [段_文本(`⚠️ ${i + 1}. ${txt}`)]));
            messages.push(...folderFilePacks, ...rootFilePacks, ...errNodes);
        }

        await 发合并消息(event, messages);
    }catch(e){
        await 发消息(event, [段_引用(event.message_id), 段_文本(`群文件测试功能执行失败：${e?.message || "未知错误"}`)]);
    }
    return null;
}



// ================== 娱乐部分 ==================
if(message == "菜单" || message == "/MK"){
    // ================== 授权判断 ==================
    if(!(await requireAuthorized(RC_sq, event))) return null;
    const 图片渲染开 = isImageRenderEnabled(readB);
    if(!图片渲染开){
        // ================== 文本输出 ==================
        let 组装消息 = `══════════════`;
        组装消息 += `\n授权系统 - 群管系统 - 邀人统计`;
        组装消息 += `\n事件管理 - 音乐系统 - 账号设置`;
        组装消息 += `\n插件配置 - 扩展功能 - 管理续火`;
        组装消息 += `\n问答系统 - 视频菜单 - 发卡系统`;
        组装消息 += `\n----------------`;
        组装消息 += `\n银行系统 - 幸运轮盘 - 钓鱼`;
        组装消息 += `\n群老婆 - 漂流瓶 - 排行榜`;
        组装消息 += `\n打工 - 商店 - 禁言卡`;
        组装消息 += `\n══════════════`;
        // ================== 输出 ==================
        await 发消息(event, [段_引用(event.message_id), 段_文本(`${组装消息}`)]);
    }else{
        // ================== 画布输出 ==================
        const renderMode = getRenderMode(readB);
        let menuUiTheme = "0";
        let menuBgUrl = resolveMenuBackgroundUrl(ctx, 图片渲染开);
        const menuBgUrlHtml = resolveMenuHtmlBackgroundUrl(ctx, 图片渲染开);
        const menuBgLocal = resolveEffectiveBgAbs("menu") || resolveDefaultResourceImageAbs("heng.jpg");
        const menuBgLocalPortrait = resolveEffectiveBgAbs("menu-portrait") || resolveDefaultResourceImageAbs("shu.jpg");
        let imageData = null;

        if (renderMode === "sharp") {
            imageData = await renderMenuWithSharp(PLUGIN_DIR, getDataPath(), {
                uiTheme: menuUiTheme,
                bgUrl: menuBgUrl,
                bgLandscape: MENU_BG_REMOTE_LANDSCAPE,
                bgPortrait: MENU_BG_REMOTE_PORTRAIT,
                bgLocalPath: menuBgLocal || "",
                bgLocalPortraitPath: menuBgLocalPortrait || "",
                width: 1680,
                height: 1010,
            }, logger);
        } else {
            const htmlContent = injectMenuIconSprite(readMenuHtmlTemplate(ctx?.pluginPath));
            if(!htmlContent){
                await 发消息(event, [段_引用(event.message_id), 段_文本('导航菜单.html 文件不存在或为空')]);
                return null;
            }
            imageData = await puppeteer(htmlContent, {
                data: {
                    uiTheme: menuUiTheme,
                    bgUrl: menuBgUrlHtml,
                    menuBgLandscape: MENU_BG_REMOTE_LANDSCAPE,
                    menuBgPortrait: MENU_BG_REMOTE_PORTRAIT,
                },
                width: 1680,
                height: 1010,
                waitForSelector: 'body[data-render-ready="1"]',
                pageGotoTimeoutMs: 30000,
                waitForTimeout: 300
            });
        }

        if(!imageData){
            const why = (lastHtmlRenderError || "").trim();
            const modeHint = renderMode === "sharp"
                ? "请先在插件后台「进阶设置 → Sharp 运行时依赖」点击安装，或切换为 HTML 渲染"
                : "请检查 puppeteer 渲染插件是否已安装并启动浏览器（咔咔珂: kakake-plugin-puppeteer；NapCat: napcat-plugin-puppeteer），或在 config.json 设置 mkbot_render_api_base";
            await 发消息(event, [段_引用(event.message_id), 段_文本(`渲染失败：${why ? why : "渲染不可用"}\n${modeHint}`)]);
            return null;
        }
        const imageUrl = imageData.startsWith("base64://") ? imageData : `base64://${imageData}`;
        await 发消息(event, [段_图片(imageUrl)]);
        // ================== 检 ==================
    }
    return null;
}


if(message == "问答系统"){
    // ================== 授权判断 ==================
    if(!(await requireAuthorized(RC_sq, event))) return null;
    // ================== 组装消息 ==================
    let 组装消息 = `══════════════`;
    组装消息 += `\n相关事件【问答系统】`;
    组装消息 += `\n`;
    组装消息 += `\n获取列表指令↓`;
    组装消息 += `\n - 问答词列表`;
    组装消息 += `\n - 详细问答词列表`;
    组装消息 += `\n`;
    组装消息 += `\n本群问答（主人/管理模式）↓`;
    组装消息 += `\n - 添加精准/模糊问答#问题#答案`;
    组装消息 += `\n - 删除精准/模糊问答#问题`;
    组装消息 += `\n - 清空精准/模糊问答`;
    组装消息 += `\n`;
    组装消息 += `\n全局/私聊（仅全局主人）↓`;
    组装消息 += `\n - 添加全局精准/模糊问答#问题#答案`;
    组装消息 += `\n - 删除全局精准/模糊问答#问题`;
    组装消息 += `\n - 清空全局精准/模糊问答`;
    组装消息 += `\n - 添加私聊精准/模糊问答#问题#答案`;
    组装消息 += `\n - 删除私聊精准/模糊问答#问题`;
    组装消息 += `\n - 清空私聊精准/模糊问答`;
    组装消息 += `\n - 清空全部精准/模糊问答`;
    组装消息 += `\n══════════════`;
    // ================== 输出 ==================
    await 发消息(event, [段_引用(event.message_id), 段_文本(`${组装消息}`)]);
    return null;
}


if(message == "插件配置"){
    // ================== 授权判断 ==================
    if(!(await requireAuthorized(RC_sq, event))) return null;
    let 记录时间 = readB("config.json", "启动时间", Math.floor(Date.now() / 1000));
    let 现在时间 = Math.floor(Date.now() / 1000);
    let 运行时长 = timeB("dd天HH时ii分ss秒", 现在时间 - 记录时间);
    let 插件版本 = mkReadPluginVersion(ctx);
    // ================== 组装消息 ==================
    let 组装消息 = `══════════════`;
    组装消息 += `\n插件相关配置↓`;
    组装消息 += `\n`;
    组装消息 += `\n【插件对群/私的总开关】`;
    组装消息 += `\n - 开启群聊消息执行[群号]`;
    组装消息 += `\n - 开启私聊消息执行[好友]`;
    组装消息 += `\n - 关闭群聊消息执行[全部]`;
    组装消息 += `\n`;
    组装消息 += `\n【插件其他配置开关】`;
    组装消息 += `\n - [开启|关闭]测试功能`;
    组装消息 += `\n - [开启|关闭]渲染开关`;
    组装消息 += `\n - [开启|关闭]消息自触`;
    组装消息 += `\n - 执行插件数据备份`;
    组装消息 += `\n`;
    组装消息 += `\n【其他信息】`;
    组装消息 += `\n - [运行]:${运行时长}`;
    组装消息 += `\n - [版本]:${插件版本}`;
    组装消息 += `\n══════════════`;
    await 发消息(event, [段_引用(event.message_id), 段_文本(`${组装消息}`)]);
    return null;
}



// ================== 群老婆（实现见 ./auth/group-wife.ts） ==================
if (
  await handleGroupWifeCommands(message, event, ctx, RC_sq, 娱乐功能('群老婆'), {
    readB,
    writeB,
    readA,
    writeA,
    timeA,
    rand,
    BOTAPI,
    checkOwner3,
  })
) {
  return null;
}

if(message == "排行榜" && 娱乐功能('排行榜')){
    // ================== 授权判断 ==================
    if(!(await requireAuthorized(RC_sq, event))) return null;
    // ================== 组装消息 ==================
    let 组装消息 = `══════════════`;
    组装消息 += `\n归笺排行榜 - 正常货币`;
    组装消息 += `\n存款排行榜 - 银行货币(含利润)`;
    组装消息 += `\n签到排行榜 - 每日签到排名`;
    // ================== 输出 ==================
    await 发消息(event, [段_引用(event.message_id), 段_文本(`${组装消息}`)]);
}



if(message == "账号设置"){
    // ================== 授权判断 ==================
    if(!(await requireAuthorized(RC_sq, event))) return null;
    // ================== 组装消息 ==================
    let 组装消息 = `══════════════`;
    组装消息 += `\n - 更改机器人昵称[内容]`;
    组装消息 += `\n - 更改机器人头像[图片]`;
    组装消息 += `\n - 更改机器人签名[内容]`;
    组装消息 += `\n - 更改机器人性别[男|女]`;
    组装消息 += `\n - 获取账号信息`;
    组装消息 += `\n══════════════`;
    await 发消息(event, [段_引用(event.message_id), 段_文本(`${组装消息}`)]);
    return null;
}

if(message.match(/^更改机器人(头像|昵称|性别|签名)([\s\S]*)/)){
    // ================== 来源 ==================
    if(event.message_type != "group"){
        return null;
    }
    // ================== 授权判断 ==================
    if(!(await requireAuthorized(RC_sq, event))) return null;
    // ================== 最高主人检测 ==================
    if(!(await checkOwner3(event, ctx, false))) return null;
    // ================== 获取数据 ==================
    const one_mub = message.match(/^更改机器人(头像|昵称|性别|签名)([\s\S]*)/)[1];
    const two_mub = message.match(/^更改机器人(头像|昵称|性别|签名)([\s\S]*)/)[2];
    let 参数9 = {user_id : event.self_id};
    const dp = await BOTAPI(ctx, "get_stranger_info", 参数9);
    // ================== 头像类型 ==================
    if(one_mub == "头像"){
        // ================== 检测图片数量 ==================
        const image = giveImages(event.message);//图片链接
        const 图片数量 = (image.length || 0);
        if(图片数量 == 0){
            await 发消息(event, [段_引用(event.message_id), 段_文本('请携带一张照片再发送哟～')]);
            return null;
        }
        // ================== 更改 ==================
        let 参数 = {"file": image[0]};
        BOTAPI(ctx, "set_qq_avatar", 参数);
        // ================== 输出 ==================
        await 发消息(event, [段_引用(event.message_id), 段_文本(`我马上就去把头像改成介个，等我一会～～～`), 段_图片(image[0])]);
        return null;
    // ================== 昵称类型 ==================
    }else if(one_mub == "昵称" || one_mub == "签名"){
        let 字数 = (two_mub.length || 0);
        if(字数 == 0 || 字数 == undefined){
            await 发消息(event, [段_引用(event.message_id), 段_文本(`更改${one_mub}时需要填内容哦～`)]);
            return null;
        }else{
            let 参数 = {"nickname": two_mub};
            if(one_mub == "昵称"){
                参数 = {"nickname": two_mub};
            }else{
                参数 = {"nickname": mkCompatNickname(dp) || String(event.self_id), "personal_note": two_mub};
            }
            // ================== 更改 ==================
            BOTAPI(ctx, "set_qq_profile", 参数);
            await 发消息(event, [段_引用(event.message_id), 段_文本(`好哒，已经把${one_mub}改成这个内容啦！你看看我主页叭！`)]);
            return null;
        }
    // ================== 昵称类型 ==================
    }else if(one_mub == "性别"){
        let 性别数据 = {"男":1, "女":2, "未知":0};
        let 据数别性 = {"0":"未知", "1":"男", "2":"女"};
        let 真实数据 = (性别数据[two_mub] || 0);
        let fffffffffff = (据数别性[真实数据] || "未知");
        // ================== 更改 ==================
        let 参数 = {"nickname": mkCompatNickname(dp) || String(event.self_id), "sex": 真实数据};
        BOTAPI(ctx, "set_qq_profile", 参数);
        await 发消息(event, [段_引用(event.message_id), 段_文本(`好哒，已经把性别改成【${fffffffffff}】`)]);
        return null;
    }else{
        return null;
    }
}



if(message == "事件管理"){
    // ================== 来源 ==================
    if(event.message_type != "group"){
        return null;
    }
    // ================== 授权判断 ==================
    if(!(await requireAuthorized(RC_sq, event))) return null;
    // ================== 数据 ==================
    const data = {
        "好友续火":"每日准点时会给好友发一条消息，效果和操作跟群聊续火差不多",
        "全群打卡":"每日00:00:00准时打卡，可能有一点点误差",
        "自动点赞":"【被动】你给机器人点多少个，机器人就给你回多少个\n【扩展-全部】每天定时为全部好友点赞\n【扩展-特定】每天给特定的用户点赞",
        "自动备份":"每天12时与00时自动备份数据，文件输出以好友文件形式，谁开启该功能就发给谁，所以需要与机器人有好友关系哦～",
        "禁言通知":"在群聊有人禁言\/解禁，全体禁言\/解禁时，可触发回复",
        "入群审核":"字面意思，就是在填写进群请求的判断，推荐需求多答案且自动审核的用户群系",
        "受邀同意":"有人邀请机器人进群时是否自动同意；不要求目标群在 group_of",
        "全群免开":"开启后任意群聊不再受「开关管理」group_of 名单限制（新群也直接可走消息）",
        "全私免开":"开启后任意私聊（含临时会话、非好友）不再受「开关管理」haoyou_of 名单限制",
        "邀人统计":"即记录当前群聊拉人数量，需保持开启才能有效计算，退群重拉不会二次记录",
        "自助头衔":"大家都会用吧，就字面意思，多了个开关而已",
        "伪造聊天":"合并转发伪造聊天记录，指令后输入 JSON 数组，支持 text/face/image/video",
        "黑白名单":"黑名单系统，需要先开启才可配置数据，默认普通踢出，黑踢为QQ自带的黑名单拦截！",
        "退群通知":"字面意思 有人退群就会发送通知，机器人踢的不会",
        "退群拉黑":"兼容退群拉黑，不开退群通知则不回复，但有实际拉黑效果",
        "整点报时":"字面意思，当时间为整点时会自动播报消息，通过 更改整点报时文案[内容] 即可更改，改内容对单群生效，并非全局！",
        "禁发红包":"字面意思，禁发全部类型红包，暂不支持分类，仅撤回",
        "入群欢迎":"旧版本为「入群图片」，文本版正常使用，测试版需配搭Puppeteer插件使用",
        "违禁检测":"即违禁词系统，目前可:撤回/禁言/撤回禁言；另支持全局违禁词库（所有群共用，仅后台维护），本群发送「开启全局违禁词处理机制」即可参与，命中全局词优先处理，可选跟随全局惩罚（禁言/撤回/踢出，可多选）",
        "进阶检测":"违禁检测的高级版，支持检测合并转发消息里面的文本消息进行匹配违禁词",
        "发言统计":"开启后即刻起记录数量，但如果快速刷屏可能会导致写文件频繁直接重置文件！",
        "群聊续火":"字面意思，当前版本仅为文本续火，当然也可以用一些特殊手段强行让他兼容添加图片",
        "视频解析":"目前支持哔哩哔哩、抖音、小红书、快手、YouTube、TikTok的视频解析，分辨率有点低，接口也有点慢",
        "问答系统":"支持本群/全局/私聊词库；全局优先；群聊须开本事件，私聊已授权即生效；答案支持文字/表情/图片（可纯图）；艾特记为@昵称；全局与私聊仅主人可改",
        "入群验证":"是成功进群后的验证，默认随机数字，支持随机字母/随机算式；默认5次机会，300秒内完成；配合「禁言免验」可在全体禁言时跳过",
        "禁言免验":"默认开启；开启入群验证后，若本群处于全体禁言则不发验证码、直接通过；关闭本事件则全体禁言下仍会验证",
        "马甲系统":"群内成员昵称格式化修改，通过用户原名来重命名，每执行5个用户冷却1秒；与「进阶检测」同开时昵称含违禁词改用马甲+QQ号（QQ号也含违禁词则马甲+-），免死金牌成员不走该兜底",
        "管理模式":"开启后则在「默认主人」的基础上增加「本群管理员」「本群群主」等用户为机器人的控制者",
        "入群私聊":"在新人入群后，直接给他发临时会话，该功能必须开启允许群内发起临时会话功能！",
        "消息记录":"开启后自动记录本群消息到「消息记录/群聊/群号.json」或「消息记录/私聊/QQ.json」；兼容读取旧版 shuju.json；需当前群/私聊已授权（或绕过授权）；私聊还需按好友单独开关",
        "表情制作":"表情包系统：群聊/私聊可用；精准「爬/顶/啃/摸头/吃/吸/啾/挠头/贴贴/戒导/二次元入口/上瘾/别碰/捣/灰飞烟灭/卖掉了/嘲讽/想什么/我想上的/你不懂啦」等（贴贴必须@对方；其余支持图/引用/@取源；需 Sharp）；私聊开关写入事件系统/私聊.json",
        "图片鉴黄":"群聊有图时鉴黄：硬拦截(porn>0.3/分类色情)+加权风险(porn×0.7+hentai×0.25+sexy×0.05>0.15且neutral<0.1)；二次元光膀子等豁免仅预警；需管理权限且高于发言者",
        "快捷撤回":"引用+「撤回」撤单条；「向上撤回N」可无引用（从本条起算往更早）或引用目标；「向下撤回N」须引用；批量按消息记录JSON时间线从锚点起共N个索引位（含锚点，全员消息，有权限则撤）；须开「消息记录」；仅群聊、N≤100、N=0不处理、静默、连续5空位结束、N>15每成功15条冷却1~3秒；默认关闭；须机器人为群管/群主；主人可用，开启「管理模式」后本群群主/管理员也可用",
        "图转连接":"发送「图转链接」或「转链接」提取当前消息/引用消息中的图片、视频直链；默认关闭；本群已授权即可使用",
        "刷屏检测":"双窗口检测：短窗口抓连发（默认10秒6条），长窗口抓慢刷（默认60秒12条），命中任一即撤回并禁言；全消息类型按条数计；需机器人群管且高于发言者",
        "免死金牌":"特殊事件：名单成员跳过鉴黄/违禁词/发言限制/禁发（含红包）/刷屏等自动处罚，以及马甲系统的违禁词兜底（仍会被套马甲前缀）；不挡黑名单与手动踢禁；机器人群主时管理员删名单不可删管理员目标、清空仅主人",
        "锁名系统":"针对个体用户锁定群名片：名单内成员发言时若名片≠锁定名称，机器人有管理权限就立刻改回；优先级高于马甲系统（已锁名的人不再套马甲）；指令 添加/更改/取消锁名@人、清空|获取锁名列表；锁定名称命中本群违禁词则拒绝设置；兼容管理模式"
    };
    const count =array_shijian.length;//数量
    const count_2 =array_RCshijian.length;//数量2
    const messages = [
        合并节点("[事件管理]", event.self_id, [段_文本(`共计【${count + count_2}】个事件\n - 开启xxxx\n - 关闭xxxx\n - 开启|关闭全部事件`)])
    ];
    // ================== 循环 - 1 ==================
    for(let i = 0; i < count; i++) {
        let 本次 = array_shijian[i];
        let 开关 = readB(`筱筱吖/事件系统/${event.group_id}.json`, 本次, 本次 === "禁言免验" ? "开启" : "关闭");
        if(开关 == "关闭"){
            开关 = "❌关闭";
        }else{
            开关 = "✅开启";
        }
        let 组装消息 = `【${本次}】: ${开关}`;
        组装消息 += `\n══════════════`;
        组装消息 += `\n${data[本次]}`;
        //记录
        messages.push(合并节点(`[${本次}]`, event.self_id, [段_文本(组装消息)]));
    }
    // ================== 循环 - 2 ==================
    for(let i = 0; i < count_2; i++) {
        let 本次 = array_RCshijian[i];
        let 开关 = readB(`筱筱吖/事件系统/全局.json`, 本次, "关闭");
        if(开关 == "关闭"){
            开关 = "❌关闭";
        }else{
            开关 = "✅开启";
        }
        let 组装消息 = `全局【${本次}】: ${开关}`;
        组装消息 += `\n══════════════`;
        组装消息 += `\n${data[本次]}`;
        //记录
        messages.push(合并节点(`[${本次}]`, event.self_id, [段_文本(组装消息)]));
    }
    // ================== 输出 ==================
    await 发合并消息(event, messages);
    return null;
}


if(message.match(/^幸运轮盘([0-9]+|)$/) && 娱乐功能('幸运轮盘')){
    // ================== 授权验证 ==================
    if(!(await requireAuthorized(RC_sq, event))) return null;
    // ================== 获取数据 ==================
    const 幸运轮盘匹配 = message.match(/^幸运轮盘([0-9]+|)$/);
    let 数值 = Number(幸运轮盘匹配![1]);
    let 文件 = Number(readB(`筱筱吖/娱乐系统/幸运轮盘/轮盘信息.json`, "货币", 100));
    let 归笺 = Number(readB("筱筱吖/娱乐系统/游戏数据/归笺.json", event.user_id, 0));
    if (!Number.isFinite(文件) || 文件 < 0) 文件 = 100;
    if (!Number.isFinite(归笺) || 归笺 < 0) 归笺 = 0;
    let 上限 = Math.floor(文件 * 0.3);
    // ================== 判断 ==================
    if (!Number.isFinite(数值) || 数值 <= 0) {
        await 发消息(event, [段_引用(event.message_id), 段_文本('该玩法需要携带归笺哦～\n[使用例子]:幸运轮盘30')]);
        return null;
    }
    if(数值 > 归笺 || 归笺 == 0){
        await 发消息(event, [段_引用(event.message_id), 段_文本('不儿，你有这么多归笺吗？')]);
        return null;
    }
    if(数值 > 上限){
        await 发消息(event, [段_引用(event.message_id), 段_文本(`数值异常！当前允许范围为「1 - ${上限}」归笺！\n目前奖池为「${文件}」`)]);
        return null;
    }else{
        // ================== 正常处理 ==================
        if(Math.random() <= 0.01){//1%命中概率，如果你命中了
            let 原归笺 = Number(readB("筱筱吖/娱乐系统/游戏数据/归笺.json", event.user_id, 0));
            writeB("筱筱吖/娱乐系统/游戏数据/归笺.json", event.user_id, 原归笺 + 文件);
            writeB(`筱筱吖/娱乐系统/幸运轮盘/轮盘信息.json`, "货币", 100);
            //组装消息输出
            let 组装消息 = `概率爆爆爆！`;
            组装消息 += `\n幸运大转盘成功命中！`;
            组装消息 += `\n══════════════`;
            组装消息 += `\n[获得]:${文件}归笺`;
            组装消息 += `\n[目前]:${原归笺 + 文件}归笺`;
            组装消息 += `\n══════════════`;
            组装消息 += `\n奖池已重置～欢迎继续体验！`;
            组装消息 += `\n本功能无法仅做为学习参考，杜绝一切不良用途！`;
            await 发消息(event, [段_引用(event.message_id), 段_文本(`${组装消息}`)]);
            return null;
        }else{//你没命中
            let 原归笺 = Number(readB("筱筱吖/娱乐系统/游戏数据/归笺.json", event.user_id, 0));
            writeB("筱筱吖/娱乐系统/游戏数据/归笺.json", event.user_id, 原归笺 - 数值);
            writeB(`筱筱吖/娱乐系统/幸运轮盘/轮盘信息.json`, "货币", 文件 + 数值);
            //组装输出
            let 组装消息 = `可惜了....运气差了点.....`;
            组装消息 += `\n══════════════`;
            组装消息 += `\n[奖池增加]:${数值}归笺`;
            组装消息 += `\n[目前奖池]:${文件 + 数值}归笺`;
            组装消息 += `\n══════════════`;
            组装消息 += `\n不中时会把归笺融入奖池哦～`;
            组装消息 += `\n本功能无法仅做为学习参考，杜绝一切不良用途！`;
            await 发消息(event, [段_引用(event.message_id), 段_文本(`${组装消息}`)]);
            return null;
        }
    }
}

if (message.match(/^(签到|打卡)$/) && 娱乐功能('签到')) {
    function buildSignInEventsHtml(事件列表) {
        if (!事件列表 || !事件列表.length) return "";
        return 事件列表.map((item, index) => {
            const safeText = String(item.text || "").replace(/[&<>]/g, function(m) {
                if (m === '&') return '&amp;';
                if (m === '<') return '&lt;';
                if (m === '>') return '&gt;';
                return m;
            });
            const bonusClass = item.bonus ? 'bonus' : '';
            const delay = index * 0.1;
            return `<div class="event-tag ${bonusClass}" style="animation-delay: ${delay}s">${safeText}</div>`;
        }).join('');
    }

    async function renderSignInCardImage(card) {
        const mode = getRenderMode(readB);
        const avatarUrl = card.avatarUrl || `https://q4.qlogo.cn/g?b=qq&nk=${card.userId}&s=5`;
        if (mode === "sharp") {
            return renderSignInWithSharp({
                theme: card.theme,
                userName: card.userName,
                userId: card.userId,
                rankText: card.rankText,
                signed: !!card.signed,
                guiJian: card.guiJian,
                yuEr: card.yuEr,
                totalDays: card.totalDays,
                streakText: card.streakText,
                events: card.events || [],
                avatarUrl,
            }, logger);
        }
        const htmlContent = readA("默认资源/签到.html");
        if (!htmlContent) return null;
        const contentHtml = card.signed
            ? `<div class="signed-big-text">已签到</div>`
            : `
                <div class="points-display">
                    <div class="points-row">
                        <div class="point-item">
                            <span class="point-prefix">归笺</span>
                            <span class="point-value">+${card.guiJian}</span>
                        </div>
                        <div class="point-item">
                            <span class="point-prefix">诱饵</span>
                            <span class="point-value">+${card.yuEr}</span>
                        </div>
                    </div>
                </div>
            `;
        return puppeteer(htmlContent, {
            data: {
                themeClass: card.theme === "night" ? "theme-night" : "theme-day",
                avatarUrl,
                userName: card.userName,
                userId: card.userId,
                rankText: card.rankText,
                statusText: "",
                contentHtml,
                totalDays: card.totalDays,
                streakText: card.streakText,
                eventsHtml: buildSignInEventsHtml(card.events || []),
            },
            width: 720,
            height: 520,
            deviceScaleFactor: 2,
            waitForTimeout: 800,
            omitBackground: true,
        });
    }

    // ================== 1. 授权验证 ==================
    if(!(await requireAuthorized(RC_sq, event))) return null;

    // ================== 2. 读取基础数据 ==================
    const 今天 = timeA("y-m-d", Math.floor(Date.now() / 1000));
    const 星期 = new Date().getDay();
    const 今日人数 = readB("筱筱吖/娱乐系统/签到数据/全服记录数量.json", 今天, 0);
    const 累计次数 = readB("筱筱吖/娱乐系统/签到数据/累计次数.json", event.user_id, 0);
    const 签到状态 = readB(`筱筱吖/娱乐系统/签到数据/日期记录/${今天}/检测.json`, event.user_id, "未知");
    const 签到排名 = readB(`筱筱吖/娱乐系统/签到数据/日期记录/${今天}/排名.json`, event.user_id, "未知");
    const 签到详细时间 = readB(`筱筱吖/娱乐系统/签到数据/日期记录/${今天}/详细时间.json`, event.user_id, "未知");
    const 上次签到时间 = readB("筱筱吖/娱乐系统/签到数据/连签记录/上次签到/详细时间.json", event.user_id, 0);
    let 连续签到数量 = readB("筱筱吖/娱乐系统/签到数据/连签记录/连签数量.json", event.user_id, 0);

    // ================== 4. 已签到处理 ==================
    if (签到状态 !== "未知") {
        let 返回内容 = "❌ 你今天签到过啦～就算再怎么发我也不会多给你哒！";
        返回内容 += `\n════════════`;
        返回内容 += `\n[名次]: 第${签到排名}名`;
        返回内容 += `\n[时间]: ${签到详细时间}`;
        返回内容 += `\n[累计]: ${累计次数}天`;
        返回内容 += `\n[连签]: ${连续签到数量}天`;
        返回内容 += `\n════════════`;

        // 图片渲染
        const 发送方式已签 = isImageRenderEnabled(readB);
        if (发送方式已签) {
            try {
                const imageData = await renderSignInCardImage({
                    theme: "night",
                    userName: `${event.sender.nickname}`,
                    userId: event.user_id,
                    rankText: `第${签到排名}名`,
                    signed: true,
                    totalDays: `${累计次数}天`,
                    streakText: `连续 ${连续签到数量} 天`,
                    events: [],
                });
                if (imageData) {
                    await 发消息(event, [段_引用(event.message_id), 渲染Base64图片段(imageData)]);
                    return null;
                }
            } catch (e) {
                logger.error("[签到] 已签到图片渲染失败:", e);
            }
        }
        await 发消息(event, [段_引用(event.message_id), 段_文本(`${返回内容}`)]);
        return null;
    }

    // ================== 5. 未签到：计算奖励 ==================
    const 名次奖励 = {
        "1": rand(90, 125),
        "2": rand(75, 89),
        "3": rand(50, 74),
        "其他": rand(15, 49)
    };
    let 本次序号 = 今日人数 + 1;
    let 增加归笺 = 本次序号 <= 3 ? 名次奖励[本次序号] : 名次奖励["其他"];
    let 增加诱饵 = 本次序号 <= 3 ? rand(4, 8) : rand(1, 5);

    // 周末翻倍
    let 周末触发 = false;
    if (星期 === 0 || 星期 === 6) {
        增加归笺 = Math.floor(增加归笺 * 1.5);
        增加诱饵 = Math.floor(增加诱饵 * 1.5);
        周末触发 = true;
    }

    // 节日礼包
    const 月日 = timeA("md", Math.floor(Date.now() / 1000));
    const 节日配置 = [
        { dates: ["0501", "0502", "0503", "0504", "0505", "0506"], 归笺: 1000, 诱饵: 15, name: "劳动节" },
        { dates: ["0601"], 归笺: 3333, 诱饵: 33, name: "六一" },
        { dates: ["0619"], 归笺: 1200, 诱饵: 10, name: "端午" }
    ];
    let 节日触发 = false;
    let 节日感言 = "";
    for (const 节日 of 节日配置) {
        if (节日.dates.includes(月日)) {
            增加归笺 += 节日.归笺;
            增加诱饵 += 节日.诱饵;
            节日触发 = true;
            节日感言 += `【${节日.name}礼包:${节日.归笺}归笺 ${节日.诱饵}诱饵】`;
            break;
        }
    }

    // ================== 6. 写入数据 ==================
    const 当前时间 = timeA("y-m-d H:i:s", Math.floor(Date.now() / 1000));
    const 当前时间戳 = Math.floor(Date.now() / 1000);
    const 原归笺 = Number(readB("筱筱吖/娱乐系统/游戏数据/归笺.json", event.user_id, 0));
    const 原诱饵 = Number(readB("筱筱吖/娱乐系统/钓鱼玩法/道具/诱饵.json", event.user_id, 0));

    writeB("筱筱吖/娱乐系统/游戏数据/归笺.json", event.user_id, 原归笺 + 增加归笺);
    writeB("筱筱吖/娱乐系统/钓鱼玩法/道具/诱饵.json", event.user_id, 原诱饵 + 增加诱饵);
    writeB("筱筱吖/娱乐系统/签到数据/累计次数.json", event.user_id, 累计次数 + 1);
    writeB("筱筱吖/娱乐系统/签到数据/全服记录数量.json", 今天, 本次序号);
    writeB(`筱筱吖/娱乐系统/签到数据/日期记录/${今天}/检测.json`, event.user_id, "已签到");
    writeB(`筱筱吖/娱乐系统/签到数据/日期记录/${今天}/排名.json`, event.user_id, 本次序号);
    writeB(`筱筱吖/娱乐系统/签到数据/日期记录/${今天}/详细时间.json`, event.user_id, 当前时间);

    // ================== 7. 连签逻辑 ==================
    let 时间差 = 当前时间戳 - 上次签到时间;
    let streak显示 = "";
    if (时间差 > 129600 && 上次签到时间 !== 0) {
        writeB("筱筱吖/娱乐系统/签到数据/连签记录/连签数量.json", event.user_id, 1);
        streak显示 = "1天，继续保持哦～";
    } else if (时间差 > 129600 && 上次签到时间 === 0) {
        writeB("筱筱吖/娱乐系统/签到数据/连签记录/连签数量.json", event.user_id, 1);
        streak显示 = "中断啦！又要重新计算了～";
    } else {
        writeB("筱筱吖/娱乐系统/签到数据/连签记录/连签数量.json", event.user_id, 连续签到数量 + 1);
        streak显示 = `连续 ${连续签到数量 + 1} 天，继续保持哟～`;
    }
    writeB("筱筱吖/娱乐系统/签到数据/连签记录/上次签到/详细时间.json", event.user_id, 当前时间戳);

    // ================== 8. 连签奖励 ==================
    const 连签配置 = [
        { days: 7, reward: 520, key: "7" },
        { days: 14, reward: 1000, key: "14" },
        { days: 30, reward: 2000, key: "30" },
        { days: 60, reward: 10000, key: "60" }
    ];
    let 连签触发 = false;
    let 连签感言 = "";
    const 已连签天数 = readB("筱筱吖/娱乐系统/签到数据/连签记录/连签数量.json", event.user_id, 0);
    for (const 连签 of 连签配置) {
        if (已连签天数 >= 连签.days) {
            const 已领 = readB(`筱筱吖/娱乐系统/签到数据/连签记录/连签奖励_${连签.key}.json`, event.user_id, false);
            if (!已领) {
                增加归笺 += 连签.reward;
                连签触发 = true;
                连签感言 += `【连签${连签.days}天奖励:${连签.reward}归笺】`;
                writeB(`筱筱吖/娱乐系统/签到数据/连签记录/连签奖励_${连签.key}.json`, event.user_id, true);
            }
        }
    }

    // ================== 8.5 每日总榜 ==================
    const 每日总榜路径 = `筱筱吖/娱乐系统/签到数据/每日总榜/${今天}.json`;
    const 每日总榜 = JSON.parse(readA(每日总榜路径) || "[]");
    每日总榜.push({
        QQ: event.user_id,
        排名: 本次序号,
        获取归笺: 增加归笺,
        签到时间: 当前时间
    });
    writeA(每日总榜路径, JSON.stringify(每日总榜));

    // ================== 9. 生成事件标签 ==================
    const 事件列表 = [];
    if (周末触发) 事件列表.push({ text: "【周末翻倍×1.5】", bonus: false });
    if (节日触发) 事件列表.push({ text: 节日感言, bonus: true });
    if (连签触发) 事件列表.push({ text: 连签感言, bonus: true });

    // ================== 10. 图片渲染（未签到 → 白天主题 + 显示积分） ==================
    const 发送方式签到 = isImageRenderEnabled(readB);
    if (发送方式签到) {
        try {
            const imageData = await renderSignInCardImage({
                theme: "day",
                userName: `${event.sender.nickname}`,
                userId: event.user_id,
                rankText: `第${本次序号}名`,
                signed: false,
                guiJian: 增加归笺,
                yuEr: 增加诱饵,
                totalDays: `${累计次数 + 1}天`,
                streakText: streak显示,
                events: 事件列表,
            });
            if (imageData) {
                await 发消息(event, [段_引用(event.message_id), 渲染Base64图片段(imageData)]);
                return null;
            }
        } catch (e) {
            logger.error("[签到] 未签到图片渲染失败:", e);
        }
    }

    // ================== 11. 降级文本输出 ==================
    let 返回内容 = "✅ 签到成功啦～！";
    返回内容 += `\n════════════`;
    返回内容 += `\n[归笺] +${增加归笺}`;
    返回内容 += `\n[诱饵] +${增加诱饵}`;
    返回内容 += `\n----------------`;
    返回内容 += `\n[名次]: 第${本次序号}名`;
    返回内容 += `\n[时间]: ${当前时间}`;
    返回内容 += `\n[累计]: ${累计次数 + 1}天`;
    返回内容 += `\n[连签]: ${streak显示}`;
    if (周末触发 || 节日触发 || 连签触发) {
        返回内容 += `\n---------------`;
        返回内容 += `\n[触发]: `;
        if (周末触发) 返回内容 += "【周末翻倍×1.5】";
        if (节日触发) 返回内容 += 节日感言;
        if (连签触发) 返回内容 += 连签感言;
    }
    返回内容 += `\n════════════`;
    await 发消息(event, [段_引用(event.message_id), 段_文本(`${返回内容}`)]);
    return null;
}




if((message == "我的货币" || message == "我的归笺" || message == "我的信息") && 娱乐功能('我的信息')){
    // ================== 授权判断 ==================
    if(!(await requireAuthorized(RC_sq, event))) return null;
    // ================== 读取数据 ==================
    let 归笺 = Number(readB("筱筱吖/娱乐系统/游戏数据/归笺.json", event.user_id, 0));
    let 银行归笺 = Number(readB("筱筱吖/娱乐系统/游戏数据/银行系统/银行归笺.json", event.user_id, 0));
    let 累计签到数量 = readB("筱筱吖/娱乐系统/签到数据/累计次数.json", event.user_id, 0);
    let 连续签到数量 = readB("筱筱吖/娱乐系统/签到数据/连签记录/连签数量.json", event.user_id, 0);
    let 诱饵数 = Number(readB("筱筱吖/娱乐系统/钓鱼玩法/道具/诱饵.json", event.user_id, 0));
    let 禁言卡数 = Number(readB("筱筱吖/娱乐系统/游戏数据/道具/禁言卡.json", event.user_id, 0));
    // ================== 输出：文本 or 图片 ==================
    let 发送方式 = isImageRenderEnabled(readB);
    if(发送方式 == false){
        // ================== 组装消息 ==================
        let 组装消息 = `══════════════`;
        组装消息 += `\n[现有]:${moneyA(归笺)}`;
        组装消息 += `\n[储存]:${moneyA(银行归笺)}`;
        组装消息 += `\n[诱饵]:${诱饵数}个`;
        组装消息 += `\n[禁言卡]:${禁言卡数}张`;
        组装消息 += `\n---------------`;
        组装消息 += `\n[累签]:${累计签到数量}天`;
        组装消息 += `\n[连签]:${连续签到数量}天`;
        // ================== 输出 ==================
        await 发消息(event, [段_引用(event.message_id), 段_文本(`${组装消息}`)]);
        return null;
    }
    // 图片版：开启图片渲染时输出
    try{
        const cardTitle = message === "我的货币"
            ? "我的货币"
            : message === "我的归笺"
              ? "我的归笺"
              : "我的信息";
        const walletBgLocal =
          resolveEffectiveBgAbs("wallet") || resolveDefaultResourceImageAbs("运行状态.jpg") || "";
        const walletCard = {
            title: cardTitle,
            userName: String(event.sender?.nickname || "旅人"),
            userId: event.user_id,
            time: timeA("y-m-d H:i:s", Math.floor(Date.now() / 1000)),
            currentMoney: moneyA(归笺),
            bankMoney: moneyA(银行归笺),
            baitCount: String(诱饵数),
            muteCardCount: String(禁言卡数),
            signTotal: String(累计签到数量),
            signStreak: String(连续签到数量),
            pluginDir: PLUGIN_DIR,
            dataPath: getDataPath(),
            bgLocalPath: walletBgLocal,
        };

        let imageData = null;
        if (getRenderMode(readB) === "sharp") {
            imageData = await renderWalletWithSharp(walletCard, logger);
            if (!imageData) {
                logger.warn("[我的信息] Sharp 渲染失败，已回退 HTML 渲染");
            }
        }

        if (!imageData) {
            const htmlContent = readA("默认资源/我的信息.html");
            const renderData = {
                qq: String(event.user_id),
                time: walletCard.time,
                title: cardTitle,
                currentMoney: walletCard.currentMoney,
                bankMoney: walletCard.bankMoney,
                baitCount: walletCard.baitCount,
                muteCardCount: walletCard.muteCardCount,
                signTotal: walletCard.signTotal,
                signStreak: walletCard.signStreak,
            };
            imageData = await puppeteer(htmlContent, {
                data: renderData,
                width: 1080,
                height: 720,
            });
        }

        if(imageData){
            await 发消息(event, [段_引用(event.message_id), 渲染Base64图片段(imageData)]);
        }else{
            await 发消息(event, [段_引用(event.message_id), 段_文本('渲染失败：请检查 Puppeteer 服务是否运行')]);
        }
    }catch(e){
        logger.error("[我的信息] 图片渲染失败:", e);
        await 发消息(event, [段_引用(event.message_id), 段_文本(`图片渲染出错: ${e.message}`)]);
    }
    return null;
}

if(message.match(/^打劫/) && 娱乐功能('银行')){
    // ================== 授权判断 ==================
    if(!(await requireAuthorized(RC_sq, event))) return null;
    // ================== 获取艾特 ==================
    const atUsers = giveAT(event.message);
    const rs = (atUsers.length || 0);//获取艾特人数
    // ================== 判断 ==================
    if(rs == 0 || rs > 1){
        //await 发消息(event, [段_引用(event.message_id), 段_文本('介个功能需要艾特别人哦～！(只能艾特一个哦～)')]);
        return null;
    }
    if(atUsers[0] == event.self_id){
        await 发消息(event, [段_引用(event.message_id), 段_文本('补药打劫窝～五五五......')]);
        return null;
    }
    if(atUsers[0] == event.user_id){
        return null;
    }
    // ================== 获取数据 ==================
    let 我归笺 = Number(readB("筱筱吖/娱乐系统/游戏数据/归笺.json", event.user_id, 0));
    let 你归笺 = Number(readB("筱筱吖/娱乐系统/游戏数据/归笺.json", atUsers[0], 0));
    let 正反概率 = rand(1,2);//1是中，2是不中
    // ================== 判断 ==================
    if(我归笺 < 100){
        await 发消息(event, [段_引用(event.message_id), 段_文本('你的归笺不足哦～我可不会让你们空手套白狼～！')]);
        return null;
    }
    if(你归笺 < 100){
        await 发消息(event, [段_引用(event.message_id), 段_文本('他都剩下不到100的归笺了，放过他吧～')]);
        return null;
    }
    // ================== 判断冷却 ==================
    // 获取当前日期
    let 时间戳秒 = Math.floor(Date.now() / 1000);
    let 冷却秒数 = 120;
    let 保护时间 = 600;
    let 文件记录_我 = Number(readB("筱筱吖/娱乐系统/游戏数据/打劫冷却.json", event.user_id, 0));
    let 文件记录_你 = Number(readB("筱筱吖/娱乐系统/游戏数据/呜呜呜呜.json", atUsers[0], 0));
    let 过去秒数_我 = 时间戳秒 - 文件记录_我;
    let 过去秒数_你 = 时间戳秒 - 文件记录_你;
    if(过去秒数_我 < 冷却秒数){//不足时间就拦截
        let 组装消息 = `══════════════`;
        组装消息 += `\n - 这位盆悠不要这么急哟！`;
        组装消息 += `\n - 你可以看下面这个`;
        组装消息 += `\n - 左边数字跟右边一样就好了`;
        组装消息 += `\n - Tiem: ${过去秒数_我}/${冷却秒数}`;
        组装消息 += `\n══════════════`;
        await 发消息(event, [段_引用(event.message_id), 段_文本(`${组装消息}`)]);
        return null;
    }
    if(过去秒数_你 < 保护时间){//保护机制，防止集火
        let 组装消息 = `══════════════`;
        组装消息 += `\n - 对方处于保护期哦~`;
        组装消息 += `\n - 你还需要等待 ${保护时间 - 过去秒数_你}/${保护时间} 秒哦`;
        组装消息 += `\n══════════════`;
        await 发消息(event, [段_引用(event.message_id), 段_文本(`${组装消息}`)]);
        return null;
    }
    writeB("筱筱吖/娱乐系统/游戏数据/打劫冷却.json", event.user_id, 时间戳秒);
    writeB("筱筱吖/娱乐系统/游戏数据/呜呜呜呜.json", atUsers[0], 时间戳秒);
    // ================== 正式 - 成功 ==================
    if(正反概率 == 1){
        let 获取方式 = rand(1,3);//
        let 获取 = 0;
        if(获取方式 == 1){
            获取 = Math.floor(你归笺 * 0.03);
        }else if(获取方式 == 2){
            获取 = rand(15, 100);
        }else{
            获取 = rand(20, 80);
        }
        //输出
        let 组装消息 = `══════════════`;
        组装消息 += `\n - 打劫成功！`;
        组装消息 += `\n - 获得【${获取}】归笺`;
        组装消息 += `\n - 运气值「${获取方式}」`;
        let 我的归笺 = Number(readB("筱筱吖/娱乐系统/游戏数据/归笺.json", event.user_id, 0));
        let 你的归笺 = Number(readB("筱筱吖/娱乐系统/游戏数据/归笺.json", atUsers[0], 0));
        writeB("筱筱吖/娱乐系统/游戏数据/归笺.json", event.user_id, 我的归笺 + 获取);
        writeB("筱筱吖/娱乐系统/游戏数据/归笺.json", atUsers[0], 你的归笺 - 获取);
        await 发消息(event, [段_引用(event.message_id), 段_文本(`${组装消息}`)]);
        return null;
    }
    // ================== 正式 - 失败 ==================
    if(正反概率 == 2){
        let 惩罚方式 = rand(1,3);
        let 惩罚 = 0;
        let 时间 = 0;
        if(惩罚方式 == 1){
            惩罚 = Math.floor(我归笺 * 0.1);
        }else if(惩罚方式 == 2){
            惩罚 = rand(15, 100);
            时间 = rand(2, 5);
            //logger.error("哦"+时间);
            //这个要关禁闭
        }else{
            惩罚 = rand(25, 80);
        }
        //惩罚
        let dp188 = await BOTAPI(ctx, "get_group_member_info", {group_id: event.group_id,user_id: event.self_id});
        let Robot身份 = (RC_group_role[(dp188?.role || "member")] || 0);
        let dp199 = await BOTAPI(ctx, "get_group_member_info", {group_id: event.group_id,user_id: atUsers[0]});
        let 目标身份 = (RC_group_role[(dp199?.role || "member")] || 0);
        let 禁言状态 = false;
        if((Robot身份 > 目标身份 || Robot身份 == 3) && 时间 != 0){
            let 参数 = {group_id : event.group_id, user_id : event.user_id, duration : (时间 * 60)};
            BOTAPI(ctx, "set_group_ban", 参数);
            禁言状态 = true;
        }
        //输出
        let 组装消息 = `══════════════`;
        组装消息 += `\n - 五五五～打劫失败了......`;
        组装消息 += `\n - 被没收了【${惩罚}】归笺`;
        if(禁言状态){
            组装消息 += `\n - 还被关禁闭「${时间}」分钟`;
        }
        //写入
        let 我的归笺 = Number(readB("筱筱吖/娱乐系统/游戏数据/归笺.json", event.user_id, 0));
        let 你的归笺 = Number(readB("筱筱吖/娱乐系统/游戏数据/归笺.json", atUsers[0], 0));
        writeB("筱筱吖/娱乐系统/游戏数据/归笺.json", event.user_id, 我的归笺 - 惩罚);
        writeB("筱筱吖/娱乐系统/游戏数据/归笺.json", atUsers[0], 你的归笺 + 惩罚);
        //输出
        await 发消息(event, [段_引用(event.message_id), 段_文本(`${组装消息}`)]);
        return null;
    }
    // ================== 检 ==================
    await 发消息(event, [段_引用(event.message_id), 段_文本('理论上不会触发这一条消息')]);
    return null;
}

if(message == "归笺排行榜" && 娱乐功能('排行榜')){
    // ================== 授权判断 ==================
    if(!(await requireAuthorized(RC_sq, event))) return null;
    // ================== 获取数据 ==================
    const shuju = JSON.parse(readA("筱筱吖/娱乐系统/游戏数据/归笺.json") || "[]");
    const ranking = Object.entries(shuju)
        .sort((a, b) => b[1] - a[1])
        .map(([人, 值], index) => ({
            排名: index + 1,
            QQ: 人,
            数量: 值
        }));
    const 总人数 = (Object.keys(shuju).length || 0);
    // ================== 判断 ==================
    if(总人数 == 0){
        await 发消息(event, [段_引用(event.message_id), 段_文本('无数据')]);
        return null;
    }
    // ================== 循环取值 ==================
    let 组装消息 = ``;
    let 本人排名 = "无";
    for(let i = 0; i < 总人数; i++) {
        let 本次QQ = (ranking[i]["QQ"] || "");
        let 本次额度0 = (ranking[i]["数量"] || 0);
        if(本次额度0 <= 0){
            本次额度0 = 0;
        }
        let 本次额度 = moneyA(本次额度0);
        if(本次QQ == event.user_id){
            本人排名 = (ranking[i]["排名"] || "无");
            组装消息 += `\n${i + 1}.【${本次QQ}】: ${本次额度}🟢`;
        }else{
            组装消息 += `\n${i + 1}.【${本次QQ}】: ${本次额度}`;
        }
    }
    // ================== 输出 ==================
    let 返回内容 = `归笺排行榜 - 共【${总人数}】人`;
    返回内容 += `\n你的排名 : ${本人排名}`;
    返回内容 += `\n══════════════`;
    返回内容 += 组装消息;
    返回内容 += `\n══════════════`;
    if(总人数 >= 20){
        const messages = [
            合并节点("[归笺排行榜]", event.self_id, [段_文本(返回内容)])
        ];
        await 发合并消息(event, messages);
    }else{
        await 发消息(event, [段_引用(event.message_id), 段_文本(`${返回内容}`)]);
    }
    return null;
}

if(message == "签到排行榜" && 娱乐功能('排行榜')){
    // ================== 授权判断 ==================
    if(!(await requireAuthorized(RC_sq, event))) return null;
    // ================== 获取数据 ==================
    let 今天 = timeA("y-m-d", Math.floor(Date.now() / 1000));
    let 数据 = JSON.parse(readA(`筱筱吖/娱乐系统/签到数据/每日总榜/${今天}.json`) || "[]");
    let 数量 = (数据.length || 0);
    // ================== 判断 ==================
    if(数量 == 0){
        await 发消息(event, [段_引用(event.message_id), 段_文本('好像木有排名数据耶～？')]);
        return null;
    }
    // ================== 正式 - 前置==================
    let 组装排名消息 = ``;
    let 发言人的排名 = `无`;
    // ================== 正式 - 循环 ==================
    for(let i = 0; i < 数量; i++) {
        let QQ = 数据[i]["QQ"];
        let 名次 = 数据[i]["排名"];
        let 归笺 = 数据[i]["获取归笺"];
        let 时间 = 数据[i]["签到时间"];
        if(QQ == event.user_id){
            发言人的排名 = 名次;
        }
        if(i < 10){
            组装排名消息 += `\n═════第${名次}名═════`;
            组装排名消息 += `\n[名次] : 第${名次}名`;
            组装排名消息 += `\n[用户] : ${QQ}`;
            组装排名消息 += `\n[获得归笺] : ${归笺}`;
            组装排名消息 += `\n[签到时间] : ${时间}`;
            组装排名消息 += `\n`;
        }
    }
    // ================== 二次组装 ==================
    let 组装消息 = `共计有 ${数量} 位签到用户`;
    组装消息 += `\n仅展示前10位用户`;
    组装消息 += `\n你的排名 : ${发言人的排名}`;
    组装消息 += `\n`;
    组装消息 += 组装排名消息;
    组装消息 += `══════════════`;
    // ================== 输出 ==================
    if(数量 >= 5){
        const messages = [合并节点("[签到排行榜]", event.self_id, [段_文本(组装消息)])];
        await 发合并消息(event, messages);
    }else{
        await 发消息(event, [段_引用(event.message_id), 段_文本(`${组装消息}`)]);
    }
    return null;
}


if((message == "存款排行榜" || message == "银行归笺排行榜") && 娱乐功能('排行榜')){
    // ================== 授权判断 ==================
    if(!(await requireAuthorized(RC_sq, event))) return null;
    // ================== 获取数据 ==================
    const shuju = JSON.parse(readA("筱筱吖/娱乐系统/游戏数据/银行系统/银行归笺.json") || "[]");
    const 总人数 = (Object.keys(shuju).length || 0);
    // ================== 判断 ==================
    if(总人数 == 0){
        await 发消息(event, [段_引用(event.message_id), 段_文本('无数据')]);
        return null;
    }
    // ================== 计算含利润的数据 ==================
    const 用户数据 = Object.entries(shuju).map(([人, 本金]) => {
        let 本次额度0 = 本金 <= 0 ? 0 : 本金;
        // ================== 利润机制 - 时间换算 ==================
        let 储存时间 = readB("筱筱吖/娱乐系统/游戏数据/银行系统/储存时间.json", 人, 0);
        let 总秒数 = Math.floor(Date.now() / 1000) - 储存时间;
        let 总小时 = 总秒数 / 3600;
        let 总天数 = 总秒数 / 86400;
        let 利润 = 0;
        if(储存时间 != 0 && 储存时间 != undefined && 总秒数 > 0){
            // ================== 利润机制 - 利息计算 ==================
            let 换算比例 = 2;
            let 剩余小时数 = Math.floor(总小时 / 换算比例);
            if(剩余小时数 != 0){
                利润 = 本次额度0 * 剩余小时数 * 0.00025;
                if(总天数 >= 3){
                    利润 = 本次额度0 * 剩余小时数 * 0.0008;
                }
                if(总天数 >= 7){
                    利润 = 本次额度0 * 剩余小时数 * 0.001;
                }
                if(总天数 >= 14){
                    利润 = 本次额度0 * 剩余小时数 * 0.0015;
                }
                if(总天数 >= 30){
                    利润 = 本次额度0 * 剩余小时数 * 0.0019;
                }
                利润 = Math.ceil(利润);
            }
        }
        return {
            QQ: 人,
            本金: 本次额度0,
            利润: 利润,
            总额: 本次额度0 + 利润
        };
    });
    // ================== 按总额排序 ==================
    const ranking = 用户数据
        .sort((a, b) => b.总额 - a.总额)
        .map((item, index) => ({
            排名: index + 1,
            ...item
        }));
    // ================== 循环取值 ==================
    let 组装消息 = ``;
    let 本人排名 = "无";
    for(let i = 0; i < 总人数; i++){
        let 本次QQ = ranking[i].QQ;
        let 本次额度 = moneyA(ranking[i].总额);
        // ================== 判断本人 ==================
        if(本次QQ == event.user_id){
            本人排名 = ranking[i].排名;
            组装消息 += `\n${i + 1}.【${本次QQ}】: ${本次额度}🟢`;
        }else{
            组装消息 += `\n${i + 1}.【${本次QQ}】: ${本次额度}`;
        }
    }
    // ================== 输出 ==================
    let 返回内容 = `存款归笺排行榜(含利润) - 共【${总人数}】人`;
    返回内容 += `\n你的排名 : ${本人排名}`;
    返回内容 += `\n══════════════`;
    返回内容 += 组装消息;
    返回内容 += `\n══════════════`;
    if(总人数 >= 20){
        const messages = [
            合并节点("[归笺排行榜]", event.self_id, [段_文本(返回内容)])
        ];
        await 发合并消息(event, messages);
    }else{
        await 发消息(event, [段_引用(event.message_id), 段_文本(`${返回内容}`)]);
    }
    return null;
}



if(message == "银行系统" && 娱乐功能('银行')){
    // ================== 授权判断 ==================
    if(!(await requireAuthorized(RC_sq, event))) return null;
    
    // ================== 组装消息 ==================
    let 返回内容 = `══════════════`;
    返回内容 += `\n存款[数量]`;
    返回内容 += `\n取出[数量]`;
    返回内容 += `\n全部存款 全部取出`;
    返回内容 += `\n转移归笺#[QQ]#[数量]`;
    返回内容 += `\n--------------------`;
    返回内容 += `\n打劫[艾特别人]`;
    返回内容 += `\n══════════════`;
    // ================== 输出 ==================
    await 发消息(event, [段_引用(event.message_id), 段_文本(`${返回内容}`)]);
    return null;
}



if(message.match(/^(全部|)(存款|存入)([0-9]+|)$/) && 娱乐功能('银行')){
    // ================== 授权判断 ==================
    if(!(await requireAuthorized(RC_sq, event))) return null;
    // ================== 读取数据 ==================
    const one_mub = message.match(/^(全部|)(存款|存入)([0-9]+|)/)[1];
    const three_mub = (message.match(/^(全部|)(存款|存入)([0-9]+|)/)[3] || 0);
    let 归笺 = Number(readB("筱筱吖/娱乐系统/游戏数据/归笺.json", event.user_id, 0));
    let 储存时间 = readB("筱筱吖/娱乐系统/游戏数据/银行系统/储存时间.json", event.user_id, 0);
    let 要存的 = 0;
    
    // ================== 判断 - 1==================
    if(one_mub != "" && three_mub != ""){
        await 发消息(event, [段_引用(event.message_id), 段_文本('你这样做可不行哦～全部存款时不可以加指定值哦～')]);
        return null;
    }
    if(one_mub == three_mub){//如果两个都是空的
        return null;
    }
    // ================== 判断 - 2 ==================
    if(one_mub == "全部" && three_mub == ""){
        要存的 = 归笺;
    }
    if(one_mub == "" && three_mub != ""){
        要存的 = Number(three_mub);
    }
    if(要存的 > 归笺){
        await 发消息(event, [段_引用(event.message_id), 段_文本('你现有的归笺好像没有这么多叭～？')]);
        return null;
    }
    if(要存的 == 0){
        await 发消息(event, [段_引用(event.message_id), 段_文本('你是0吗？')]);
        return null;
    }
    
    // ================== 写入数据 ==================
    let 归笺2 = Number(readB("筱筱吖/娱乐系统/游戏数据/归笺.json", event.user_id, 0));
    let 银行2归笺 = Number(readB("筱筱吖/娱乐系统/游戏数据/银行系统/银行归笺.json", event.user_id, 0));
    writeB("筱筱吖/娱乐系统/游戏数据/归笺.json", event.user_id, 归笺 - 要存的);
    writeB("筱筱吖/娱乐系统/游戏数据/银行系统/银行归笺.json", event.user_id, 银行2归笺 + 要存的);
    if(储存时间 == 0 || 储存时间 == undefined){
        writeB("筱筱吖/娱乐系统/游戏数据/银行系统/储存时间.json", event.user_id, Math.floor(Date.now() / 1000));
    }
    
    // ================== 组装消息 ==================
    let quc = moneyA(要存的);
    let zgg = moneyA(银行2归笺 + 要存的);
    let 返回内容 = ``;
    返回内容 += `存款成功啦～！`;
    返回内容 += `\n══════════════`;
    返回内容 += `\n[存入]:${quc}`;
    返回内容 += `\n[总共]:${zgg}`;
    返回内容 += `\n══════════════`;
    await 发消息(event, [段_引用(event.message_id), 段_文本(`${返回内容}`)]);
    return null;
}


if(message.match(/^(全部|)(取出|取款)([0-9]+|)$/) && 娱乐功能('银行')){
    // ================== 授权判断 ==================
    if(!(await requireAuthorized(RC_sq, event))) return null;
    // ================== 读取数据 ==================
    const one_mub = message.match(/^(全部|)(取出|取款)([0-9]+|)/)[1];
    const three_mub = (message.match(/^(全部|)(取出|取款)([0-9]+|)/)[3] || 0);
    let 储存时间 = readB("筱筱吖/娱乐系统/游戏数据/银行系统/储存时间.json", event.user_id, 0);
    let 银行_归笺 = Number(readB("筱筱吖/娱乐系统/游戏数据/银行系统/银行归笺.json", event.user_id, 0));
    let 要取的 = 0;
    
    // ================== 判断 - 1==================
    if(one_mub != "" && three_mub != ""){
        await 发消息(event, [段_引用(event.message_id), 段_文本('你这样做可不行哦～全部取款时不可以加指定值哦～')]);
        return null;
    }
    if(one_mub == three_mub){//如果两个都是空的
        return null;
    }
    // ================== 判断 - 2 ==================
    if(one_mub == "全部" && three_mub == ""){
        要取的 = 银行_归笺;
    }
    if(one_mub == "" && three_mub != ""){
        要取的 = Number(three_mub);
    }
    if(储存时间 == 0){
        await 发消息(event, [段_引用(event.message_id), 段_文本('你好像没有储存过哎～我这里都找不到记录～')]);
        return null;
    }
    if(要取的 > 银行_归笺){
        await 发消息(event, [段_引用(event.message_id), 段_文本('你好像没有这么多叭～？')]);
        return null;
    }
    if(要取的 == 0){
        await 发消息(event, [段_引用(event.message_id), 段_文本('你是0吗？')]);
        return null;
    }
    
    // ================== 利润机制 - 时间换算 ==================
    let 总秒数 = Math.floor(Date.now() / 1000) - 储存时间;//获取出储存秒
    let 总小时 = 总秒数 / 3600;//换算小时
    let 总天数 = 总秒数 / 86400;//换算成天数
    if(储存时间 == 0 || 储存时间 == undefined || 总秒数 <= 0){
        await 发消息(event, [段_引用(event.message_id), 段_文本('储存时间记录异常！')]);
        return null;
    }
    
    // ================== 利润机制 - 利息计算 ==================
    let 换算比例 = 2;//如24小时就砍半=12小时，不砍则1
    let 剩余小时数 = Math.floor(总小时 / 换算比例);
    let 利润 = 0;
    if(剩余小时数 != 0){
        利润 = 银行_归笺 * 剩余小时数 * 0.00025;
        if(总天数 >= 3){
            利润 = 银行_归笺 * 剩余小时数 * 0.0008;
        }
        if(总天数 >= 7){
            利润 = 银行_归笺 * 剩余小时数 * 0.001;
        }
        if(总天数 >= 14){
            利润 = 银行_归笺 * 剩余小时数 * 0.0015;
        }
        if(总天数 >= 30){
            利润 = 银行_归笺 * 剩余小时数 * 0.0019;
        }
        利润 = Math.ceil(利润);
    }else{
        利润 = 0;
    }
    
    // ================== 重新写入数据 ==================
    let 归笺 = Number(readB("筱筱吖/娱乐系统/游戏数据/归笺.json", event.user_id, 0));
    let 银行2归笺 = Number(readB("筱筱吖/娱乐系统/游戏数据/银行系统/银行归笺.json", event.user_id, 0));
    writeB("筱筱吖/娱乐系统/游戏数据/归笺.json", event.user_id, 归笺 + 利润 + 要取的);
    writeB("筱筱吖/娱乐系统/游戏数据/银行系统/银行归笺.json", event.user_id, 银行2归笺 - 要取的);
    writeB("筱筱吖/娱乐系统/游戏数据/银行系统/储存时间.json", event.user_id, Math.floor(Date.now() / 1000));
    
    // ================== 组装消息 ==================
    let hbi = moneyA(利润);
    let quc = moneyA(要取的);
    let 返回内容 = ``;
    返回内容 += `取款成功啦～！`;
    返回内容 += `\n══════════════`;
    返回内容 += `\n[取出]:${quc}`;
    返回内容 += `\n-------------------`;
    返回内容 += `\n[利润]:${hbi}`;
    返回内容 += `\n[时长]:${Number(总小时.toFixed(2))}小时`;
    返回内容 += `\n══════════════`;
    await 发消息(event, [段_引用(event.message_id), 段_文本(`${返回内容}`)]);
    return null;
}

/*
// ================== QQ空间 - 发动态 ==================
if (giveText(event.message).match(/^发动态/) || message.match(/^发动态/)) {
    // ================== 授权判断 ==================
    if(!(await requireAuthorized(RC_sq, event))) return null;
    // ================== 主人检测 ==================
    if (!(await checkOwner3(event, ctx, false))) return null;
    // ================== 解析内容与图片 ==================
    const 动态文本 = stripCQCodes(giveText(event.message).replace(/^发动态\s?/, ""));
    const 发布图片 = await collectEventImages(event, ctx);
    if (!动态文本 && 发布图片.length === 0) {
        await 发消息(event, [段_引用(event.message_id), 段_文本('请发送文字或附带图片\n用法：发动态内容（可无空格）')]);
        return null;
    }
    // ================== 发布 ==================
    const 发布结果 = await qzonePublishDynamic(ctx, {
        text: 动态文本,
        images: 发布图片.length > 0 ? 发布图片 : undefined,
    });
    if (!发布结果?.ok) {
        await 发消息(event, [段_引用(event.message_id), 段_文本(`发动态失败：${发布结果?.error || "未知错误"}`)]);
        return null;
    }
    let 成功提示 = `✅ 空间动态已发布`;
    if (发布结果.tid) 成功提示 += `\nTID: ${发布结果.tid}`;
    await 发消息(event, [段_引用(event.message_id), 段_文本(`${成功提示}`)]);
    return null;
}


// ================== QQ空间 - 点赞（测试） ==================
if (giveText(event.message).match(/^点赞#/) || message.match(/^点赞#/)) {
    // ================== 授权判断 ==================
    if(!(await requireAuthorized(RC_sq, event))) return null;
    // ================== 主人检测 ==================
    if (!(await checkOwner3(event, ctx, false))) return null;
    const 点赞指令 = stripCQCodes(giveText(event.message) || message);
    const 点赞匹配 = 点赞指令.match(/^点赞#(?:(\d{5,})#)?([0-9a-zA-Z_.-]+)$/);
    if (!点赞匹配) {
        await 发消息(event, [段_引用(event.message_id), 段_文本('用法：\n点赞#说说TID\n点赞#QQ号#说说TID')]);
        return null;
    }
    const 目标QQ = 点赞匹配[1];
    const 说说TID = 点赞匹配[2];
    const 点赞结果 = await qzoneLike(ctx, {
        tid: 说说TID,
        ...(目标QQ ? { targetUin: 目标QQ } : {}),
    });
    if (!点赞结果?.ok) {
        await 发消息(event, [段_引用(event.message_id), 段_文本(`点赞失败：${点赞结果?.error || "未知错误"}`)]);
        return null;
    }
    await 发消息(event, [段_引用(event.message_id), 段_文本(`✅ ${点赞结果.message || "点赞成功"}\nTID: ${说说TID}`)]);
    return null;
}


// ================== QQ空间 - 评论（测试） ==================
if (giveText(event.message).match(/^评论#/) || message.match(/^评论#/)) {
    // ================== 授权判断 ==================
    if(!(await requireAuthorized(RC_sq, event))) return null;
    // ================== 主人检测 ==================
    if (!(await checkOwner3(event, ctx, false))) return null;
    const 评论指令 = stripCQCodes(giveText(event.message) || message);
    let 目标QQ = null;
    let 说说TID = null;
    let 评论内容 = null;
    const 评论匹配1 = 评论指令.match(/^评论#(?:(\d{5,})#)?([0-9a-zA-Z_.-]+)#([\s\S]+)$/);
    const 评论匹配2 = 评论指令.match(/^评论#(?:(\d{5,})#)?([0-9a-zA-Z_.-]+)\s+([\s\S]+)$/);
    if (评论匹配1) {
        目标QQ = 评论匹配1[1];
        说说TID = 评论匹配1[2];
        评论内容 = 评论匹配1[3].trim();
    } else if (评论匹配2) {
        目标QQ = 评论匹配2[1];
        说说TID = 评论匹配2[2];
        评论内容 = 评论匹配2[3].trim();
    }
    if (!说说TID || !评论内容) {
        await 发消息(event, [段_引用(event.message_id), 段_文本('用法：\n评论#说说TID#内容\n评论#QQ#说说TID#内容\n评论#说说TID 内容')]);
        return null;
    }
    const 评论结果 = await qzoneComment(ctx, {
        tid: 说说TID,
        content: 评论内容,
        ...(目标QQ ? { targetUin: 目标QQ } : {}),
    });
    if (!评论结果?.ok) {
        await 发消息(event, [段_引用(event.message_id), 段_文本(`评论失败：${评论结果?.error || "未知错误"}`)]);
        return null;
    }
    let 成功提示 = `✅ ${评论结果.message || "评论成功"}\nTID: ${说说TID}`;
    if (评论结果.commentId) 成功提示 += `\n评论ID: ${评论结果.commentId}`;
    await 发消息(event, [段_引用(event.message_id), 段_文本(`${成功提示}`)]);
    return null;
}


// ================== QQ空间 - 获取动态列表 ==================
if (message.match(/^空间动态(?:#(\d+))?$/)) {
    // ================== 授权判断 ==================
    if(!(await requireAuthorized(RC_sq, event))) return null;
    // ================== 主人检测 ==================
    if (!(await checkOwner3(event, ctx, false))) return null;
    // ================== 指定 QQ（可选） ==================
    const 指定QQ = message.match(/^空间动态(?:#(\d+))?$/)?.[1];
    const 列表选项 = {};
    if (指定QQ) 列表选项.uin = 指定QQ;
    const 列表结果 = await qzoneGetFeeds(ctx, 列表选项);
    if (!列表结果?.ok || !Array.isArray(列表结果.feeds) || 列表结果.feeds.length === 0) {
        const 失败说明 = 列表结果?.error || "暂无动态或获取失败";
        await 发消息(event, [段_引用(event.message_id), 段_文本(`获取空间动态失败：${失败说明}`)]);
        return null;
    }
    // ================== 组装合并转发 ==================
    const 目标说明 = 指定QQ ? `QQ ${指定QQ}` : `本号 ${列表结果.uin}`;
    const 汇总节点 = {
        name: "QQ空间",
        qq: event.self_id,
        time: Math.floor(Date.now() / 1000),
        text: `📋 ${目标说明} 的空间动态（共 ${列表结果.feeds.length} 条）`,
    };
    const 动态节点 = 列表结果.feeds.map((feed) => {
        let 节点文本 = "";
        节点文本 += `【说说 ${feed.tid || "?"}】\n`;
        节点文本 += `作者：${feed.name || "未知"} (${feed.uin || "?"})\n`;
        节点文本 += `时间：${timeA("y-m-d H:i:s", feed.create_time || 0)}\n`;
        if (feed.source_name) 节点文本 += `来源：${feed.source_name}\n`;
        节点文本 += "────────────\n";
        if (feed.content) 节点文本 += `${feed.content}\n`;
        if (feed.rt_content) 节点文本 += `[转发] ${feed.rt_content}\n`;
        if (feed.comments?.length) 节点文本 += `\n[评论 ${feed.comments.length} 条]`;
        return {
            name: feed.name || "空间用户",
            qq: feed.uin || event.self_id,
            time: feed.create_time || Math.floor(Date.now() / 1000),
            text: 节点文本.trim(),
            images: Array.isArray(feed.images) && feed.images.length > 0 ? feed.images.slice(0, 9) : undefined,
        };
    });
    const 转发消息 = [汇总节点, ...动态节点];
    const 转发成功 = await 发合并消息(event, 转发消息, 合并预览(
        "QQ空间好友动态",
        `共 ${动态节点.length + 1} 条说说动态`,
        "[聊天记录]",
        ["汇总: 空间动态列表", "动态: 文本与图片", "来源: QQ空间 feeds"],
    ));
    if (!转发成功) {
        await 发消息(event, [段_引用(event.message_id), 段_文本(`合并转发发送失败，以下为 JSON 结果：\n${JSON.stringify(列表结果)}`)]);
    }
    return null;
}
*/



if(message.match(/^转移归笺#([0-9]+)#([0-9]+)$/) && 娱乐功能('银行')){
    // ================== 授权判断 ==================
    if(!(await requireAuthorized(RC_sq, event))) return null;
    // ================== 检 ==================
    const 目标 = message.match(/^转移归笺#([0-9]+)#([0-9]+)$/)[1];
    const 数量 = Number(message.match(/^转移归笺#([0-9]+)#([0-9]+)$/)[2]);
    // ================== 字数检测 ==================
    if(数量.length > 15 || 目标.length > 15){
        return null;
    }
    // ================== 检测数量 ==================
    let 我归笺 = Number(readB("筱筱吖/娱乐系统/游戏数据/归笺.json", event.user_id, 0));
    if(数量 > 我归笺 || 我归笺 == 0 || 数量 == 0){
        await 发消息(event, [段_引用(event.message_id), 段_文本('这数量不对吧～？')]);
        return null;
    }
    if(目标 == event.user_id){
        await 发消息(event, [段_引用(event.message_id), 段_文本('不阔以转给自己哟！')]);
        return null;
    }
    // ================== 正常写入 ==================
    let 你归笺 = Number(readB("筱筱吖/娱乐系统/游戏数据/归笺.json", 目标, 0));
    writeB("筱筱吖/娱乐系统/游戏数据/归笺.json", 目标, 你归笺 + 数量);
    writeB("筱筱吖/娱乐系统/游戏数据/归笺.json", event.user_id, 我归笺 - 数量);
    await 发消息(event, [段_引用(event.message_id), 段_文本(`归笺转移成功～！\n目标:#${目标}\n数量:#${数量}`)]);
    return null;
}


// ================== 漂流瓶（实现见 ./auth/drift-bottle.ts） ==================
const driftBottleResult = await handleDriftBottleCommands(message, event, ctx, RC_sq, 娱乐功能('漂流瓶'), {
    readB,
    writeB,
    readA,
    writeA,
    timeA,
    rand,
    checkOwner3,
    getDataPath,
    giveText,
    giveImages,
    downloadFile,
});
if (driftBottleResult === 'halt') {
    return null;
}

if((message == "音乐功能" || message == "音乐系统" || message == "音乐菜单") && 娱乐功能('点歌')){
    // ================== 授权判断 ==================
    if(!(await requireAuthorized(RC_sq, event))) return null;
    // ================== 组装消息1 ==================
    let 组装消息1 = `MK - 音乐系统 - ${RC_music_bbh}`;
    
    let 组装消息2 = `点歌使用例子↓`;
    组装消息2 += `\n══════════════`;
    组装消息2 += `\n - 点歌小团圆（默认网易云）`;
    组装消息2 += `\n - 网易云点歌小团圆`;
    组装消息2 += `\n - 酷我点歌小团圆`;
    组装消息2 += `\n - QQ点歌小团圆`;
    组装消息2 += `\n══════════════`;
    
    let 组装消息3 = `选歌使用例子↓`;
    组装消息3 += `\n══════════════`;
    组装消息3 += `\n - 选歌1`;
    组装消息3 += `\n - 卡片选歌1`;
    组装消息3 += `\n - 语音选歌1`;
    组装消息3 += `\n - 链接选歌1`;
    组装消息3 += `\n══════════════`;
    
    let 组装消息4 = `收藏操作`;
    组装消息4 += `\n══════════════`;
    组装消息4 += `\n - 个人歌单`;
    组装消息4 += `\n - 收藏歌曲1`;
    组装消息4 += `\n - 取消收藏2`;
    组装消息4 += `\n - 取消收藏3-5`;
    组装消息4 += `\n - 播放收藏6`;
    组装消息4 += `\n - 卡片播放收藏7`;
    组装消息4 += `\n - 语音播放收藏8`;
    组装消息4 += `\n - 链接播放收藏9`;
    组装消息4 += `\n - 清空个人收藏歌曲`;
    组装消息4 += `\n══════════════`;
    // ================== 组装消息2 ==================
    let 尾声1 = `【接口提供来源】`;
    尾声1 += `\n「网易云点歌」OIAPI: https://oiapi.net/`;
    尾声1 += `\n「酷我点歌」OIAPI: https://oiapi.net/`;
    尾声1 += `\n「QQ点歌」云汐API: https://a.aa.cab/`;
    // ================== 组装消息3 ==================
    let 尾声2 = `声明\n══════════════`;
    尾声2 += `\n【1】选歌时可能会有点慢，如超30秒没回复才算无效`;
    尾声2 += `\n【2】如有接口失效/更好的接口推荐，可联系更换`;
    尾声2 += `\n【3】音乐卡片播放不能点击按钮播放的可能原因:该音源与音乐卡片支持播放的不兼容`;
    尾声2 += `\n【4】汽水点歌已下线，默认音源为网易云`;
    尾声2 += `\n【5】`;
    // ================== 输出 ==================
    const messages = [
        合并节点("[音乐系统]", event.self_id, [段_文本(组装消息1)]),
        合并节点("[音乐系统]", event.self_id, [段_文本(组装消息2)]),
        合并节点("[音乐系统]", event.self_id, [段_文本(组装消息3)]),
        合并节点("[音乐系统]", event.self_id, [段_文本(组装消息4)]),
        合并节点("[音乐系统]", event.self_id, [段_文本(尾声1)]),
        合并节点("[音乐系统]", event.self_id, [段_文本(尾声2)])
    ];
    await 发合并消息(event, messages, 合并预览(
        "MKbot 音乐系统",
        "点歌、歌单与多音源接口说明",
        "[聊天记录]",
        ["音乐系统: 点歌指令", "音源: 网易云/酷我/QQ", "接口来源与使用声明"],
    ));
    return null;
}



if(message == "测试音乐接口" && 娱乐功能('点歌')){
    // ================== 最高主人检测 ==================
    if(!(await checkOwner3(event, ctx, false))) return null;
    // ================== 授权判断 ==================
    if(!(await requireAuthorized(RC_sq, event))) return null;
    await 发消息(event, [段_引用(event.message_id), 段_文本('正在尝试访问接口')]);
    const 时间戳秒 = Math.floor(Date.now() / 1000);
    const dd_name = `小团圆`;
    let mub = ``;
    // ================== 获取音源 - 列表 - 第一步 ==================
    let CNMB = {
        "QQ":`https://a.aa.cab/qq.music?msg=${dd_name}&num=10`,
        "酷我":`https://oiapi.net/api/Kuwo?msg=${dd_name}&limit=20`,
        "网易云":`https://oiapi.net/api/Music_163?name=${dd_name}&limit=20`
    };
    const 音源 = ["QQ", "酷我", "网易云"];
    const 音源数量 = (音源.length || 0);
    if(音源数量 == 0){
        await 发消息(event, [段_引用(event.message_id), 段_文本('无音源无法执行！')]);
        return null;
    }
    // ================== 循环获取列表 - 第二步 ==================
    let 歌单回复内容 = `检查接口是否支持访问:\n══════════════`;
    let 无效数量 = 0;
    for(let i = 0; i < 音源数量; i++){
        let 本次音源 = 音源[i];
        let 访问目标 = CNMB[本次音源];
        try{
            let response = await fetch(访问目标);
            let API_shuju = await response.json();
            // ================== 解析各种音源 ==================
            let jieguo_数量 = (API_shuju?.["data"]?.length || 0);
            if(API_shuju && jieguo_数量 != 0){
                writeB(`筱筱吖/音乐系统/接口排查/${时间戳秒}/列表.json`, 本次音源, JSON.stringify(API_shuju));
                歌单回复内容 += `\n【${本次音源}】: ✅${jieguo_数量}`;
            }else{
                writeB(`筱筱吖/音乐系统/接口排查/${时间戳秒}/列表.json`, 本次音源, false);
                歌单回复内容 += `\n【${本次音源}】: ❌${jieguo_数量}`;
                无效数量++;
            }
        }catch(e){
            // 单个接口失败时不终止整个检测流程
            writeB(`筱筱吖/音乐系统/接口排查/${时间戳秒}/列表.json`, 本次音源, false);
            歌单回复内容 += `\n【${本次音源}】: ❌0`;
            无效数量++;
        }
    }
    // ================== 输出第一次校验结果 - 第三步 ==================
    await 发消息(event, [段_文本(`${歌单回复内容}`)]);
    if(无效数量 == 音源数量){
        await 发消息(event, [段_引用(event.message_id), 段_文本('全部接口均无效，已结束任务！')]);
        return null;
    }
    await 发消息(event, [段_引用(event.message_id), 段_文本('状态获取成功～！\n下一步:获取选歌结果')]);
    // ================== 第二次访问接口 - 第四步 ==================
    mub = 1;
    CNMB = {
        "QQ":`https://a.aa.cab/qq.music?msg=${dd_name}&num=10&n=${mub}`,
        "酷我":`https://oiapi.net/api/Kuwo?msg=${dd_name}&n=${mub}`,
        "网易云":`https://oiapi.net/api/Music_163?name=${dd_name}&limit=20&n=${mub}`
    };
    let 空值次数 = 0;
    let 选歌回复内容 = `检查是否可以选歌:\n══════════════`;
    for(let i = 0; i < 音源数量; i++){
        // ================== 获取状态 ==================
        let 状态 = readB(`筱筱吖/音乐系统/接口排查/${时间戳秒}/列表.json`, 音源[i], false);
        if(!状态){
            continue;//跳过循环
        }
        let 本次音源 = 音源[i];
        let 访问目标 = CNMB[本次音源];
        let API_shuju = null;
        try{
            let response = await fetch(访问目标);
            API_shuju = await response.json();
        }catch(e){
            空值次数++;
            continue;
        }

        // ================== 解析各种音源 - 前置==================
        let 歌名 = "";
        let 歌手 = "";
        let 封面 = "";
        let 链接 = "";
        let ttt = "163";
        let data = API_shuju?.["data"] || {};

        // ================== 解析各种音源 - 执行 ==================
        if(本次音源 == "酷我"){
            歌名 = data?.song || "";
            歌手 = data?.singer || "";
            封面 = data?.picture || "";
            链接 = data?.url || "";
            ttt = "kuwo";
        
        }else if(本次音源 == "QQ"){
            歌名 = data?.song || "";
            歌手 = data?.singer || "";
            封面 = data?.cover || "";
            链接 = data?.music || "";
            ttt = "qq";
        
        }else if(本次音源 == "网易云"){
            歌名 = data?.name || "";
            let singer0 = data?.singers?.[0] || {};
            歌手 = singer0?.name || "";
            封面 = data?.picurl || "";
            链接 = data?.url || "";
            ttt = "163";
        }
        // ================== 是否空值 ==================
        if((链接.length || 0) < 10){
            选歌回复内容 += `\n【${本次音源}】: ❌`;
            空值次数++;
            continue;
        }
        // ================== 解析各种音源 - 组装 ==================
        选歌回复内容 += `\n【${本次音源}】: ✅`;
        let 数据 = {};
            数据["歌名"] = 歌名;
            数据["歌手"] = 歌手;
            数据["封面"] = 封面;
            数据["链接"] = 链接;
            数据["类型"] = ttt;
        writeA(`筱筱吖/音乐系统/接口排查/${时间戳秒}/${本次音源}.json`, JSON.stringify(数据));
    }
    // ================== 检查第二次访问结果 - 第五步 ==================
    await 发消息(event, [段_文本(`${选歌回复内容}`)]);
    if(空值次数 == 音源数量){
        await 发消息(event, [段_引用(event.message_id), 段_文本('全部接口均无法访问！已结束任务！')]);
        return null;
    }
    await 发消息(event, [段_文本('正在测试输出音乐卡片～请稍等.......')]);
    // ================== 最后一步，试试输出结果 ==================
    let cuang = 0;
    let 最终结果 = `执行总结:\n══════════════`;
    for(let i = 0; i < 音源数量; i++){
        let 本次音源 = 音源[i];
        let 数据 = {};
        try{
            数据 = JSON.parse(readA(`筱筱吖/音乐系统/接口排查/${时间戳秒}/${本次音源}.json`) || "[]");
        }catch(e){
            数据 = {};
        }
        if(readB(`筱筱吖/音乐系统/接口排查/${时间戳秒}/${本次音源}.json`, "链接", "w") == "w"){
            最终结果 += `\n【${本次音源}】: ❌`;
            cuang++;
            continue;
        }
        // ================== 获取数据 ==================
        let 歌名 = 数据?.歌名;
        let 歌手 = 数据?.歌手;
        let 封面 = 数据?.封面;
        let 链接 = 数据?.链接;
        let 类型 = 数据?.类型;
        // ================== 检查输出方式 ==================
        await 发消息(event, [段_文本(`这个是【${本次音源}】的↓`)]);
        let 输出成功 = false;
        try{
            await mkSendMusicBySignMode(event, { 歌名, 歌手, 封面, 链接, 平台: 类型 });
            输出成功 = true;
        }catch(e){
            输出成功 = false;
        }

        if(输出成功){
            最终结果 += `\n【${本次音源}】: ✅`;
        }else{
            最终结果 += `\n【${本次音源}】: ❌`;
            cuang++;
        }
    }
    // ================== 输出总结 - 第六步 ==================
    if(cuang == 音源数量){
        await 发消息(event, [段_引用(event.message_id), 段_文本('完蛋了完蛋了！全部音源都失效啦！')]);
        return null;
    }
    最终结果 += `\n-------------`;
    最终结果 += "\n总耗时:" + (Math.floor(Date.now() / 1000) - 时间戳秒) + "秒";
    await 发消息(event, [段_引用(event.message_id), 段_文本(`${最终结果}`)]);
    return null;
}


if(message.match(/^汽水点歌/) && 娱乐功能('点歌')){
    if(!(await requireAuthorized(RC_sq, event))) return null;
    await 发消息(event, [段_引用(event.message_id), 段_文本('汽水点歌已下线～请用「点歌」或「网易云点歌 / 酷我点歌 / QQ点歌」')]);
    return null;
}

if(message.match(/^(酷我|网易云|QQ|)点歌([\s\S]*)$/) && 娱乐功能('点歌')){
    // ================== 授权判断 ==================
    if(!(await requireAuthorized(RC_sq, event))) return null;
    try{
        // ================== 获取基础值 ==================
        const yinyuan_0 = message.match(/^(酷我|网易云|QQ|)点歌([\s\S]*)$/)[1];
        const dd_name = message.match(/^(酷我|网易云|QQ|)点歌([\s\S]*)$/)[2];
        const text_count = dd_name.length;
        
        // ================== 事先判断 ==================
        if(dd_name == "" || text_count == 0 || text_count == undefined || dd_name == undefined){
            await 发消息(event, [段_引用(event.message_id), 段_文本('你是在点歌嘛？')]);
            return null;
        }
        // ================== 获取音源 ==================
        let 音源 = "网易云";
        if(yinyuan_0 != ""){
            音源 = yinyuan_0;
            writeB("筱筱吖/音乐系统/使用音源.json", event.user_id, yinyuan_0);
        }else{
            音源 = readB("筱筱吖/音乐系统/使用音源.json", event.user_id, "网易云");
            if(音源 == "汽水"){
                音源 = "网易云";
                writeB("筱筱吖/音乐系统/使用音源.json", event.user_id, "网易云");
            }
        }
        // ================== 检 ==================
        const CNMB = {
            "QQ":`https://a.aa.cab/qq.music?msg=${dd_name}&num=10`,
            "酷我":`https://oiapi.net/api/Kuwo?msg=${dd_name}&limit=20`,
            "网易云":`https://oiapi.net/api/Music_163?name=${dd_name}&limit=20`
        };
        const API = CNMB[音源];
        // ================== 访问接口 ==================
        let API_shuju = null;
        try{
            const response = await fetch(API);
            API_shuju = await response.json();
        }catch(e){
            await 发消息(event, [段_引用(event.message_id), 段_文本(`访问失败：${音源}接口不可达/超时，请联系开发者修复`)]);
            return null;
        }
        //writeA(`测试.json`, JSON.stringify(API_shuju));
        // ================== 解析各种音源 - 前置==================
        let jieguo_数量 = (API_shuju?.["data"]?.length || 0);
        let jieguo_组装消息 = "";
        if(jieguo_数量 == 0){
            await 发消息(event, [段_引用(event.message_id), 段_文本('接口取值异常！')]);
            return null;
        }
        writeB("筱筱吖/音乐系统/选歌范围.json", event.user_id, jieguo_数量);
        writeB("筱筱吖/音乐系统/点歌名字.json", event.user_id, dd_name);
        let 组装消息 = "══════════════";
        组装消息 += `\n当前为【${音源}】点歌，共${jieguo_数量}首`;
        组装消息 += `\n══════════════`;
        let json数据 = {};
        let lisnl数据 = [];
        json数据["音源"] = 音源;
        // ================== 解析各种音源 - 执行==================
        if(音源 == "酷我"){
            // ================== 循环 ==================
            for(let i = 0; i < jieguo_数量; i++) {
                let 本次序号 = i + 1;
                let 歌名 = (API_shuju["data"][i]["song"] || "");
                let 歌手 = (API_shuju["data"][i]["singer"] || "");
                let 封面 = (API_shuju["data"][i]["picture"] || "");
                组装消息 += `\n${本次序号}.${歌名}---${歌手}`;
                lisnl数据.push({"歌名":歌名,"歌手":歌手,"封面":封面});
            }
            组装消息 += `\n══════════════`;
        }else if(音源 == "QQ"){
            // ================== 循环 ==================
            for(let i = 0; i < jieguo_数量; i++) {
                let 本次序号 = i + 1;
                let 歌名 = (API_shuju["data"][i]["song"] || "");
                let 歌手 = (API_shuju["data"][i]["singer"] || "");
                let 封面 = (API_shuju["data"][i]["cover"] || "");
                组装消息 += `\n${本次序号}.${歌名}---${歌手}`;
                lisnl数据.push({"歌名":歌名,"歌手":歌手,"封面":封面});
            }
            组装消息 += `\n══════════════`;
        }else if(音源 == "网易云"){
            // ================== 循环 ==================
            for(let i = 0; i < jieguo_数量; i++) {
                let 本次序号 = i + 1;
                let 歌名 = (API_shuju["data"][i]["name"] || "");
                let 歌手 = (API_shuju["data"][i]["singers"][0]["name"] || "");
                let 封面 = (API_shuju["data"][i]["picurl"] || "");
                组装消息 += `\n${本次序号}.${歌名}---${歌手}`;
                lisnl数据.push({"歌名":歌名,"歌手":歌手,"封面":封面});
            }
            组装消息 += `\n══════════════`;
        }else{
            await 发消息(event, [段_引用(event.message_id), 段_文本('未知类型报错！')]);
            return null;
        }
        // ================== 写入 ==================
        json数据["data"] = lisnl数据;
        //sendReply(event, `${JSON.stringify(json数据)}`, ctx);//调试
        writeA(`筱筱吖/音乐系统/临时歌单/${event.user_id}.json`, JSON.stringify(json数据));
        // ================== 输出（Sharp 模式发图，否则文字） ==================
        const 图片渲染开 = isImageRenderEnabled(readB);
        if (图片渲染开 && getRenderMode(readB) === "sharp") {
            try {
                const musicBgLocal =
                    resolveEffectiveBgAbs("music-list") ||
                    resolveDefaultResourceImageAbs("运势6.png") ||
                    "";
                const sharpItems = lisnl数据.slice(0, 20).map((row, i) => ({
                    index: i + 1,
                    title: String(row?.歌名 || ""),
                    artist: String(row?.歌手 || ""),
                    coverUrl: String(row?.封面 || ""),
                }));
                const imageData = await renderMusicListWithSharp(
                    {
                        source: 音源,
                        query: dd_name,
                        botSelfId: event.self_id,
                        items: sharpItems,
                        bgLocalPath: musicBgLocal,
                        pluginDir: PLUGIN_DIR,
                        dataPath: getDataPath(),
                    },
                    logger,
                );
                if (imageData) {
                    await 发消息(event, [段_引用(event.message_id), 渲染Base64图片段(imageData)]);
                    return null;
                }
                logger.warn("[音乐系统] Sharp 点歌列表渲染失败，已回退文字列表");
            } catch (e) {
                logger.warn("[音乐系统] Sharp 点歌列表异常，已回退文字列表:", e?.message || e);
            }
        }
        await 发消息(event, [段_引用(event.message_id), 段_文本(`${组装消息}`)]);
        return null;
    }catch(e){
        logger.error("[音乐系统] 点歌功能异常:", e);
        await 发消息(event, [段_引用(event.message_id), 段_文本('点歌处理异常，请稍后再试')]);
        return null;
    }
}



if(message.match(/^(链接|卡片|语音|)选歌([0-9]+)$/) && 娱乐功能('点歌')){
    // ================== 授权判断 ==================
    if(!(await requireAuthorized(RC_sq, event))) return null;
    try{
        // ================== 获取基础值 ==================
        const ffff = message.match(/^(链接|卡片|语音|)选歌([0-9]+)$/)[1];
        const mub = message.match(/^(链接|卡片|语音|)选歌([0-9]+)$/)[2];
        const zuida = readB("筱筱吖/音乐系统/选歌范围.json", event.user_id, 0);
        const dd_name = readB("筱筱吖/音乐系统/点歌名字.json", event.user_id, "九尾狐");
        let music_cc = readB("筱筱吖/音乐系统/使用音源.json", event.user_id, "网易云");
        if(music_cc == "汽水"){
            music_cc = "网易云";
            writeB("筱筱吖/音乐系统/使用音源.json", event.user_id, "网易云");
        }
        
        // ================== 事先判断 ==================
        if(mub == 0 || mub > zuida){
            await 发消息(event, [段_引用(event.message_id), 段_文本(`可选范围异常，当前你可选范围为【${zuida}】`)]);
            return null;
        }
        // ================== 获取方法 ==================
        let 方法 = "卡片";
        if(ffff != ""){
            方法 = ffff;
        }else{
            方法 = "卡片";
        }
        // ================== 检 ==================
        const CNMB = {
            "QQ":`https://a.aa.cab/qq.music?msg=${dd_name}&num=10&n=${mub}`,
            "酷我":`https://oiapi.net/api/Kuwo?msg=${dd_name}&n=${mub}`,
            "网易云":`https://oiapi.net/api/Music_163?name=${dd_name}&limit=20&n=${mub}`
        };
        const API = CNMB[music_cc];
        // ================== 访问接口 ==================
        let API_shuju = null;
        try{
            const response = await fetch(API);
            API_shuju = await response.json();
        }catch(e){
            await 发消息(event, [段_引用(event.message_id), 段_文本(`访问失败：${music_cc}接口不可达/超时，请联系开发者修复`)]);
            return null;
        }
        //writeA(`测试1.json`, JSON.stringify(API_shuju));
        // ================== 解析各种音源 - 前置==================
        let 歌名 = "";
        let 歌手 = "";
        let 封面 = "";
        let 链接 = "";
        let ttt = "163";
        // ================== 解析各种音源 - 执行 ==================
        if(music_cc == "酷我"){
            歌名 = API_shuju?.["data"]?.["song"] || "";
            歌手 = API_shuju?.["data"]?.["singer"] || "";
            封面 = API_shuju?.["data"]?.["picture"] || "";
            链接 = API_shuju?.["data"]?.["url"] || "";
            ttt = "kuwo";
            
        }else if(music_cc == "QQ"){
            歌名 = API_shuju["data"]["song"];
            歌手 = API_shuju["data"]["singer"];
            封面 = API_shuju["data"]["music"];
            链接 = API_shuju["data"]["music"];
            ttt = "qq";
            
        }else if(music_cc == "网易云"){
            歌名 = API_shuju["data"]["name"];
            歌手 = API_shuju["data"]["singers"][0]["name"];
            封面 = API_shuju["data"]["picurl"];
            链接 = API_shuju["data"]["url"];
            ttt = "163";
            
        }else{
            await 发消息(event, [段_引用(event.message_id), 段_文本('未知类型报错！')]);
            return null;
        }

        if((链接 || "").length < 10){
            await 发消息(event, [段_引用(event.message_id), 段_文本(`访问失败：${music_cc}接口返回异常，请联系开发者修复`)]);
            return null;
        }
        
        // ================== 输出方式 ==================
        if(方法 == "卡片"){
            await mkSendMusicBySignMode(event, { 歌名, 歌手, 封面, 链接, 平台: ttt });
        }else if(方法 == "链接"){
            let 组装输出 = `歌名:${歌名}`;
            组装输出 += `\n歌手:${歌手}`;
            组装输出 += `\n音频链接:\n${链接}`;
            await 发消息(event, [段_引用(event.message_id), 段_图片(封面), 段_文本(组装输出)]);
        }else if(方法 == "语音"){
            await 发语音(event, 链接);
        }
        return null;
    }catch(e){
        logger.error("[音乐系统] 选歌功能异常:", e);
        await 发消息(event, [段_引用(event.message_id), 段_文本('选歌处理异常，请稍后再试')]);
        return null;
    }
}


if(message.match(/^(我的收藏|个人歌单)$/) && 娱乐功能('点歌')){
    // ================== 授权判断 ==================
    if(!(await requireAuthorized(RC_sq, event))) return null;
    // ================== 获取基础值 ==================
    let 歌单文件 = JSON.parse(readA(`筱筱吖/音乐系统/音乐收藏/${event.user_id}.json`) || "[]");
    
    // ================== 事先判断 ==================
    let cn = 歌单文件;
    if(cn == undefined || cn == ""){
        await 发消息(event, [段_引用(event.message_id), 段_文本(`无数据:${JSON.stringify(歌单文件)}\n请确认歌单正确！`)]);
        return null;
    }
    if(歌单文件 == [] || 歌单文件 == "[]" || 歌单文件 == undefined){
        await 发消息(event, [段_引用(event.message_id), 段_文本('数据无效，可能是文件缺失或语法错误！0')]);
        return null;
    }
    let 数量 = (歌单文件.length || 0);
    if(数量 == 0){
        await 发消息(event, [段_引用(event.message_id), 段_文本('歌单文件数量为0')]);
        return null;
    }
    // ================== 循环 - 前置 ==================
    let 返回内容 = ``;
    // ================== 循环 ==================
    for(let i = 0; i < 数量; i++) {
        let 音源 = 歌单文件[i]["音源"]
        let 歌名 = 歌单文件[i]["歌名"];
        let 歌手 = 歌单文件[i]["歌手"];
        返回内容 += `\n${i+1}.[${音源}]${歌名} --- ${歌手}`;
    }
    // ================== 组装消息 ==================
    let 组装消息 = `共计【${数量}】首收藏歌曲`;
    组装消息 += `\n══════════════`;
    组装消息 += 返回内容;
    组装消息 += `\n══════════════`;
    // ================== 输出 ==================
    if(数量 >= 15){
        const messages = [合并节点("[个人歌单]", event.self_id, [段_文本(组装消息)])];
        await 发合并消息(event, messages);
    }else{
        await 发消息(event, [段_引用(event.message_id), 段_文本(`${组装消息}`)]);
    }
    return null;
}


if(message.match(/^(收藏音乐|收藏歌曲|取消收藏)([0-9]+)(-|_|.|)([0-9]+|)$/) && 娱乐功能('点歌')){
    // ================== 授权判断 ==================
    if(!(await requireAuthorized(RC_sq, event))) return null;
    // ================== 获取数据 ==================
    const 搜索数据 = readB("筱筱吖/音乐系统/点歌名字.json", event.user_id, "九尾狐");
    let 歌单文件 = JSON.parse(readA(`筱筱吖/音乐系统/音乐收藏/${event.user_id}.json`) || "[]");
    const 临时数据 = JSON.parse(readA(`筱筱吖/音乐系统/临时歌单/${event.user_id}.json`) || "[]");
    const 执行操作 = message.match(/^(收藏音乐|收藏歌曲|取消收藏)([0-9]+)(-|_|.|)([0-9]+|)$/)[1];
    const 选择序号1 = Number(message.match(/^(收藏音乐|收藏歌曲|取消收藏)([0-9]+)(-|_|.|)([0-9]+|)$/)[2]);
    const 选择序号2 = Number(message.match(/^(收藏音乐|收藏歌曲|取消收藏)([0-9]+)(-|_|.|)([0-9]+|)$/)[4]);
    //await 发消息(event, [段_引用(event.message_id), 段_文本(`临时:${JSON.stringify(临时数据)}`)]);//调试
    // ================== 收藏歌曲 ==================
    if(执行操作 == "收藏歌曲" || 执行操作 == "收藏音乐"){
    let cnm = 临时数据?.data;
        if(cnm == undefined || cnm == ""){
            await 发消息(event, [段_引用(event.message_id), 段_文本(`无数据:${JSON.stringify(临时数据)}\n请先点歌再操作！`)]);
            return null;
        }
        if(临时数据 == [] || 临时数据 == "[]" || 临时数据 == undefined){
            await 发消息(event, [段_引用(event.message_id), 段_文本('数据无效，可能是文件缺失或语法错误！0')]);
            return null;
        }
        // ================== 判断 ==================
        let 数量 = (临时数据["data"].length || 0);
        if(数量 == 0){
            await 发消息(event, [段_引用(event.message_id), 段_文本('数据无效，可能是文件缺失或语法错误！1')]);
            return null;
        }
        if(选择序号1 == 0 || 选择序号1 > 数量){
            await 发消息(event, [段_引用(event.message_id), 段_文本('选取范围无效哦！')]);
            return null;
        }
        // ================== 执行收藏 ==================
        let json数据 = {};
        json数据["搜索"] = 搜索数据;
        json数据["序号"] = 选择序号1;
        json数据["音源"] = 临时数据["音源"];
        json数据["歌名"] = 临时数据["data"][选择序号1-1]["歌名"];
        json数据["歌手"] = 临时数据["data"][选择序号1-1]["歌手"];
        歌单文件.push(json数据);
        writeA(`筱筱吖/音乐系统/音乐收藏/${event.user_id}.json`, JSON.stringify(歌单文件));
        await 发消息(event, [段_引用(event.message_id), 段_文本(`已收藏改歌曲:\n${临时数据["data"][选择序号1 - 1]["歌名"]}----${临时数据["data"][选择序号1 - 1]["歌手"]}`)]);
        return null;
        
    // ================== 取消收藏 ==================
    }else{
        let cn = 歌单文件;
        if(cn == undefined || cn == ""){
            await 发消息(event, [段_引用(event.message_id), 段_文本(`无数据:${JSON.stringify(歌单文件)}\n请确认歌单正确！`)]);
            return null;
        }
        if(歌单文件 == [] || 歌单文件 == "[]" || 歌单文件 == undefined){
            await 发消息(event, [段_引用(event.message_id), 段_文本('数据无效，可能是文件缺失或语法错误！0')]);
            return null;
        }
        // ================== 判断 ==================
        let 数量 = (歌单文件.length || 0);
        if(数量 == 0){
            await 发消息(event, [段_引用(event.message_id), 段_文本('歌单文件数量为0')]);
            return null;
        }
        if(选择序号2 && (选择序号1 > 数量 || 选择序号1 > 选择序号2 || 选择序号1 == 选择序号2)){
            await 发消息(event, [段_引用(event.message_id), 段_文本(`范围无效哟～0|${数量}`)]);
            return null;
        }
        if(选择序号1 == 0 || (选择序号2 && 选择序号2 == 0)){
            await 发消息(event, [段_引用(event.message_id), 段_文本(`范围无效哟～1|${数量}`)]);
            return null;
        }
        if(选择序号1 > 数量 || 选择序号2 > 数量){
            await 发消息(event, [段_引用(event.message_id), 段_文本(`范围无效哟～3|${数量}`)]);
            return null;
        }
        // ================== 执行删除 - 前置 ==================
        let 范围 = 1;
        let 返回内容 = ``;
        if(选择序号1 > 选择序号2){
            范围 = 1;
        }else if(选择序号2 > 选择序号1){
            范围 = 选择序号2 - 选择序号1 + 1;
        }else if(选择序号2 == 0){
            范围 = 1;
        }else{
            范围 = 1;
        }
        // ================== 获取列表 - 循环 ==================
        for(let i = 选择序号1 - 1; i < 选择序号1 - 1 + 范围; i++){
            let 音源 = 歌单文件[i]["音源"]
            let 歌名 = 歌单文件[i]["歌名"];
            let 歌手 = 歌单文件[i]["歌手"];
            返回内容 += `\n${i+1}.[${音源}]${歌名} --- ${歌手}`;
        }
        // ================== 删除&输出 ==================
        歌单文件.splice(选择序号1 - 1, 范围);//删除几个
        await 发消息(event, [段_引用(event.message_id), 段_文本(`已删除${选择序号1}|${选择序号2}\n══════════════${返回内容}\n══════════════`)]);
        writeA(`筱筱吖/音乐系统/音乐收藏/${event.user_id}.json`, JSON.stringify(歌单文件));
    }
    return null;
}


if(message.match(/^清空个人收藏(音乐|歌曲)$/) && 娱乐功能('点歌')){
    // ================== 授权判断 ==================
    if(!(await requireAuthorized(RC_sq, event))) return null;
    // ================== 检 ==================
    writeA(`筱筱吖/音乐系统/音乐收藏/${event.user_id}.json`, "[]");
    await 发消息(event, [段_引用(event.message_id), 段_文本('好叭，这就把你的歌单给清空空！')]);
    return null;
}


if(message.match(/^(链接|卡片|语音|)播放收藏([0-9]+)$/) && 娱乐功能('点歌')){
    // ================== 授权判断 ==================
    if(!(await requireAuthorized(RC_sq, event))) return null;
    try{
        // ================== 获取基础值 ==================
        const 方式 = message.match(/^(链接|卡片|语音|)播放收藏([0-9]+)$/)[1];
        const 序号 = message.match(/^(链接|卡片|语音|)播放收藏([0-9]+)$/)[2];
        let 歌单文件 = JSON.parse(readA(`筱筱吖/音乐系统/音乐收藏/${event.user_id}.json`) || "[]");
        
        // ================== 事先判断 ==================
        let cn = 歌单文件;
        if(cn == undefined || cn == ""){
            await 发消息(event, [段_引用(event.message_id), 段_文本(`无数据:${JSON.stringify(歌单文件)}\n请确认歌单正确！`)]);
            return null;
        }
        if(歌单文件 == [] || 歌单文件 == "[]" || 歌单文件 == undefined){
            await 发消息(event, [段_引用(event.message_id), 段_文本('数据无效，可能是文件缺失或语法错误！0')]);
            return null;
        }
        let 数量 = (歌单文件.length || 0);
        if(数量 == 0){
            await 发消息(event, [段_引用(event.message_id), 段_文本('歌单文件数量为0')]);
            return null;
        }
        if(序号 == 0 || 序号 > 数量){
            await 发消息(event, [段_引用(event.message_id), 段_文本(`可选范围异常！请仔细查看收藏数量！\n当前可选范围【${数量}】`)]);
            return null;
        }
        // ================== 获取方法 ==================
        let 方法 = "卡片";
        if(方式 != ""){
            方法 = 方式;
        }else{
            方法 = "卡片";
        }
        // ================== 检 ==================
        const dd_name = 歌单文件[序号-1]["搜索"];
        const mub = 歌单文件[序号-1]["序号"];
        const music_cc = 歌单文件[序号-1]["音源"];
        if(music_cc == "汽水"){
            await 发消息(event, [段_引用(event.message_id), 段_文本('该收藏条目为已下线的汽水音源，请重新点歌后再收藏')]);
            return null;
        }
        const CNMB = {
            "QQ":`https://a.aa.cab/qq.music?msg=${dd_name}&num=10&n=${mub}`,
            "酷我":`https://oiapi.net/api/Kuwo?msg=${dd_name}&n=${mub}`,
            "网易云":`https://oiapi.net/api/Music_163?name=${dd_name}&limit=20&n=${mub}`
        };
        const API = CNMB[music_cc];
        // ================== 访问接口 ==================
        let API_shuju = null;
        try{
            const response = await fetch(API);
            API_shuju = await response.json();
        }catch(e){
            await 发消息(event, [段_引用(event.message_id), 段_文本(`访问失败：${music_cc}接口不可达/超时，请联系开发者修复`)]);
            return null;
        }
        //writeA(`测试1.json`, JSON.stringify(API_shuju));
        // ================== 解析各种音源 - 前置==================
        let 歌名 = "";
        let 歌手 = "";
        let 封面 = "";
        let 链接 = "";
        let ttt = "163";
        // ================== 解析各种音源 - 执行 ==================
        if(music_cc == "酷我"){
            歌名 = API_shuju?.["data"]?.["song"] || "";
            歌手 = API_shuju?.["data"]?.["singer"] || "";
            封面 = API_shuju?.["data"]?.["picture"] || "";
            链接 = API_shuju?.["data"]?.["url"] || "";
            ttt = "kuwo";
            
        }else if(music_cc == "QQ"){
            歌名 = API_shuju["data"]["song"];
            歌手 = API_shuju["data"]["singer"];
            封面 = API_shuju["data"]["cover"];
            链接 = API_shuju["data"]["music"];
            ttt = "qq";
            
        }else if(music_cc == "网易云"){
            歌名 = API_shuju["data"]["name"];
            歌手 = API_shuju["data"]["singers"][0]["name"];
            封面 = API_shuju["data"]["picurl"];
            链接 = API_shuju["data"]["url"];
            ttt = "163";
            
        }else{
            await 发消息(event, [段_引用(event.message_id), 段_文本('未知类型报错！')]);
            return null;
        }

        if((链接 || "").length < 10){
            await 发消息(event, [段_引用(event.message_id), 段_文本(`访问失败：${music_cc}接口返回异常，请联系开发者修复`)]);
            return null;
        }
        
        // ================== 输出方式 ==================
        if(方法 == "卡片"){
            await mkSendMusicBySignMode(event, { 歌名, 歌手, 封面, 链接, 平台: ttt });
        }else if(方法 == "链接"){
            let 组装输出 = `歌名:${歌名}`;
            组装输出 += `\n歌手:${歌手}`;
            组装输出 += `\n音频链接:\n${链接}`;
            await 发消息(event, [段_引用(event.message_id), 段_图片(封面), 段_文本(组装输出)]);
        }else if(方法 == "语音"){
            await 发语音(event, 链接);
        }else{
            await 发消息(event, [段_引用(event.message_id), 段_文本('伪造类型报错v')]);
        }
        return null;
    }catch(e){
        logger.error("[音乐系统] 播放收藏功能异常:", e);
        await 发消息(event, [段_引用(event.message_id), 段_文本('播放收藏处理异常，请稍后再试')]);
        return null;
    }
}



// ================== API接口功能（实现见 ./auth/api-interface.ts） ==================
const apiInterfaceResult = await handleApiInterfaceCommands(message, event, ctx, RC_sq, 娱乐功能('今日运势'), {
    readB,
    readA,
    writeB,
    timeA,
    rand,
    logger,
    resolveFortuneNetworkBgUrl,
    buildBgImageCss,
    buildHtmlBackgroundFields,
    isKakakeLikeFramework: mkIsKakakeLikeFramework,
    resolveDefaultResourceImageAbs,
    resolveEffectiveBgAbs,
    resolveFortuneLocalImageFileName,
    resolveImageForCq,
    renderHtmlWithCompat,
    puppeteer,
    buildSimpleFortuneHtml,
    getDataPath,
});
if (apiInterfaceResult === 'halt') {
    return null;
}

if(message.match(/^发病文学([\s\S]+)/) && 娱乐功能('发病文学')){
    if(!(await requireAuthorized(RC_sq, event))) return null;
    const 名称 = (message.match(/^发病文学([\s\S]+)/)?.[1] ?? "").trim();
    if(!名称){
        await 发消息(event, [段_引用(event.message_id), 段_文本('请按格式：发病文学[对象名]')]);
        return null;
    }
    let 发病文学模板 = JSON.parse(readA("默认资源/text/发病文学.json") || "[]");
    if(!发病文学模板.length || 发病文学模板.length == 0){
        await 发消息(event, [段_引用(event.message_id), 段_文本('发病文学模板为空')]);
        return null;
    }
    const 条 = 发病文学模板[Math.floor(Math.random() * 发病文学模板.length)];
    const 文案 = 条.split("[name]").join(名称);
    await 发消息(event, [段_引用(event.message_id), 段_文本(`${文案}`)]);
    return null;
}


if(message.match(/^(?:[cC][sS])?搜饰品([\s\S]+)$/) && 娱乐功能('搜饰品')){
    // ================== 授权判断 ==================
    if(!(await requireAuthorized(RC_sq, event))) return null;
    const isCS模式 = /^(?:[cC][sS])搜饰品/.test(message);
    const 关键词 = (message.match(/^(?:[cC][sS])?搜饰品([\s\S]+)$/)?.[1] || "").trim();
    if(!关键词){
        await 发消息(event, [段_引用(event.message_id), 段_文本('请按格式：搜饰品AK 或 cs搜饰品AK')]);
        return null;
    }
    try{
        const 时间戳 = Date.now();
        const API = `https://sdt-api.ok-skins.com/user/skin/v1/auto-completion?content=${encodeURIComponent(关键词)}&timestamp=${时间戳}`;
        const 响应 = await fetch(API, {
            method: "GET",
            headers: {
                "Accept": "application/json, text/plain, */*",
                "User-Agent": "Mozilla/5.0 (Linux; Android 10; Mobile) AppleWebKit/537.36",
                "Origin": "https://m.steamdt.com",
                "Referer": "https://m.steamdt.com"
            }
        });
        if(!响应.ok){
            await 发消息(event, [段_引用(event.message_id), 段_文本(`搜索接口请求失败：HTTP ${响应.status}`)]);
            return null;
        }
        const 原文 = await 响应.json();
        const 列表 = Array.isArray(原文?.data) ? 原文.data : [];
        if(列表.length === 0){
            await 发消息(event, [段_引用(event.message_id), 段_文本(`未搜索到相关饰品：${关键词}`)]);
            return null;
        }
        const 预览数量 = Math.min(列表.length, isCS模式 ? 100 : 10);
        if(isCS模式){
            const messages = [
                合并节点("[搜饰品]", event.self_id, [段_文本(`饰品搜索结果：${关键词}\n共匹配：${列表.length} 条（展示前 ${预览数量} 条）`)])
            ];
            for(let i = 0; i < 预览数量; i++){
                const it = 列表[i] || {};
                const 名字 = it?.name || "未知";
                const 市场名 = it?.marketHashName || "未知";
                const 图标 = it?.url || "-";
                const content = [];
                if(图标 && 图标 !== "-") content.push(段_图片(图标));
                content.push(段_文本(`【${i + 1}】${名字}\n市场名:${市场名}`));
                messages.push(合并节点("[搜饰品]", event.self_id, content));
            }
            await 发合并消息(event, messages);
        }else{
            let 组装消息 = `饰品搜索结果：${关键词}`;
            组装消息 += `\n══════════════`;
            组装消息 += `\n共匹配：${列表.length} 条（展示前 ${预览数量} 条）`;
            const itemSegments = [段_引用(event.message_id), 段_文本(组装消息)];
            for(let i = 0; i < 预览数量; i++){
                const it = 列表[i] || {};
                const 名字 = it?.name || "未知";
                const 市场名 = it?.marketHashName || "未知";
                const 图标 = it?.url || "-";
                let itemText = `\n----------------`;
                itemText += `\n【${i + 1}】${名字}`;
                itemText += `\n市场名:${市场名}`;
                if(图标 && 图标 !== "-"){
                    itemSegments.push(段_图片(图标));
                }
                itemSegments.push(段_文本(itemText));
            }
            itemSegments.push(段_文本(`\n══════════════`));
            await 发消息(event, itemSegments);
        }
    }catch(error){
        logger.error("[搜饰品] 接口异常:", error);
        await 发消息(event, [段_引用(event.message_id), 段_文本(`搜索失败：${error?.message || error}`)]);
    }
    return null;
}


if(message.match(/^R18图片$/)){
    // ================== 授权判断 ==================
    if(!(await requireAuthorized(RC_sq, event))) return null;
    // ================== 最高主人判断 ==================
    if(!(await checkOwner3(event, ctx, false))) return null;
    // ================== 访问接口 ==================
    const response = await fetch("https://makotoarai.serv00.net/Api/php/R18");
    const API_shuju = await response.json();
    // ================== 取值 ==================
    const 图片 = API_shuju?.urls?.regular;
    // ================== 是否输出 ==================
    if(图片){//有图片
        await 发消息(event, [段_引用(event.message_id), 段_图片(图片), 段_文本(String(API_shuju?.title ?? ""))]);
        return null;
    }
}


if(message.match(/^查(MC|mc|我的世界)服务器([\s\S]*)$/) && 娱乐功能('查MC服务器')){
    // ================== 授权判断 ==================
    if(!(await requireAuthorized(RC_sq, event))) return null;
    // ================== 获取内容 ==================
    let 参数 = message.match(/^查(MC|mc|我的世界)服务器([\s\S]*)$/)[2];
    // ================== 访问接口 ==================
    let 原文 = await fetchAPI(`https://uapis.cn/api/v1/game/minecraft/serverstatus?server=${参数}`);
    // ================== 取值 ==================
    if(!原文 || 原文["online"] != true){
        await 发消息(event, [段_引用(event.message_id), 段_文本('无查询到该服务器内容！')]);
        return null;
    }
    // ================== 正常组装消息 ==================
    let 组装消息 = ``;
    let base64图片 = ``;
    if(原文["favicon_url"] != undefined && 原文["favicon_url"] != ""){
        base64图片 = 原文["favicon_url"].split(",")[1];
    }
    组装消息 += `IP:${原文["ip"]}`;
    组装消息 += `\n端口:${原文["port"]}`;
    组装消息 += `\n版本号:${原文["version"]}`;
    组装消息 += `\n目前人数:${原文["players"]}/${原文["max_players"]}`;
    // ================== online_players ==================
    const { kind: 在线数据类型, lines: 在线数据行 } = parseMcOnlinePlayers(原文["online_players"]);
    if(在线数据行.length > 0){
        const 是玩家名单 = 在线数据类型 === "players";
        组装消息 += `\n──────────────`;
        if(是玩家名单){
            组装消息 += `\n在线玩家(${在线数据行.length}):`;
            for(let i = 0; i < 在线数据行.length; i++){
                组装消息 += `\n${i + 1}. ${在线数据行[i]}`;
            }
        }else{
            组装消息 += `\n玩家状态:`;
            for(let i = 0; i < 在线数据行.length; i++){
                组装消息 += `\n${在线数据行[i]}`;
            }
        }
    }
    // ================== 输出 ==================
    if(在线数据行.length > 10){
        const mcContent = [];
        if(base64图片){
            mcContent.push(段_图片(`base64://${base64图片}`));
        }
        mcContent.push(段_文本(组装消息.trimStart()));
        await 发合并消息(event, [合并节点("[MC服务器]", event.self_id, mcContent)]);
        return null;
    }
    const mcSegments = [段_引用(event.message_id)];
    if(base64图片){
        mcSegments.push(段_图片(`base64://${base64图片}`));
    }
    mcSegments.push(段_文本(组装消息.trimStart()));
    await 发消息(event, mcSegments);
    return null;
}

// ================== 三角洲密码查询 ==================
if(message.match(/^(三角洲|sjz)(密码|每日密码)$/) && 娱乐功能('三角洲密码')){
    // ================== 授权判断 ==================
    if(!(await requireAuthorized(RC_sq, event))) return null;
    try {
        // 1. 检查缓存
        const 今天 = timeA("y-m-d", Math.floor(Date.now() / 1000));
        const 缓存文件 = `筱筱吖/扩展功能/三角洲密码/cache_${今天}.json`;
        const 缓存时长 = 300; // 5分钟
        
        let 密码数据 = null;
        let 使用缓存 = false;
        
        // 读取缓存
        const 缓存内容 = readA(缓存文件);
        if(缓存内容){
            try {
                const 缓存对象 = JSON.parse(缓存内容);
                const 现在时间 = Math.floor(Date.now() / 1000);
                if(现在时间 - 缓存对象.timestamp < 缓存时长){
                    密码数据 = 缓存对象.data;
                    使用缓存 = true;
                }
            } catch(e){}
        }
        
        // 如果没有缓存，抓取网页
        if(!密码数据){
            await 发消息(event, [段_引用(event.message_id), 段_文本('正在查询中，请稍候...')]);
            
            const 目标网址 = 'https://www.guoping123.com/hykb_tools/sjz/mrmm/index.php?immgj=0';
            const response = await fetch(目标网址, {
                method: 'GET',
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                }
            });
            
            if(!response.ok){
                await 发消息(event, [段_引用(event.message_id), 段_文本('网络请求失败，请稍后重试')]);
                return null;
            }
            
            const html内容 = await response.text();
            
            // 2. 清理HTML
            let 纯文本 = html内容.replace(/<[^>]*>/g, ''); // 移除HTML标签
            纯文本 = 纯文本.replace(/\s+/g, ' ').trim(); // 合并空白
            
            // 3. 解析密码（三层策略）
            const 密码列表 = [];
            const 已找到 = [];
            
            // 第一层：查看位置 地名：密码
            const 正则1 = /查看位置\s*([^：]+)：(\d{4})/gu;
            let 匹配结果;
            while((匹配结果 = 正则1.exec(纯文本)) !== null){
                let 地名 = 匹配结果[1].trim();
                const 密码 = 匹配结果[2];
                
                if(!已找到.includes(地名) && 地名){
                    已找到.push(地名);
                    密码列表.push({地名, 密码});
                }
            }
            
            // 第二层：直接匹配 地名：密码
            if(密码列表.length === 0){
                const 正则2 = /([^：\s]+)：(\d{4})/gu;
                while((匹配结果 = 正则2.exec(纯文本)) !== null){
                    let 地名 = 匹配结果[1].trim();
                    const 密码 = 匹配结果[2];
                    
                    // 过滤条件
                    if(地名.length > 2 && 地名.length < 20 && 
                       !/\d/.test(地名) && 
                       !已找到.includes(地名)){
                        已找到.push(地名);
                        密码列表.push({地名, 密码});
                    }
                }
            }
            
            // 第三层：已知地点匹配
            if(密码列表.length === 0){
                const 已知地点 = ['零号大坝', '长弓溪谷', '巴克什', '航天基地', '潮汐监狱'];
                for(const 地点 of 已知地点){
                    const 正则3 = new RegExp(地点 + '：(\\d{4})', 'u');
                    const 结果 = 纯文本.match(正则3);
                    if(结果){
                        密码列表.push({地名: 地点, 密码: 结果[1]});
                    }
                }
            }
            
            if(密码列表.length === 0){
                await 发消息(event, [段_引用(event.message_id), 段_文本('未能解析到密码信息，网站可能已更改')]);
                return null;
            }
            
            // 提取更新日期
            const 日期匹配 = 纯文本.match(/(\d{1,2}月\d{1,2}日)/u);
            const 更新日期 = 日期匹配 ? 日期匹配[1] : "未知";
            
            密码数据 = {
                密码列表,
                更新日期,
                查询时间: timeA("y-m-d H:i:s", Math.floor(Date.now() / 1000))
            };
            
            // 保存缓存
            const 缓存对象 = {
                timestamp: Math.floor(Date.now() / 1000),
                data: 密码数据
            };
            writeA(缓存文件, JSON.stringify(缓存对象));
        }
        
        // 4. 组装消息
        let 组装消息 = `三角洲行动每日密码`;
        组装消息 += `\n══════════════`;
        组装消息 += `\n原网站更新：${密码数据.更新日期}`;
        组装消息 += `\n查询时间：${密码数据.查询时间}`;
        组装消息 += `\n══════════════`;
        密码数据.密码列表.forEach((item, index) => {
            组装消息 += `\n${index + 1}. ${item.地名}`;
            组装消息 += `\n   密码：${item.密码}`;
        });
        组装消息 += `\n══════════════`;
        if(使用缓存){
            组装消息 += `\n[数据来自缓存]`;
        }
        // ================== 输出 ==================
        await 发消息(event, [段_引用(event.message_id), 段_文本(`${组装消息}`)]);
    } catch(error) {
        logger.error('[三角洲密码] 错误:', error);
        await 发消息(event, [段_引用(event.message_id), 段_文本(`查询出错: ${error.message}`)]);
    }
    return null;
}

if(message.match(/^(epic|Epic|EPIC)免费游戏$/) && 娱乐功能('Epic免费游戏')){
    // ================== 授权判断 ==================
    if(!(await requireAuthorized(RC_sq, event))) return null;
    await 发消息(event, [段_引用(event.message_id), 段_文本('正在访问接口，请等一等哦～')]);
    // ================== 访问接口 ==================
    let 原文 = await fetchAPI("https://uapis.cn/api/v1/game/epic-free");
    //writeA("CC.JSON", "222"+JSON.stringify(原文));//调试
    // ================== 数据解析 ==================
    let 数量 = (原文["data"].length || 0);
    if(数量 == 0){
        await 发消息(event, [段_引用(event.message_id), 段_文本('API读取异常！')]);
        return null;
    }
    //writeA("CaC.JSON", "333"+数量);//调试
    // ================== 循环 ==================
    let messages = [合并节点("[EPIC免费游戏]", event.self_id, [段_文本(`共计【${数量}】个免费/限时免费游戏`)])];
    for(let i = 0; i < 数量; i++) {
        //免费参数
        let 免费参数 = "❌否";
        if(原文["data"][i]["is_free_now"] == true){
            免费参数 = "✅是";
        }
        //时间转换
        let 起始时间 = timeA('y-m-d H:i:s', Math.floor(原文["data"][i]["free_start_at"] / 1000));
        let 结束时间 = timeA('y-m-d H:i:s', Math.floor(原文["data"][i]["free_end_at"] / 1000));
        let 剩余时间 = timeB('m月d日 H时i分s秒', Math.floor((原文["data"][i]["free_end_at"] / 1000)- Math.floor(Date.now() / 1000)));
        if(原文["data"][i]["is_free_now"] == false){
            剩余时间 = "-";
        }
        //组装文本
        const 封面 = 原文["data"][i]["cover"];
        let 组装消息 = `《${原文["data"][i]["title"]}》`;
        组装消息 += `\n${原文["data"][i]["description"]}`;
        组装消息 += `\n---------------------------`;
        组装消息 += `\n发行:${原文["data"][i]["seller"]}`;
        组装消息 += `\n原价:${原文["data"][i]["original_price_desc"]}`;
        组装消息 += `\n---------------------------`;
        组装消息 += `\n免费状态:${免费参数}`;
        组装消息 += `\n开始时间:${起始时间}`;
        组装消息 += `\n结束时间:${结束时间}`;
        组装消息 += `\n剩余时间:${剩余时间}`;
        组装消息 += `\n---------------------------`;
        组装消息 += `\n相关链接\n${原文["data"][i]["link"]}`;
        const epicContent = [];
        if(封面) epicContent.push(段_图片(封面));
        epicContent.push(段_文本(组装消息));
        messages.push(合并节点(`[EPIC免费游戏]`, event.self_id, epicContent));
    }
    // ================== 输出 ==================
    await 发合并消息(event, messages);
    return null;
}







if(message == "邀人统计"){
    // ================== 来源 ==================
    if(event.message_type != "group"){
        return null;
    }
    // ================== 授权判断 ==================
    if(!(await requireAuthorized(RC_sq, event))) return null;
    // ================== 组装消息 ==================
    let 组装消息 = `══════════════`;
    组装消息 += `\n相关事件【邀人统计】`;
    组装消息 += `\n══════════════`;
    组装消息 += `\n - 邀人排行榜`;
    组装消息 += `\n - 查看我的邀请`;
    组装消息 += `\n - 查看他的邀请[QQ号]`;
    组装消息 += `\n`;
    组装消息 += `\n - 操作邀请官[QQ] 重置`;
    组装消息 += `\n - 操作邀请官[QQ] 踢出`;
    组装消息 += `\n - 操作邀请官[QQ] 改名[内容]`;
    组装消息 += `\n - 操作邀请官[QQ] 禁言[时长:秒]`;
    组装消息 += `\n══════════════`;
    // ================== 输出 ==================
    await 发消息(event, [段_引用(event.message_id), 段_文本(`${组装消息}`)]);
    return null;
}


if(message.match(/^查看(我|他)的邀请([0-9]+|)$/)){
    // ================== 来源 ==================
    if(event.message_type != "group"){
        return null;
    }
    // ================== 授权判断 ==================
    if(!(await requireAuthorized(RC_sq, event))) return null;
    // ================== 获取查目标 ==================
    const 类型 = message.match(/^查看(我|他)的邀请([0-9]+|)$/)[1];
    const 目标 = Number(message.match(/^查看(我|他)的邀请([0-9]+|)$/)[2]);
    let 查询目标 = event.user_id;
    if(类型 == "他" && !目标){
        await 发消息(event, [段_引用(event.message_id), 段_文本('查询目标QQ时需要携带QQ号哦～！')]);
        return null;
    }
    if(类型 == "他" && 目标){
        查询目标 = 目标;
    }
    // ================== 读取数据 ==================
    let 统计开关 = readB(`筱筱吖/事件系统/${event.group_id}.json`, "邀人统计", "关闭");
    let BQ_yqr = readB(`筱筱吖/扩展功能/邀人统计/${event.group_id}/绑定数据.json`, 查询目标, "无");
    let BQ_yqr数据 = JSON.parse(readA(`筱筱吖/扩展功能/邀人统计/${event.group_id}/${查询目标}.json`) || "[]");
    // ================== 判断 ==================
    if(统计开关 != "开启"){
        await 发消息(event, [段_引用(event.message_id), 段_文本('本群的统计好像没开启唉～')]);
        return null;
    }
    let 数量 = (BQ_yqr数据.length || 0);
    if(数量 == 0){
        let 组装消息 = `我好像没有找到邀请数据哎～？`;
        if(BQ_yqr != "无"){
            组装消息 += `\n但是找到了你在本群的邀请人是【${BQ_yqr}】`;
        }
        await 发消息(event, [段_引用(event.message_id), 段_文本(`${组装消息}`)]);
        return null;
    }
    // ================== 循环 ==================
    let 返回内容 = `共有【${数量}】人次记录`;
    返回内容 += `\n══════════════`;
    for(let i = 0; i < 数量; i++) {
        let 本次QQ = BQ_yqr数据[i];
        let 时间 = timeA("y-m-d H:i:s", readB(`筱筱吖/扩展功能/邀人统计/${event.group_id}/被绑时间.json`, 本次QQ, Math.floor(Date.now() / 1000)));
        返回内容 += `\n「${i + 1}」【${本次QQ}】`;
        返回内容 += `\n[进群时间]:${时间}`;
        返回内容 += `\n`;
    }
    返回内容 += `══════════════`;
    // ================== 输出 ==================
    if(数量 >= 7){
        const messages = [
            合并节点(`[${查询目标}的邀人统计]`, event.self_id, [段_文本(返回内容)])
        ];
        await 发合并消息(event, messages);
    }else{
        await 发消息(event, [段_引用(event.message_id), 段_文本(`${返回内容}`)]);
    }
    return null;
}

if(message.match(/^操作邀请官([0-9]+) (踢出|改名|禁言|重置)([\s\S]*)/)){
    // ================== 来源 ==================
    if(event.message_type != "group"){
        return null;
    }
    // ================== 最高主人检测 ==================
    let crr_开关 = false;
    if(event.message_type == "group"){
        let rrrrv = readB(`筱筱吖/事件系统/${event.group_id}.json`, "管理模式", "关闭");
        if (rrrrv == "开启"){
            crr_开关 = true;
        }
    }
    if(!(await checkOwner3(event, ctx, crr_开关))) return null;
    // ================== 获取数据 ==================
    const matches = message.match(/^操作邀请官([0-9]+) (踢出|改名|禁言|重置)([\s\S]*)/);
    const 目标QQ = matches[1];
    const 操作类型 = matches[2];
    const 参数 = matches[3].trim();
    let BQ_yqr数据 = JSON.parse(readA(`筱筱吖/扩展功能/邀人统计/${event.group_id}/${目标QQ}.json`) || "[]");
    let 数量 = (BQ_yqr数据.length || 0);
    if(数量 == 0){
        await 发消息(event, [段_引用(event.message_id), 段_文本(`「${目标QQ}」他好像并没有邀请过唉！我这里都没有记录！`)]);
        return null;
    }
    // ================== 身份检测 ==================
    let dp188 = await BOTAPI(ctx, "get_group_member_info", {group_id: event.group_id,user_id: event.self_id});
    let Robot身份 = (RC_group_role[(dp188?.role || "member")] || 0);
    if(Robot身份 < 2){
        await 发消息(event, [段_引用(event.message_id), 段_文本('窝好像没有群管权限......')]);
        return null;
    }
    // ================== 参数验证 ==================
    let 输出内容 = `已对下列用户进行【${操作类型}】处理`;
    输出内容 += `\n══════════════`;
    // ================== 重置 ==================
    if(操作类型 == "重置"){
        for(let i = 0; i < 数量; i++){
            let bc = BQ_yqr数据[i];
            输出内容 += `\n${i+1}. ${bc}`;
            writeB(`筱筱吖/扩展功能/邀人统计/${event.group_id}/绑定数据.json`, bc, "无");
        }
    // ================== 踢出 ==================
    }else if(操作类型 == "踢出"){
        //如果是踢出，还要把邀请官本人踢了
        let newArr = BQ_yqr数据.filter(item => item !== event.user_id);
        newArr.push(目标QQ);
        kickGroupMembersFireAndForget(ctx, event.group_id, newArr, false);
        for(let i = 0; i < 数量; i++){
            let bc = newArr[i];
            if(bc == 目标QQ){
                输出内容 += `\n${i+1}. ${bc}【邀请官本人】`;
            }else{
                输出内容 += `\n${i+1}. ${bc}`;
            }
        }
    // ================== 禁言 ==================
    }else if(操作类型 == "禁言"){
        // ================== 检测括号三是否数字 ==================
        if(!/^\d+$/.test(参数)){
            await 发消息(event, [段_引用(event.message_id), 段_文本('禁言时长必须是数字哦～并且60 = 1分钟哟')]);
            return null;
        }
        // ================== 执行禁言操作 ==================
        const 禁言时长 = Number(参数);
        for(let i = 0; i < 数量; i++){
            let bc = BQ_yqr数据[i];
            let 访问参数 = {group_id: event.group_id, user_id: bc, duration: 禁言时长};
            BOTAPI(ctx, "set_group_ban", 访问参数);
            输出内容 += `\n${i+1}. ${bc}`;
        }
    // ================== 改名 ==================
    }else if(操作类型 == "改名"){
        // ================== 检测括号三是否存在内容 ==================
        if(!参数 || 参数.length == 0){
            await 发消息(event, [段_引用(event.message_id), 段_文本('改名必须输入新名字哦～')]);
            return null;
        }
        // ================== 执行改名操作 ==================
        for(let i = 0; i < 数量; i++){
            let bc = BQ_yqr数据[i];
            let 访问参数 = {group_id: event.group_id, user_id: bc, card: 参数};
            BOTAPI(ctx, "set_group_card", 访问参数);
            输出内容 += `\n${i+1}. ${bc}`;
        }
    }
    输出内容 += `\n══════════════`;
    await 发消息(event, [段_引用(event.message_id), 段_文本(`${输出内容}`)]);
    return null;
}


if(message == "邀人排行榜"){
    // ================== 来源 ==================
    if(event.message_type != "group"){
        return null;
    }
    // ================== 授权判断 ==================
    if(!(await requireAuthorized(RC_sq, event))) return null;
    // ================== 循环1 - 获取数据 ==================
    let zzzzz = JSON.parse(readA(`筱筱吖/扩展功能/邀人统计/${event.group_id}/邀请官.json`) || "[]");
    let z数量 = (zzzzz.length || 0);
    //循环
    let zdata = {};
    for(let i = 0; i < z数量; i++) {
        let 本次QQ = zzzzz[i];
        let 本次人数_文件 = JSON.parse(readA(`筱筱吖/扩展功能/邀人统计/${event.group_id}/${本次QQ}.json`) || "[]");
        let 本次人数 = (本次人数_文件.length || 0);
        zdata[本次QQ] = 本次人数;
    }
    //await sendReply(event, `${JSON.stringify(zdata)}`, ctx);//调试输出
    // ================== 降序排列 ==================
    const ranking = Object.entries(zdata)
        .sort((a, b) => b[1] - a[1])
        .map(([人, 值], index) => ({
            排名: index + 1,
            QQ: 人,
            数量: 值
        }));
    const 总人数 = (Object.keys(zdata).length || 0);
    // ================== 判断 ==================
    if(总人数 == 0){
        await 发消息(event, [段_引用(event.message_id), 段_文本('无数据')]);
        return null;
    }
    // ================== 循环取值 ==================
    let 组装消息 = ``;
    let 本人排名 = "无";
    let 总邀请统计 = 0;
    for(let i = 0; i < 总人数; i++) {
        let 本次QQ = (ranking[i]["QQ"] || "");
        let 本次额度 = (ranking[i]["数量"] || 0);
        let 排名小表情 = "🏅";
        if(i+1 == 1){
            排名小表情 = "🥇";
        }else if(i+1 == 2){
            排名小表情 = "🥈";
        }else if(i+1 == 3){
            排名小表情 = "🥉";
        }else if(i+1 > 3 && i+1 <= 10){
            排名小表情 = "🏅";
        }else{
            排名小表情 = `${i + 1}.`;
        }
        // ================== 检 ==================
        组装消息 += `\n${排名小表情}【${本次QQ}】: ${本次额度}人`;
        总邀请统计 += 本次额度;
        if(本次QQ == event.user_id){
            本人排名 = (ranking[i]["排名"] || "无");
        }
    }
    // ================== 输出 ==================
    let 返回内容 = `邀人排行榜 - 共【${总人数}】位邀请官`;
    返回内容 += `\n总邀请人数【${总邀请统计}】你的排名 : ${本人排名}`;
    返回内容 += `\n══════════════`;
    返回内容 += 组装消息;
    返回内容 += `\n══════════════`;
    if(总人数 >= 20){
        const messages = [
            合并节点("[归笺排行榜]", event.self_id, [段_文本(返回内容)])
        ];
        await 发合并消息(event, messages);
    }else{
        await 发消息(event, [段_引用(event.message_id), 段_文本(`${返回内容}`)]);
    }
    return null;
}


if(message.match(/^(获取本群成员|群成员列表)$/)){
    // ================== 来源 ==================
    if(event.message_type != "group"){
        return null;
    }
    // ================== 授权判断 ==================
    if(!(await requireAuthorized(RC_sq, event))) return null;
    // ================== 访问接口 ==================
    let 参数 = {
        group_id : event.group_id
    };
    //调用
    const dp = await BOTAPI(ctx, "get_group_member_list", 参数);
    // ================== 循环前置 ==================
    let data = dp;
    let 总人数 = Object.keys(data).length;
    if(总人数 == 0){
        //什么群tm0个人
        await 发消息(event, [段_引用(event.message_id), 段_文本('获取失败！1')]);
        return null;
    }
    
    // ================== 循环 ==================
    let 身份数据 = {
        "owner" : "👑",
        "admin" : "⭐",
        "member" : "👤",
        "unknown" : "👤"
    };
    let 组装消息 = `本群共有【${总人数}】人哦:`;
    for(let i = 0; i < 总人数; i++) {
        let 身份 = data[i].role;
        let 是否机器人 = data[i].is_robot;
        if(是否机器人){
            组装消息 += `\n🤖${i+1}.${data[i].nickname}(${data[i].user_id})`;
        }else{
            组装消息 += `\n${身份数据[身份]}${i+1}.${data[i].nickname}(${data[i].user_id})`;
        }
        continue;
    }
    
    // ================== 输出结果 ==================
    if(总人数 >= 15){//合并输出
        const messages = [
            合并节点("[本群全部人]", event.self_id, [段_文本(组装消息)])
        ];
        await 发合并消息(event, messages);
    }else{//普通输出
        await 发消息(event, [段_引用(event.message_id), 段_文本(`内容:${组装消息}`)]);
    }
    return null;
}





if(message.match(/^(开启|关闭)伪造声明$/)){
    // ================== 来源 ==================
    if(event.message_type != "group"){
        return null;
    }
    // ================== 授权判断 ==================
    if(!(await requireAuthorized(RC_sq, event))) return null;
    // ================== 最高主人检测 ==================
    let crr_开关 = false;
    if(event.message_type == "group"){
        let rrrrv = readB(`筱筱吖/事件系统/${event.group_id}.json`, "管理模式", "关闭");
        if (rrrrv == "开启"){
            crr_开关 = true;
        }
    }
    if(!(await checkOwner3(event, ctx, crr_开关))) return null;
    // ================== 获取 ==================
    const one_mub = message.match(/^(开启|关闭)伪造声明$/)[1];
    const 状态 =readB(`筱筱吖/伪造聊天/${event.group_id}/声明.json`, "开关", "开启");
    // ================== 检 ==================
    if(one_mub == 状态){
        await 发消息(event, [段_引用(event.message_id), 段_文本(`好像也就是【${状态}】了唉～`)]);
        return null;
    }
    writeB(`筱筱吖/伪造聊天/${event.group_id}/声明.json`, "开关", one_mub);
    await 发消息(event, [段_引用(event.message_id), 段_文本(`好哒！这就把声明给【${one_mub}】！`)]);
    return null;
}


if(message.match(/^伪造聊天([\s\S]*)$/) || isStandaloneFakeChatJson(message)){
    // ================== 来源 ==================
    if(event.message_type != "group"){
        return null;
    }
    // ================== 授权判断 ==================
    if(!(await requireAuthorized(RC_sq, event))) return null;
    let 开关 = readB(`筱筱吖/事件系统/${event.group_id}.json`, "伪造聊天", "关闭");
    if(开关 == "关闭"){
        await 发消息(event, [段_引用(event.message_id), 段_文本('请先在事件管理中开启【伪造聊天】。')]);
        return null;
    }
    // ================== 获取内容 ==================
    const content = extractFakeChatJsonPayload(event, message);
    // ================== 判断 ==================
    if(!content){
        await 发消息(event, [段_引用(event.message_id), 段_文本(`${buildFakeChatHelpText()}`)]);
        return null;
    }
    const parsed = parseFakeChatJsonInput(content);
    if(!parsed.ok){
        await 发消息(event, [段_引用(event.message_id), 段_文本(`${parsed.error}`)]);
        return null;
    }
    await reactFakeChatCommandMessage(ctx, event.message_id, FAKE_CHAT_EMOJI_REACT_PARSE_OK, BOTAPI);
    // ================== 解析数据 - 前置 ==================
    let messages = [];
    const nm = readB(`筱筱吖/伪造聊天/${event.group_id}/声明.json`, "开关", "开启");
    if(nm == "开启"){
        let 临时内容 = `本功能由虚拟构造完成\n切勿相信！切勿迷信！\n本次执行人员:${event.user_id}`;
        messages.push({
            name: "声明",
            qq: 1001,
            time: Math.floor(Date.now() / 1000),
            content: [{ type: "text", data: { text: 临时内容 } }],
        });
    }
    messages.push(...parsed.messages);
    const prepared = await prepareFakeChatForwardMessages(messages, {
        downloadFile,
        getDataPath,
        rand,
    });
    if(!prepared.ok){
        await 发消息(event, [段_引用(event.message_id), 段_文本(`${prepared.error}`)]);
        return null;
    }
    // ================== 发送合并消息 ==================
    const sent = await 发合并消息(event, prepared.messages, 合并预览(
        "伪造聊天记录",
        `共 ${prepared.messages.length} 条自定义合并消息`,
        "[聊天记录]",
        prepared.messages.slice(0, 4).map((m) => {
            const label = String(m?.name ?? "用户");
            const textSeg = Array.isArray(m?.content)
                ? m.content.find((s) => s?.type === "text" && s?.data?.text)
                : null;
            const preview = textSeg?.data?.text
                ? String(textSeg.data.text).replace(/\s+/g, " ").trim().slice(0, 30)
                : "[消息]";
            return `${label}: ${preview}`;
        }),
    ));
    if(sent){
        await reactFakeChatCommandMessage(ctx, event.message_id, FAKE_CHAT_EMOJI_REACT_SEND_OK, BOTAPI);
    }else{
        const protoHint = mkIsSnowLumaBackend() ? 'SnowLuma' : 'NapCat';
        await 发消息(event, [段_引用(event.message_id), 段_文本(`合并转发发送失败，请查看 ${protoHint} 日志。`)]);
    }
    return null;
}




if(message.match(/^设置(全局|本群|)黑名单处理(踢出|黑踢)$/)){
    // ================== 来源 ==================
    if(event.message_type != "group"){
        return null;
    }
    // ================== 最高主人检测 ==================
    let crr_开关 = false;
    if(event.message_type == "group"){
        let rrrrv = readB(`筱筱吖/事件系统/${event.group_id}.json`, "管理模式", "关闭");
        if (rrrrv == "开启"){
            crr_开关 = true;
        }
    }
    if(!(await checkOwner3(event, ctx, crr_开关))) return null;
    // ================== 获取数据 ==================
    const scope = message.match(/^设置(全局|本群|)黑名单处理(踢出|黑踢)$/)[1] || "本群"; //全局或本群
    const ttt = message.match(/^设置(全局|本群|)黑名单处理(踢出|黑踢)$/)[2];//值
    if(scope == "全局"){
        if(!(await checkOwner2(event, ctx))) return null;
    }
    // ================== 文件读取 ==================
    let 文件路径 = `筱筱吖/群管系统/黑白名单/全局/`;
    if(scope == "全局"){
        文件路径 = `筱筱吖/群管系统/黑白名单/全局/`;
    }else{
        文件路径 = `筱筱吖/群管系统/黑白名单/群聊/${event.group_id}/`;
    }
    let data = readB(`${文件路径}处理方式.json`, "方式" , "踢出");
    // ================== 判断 ==================
    if(data == ttt){
        await 发消息(event, [段_引用(event.message_id), 段_文本(`目前的「${scope}」黑名单处理方式已经是【${data}】啦！`)]);
        return null;
    }else{
        writeB(`${文件路径}处理方式.json`, "方法" , ttt);
        await 发消息(event, [段_引用(event.message_id), 段_文本(`好哒！这就把「${scope}」黑名单的处理方式变为【${ttt}】！`)]);
    }
    return null;
}




if(message.match(/^(全局|本群|)黑名单列表$/)){
    // ================== 来源 ==================
    if(event.message_type != "group"){
        return null;
    }
    // ================== 获取数据 ==================
    const scope = message.match(/^(全局|本群|)黑名单列表$/)[1] || "本群"; //全局或本群
    // ================== 文件读取 ==================
    let 文件路径 = `筱筱吖/群管系统/黑白名单/全局/`;
    if(scope == "全局"){
        文件路径 = `筱筱吖/群管系统/黑白名单/全局/`;
    }else{
        文件路径 = `筱筱吖/群管系统/黑白名单/群聊/${event.group_id}/`;
    }
    let data = JSON.parse(readA(`${文件路径}人员.json`) || "[]");
    data = data.map(item => String(item));
    writeA(`${文件路径}人员.json`, JSON.stringify(data));
    let count = (data.length || 0);
    // ================== 判断 ==================
    if(count == 0){
        await 发消息(event, [段_引用(event.message_id), 段_文本(`我好像没找到「${scope}」黑名单的人唉～？是不是没有啊～`)]);
        return null;
    }
    // ================== 循环 ==================
    let 组装消息 = ``;
    for(let i = 0; i < count; i++) {
        let 本次QQ = data[i];
        组装消息 += `\n${i+1}.【${data[i]}】`;
    }
    // ================== 组装消息 ==================
    let 返回内容 = `当前选择【${scope}】黑名单`;
    返回内容 += `\n共计人数【${count}】`;
    返回内容 += `\n══════════════`;
    返回内容 += 组装消息;
    返回内容 += `\n══════════════`;
    // ================== 输出方式 ==================
    if(count >= 15){
        const messages = [合并节点("[黑名单列表]", event.self_id, [段_文本(返回内容)])];
        await 发合并消息(event, messages);
    }else{
        await 发消息(event, [段_引用(event.message_id), 段_文本(`${返回内容}`)]);
    }
    return null;
}


if(message.match(/^查黑名单([0-9]+)$/)){
    // ================== 来源 ==================
    if(event.message_type != "group"){
        return null;
    }
    // ================== 授权判断 ==================
    if(!(await requireAuthorized(RC_sq, event))) return null;
    // ================== 最高主人检测 ==================
    let crr_开关 = false;
    if(event.message_type == "group"){
        let rrrrv = readB(`筱筱吖/事件系统/${event.group_id}.json`, "管理模式", "关闭");
        if (rrrrv == "开启"){
            crr_开关 = true;
        }
    }
    if(!(await checkOwner3(event, ctx, crr_开关))) return null;
    // ================== 读取数据 ==================
    let one_mub = message.match(/^查黑名单([0-9]+)$/)[1];
    let data1 = JSON.parse(readA(`筱筱吖/群管系统/黑白名单/全局/人员.json`) || "[]");
    let data2 = JSON.parse(readA(`筱筱吖/群管系统/黑白名单/群聊/${event.group_id}/人员.json`) || "[]");
    let ishmd1 = data1.includes(String(one_mub));
    let ishmd2 = data2.includes(String(one_mub));
    // ================== 组装消息 ==================
    let 组装消息 = `黑名单 查询结果:`;
    组装消息 += `\n══════════════`;
    组装消息 += `\n查询目标：${one_mub}`;
    组装消息 += `\n[全局黑名单]：${ishmd1}`;
    组装消息 += `\n[本群黑名单]：${ishmd2}`;
    组装消息 += `\n══════════════`;
    // ================== 输出结果 ==================
    await 发消息(event, [段_引用(event.message_id), 段_文本(`${组装消息}`)]);
    return null;
}


if(message.match(/^(添加|删除|清空)(全局|本群|)黑名单([\s\S]*)/)){
    // ================== 来源 ==================
    if(event.message_type != "group"){
        return null;
    }
    // ================== 授权判断 ==================
    if(!(await requireAuthorized(RC_sq, event))) return null;
    let 开关 = readB(`筱筱吖/事件系统/${event.group_id}.json`, "黑白名单", "关闭");
    if(开关 == "关闭"){
        return null;
    }
    // ================== 最高主人检测 ==================
    let crr_开关 = false;
    if(event.message_type == "group"){
        let rrrrv = readB(`筱筱吖/事件系统/${event.group_id}.json`, "管理模式", "关闭");
        if (rrrrv == "开启"){
            crr_开关 = true;
        }
    }
    if(!(await checkOwner3(event, ctx, crr_开关))) return null;
    // ================== 获取数据 ==================
    const pureText = giveText(event.message);
    const operation = message.match(/^(添加|删除|清空)(全局|本群|)黑名单([\s\S]*)$/)[1]; // 添加或删除
    const scope = message.match(/^(添加|删除|清空)(全局|本群|)黑名单([\s\S]*)$/)[2] || "本群"; // 全局或本群
    const content = String(Number(pureText.replace(/^(添加|删除|清空)(全局|本群|)黑名单/, "").trim()));//内容QQ号
    const atUsers = giveAT(event.message);
    const rs = (atUsers.length || 0);//获取艾特人数
    // ================== 判断 ==================
    if(scope == "全局"){
        if(!(await checkOwner2(event, ctx))) return null;
    }
    if(rs == 0 && content == "" && operation != "清空"){
        return null;
    }
    // ================== 循环前置 ==================
    let 名单 = [];
    let 组装消息 = ``;
    let 文件路径 = `筱筱吖/群管系统/黑白名单/全局/`;
    if(scope == "全局"){
        文件路径 = `筱筱吖/群管系统/黑白名单/全局/`;
    }else{
        文件路径 = `筱筱吖/群管系统/黑白名单/群聊/${event.group_id}/`;
    }
    let data = JSON.parse(readA(`${文件路径}人员.json`) || "[]");
    let dddd = readB(`${文件路径}处理方式.json`, "方式" , "踢出");
    let tyyy = false;
    if(dddd == "踢出"){
        tyyy = false;
    }else{
        tyyy = true;
    }
    // ================== 清空模式 ==================
    if(operation == "清空"){
        writeA(`${文件路径}人员.json`, "[]");
        await 发消息(event, [段_引用(event.message_id), 段_文本(`好叭～这就把「${scope}」黑名单给清空～～`)]);
        return null;
    }
    // ================== 多选模式 ==================
    if(rs != 0){
        if(operation == "添加" || operation == "新增"){
            // ================== 新增的 ==================
            for(let i = 0; i < rs; i++) {
                let 本次QQ = atUsers[i];
                let ishmd = data.includes(atUsers[i]);
                if(ishmd == true){
                    组装消息 += `\n${i+1}.【${atUsers[i]}】❌已存在`;
                }else{
                    名单.push(atUsers[i]);
                    data.push(atUsers[i]);
                    组装消息 += `\n${i+1}.【${atUsers[i]}】✅新增`;
                }
            }
            // ================== 调用接口 ==================
            kickGroupMembersFireAndForget(ctx, event.group_id, 名单, tyyy);
        }else{
            // ================== 删除的 ==================
            for(let i = 0; i < rs; i++) {
                let 本次QQ = atUsers[i];
                let ishmd = data.includes(atUsers[i]);
                if(ishmd == false){
                    组装消息 += `\n${i+1}.【${atUsers[i]}】❌不存在`;
                }else{
                    名单.push(atUsers[i]);
                    data = data.filter(qq => qq !== atUsers[i]);
                    组装消息 += `\n${i+1}.【${atUsers[i]}】✅删除`;
                }
            }
        }
        // ================== 写入 ==================
        writeA(`${文件路径}人员.json`, JSON.stringify(data));
        // ================== 组装输出 ==================
        let 返回内容 = ``;
        if(operation == "添加"){
            返回内容 += `已把下列人员添加至【${scope}】黑名单列表`;
        }else{
            返回内容 += `已把下列人员尝试从【${scope}】黑名单列表中移除`;
        }
        返回内容 += `\n══════════════`;
        返回内容 += 组装消息;
        返回内容 += `\n══════════════`;
        // ================== 输出 ==================
        if(rs >= 15){
            const messages = [合并节点("[黑名单操作]", event.self_id, [段_文本(返回内容)])];
            await 发合并消息(event, messages);
        }else{
            await 发消息(event, [段_引用(event.message_id), 段_文本(`${返回内容}`)]);
        }
        return null;
        
    // ================== 单体模式 ==================
    }else{
        // ================== 判断 ==================
        if(isNaN(content)){
            await 发消息(event, [段_引用(event.message_id), 段_文本('❌操作无效！内容非艾特也非数值！')]);
            return null;
        }
        let ishmd = data.includes(content);
        // ================== 新增 ==================
        if(operation == "添加" || operation == "新增"){
            if(ishmd == true){
                await 发消息(event, [段_引用(event.message_id), 段_文本(`❌【${content}】已存在于「${scope}」黑名单啦～`)]);
            }else{
                data.push(content);
                await 发消息(event, [段_引用(event.message_id), 段_文本(`✅已将【${content}】纳入「${scope}」黑名单列表！`)]);
            }
            // ================== 调用接口 ==================
            kickGroupMembersFireAndForget(ctx, event.group_id, [content], tyyy);
        
        // ================== 删除 ==================
        }else{
            if(ishmd == false){
                await 发消息(event, [段_引用(event.message_id), 段_文本(`❌【${content}】本来就不在「${scope}」黑名单里面啦～！`)]);
            }else{
                data = data.filter(qq => qq !== content);
                await 发消息(event, [段_引用(event.message_id), 段_文本(`✅好的，这就把【${content}】从「${scope}」黑名单移出！`)]);
            }
        }
        // ================== 写入 ==================
        writeA(`${文件路径}人员.json`, JSON.stringify(data));
    }
    // ================== 检 ==================
    return null;
}



if(message.match(/^(添加|删除|清空)本群免死金牌([\s\S]*)$/) || message.match(/^查看本群免死金牌列表$/)){
    if(event.message_type != "group"){
        return null;
    }
    if(!(await requireAuthorized(RC_sq, event))) return null;
    if(!mkPardonEventOn(event.group_id)){
        return null;
    }
    const crr_开关 = readB(`筱筱吖/事件系统/${event.group_id}.json`, "管理模式", "关闭") === "开启";
    if(!(await checkOwner3(event, ctx, crr_开关))) return null;

    const isView = /^查看本群免死金牌列表$/.test(message);
    const opMatch = message.match(/^(添加|删除|清空)本群免死金牌([\s\S]*)$/);
    const operation = isView ? "查看" : (opMatch?.[1] || "");
    const isSelf = String(event.user_id) === String(event.self_id);
    const isMaster = await checkOwner2(event, ctx, true);
    const botOwner = await mkBotIsGroupOwner(ctx, event.group_id, event.self_id);
    const specialAdmin = botOwner && !isSelf && !isMaster;

    if(specialAdmin && operation === "清空"){
        await 发消息(event, [段_引用(event.message_id), 段_文本("管理员不能清空免死金牌名单哦～只有主人可以～")]);
        return null;
    }

    if(operation === "查看"){
        const list = mkPardonLoad(event.group_id);
        let 组装消息 = `本群免死金牌列表`;
        组装消息 += `\n══════════════`;
        组装消息 += `\n名单人数：${list.length}`;
        for(let i = 0; i < list.length; i++){
            组装消息 += `\n${i + 1}. ${list[i]}`;
        }
        组装消息 += `\n══════════════`;
        await 发消息(event, [段_引用(event.message_id), 段_文本(组装消息)]);
        return null;
    }

    if(operation === "清空"){
        mkPardonSave(event.group_id, []);
        await 发消息(event, [段_引用(event.message_id), 段_文本("好叭～本群免死金牌名单已清空～～")]);
        return null;
    }

    const atUsers = giveATUnique(event.message);
    const pureText = giveText(event.message);
    const qqFromText = String(pureText.replace(/^(添加|删除)本群免死金牌/, "").trim());
    const singleQQ = /^\d{5,}$/.test(qqFromText) ? qqFromText : "";
    let targets = atUsers.length ? atUsers.slice() : (singleQQ ? [singleQQ] : []);
    if(!targets.length){
        return null;
    }

    let data = mkPardonLoad(event.group_id);
    let 组装消息 = "";
    let 有效 = 0;

    if(operation === "添加"){
        for(let i = 0; i < targets.length; i++){
            const qq = String(targets[i]);
            if(data.includes(qq)){
                组装消息 += `\n${i + 1}.【${qq}】❌已在名单`;
            }else{
                data.push(qq);
                有效++;
                组装消息 += `\n${i + 1}.【${qq}】✅已添加`;
            }
        }
        mkPardonSave(event.group_id, data);
        await 发消息(event, [段_引用(event.message_id), 段_文本(`免死金牌添加完成～有效【${有效}】人\n══════════════${组装消息}`)]);
        return null;
    }

    if(operation === "删除"){
        for(let i = 0; i < targets.length; i++){
            const qq = String(targets[i]);
            if(!data.includes(qq)){
                组装消息 += `\n${i + 1}.【${qq}】❌本就不在`;
                continue;
            }
            if(specialAdmin){
                const role = await mkGetMemberRole(ctx, event.group_id, qq);
                if(role === "admin"){
                    组装消息 += `\n${i + 1}.【${qq}】❌对方也是管理员，不能删`;
                    continue;
                }
            }
            data = data.filter((x) => x !== qq);
            有效++;
            组装消息 += `\n${i + 1}.【${qq}】✅已移出`;
        }
        mkPardonSave(event.group_id, data);
        await 发消息(event, [段_引用(event.message_id), 段_文本(`免死金牌删除完成～有效【${有效}】人\n══════════════${组装消息}`)]);
        return null;
    }
    return null;
}


if(message.match(/^(开启|关闭)管理员免死金牌$/)){
    if(event.message_type != "group"){
        return null;
    }
    if(!(await requireAuthorized(RC_sq, event))) return null;
    if(!mkPardonEventOn(event.group_id)){
        return null;
    }
    if(!(await checkOwner2(event, ctx))){
        return null;
    }
    if(!(await mkBotIsGroupOwner(ctx, event.group_id, event.self_id))){
        await 发消息(event, [段_引用(event.message_id), 段_文本("窝没有群主权限唉～")]);
        return null;
    }
    const wantOn = message.startsWith("开启");
    const cur = mkPardonAdminExemptOn(event.group_id);
    if(wantOn && cur){
        await 发消息(event, [段_引用(event.message_id), 段_文本("管理员免死金牌好像已经开启了吧～？")]);
        return null;
    }
    if(!wantOn && !cur){
        await 发消息(event, [段_引用(event.message_id), 段_文本("管理员免死金牌好像已经关闭了吧～？")]);
        return null;
    }
    writeB(mkPardonConfigPath(event.group_id), "管理员免死金牌", wantOn ? "开启" : "关闭");
    await 发消息(event, [段_引用(event.message_id), 段_文本(`这就把【管理员免死金牌】给${wantOn ? "开启" : "关闭"}！`)]);
    return null;
}


if(message.match(/^设置违禁处理(禁言|撤回禁言|撤回|禁言时长)([0-9]+|)$/)){
    // ================== 来源 ==================
    if(event.message_type != "group"){
        return null;
    }
    // ================== 授权判断 ==================
    if(!(await requireAuthorized(RC_sq, event))) return null;
    // ================== 最高主人检测 ==================
    let crr_开关 = false;
    if(event.message_type == "group"){
        let rrrrv = readB(`筱筱吖/事件系统/${event.group_id}.json`, "管理模式", "关闭");
        if (rrrrv == "开启"){
            crr_开关 = true;
        }
    }
    if(!(await checkOwner3(event, ctx, crr_开关))) return null;
    // ================== 检 ==================
    const one_mub = message.match(/^设置违禁处理(禁言|撤回禁言|撤回|禁言时长)([0-9]+|)$/)[1];
    const two_mub = (message.match(/^设置违禁处理(禁言|撤回禁言|撤回|禁言时长)([0-9]+|)$/)[2] || 0);
    // ================== 禁言时长 ==================
    if(one_mub == "禁言时长"){
        let 时长 = readB(`筱筱吖/群管系统/违禁系统/${event.group_id}/处理.json`, "时长", 600);
        if(two_mub == 0){
           await 发消息(event, [段_引用(event.message_id), 段_文本('在设置违禁禁言时长时，需要携带时间数量哦(秒)')]);
           return null;
        }
        let 真时长 = 600;
        if(two_mub > 2592000){
            真时长 = 2592000;
        }else{
            真时长 = two_mub;
        }
        if(时长 == 真时长){
            await 发消息(event, [段_引用(event.message_id), 段_文本('时长与原来的一样啦！')]);
            return null;
        }else{
            writeB(`筱筱吖/群管系统/违禁系统/${event.group_id}/处理.json`, "时长", 真时长);
            await 发消息(event, [段_引用(event.message_id), 段_文本(`好哒！这就把违禁词的禁言时长改成【${two_mub}】秒！`)]);
            return null;
        }
        // ================== 普通设定 ==================
    }else{
        let 类型 = readB(`筱筱吖/群管系统/违禁系统/${event.group_id}/处理.json`, "方式", "撤回");
        if(类型 == one_mub){
            await 发消息(event, [段_引用(event.message_id), 段_文本(`现在已经是【${类型}】的处理方式啦！补药再改啦！`)]);
            return null;
        }else{
            writeB(`筱筱吖/群管系统/违禁系统/${event.group_id}/处理.json`, "方式", one_mub);
            await 发消息(event, [段_引用(event.message_id), 段_文本(`好哒～！这就把违禁词的处理方式改成【${one_mub}】\n下一次即可触发了哦～`)]);
            return null;
        }
    }
}




if(message.match(/^(增加|新增|添加|删除|取消|减少|清空)违禁词([\s\S]*)$/)){
    // ================== 来源 ==================
    if(event.message_type != "group"){
        return null;
    }
    // ================== 授权判断 ==================
    if(!(await requireAuthorized(RC_sq, event))) return null;
    // ================== 最高主人检测 ==================
    let crr_开关 = false;
    if(event.message_type == "group"){
        let rrrrv = readB(`筱筱吖/事件系统/${event.group_id}.json`, "管理模式", "关闭");
        if (rrrrv == "开启"){
            crr_开关 = true;
        }
    }
    if(!(await checkOwner3(event, ctx, crr_开关))) return null;
    // ================== 获取数据 ==================
    const one_mub = message.match(/^(增加|新增|添加|删除|取消|减少|清空)违禁词([\s\S]*)$/)[1];
    // 去除首尾空白：避免空串 / 纯空格入库（空串会让 includes('') 恒真，导致全群误伤）
    const two_mub = (message.match(/^(增加|新增|添加|删除|取消|减少|清空)违禁词([\s\S]*)$/)[2] || "").trim();
    let wj_cc = JSON.parse(readA(`筱筱吖/群管系统/违禁系统/${event.group_id}/违禁词.json`) || "[]");
    // 清洗历史脏数据：过滤掉可能已写入的空串 / 非字符串项
    if(Array.isArray(wj_cc)){
        wj_cc = wj_cc.filter(item => typeof item === "string" && item.trim() !== "");
    }else{
        wj_cc = [];
    }
    let 包含 = wj_cc.includes(two_mub);
    // ================== 添加 ==================
    if(one_mub == "增加" || one_mub == "新增" || one_mub == "添加"){
        // 内容为空直接拒绝，防止空串入库
        if(two_mub == ""){
            await 发消息(event, [段_引用(event.message_id), 段_文本('要添加的违禁词不能为空哦～请在指令后带上内容！')]);
            return null;
        }
        if(包含 == true){
            await 发消息(event, [段_引用(event.message_id), 段_文本('emmmm，介个违禁词好像也就有了哎～')]);
            return null;
        }
        //正常写入
        wj_cc.push(two_mub);
        writeA(`筱筱吖/群管系统/违禁系统/${event.group_id}/违禁词.json`, JSON.stringify(wj_cc));
        await 发消息(event, [段_引用(event.message_id), 段_文本(`我这就去添加违禁词！\n【新增】: ${two_mub}`)]);
        return null;
    }
    // ================== 删除 ==================
    if(one_mub == "删除" || one_mub == "取消" || one_mub == "减少"){
        if(two_mub == ""){
            await 发消息(event, [段_引用(event.message_id), 段_文本('要删除的违禁词不能为空哦～请在指令后带上内容！')]);
            return null;
        }
        if(包含 == false){
            await 发消息(event, [段_引用(event.message_id), 段_文本('额，介个违禁词好像没有吧，我都找不到～～')]);
            return null;
        }
        //正常删除
        let arr = wj_cc;
        arr = arr.filter(item => item !== two_mub);
        writeA(`筱筱吖/群管系统/违禁系统/${event.group_id}/违禁词.json`, JSON.stringify(arr));
        await 发消息(event, [段_引用(event.message_id), 段_文本(`我这就去把介个违禁词给ban了！\n【删除】: ${two_mub}`)]);
        return null;
    }
    // ================== 清空 ==================
    if(one_mub == "清空"){
        writeA(`筱筱吖/群管系统/违禁系统/${event.group_id}/违禁词.json`, "[]");
        await 发消息(event, [段_引用(event.message_id), 段_文本('耗的，这就就把违禁词通通删除！')]);
        return null;
    }
    return null;
}

if(message == "违禁词列表"){
    // ================== 来源 ==================
    if(event.message_type != "group"){
        return null;
    }
    // ================== 授权判断 ==================
    if(!(await requireAuthorized(RC_sq, event))) return null;
    // ================== 检 ==================
    let wj_cc = JSON.parse(readA(`筱筱吖/群管系统/违禁系统/${event.group_id}/违禁词.json`) || "[]");
    let 数量 = (wj_cc.length || 0);
    if(数量 == 0){
        await 发消息(event, [段_引用(event.message_id), 段_文本('介个群好像木有添加违禁词哎')]);
        return null;
    }
    // ================== 循环 ==================
    let 组装消息 = ``;
    for(let i = 0; i < 数量; i++) {
        let 本次 = wj_cc[i];
        组装消息 += `\n【${i+1}】: ${本次}`;
    }
    // ================== 组装输出 ==================
    let 类型 = readB(`筱筱吖/群管系统/违禁系统/${event.group_id}/处理.json`, "方式", "撤回");
    let 时长 = readB(`筱筱吖/群管系统/违禁系统/${event.group_id}/处理.json`, "时长", 600);
    let 返回内容 = `共计【${数量}】个违禁词`;
    返回内容 += `\n当前处理方式 :【${类型}】`;
    返回内容 += `\n当前禁言时长 :【${时长}秒】`;
    返回内容 += `\n══════════════`;
    返回内容 += 组装消息;
    返回内容 += `\n══════════════`;
    // ================== 输出 ==================
    if(数量 >= 10){
        const messages = [合并节点("[违禁词列表]", event.self_id, [段_文本(返回内容)])];
        await 发合并消息(event, messages);
    }else{
        await 发消息(event, [段_引用(event.message_id), 段_文本(`${返回内容}`)]);
    }
    return null;
}


// ================== 全局违禁词处理机制开关（开关B）：词库/惩罚仅后台维护，此处仅开关本群是否参与 ==================
if(message.match(/^(开启|关闭)全局违禁词处理机制$/)){
    // ================== 来源 ==================
    if(event.message_type != "group"){
        return null;
    }
    // ================== 授权判断 ==================
    if(!(await requireAuthorized(RC_sq, event))) return null;
    // ================== 最高主人检测（管理模式下群管可执行） ==================
    let crr_开关 = false;
    if(event.message_type == "group"){
        let rrrrv = readB(`筱筱吖/事件系统/${event.group_id}.json`, "管理模式", "关闭");
        if (rrrrv == "开启"){
            crr_开关 = true;
        }
    }
    if(!(await checkOwner3(event, ctx, crr_开关))) return null;
    // ================== 开关写入 ==================
    const 开关 = message.match(/^(开启|关闭)全局违禁词处理机制$/)[1];
    const 目标状态 = 开关 == "开启" ? "开启" : "关闭";
    const 当前状态 = readB(GLOBAL_FORBIDDEN_ENABLE_FILE, String(event.group_id), "关闭");
    if(当前状态 == 目标状态){
        await 发消息(event, [段_引用(event.message_id), 段_文本(`本群【全局违禁词处理机制】已经是${目标状态}状态啦～`)]);
        return null;
    }
    writeB(GLOBAL_FORBIDDEN_ENABLE_FILE, String(event.group_id), 目标状态);
    let 提示 = `好哒！本群【全局违禁词处理机制】已${目标状态}～`;
    // 开启时若「违禁检测」事件未开则顺带开启，否则全局词库不会被扫到
    if(目标状态 == "开启"){
        const 违禁检测状态 = readB(`筱筱吖/事件系统/${event.group_id}.json`, "违禁检测", "关闭");
        if(违禁检测状态 != "开启"){
            writeB(`筱筱吖/事件系统/${event.group_id}.json`, "违禁检测", "开启");
            提示 += `\n（检测到本群「违禁检测」未开启，已顺带为你开启）`;
        }
    }
    提示 += `\n💡全局违禁词库与惩罚方式仅在 WebUI 后台「扩展功能 → 全局违禁」维护`;
    await 发消息(event, [段_引用(event.message_id), 段_文本(提示)]);
    return null;
}


if(message.match(/^(开启|关闭)(测试功能|图片渲染|渲染开关|消息自触|助手模式)$/)){
    // ================== 最高主人检测 ==================
    if(!(await checkOwner3(event, ctx, false))) return null;
    // ================== 获取数据 ==================
    const 开关 = message.match(/^(开启|关闭)(测试功能|图片渲染|渲染开关|消息自触|助手模式)$/)[1];
    const 类型 = message.match(/^(开启|关闭)(测试功能|图片渲染|渲染开关|消息自触|助手模式)$/)[2];
    //获取读取的键名
    let 键名 = `cs_of`;
    if(类型 == "图片渲染" || 类型 == "渲染开关"){
        键名 = "图片渲染";
    }else if(类型 != "测试功能"){
        键名 = 类型;
    }
    let 文件开关 = readB("config.json", 键名, false);
    //需要开启还是关闭
    let 需求 = false;
    if(开关 == "开启"){
        需求 = true;
    }
    // ================== 判断 - 1 ==================
    if(需求 == 文件开关){
        await 发消息(event, [段_引用(event.message_id), 段_文本(`❌不行哦～现在【${类型}】已经「${开关}」啦！`)]);
        return null;
    }
    // ================== 判断 - 2 ==================
    if(类型 == "消息自触" && 需求 == false){
        let 助手 = readB("config.json", "助手模式", false);
        if(助手 == true){
            await 发消息(event, [段_引用(event.message_id), 段_文本('在未关闭【助手模式】前，不可以关闭【消息自触】！')]);
            return null;
        }
    }
    if(类型 == "助手模式" && 需求 == true){
        writeB("config.json", "消息自触", 需求);
    }
    // ================== 写入&输出 ==================
    writeB("config.json", 键名, 需求);
    await 发消息(event, [段_引用(event.message_id), 段_文本(`好哒～！这就把【${类型}】「${开关}」！`)]);
    return null;
}

if(message.match(/^(开启|关闭)(群聊|私聊)消息执行([0-9]+|全部)$/)){
    // ================== 最高主人检测 ==================
    if(!(await checkOwner3(event, ctx, false))) return null;
    // ================== 获取数据 ==================
    const 开关 = message.match(/^(开启|关闭)(群聊|私聊)消息执行([0-9]+|全部)$/)[1];
    const 类型 = message.match(/^(开启|关闭)(群聊|私聊)消息执行([0-9]+|全部)$/)[2];
    const 参数 = message.match(/^(开启|关闭)(群聊|私聊)消息执行([0-9]+|全部)$/)[3];
    let 数据类型 = "group_of";
    let 接口 = "get_group_list";
    if(类型 == "群聊"){
        数据类型 = "group_of"//群聊开关列表
        接口 = "get_group_list";
    }else{
        数据类型 = "haoyou_of";//私聊开关列表
        接口 = "get_friend_list";
    }
    let 需求 = false;
    if(开关 == "开启"){
        需求 = true;
    }
    let 数据 = readB("config.json", 数据类型, []);
    //确保数据是数组
    if (!Array.isArray(数据)) {
        数据 = [];
    }
    let 真数据 = [...数据]; //复制数组
    // ================== 如果是单Q或单群 ==================
    if(参数 != "全部"){
        let 值 = String(参数);
        let isof = 数据.includes(值);
        if(isof == 需求){
            await 发消息(event, [段_引用(event.message_id), 段_文本(`目前「${参数}」(${类型})已是${开关}状态啦～！`)]);
            return null;
        }
        await 发消息(event, [段_引用(event.message_id), 段_文本(`好哒！这就去把「${参数}」(${类型})给${开关}！！`)]);
        if(需求){
            // 开启：添加到数组
            if(!真数据.includes(值)){
                真数据.push(值);
            }
        }else{
            // 关闭：从数组中移除
            真数据 = 真数据.filter(item => item !== 值);
        }
        writeB("config.json", 数据类型, 真数据);
        return null;
    }else{
        // ================== 如果是多Q或多群 ==================
        const dp = await BOTAPI(ctx, 接口, {});
        const count = (dp.length || 0);
        //判断人数
        if(count == 0){
            await 发消息(event, [段_引用(event.message_id), 段_文本(`获取${类型}列表失败！`)]);
            return null;
        }
        //循环
        let 组装消息 = `共计有${count}个「${类型}」\n══════════════`;
        for(let i = 0; i < count; i++){
            //获取关键数据
            let ID = 0;
            let 昵称 = "";
            if(类型 == "群聊"){
                ID = dp[i]?.group_id;
                昵称 = dp[i]?.group_name;
            }else{
                ID = dp[i]?.user_id;
                昵称 = dp[i]?.nickname;
            }
            //判断是否已有
            let IDStr = String(ID ?? "0");
            let isof = 数据.includes(IDStr);
            if(isof == 需求){
                组装消息 += `\n${ID}(${昵称})❌:已${开关}`;
            }else{
                组装消息 += `\n${ID}(${昵称})✅:这就${开关}`;
                if(需求){
                    // 开启：添加到数组
                    if(!真数据.includes(IDStr)){
                        真数据.push(IDStr);
                    }
                }else{
                    // 关闭：从数组中移除
                    真数据 = 真数据.filter(item => item !== IDStr);
                }
            }
        }
        //循环结束后写入文件
        writeB("config.json", 数据类型, 真数据);
        //再输出内容
        if(count >= 15){
            const messages = [合并节点("[执行操作]", event.self_id, [段_文本(`${组装消息}`)])];
            await 发合并消息(event, messages);
        }else{
            await 发消息(event, [段_引用(event.message_id), 段_文本(`${组装消息}`)]);
        }
        return null;
    }
}


if(message === "运行状态"){
    // ================== 最高主人检测 ==================
    let crr_开关 = false;
    if(event.message_type == "group"){
        let rrrrv = readB(`筱筱吖/事件系统/${event.group_id}.json`, "管理模式", "关闭");
        if (rrrrv == "开启"){
            crr_开关 = true;
        }
    }
    if(!(await checkOwner3(event, ctx, crr_开关))) return null;
    // ================== 检 ==================
    let 发送方式 = isImageRenderEnabled(readB);
    
    const dp = await BOTAPI(ctx, "get_login_info", {});
    // ================== 检 ==================
    try {
        // 获取系统信息（异步采集，带 3s 快照缓存与单飞复用，不阻塞事件循环）
        const { systemInfo, processes, keyProcesses, network } = await getSystemStatusSnapshot(logger);
    
        // 获取账号信息
        const botQQ = dp["user_id"];
        const botName = dp["nickname"];
    
        // 获取群聊和好友数量
        let groupCount = 0;
        let friendCount = 0;
        // Sharp 卡片已不再展示「群聊 / 好友」，只有文本模式与 HTML 模板要用到，
        // 所以改成延迟获取：走 Sharp 且渲染成功时，这两个请求完全不发。
        const 取群友计数 = async () => {
            try {
                const friendList = await BOTAPI(ctx, "get_friend_list", {});
                friendCount = (friendList.length || 0);
            }catch (e){
                logger.error("获取好友列表失败:", e);
            }
            try {
                const groupList = await BOTAPI(ctx, "get_group_list", {});
                groupCount = (groupList.length || 0);
            }catch (e){
                logger.error("获取群聊列表失败:", e);
            }
        };
    
        // ================== 文本版本 ==================
        if(发送方式 == false){
            await 取群友计数();
            // 构建简洁版文本
            let 文本消息 = `══════════════`;
            文本消息 += `\n【运行状态】`;
            文本消息 += `\n══════════════`;
            文本消息 += `\n[账号信息]`;
            文本消息 += `\n - 昵称: ${botName}`;
            文本消息 += `\n - QQ: ${botQQ}`;
            文本消息 += `\n - 群聊: ${groupCount}`;
            文本消息 += `\n - 好友: ${friendCount}`;
            文本消息 += `\n[系统信息]`;
            文本消息 += `\n - 系统: ${systemInfo.type}`;
            文本消息 += `\n - 架构: ${systemInfo.arch}`;
            文本消息 += `\n - CPU核心: ${systemInfo.cpuCount}`;
            文本消息 += `\n - CPU使用: ${systemInfo.cpuUsagePercent}%`;
            文本消息 += `\n - 内存: ${systemInfo.memoryUsagePercent}%`;
            文本消息 += `\n - 磁盘: ${systemInfo.disk.usagePercent}%`;
            文本消息 += `\n[网络数据]`;
            文本消息 += `\n - 网卡: ${network?.available !== false ? network.interfaceName : "不可用"}`;
            文本消息 += `\n - 下行: ${formatBytes(Number(network?.rxRate || 0))}/s`;
            文本消息 += `\n - 上行: ${formatBytes(Number(network?.txRate || 0))}/s`;
            文本消息 += `\n - 总接收: ${formatBytes(Number(network?.rxTotal || 0))}`;
            文本消息 += `\n - 总发送: ${formatBytes(Number(network?.txTotal || 0))}`;
            文本消息 += `\n══════════════`;
            await 发消息(event, [段_引用(event.message_id), 段_文本(`${文本消息}`)]);
            return null;
        }
        
        // ================== 图片版本 ==================
        const useLocalStatusBg = mkIsKakakeLikeFramework(ctx) && 发送方式 != false;
        const statusBgCss = resolveStatusBackgroundImageCss(ctx, 发送方式, true);
        const templateData = {
            name: String(botName),
            QQ: String(botQQ),
            type: systemInfo.type,
            arch: systemInfo.arch,
            cpuCount: systemInfo.cpuCount,
            cpuUsagePercent: systemInfo.cpuUsagePercent,
            totalMemoryGB: formatBytes(systemInfo.totalMemory),
            memoryUsagePercent: systemInfo.memoryUsagePercent,
            diskTotalGB: formatBytes(systemInfo.disk.total),
            diskUsedGB: formatBytes(systemInfo.disk.used),
            diskFreeGB: formatBytes(systemInfo.disk.free),
            diskUsagePercent: systemInfo.disk.usagePercent,
            groupCount: groupCount,
            friendCount: friendCount,
            backgroundImageCSS: statusBgCss,
            backgroundImageUrl: extractBgUrlFromCss(statusBgCss),
        };

        let imageData = null;
        const statusIsSharp = getRenderMode(readB) === "sharp";
        // 背景优先级：WebUI 自定义图 → 当前渲染模式的默认图（Sharp 竖版卡为「运势5.png」，HTML 横版为「运行状态.jpg」）
        const statusBgLocal =
            resolveEffectiveBgAbs("status", statusIsSharp ? "sharp" : "html") ||
            resolveDefaultResourceImageAbs(statusIsSharp ? "运势5.png" : "运行状态.jpg");
        const statusBgDataUrl = defaultResourceImageToDataUrl(statusBgLocal || "运行状态.jpg");
        const statusBgForSharp = statusBgLocal || statusBgDataUrl || templateData.backgroundImageUrl || STATUS_BG_REMOTE_URL;
        if (statusIsSharp) {
            const 启动秒 = Number(readB("config.json", "启动时间", Math.floor(Date.now() / 1000))) || Math.floor(Date.now() / 1000);
            const frameworkId = String(ctx?.frameworkEnv?.frameworkId || "").trim();
            const frameworkName =
                frameworkId === "kakake" ? "咔咔珂" : frameworkId === "mk-jsbot" ? "MK-JSBot" : "NapCat";
            // 今日「收 / 发」条数：读宿主框架落盘的当日日志，只算群聊 / 私聊 / 事件
            const chatStats = await getTodayChatLogStats(
                { dataPath: getDataPath(), pluginDir: PLUGIN_DIR, pluginPath: String(ctx?.pluginPath || "") },
                logger,
            );
            const 状态账号列表 = await fetchKakakeStatusAccounts(ctx, logger);
            imageData = await renderStatusWithSharp({
                name: templateData.name,
                qq: templateData.QQ,
                accounts: 状态账号列表,
                type: templateData.type,
                arch: templateData.arch,
                hostname: systemInfo.hostname,
                cpuModel: systemInfo.cpuModel,
                cpuCount: templateData.cpuCount,
                cpuUsagePercent: templateData.cpuUsagePercent,
                totalMemoryGB: templateData.totalMemoryGB,
                usedMemoryGB: formatBytes(systemInfo.usedMemory),
                freeMemoryGB: formatBytes(systemInfo.freeMemory),
                memoryUsagePercent: templateData.memoryUsagePercent,
                diskTotalGB: templateData.diskTotalGB,
                diskUsedGB: templateData.diskUsedGB,
                diskFreeGB: templateData.diskFreeGB,
                diskUsagePercent: templateData.diskUsagePercent,
                diskVolumes: (systemInfo.disk?.volumes || []).map((v) => ({
                    name: String(v.name || "-"),
                    label: String(v.label || ""),
                    total: Number(v.total || 0),
                    free: Number(v.free || 0),
                    used: Number(v.used || 0),
                })),
                recvCount: chatStats?.available ? chatStats.recv : undefined,
                sentCount: chatStats?.available ? chatStats.sent : undefined,
                nodeVersion: systemInfo.nodeVersion,
                pluginVersion: String(mkReadPluginVersion(ctx) || ""),
                frameworkName: frameworkName,
                frameworkVersion: String(ctx?.frameworkEnv?.frameworkVersion || ""),
                systemUptimeSec: Math.floor(systemInfo.systemUptime || 0),
                pluginUptimeSec: Math.max(0, Math.floor(Date.now() / 1000) - 启动秒),
                processMemoryMB: (Number(systemInfo.processMemory || 0) / 1024 / 1024).toFixed(1),
                netInterface: String(network?.interfaceName || ""),
                netRxRate: Number(network?.rxRate || 0),
                netTxRate: Number(network?.txRate || 0),
                netRxTotal: Number(network?.rxTotal || 0),
                netTxTotal: Number(network?.txTotal || 0),
                netAvailable: network?.available !== false,
                generatedAt: timeA("y-m-d H:i:s", Math.floor(Date.now() / 1000)),
                backgroundImageUrl: statusBgForSharp,
                bgLocalPath: statusBgLocal || "",
                keyProcesses: (keyProcesses || []).map((p) => ({
                    // 宿主框架行显示实际框架名（咔咔珂 / NapCat / MK-JSBot）
                    label: p.key === "host" ? frameworkName : String(p.label || ""),
                    name: String(p.name || "-"),
                    pid: String(p.pid || "—"),
                    memoryMB: String(p.memoryMB || "—"),
                    cpuPercent: String(p.cpuPercent || "—"),
                    running: p.running !== false,
                })),
                pluginDir: PLUGIN_DIR,
                pluginPath: String(ctx?.pluginPath || ""),
                dataPath: getDataPath(),
                width: STATUS_CARD_WIDTH,
                height: STATUS_CARD_HEIGHT,
            }, logger);
            if (!imageData) {
                logger.warn("[运行状态] Sharp 渲染失败，已回退 HTML 渲染");
            }
        }

        if (!imageData) {
        // HTML 模板里才要用群聊 / 好友数量，走到这一步才真正去取
        await 取群友计数();
        templateData.groupCount = groupCount;
        templateData.friendCount = friendCount;
        // 读取文件
        const htmlContent = readA("默认资源/状态.html");
        // 传递
        const processDataScript = `<script>window.processData = ${JSON.stringify(processes)};</script>`;
        let finalHtml = htmlContent.replace("</head>", `${processDataScript}</head>`);
        const statusRenderOptions = {
            data: templateData,
            width: 1400,
            height: 900,
            waitForSelector: 'body[data-render-ready=\"1\"]',
            pageGotoTimeoutMs: 15000,
            waitForTimeout: 300
        };
        // 调用API
        imageData = await puppeteer(finalHtml, statusRenderOptions);
        if (!imageData && useLocalStatusBg) {
            try {
                logger.warn("[Function] 运行状态本地背景渲染失败，已回退远程背景");
            } catch (_e) {}
            templateData.backgroundImageCSS = `url('${STATUS_BG_REMOTE_URL}')`;
            templateData.backgroundImageUrl = STATUS_BG_REMOTE_URL;
            imageData = await puppeteer(finalHtml, {
                ...statusRenderOptions,
                data: templateData,
            });
        }
        }
        // 输出
        if (imageData) {
            // 发送图片
            await 发消息(event, [
                段_引用(event.message_id),
                段_图片(`base64://${imageData}`),
            ]);
        }else{
            await 发消息(event, [段_引用(event.message_id), 段_文本('渲染失败，请检查 puppeteer 插件是否正常运行')]);
        }
    }catch (error){
        logger.error("系统状态命令错误:", error);
        await 发消息(event, [段_引用(event.message_id), 段_文本(`出错了: ${error.message}`)]);
    }
return null;
}



if(message.match(/^设置(续火)内容([\s\S]*)$/)){
    // ================== 最高主人检测 ==================
    if(!(await checkOwner2(event, ctx))) return null;
    // ================== 授权判断 ==================
    if(!(await requireAuthorized(RC_sq, event))) return null;
    // ================== 读取 ==================
    let 续火内容 = (readA("筱筱吖/扩展功能/续火功能/续火内容/文本.txt") || "");
    const 目标 = message.match(/^设置(续火)内容([\s\S]*)$/)[1];
    const 内容 = message.match(/^设置(续火)内容([\s\S]*)$/)[2];
    const 字数 = (内容.length || 0);
    if(字数 == 0){
        await 发消息(event, [段_引用(event.message_id), 段_文本('至少要一个字哦～！')]);
        return null;
    }
    // ================== 写入&输出 ==================
    writeA("筱筱吖/扩展功能/续火功能/续火内容/文本.txt", 内容);
    await 发消息(event, [段_引用(event.message_id), 段_文本(`好哒！这就把${目标}的内容改成:\n${内容}`)]);
    return null;
}

if(message.match(/^设置(续火)模式(文案|图片)$/)){
    // ================== 最高主人检测 ==================
    if(!(await checkOwner2(event, ctx))) return null;
    // ================== 授权判断 ==================
    if(!(await requireAuthorized(RC_sq, event))) return null;
    // ================== 读取 ==================
    let 续火方式 = (readA("筱筱吖/扩展功能/续火功能/续火方式/方式.txt") || "文案");
    const 目标 = message.match(/^设置(续火)模式(文案|图片)$/)[1];
    const 类型 = message.match(/^设置(续火)模式(文案|图片)$/)[2];
    if(类型 == 续火方式){
        await 发消息(event, [段_引用(event.message_id), 段_文本(`现在的${目标}已经是【${类型}】模式啦～！`)]);
        return null;
    }
    // ================== 写入&输出 ==================
    writeA("筱筱吖/扩展功能/续火功能/续火方式/方式.txt", 类型);
    await 发消息(event, [段_引用(event.message_id), 段_文本(`好哒！这就把${目标}的发送方式改成【${类型}】哦！～`)]);
    return null;
}

if(message.match(/^(开启|关闭)(好友续火|群聊续火|全部好友续火|全部群聊续火)([0-9]+|)$/)){
    // ================== 最高主人检测 ==================
    if(!(await checkOwner2(event, ctx))) return null;
    // ================== 授权判断 ==================
    if(!(await requireAuthorized(RC_sq, event))) return null;
    // ================== 获取内容 ==================
    const 操作 = message.match(/^(开启|关闭)(好友续火|群聊续火|全部好友续火|全部群聊续火)([0-9]+|)$/)[1];
    const 类型 = message.match(/^(开启|关闭)(好友续火|群聊续火|全部好友续火|全部群聊续火)([0-9]+|)$/)[2];
    const 目标 = message.match(/^(开启|关闭)(好友续火|群聊续火|全部好友续火|全部群聊续火)([0-9]+|)$/)[3];
    let 是否支持下一步 = true;
    // ================== 检 ==================
    if(类型 == "好友续火" || 类型 == "群聊续火"){
        // ================== 判断内容有效性 ==================
        if(目标 && 目标 > 1000){
            是否支持下一步 = false;
            // ================== 开关检测 ==================
            let 开关 = readB(`筱筱吖/扩展功能/续火功能/状态数据/好友/开关.json`, 目标, "关闭");
            if(类型 == "群聊续火"){
                开关 = readB(`筱筱吖/事件系统/${目标}.json`, "群聊续火", "关闭");
            }
            if(开关 == 操作){
                await 发消息(event, [段_引用(event.message_id), 段_文本(`目前「${目标}」已经是【${开关}】状态的啦！`)]);
                return null;
            }else{
                // ================== 写入方式 ==================
                if(类型 == "群聊续火"){
                    writeB(`筱筱吖/事件系统/${目标}.json`, "群聊续火", 操作);
                }else{
                    writeB(`筱筱吖/扩展功能/续火功能/状态数据/好友/开关.json`, 目标, 操作);
                }
                // ================== 输出 ==================
                await 发消息(event, [段_引用(event.message_id), 段_文本(`好哒！这就把「${目标}」的续🔥开关给【${操作}】`)]);
                return null;
            }
        }
    }else{
        let 数量 = 0;
        let 组装消息 = ``;
        if(类型 == "全部好友续火"){
            let haoyouList = await BOTAPI(ctx, "get_friend_list", {});
            数量  = (haoyouList.length || 0);
            if(数量 == 0){
                await 发消息(event, [段_引用(event.message_id), 段_文本('获取【好友】列表失败！')]);
                return null;
            }
            // ================== 循环 ==================
            组装消息 = `已将【${数量}】位好友统一设为「${操作}」`;
            for(let i = 0; i < 数量; i++){
                let 本次QQ = haoyouList[i]["user_id"];
                let 开关 = readB(`筱筱吖/扩展功能/续火功能/状态数据/好友/开关.json`, 本次QQ, "关闭");
                if(开关 == 操作){
                    组装消息 += `\n${i+1}. ${本次QQ}❌本就${开关}`;
                }else{
                    writeB(`筱筱吖/扩展功能/续火功能/状态数据/好友/开关.json`, 本次QQ, 操作);
                    组装消息 += `\n${i+1}. ${本次QQ}✅这就${开关}`;
                }
            }
        }else{
            let qunliaoList = await BOTAPI(ctx, "get_group_list", {});
            数量  = (qunliaoList.length || 0);
            if(数量 == 0){
                await 发消息(event, [段_引用(event.message_id), 段_文本('获取【群聊】列表失败！')]);
                return null;
            }
            // ================== 循环 ==================
            组装消息 = `已将【${数量}】个群聊统一设为「${操作}」`;
            for(let i = 0; i < 数量; i++){
                let 本次群号 = qunliaoList[i]["group_id"];
                let 开关 = readB(`筱筱吖/事件系统/${本次群号}.json`, "群聊续火", "关闭");
                if(开关 == 操作){
                    组装消息 += `\n${i+1}. ${本次群号}❌本就${开关}`;
                }else{
                    writeB(`筱筱吖/事件系统/${本次群号}.json`, "群聊续火", 操作);
                    组装消息 += `\n${i+1}. ${本次群号}✅这就${开关}`;
                }
            }
        }
        // ================== 输出 ==================
        if(数量 >= 15){
            const messages = [合并节点(`[${类型}]`, event.self_id, [段_文本(组装消息)])];
            await 发合并消息(event, messages);
        }else{
            await 发消息(event, [段_引用(event.message_id), 段_文本(`${组装消息}`)]);
        }
        return null;
    }
    // ================== 是否拦截 ==================
    if(是否支持下一步 == false){
        return null;
    }
}

if(message.match(/^(开启|关闭)(好友消息记录|全部好友消息记录)([0-9]+|)$/)){
    if(!(await checkOwner2(event, ctx))) return null;
    if(!(await requireAuthorized(RC_sq, event))) return null;
    const 操作 = message.match(/^(开启|关闭)(好友消息记录|全部好友消息记录)([0-9]+|)$/)[1];
    const 类型 = message.match(/^(开启|关闭)(好友消息记录|全部好友消息记录)([0-9]+|)$/)[2];
    const 目标 = message.match(/^(开启|关闭)(好友消息记录|全部好友消息记录)([0-9]+|)$/)[3];
    if(类型 == "好友消息记录"){
        if(!目标 || Number(目标) <= 1000){
            await 发消息(event, [段_引用(event.message_id), 段_文本('请指定好友QQ，例如：开启好友消息记录123456789')]);
            return null;
        }
        const 开关 = readB(MK_MSG_RECORD_HAOYOU_SWITCH, 目标, "关闭");
        if(开关 == 操作){
            await 发消息(event, [段_引用(event.message_id), 段_文本(`目前「${目标}」的消息记录已经是【${开关}】状态啦！`)]);
            return null;
        }
        writeB(MK_MSG_RECORD_HAOYOU_SWITCH, 目标, 操作);
        await 发消息(event, [段_引用(event.message_id), 段_文本(`好哒！这就把「${目标}」的私聊消息记录给【${操作}】`)]);
        return null;
    }
    const haoyouList = await BOTAPI(ctx, "get_friend_list", {});
    const 数量 = (haoyouList?.length || 0);
    if(数量 == 0){
        await 发消息(event, [段_引用(event.message_id), 段_文本('获取【好友】列表失败！')]);
        return null;
    }
    let 组装消息 = `已将【${数量}】位好友的私聊消息记录统一设为「${操作}」`;
    for(let i = 0; i < 数量; i++){
        const 本次QQ = String(haoyouList[i]?.user_id ?? "");
        if(!本次QQ) continue;
        const 开关 = readB(MK_MSG_RECORD_HAOYOU_SWITCH, 本次QQ, "关闭");
        if(开关 == 操作){
            组装消息 += `\n${i + 1}. ${本次QQ} ❌本就${开关}`;
        }else{
            writeB(MK_MSG_RECORD_HAOYOU_SWITCH, 本次QQ, 操作);
            组装消息 += `\n${i + 1}. ${本次QQ} ✅已${操作}`;
        }
    }
    if(数量 >= 15){
        await 发合并消息(event, [合并节点(`[${类型}]`, event.self_id, [段_文本(组装消息)])]);
    }else{
        await 发消息(event, [段_引用(event.message_id), 段_文本(组装消息)]);
    }
    return null;
}

if(message == "管理续火"){
    // ================== 授权判断 ==================
    if(!(await requireAuthorized(RC_sq, event))) return null;
    // ================== 获取群列表 ==================
    const groupList = await BOTAPI(ctx, "get_group_list", {});
    const 群数量  = (groupList.length || 0);
    // ================== 循环 - 前置==================
    let 统计数量1 = 0;
    let 统计数量2 = 0;
    let 组装消息1 = ``;
    let 组装消息2 = ``;
    // ================== 循环 - 正式 ==================
    for(let i = 0; i < 群数量; i++){
        let 群号 = groupList[i]["group_id"];
        let 群名 = groupList[i]["group_name"];
        let 现人数 = groupList[i]["member_count"];
        let 可人数 = groupList[i]["max_member_count"];
        let fakeEvent = {message_type: "group", group_id: 群号};
        let 我可以说话吗 = true;
        // ================== 续火开关 ==================
        let 开关 = readB(`筱筱吖/事件系统/${群号}.json`, "群聊续火", "关闭");
        if(开关 == "开启"){
            组装消息1 += `\n${统计数量1 + 1}. ${群名}(${群号})✅`;
            统计数量1++;
        }else{
            组装消息2 += `\n${统计数量2 + 1}. ${群名}(${群号})❌`;
            统计数量2++;
        }
    }
    // ================== 获取好友数据 ==================
    let haoyouList = await BOTAPI(ctx, "get_friend_list", {});
    let 好友数量  = (haoyouList.length || 0);
    //
    let 统计数量3 = 0;
    let 统计数量4 = 0;
    let 组装消息3 = ``;
    let 组装消息4 = ``;
    //
    for(let i = 0; i < 好友数量; i++){
        let 本次QQ = haoyouList[i]["user_id"];
        let 开关 = readB(`筱筱吖/扩展功能/续火功能/状态数据/好友/开关.json`, 本次QQ, "关闭");
        if(开关 == "开启"){
            组装消息3 += `\n${i+1}. ${haoyouList[i]["nickname"]}(${本次QQ})✅`;
            统计数量3++;
        }else{
            组装消息4 += `\n${i+1}. ${haoyouList[i]["nickname"]}(${本次QQ})❌`;
            统计数量4++;
        }
    }
    // ================== 数据总结 ==================
    let 返回内容 = `══════════════`;
    返回内容 += `\n相关事件【群聊续火】`;
    返回内容 += `\n相关事件【好友续火】`;
    返回内容 += `\n`;
    返回内容 += `\n「全局共同」`;
    返回内容 += `\n - 设置续火内容[内容]`;
    返回内容 += `\n - 设置续火模式[文案|图片]`;
    返回内容 += `\n`;
    返回内容 += `\n「开关控制」`;
    返回内容 += `\n - [开启|关闭]好友续火[QQ号]`;
    返回内容 += `\n - [开启|关闭]群聊续火[群号]`;
    返回内容 += `\n - [开启|关闭]全部好友续火`;
    返回内容 += `\n - [开启|关闭]全部群聊续火`;
    返回内容 += `\n══════════════`;
    let 返回内容0 = `共计有【${群数量}】个群聊`;
    let 返回内容1 = `其中有【${统计数量1}】个群聊为「开启」\n══════════════${组装消息1}`;
    let 返回内容2 = `反之有【${统计数量2}】个群聊为「关闭」\n══════════════${组装消息2}`;
    let 返回内容3 = `共计有【${好友数量}】个好友`;
    let 返回内容4 = `其中有【${统计数量3}】个好友为「开启」\n══════════════${组装消息3}`;
    let 返回内容5 = `反之有【${统计数量4}】个好友为「关闭」\n══════════════${组装消息4}`;
    const messages = [
        合并节点("[管理续火]", event.self_id, [段_文本(返回内容)]),
        合并节点("[管理续火]", event.self_id, [段_文本(返回内容0)]),
        合并节点("[管理续火]", event.self_id, [段_文本(返回内容1)]),
        合并节点("[管理续火]", event.self_id, [段_文本(返回内容2)]),
        合并节点("[管理续火]", event.self_id, [段_文本(返回内容3)]),
        合并节点("[管理续火]", event.self_id, [段_文本(返回内容4)]),
        合并节点("[管理续火]", event.self_id, [段_文本(返回内容5)])
    ];
    await 发合并消息(event, messages, 合并预览(
        "MKbot 续火管理",
        `群聊 ${群数量} 个 · 好友 ${好友数量} 个续火状态`,
        "[聊天记录]",
        ["续火: 指令与模式说明", "群聊续火: 开启/关闭统计", "好友续火: 开启/关闭统计"],
    ));
    return null;
}

if(message.match(/^更改整点报时文案([\s\S]*)/)){
    // ================== 授权判断 ==================
    if(!(await requireAuthorized(RC_sq, event))) return null;
    // ================== 最高主人检测 ==================
    let crr_开关 = false;
    let 目标 = event.user_id;
    if(event.message_type == "group"){
        let rrrrv = readB(`筱筱吖/事件系统/${event.group_id}.json`, "管理模式", "关闭");
        if (rrrrv == "开启"){
            crr_开关 = true;
        }
        目标 = event.group_id;
    }
    if(!(await checkOwner3(event, ctx, crr_开关))) return null;
    let 内容 = message.match(/^更改整点报时文案([\s\S]*)/)[1];
    let 默认 = readB(`筱筱吖/扩展功能/整点报时/文案.txt`, 目标, "又是一个整点哎！");
    if(内容 == 默认){
        await 发消息(event, [段_引用(event.message_id), 段_文本('与原来的一样啦！')]);
        return null;
    }
    writeB(`筱筱吖/扩展功能/整点报时/文案.txt`, 目标, 内容);
    await 发消息(event, [段_引用(event.message_id), 段_文本(`耗的！这就去把整点报时时的文案修改为:\n${内容}`)]);
    return null;
}





if(message.match(/^切换(全部|特定)自动点赞模式$/)){
    // ================== 最高主人判断 ==================
    if(!(await checkOwner3(event, ctx, false))) return null;
    // ================== 取值 ==================
    let 总开关 = readB(`筱筱吖/事件系统/全局.json`, "自动点赞", "关闭");
    let 指定 = message.match(/^切换(全部|特定)自动点赞模式$/)[1];
    let 目前 = (readA(`筱筱吖/扩展功能/自动点赞/模式.json`) || "全部");
    // ================== 判断 ==================
    if(目前 == 指定){
        await 发消息(event, [段_引用(event.message_id), 段_文本(`目前已经是【${目前}】模式的啦～`)]);
        return null;
    }
    // ================== 不同的提示词 ==================
    writeA(`筱筱吖/扩展功能/自动点赞/模式.json`, 指定);
    if(指定 == "全部"){
        await 发消息(event, [段_引用(event.message_id), 段_文本(`好哒！目前已切换回【${指定}】模式，那么就会点赞全部人(仅好友)！`)]);
        return null;
    }else{
        await 发消息(event, [段_引用(event.message_id), 段_文本(`好哒！目前已切换回【${指定}】模式，记得设置一下点赞目标用户QQ哦～`)]);
        return null;
    }
}

if(message.match(/^(添加|新增|增加|删除|取消|移除)自动点赞用户([0-9]+)$/)){
    // ================== 最高主人判断 ==================
    if(!(await checkOwner3(event, ctx, false))) return null;
    // ================== 取值 ==================
    let 总开关 = readB(`筱筱吖/事件系统/全局.json`, "自动点赞", "关闭");
    let 点赞模式 = (readA(`筱筱吖/扩展功能/自动点赞/模式.json`) || "全部");
    let 类型 = message.match(/^(添加|新增|增加|删除|取消|移除)自动点赞用户([0-9]+)$/)[1];
    let 目标 = message.match(/^(添加|新增|增加|删除|取消|移除)自动点赞用户([0-9]+)$/)[2];
    let 数据 = JSON.parse(readA(`筱筱吖/扩展功能/自动点赞/用户数据.json`) || "[]");
    let 存在 = 数据.includes(目标);
    // ================== 判断 ==================
    if(类型 == "添加" || 类型 == "新增" || 类型 == "增加"){//增加的
        let 临时消息 = ``;
        if(存在){//已存在
            临时消息 += `介个人已经添加过啦！！！`;
        }else{
            数据.push(目标);
            writeA(`筱筱吖/扩展功能/自动点赞/用户数据.json`, JSON.stringify(数据));
            临时消息 += `好哒！这就添加【${目标}】介个QQ！！`;
        }
        临时消息 += `\n══════════════`;
        临时消息 += `\n目前【自动点赞】开关:${总开关}`;
        临时消息 += `\n目前【点赞模式】模式:${点赞模式}`;
        await 发消息(event, [段_引用(event.message_id), 段_文本(`${临时消息}`)]);
        return null;
    }else{//取消的
        let 临时消息 = ``;
        if(!存在){
            临时消息 += `木有找到介个人啦！`;
        }else{
            let 新数据 = 数据.filter(item => item !== 目标);
            writeA(`筱筱吖/扩展功能/自动点赞/用户数据.json`, JSON.stringify(新数据));
            临时消息 += `好哒！这就把【${目标}】给取消了，下次不会给他点赞了！`;
        }
        临时消息 += `\n══════════════`;
        临时消息 += `\n目前【自动点赞】开关:${总开关}`;
        临时消息 += `\n目前【点赞模式】模式:${点赞模式}`;
        await 发消息(event, [段_引用(event.message_id), 段_文本(`${临时消息}`)]);
        return null;
    }
    return null;
}









if(message.match(/^(开启|关闭)深度娱乐$/)){
    // ================== 授权判断 ==================
    if(!(await requireAuthorized(RC_sq, event))) return null;
    // ================== 最高主人检测 ==================
    let crr_开关 = false;
    if(event.message_type == "group"){
        let rrrrv = readB(`筱筱吖/事件系统/${event.group_id}.json`, "管理模式", "关闭");
        if (rrrrv == "开启"){
            crr_开关 = true;
        }
    }
    if(!(await checkOwner3(event, ctx, crr_开关))) return null;
    // ================== 判断是否 ==================
    const 操作 = message.match(/^(开启|关闭)深度娱乐$/)[1];
    let 操作值 = false;
    if(操作 == "开启"){
        操作值 = true;
    }
    if(操作值 == 娱乐_开关){
        await 发消息(event, [段_引用(event.message_id), 段_文本(`【${娱乐_来源}】介个的【深度娱乐】已经${操作}啦！`)]);
        return null;
    }else{
        writeB(深度娱乐路径, 娱乐_来源, 操作值);
        await 发消息(event, [段_引用(event.message_id), 段_文本(`好哒！这就把【${娱乐_来源}】的深度娱乐给【${操作}】！`)]);
        return null;
    }
}

// ================== 事件开关部分 ==================
if(message.match(/^(开启|关闭)(.*|全部事件)$/)){
    // ================== 获取数据 ==================
    const one_mub = message.match(/^(开启|关闭)(.*|全局事件)$/)[1];
    const two_mub = message.match(/^(开启|关闭)(.*|全部事件)$/)[2];
    
    // ================== 最高主人检测 ==================
    let crr_开关 = false;
    if(event.message_type == "group"){
        let rrrrv = readB(`筱筱吖/事件系统/${event.group_id}.json`, "管理模式", "关闭");
        if (rrrrv == "开启"){
            crr_开关 = true;
        }
    }
    if(!(await checkOwner3(event, ctx, crr_开关))) return null;//第一关
    if(two_mub && (two_mub == "全部事件" || array_RCshijian.includes(two_mub))){
        if(!(await checkOwner2(event, ctx))) return null;
        //如果是控制全部事件/全局事件，必须是主人
    }
    // ================== 判断 ==================
    if(two_mub == "" || two_mub == undefined){
        return null;
    }
    if(!array_shijian.includes(two_mub) && two_mub != "全部事件" && !array_RCshijian.includes(two_mub)){
        return null;
    }
    // ================== 来源 ==================
    // 表情制作：私聊也可开关（写入 事件系统/私聊.json）；其余本群事件仍仅群聊
    if(event.message_type != "group"){
        if(two_mub === BQB_EVENT_KEY && array_shijian.includes(two_mub)){
            if(!(await requireAuthorized(RC_sq, event))) return null;
            if(!(await checkOwner2(event, ctx))) return null;
            let wj_ofu = readB(`筱筱吖/事件系统/私聊.json`, two_mub, "关闭");
            if(wj_ofu == one_mub){
                await 发消息(event, [段_引用(event.message_id), 段_文本(`这个事件好像已经${wj_ofu}了吧～？`)]);
            }else{
                writeB(`筱筱吖/事件系统/私聊.json`, two_mub, one_mub);
                await 发消息(event, [段_引用(event.message_id), 段_文本(`这就把【${two_mub}】给${one_mub}！`)]);
            }
            return null;
        }
        return null;
    }
    
    // ================== 授权判断 ==================
    if(!(await requireAuthorized(RC_sq, event))) return null;
    
    
    // ================== 判断 ==================
    const isRC = array_RCshijian.includes(two_mub);
    if(isRC){
        let wj_ofu = readB(`筱筱吖/事件系统/全局.json`, two_mub, "关闭");
        if(wj_ofu == one_mub){
            await 发消息(event, [段_引用(event.message_id), 段_文本(`这个事件好像已经${wj_ofu}了吧～？`)]);
        }else{
            // ================== 正常写入 ==================
            writeB(`筱筱吖/事件系统/全局.json`, two_mub, one_mub);
            await 发消息(event, [段_引用(event.message_id), 段_文本(`这就把【${two_mub}】给${one_mub}！`)]);
            // ================== 特殊写入 - 备份系统 ==================
            if(two_mub == "自动备份" && one_mub == "开启"){
                writeA(`筱筱吖/扩展功能/自动备份/转发目标.json`, `${event.user_id}`);
            }
        }
        return null;
    }else if(two_mub != "全部事件"){
        let wj_ofu = readB(`筱筱吖/事件系统/${event.group_id}.json`, two_mub, two_mub === "禁言免验" ? "开启" : "关闭");
        if(wj_ofu == one_mub){
            await 发消息(event, [段_引用(event.message_id), 段_文本(`这个事件好像已经${wj_ofu}了吧～？`)]);
        }else{
            // ================== 正常写入 ==================
            writeB(`筱筱吖/事件系统/${event.group_id}.json`, two_mub, one_mub);
            let syncHint = "";
            if (two_mub === "入群审核" && one_mub === "开启") {
                const sync = await mkTrySyncNapCatJoinOptionForAudit(ctx, event.group_id);
                if (sync.ok) {
                    syncHint = `\n已同步本群 QQ 加群方式：需身份验证 + 回答问题并由管理员审核，问题为「${MK_JOIN_AUDIT_QQ_QUESTION}」。（邀请相关开关需手动在群设置里调）`;
                } else if (sync.reason === "not_admin") {
                    syncHint = "\n机器人非群主/管理员，未自动修改 QQ 加群方式，请在群设置里手动配置。";
                } else {
                    syncHint = `\n尝试同步 QQ 加群方式未成功（${sync.reason || "unknown"}）。`;
                }
            }
            await 发消息(event, [段_引用(event.message_id), 段_文本(`这就把【${two_mub}】给${one_mub}！${syncHint}`)]);
        }
        return null;
    }else{
        let 次数 = (array_shijian.length || 0);
        let 次数_2 = (array_RCshijian.length || 0);
        let 组装消息 = `已将以下事件统一「${one_mub}」`;
        组装消息 += `\n══════════════`;
        for(let i = 0; i < 次数; i++) {
            let wj_of = readB(`筱筱吖/事件系统/${event.group_id}.json`, array_shijian[i], array_shijian[i] === "禁言免验" ? "开启" : "关闭");
            if(wj_of == one_mub){
                组装消息 += `\n【${array_shijian[i]}】: ❌本就${wj_of}！`;
            }else{
                组装消息 += `\n【${array_shijian[i]}】: ✅已${one_mub}！`;
                writeB(`筱筱吖/事件系统/${event.group_id}.json`, array_shijian[i], one_mub);
            }
        }
        for(let i = 0; i < 次数_2; i++) {
            let wj_of = readB(`筱筱吖/事件系统/全局.json`, array_RCshijian[i], "关闭");
            if(wj_of == one_mub){
                组装消息 += `\n【${array_RCshijian[i]}】: ❌本就${wj_of}！`;
            }else{
                组装消息 += `\n【${array_RCshijian[i]}】: ✅已${one_mub}！`;
                writeB(`筱筱吖/事件系统/全局.json`, array_RCshijian[i], one_mub);
            }
            // ================== 特殊写入 - 备份系统 ==================
            if(array_RCshijian[i] == "自动备份" && one_mub == "开启"){
                writeA(`筱筱吖/扩展功能/自动备份/转发目标.json`, `${event.user_id}`);
            }
        }
        if (one_mub === "开启") {
            const sync = await mkTrySyncNapCatJoinOptionForAudit(ctx, event.group_id);
            if (sync.ok) {
                组装消息 += `\n══════════════\n已同步本群 QQ 加群方式：需身份验证 + 问答管理员审核，问题「${MK_JOIN_AUDIT_QQ_QUESTION}」。（邀请相关开关需手动）`;
            } else if (sync.reason === "not_admin") {
                组装消息 += "\n══════════════\n入群审核已开；机器人无群管权限，未自动改 QQ 加群方式。";
            } else {
                组装消息 += `\n══════════════\n同步 QQ 加群方式失败：${sync.reason || "unknown"}`;
            }
        }
        // ================== 输出 ==================
        await 发消息(event, [段_引用(event.message_id), 段_文本(`${组装消息}`)]);
        return null;
    }
}



if(message.match(/^(增加|新增|添加|删除|取消|减少|清空)(审核条件|审核过滤词)([\s\S]*)$/)){
    // ================== 最高主人检测 ==================
    let crr_开关 = false;
    if(event.message_type == "group"){
        let rrrrv = readB(`筱筱吖/事件系统/${event.group_id}.json`, "管理模式", "关闭");
        if (rrrrv == "开启"){
            crr_开关 = true;
        }
    }
    if(!(await checkOwner3(event, ctx, crr_开关))) return null;
    // ================== 来源 ==================
    if(event.message_type != "group"){
        return null;
    }
    // ================== 授权判断 ==================
    if(!(await requireAuthorized(RC_sq, event))) return null;
    
    // ================== 获取数据 ==================
    const one_mub = message.match(/^(增加|新增|添加|删除|取消|减少|清空)(审核条件|审核过滤词)([\s\S]*)$/)[1];
    const 类型 = message.match(/^(增加|新增|添加|删除|取消|减少|清空)(审核条件|审核过滤词)([\s\S]*)$/)[2];
    const two_mub = message.match(/^(增加|新增|添加|删除|取消|减少|清空)(审核条件|审核过滤词)([\s\S]*)$/)[3];
    // ================== 读取文件类型 ==================
    let 文件路径 = `筱筱吖/群管系统/入群审核/${event.group_id}/条件库.json`;
    if(类型 == "审核过滤词"){
        文件路径 = `筱筱吖/群管系统/入群审核/${event.group_id}/过滤库.json`;
    }
    let wj_cc = JSON.parse(readA(文件路径) || "[]");
    let 包含 = wj_cc.includes(two_mub);
    
    // ================== 添加 ==================
    if(one_mub == "增加" || one_mub == "新增" || one_mub == "添加"){
        if(包含 == true){
            await 发消息(event, [段_引用(event.message_id), 段_文本(`emmmm，介个${类型}好像也就有了哎～`)]);
            return null;
        }
        //正常写入
        wj_cc.push(two_mub);
        writeA(文件路径, JSON.stringify(wj_cc));
        await 发消息(event, [段_引用(event.message_id), 段_文本(`我这就去更新${类型}\n【新增】: ${two_mub}`)]);
        return null;
    }
    // ================== 删除 ==================
    if(one_mub == "删除" || one_mub == "取消" || one_mub == "减少"){
        if(包含 == false){
            await 发消息(event, [段_引用(event.message_id), 段_文本(`额，介个${类型}好像没有吧，我都找不到～～`)]);
            return null;
        }
        //正常删除
        let arr = wj_cc;
        arr = arr.filter(item => item !== two_mub);
        writeA(文件路径, JSON.stringify(arr));
        await 发消息(event, [段_引用(event.message_id), 段_文本(`我这就去更新${类型}\n【删除】: ${two_mub}`)]);
        return null;
    }
    // ================== 清空 ==================
    if(one_mub == "清空"){
        writeA(文件路径, "[]");
        await 发消息(event, [段_引用(event.message_id), 段_文本(`耗的，这就就把${类型}通通删除！`)]);
        return null;
    }
}



if(message.match(/^设置入群审核字数数量([0-9]+)$/)){
    // ================== 最高主人检测 ==================
    let crr_开关 = false;
    if(event.message_type == "group"){
        let rrrrv = readB(`筱筱吖/事件系统/${event.group_id}.json`, "管理模式", "关闭");
        if (rrrrv == "开启"){
            crr_开关 = true;
        }
    }
    if(!(await checkOwner3(event, ctx, crr_开关))) return null;
    // ================== 来源 ==================
    if(event.message_type != "group"){
        return null;
    }
    // ================== 授权判断 ==================
    if(!(await requireAuthorized(RC_sq, event))) return null;
    
    // ================== 获取数据 ==================
    const one_mub = message.match(/^设置入群审核字数数量([0-9]+)$/)[1];
    let cc = Number(one_mub);
    let wj_cc = Number(readB(`筱筱吖/群管系统/入群审核/${event.group_id}/数据.json`, "字数数量", 5));
    
    // ================== 匹配判断 ==================
    if(cc == wj_cc){
        await 发消息(event, [段_引用(event.message_id), 段_文本('跟原来的次数一样啦～！')]);
        return null;
    }
    if(cc == 0 || cc > 15){
        await 发消息(event, [段_引用(event.message_id), 段_文本('你这数字真的合适嘛～？')]);
        return null;
    }
    
    // ================== 写入&组装 ==================
    writeB(`筱筱吖/群管系统/入群审核/${event.group_id}/数据.json`, "字数数量", cc);
    let 返回内容 = `已把本群的入群审核【字数审核】设置为${one_mub}字`;
    返回内容 += `\n══════════════`;
    返回内容 += `\n记得本账号要有管理权限并且群聊是要为「发送验证消息」才生效哦～`;
    // ================== 输出 ==================
    await 发消息(event, [段_引用(event.message_id), 段_文本(`${返回内容}`)]);
}




if(message.match(/^设置入群审核条件(准确|模糊多重|准确多重|包含|字数)$/)){
    // ================== 最高主人检测 ==================
    let crr_开关 = false;
    if(event.message_type == "group"){
        let rrrrv = readB(`筱筱吖/事件系统/${event.group_id}.json`, "管理模式", "关闭");
        if (rrrrv == "开启"){
            crr_开关 = true;
        }
    }
    if(!(await checkOwner3(event, ctx, crr_开关))) return null;
    // ================== 来源 ==================
    if(event.message_type != "group"){
        return null;
    }
    // ================== 授权判断 ==================
    if(!(await requireAuthorized(RC_sq, event))) return null;
    
    // ================== 获取数据 ==================
    const one_mub = message.match(/^设置入群审核条件(准确|模糊多重|准确多重|包含|字数)$/)[1];
    let wj_cc = readB(`筱筱吖/群管系统/入群审核/${event.group_id}/数据.json`, "条件", "字数");
    
    // ================== 判断 ==================
    if(one_mub == wj_cc){
        await 发消息(event, [段_引用(event.message_id), 段_文本('目前本群设置的条件是一样的啦～！')]);
        return null;
    }
    
    // ================== 写入&组装 ==================
    writeB(`筱筱吖/群管系统/入群审核/${event.group_id}/数据.json`, "条件", one_mub);
    let 返回内容 = `已把本群的入群审核【条件】设置为「${one_mub}」模式`;
    返回内容 += `\n══════════════`;
    返回内容 += `\n记得本账号要有管理权限并且群聊是要为「发送验证消息」才生效哦～`;
    // ================== 输出 ==================
    await 发消息(event, [段_引用(event.message_id), 段_文本(`${返回内容}`)]);
}


if(message.match(/^设置入群审核答案([\s\S]*)/)){
    // ================== 最高主人检测 ==================
    let crr_开关 = false;
    if(event.message_type == "group"){
        let rrrrv = readB(`筱筱吖/事件系统/${event.group_id}.json`, "管理模式", "关闭");
        if (rrrrv == "开启"){
            crr_开关 = true;
        }
    }
    if(!(await checkOwner3(event, ctx, crr_开关))) return null;
    // ================== 来源 ==================
    if(event.message_type != "group"){
        return null;
    }
    // ================== 授权判断 ==================
    if(!(await requireAuthorized(RC_sq, event))) return null;
    
    const one_mub = message.match(/^设置入群审核答案([\s\S]*)/)[1];
    // ================== 写入&组装 ==================
    writeB(`筱筱吖/群管系统/入群审核/${event.group_id}/数据.json`, "答案", one_mub);
    let 返回内容 = `已把本群的入群审核【答案】设置为${one_mub}`;
    返回内容 += `\n══════════════`;
    返回内容 += `\n记得本账号要有管理权限并且群聊是要为「发送验证消息」才生效哦～`;
    // ================== 输出 ==================
    await 发消息(event, [段_引用(event.message_id), 段_文本(`${返回内容}`)]);
}


if(message.match(/^设置入群审核单日次数([0-9]+)$/)){
    // ================== 最高主人检测 ==================
    let crr_开关 = false;
    if(event.message_type == "group"){
        let rrrrv = readB(`筱筱吖/事件系统/${event.group_id}.json`, "管理模式", "关闭");
        if (rrrrv == "开启"){
            crr_开关 = true;
        }
    }
    if(!(await checkOwner3(event, ctx, crr_开关))) return null;
    // ================== 来源 ==================
    if(event.message_type != "group"){
        return null;
    }
    // ================== 授权判断 ==================
    if(!(await requireAuthorized(RC_sq, event))) return null;
    
    // ================== 获取数据 ==================
    const one_mub = message.match(/^设置入群审核单日次数([0-9]+)$/)[1];
    let cc = Number(one_mub);
    let wj_cc = Number(readB(`筱筱吖/群管系统/入群审核/${event.group_id}/数据.json`, "次数", 3));
    
    // ================== 匹配判断 ==================
    if(cc == wj_cc){
        await 发消息(event, [段_引用(event.message_id), 段_文本('跟原来的次数一样啦～！')]);
        return null;
    }
    if(cc == 0 || cc > 100){
        await 发消息(event, [段_引用(event.message_id), 段_文本('你这数字真的合适嘛～？')]);
        return null;
    }
    
    // ================== 写入&组装 ==================
    writeB(`筱筱吖/群管系统/入群审核/${event.group_id}/数据.json`, "次数", cc);
    let 返回内容 = `已把本群的入群审核【每日次数】设置为${one_mub}次`;
    返回内容 += `\n══════════════`;
    返回内容 += `\n记得本账号要有管理权限并且群聊是要为「发送验证消息」才生效哦～`;
    // ================== 输出 ==================
    await 发消息(event, [段_引用(event.message_id), 段_文本(`${返回内容}`)]);
}


if(message.match(/^设置入群审核等级([0-9]+)$/)){
    // ================== 最高主人检测 ==================
    let crr_开关 = false;
    if(event.message_type == "group"){
        let rrrrv = readB(`筱筱吖/事件系统/${event.group_id}.json`, "管理模式", "关闭");
        if (rrrrv == "开启"){
            crr_开关 = true;
        }
    }
    if(!(await checkOwner3(event, ctx, crr_开关))) return null;
    // ================== 来源 ==================
    if(event.message_type != "group"){
        return null;
    }
    // ================== 授权判断 ==================
    if(!(await requireAuthorized(RC_sq, event))) return null;

    // ================== 获取数据 ==================
    const one_mub = message.match(/^设置入群审核等级([0-9]+)$/)[1];
    let cc = Number(one_mub);
    let wj_cc = Number(readB(`筱筱吖/群管系统/入群审核/${event.group_id}/数据.json`, "等级", 0));

    // ================== 匹配判断 ==================
    if(cc == wj_cc){
        await 发消息(event, [段_引用(event.message_id), 段_文本('跟原来的等级门槛一样啦～！')]);
        return null;
    }
    if(!Number.isFinite(cc) || cc < 0 || cc > 256){
        await 发消息(event, [段_引用(event.message_id), 段_文本('等级门槛仅支持 0～256（0 为关闭）～')]);
        return null;
    }

    // ================== 写入&组装 ==================
    writeB(`筱筱吖/群管系统/入群审核/${event.group_id}/数据.json`, "等级", cc);
    let 返回内容 = cc === 0
        ? `已关闭本群的入群审核【QQ等级】门槛`
        : `已把本群的入群审核【QQ等级】门槛设置为≥${one_mub}级`;
    返回内容 += `\n══════════════`;
    返回内容 += `\n低于该等级的加群申请会被拒绝；\n获取等级失败按 0 级处理。`;
    // ================== 输出 ==================
    await 发消息(event, [段_引用(event.message_id), 段_文本(`${返回内容}`)]);
}


if(message.match(/^查看(多重条件|审核过滤词)(列表|)$/)){
    // ================== 最高主人检测 ==================
    let crr_开关 = false;
    if(event.message_type == "group"){
        let rrrrv = readB(`筱筱吖/事件系统/${event.group_id}.json`, "管理模式", "关闭");
        if (rrrrv == "开启"){
            crr_开关 = true;
        }
    }
    if(!(await checkOwner3(event, ctx, crr_开关))) return null;
    // ================== 来源 ==================
    if(event.message_type != "group"){
        return null;
    }
    // ================== 授权判断 ==================
    if(!(await requireAuthorized(RC_sq, event))) return null;
    
    // ================== 读取文件类型 ==================
    let 类型 = message.match(/^查看(多重条件|审核过滤词)(列表|)$/)[1];
    let 文件路径 = `筱筱吖/群管系统/入群审核/${event.group_id}/条件库.json`;
    if(类型 == "审核过滤词"){
        文件路径 = `筱筱吖/群管系统/入群审核/${event.group_id}/过滤库.json`;
    }
    // ================== 读取数据 ==================
    let 数据 = JSON.parse(readA(文件路径) || "[]");
    let 数据数量 = 数据.length;
    
    // ================== 循环前置 ==================
    if(数据数量 == 0){
        await 发消息(event, [段_引用(event.message_id), 段_文本('窝好像没有获取到数据哎～')]);
        return null;
    }
    // ================== 循环 ==================
    let 组装消息 = `本群共有【${数据数量}】个${类型}`;
    组装消息 += `\n══════════════`;
    for(let i = 0; i < 数据数量; i++) {
        let 本次键 = 数据[i];
        组装消息 += `\n【${i + 1}】${本次键}`;
    }
    await 发消息(event, [段_引用(event.message_id), 段_文本(`${组装消息}`)]);
    return null;
}




if(message === "执行插件数据备份"){
    // ================== 授权判断 ==================
    if(!(await requireAuthorized(RC_sq, event))) return null;
    // ================== 最高主人检测 ==================
    if(!(await checkOwner3(event, ctx, false))) return null;
    // ================== 来源检测 ==================
    if(event.group_id){
        await 发消息(event, [段_引用(event.message_id), 段_文本('请在私聊中使用！')]);
        return null;
    }
    // ================== 获取文件夹名字 ==================
    let 文件夹名字 = mkResolvePluginStorageName(ctx);
    // ================== 输出第一句话 ==================
    await 发消息(event, [段_文本('正在压缩文件夹')]);
    // ================== 压缩数据包 ==================
    const 时间戳毫秒 = Date.now();
    const 备份文件名 = mkBackupZipDisplayName(Math.floor(时间戳毫秒 / 1000));
    // ================== 备份目标路径（兼容咔咔珂 / 旧 NapCat） ==================
    const fw = ctx.frameworkEnv;
    const isMkFramework = mkIsKakakeLikeFramework(ctx);
    const 项目根 = isMkFramework && fw.projectRoot ? fw.projectRoot : path.join(ctx.pluginPath, '..', '..');
    const 备份目标 = mkResolvePluginRuntimeDataDir(ctx);
    const 备份路径 = path.join(项目根, '数据备份', 文件夹名字);
    const 备份绝对路径 = 备份路径 + `/${时间戳毫秒}.zip`;
    const 压缩状态 = await zipFile(备份目标, 备份绝对路径);
    // ================== 判断压缩状态 ==================
    if(!压缩状态){
        await 发消息(event, [段_引用(event.message_id), 段_文本('数据压缩失败！')]);
        return null;
    }
    // ================== 输出方式 ==================
    let 参数 = {"user_id": event.user_id, "file": 备份绝对路径, "name": 备份文件名};
    let 接口 = "upload_private_file";
    /*
    if(event.group_id){
        参数 = {"group_id": event.group_id, "file": 备份绝对路径, "name": 备份文件名, "upload_file": true};
        接口 = "upload_group_file";
    }
    */
    // ================== 输出文件 ==================
    await BOTAPI(ctx, 接口, 参数);
    return null;
}


if(message.match(/^测试管家发送([\s\S]*)$/)){
    // ================== 来源 ==================
    if(event.message_type != "group"){
        await 发消息(event, [段_引用(event.message_id), 段_文本('请在群聊中使用本指令')]);
        return null;
    }
    // ================== 最高主人检测 ==================
    if(!(await checkOwner3(event, ctx, false))) return null;
    const 代发正文 = message.match(/^测试管家发送([\s\S]*)$/)[1].trim() || 'MKbot 群管家代发测试';
    const 触发管家 = async () => {
        const 触发回复 = await BOTAPI(ctx, "send_group_msg", {
            group_id: event.group_id,
            message: [
                { type: "at", data: { qq: String(GUANJIA_BOT_UIN) } },
                { type: "text", data: { text: " " } },
            ],
        });
        const 触发MsgId = 触发回复?.message_id ?? 触发回复?.data?.message_id;
        if(触发MsgId){
            try {
                await BOTAPI(ctx, "delete_msg", { message_id: 触发MsgId });
            } catch (_e) { /* ignore */ }
        }
    };
    const 代发结果 = await guanjiaTestSend(ctx, readB, writeB, {
        groupId: event.group_id,
        text: 代发正文,
        onNeedTrigger: 触发管家,
    });
    if(!代发结果.ok){
        let 失败提示 = `群管家代发失败：${代发结果.error || '未知错误'}`;
        if(代发结果.detail) 失败提示 += `\n${代发结果.detail}`;
        await 发消息(event, [段_引用(event.message_id), 段_文本(失败提示)]);
    }
    return null;
}


if(message.match(/数据回档/)){
    if(!(await checkOwner3(event, ctx, false))) return null;
        // ================== 从消息段中提取被引用消息 ID ==================
        let 引用消息ID = "";
        let 节点数量 = (event?.message?.length || 0);
        for(let i = 0; i < 节点数量; i++){
            if(event?.message[i]?.type == "reply"){
                引用消息ID = event?.message[i]?.data?.id;
            }
        }
        // ================== 必须有被引用消息 ID 才继续 ==================
        if(引用消息ID != "" && 引用消息ID != undefined){
            // ================== 调用 get_msg 获取被引用消息内容 ==================
            let 引用消息 = null;
            try {
                const dp = await BOTAPI(ctx, "get_msg", { message_id: 引用消息ID });
                引用消息 = (dp && dp.data && typeof dp.data === "object") ? dp.data : dp;
            } catch (e) {
                logger?.error?.(`[数据回档] get_msg 异常 引用=${引用消息ID}`, e);
            }
            if(!引用消息 || !Array.isArray(引用消息.message)){
                await 发消息(event, [段_引用(event.message_id), 段_文本('引用消息获取失败')]);
                return null;
            }
            // ================== 从 file 消息段提取下载信息（NapCat 私聊文件常无 url，只有 file_id） ==================
            let 下载链接 = "";
            let 文件名称 = "";
            let 文件段数据 = null;
            const 引用段数 = (引用消息.message.length || 0);
            for(let i = 0; i < 引用段数; i++){
                const 当前段 = 引用消息.message[i];
                if(当前段?.type == "file"){
                    const data = 当前段?.data || {};
                    文件段数据 = data;
                    if(data?.url && String(data.url).trim()){
                        下载链接 = String(data.url).trim();
                    }
                    if(data?.file_name || data?.name || data?.file){
                        文件名称 = String(data.file_name || data.name || data.file);
                    }
                    if(下载链接 || data?.file_id || data?.fileId || data?.file){
                        break;
                    }
                }
            }
            if(!文件段数据){
                await 发消息(event, [段_引用(event.message_id), 段_文本('未获取到文件下载链接，请引用含压缩包的消息')]);
                return null;
            }
            // ================== 准备远程下载目录与解压目标目录 ==================
            const 远程下载根 = path.join(ctx.pluginPath, '..', '..', '远程下载');
            const 解压目录 = path.join(远程下载根, 'MK回档测试解压');
            const 时间戳毫秒 = Date.now();
            const zip本地名 = (文件名称 && /\.zip$/i.test(文件名称)) ? 文件名称 : `${时间戳毫秒}.zip`;
            const 下载绝对路径 = path.join(远程下载根, 'MK回档测试zip', `${时间戳毫秒}_${zip本地名}`);
            // ================== 落盘压缩包：优先直链；否则 get_file / get_*_file_url 用 file_id 取本地路径或 url ==================
            let 下载状态 = false;
            try {
                if(下载链接 && /^https?:\/\//i.test(下载链接)){
                    下载状态 = await downloadFile(下载链接, 下载绝对路径, true);
                }
                if(!下载状态){
                    const apiParams = mkRecordGetFileApiParams(文件段数据);
                    if(apiParams){
                        const gf = await mkRecordSafeBotApi(ctx, "get_file", apiParams, 60000);
                        const 本地文件 = resolveApiMediaPath(gf);
                        if(本地文件 && fs.existsSync(本地文件)){
                            fs.mkdirSync(path.dirname(下载绝对路径), { recursive: true });
                            fs.copyFileSync(本地文件, 下载绝对路径);
                            下载状态 = true;
                        } else {
                            const apiUrl = String(gf?.url ?? "").trim();
                            if(apiUrl && /^https?:\/\//i.test(apiUrl)){
                                下载链接 = apiUrl;
                                下载状态 = await downloadFile(apiUrl, 下载绝对路径, true);
                            }
                        }
                    }
                }
                if(!下载状态){
                    const fileId = String(文件段数据?.file_id ?? 文件段数据?.fileId ?? "").trim();
                    if(fileId){
                        for(const action of ["get_private_file_url", "get_group_file_url"]){
                            const r = await mkRecordSafeBotApi(ctx, action, { file_id: fileId }, 30000);
                            const u = String(r?.url ?? "").trim();
                            if(u && /^https?:\/\//i.test(u)){
                                下载链接 = u;
                                下载状态 = await downloadFile(u, 下载绝对路径, true);
                                if(下载状态) break;
                            }
                        }
                    }
                }
            } catch (e) {
                logger?.error?.(`[数据回档] 下载异常 引用=${引用消息ID} 链接=${下载链接 || "(无)"} file_id=${文件段数据?.file_id || ""}`, e);
            }
            if(!下载状态){
                await 发消息(event, [段_引用(event.message_id), 段_文本('回档包下载失败（私聊文件无直链时需协议端 get_file 支持）')]);
                return null;
            }
            // ================== 清空旧解压目录，便于本次数据校验 ==================
            if(fs.existsSync(解压目录)){
                try {
                    fs.rmSync(解压目录, { recursive: true, force: true });
                } catch (e) {
                    logger?.error?.(`[数据回档] 清理解压目录失败 路径=${解压目录}`, e);
                    await 发消息(event, [段_引用(event.message_id), 段_文本('回档包解压失败，请查看日志')]);
                    return null;
                }
            }
            // ================== 解压到 MK回档测试解压 目录（测试解压，校验压缩包是否可用） ==================
            const 解压状态 = await unzipFile(下载绝对路径, 解压目录);
            if(!解压状态){
                await 发消息(event, [段_引用(event.message_id), 段_文本('回档包解压失败')]);
                return null;
            }
            // ================== 读取插件数据目录名（咔咔珂: kakake-plugin-*；NapCat: package.json name） ==================
            let 文件夹名字 = mkResolvePluginStorageName(ctx);
            const 旧包名 = mkReadPackageJsonName(ctx);
            // ================== 核实测试解压结果中是否含 config.json，并定位备份数据根目录 ==================
            let 备份含Config = false;
            let 备份数据源目录 = "";
            if(fs.existsSync(path.join(解压目录, 'config.json'))){
                备份含Config = true;
                备份数据源目录 = 解压目录;
            } else if(旧包名 && fs.existsSync(path.join(解压目录, 旧包名, 'config.json'))){
                备份含Config = true;
                备份数据源目录 = path.join(解压目录, 旧包名);
            } else if(fs.existsSync(path.join(解压目录, 文件夹名字, 'config.json'))){
                备份含Config = true;
                备份数据源目录 = path.join(解压目录, 文件夹名字);
            } else {
                try {
                    for(const ent of fs.readdirSync(解压目录, { withFileTypes: true })){
                        if(ent.isDirectory()){
                            const 候选目录 = path.join(解压目录, ent.name);
                            if(fs.existsSync(path.join(候选目录, 'config.json'))){
                                备份含Config = true;
                                备份数据源目录 = 候选目录;
                                break;
                            }
                        }
                    }
                } catch (e) {
                    logger?.error?.(`[数据回档] 扫描测试解压目录失败 引用=${引用消息ID} 路径=${解压目录}`, e);
                }
            }
            if(!备份含Config){
                await 发消息(event, [段_引用(event.message_id), 段_文本('这可能不是标准的MKbot备份数据')]);
                return null;
            }
            // ================== 解析本插件数据存放目录（与删除、写入共用同一路径） ==================
            const 插件数据目录 = mkResolvePluginRuntimeDataDir(ctx);
            // ================== 删除本插件现有数据目录（不存在则跳过；失败才告知用户并中断） ==================
            if(fs.existsSync(插件数据目录)){
                try {
                    fs.rmSync(插件数据目录, { recursive: true, force: true });
                } catch (e) {
                    logger?.error?.(`[数据回档] 删除插件数据目录失败 插件=${文件夹名字} 引用=${引用消息ID} 路径=${插件数据目录}`, e);
                    await 发消息(event, [段_引用(event.message_id), 段_文本('插件数据清理失败，请查看日志')]);
                    return null;
                }
            }
            // ================== 将已校验的备份数据写入插件数据目录（与上一步删除路径一致，避免 zip 顶层目录再套一层） ==================
            try {
                fs.mkdirSync(插件数据目录, { recursive: true });
                fs.cpSync(备份数据源目录, 插件数据目录, { recursive: true, force: true });
            } catch (e) {
                logger?.error?.(`[数据回档] 写入插件数据失败 插件=${文件夹名字} 引用=${引用消息ID} 源=${备份数据源目录} 目标=${插件数据目录}`, e);
                await 发消息(event, [段_引用(event.message_id), 段_文本('回档数据写入失败')]);
                return null;
            }
            // ================== 删除测试解压目录（写入完毕，清理临时数据） ==================
            if(fs.existsSync(解压目录)){
                try {
                    fs.rmSync(解压目录, { recursive: true, force: true });
                } catch (e) {
                    logger?.error?.(`[数据回档] 删除测试解压目录失败 引用=${引用消息ID} 路径=${解压目录}`, e);
                    await 发消息(event, [段_引用(event.message_id), 段_文本('回档临时数据清理失败，请查看日志')]);
                    return null;
                }
            }
            // ================== 全流程完成：告知用户最终结果并中断 ==================
            await 发消息(event, [段_引用(event.message_id), 段_文本('数据回档已完成')]);
            // ================== 删除临时下载的 zip 文件（失败仅写日志，不影响已成功提示） ==================
            if(fs.existsSync(下载绝对路径)){
                try {
                    fs.unlinkSync(下载绝对路径);
                } catch (e) {
                    logger?.error?.(`[数据回档] 删除临时zip失败 引用=${引用消息ID} 路径=${下载绝对路径}`, e);
                }
            }
            return null;
        }
}


if(message.match(/^发言排行(今日|昨日|七日|本月|个人)榜$/)){
    // ================== 授权判断 ==================
    if(!(await requireAuthorized(RC_sq, event))) return null;
    const 类型 = message.match(/^发言排行(今日|昨日|七日|本月|个人)榜$/)[1];
    // ================== 今日排行榜 ==================
    if(类型 == "今日"){
        let 今天 = timeA("y-m-d", Math.floor(Date.now() / 1000));
        const shuju = JSON.parse(readA(`筱筱吖/扩展功能/发言统计/${event.group_id}/次数统计/${今天}.json`) || "{}");
        const ranking = Object.entries(shuju)
            .sort((a, b) => b[1] - a[1])
            .map(([人, 值], index) => ({
                排名: index + 1,
                QQ: 人,
                数量: 值
            }));
        const 人数 = (Object.keys(shuju).length || 0);
        if(人数 == 0){
            await 发消息(event, [段_引用(event.message_id), 段_文本('好像木有获取到数据哎！？')]);
            return null;
        }
        //
        let 组装消息 = ``;
        let xxsl = 0;
        for(let i = 0; i < 人数; i++){
            组装消息 += `\n【${i+1}】${ranking[i]["QQ"]} : ${ranking[i]["数量"]}条`;
            xxsl += ranking[i]["数量"];  // 修复：这里应该是 ranking[i]["数量"]
        }
        let 输出内容 = `共计有【${人数}】人，消息总数:${xxsl}\n══════════════${组装消息}`;
        if(人数 >= 15){
            const messages = [合并节点("[今日发言统计]", event.self_id, [段_文本(输出内容)])];
            await 发合并消息(event, messages);
        }else{
            await 发消息(event, [段_引用(event.message_id), 段_文本(`${输出内容}`)]);
        }
        return null;
    }
    
    // ================== 昨日排行榜 ==================
    if(类型 == "昨日"){
        let 昨天 = timeA("y-m-d", Math.floor(Date.now() / 1000) - 86400);  // 减一天
        const shuju = JSON.parse(readA(`筱筱吖/扩展功能/发言统计/${event.group_id}/次数统计/${昨天}.json`) || "{}");
        const ranking = Object.entries(shuju)
            .sort((a, b) => b[1] - a[1])
            .map(([人, 值], index) => ({
                排名: index + 1,
                QQ: 人,
                数量: 值
            }));
        const 人数 = (Object.keys(shuju).length || 0);
        if(人数 == 0){
            await 发消息(event, [段_引用(event.message_id), 段_文本('昨日暂无数据！')]);
            return null;
        }
        //
        let 组装消息 = ``;
        let xxsl = 0;
        for(let i = 0; i < 人数; i++){
            组装消息 += `\n【${i+1}】${ranking[i]["QQ"]} : ${ranking[i]["数量"]}条`;
            xxsl += ranking[i]["数量"];
        }
        let 输出内容 = `共计有【${人数}】人，消息总数:${xxsl}\n══════════════${组装消息}`;
        if(人数 >= 15){
            const messages = [合并节点("[昨日发言统计]", event.self_id, [段_文本(输出内容)])];
            await 发合并消息(event, messages);
        }else{
            await 发消息(event, [段_引用(event.message_id), 段_文本(`${输出内容}`)]);
        }
        return null;
    }
    
    // ================== 七日排行榜 ==================
    if(类型 == "七日"){
        const now = Math.floor(Date.now() / 1000);
        const files = fs.readdirSync(path.join(getDataPath(), `筱筱吖/扩展功能/发言统计/${event.group_id}/次数统计`), { withFileTypes: true })
            .filter(e => e.isFile()).map(e => e.name).sort().reverse();
        
        // 计算最近7天的日期范围
        const 七天前 = timeA("y-m-d", now - 6 * 86400);
        const 今天 = timeA("y-m-d", now);
        
        // 统计最近7天的数据
        let 汇总数据 = {};
        for(let i = 0; i < files.length; i++){
            const fileName = files[i].replace('.json', '');
            if(fileName >= 七天前 && fileName <= 今天){
                const shuju = JSON.parse(readA(`筱筱吖/扩展功能/发言统计/${event.group_id}/次数统计/${files[i]}`) || "{}");
                for(let qq in shuju){
                    汇总数据[qq] = (汇总数据[qq] || 0) + shuju[qq];
                }
            }
        }
        
        const ranking = Object.entries(汇总数据)
            .sort((a, b) => b[1] - a[1])
            .map(([人, 值], index) => ({
                排名: index + 1,
                QQ: 人,
                数量: 值
            }));
        const 人数 = Object.keys(汇总数据).length;
        
        if(人数 == 0){
            await 发消息(event, [段_引用(event.message_id), 段_文本('最近七日暂无数据！')]);
            return null;
        }
        
        let 组装消息 = ``;
        let xxsl = 0;
        for(let i = 0; i < 人数; i++){
            组装消息 += `\n【${i+1}】${ranking[i]["QQ"]} : ${ranking[i]["数量"]}条`;
            xxsl += ranking[i]["数量"];
        }
        let 输出内容 = `共计有【${人数}】人，消息总数:${xxsl}\n══════════════${组装消息}`;
        if(人数 >= 15){
            const messages = [合并节点("[七日发言统计]", event.self_id, [段_文本(输出内容)])];
            await 发合并消息(event, messages);
        }else{
            await 发消息(event, [段_引用(event.message_id), 段_文本(`${输出内容}`)]);
        }
        return null;
    }
    
    // ================== 本月排行榜 ==================
    if(类型 == "本月"){
        const now = Math.floor(Date.now() / 1000);
        const files = fs.readdirSync(path.join(getDataPath(), `筱筱吖/扩展功能/发言统计/${event.group_id}/次数统计`), { withFileTypes: true })
            .filter(e => e.isFile()).map(e => e.name).sort().reverse();
        
        // 计算本月1号到今天
        const 今天 = timeA("y-m-d", now);
        const 本月1号 = 今天.substring(0, 8) + "01";
        
        // 统计本月的数据
        let 汇总数据 = {};
        for(let i = 0; i < files.length; i++){
            const fileName = files[i].replace('.json', '');
            if(fileName >= 本月1号 && fileName <= 今天){
                const shuju = JSON.parse(readA(`筱筱吖/扩展功能/发言统计/${event.group_id}/次数统计/${files[i]}`) || "{}");
                for(let qq in shuju){
                    汇总数据[qq] = (汇总数据[qq] || 0) + shuju[qq];
                }
            }
        }
        
        const ranking = Object.entries(汇总数据)
            .sort((a, b) => b[1] - a[1])
            .map(([人, 值], index) => ({
                排名: index + 1,
                QQ: 人,
                数量: 值
            }));
        const 人数 = Object.keys(汇总数据).length;
        
        if(人数 == 0){
            await 发消息(event, [段_引用(event.message_id), 段_文本('本月暂无数据！')]);
            return null;
        }
        
        let 组装消息 = ``;
        let xxsl = 0;
        for(let i = 0; i < 人数; i++){
            组装消息 += `\n【${i+1}】${ranking[i]["QQ"]} : ${ranking[i]["数量"]}条`;
            xxsl += ranking[i]["数量"];
        }
        let 输出内容 = `共计有【${人数}】人，消息总数:${xxsl}\n══════════════${组装消息}`;
        if(人数 >= 15){
            const messages = [合并节点("[本月发言统计]", event.self_id, [段_文本(输出内容)])];
            await 发合并消息(event, messages);
        }else{
            await 发消息(event, [段_引用(event.message_id), 段_文本(`${输出内容}`)]);
        }
        return null;
    }
    
    // ================== 个人排行榜 ==================
    if(类型 == "个人"){
        // 获取所有文件
        const files = fs.readdirSync(path.join(getDataPath(), `筱筱吖/扩展功能/发言统计/${event.group_id}/次数统计`), { withFileTypes: true })
            .filter(e => e.isFile()).map(e => e.name).sort().reverse();
        const 文件数量 = files.length;
        
        if(文件数量 == 0){
            await 发消息(event, [段_引用(event.message_id), 段_文本('获取数据失败了唉！')]);
            return null;
        }
        
        const now = Math.floor(Date.now() / 1000);
        const 今天 = timeA("y-m-d", now);
        const 昨天 = timeA("y-m-d", now - 86400);
        
        // 计算本周一的日期
        const nowDate = new Date(now * 1000);
        const dayOfWeek = nowDate.getDay() || 7; // 周日为0，转为7
        const 本周一 = timeA("y-m-d", now - (dayOfWeek - 1) * 86400);
        
        // 计算上周一和上周日
        const 上周一 = timeA("y-m-d", now - (dayOfWeek + 6) * 86400);
        const 上周日 = timeA("y-m-d", now - dayOfWeek * 86400);
        
        // 计算本月1号
        const 本月1号 = timeA("y-m-d", now).substring(0, 8) + "01";
        
        // 计算上月1号和上月最后一天
        const thisYear = nowDate.getFullYear();
        const thisMonth = nowDate.getMonth() + 1;
        const lastMonth = thisMonth === 1 ? 12 : thisMonth - 1;
        const lastMonthYear = thisMonth === 1 ? thisYear - 1 : thisYear;
        const 上月1号 = `${lastMonthYear}-${String(lastMonth).padStart(2, '0')}-01`;
        const lastMonthLastDay = new Date(thisYear, thisMonth - 1, 0).getDate();
        const 上月最后 = `${lastMonthYear}-${String(lastMonth).padStart(2, '0')}-${String(lastMonthLastDay).padStart(2, '0')}`;
        
        // 计算本年1月1号
        const 本年1月1号 = `${thisYear}-01-01`;
        
        // 统计各时间段发言
        let 今日 = 0, 昨日 = 0, 本周 = 0, 上周 = 0, 本月 = 0, 上月 = 0, 本年 = 0, 总次 = 0;
        
        for(let i = 0; i < 文件数量; i++){
            const fileName = files[i].replace('.json', '');
            const 数量 = Number(readB(`筱筱吖/扩展功能/发言统计/${event.group_id}/次数统计/${files[i]}`, event.user_id, 0));
            
            总次 += 数量;
            
            if(fileName === 今天) 今日 += 数量;
            if(fileName === 昨天) 昨日 += 数量;
            if(fileName >= 本周一 && fileName <= 今天) 本周 += 数量;
            if(fileName >= 上周一 && fileName <= 上周日) 上周 += 数量;
            if(fileName >= 本月1号 && fileName <= 今天) 本月 += 数量;
            if(fileName >= 上月1号 && fileName <= 上月最后) 上月 += 数量;
            if(fileName >= 本年1月1号 && fileName <= 今天) 本年 += 数量;
        }
        
        let 输出内容 = `我的发言:\n今日: ${今日}\n本周: ${本周}\n本月: ${本月}\n本年: ${本年}\n--------------\n昨日: ${昨日}\n上周: ${上周}\n上月: ${上月}\n总次: ${总次}`;
        await 发消息(event, [段_引用(event.message_id), 段_文本(`${输出内容}`)]);
        return null;
    }
}







if(message == "获取账号信息"){
    // ================== 授权判断 ==================
    if(!(await requireAuthorized(RC_sq, event))) return null;
    // ================== 最高主人检测 ==================
    if(!(await checkOwner3(event, ctx, false))) return null;
    // ================== 访问接口 ==================
    const dp1 = await BOTAPI(ctx, "get_version_info", {});
    const dp2 = await BOTAPI(ctx, "get_login_info", {});
    const 框架版本 = dp1?.app_version;
    const 账号昵称 = dp2?.nickname;
    const 账号账号 = dp2?.user_id;;
    //
    const 插件版本 = mkReadPluginVersion(ctx);
    //
    const 获取最新版 = await fetchAPI("https://xn--mk-ub3cl61ae1v.xn--c5w857b.xn--fiqs8s/mkbot/config.json");
    const 最新版 = 获取最新版?.version;
    let ccccc = ``;
    if(获取最新版 && 插件版本 != 最新版 && 最新版 != undefined){
        ccccc = `\n[最新插件]:${最新版}`;
    }
    // ================== 组装 ==================
    let 组装消息 = `\n══════════════`;
    组装消息 += `\n[昵称]:${账号昵称}`;
    组装消息 += `\n----------------`;
    组装消息 += `\n[框架版本]:${框架版本}`;
    组装消息 += `\n[插件版本]:${插件版本}`;
    组装消息 += ccccc;
    组装消息 += `\n══════════════`;
    // ================== 输出 ==================
    await 发消息(event, [
        段_引用(event.message_id),
        段_图片(`https://q4.qlogo.cn/g?b=qq&nk=${账号账号}&s=5`),
        段_文本(组装消息),
    ]);
    return null;
}


if(message.match(/^获取声聊角色列表$/)){
    if(!(await checkOwner3(event, ctx, false))) return null;
    // ================== 访问接口 ==================
    let 参数 = {group_id : event.group_id};
    const dp = await BOTAPI(ctx, "get_ai_characters", 参数);
    const 数量 = (dp.length || 0);
    // ================== 循环取值 - 前置 ==================
    if(数量 == 0){
        await 发消息(event, [段_引用(event.message_id), 段_文本('获取失败！')])
        return null;;
    }
    // ================== 循环取值 - 开始 ==================
    let 组装消息 = ``;
    for(let i = 0; i < 数量; i++){
        let 子数量 = (dp[i]["characters"].length || 0);
        if(i == 0){
            组装消息 += `【${dp[i]["type"]}】`;
        }else{
            组装消息 += `\n【${dp[i]["type"]}】`;
        }
        for(let q = 0; q < 子数量; q++){
            if(q == 0){
                组装消息 += `\n${dp[i]["characters"][q]["character_name"]}`;
            }else{
                组装消息 += `、${dp[i]["characters"][q]["character_name"]}`;
            }
            writeB(`筱筱吖/扩展功能/AI声聊/${event.group_id}/模型列表.json`, dp[i]["characters"][q]["character_name"], dp[i]["characters"][q]["character_id"]);
        }
        组装消息 += `\n`;
    }
    // ================== 输出结果 ==================
    await 发消息(event, [段_引用(event.message_id), 段_文本(`${组装消息}`)]);
    return null;
}

if(message.match(/^发送(.*|)(AI|ai)声聊([\s\S]*)$/)){
    if(!(await checkOwner3(event, ctx, false))) return null;
    // ================== 获取数据 ==================
    const 指定模型 = message.match(/^发送(.*|)(AI|ai)声聊([\s\S]*)$/)[1];
    const 指定内容 = message.match(/^发送(.*|)(AI|ai)声聊([\s\S]*)$/)[3];
    const 历史模型 = readB(`筱筱吖/扩展功能/AI声聊/${event.group_id}/正在使用.json`, "正在使用", "lucy-voice-houge");
    let 模型 = ``;
    let 内容 = "你好";
    if(指定模型 == "" || 指定模型 == undefined){
        模型 = readB(`筱筱吖/扩展功能/AI声聊/${event.group_id}/正在使用.json`, "正在使用", "lucy-voice-houge");
    }else{
        模型 = readB(`筱筱吖/扩展功能/AI声聊/${event.group_id}/模型列表.json`, 指定模型, "lucy-voice-houge");
        writeB(`筱筱吖/扩展功能/AI声聊/${event.group_id}/正在使用.json`, "正在使用", 模型);
    }
    if(指定内容.length == 0){
        内容 = "谁教你这么发指令的，回答我！";
    }else{
        内容 = 指定内容;
    }
    // ================== 访问接口 ==================
    let 参数2 = {"character": 模型,"group_id": event.group_id,"text": 内容};
    await BOTAPI(ctx, "send_group_ai_record", 参数2);
    return null;
}


if(message.match(/^查(群员|群友|用户|群聊)([0-9]+)$/)){
    // ================== 来源判断 ==================
    if(event.message_type != "group"){
        return null;
    }
    // ================== 授权判断 ==================
    if(!(await requireAuthorized(RC_sq, event))) return null;
    // ================== 取值 ==================
    const 类型 = message.match(/^查(群员|群友|用户|群聊)([0-9]+)$/)[1];
    const 目标 = message.match(/^查(群员|群友|用户|群聊)([0-9]+)$/)[2];
    let 参数 = {"group_id": event.group_id,"user_id": 目标};
    let 接口 = "get_group_member_info";
    if(类型 == "用户"){
        参数 = {"user_id": 目标};
        接口 = "get_stranger_info";
    }
    if(类型 == "群聊"){
        参数 = {"group_id": 目标};
        接口 = "get_group_detail_info";
    }
    // ================== 访问后取值 ==================
    try {
        const dp = await BOTAPI(ctx, 接口, 参数);
        if(!dp){
            let 错误提示 = 类型 == "群聊" ? "查无此群～！" : "查无此人～！";
            await 发消息(event, [段_引用(event.message_id), 段_文本(`${错误提示}`)]);
            return null;
        }
        let 性别数据 = {'unknown': "未知", 'female': "女", 'male': "男"};
        let 组装消息 = "";
        // ================== 正式 ==================
        if(类型 == "用户"){
        let 用户qid = dp["qid"] ? dp["qid"] : "-";
        let 用户性别 = dp["sex"];
        let 用户昵称 = dp["nick"] || dp["nickname"] || "-";
        let 用户个性签名 = dp["longNick"] || dp["long_nick"] || "-";
        let 用户QQ等级 = dp["qqLevel"] || dp["qq_level"] || dp["level"] || "-";
        let 用户VIP等级 = dp["vip_level"] ? dp["vip_level"] : "-";
        let 用户注册时间 = (dp["reg_time"] || dp["regTime"]) ? timeA('y-m-d H:i:s', dp["reg_time"] || dp["regTime"]) : "-";
        //
        组装消息 = `\n══════════════`;
        组装消息 += `\n[QQ]:${目标}`;
        组装消息 += `\n[Qid]:${用户qid}`;
        组装消息 += `\n[昵称]:${用户昵称}`;
        组装消息 += `\n[性别]:${性别数据[用户性别]}`;
        组装消息 += `\n[用户等级]:${用户QQ等级}`;
        组装消息 += `\n[会员等级]:${用户VIP等级}`;
        组装消息 += `\n[注册时间]:${用户注册时间}`;
        组装消息 += `\n--------`;
        组装消息 += `\n[个性签名]:${用户个性签名}`;
        组装消息 += `\n══════════════`;
        await 发消息(event, [
            段_引用(event.message_id),
            段_图片(`https://q4.qlogo.cn/g?b=qq&nk=${目标}&s=5`),
            段_文本(组装消息),
        ]);
    }else if(类型 == "群聊"){
        let 群简介 = (dp["richFingerMemo"] || "-")
            .replace(/&nbsp;/g, ' ')
            .replace(/&amp;/g, '&')
            .replace(/</g, '<')
            .replace(/>/g, '>')
            .replace(/"/g, '"')
            .replace(/'/g, "'");
        
        组装消息 = `\n══════════════`;
        组装消息 += `\n[群号]:${目标}`;
        组装消息 += `\n[群名]:${dp["group_name"]}`;
        组装消息 += `\n[群主]:` + (dp["ownerUin"] && dp["ownerUin"] !== "0" ? dp["ownerUin"] : "-");
        组装消息 += `\n[人数]:` + (dp["member_count"] || 0) + `/` + (dp["max_member_count"] || 0);
        组装消息 += `\n[创建]:` + timeA("y-m-d H:i:s", (dp["groupCreateTime"] || Math.floor(Date.now() / 1000)));
        组装消息 += `\n---------------`;
        组装消息 += `\n` + 群简介;
        组装消息 += `\n══════════════`;
        await 发消息(event, [
            段_引用(event.message_id),
            段_图片(`http://p.qlogo.cn/gh/${目标}/${目标}/0`),
            段_文本(组装消息),
        ]);
    }else{
        let QQ = dp["user_id"];
        let 性别 = dp["sex"];
        let 年龄 = dp["age"];
        let 昵称 = dp["nickname"];
        let 账号等级 = dp["qq_level"];
        // ================== 取值 - 群内数据 ==================
        let 群内昵称 = dp["card"];
        let 群内等级 = dp["level"];
        let 群内身份 = dp["role"];
        let 群内头衔 = dp["title"];
        let 入群时间 = timeA('y-m-d H:i:s', dp["join_time"]);
        let 最后发言 = timeA('y-m-d H:i:s', dp["last_sent_time"]);
        // ================== 组装输出消息 ==================
        let 身份数据 = {'owner': "群主", 'admin': "管理员", 'member': "普通成员", 'unknown': "未知"};
        let 年龄显示 = 年龄 ? `${年龄}岁` : "-";
        let 等级显示 = 账号等级 ? `${账号等级}级` : "-";
        let 群昵显示 = 群内昵称 ? `${群内昵称}` : `${昵称}`;
        let 头衔显示 = 群内头衔 ? `${群内头衔}` : "-";
        //
        组装消息 = `\n══════════════`;
        组装消息 += `\n[目标]:${QQ}`;
        组装消息 += `\n[昵称]:${昵称}`;
        组装消息 += `\n[性别]:${性别数据[性别]}`;
        组装消息 += `\n[年龄]:${年龄显示}`;
        组装消息 += `\n[等级]:${等级显示}`;
        组装消息 += `\n══════════════`;
        组装消息 += `\n[群昵称]:${群昵显示}`;
        组装消息 += `\n[群身份]:${身份数据[群内身份]}`;
        组装消息 += `\n[群头衔]:${头衔显示}`;
        组装消息 += `\n[群等级]:${群内等级}`;
        组装消息 += `\n══════════════`;
        组装消息 += `\n[入群时间]:${入群时间}`;
        组装消息 += `\n[最近发言]:${最后发言}`;
        组装消息 += `\n══════════════`;
        await 发消息(event, [
            段_引用(event.message_id),
            段_图片(`https://q4.qlogo.cn/g?b=qq&nk=${目标}&s=5`),
            段_文本(组装消息),
        ]);
    }
    } catch (error) {
        // 捕获错误
        let 错误提示 = 类型 == "群聊" ? "查无此群～！" : "查无此人～！";
        await 发消息(event, [段_引用(event.message_id), 段_文本(`${错误提示}`)]);
    }
    return null;
}



if(message.match(/^(添加|删除|清空)(精准|模糊)问答(?:#([^\r\n#]+)(?:#([\s\S]*))?)?$/)){
    // ================== 最高主人检测 ==================
    let crr_开关 = false;
    if(event.message_type == "group"){
        let rrrrv = readB(`筱筱吖/事件系统/${event.group_id}.json`, "管理模式", "关闭");
        if (rrrrv == "开启"){
            crr_开关 = true;
        }
    }
    if(event.message_type != "group") return null;
    if(!(await requireAuthorized(RC_sq, event))) return null;
    if(!(await checkOwner3(event, ctx, crr_开关))) return null;
    const 操作 = message.match(/^(添加|删除|清空)(精准|模糊)问答(?:#([^\r\n#]+)(?:#([\s\S]*))?)?$/)[1];
        const 类型 = message.match(/^(添加|删除|清空)(精准|模糊)问答(?:#([^\r\n#]+)(?:#([\s\S]*))?)?$/)[2];
        const 问题 = String(message.match(/^(添加|删除|清空)(精准|模糊)问答(?:#([^\r\n#]+)(?:#([\s\S]*))?)?$/)[3] || "");
        const 存储路径 = mkQaStorePath(event.group_id, 类型);
        const 文件 = readB(存储路径, 问题, false);
        if(操作 == "添加"){
            if(文件){
                await 发消息(event, [段_引用(event.message_id), 段_文本(`【${类型}问答】中已存在该词语啦～！如需修改请先删除哦～`)]);
                return null;
            }
            if(!问题.length){
                await 发消息(event, [段_引用(event.message_id), 段_文本('必填参数缺失！')]);
                return null;
            }
            const built = await mkQaBuildAnswerForStore(event, ctx);
            if(!built.ok){
                await 发消息(event, [段_引用(event.message_id), 段_文本(built.error || '答案不能为空～文字、表情或图片至少要有一样哦')]);
                return null;
            }
            const 写入内容 = built.content;
            await 发消息(event, [
                段_引用(event.message_id),
                段_文本(`已新增【${类型}问答】\n问:${问题}\n答:`),
                ...mkQaAnswerToSegments(写入内容),
            ]);
            writeB(存储路径, 问题, 写入内容);
            return null;
        }
        if(操作 == "删除"){
            if(!文件 || !String(文件).length){
                await 发消息(event, [段_引用(event.message_id), 段_文本('好像木有这个哎～要不你仔细看看列表？')]);
                return null;
            }
            await 发消息(event, [段_引用(event.message_id), 段_文本(`好哒！这就去把【${类型}问答】的「${问题}」这个原值删除！`)]);
            deleteKey(存储路径, 问题);
            return null;
        }
        if(操作 == "清空"){
            await 发消息(event, [段_引用(event.message_id), 段_文本(`这就把【${类型}问答】的词语通通清空！`)]);
        writeA(存储路径, "{}");
        return null;
    }
}

// ================== 全局 / 私聊问答维护（仅全局主人） ==================
if(message.match(/^(添加|删除|清空)(全局|私聊)(精准|模糊)问答(?:#([^\r\n#]+)(?:#([\s\S]*))?)?$/)){
    if(!(await requireAuthorized(RC_sq, event))) return null;
    if(!(await checkOwner3(event, ctx, false))) return null;
    const m = message.match(/^(添加|删除|清空)(全局|私聊)(精准|模糊)问答(?:#([^\r\n#]+)(?:#([\s\S]*))?)?$/);
    const 操作 = m[1];
    const 范围名 = m[2];
    const 类型 = m[3];
    const 问题 = String(m[4] || "");
    const 存储路径 = mkQaStorePath(范围名, 类型);
    const 文件 = readB(存储路径, 问题, false);
    if(操作 == "添加"){
        if(文件){
            await 发消息(event, [段_引用(event.message_id), 段_文本(`【${范围名}${类型}问答】中已存在该词语啦～！如需修改请先删除哦～`)]);
            return null;
        }
        if(!问题.length){
            await 发消息(event, [段_引用(event.message_id), 段_文本('必填参数缺失！')]);
            return null;
        }
        const built = await mkQaBuildAnswerForStore(event, ctx);
        if(!built.ok){
            await 发消息(event, [段_引用(event.message_id), 段_文本(built.error || '答案不能为空～文字、表情或图片至少要有一样哦')]);
            return null;
        }
        const 写入内容 = built.content;
        await 发消息(event, [
            段_引用(event.message_id),
            段_文本(`已新增【${范围名}${类型}问答】\n问:${问题}\n答:`),
            ...mkQaAnswerToSegments(写入内容),
        ]);
        writeB(存储路径, 问题, 写入内容);
        return null;
    }
    if(操作 == "删除"){
        if(!文件 || !String(文件).length){
            await 发消息(event, [段_引用(event.message_id), 段_文本('好像木有这个哎～要不你仔细看看列表？')]);
            return null;
        }
        await 发消息(event, [段_引用(event.message_id), 段_文本(`好哒！这就去把【${范围名}${类型}问答】的「${问题}」删掉！`)]);
        deleteKey(存储路径, 问题);
        return null;
    }
    if(操作 == "清空"){
        await 发消息(event, [段_引用(event.message_id), 段_文本(`这就把【${范围名}${类型}问答】通通清空！`)]);
        writeA(存储路径, "{}");
        return null;
    }
}

if(message.match(/^清空全部(精准|模糊)问答$/)){
    if(!(await requireAuthorized(RC_sq, event))) return null;
    if(!(await checkOwner3(event, ctx, false))) return null;
    const 类型 = message.match(/^清空全部(精准|模糊)问答$/)[1];
    const 群数 = mkQaClearAllOfType(类型);
    await 发消息(event, [段_引用(event.message_id), 段_文本(
        `已清空全部【${类型}问答】\n══════════════\n· 全局：已清空\n· 私聊：已清空\n· 群聊目录：${群数} 个`,
    )]);
    return null;
}


if(message.match(/^(问答词列表|详细问答词列表)$/)){
    // ================== 来源判断 ==================
    if(event.message_type != "group"){
        return null;
    }
    // ================== 授权判断 ==================
    if(!(await requireAuthorized(RC_sq, event))) return null;
    const 全局库 = mkQaLoadStore("全局");
    const 私聊库 = mkQaLoadStore("私聊");
    const 本群库 = mkQaLoadStore(event.group_id);
    const 总数 =
        Object.keys(全局库.精准).length + Object.keys(全局库.模糊).length +
        Object.keys(私聊库.精准).length + Object.keys(私聊库.模糊).length +
        Object.keys(本群库.精准).length + Object.keys(本群库.模糊).length;
    if(总数 == 0){
        await 发消息(event, [段_引用(event.message_id), 段_文本('好像木有过数据哎～全局/本群/私聊都没找到唉～～')]);
        return null;
    }
    let 组装消息0 = `══════════════`;
    组装消息0 += `\n删除时请删除「问题」参数`;
    组装消息0 += `\n也就是[]里面的，就“→”之前的`;
    组装消息0 += `\n══════════════`;
    const messages = [
        合并节点("[问答系统]", event.self_id, [段_文本(组装消息0)]),
        mkQaScopeNestedNode("全局", 全局库, event.self_id),
        mkQaScopeNestedNode("私聊", 私聊库, event.self_id),
        mkQaScopeNestedNode("本群", 本群库, event.self_id),
    ];
    await 发合并消息(event, messages);
    return null;
}


if(message.match(/^发公告/)){
    // ================== 授权判断 ==================
    if(!(await requireAuthorized(RC_sq, event))) return null;
    // ================== 最高主人检测 ==================
    let crr_开关 = false;
    if(event.message_type == "group"){
        let rrrrv = readB(`筱筱吖/事件系统/${event.group_id}.json`, "管理模式", "关闭");
        if (rrrrv == "开启"){
            crr_开关 = true;
        }
    }
    if(!(await checkOwner3(event, ctx, crr_开关))) return null;
    // ================== 获取机器人身份 ==================
    let dp188 = await BOTAPI(ctx, "get_group_member_info", {group_id: event.group_id,user_id: event.self_id});
    let Robot身份 = (RC_group_role[(dp188?.role || "member")] || 0);
    if(Robot身份 < 2){
        await 发消息(event, [段_引用(event.message_id), 段_文本('窝好像没有群管权限唉～！')]);
        return null;
    }
    // ================== 获取数据 ==================
    const fullText = giveText(event.message);
    const text = fullText.replace(/^发公告/, "").trim();//内容
    const image = giveImages(event.message);//图片链接
    const image_name = giveImages_name(event.message);//图片名字
    const image_count = image.length;//图片数
    const text_count = text.length;//字数
    // ================== 检 ==================
    if(text_count < 1){
        await 发消息(event, [段_引用(event.message_id), 段_文本('发群公告至少要一个字内容哦～')]);
        return null;
    }
    // ================== 获取图片地址 ==================
    let 图片文件 = ``;
    if(image_count != 0){//有图片才触发
        let dp0 = await BOTAPI(ctx, "get_image", {"file": image_name[0]});
        图片文件 = dp0?.file;
    }
    // ================== 二次检测内容 ==================
    if(图片文件 == `` && text_count < 1){
        await 发消息(event, [段_引用(event.message_id), 段_文本('？你在干什么？？')]);
        return null;
    }
    // ================== 检发送公告 ==================
    let 是否置顶 = 0;
    let 是否确认 = 0;
    let 是否弹窗 = 0;
    let 引导改名 = 0;
    let 参数 = {"group_id": event.group_id, "content": text, "image": 图片文件, "pinned": 是否置顶, "type": 0, "confirm_required": 是否确认, "is_show_edit_card": 引导改名, "tip_window_type": 是否弹窗}
    const dp = await BOTAPI(ctx, "_send_group_notice", 参数);
    //await 发消息(event, [段_引用(event.message_id), 段_文本('OK')]);
    return null;
}


if(message.match(/^(获取|获取全部|查看)可群发列表$/)){
    // ================== 授权判断 ==================
    if(!(await requireAuthorized(RC_sq, event))) return null;
    // ================== 最高主人检测 ==================
    if(!(await checkOwner3(event, ctx, false))) return null;
    // ================== 如果是查看列表，则直接输出 ==================
    let 类型 = message.match(/^(获取|获取全部|查看)可群发列表$/)[1];
    if(类型 == "查看"){
        let 数据 = JSON.parse(readA(`筱筱吖/扩展功能/群发系统/可群发.json`) || "[]");
        let 数量 = (数据.length || 0);
        if(数量 == 0){
            await 发消息(event, [段_引用(event.message_id), 段_文本('暂无列表，即将自动获取！')]);
        }else{
            let xx = `══════════════`;
            xx += `\n共计已有 ${数量} 个群聊准备就绪`;
            xx += `\n══════════════`;
            for(let i = 0; i < 数量; i++){
                xx += `\n${i+1}.${数据[i]}`;
            }
            xx += `\n══════════════`;
            xx += `\n扩展指令:`;
            xx += `\n获取可群发列表`;
            xx += `\n取消可群发目标[群号]`;
            xx += `\n新增可群发目标[群号]`;
            xx += `\n执行群发文本[内容]`;
            xx += `\n执行群发公告[内容]`;
            xx += `\n☆执行群发(跟前两个一样)`;
            //输出方式
            if(数量 >= 15){
                const messages = [合并节点("[可群发列表 - 查询]", event.self_id, [段_文本(xx)])];
                await 发合并消息(event, messages);
            }else{
                await 发消息(event, [段_引用(event.message_id), 段_文本(xx)]);
            }
            return null;
        }
    }
    // ================== 获取群聊列表 ==================
    let 总群数据 = await BOTAPI(ctx, "get_group_list", {});
    let 总群数量 = (Object.keys(总群数据).length || 0);
    if(总群数量 == 0){
        await 发消息(event, [段_引用(event.message_id), 段_文本('好像获取群聊列表失败了唉？～')]);
        return null;
    }
    // ================== 循环获取有效群 ==================
    let 有效群 = [];
    let 有效量 = 0;
    let 输出预览 = ``;
    for(let i = 0; i < 总群数量; i++){
        let 本次群号 = 总群数据[i]?.group_id;
        if(本次群号){
            let Robot身份 = 3;
            if(类型 == "获取"){
                let 参数188 = {group_id: 本次群号, user_id: event.self_id};
                let dp188 = await BOTAPI(ctx, "get_group_member_info", 参数188);
                Robot身份 = (RC_group_role[(dp188?.role || "member")] || 0);
            }
            if(Robot身份 >= 2){
                有效量++;
                有效群.push(本次群号);
                输出预览 += `\n${有效量}.${总群数据[i]?.group_name}(${本次群号})`;
            }
        }
    }
    // ================== 组装输出 - 前置 ==================
    if(有效量 == 0){
        await 发消息(event, [段_引用(event.message_id), 段_文本('遍历全部群聊结果:\n机器人在全部群均无管理员权限\n若有错误判断，请等待缓存刷新！')]);
        return null;
    }
    writeA(`筱筱吖/扩展功能/群发系统/可群发.json`, JSON.stringify(有效群));
    // ================== 组装输出 - 正式 ==================
    let 组装消息 = `共计可执行群聊为 ${有效量} 个`;
    组装消息 += `\n══════════════`;
    组装消息 += 输出预览;
    组装消息 += `\n══════════════`;
    组装消息 += `\n扩展指令:`;
    组装消息 += `\n查看可群发列表`;
    组装消息 += `\n取消可群发目标[群号]`;
    组装消息 += `\n新增可群发目标[群号]`;
    组装消息 += `\n执行群发文本[内容]`;
    组装消息 += `\n执行群发公告[内容]`;
    组装消息 += `\n☆执行群发(跟前两个一样)`;
    // ================== 输出方式 ==================
    if(有效量 >= 15){
        const messages = [合并节点("[新可群发列表]", event.self_id, [段_文本(组装消息)])];
        await 发合并消息(event, messages);
    }else{
        await 发消息(event, [段_引用(event.message_id), 段_文本(`${组装消息}`)]);
    }
    return null;
}


if(message.match(/^(取消|新增)可群发目标([0-9]+)$/)){
    // ================== 授权判断 ==================
    if(!(await requireAuthorized(RC_sq, event))) return null;
    // ================== 最高主人检测 ==================
    if(!(await checkOwner3(event, ctx, false))) return null;
    // ================== 取数据 ==================
    let 原始 = JSON.parse(readA(`筱筱吖/扩展功能/群发系统/可群发.json`) || "[]");
    let 数据 = 原始.map(String);
    let 类型 = message.match(/^(取消|新增)可群发目标([0-9]+)$/)[1];
    let 目标 = message.match(/^(取消|新增)可群发目标([0-9]+)$/)[2];
    let 存在 = 数据.includes(目标);
    // ================== 判断方式 ==================
    if(类型 == "取消"){
        if(!存在){//是取消，但又不存在
            await 发消息(event, [段_引用(event.message_id), 段_文本('好像木有这个群唉～')]);
            return null;
        }else{
            let 新数据 = 数据.filter(item => item !== 目标);
            writeA(`筱筱吖/扩展功能/群发系统/可群发.json`, JSON.stringify(新数据));
            await 发消息(event, [段_引用(event.message_id), 段_文本(`好哒！介就把「${目标}」介个群给去掉！`)]);
            return null;
        }
    }else{
        if(存在){
            await 发消息(event, [段_引用(event.message_id), 段_文本('介个群已经有啦！不信你自己看「查看可群发列表」！')]);
            return null;
        }else{
            数据.push(目标);
            writeA(`筱筱吖/扩展功能/群发系统/可群发.json`, JSON.stringify(数据));
            await 发消息(event, [段_引用(event.message_id), 段_文本(`好哒好哒！这就把「${目标}」介个群给加到列表里面！`)]);
        }
    }
}



if(message.match(/^☆?\s*执行群发(公告|文本)/)){
    // ================== 授权判断 ==================
    if(!(await requireAuthorized(RC_sq, event))) return null;
    // ================== 最高主人检测 ==================
    if(!(await checkOwner3(event, ctx, false))) return null;
    // ================== 取数据 ==================
    let 数据 = JSON.parse(readA(`筱筱吖/扩展功能/群发系统/可群发.json`) || "[]");
    let 总数量 = (数据.length || 0);
    if(总数量 == 0){
        await 发消息(event, [段_引用(event.message_id), 段_文本('好像木有可群发的群聊唉～！')]);
        return null;
    }
    const 群发艾特全体 = /^☆\s*执行群发/.test(message);
    let 类型 = message.match(/^☆?\s*执行群发(公告|文本)/)[1];
    const fullText = giveText(event.message);
    const text = fullText.replace(/^☆?\s*执行群发(?:公告|文本)\s*/, "").trim();
    const 群发成功后尝试纯艾特全体 = async (gidStr, gidNum, 已知身份) => {
        if(!群发艾特全体) return;
        let r = 已知身份;
        if(r === undefined || r === null){
            const dpAt = await BOTAPI(ctx, "get_group_member_info", {group_id: gidNum, user_id: event.self_id});
            r = (RC_group_role[(dpAt?.role || "member")] || 0);
        }
        if(r < 2) return;
        try{
            const resAt = await ctx.actions.call("send_msg", {
                message: [段_艾特("all")],
                message_type: "group",
                group_id: gidStr
            }, ctx.adapterName, ctx.pluginManager.config);
            if(resAt && typeof resAt === "object" && "retcode" in resAt && Number(resAt.retcode) !== 0){
                logger.error(`[执行群发·艾特全体] 群${gidStr} retcode=${resAt.retcode}`);
            }
        }catch(errAt){
            logger.error(`[执行群发·艾特全体] 群${gidStr}:`, errAt);
        }
    };
    const image = giveImages(event.message);
    const image_name = giveImages_name(event.message);
    const image_count = image.length;
    const text_count = text.length;
    if(text_count < 1 && image_count < 1){
        await 发消息(event, [段_引用(event.message_id), 段_文本('请至少带一段文字或一张图片哦～')]);
        return null;
    }
    if(类型 == "公告" && text_count < 1){
        await 发消息(event, [段_引用(event.message_id), 段_文本('群发公告至少要一个字内容哦～')]);
        return null;
    }
    let 图片文件 = ``;
    if(image_count != 0 && image_name[0]){
        let dp0 = await BOTAPI(ctx, "get_image", {"file": image_name[0]});
        图片文件 = dp0?.file || ``;
    }
    let 成功 = 0;
    const 失败 = [];
    const 无管理员 = [];
    let 消息串 = ``;
    if(类型 == "文本"){
        const 段 = [];
        if(text) 段.push(段_文本(text));
        for(let i = 0; i < image.length; i++){
            段.push(段_图片(image[i]));
        }
        消息串 = 段;
    }
    for(let i = 0; i < 总数量; i++){
        const gidRaw = 数据[i];
        const gidNum = typeof gidRaw === "number" ? gidRaw : Number(String(gidRaw).trim());
        const gidStr = String(gidNum);
        if(!gidNum || Number.isNaN(gidNum)){
            失败.push(`${gidRaw}(无效)`);
            continue;
        }
        if(类型 == "文本"){
            try{
                const res = await ctx.actions.call("send_msg", {
                    message: 消息串,
                    message_type: "group",
                    group_id: gidStr
                }, ctx.adapterName, ctx.pluginManager.config);
                if(res && typeof res === "object" && "retcode" in res && Number(res.retcode) !== 0){
                    失败.push(gidStr);
                }else{
                    成功++;
                    await 群发成功后尝试纯艾特全体(gidStr, gidNum);
                }
            }catch(err){
                logger.error(`[执行群发·文本] 群${gidStr}:`, err);
                失败.push(gidStr);
            }
            continue;
        }
        let dp188 = await BOTAPI(ctx, "get_group_member_info", {group_id: gidNum, user_id: event.self_id});
        let Robot身份 = (RC_group_role[(dp188?.role || "member")] || 0);
        if(Robot身份 < 2){
            无管理员.push(gidStr);
            continue;
        }
        let 是否置顶 = 0;
        let 是否确认 = 0;
        let 是否弹窗 = 0;
        let 引导改名 = 0;
        let 参数 = {"group_id": gidNum, "content": text, "image": 图片文件, "pinned": 是否置顶, "type": 0, "confirm_required": 是否确认, "is_show_edit_card": 引导改名, "tip_window_type": 是否弹窗};
        try{
            const res = await BOTAPI(ctx, "_send_group_notice", 参数);
            if(res && typeof res === "object" && "retcode" in res && Number(res.retcode) !== 0){
                失败.push(gidStr);
            }else{
                成功++;
                await 群发成功后尝试纯艾特全体(gidStr, gidNum, Robot身份);
            }
        }catch(err){
            logger.error(`[执行群发·公告] 群${gidStr}:`, err);
            失败.push(gidStr);
        }
    }
    let 汇报 = `群发「${类型}」完成：成功 ${成功}/${总数量}`;
    if(无管理员.length) 汇报 += `\n无管理员权限跳过：${无管理员.join("、")}`;
    if(失败.length) 汇报 += `\n发送失败：${失败.join("、")}`;
    await 发消息(event, [段_引用(event.message_id), 段_文本(`${汇报}`)]);
    return null;
}






// ================== 测试嵌套转发 ==================
if(message.match(/^测试嵌套转发$/)){
    // ================== 主人检测 ==================
    if(!(await checkOwner2(event, ctx))) return null;
    // ================== 构建嵌套转发消息 ==================
    const messages = [
        嵌套合并节点("外层消息1", 123456, [
            合并节点("内层消息1-1", 654321, [段_文本("这是内层的第一条消息")]),
            嵌套合并节点("内层消息1-2", 789012, [
                合并节点("更深层消息1-2-1", 111111, [段_文本("这是更深层的消息")]),
                合并节点("更深层消息1-2-2", 222222, [段_文本("这是更深层的第二条消息")]),
            ]),
        ], { time: 1609459200 }, [段_文本("这是外层的第一条消息")]),
        合并节点("外层消息2", 333333, [段_文本("这是外层的第二条消息")], { time: 1609459200 }),
    ];
    
    // ================== 发送嵌套转发 ==================
    await 发合并消息(event, messages);
    await 发消息(event, [段_引用(event.message_id), 段_文本('嵌套转发测试已发送！')]);
    return null;
}



// ================== 钓鱼玩法 ==================
if(message.match(/^钓鱼(一次|五次|十次|二十次|五十次|一百次|)$/) && 娱乐功能('钓鱼')){
    if(!(await requireAuthorized(RC_sq, event))) return null;
    // ================== 取次数 ==================
    let 次数 = 1;
    const mub = message.match(/^钓鱼(一次|五次|十次|二十次|五十次|一百次|)$/)[1];
    if(mub){
        if(mub == "五次"){
            次数 = 5;
        }
        if(mub == "十次"){
            次数 = 10;
        }
        if(mub == "二十次"){
            次数 = 20;
        }
        if(mub == "五十次"){
            次数 =50;
        }
        if(mub == "一百次"){
            次数 = 100;
        }
    }
    // ================== 数量判断 ==================
    let 诱饵数 = Number(readB("筱筱吖/娱乐系统/钓鱼玩法/道具/诱饵.json", event.user_id, 0));
    if(诱饵数 == 0 || 诱饵数 < 次数){
        await 发消息(event, [段_引用(event.message_id), 段_文本('你的诱饵不足！可以通过「签到」获得哦～！')]);
        return null;
    }
    writeB("筱筱吖/娱乐系统/钓鱼玩法/道具/诱饵.json", event.user_id, 诱饵数 - 次数);
    // ----- 定义普通鱼池（价格 ≤ 200）-----
    const 普通鱼池 = JSON.parse(readA("默认资源/钓鱼数据/鱼-1.json") || "{}");
    // ----- 定义高级鱼池（价格 > 200）-----
    const 高级鱼池 = JSON.parse(readA("默认资源/钓鱼数据/鱼-2.json") || "{}");
    
    // ================== 构建可抽取的池子（数组格式） ==================
    // 将普通鱼池对象转换为 [鱼名, 价格对象] 的数组
    let 普通池 = Object.entries(普通鱼池);
    let 高级池 = Object.entries(高级鱼池);
    let 混合池 = [...普通池, ...高级池];

    if (混合池.length === 0) {
        writeB("筱筱吖/娱乐系统/钓鱼玩法/道具/诱饵.json", event.user_id, 诱饵数);
        await 发消息(event, [
            段_引用(event.message_id),
            段_文本(
                '鱼池数据为空：读不到插件目录 默认资源/钓鱼数据/鱼-1.json、鱼-2.json（或内容不是「鱼名→{价格,重量}」对象）。',
            ),
        ]);
        return null;
    }
    
    // ================== 获取本次数据 ==================
    let 累计 = 0;
    let msg = `🎣 结果如下:\n══════════════`;
    for(let i = 0; i < 次数; i++){
        // ================== 随机值 - 鱼池 ==================
        let 本次抽取 = 普通池;
        let 鱼池类型 = "普通";
        let 幸运值 = rand(0, 1000);
        if(幸运值 > 501 && 幸运值 < 521){ // 满足这个条件直接飞升到高级池
            鱼池类型 = "高级";
            本次抽取 = 高级池;
        }
        if(幸运值 > 666 && 幸运值 < 700){
            鱼池类型 = "混合";
            本次抽取 = 混合池;
        }
        // 某一档为空时用混合池兜底，避免 rand(0,-1) 与 undefined[0]
        if (本次抽取.length === 0) {
            本次抽取 = 混合池;
            鱼池类型 = "混合";
        }
        //logger.error(鱼池类型);//调试
        let 鱼数量 = 本次抽取.length;
        if (鱼数量 === 0) continue;
        // ================== 正式抽取 ==================
        let 本次数据 = 本次抽取[rand(0, 鱼数量 - 1)];
        if (!本次数据 || !本次数据[1] || typeof 本次数据[1] !== "object") {
            logger?.warn?.("[钓鱼] 跳过无效鱼池项", 鱼池类型, 本次数据);
            continue;
        }
        let 首次鱼名 = 本次数据[0];
        let 首次价格 = 本次数据[1].价格;
        let 首次重量 = 本次数据[1].重量;
        if (首次价格 == null || 首次重量 == null) {
            logger?.warn?.("[钓鱼] 鱼数据缺少价格或重量", 首次鱼名);
            continue;
        }
        // ================== 计算重量 ==================
        let 最高重量 = Number(readB("筱筱吖/娱乐系统/钓鱼玩法/全服数据/最高重量.json", 首次鱼名, 首次重量) || "0.5");
        let 幸运值2 = rand(1, 100);
        let 鱼の重量 = randB(0.02, 最高重量);
        let 是否突破 = false;
        if(幸运值2 > 80 && 幸运值2 < 85){//允许突破记录
            let 浮度 = Math.floor(最高重量 + randB(0.5, 2));
            鱼の重量 = randB(最高重量, 浮度);
            是否突破 = true;
            writeB("筱筱吖/娱乐系统/钓鱼玩法/全服数据/最高重量.json", 首次鱼名, 鱼の重量);
        }
        // ================== 计算最终价格 ==================
        let 最终价格 = Math.round((鱼の重量 / 首次重量) * 首次价格);
        // ================== 组装消息输出 ==================
        msg += `\n🐟 钓到 :【${首次鱼名}】(${鱼の重量}kg)`;
        if(是否突破){//插入突破提升
            msg += `🔥新记录`;
        }
        msg += `\n✨ 价格 ：${最终价格} 归笺`;
        //msg += `\n调试:幸运${幸运值2}、最高${最高重量}、`;
        msg += `\n`;
        累计 += 最终价格;
        // ================== 写入数据 ==================
        let 数量 = Number(readB(`筱筱吖/娱乐系统/钓鱼玩法/用户数据/${event.user_id}.json`, `${首次鱼名}(${鱼の重量}kg)`, 0));
        writeB(`筱筱吖/娱乐系统/钓鱼玩法/用户数据/${event.user_id}.json`, `${首次鱼名}(${鱼の重量}kg)`, 数量 + 1);
    }
    // ================== 输出结尾 ==================
    msg += `══════════════`;
    msg += `\n【总结】`;
    msg += `\n获得 ${累计} 归笺`;
    msg += `\n发送 我的鱼获 可查询`;
    // ================== 输出方式 ==================
    if(次数 > 10){
        const messages = [
            合并节点("[🎣本次钓鱼结果]", event.self_id, [段_文本(msg)])
        ];
        await 发合并消息(event, messages);
    }else{
        await 发消息(event, [段_引用(event.message_id), 段_文本(msg)]);
    }
    return null;
}

// ================== 查询鱼获 ==================
if((message === "我的鱼获" || message === "我的鱼篓") && 娱乐功能('钓鱼')){
    if(!(await requireAuthorized(RC_sq, event))) return null;
    
    // ================== 加载鱼池数据 ==================
    let 普通鱼池 = {};
    let 高级鱼池 = {};
    try {
        const 普通鱼池数据 = readA("默认资源/钓鱼数据/鱼-1.json");
        if (普通鱼池数据) {
            普通鱼池 = JSON.parse(普通鱼池数据);
        }
    } catch (error) {
        logger.error("解析普通鱼池数据失败:", error);
    }
    try {
        const 高级鱼池数据 = readA("默认资源/钓鱼数据/鱼-2.json");
        if (高级鱼池数据) {
            高级鱼池 = JSON.parse(高级鱼池数据);
        }
    } catch (error) {
        logger.error("解析高级鱼池数据失败:", error);
    }
    
    // ================== 读取用户数据 ==================
    const 用户数据路径 = `筱筱吖/娱乐系统/钓鱼玩法/用户数据/${event.user_id}.json`;
    let 用户数据 = {};
    try {
        const 数据内容 = readA(用户数据路径);
        if (数据内容) {
            用户数据 = JSON.parse(数据内容);
        }
    } catch (error) {
        logger.error("解析用户鱼获数据失败:", error);
    }
    
    // ================== 检查是否有鱼获 ==================
    if (Object.keys(用户数据).length === 0) {
        await 发消息(event, [段_引用(event.message_id), 段_文本('🎣 你还没有任何鱼获，快去钓鱼吧！')]);
        return null;
    }
    
    // ================== 统计鱼获 ==================
    let 总数量 = 0;
    let 总价格 = 0;
    let 鱼获列表 = [];
    
    for (const [鱼信息, 数量] of Object.entries(用户数据)) {
        // 解析鱼的信息：鱼名(重量kg)
        const 匹配 = 鱼信息.match(/^(.*)\((.*)kg\)$/);
        if (匹配) {
            const 鱼名 = 匹配[1];
            const 重量 = parseFloat(匹配[2]);
            
            // 计算单条鱼的价格
            let 单条价格 = 0;
            // 从鱼池数据中查找价格
            if (普通鱼池 && 普通鱼池[鱼名]) {
                单条价格 = Math.round((重量 / 普通鱼池[鱼名].重量) * 普通鱼池[鱼名].价格);
            } else if (高级鱼池 && 高级鱼池[鱼名]) {
                单条价格 = Math.round((重量 / 高级鱼池[鱼名].重量) * 高级鱼池[鱼名].价格);
            }
            
            总数量 += 数量;
            总价格 += 单条价格 * 数量;
            
            鱼获列表.push({
                鱼名,
                重量,
                数量,
                单条价格,
                总价格: 单条价格 * 数量
            });
        }
    }
    
    // ================== 按重量降序排序 ==================
    鱼获列表.sort((a, b) => b.重量 - a.重量);

    const 鱼种数 = 鱼获列表.length;
    const 类别数 = new Set(鱼获列表.map((鱼) => 鱼.鱼名)).size;
    const renderItems = 鱼获列表.map((鱼) => ({
        name: 鱼.鱼名,
        weight: 鱼.重量,
        count: 鱼.数量,
        unitPrice: 鱼.单条价格,
        totalPrice: 鱼.总价格,
        tier: (高级鱼池 && 高级鱼池[鱼.鱼名]) ? 'premium' : 'normal',
    }));

    const 图片渲染开 = isImageRenderEnabled(readB);
    const 用Sharp = 图片渲染开 && getRenderMode(readB) === 'sharp';
    const 展示列表 = 鱼获列表.slice(0, FISH_BASKET_MAX_ROWS);
    const 展示Items = renderItems.slice(0, FISH_BASKET_MAX_ROWS);
    const 截断说明 = 鱼种数 > FISH_BASKET_MAX_ROWS
      ? `\n⚠️ 规格共 ${鱼种数} 条，仅展示前 ${FISH_BASKET_MAX_ROWS} 条（最多 ${FISH_BASKET_MAX_PAGES} 张图）`
      : '';

    const buildBasketTextPage = (页内列表, 页码, 总页数, 开始索引) => {
        let 详细信息 = `详细鱼获 (第 ${页码}/${总页数} 页):\n══════════════\n`;
        页内列表.forEach((鱼, 索引) => {
            const 全局索引 = 开始索引 + 索引;
            详细信息 += `${全局索引 + 1}. ${鱼.鱼名}(${鱼.重量}kg) × ${鱼.数量} = ${鱼.总价格} 归笺\n`;
            if ((索引 + 1) % 15 === 0 && 索引 !== 页内列表.length - 1) {
                详细信息 += `------------\n`;
            }
        });
        详细信息 += `══════════════`;
        详细信息 += `\n出售例子:`;
        详细信息 += `\n出售 全部鱼`;
        详细信息 += `\n出售 海龙(999kg)`;
        详细信息 += `\n出售 海龙(999kg) 3`;
        return 详细信息;
    };

    if (用Sharp) {
        const 是群聊 = event.message_type === 'group';
        if (是群聊) {
            await reactFakeChatCommandMessage(ctx, event.message_id, FAKE_CHAT_EMOJI_REACT_PARSE_OK, BOTAPI);
        } else {
            await 发消息(event, [段_引用(event.message_id), 段_文本('正在生成鱼篓图片，请稍候…')]);
        }

        const 总页数 = Math.max(1, Math.ceil(展示Items.length / FISH_BASKET_PER_PAGE));
        const fishBasketBgLocal =
          resolveEffectiveBgAbs('fish-basket') || resolveDefaultResourceImageAbs('运势13.png') || '';
        const nodes = [];
        const 临时图路径列表 = [];
        const 临时图根 = path.join(mkGetTempImageDir(), '鱼篓');
        try {
            fs.mkdirSync(临时图根, { recursive: true });
        } catch (e) {
            logger?.error?.(`[我的鱼篓] 创建临时图片目录失败 路径=${临时图根}`, e);
        }
        const 批次戳 = `${event.user_id}_${Date.now()}`;
        nodes.push(合并节点("鱼获统计", event.self_id, [段_文本(
            `🎣 鱼获统计\n══════════════\n总数量: ${总数量} 条\n总价值: ${moneyA(总价格)}\n规格记录: ${鱼种数} 条\n鱼种类: ${类别数} 类${截断说明}\n══════════════`,
        )]));

        try {
            for (let 页码 = 1; 页码 <= 总页数; 页码++) {
                const 开始索引 = (页码 - 1) * FISH_BASKET_PER_PAGE;
                const pageItems = 展示Items.slice(开始索引, 开始索引 + FISH_BASKET_PER_PAGE);
                const pageList = 展示列表.slice(开始索引, 开始索引 + FISH_BASKET_PER_PAGE);
                const imageData = await renderFishBasketWithSharp({
                    userName: String(event.sender?.nickname || '旅人'),
                    userId: event.user_id,
                    time: timeA('y-m-d H:i:s', Math.floor(Date.now() / 1000)),
                    totalCount: 总数量,
                    totalValue: moneyA(总价格),
                    recordCount: 鱼种数,
                    categoryCount: 类别数,
                    items: pageItems,
                    pageIndex: 页码,
                    pageTotal: 总页数,
                    rankOffset: 开始索引,
                    pluginDir: PLUGIN_DIR,
                    dataPath: getDataPath(),
                    bgLocalPath: fishBasketBgLocal,
                }, logger);

                if (imageData) {
                    const 本地路径 = path.join(临时图根, `${批次戳}_${String(页码).padStart(2, '0')}.png`);
                    try {
                        fs.writeFileSync(本地路径, Buffer.from(String(imageData), 'base64'));
                        临时图路径列表.push(本地路径);
                        nodes.push(合并图片节点(`鱼篓 ${页码}/${总页数}`, event.self_id, 本地路径));
                    } catch (e) {
                        logger.warn(`[我的鱼篓] 第 ${页码}/${总页数} 页落盘失败，该页改用文字`, e?.message || e);
                        nodes.push(合并节点("详细鱼获", event.self_id, [
                            段_文本(buildBasketTextPage(pageList, 页码, 总页数, 开始索引)),
                        ]));
                    }
                } else {
                    logger.warn(`[我的鱼篓] 第 ${页码}/${总页数} 页 Sharp 失败，该页改用文字`);
                    nodes.push(合并节点("详细鱼获", event.self_id, [
                        段_文本(buildBasketTextPage(pageList, 页码, 总页数, 开始索引)),
                    ]));
                }
            }

            await 发合并消息(event, nodes, 合并预览(
                '我的鱼篓',
                `共 ${总数量} 条 · ${moneyA(总价格)}`,
                '[鱼篓]',
                [`规格 ${Math.min(鱼种数, FISH_BASKET_MAX_ROWS)} 条 · ${总页数} 张图`],
            ));
            if (是群聊) {
                await reactFakeChatCommandMessage(ctx, event.message_id, FAKE_CHAT_EMOJI_REACT_SEND_OK, BOTAPI);
            } else {
                await 发消息(event, [段_引用(event.message_id), 段_文本('鱼篓图片已生成 ✓')]);
            }
        } finally {
            // 合并转发可能异步读盘，延迟清理临时 PNG
            const toClean = 临时图路径列表.slice();
            setTimeout(() => mkCleanupTempImageFiles(toClean), 60_000);
        }
        return null;
    }

    // ================== 构建消息（文字版 / 关图片渲染） ==================
    const messages = [];

    messages.push(合并节点("鱼获统计", event.self_id, [段_文本(
        `🎣 鱼获统计\n══════════════\n总数量: ${总数量} 条\n总价值: ${moneyA(总价格)}${截断说明}\n══════════════`,
    )]));

    const 每页数量 = FISH_BASKET_PER_PAGE;
    const 总页数 = Math.ceil(展示列表.length / 每页数量) || 1;

    for (let 页码 = 0; 页码 < 总页数; 页码++) {
        const 开始索引 = 页码 * 每页数量;
        const 当前页鱼获 = 展示列表.slice(开始索引, 开始索引 + 每页数量);
        messages.push(合并节点("详细鱼获", event.self_id, [
            段_文本(buildBasketTextPage(当前页鱼获, 页码 + 1, 总页数, 开始索引)),
        ]));
    }

    await 发合并消息(event, messages);
    return null;
}



// ================== 出售鱼获 ==================
if(message.match(/^出售\s+(全部鱼|[^\(]+\([0-9]+(\.[0-9]+)?kg\)(\s+\d+)?)$/) && 娱乐功能('钓鱼')){
    if(!(await requireAuthorized(RC_sq, event))) return null;
    
    // ================== 加载鱼池数据 ==================
    let 普通鱼池 = {};
    let 高级鱼池 = {};
    try {
        const 普通鱼池数据 = readA("默认资源/钓鱼数据/鱼-1.json");
        if (普通鱼池数据) {
            普通鱼池 = JSON.parse(普通鱼池数据);
        }
    } catch (error) {
        logger.error("解析普通鱼池数据失败:", error);
    }
    try {
        const 高级鱼池数据 = readA("默认资源/钓鱼数据/鱼-2.json");
        if (高级鱼池数据) {
            高级鱼池 = JSON.parse(高级鱼池数据);
        }
    } catch (error) {
        logger.error("解析高级鱼池数据失败:", error);
    }
    
    // ================== 解析指令 ==================
    const 指令内容 = message.match(/^出售\s+(.+)$/)[1];
    
    // ================== 处理"出售 全部鱼"指令 ==================
    if (指令内容 === "全部鱼") {
        // 读取用户数据
        const 用户数据路径 = `筱筱吖/娱乐系统/钓鱼玩法/用户数据/${event.user_id}.json`;
        let 用户数据 = {};
        try {
            const 数据内容 = readA(用户数据路径);
            if (数据内容) {
                用户数据 = JSON.parse(数据内容);
            }
        } catch (error) {
            logger.error("解析用户鱼获数据失败:", error);
        }
        
        // 检查是否有鱼获
        if (Object.keys(用户数据).length === 0) {
            await 发消息(event, [段_引用(event.message_id), 段_文本('🎣 你还没有任何鱼获，无法出售！')]);
            return null;
        }
        
        let 总数量 = 0;
        let 总收入 = 0;
        let 出售详情 = [];
        
        // 遍历所有鱼获并计算价格
        for (const [鱼信息, 数量] of Object.entries(用户数据)) {
            if (!数量 || 数量 <= 0) continue;
            
            // 解析鱼的信息：鱼名(重量kg)
            const 匹配 = 鱼信息.match(/^(.*)\((.*)kg\)$/);
            if (匹配) {
                const 鱼名 = 匹配[1];
                const 重量 = parseFloat(匹配[2]);
                
                // 计算单条鱼的价格
                let 单条价格 = 0;
                if (普通鱼池 && 普通鱼池[鱼名]) {
                    单条价格 = Math.round((重量 / 普通鱼池[鱼名].重量) * 普通鱼池[鱼名].价格);
                } else if (高级鱼池 && 高级鱼池[鱼名]) {
                    单条价格 = Math.round((重量 / 高级鱼池[鱼名].重量) * 高级鱼池[鱼名].价格);
                } else {
                    // 找不到价格信息，跳过
                    continue;
                }
                
                const 小计 = 单条价格 * 数量;
                总数量 += 数量;
                总收入 += 小计;
                
                出售详情.push({
                    鱼名,
                    重量,
                    数量,
                    单条价格,
                    小计
                });
            }
        }
        
        if (总数量 === 0) {
            await 发消息(event, [段_引用(event.message_id), 段_文本('🎣 没有可出售的鱼获！')]);
            return null;
        }
        
        // 清空用户数据
        writeA(用户数据路径, "{}");
        
        // 输出结果
        let msg = `🎣 出售全部鱼获成功！\n══════════════\n`;
        msg += `出售数量: ${总数量} 条\n`;
        msg += `获得收入: ${总收入} 归笺\n`;
        msg += `══════════════`;
        let 归笺 = Number(readB("筱筱吖/娱乐系统/游戏数据/归笺.json", event.user_id, 0));
        writeB("筱筱吖/娱乐系统/游戏数据/归笺.json", event.user_id, 归笺 + 总收入);
        
        await 发消息(event, [段_引用(event.message_id), 段_文本(msg)]);
        return null;
    }
    
    // ================== 处理指定鱼的出售指令 ==================
    // 匹配格式：出售 鱼名(重量kg) 数量 或 出售 鱼名(重量kg)
    const 指定鱼匹配 = 指令内容.match(/^([^\(]+\([0-9]+(\.[0-9]+)?kg\))\s*(\d*)$/);
    
    if (指定鱼匹配) {
        const 鱼信息 = 指定鱼匹配[1].trim();
        const 指定数量 = 指定鱼匹配[3] ? parseInt(指定鱼匹配[3]) : null;
        
        // 验证鱼信息格式
        const 鱼信息匹配 = 鱼信息.match(/^([^\(]+)\(([0-9]+(\.[0-9]+)?)kg\)$/);
        if (!鱼信息匹配) {
            await 发消息(event, [段_引用(event.message_id), 段_文本('🎣 鱼的信息格式不正确，请使用：鱼名(重量kg)')]);
            return null;
        }
        
        const 鱼名 = 鱼信息匹配[1];
        const 重量 = parseFloat(鱼信息匹配[2]);
        
        // 读取用户数据
        const 用户数据路径 = `筱筱吖/娱乐系统/钓鱼玩法/用户数据/${event.user_id}.json`;
        let 用户数据 = {};
        try {
            const 数据内容 = readA(用户数据路径);
            if (数据内容) {
                用户数据 = JSON.parse(数据内容);
            }
        } catch (error) {
            logger.error("解析用户鱼获数据失败:", error);
        }
        
        // 检查是否有这种鱼
        const 拥有数量 = 用户数据[鱼信息];
        
        if (拥有数量 === undefined || 拥有数量 === null || 拥有数量 === 0) {
            // 没有这种鱼，不输出任何内容
            return null;
        }
        
        // 计算单条鱼的价格
        let 单条价格 = 0;
        if (普通鱼池 && 普通鱼池[鱼名]) {
            单条价格 = Math.round((重量 / 普通鱼池[鱼名].重量) * 普通鱼池[鱼名].价格);
        } else if (高级鱼池 && 高级鱼池[鱼名]) {
            单条价格 = Math.round((重量 / 高级鱼池[鱼名].重量) * 高级鱼池[鱼名].价格);
        } else {
            await 发消息(event, [段_引用(event.message_id), 段_文本(`🎣 错误：无法找到【${鱼名}】的价格信息！`)]);
            return null;
        }
        
        // 判断出售数量
        let 出售数量;
        if (指定数量 === null) {
            // 没有指定数量，出售全部
            出售数量 = 拥有数量;
        } else {
            // 指定了数量
            if (指定数量 > 拥有数量) {
                await 发消息(event, [段_引用(event.message_id), 段_文本(`🎣 数量不足！你只有 ${拥有数量} 条【${鱼信息}】，无法出售 ${指定数量} 条！`)]);
                return null;
            }
            出售数量 = 指定数量;
        }
        
        // 计算收入
        const 总收入 = 单条价格 * 出售数量;
        const 剩余数量 = 拥有数量 - 出售数量;
        
        // 更新用户数据
        if (剩余数量 > 0) {
            writeB(用户数据路径, 鱼信息, 剩余数量);
        } else {
            // 数量为0，删除这个键
            deleteKey(用户数据路径, 鱼信息);
        }
        
        // 输出结果
        let msg = `🎣 出售成功！\n══════════════\n`;
        msg += `🌐鱼种: ${鱼信息}\n`;
        msg += `💠出售数量: ${出售数量} 条\n`;
        msg += `💰单价: ${单条价格} 归笺\n`;
        msg += `💹获得收入: ${总收入} 归笺\n`;
        if (剩余数量 > 0) {
            msg += `🛑剩余数量: ${剩余数量} 条\n`;
        }
        msg += `══════════════`;
        let 归笺 = Number(readB("筱筱吖/娱乐系统/游戏数据/归笺.json", event.user_id, 0));
        writeB("筱筱吖/娱乐系统/游戏数据/归笺.json", event.user_id, 归笺 + 总收入);
        
        await 发消息(event, [段_引用(event.message_id), 段_文本(msg)]);
        return null;
    }
    
    // 指令格式不正确
    await 发消息(event, [段_引用(event.message_id), 段_文本('🎣 指令格式错误！\n使用方式:\n出售 鱼名(重量kg) 数量\n出售 鱼名(重量kg)\n出售 全部鱼')]);
    return null;
}





// ================== 发卡系统（实现见 ./auth/card-shop.ts） ==================
const cardShopResult = await handleCardShopCommands(message, event, ctx, RC_sq, {
    readB,
    writeB,
    readA,
    writeA,
    rand,
    checkOwner3,
    getDataPath,
    发邮箱,
});
if (cardShopResult === 'halt') {
    return null;
}


if(message.match(/^(添加|取消|更改)[锁索]名([\s\S]*)$/) || message.match(/^(清空|获取)[锁索]名列表$/)){
    // ================== 来源 ==================
    if(event.message_type != "group"){
        return null;
    }
    // ================== 授权判断 ==================
    if(!(await requireAuthorized(RC_sq, event))) return null;
    // ================== 事件开关 ==================
    if(!mkLockNameEventOn(event.group_id)){
        return null;
    }
    // ================== 最高主人检测（兼容管理模式） ==================
    const crr_开关 = readB(`筱筱吖/事件系统/${event.group_id}.json`, "管理模式", "关闭") === "开启";
    if(!(await checkOwner3(event, ctx, crr_开关))) return null;
    // ================== 列表类指令 ==================
    const 列表指令 = message.match(/^(清空|获取)[锁索]名列表$/);
    if(列表指令){
        const 名单 = mkLockNameLoad(event.group_id);
        const 名单QQ = Object.keys(名单);
        if(列表指令[1] == "清空"){
            mkLockNameSave(event.group_id, {});
            await 发消息(event, [段_引用(event.message_id), 段_文本(`好叭～本群锁名列表已清空～共移除【${名单QQ.length}】人`)]);
            return null;
        }
        let 组装消息 = `本群锁名列表`;
        组装消息 += `\n══════════════`;
        组装消息 += `\n名单人数：${名单QQ.length}`;
        for(let i = 0; i < 名单QQ.length; i++){
            组装消息 += `\n${i + 1}. ${名单QQ[i]} → ${名单[名单QQ[i]]}`;
        }
        组装消息 += `\n══════════════`;
        await 发消息(event, [段_引用(event.message_id), 段_文本(组装消息)]);
        return null;
    }
    // ================== 取值 ==================
    const 锁名指令 = message.match(/^(添加|取消|更改)[锁索]名([\s\S]*)$/);
    const 操作 = 锁名指令[1];
    const 尾部 = String(锁名指令[2] ?? "").trim();
    // ================== 目标提取（支持艾特多人；取消时也支持直接写QQ号） ==================
    let 目标列表 = giveATUnique(event.message).map(String);
    if(操作 == "取消"){
        const QQ文本 = 尾部.match(/\d{5,}/g) || [];
        for(const qq of QQ文本){
            if(!目标列表.includes(qq)) 目标列表.push(qq);
        }
    }
    if(!目标列表.length){
        const 提示 = 操作 == "取消" ? `格式：取消锁名@某人（也可直接写QQ号）` : `格式：${操作}锁名@某人 名字内容`;
        await 发消息(event, [段_引用(event.message_id), 段_文本(提示)]);
        return null;
    }
    // ================== 锁名内容校验 ==================
    let 名字 = "";
    if(操作 != "取消"){
        名字 = 尾部;
        let 字数 = (名字.length || 0);
        if(字数 == 0 || 字数 >= 19){
            await 发消息(event, [段_引用(event.message_id), 段_文本('锁名内容请控制在1 - 18个字之间！')]);
            return null;
        }
        // ================== 兼容违禁词系统：命中即取消本次命令 ==================
        if(mkTextHitsForbiddenWord(event.group_id, 名字)){
            await 发消息(event, [段_引用(event.message_id), 段_文本('这个名字命中了本群违禁词，不给设置哦～本次命令已取消！')]);
            return null;
        }
    }
    // ================== 机器人权限（2级即可改名片） ==================
    const 机器人角色 = await mkGetMemberRole(ctx, event.group_id, event.self_id);
    const 可改名片 = (RC_group_role[机器人角色] || 0) >= 2;
    // ================== 逐个处理 ==================
    let 名单 = mkLockNameLoad(event.group_id);
    let 组装消息 = ``;
    let 有效 = 0;
    for(let i = 0; i < 目标列表.length; i++){
        const qq = String(目标列表[i]);
        const 序号 = i + 1;
        // ================== 取消锁名 ==================
        if(操作 == "取消"){
            if(!名单[qq]){
                组装消息 += `\n${序号}.【${qq}】❌本就不在名单`;
                continue;
            }
            delete 名单[qq];
            有效++;
            组装消息 += `\n${序号}.【${qq}】✅已解除锁名`;
            continue;
        }
        // ================== 添加 / 更改（都是写入，不在名单则自动添加） ==================
        const 已存在 = !!名单[qq];
        名单[qq] = 名字;
        有效++;
        let 本次结果 = 已存在 ? `✅已更新锁名` : `✅已加入锁名`;
        if(可改名片){
            try{
                let 参数 = {"group_id": event.group_id, "user_id": qq, "card": 名字};
                await BOTAPI(ctx, "set_group_card", 参数);
                本次结果 += `，群名片已改`;
            } catch (_e) {
                本次结果 += `，但群名片没改成功`;
            }
        }else{
            本次结果 += `，但窝没有管理权限改不了名片`;
        }
        组装消息 += `\n${序号}.【${qq}】${本次结果}`;
    }
    mkLockNameSave(event.group_id, 名单);
    let 标题 = 操作 == "取消" ? `锁名解除完成` : (操作 == "添加" ? `锁名添加完成` : `锁名更改完成`);
    let 头部 = `${标题}～有效【${有效}】人`;
    if(操作 != "取消"){
        头部 += `\n锁定名称：${名字}`;
    }
    await 发消息(event, [段_引用(event.message_id), 段_文本(`${头部}\n══════════════${组装消息}`)]);
    return null;
}


if(message.match(/^设置马甲内容([\s\S]*)/)){
    // ================== 授权判断 ==================
    if(!(await requireAuthorized(RC_sq, event))) return null;
    // ================== 最高主人检测 ==================
    let crr_开关 = false;
    if(event.message_type == "group"){
        let rrrrv = readB(`筱筱吖/事件系统/${event.group_id}.json`, "管理模式", "关闭");
        if (rrrrv == "开启"){
            crr_开关 = true;
        }
    }
    if(!(await checkOwner3(event, ctx, crr_开关))) return null;
    if(!event.group_id) return null;
    // ================== 取值 ==================
    let 内容 = message.match(/^设置马甲内容([\s\S]*)/)[1];
        let 字数 = (内容.length || 0);
        if(字数 == 0 || 字数 >= 19){
            await 发消息(event, [段_引用(event.message_id), 段_文本('请将内容控制在1 - 18个字之间！')]);
            return null;
        }
        // ================== 取已设置的原值 ==================
        let 原文 = (readA(`筱筱吖/群管系统/马甲系统/${event.group_id}.json`) || "天宫☆");
        if(原文 == 内容){
            await 发消息(event, [段_引用(event.message_id), 段_文本('与原来的一样啦！不可以重复设置哦～')]);
            return null;
        }
        // ================== 正式写入 ==================
        writeA(`筱筱吖/群管系统/马甲系统/${event.group_id}.json`, 内容);
        await 发消息(event, [段_引用(event.message_id), 段_文本(`已将本群的马甲前缀改成「${内容}」啦！`)]);
    return null;
}


if(message.match(/^全员马甲([\s\S]*)/)){
    // ================== 授权判断 ==================
    if(!(await requireAuthorized(RC_sq, event))) return null;
    // ================== 最高主人检测 ==================
    let crr_开关 = false;
    if(event.message_type == "group"){
        let rrrrv = readB(`筱筱吖/事件系统/${event.group_id}.json`, "管理模式", "关闭");
        if (rrrrv == "开启"){
            crr_开关 = true;
        }
    }
    if(!(await checkOwner3(event, ctx, crr_开关))) return null;
    if(!event.group_id) return null;
    let 参数188 = {group_id : event.group_id,user_id : event.self_id};
        let dp188 = await BOTAPI(ctx, "get_group_member_info", 参数188);
        let Robot身份 = (RC_group_role[(dp188?.role || "member")] || 0);
        if(Robot身份 < 2){
            await 发消息(event, [段_引用(event.message_id), 段_文本('窝没有权限改名唉～！')]);
            return null;
        }
        // ================== 取值 ==================
        let 内容 = message.match(/^全员马甲([\s\S]*)/)[1];
        let 字数 = (内容.length || 0);
        if(字数 == 0 || 字数 >= 19){
            await 发消息(event, [段_引用(event.message_id), 段_文本('请将内容控制在1 - 18个字之间！')]);
            return null;
        }
        // ================== 访问接口 ==================
        let 参数 = {group_id: event.group_id};
        let dp = await BOTAPI(ctx, "get_group_member_list", 参数);
        // ================== 循环前置 ==================
        let 总人数 = Object.keys(dp).length;
        let 是否冷却 = false;
        if(总人数 == 0){
            //什么群tm0个人
            await 发消息(event, [段_引用(event.message_id), 段_文本('获取群聊成员失败！1')]);
            return null;
        }
        let 输出前置 = `正在执行改名，切勿把机器人的权限给下了！！！`;
        if(总人数 >= 10){
            是否冷却 = true;
            let 秒数 = 总人数;
            输出前置 += `\n由于本群人数已达10人，将采取冷却措施`;
            输出前置 += `\n预计在${timeA("y-m-d H:i:s", Math.floor((Date.now() / 1000) + 秒数))}执行完毕`;
            await 发消息(event, [段_引用(event.message_id), 段_文本(`${输出前置}`)]);
        }
        // ================== 开始改名 ==================
        let 有效 = ``;
        let 无效 = ``;
        let 跳过 = ``;
        let 有效次数 = 0;
        let 跳过次数 = 0;
        let 无效次数 = 0;
        let 本轮 = 0;
        // 马甲系统 + 进阶检测 同时开启时：昵称含违禁词改用 QQ 号，QQ 号也含违禁词则用 -
        const 马甲事件开 = readB(`筱筱吖/事件系统/${event.group_id}.json`, "马甲系统", "关闭") == "开启";
        const 进阶事件开 = readB(`筱筱吖/事件系统/${event.group_id}.json`, "进阶检测", "关闭") == "开启";
        const 马甲进阶 = 马甲事件开 && 进阶事件开;
        // 免死金牌成员豁免违禁词兜底（名单成员 / 开启管理员免死时的本群管理员）
        const 免死事件开 = mkPardonEventOn(event.group_id);
        const 免死名单 = 免死事件开 ? mkPardonLoad(event.group_id) : [];
        const 管理员免死 = 免死事件开 && mkPardonAdminExemptOn(event.group_id);
        // 锁名系统优先：名单内成员不参与马甲改名
        const 锁名名单 = mkLockNameEventOn(event.group_id) ? mkLockNameLoad(event.group_id) : {};
        for(let i = 0; i < 总人数; i++){
            let 是否人机 = dp[i].is_robot;
            let 本次QQ = dp[i].user_id;
            let 原名 = dp[i].nickname;
            let 现名 = dp[i].card;
            let 需求 = mkMajiaBuildCard(event.group_id, 内容, 原名, 本次QQ, 马甲进阶 && !(免死名单.includes(String(本次QQ ?? "")) || (管理员免死 && String(dp[i].role || "member") === "admin")));
            let 改吗 = true;
            if(锁名名单[String(本次QQ ?? "")]){
                跳过 += `\n${跳过次数 + 1}.${dp[i].user_id}【已锁名】`;
                跳过次数++;
                continue;
            }
            if(!sanitizeMajiaNickname(原名)){
                无效 += `\n${无效次数 + 1}.${dp[i].user_id}`;
                无效次数++;
                改吗 = false;
            }
            if(现名 == 需求){
                跳过 += `\n${跳过次数 + 1}.${dp[i].user_id}`;
                跳过次数++;
                改吗 = false;
                //logger.error(`无需改名:${dp[i].user_id}`);
            }
            if(是否人机 || !本次QQ){
                无效 += `\n${无效次数 + 1}.${dp[i].user_id}`;
                无效次数++;
                改吗 = false;
                //logger.error(`错误用户:${dp[i].user_id}`);
            }
            if(改吗){
                try{
                    //logger.error(`需要改名:${dp[i].user_id}`);
                    let 参数1 = {"group_id": event.group_id, "user_id": 本次QQ, "card": 需求};
                    await BOTAPI(ctx, "set_group_card", 参数1);
                    有效 += `\n${有效次数 + 1}.${dp[i].user_id}`;
                    有效次数++;
                } catch (_e) {
                    无效 += `\n${无效次数 + 1}.${dp[i].user_id}`;
                    无效次数++;
                }
            }
            本轮++
            // ================== 是否进入冷却状态 ==================
            if(本轮 >= 1 && 是否冷却){
                await new Promise(resolve => setTimeout(resolve, 1000));//延迟1秒
                本轮 = 0;
            }
        }
        // ================== 行写入 ==================
        writeA(`筱筱吖/群管系统/马甲系统/${event.group_id}.json`, 内容);
        // ================== 组装消息 ==================
        const messages = [
            合并节点("数据总结", rand(1001,99999999), [段_文本(`「全员马甲」- 数据直接:\n══════════════\n有效人次：${有效次数}\n无效人次：${无效次数}\n跳过人次：${跳过次数}`)], { time: 1609459200 }),
            合并节点("【有效人次 - 列表】", rand(1001,99999999), [段_文本(`1️⃣ - 有效列表\n══════════════${有效}\n══════════════`)], { time: 1609459200 }),
            合并节点("【无效人次 - 列表】", rand(1001,99999999), [段_文本(`2️⃣ - 无效列表\n══════════════${无效}\n══════════════`)], { time: 1609459200 }),
            合并节点("【跳过人次 - 列表】", rand(1001,99999999), [段_文本(`3️⃣ - 跳过列表\n══════════════${跳过}\n══════════════`)], { time: 1609459200 }),
        ];
        // ================== 发送嵌套转发 ==================
        await 发合并消息(event, messages);
    return null;
}






if(message.match(/取数据/)){
    if(event.message_type != "group" || readB("config.json", "cs_of", false) != true) return null;
    if(!(await requireAuthorized(RC_sq, event))) return null;
    if(!(await checkOwner3(event, ctx, false))) return null;
        // ================== 判断是否引用 ==================
        let 引用消息ID = "";
        let 节点数量 = (event.message.length || 0);
        for(let i = 0; i < 节点数量; i++){
            let ID = event?.message[i]?.type;
            if(ID == "reply"){
                引用消息ID = event?.message[i]?.data?.id;
            }
        }
        // ================== 如果无引用，即输出 ==================
        if(!引用消息ID){
            await 发消息(event, [段_引用(event.message_id), 段_文本('请有效引用！')]);
            return null;
        }
        // ================== 二次获取原消息(API) ==================
        const dp = await BOTAPI(ctx, "get_msg", {message_id: 引用消息ID});
        if(!dp){//获取失败
            await 发消息(event, [段_引用(event.message_id), 段_文本('消息获取失败！！！')]);
            return null;
        }
        //正式取值
        // ================== 取基础信息 ==================
        const 头像链接 = `https://q4.qlogo.cn/g?b=qq&nk=${dp.user_id}&s=5`;
        let 组装消息1 = `\n[账号]:${dp.user_id}`;
        组装消息1 += `\n[原名]:${dp.sender.nickname}`;
        组装消息1 += `\n[群昵]:${dp.sender.card}`;
        组装消息1 += `\n[身份]:${dp.sender.role}`;
        组装消息1 += `\n[序列]:${dp.message_id}`;
        组装消息1 += `\n`;
        组装消息1 += `\n[群号]:${dp.group_id}`;
        组装消息1 += `\n[群名]:${dp.group_name}`;
        
        // ================== 构建嵌套转发消息 ==================
        const messages = [
            嵌套合并节点("取数据 - 综合展示", rand(1001,99999999), [
                合并节点("基础信息", rand(1001,99999999), [段_文本("这里是目标用户的消息基础展示")]),
                合并节点("消息2", rand(1001,99999999), [段_图片(头像链接), 段_文本(组装消息1)]),
            ], { time: 1609459200 }),
            嵌套合并节点("onebot日志", rand(1001,99999999), [
                合并节点("消息1", rand(1001,99999999), [段_文本("这里是转换为onebot的消息格式")]),
                合并节点("消息2", rand(1001,99999999), [段_文本(JSON.stringify(dp, null, 2))]),
            ], { time: 1609459200 }),
        ];
        // ================== 这里是储存消息的的 ==================
        const 推入扩展节点 = (标题, 内容文本) => {
            if (!内容文本) return;
            messages.push(嵌套合并节点(标题, rand(1001, 99999999), [
                合并节点("消息1", rand(1001, 99999999), [段_文本(String(内容文本))]),
            ], { time: 1609459200 }));
        };
        const 看起来像链接 = (v) => typeof v === "string" && /^(https?:\/\/|file:\/\/|base64:\/\/)/i.test(v.trim());
        const 循环次数 = (dp?.message?.length || 0);
        for(let q = 0; q < 循环次数; q++){
            const 当前消息 = dp?.message?.[q] || {};
            const 消息类型 = 当前消息?.type;
            const data = 当前消息?.data || {};

            if (消息类型 == "json" || 消息类型 == "forward" || 消息类型 == "xml") {
                const 卡片代码 = data?.data || JSON.stringify(data, null, 2) || "无可用数据";
                推入扩展节点(`扩展-${消息类型}#${q + 1}`, 卡片代码);
                continue;
            }

            if (消息类型 == "image") {
                const 链接候选 = [];
                if (data?.url) 链接候选.push(String(data.url));
                if (data?.file && 看起来像链接(data.file)) 链接候选.push(String(data.file));
                if (data?.image && 看起来像链接(data.image)) 链接候选.push(String(data.image));

                // 兼容 file 仅为文件名（如 md5.png）的情况，尝试通过 get_image 获取直链
                if ((!链接候选.length) && data?.file && typeof data.file === "string") {
                    try {
                        const 图链接结果 = await BOTAPI(ctx, "get_image", { file: data.file });
                        if (图链接结果?.url) {
                            链接候选.push(String(图链接结果.url));
                        }
                    } catch (_e) {}
                }

                let 文本 = `type: image`;
                if (链接候选.length) {
                    文本 += `\nlinks:\n${链接候选.map((it, idx) => `${idx + 1}. ${it}`).join("\n")}`;
                }
                if (data?.file) 文本 += `\nfile: ${data.file}`;
                推入扩展节点(`扩展-image#${q + 1}`, 文本);
                continue;
            }

            if (消息类型 == "video") {
                const 链接候选 = [];
                if (data?.url) 链接候选.push(String(data.url));
                if (data?.file && 看起来像链接(data.file)) 链接候选.push(String(data.file));

                let 文本 = `type: video`;
                if (链接候选.length) {
                    文本 += `\nlinks:\n${链接候选.map((it, idx) => `${idx + 1}. ${it}`).join("\n")}`;
                }
                if (data?.file) 文本 += `\nfile: ${data.file}`;
                推入扩展节点(`扩展-video#${q + 1}`, 文本);
                continue;
            }
        }
        // ================== 发送嵌套转发 ==================
        await 发合并消息(event, messages);
    return null;
}


// ================== 读取商店固定配置数据 ==================
// 单模式：限购.模式 = 个人|全服
// 双模式：限购.个人 / 限购.全服 同时存在，购买时先个人再全服
const 商店数据 = JSON.parse(`
[
    {
        "道具":"诱饵",
        "原价":100,
        "限购":{
            "模式":"个人",
            "数量":20
        }
    },
    {
        "道具":"禁言卡",
        "限购":{
            "个人":{"原价":888,"数量":2},
            "全服":{"原价":1200,"数量":15}
        }
    }
]`);

const MUTE_CARD_ITEM_PATH = "筱筱吖/娱乐系统/游戏数据/道具/禁言卡.json";
const MUTE_CARD_COOLDOWN_PATH = "筱筱吖/娱乐系统/游戏数据/道具/禁言卡冷却.json";
const MUTE_CARD_COOLDOWN_SEC = 600;

function 商店是否双模式(item) {
    return !!(item?.限购?.个人 && item?.限购?.全服);
}

function 商店解析货架条目(item) {
    const 名字 = item?.道具;
    if (!名字) return [];
    if (商店是否双模式(item)) {
        return [
            {
                名字,
                模式: "个人",
                原价: getShopBasePrice(名字, "个人", Number(item.限购.个人.原价 || 888)),
                限购数量: getShopLimit(名字, "个人", Number(item.限购.个人.数量 || 2)),
                双模式: true,
            },
            {
                名字,
                模式: "全服",
                原价: getShopBasePrice(名字, "全服", Number(item.限购.全服.原价 || 1200)),
                限购数量: getShopLimit(名字, "全服", Number(item.限购.全服.数量 || 15)),
                双模式: true,
            },
        ];
    }
    const 模式 = item?.限购?.模式 || "个人";
    return [{
        名字,
        模式,
        原价: getShopBasePrice(名字, 模式, Number(item?.原价 || 100)),
        限购数量: getShopLimit(名字, 模式, Number(item?.限购?.数量 || 10)),
        双模式: false,
    }];
}

function 商店日键(名字, 模式, 字段) {
    return `${名字}_${模式}_${字段}`;
}

function 商店计算今日价(今天, 名字, 模式, 原价) {
    const floatCfg = loadShopPriceConfig().float;
    const floatKey = `${名字}_${模式}`;
    let 浮动 = readB(`筱筱吖/娱乐系统/商店系统/价格配置/浮动${今天}.json`, floatKey, "无");
    let 升降 = readB(`筱筱吖/娱乐系统/商店系统/价格配置/升降${今天}.json`, floatKey, "升");
    let xxxx = 0;
    if (浮动 == "无") {
        if (Math.random() <= Number(floatCfg.降价概率 || 0.3)) {
            xxxx = randB(Number(floatCfg.降价最小 || 0.05), Number(floatCfg.降价最大 || 0.7));
            writeB(`筱筱吖/娱乐系统/商店系统/价格配置/浮动${今天}.json`, floatKey, xxxx);
            writeB(`筱筱吖/娱乐系统/商店系统/价格配置/升降${今天}.json`, floatKey, "降");
            升降 = "降";
        } else {
            xxxx = randB(Number(floatCfg.涨价最小 || 0.1), Number(floatCfg.涨价最大 || 0.5));
            writeB(`筱筱吖/娱乐系统/商店系统/价格配置/浮动${今天}.json`, floatKey, xxxx);
            writeB(`筱筱吖/娱乐系统/商店系统/价格配置/升降${今天}.json`, floatKey, "升");
            升降 = "升";
        }
    } else {
        xxxx = Number(浮动);
    }
    const base = Number(原价 || 100);
    const price = 升降 == "升"
        ? Math.floor(base + (base * xxxx))
        : Math.max(1, Math.floor(base - (base * xxxx)));
    return { price, base, trend: 升降 == "升" ? "升" : "降" };
}

function 商店写入今日货架(今天, 名字, 模式, 现价, 限购数量, 双模式) {
    writeB(`筱筱吖/娱乐系统/商店系统/每日数据/${今天}.json`, 商店日键(名字, 模式, "价格"), 现价);
    writeB(`筱筱吖/娱乐系统/商店系统/每日数据/${今天}.json`, 商店日键(名字, 模式, "数量"), 限购数量);
    writeB(`筱筱吖/娱乐系统/商店系统/每日数据/${今天}.json`, `${名字}_双模式`, 双模式 ? "是" : "否");
    writeB(`筱筱吖/娱乐系统/商店系统/每日数据/${今天}.json`, 名字 + "_价格", 现价);
    writeB(`筱筱吖/娱乐系统/商店系统/每日数据/${今天}.json`, 名字 + "_模式", 模式);
    writeB(`筱筱吖/娱乐系统/商店系统/每日数据/${今天}.json`, 名字 + "_数量", 限购数量);
}

function 商店读取模式库存(今天, 名字, 模式, userId) {
    const 个人已买 = Number(readB(`筱筱吖/娱乐系统/商店系统/限购数据/${名字}_${userId}.json`, 今天, 0) || 0);
    const 全服已买 = Number(readB(`筱筱吖/娱乐系统/商店系统/限购数据/${名字}_AAA全服.json`, 今天, 0) || 0);
    return { 个人已买, 全服已买, 已买: 模式 === "全服" ? 全服已买 : 个人已买 };
}

function 商店发放道具(名字, 数数, userId) {
    if (名字 == "诱饵") {
        const 原诱饵 = Number(readB("筱筱吖/娱乐系统/钓鱼玩法/道具/诱饵.json", userId, 0));
        writeB("筱筱吖/娱乐系统/钓鱼玩法/道具/诱饵.json", userId, 原诱饵 + 数数);
        return true;
    }
    if (名字 == "禁言卡") {
        const 原卡 = Number(readB(MUTE_CARD_ITEM_PATH, userId, 0));
        writeB(MUTE_CARD_ITEM_PATH, userId, 原卡 + 数数);
        return true;
    }
    return false;
}

/** 购买解析：双模式道具先个人后全服；单模式按货架模式 */
function 商店解析购买通道(今天, 名字, 数数, userId) {
    const item = 商店数据.find((x) => x.道具 === 名字);
    if (!item) return { ok: false, reason: `商店没有【${名字}】这个道具` };

    const 条目们 = 商店解析货架条目(item);
    const 尝试顺序 = 商店是否双模式(item)
        ? 条目们.filter((x) => x.模式 === "个人").concat(条目们.filter((x) => x.模式 === "全服"))
        : 条目们;

    const failures = [];
    for (const slot of 尝试顺序) {
        let 价格 = readB(`筱筱吖/娱乐系统/商店系统/每日数据/${今天}.json`, 商店日键(名字, slot.模式, "价格"), "无");
        let 数量 = Number(readB(`筱筱吖/娱乐系统/商店系统/每日数据/${今天}.json`, 商店日键(名字, slot.模式, "数量"), "无"));
        if (价格 == "无" || 价格 === "" || !价格) {
            const oldMode = readB(`筱筱吖/娱乐系统/商店系统/每日数据/${今天}.json`, 名字 + "_模式", "");
            if (oldMode === slot.模式 || (!商店是否双模式(item) && oldMode)) {
                价格 = readB(`筱筱吖/娱乐系统/商店系统/每日数据/${今天}.json`, 名字 + "_价格", "无");
                数量 = Number(readB(`筱筱吖/娱乐系统/商店系统/每日数据/${今天}.json`, 名字 + "_数量", 10));
            }
        }
        if (价格 == "无" || 价格 === "" || !价格 || Number.isNaN(数量)) {
            failures.push(`${slot.模式}档未上架`);
            continue;
        }
        const { 已买 } = 商店读取模式库存(今天, 名字, slot.模式, userId);
        if (已买 + 数数 > 数量) {
            const tip = 已买 >= 数量
                ? `${slot.模式}档已达今日上限`
                : `${slot.模式}档购买后将超限（剩${Math.max(0, 数量 - 已买)}）`;
            failures.push(tip);
            continue;
        }
        return {
            ok: true,
            模式: slot.模式,
            单价: Number(价格),
            限购数量: 数量,
            已买,
        };
    }

    if (failures.length === 0) {
        return { ok: false, reason: `今日商品货架未显示有【${名字}】，请先发送【商店】刷新今日道具商店！` };
    }
    return { ok: false, reason: `【${名字}】暂不可购：${failures.join("；")}` };
}

if(message.match(/^买#(.*) #([0-9]+)$/) && 娱乐功能('商店')){
    // ================== 授权判断 ==================
    if(!(await requireAuthorized(RC_sq, event))) return null;
    let 名字 = message.match(/^买#(.*) #([0-9]+)$/)[1];
    let 数数 = Number(message.match(/^买#(.*) #([0-9]+)$/)[2]);
    if(名字.length < 25 && 数数 < 1000000 && 数数 >= 1){
        let 今天 = timeA("y-m-d", Math.floor(Date.now() / 1000));
        const channel = 商店解析购买通道(今天, 名字, 数数, event.user_id);
        if(!channel.ok){
            await 发消息(event, [段_引用(event.message_id), 段_文本(channel.reason)]);
            return null;
        }
        const 归笺 = Number(readB("筱筱吖/娱乐系统/游戏数据/归笺.json", event.user_id, 0));
        const 计算价格 = Number(Math.floor(channel.单价 * 数数));
        if(归笺 < 计算价格){
            const 价差 = Math.floor(计算价格 - 归笺);
            await 发消息(event, [段_引用(event.message_id), 段_文本(`你的归笺貌似不够哟～还差「${价差}」呢`)]);
            return null;
        }
        writeB("筱筱吖/娱乐系统/游戏数据/归笺.json", event.user_id, 归笺 - 计算价格);
        if(channel.模式 == "个人"){
            writeB(`筱筱吖/娱乐系统/商店系统/限购数据/${名字}_${event.user_id}.json`, 今天, channel.已买 + 数数);
        }else{
            writeB(`筱筱吖/娱乐系统/商店系统/限购数据/${名字}_AAA全服.json`, 今天, channel.已买 + 数数);
        }
        商店发放道具(名字, 数数, event.user_id);
        let 组装消息 = `══════════════`;
        组装消息 += `\n♻️购买成功`;
        组装消息 += `\n✳️购买道具【${名字}】`;
        组装消息 += `\n🏷️结算档位【${channel.模式}】`;
        组装消息 += `\n💹购买数量【${数数}】`;
        组装消息 += `\n💠消耗归笺【${计算价格}】`;
        组装消息 += `\n══════════════`;
        await 发消息(event, [段_引用(event.message_id), 段_文本(`${组装消息}`)]);
        return null;
    }
}


if(message == "商店" && 娱乐功能('商店')){
    // ================== 授权判断 ==================
    if(!(await requireAuthorized(RC_sq, event))) return null;
    let 商店数量 = (商店数据.length || 0);
    if(商店数量 == 0){
        await 发消息(event, [段_引用(event.message_id), 段_文本('商店数据加载异常！')]);
        return null;
    }
    let 今天 = timeA("y-m-d", Math.floor(Date.now() / 1000));
    const shopItems = [];
    const textBlocks = [];

    for(let i = 0; i < 商店数量; i++){
        const item = 商店数据[i];
        const slots = 商店解析货架条目(item);
        for (const slot of slots) {
            const { price: 现价, base: 原价, trend: 升降 } = 商店计算今日价(今天, slot.名字, slot.模式, slot.原价);
            商店写入今日货架(今天, slot.名字, slot.模式, 现价, slot.限购数量, slot.双模式);
            const { 已买 } = 商店读取模式库存(今天, slot.名字, slot.模式, event.user_id);
            let 可买次数 = 0;
            let soldOut = false;
            if (已买 >= slot.限购数量) {
                可买次数 = "售空";
                soldOut = true;
            } else {
                可买次数 = slot.限购数量 - 已买;
            }
            shopItems.push({
                name: slot.名字,
                modeLabel: slot.双模式 ? `${slot.模式}额度` : `${slot.模式}限购`,
                price: String(现价),
                basePrice: String(原价),
                trend: 升降 === "降" ? "down" : "up",
                limitText: `限购 ${slot.限购数量}`,
                remainText: soldOut ? "售空" : `可买 ${可买次数}`,
                soldOut,
            });
            let 组装消息 = `══════════════`;
            组装消息 += `\n道具名字【${slot.名字}】`;
            组装消息 += `\n档位模式【${slot.模式}】`;
            组装消息 += `\n今日价格【${现价}】`;
            组装消息 += `\n默认原价【${原价}】（${升降 === "降" ? "降价" : "升价"}）`;
            组装消息 += `\n${slot.模式}限购【${slot.限购数量}】`;
            组装消息 += `\n可买次数【${可买次数}】`;
            组装消息 += `\n══════════════`;
            textBlocks.push(组装消息);
        }
    }

    const hint = "买#道具名 #数量 · 双模式先个人后全服 · 禁言卡使用成功后冷却10分钟";
    let imageData = null;
    if (isImageRenderEnabled(readB) && getRenderMode(readB) === "sharp") {
        imageData = await renderShopWithSharp({
            title: "道具商店",
            subtitle: `今日货架 · ${今天}`,
            hint,
            items: shopItems,
            width: 1280,
        }, logger);
    }
    if (imageData) {
        await 发消息(event, [段_引用(event.message_id), 渲染Base64图片段(imageData)]);
        return null;
    }

    let C = `══════════════`;
    C += `\n购买指令例子：`;
    C += `\n - 买#诱饵 #10`;
    C += `\n - 买#禁言卡 #1`;
    C += `\n`;
    C += `\n双模式道具：先个人额度，再全服额度`;
    C += `\n注意：每日价格为不固定，有上下浮动现象！`;
    C += `\n══════════════`;
    const messages = [
        合并节点("使用说明 - 商店", rand(1001,99999999), [段_文本(C)]),
    ];
    for (let i = 0; i < textBlocks.length; i++) {
        messages.push(合并节点(`商品 - ${shopItems[i]?.name || i}`, rand(1001,99999999), [段_文本(textBlocks[i])]));
    }
    await 发合并消息(event, messages);
    return null;
}


// ================== 娱乐·打工（全局玩法；开关为娱乐分项「打工」，仅后台可改） ==================
/** 今日货架价 / 默认原价 的均值，作为标准时薪的物价因子 */
function 打工物价指数(今天) {
    try {
        const 货架 = [];
        for (const item of 商店数据) {
            for (const slot of 商店解析货架条目(item)) {
                const 今日价 = Number(readB(`筱筱吖/娱乐系统/商店系统/每日数据/${今天}.json`, 商店日键(slot.名字, slot.模式, "价格"), 0));
                const 原价 = Number(slot.原价 || 0);
                if (今日价 > 0 && 原价 > 0) 货架.push({ 今日价, 原价 });
            }
        }
        return computeShopPriceIndex(货架);
    } catch (e) {
        logger?.error?.("[打工] 物价指数计算失败：", e);
        return 1;
    }
}

if(message == "打工" && 娱乐功能(WORK_ENT_KEY)){
    // ================== 授权判断 ==================
    if(!(await requireAuthorized(RC_sq, event))) return null;
    // ================== 极简菜单 ==================
    let 组装消息 = `[打工] 选择工作区`;
    组装消息 += `\n══════════════`;
    for(const 行 of workMenuLines()){
        组装消息 += `\n${行}`;
    }
    组装消息 += `\n══════════════`;
    组装消息 += `\n上班：开始打工 商店`;
    组装消息 += `\n下班：结算工资`;
    组装消息 += `\n状态：查看打工状态`;
    组装消息 += `\n每次打工上限${WORK_STANDARD_HOURS}+${WORK_MAX_HOURS - WORK_STANDARD_HOURS}小时`;
    // ================== 输出（在职与否都是同一份菜单） ==================
    await 发消息(event, [段_引用(event.message_id), 段_文本(组装消息)]);
    return null;
}

if(message.match(/^(查看打工状态|打工状态)$/) && 娱乐功能(WORK_ENT_KEY)){
    // ================== 授权判断 ==================
    if(!(await requireAuthorized(RC_sq, event))) return null;
    const 在职 = readWorkState(event.user_id);
    if(!在职){
        await 发消息(event, [段_引用(event.message_id), 段_文本('你现在没有在打工哦～发【打工】看看有哪些工作区吧')]);
        return null;
    }
    // ================== 实时状态（只读，不写盘不发钱） ==================
    const 状态 = computeWorkStatus(在职, Math.floor(Date.now() / 1000));
    let 组装消息 = `[打工状态] ${状态.工作区} · ${状态.岗位}`;
    组装消息 += `\n[工时] ${状态.标准进度}/${状态.标准目标} 小时`;
    if(!状态.已满标准 && 状态.零头分钟 > 0){
        组装消息 += ` · 零头${状态.零头分钟}分钟`;
    }
    组装消息 += `\n[加班] ${状态.加班计薪工时}/${状态.加班目标} 小时`;
    if(状态.超时工时 > 0){
        组装消息 += `\n[超时] ${状态.超时工时}小时不计薪`;
    }
    组装消息 += `\n[退出可得] ${状态.退出可得} 归笺`;
    if(状态.计薪工时 < 1){
        组装消息 += `\n满1小时才有工资`;
    }else if(状态.提前结算){
        组装消息 += `\n不满${WORK_STANDARD_HOURS}小时已打9折`;
    }
    if(状态.满勤奖预告 > 0){
        组装消息 += `\n[满勤奖] ${状态.已满标准 ? `已到手 +${状态.满勤奖}` : `满${WORK_STANDARD_HOURS}小时再+${状态.满勤奖预告}`} 归笺`;
    }
    // ================== 输出 ==================
    await 发消息(event, [段_引用(event.message_id), 段_文本(组装消息)]);
    return null;
}

if(message.match(/^开始打工\s*(.*)$/) && 娱乐功能(WORK_ENT_KEY)){
    // ================== 授权判断 ==================
    if(!(await requireAuthorized(RC_sq, event))) return null;
    const 工作区 = String(message.match(/^开始打工\s*(.*)$/)[1] || "").trim();
    if(!isWorkArea(工作区)){
        await 发消息(event, [段_引用(event.message_id), 段_文本(`没有【${工作区 || "空"}】这个工作区哦～\n可选：${workAreaNames().join(" / ")}\n例子：开始打工 商店`)]);
        return null;
    }
    // ================== 在职检查（未结算不可重复上班） ==================
    const 现在 = Math.floor(Date.now() / 1000);
    const 在职 = readWorkState(event.user_id);
    if(在职){
        const 已上小时 = Math.floor(Math.max(0, 现在 - 在职.开始时间) / 3600);
        await 发消息(event, [段_引用(event.message_id), 段_文本(`你还在【${在职.工作区}·${在职.岗位}】上班呢！\n已上班${已上小时}小时，发【查看打工状态】看进度，或发【结算工资】下班～`)]);
        return null;
    }
    // ================== 今日标准时薪（当天首个打工人触发刷新；命中缓存不重算物价） ==================
    const 今天 = timeA("y-m-d", 现在);
    const 薪资 = resolveDailyStandardWage(今天, {
        物价指数: () => 打工物价指数(今天),
        刷新时间: timeA("y-m-d H:i:s", 现在),
    });
    // ================== 随机分配岗位 ==================
    const 岗位 = pickWorkPost(工作区);
    if(!岗位){
        await 发消息(event, [段_引用(event.message_id), 段_文本('这个工作区暂时没有岗位可分配～')]);
        return null;
    }
    const 白班时薪 = Math.max(1, Math.floor(薪资.标准时薪 * 岗位.系数));
    const 夜班时薪 = Math.max(1, Math.floor(白班时薪 * 岗位.夜班倍率));
    const 加班白时薪 = Math.max(1, Math.floor(白班时薪 * 岗位.加班倍率));
    const 现在夜班 = isNightShiftHour(new Date(现在 * 1000).getHours());
    writeWorkState(event.user_id, {
        工作区,
        岗位: 岗位.岗位,
        系数: 岗位.系数,
        基准时薪: 薪资.标准时薪,
        开始时间: 现在,
        开始文本: timeA("y-m-d H:i:s", 现在),
        日期: 今天,
        来源: event.message_type == "group" ? String(event.group_id) : "私聊",
    });
    // ================== 输出 ==================
    let 组装消息 = `══════════════`;
    组装消息 += `\n✅ 上班成功`;
    组装消息 += `\n[工作区] ${工作区}`;
    组装消息 += `\n[岗位] ${岗位.岗位}`;
    组装消息 += `\n[当前班次] ${现在夜班 ? "夜班" : "白班"}`;
    组装消息 += `\n[今日标准时薪] ${薪资.标准时薪} 归笺`;
    组装消息 += `\n[本岗时薪] 白班 ${白班时薪} / 夜班 ${夜班时薪}`;
    组装消息 += `\n[本岗加班] ${加班白时薪} 归笺/小时`;
    组装消息 += `\n[满勤奖] ${Math.floor(白班时薪 * 岗位.满勤奖)} 归笺`;
    组装消息 += `\n[上班时间] ${timeA("y-m-d H:i:s", 现在)}`;
    组装消息 += `\n══════════════`;
    组装消息 += `\n看进度发【查看打工状态】，下班发【结算工资】`;
    await 发消息(event, [段_引用(event.message_id), 段_文本(组装消息)]);
    return null;
}

if(message == "结算工资" && 娱乐功能(WORK_ENT_KEY)){
    // ================== 授权判断 ==================
    if(!(await requireAuthorized(RC_sq, event))) return null;
    const 在职 = readWorkState(event.user_id);
    if(!在职){
        await 发消息(event, [段_引用(event.message_id), 段_文本('你现在没有在打工哦～发【打工】看看有哪些工作区吧')]);
        return null;
    }
    // ================== 工时切分（整小时，零头与超12小时部分丢弃） ==================
    const 现在 = Math.floor(Date.now() / 1000);
    const 工时 = splitWorkHours(在职.开始时间, 现在);
    if(工时.计薪工时 < 1){
        clearWorkState(event.user_id);
        const 分钟 = Math.floor(工时.实际秒 / 60);
        await 发消息(event, [段_引用(event.message_id), 段_文本(`你在【${在职.工作区}·${在职.岗位}】只待了${分钟}分钟，不满1小时没有工资哦～\n已帮你下班，下次记得多干一会儿`)]);
        return null;
    }
    // ================== 工资计算（按岗位自己的公式，一次算清） ==================
    const 岗位档案 = workStatePostDef(在职);
    const 结果 = computeWorkWage(工时, 在职.基准时薪, 岗位档案, 在职.开始时间);
    const 原归笺 = Number(readB("筱筱吖/娱乐系统/游戏数据/归笺.json", event.user_id, 0));
    writeB("筱筱吖/娱乐系统/游戏数据/归笺.json", event.user_id, 原归笺 + 结果.总工资);
    clearWorkState(event.user_id);
    // ================== 输出 ==================
    let 组装消息 = `══════════════`;
    组装消息 += `\n💰 结算完成`;
    组装消息 += `\n[工作区] ${在职.工作区} · ${在职.岗位}`;
    组装消息 += `\n[上班时间] ${在职.开始文本 || timeA("y-m-d H:i:s", 在职.开始时间)}`;
    组装消息 += `\n[下班时间] ${timeA("y-m-d H:i:s", 现在)}`;
    组装消息 += `\n[实际时长] ${formatWorkDuration(工时.实际秒)}`;
    组装消息 += `\n[计薪工时] ${工时.计薪工时}小时 · 白班${工时.标准白 + 工时.加班白} / 夜班${工时.标准夜 + 工时.加班夜}`;
    组装消息 += `\n[加班工时] ${工时.加班白 + 工时.加班夜}小时`;
    if(工时.超时工时 > 0){
        组装消息 += `\n[超时未计] ${工时.超时工时}小时`;
    }
    组装消息 += `\n----------------`;
    组装消息 += `\n[本岗时薪] 白班 ${结果.白班时薪} / 夜班 ${结果.夜班时薪}`;
    组装消息 += `\n[本岗加班] 白班 ${结果.加班白时薪} / 夜班 ${结果.加班夜时薪}`;
    组装消息 += `\n[标准工资] ${结果.标准工资} 归笺`;
    组装消息 += `\n[加班工资] ${结果.加班工资} 归笺`;
    if(结果.绩效浮动 != 0){
        组装消息 += `\n[绩效浮动] ${结果.绩效浮动 > 0 ? "+" : ""}${结果.绩效浮动} 归笺`;
    }
    if(工时.提前结算){
        组装消息 += `\n[提前下班] 工资 ×${结果.折扣}，无满勤奖`;
    }else if(结果.满勤奖 > 0){
        组装消息 += `\n[满勤奖] +${结果.满勤奖} 归笺`;
    }
    组装消息 += `\n[本次到手] ${结果.总工资} 归笺`;
    组装消息 += `\n[当前持有] ${moneyA(原归笺 + 结果.总工资)}`;
    组装消息 += `\n══════════════`;
    组装消息 += `\n上班时锁定的标准时薪 ${在职.基准时薪} 归笺/小时`;
    await 发消息(event, [段_引用(event.message_id), 段_文本(组装消息)]);
    return null;
}


if(message.match(/^使用禁言卡/) && 娱乐功能('禁言卡')){
    // ================== 授权判断 ==================
    if(!(await requireAuthorized(RC_sq, event))) return null;
    if(event.message_type != "group"){
        await 发消息(event, [段_引用(event.message_id), 段_文本('禁言卡只能在群里使用哦～')]);
        return null;
    }

    // 冷却：上次成功使用时间戳(秒) + 600 > 当前时间戳(秒)
    const nowSec = Math.floor(Date.now() / 1000);
    const lastUseSec = Number(readB(MUTE_CARD_COOLDOWN_PATH, event.user_id, 0) || 0);
    if (Number.isFinite(lastUseSec) && lastUseSec > 0 && (lastUseSec + MUTE_CARD_COOLDOWN_SEC) > nowSec) {
        const remain = (lastUseSec + MUTE_CARD_COOLDOWN_SEC) - nowSec;
        const remainMin = Math.floor(remain / 60);
        const remainSec = remain % 60;
        await 发消息(event, [段_引用(event.message_id), 段_文本(`禁言卡冷却中～还要等 ${remainMin}分${remainSec}秒`)]);
        return null;
    }

    const atUsers = giveATUnique(event.message);
    if(atUsers.length === 0){
        await 发消息(event, [段_引用(event.message_id), 段_文本('请艾特要禁言的人：使用禁言卡@对方（不可空艾特/全体）')]);
        return null;
    }
    if(atUsers.length > 10){
        await 发消息(event, [段_引用(event.message_id), 段_文本('一次最多艾特 10 人（重复艾特只算一张）')]);
        return null;
    }

    const 需要张数 = atUsers.length;
    let 持有 = Number(readB(MUTE_CARD_ITEM_PATH, event.user_id, 0));
    if(Number.isNaN(持有)) 持有 = 0;
    if(持有 < 需要张数){
        await 发消息(event, [段_引用(event.message_id), 段_文本(`禁言卡不足：需要 ${需要张数} 张，当前 ${持有} 张（商店购买：买#禁言卡 #1）`)]);
        return null;
    }

    let 参数188 = {group_id : event.group_id, user_id : event.self_id};
    const dp188 = await BOTAPI(ctx, "get_group_member_info", 参数188);
    let Robot身份 = (RC_group_role[(dp188?.role || "member")] || 0);
    if(Robot身份 < 2){
        await 发消息(event, [段_引用(event.message_id), 段_文本('窝没有群管权限唉～用不了禁言卡')]);
        return null;
    }

    let 组装消息 = "";
    let 有效人数 = 0;
    let 消耗张数 = 0;
    for(let i = 0; i < atUsers.length; i++){
        const 本次QQ = atUsers[i];
        if(String(本次QQ) === String(event.self_id)){
            组装消息 += `\n❌${i+1}.${本次QQ}:不能禁言机器人`;
            continue;
        }
        let 参数199 = {group_id : event.group_id, user_id : 本次QQ};
        let dp199 = await BOTAPI(ctx, "get_group_member_info", 参数199);
        let User身份 = (RC_group_role[(dp199?.role || "member")] || 0);
        if(User身份 >= Robot身份){
            组装消息 += `\n❌${i+1}.${本次QQ}:权限不足`;
            continue;
        }
        // 每人独立随机 3~10 分钟（秒）
        const 分钟 = rand(3, 10);
        const 禁言秒数 = 分钟 * 60;
        await BOTAPI(ctx, "set_group_ban", {
            group_id: event.group_id,
            user_id: 本次QQ,
            duration: 禁言秒数,
        });
        组装消息 += `\n✅${i+1}.${本次QQ}:禁言${分钟}分钟`;
        有效人数++;
        消耗张数++;
    }

    if(消耗张数 > 0){
        持有 = Number(readB(MUTE_CARD_ITEM_PATH, event.user_id, 0));
        writeB(MUTE_CARD_ITEM_PATH, event.user_id, Math.max(0, 持有 - 消耗张数));
        // 只要有成功扣除，就进入 10 分钟冷却
        writeB(MUTE_CARD_COOLDOWN_PATH, event.user_id, nowSec);
    }

    let 返回内容 = `禁言卡生效【${有效人数}】人，消耗【${消耗张数}】张`;
    返回内容 += `\n剩余禁言卡：${Math.max(0, Number(readB(MUTE_CARD_ITEM_PATH, event.user_id, 0)))} 张`;
    if (消耗张数 > 0) {
        返回内容 += `\n冷却：10分钟`;
    }
    返回内容 += "\n══════════════";
    返回内容 += 组装消息;
    await 发消息(event, [段_引用(event.message_id), 段_文本(返回内容)]);
    return null;
}












/*
if(message === "测试跳转卡片"){
    // ================== 参数区 ==================
    let 参数 = ``;
    参数 += `?tz=${encodeURIComponent("https://q.qq.com/")}`;//跳转目标url地址
    参数 += `&dbt=${encodeURIComponent("卡片标题七个字")}`;//大标题
    参数 += `&xbt=${encodeURIComponent("子标题区域，长度可能显示有限")}`;//小标题 简介
    参数 += `&fm=${encodeURIComponent("https://q4.qlogo.cn/g?b=qq&nk=3573995540&s=5")}`;//大图标链接
    参数 += `&pingtai=rand`;//rand为平台随机
    // ================== 访问接口 ==================
    const response = await fetch('https://api.s01s.cn/API/ark_tz2/' + 参数);
    const text = await response.text();
    await 发卡片(event, text);
    return null;
}

if(message.match(/^测试跳转卡片❂([\s\S]*)❂([\s\S]*)❂([\s\S]*)❂([\s\S]*)❂(.*)$/)){
    // ================== 取值 ==================
    const matches = message.match(/^测试跳转卡片❂([\s\S]*)❂([\s\S]*)❂([\s\S]*)❂([\s\S]*)❂(.*)$/);
    // HTML实体反转义函数
    const decodeHTML = (str) => str
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'");
    
    const 跳转 = decodeHTML(matches[1]);
    const 大标题 = decodeHTML(matches[2]);
    const 小标题 = decodeHTML(matches[3]);
    const 封面 = decodeHTML(matches[4]);
    const 平台 = matches[5];
    // ================== 参数区 ==================
    let 参数 = ``;
    参数 += `?tz=${encodeURIComponent(跳转)}`;//跳转目标url地址
    参数 += `&dbt=${encodeURIComponent(大标题)}`;//大标题
    参数 += `&xbt=${encodeURIComponent(小标题)}`;//小标题 简介
    参数 += `&fm=${encodeURIComponent(封面)}`;//大图标链接
    参数 += `&pingtai=${平台}`;//rand为平台随机
    // ================== 访问接口 ==================
    const response = await fetch('https://api.s01s.cn/API/ark_tz2/' + 参数);
    const text = await response.text();
    await 发卡片(event, text);
    return null;
}
*/

/*
if(message === "测试图片外显"){
    // ================== 多内容方法 ==================
    const nm = [
        {
            type: "text",
            data: {
                text: "🔗 点击下方链接了解更多：\nhttps://example.com\n\n"
            }
        },
        {
            type: "image",
            data: {
                file: "https://xn--mk-ub3cl61ae1v.xn--c5w857b.xn--fiqs8s/api/xihuandetupian",
                summary: "相关内容"
            }
        },
        {
            type: "text",
            data: {
                text: "\n✨ 更多精彩内容等你发现"
            }
        }
    ];
    await 发消息(event, nm);
    // ================== 更明显版本 ==================
    const nm = [
        {
            type: "image",
            data: {
                file: "https://xn--mk-ub3cl61ae1v.xn--c5w857b.xn--fiqs8s/api/xihuandetupian",
                summary: "特殊外显！！！"
            }
        }
    ];
    await 发消息(event, nm);
    return null;
}
*/


if(message == "赞我" || message == "点赞"){
    if(RC_sq == "已授权"){
        let 开关 = readB(`筱筱吖/事件系统/全局.json`, "自动点赞", "关闭");
        let 今天 = timeA("y-m-d", Math.floor(Date.now() / 1000));
        if(开关 == "开启"){
            let 点赞记录 = readB(`筱筱吖/扩展功能/点赞记录/${今天}.json`, event.user_id, "未");
            if(点赞记录 == "未"){
                writeB(`筱筱吖/扩展功能/点赞记录/${今天}.json`, event.user_id, "已");
                // ================== 调用接口 ==================
                let 参数 = {"user_id": event.user_id, "times": 20};
                const dp = await BOTAPI(ctx, "send_like", 参数);
            }
        }
    }
}

if(message == "拍我" || message == "截我"){
    if(RC_sq == "已授权"){
        let 发送方式 = readB("config.json", "cs_of", false);
        if(发送方式 == true){
            if(event.message_type == "group"){
                let 参数 = {"group_id":event.group_id, "user_id": event.user_id};
                BOTAPI(ctx, "friend_poke", 参数);
            }else{
                let 参数 = {"user_id": event.user_id};
                BOTAPI(ctx, "friend_poke", 参数);
            }
        }
    }
}



// ================== 快捷撤回（本群事件，默认关闭；兼容管理模式） ==================
if(message.match(/撤回/) && event.message_type == "group"){
    handleQuickRecallBlock(message, event, ctx, {
        readB,
        BOTAPI,
        botApiPayload,
        checkOwner3,
        RC_sq,
        RC_group_role,
        getDataPath,
        logger,
    });
}

if(message.match(/(图|)转链接/)){
    if(RC_sq == "已授权"){
        // 群聊须开启本群事件「图转连接」（默认关闭）；私聊仅需已授权；关闭时不中断后续功能
        let 允许图转连接 = true;
        if(event.message_type == "group"){
            const 图转连接开关 = readB(`筱筱吖/事件系统/${event.group_id}.json`, "图转连接", "关闭");
            允许图转连接 = (图转连接开关 == "开启");
        }
        if(允许图转连接){
        try {
            const messages = [合并节点("[图转链接]", event.self_id, [段_文本("图转链接结果:")])];
            const 图片链接列表 = [];
            const 视频链接列表 = [];
            const 图片文件名列表 = [];
            const 视频文件名列表 = [];

            const 看起来像链接 = (v) => typeof v === "string" && /^(https?:\/\/|file:\/\/|base64:\/\/)/i.test(v.trim());
            const 加入唯一值 = (arr, value) => {
                if (!value) return;
                const s = String(value).trim();
                if (!s) return;
                if (!arr.includes(s)) arr.push(s);
            };

            const 尝试从消息段提取 = (segments) => {
                if (!Array.isArray(segments)) return;
                for (const seg of segments) {
                    const t = seg?.type;
                    const d = seg?.data || {};
                    if (t === "image") {
                        if (看起来像链接(d?.url)) 加入唯一值(图片链接列表, d.url);
                        if (看起来像链接(d?.file)) 加入唯一值(图片链接列表, d.file);
                        if (d?.file && !看起来像链接(d.file)) 加入唯一值(图片文件名列表, d.file);
                    } else if (t === "video") {
                        if (看起来像链接(d?.url)) 加入唯一值(视频链接列表, d.url);
                        if (看起来像链接(d?.file)) 加入唯一值(视频链接列表, d.file);
                        if (d?.file && !看起来像链接(d.file)) 加入唯一值(视频文件名列表, d.file);
                    }
                }
            };

            const 尝试从raw记录提取 = (records) => {
                if (!Array.isArray(records)) return;
                for (const record of records) {
                    const elements = record?.elements || [];
                    for (const el of elements) {
                        const pic = el?.picElement;
                        if (pic?.fileName) 加入唯一值(图片文件名列表, pic.fileName);
                        if (看起来像链接(pic?.sourcePath)) 加入唯一值(图片链接列表, pic.sourcePath);
                        if (看起来像链接(pic?.originImageUrl)) 加入唯一值(图片链接列表, pic.originImageUrl);
                        const video = el?.videoElement;
                        if (video?.fileName) 加入唯一值(视频文件名列表, video.fileName);
                        if (看起来像链接(video?.filePath)) 加入唯一值(视频链接列表, video.filePath);
                    }
                }
            };

            // 1) 当前消息里直接提取
            尝试从消息段提取(event?.message);
            尝试从raw记录提取(event?.raw?.records);

            // 2) 如果有引用，再从被引用消息补提取
            let 引用消息ID = "";
            const 节点数量 = (event?.message?.length || 0);
            for (let i = 0; i < 节点数量; i++) {
                if (event?.message?.[i]?.type == "reply") {
                    引用消息ID = event?.message?.[i]?.data?.id || "";
                    break;
                }
            }
            if (引用消息ID) {
                try {
                    const 引用消息 = await BOTAPI(ctx, "get_msg", { message_id: 引用消息ID });
                    尝试从消息段提取(引用消息?.message);
                    尝试从raw记录提取(引用消息?.raw?.records);
                } catch (_e) {}
            }

            // 3) 通过 fileName 换取图片直链
            for (const 文件名 of 图片文件名列表) {
                try {
                    const dp = await BOTAPI(ctx, "get_image", { file: 文件名 });
                    if (dp?.url) 加入唯一值(图片链接列表, dp.url);
                } catch (_e) {}
            }

            // 4) 输出图片结果
            let 图片数量 = 0;
            for (const 图片链接 of 图片链接列表) {
                messages.push(合并节点(`[第${图片数量 + 1}张图片]`, event.self_id, [
                    段_图片(图片链接),
                    段_文本(`══════════════\n${图片链接}`),
                ]));
                图片数量++;
            }

            // 5) 输出视频结果（尽量给链接，其次展示 file 标识）
            let 视频数量 = 0;
            for (const 视频链接 of 视频链接列表) {
                messages.push(合并节点(`[第${视频数量 + 1}个视频]`, event.self_id, [段_文本(`视频链接:\n${视频链接}`)]));
                视频数量++;
            }
            if (视频数量 === 0 && 视频文件名列表.length) {
                messages.push(合并节点(`[视频文件标识]`, event.self_id, [段_文本(`检测到视频文件标识（未拿到直链）:\n${视频文件名列表.map((v, i) => `${i + 1}. ${v}`).join("\n")}`)]));
            }

            // 无结果时静默，不提示也不中断后续逻辑
            if (图片数量 > 0 || 视频数量 > 0 || 视频文件名列表.length > 0) {
                await 发合并消息(event, messages);
            }
        } catch (error) {
            logger?.error?.("[图转链接] 处理失败:", error);
            await 发消息(event, [段_引用(event.message_id), 段_文本(`图转链接处理失败: ${error?.message || error}`)]);
        }
        }
    }
}


/*
//调试内容，看个人需求改进
if (event.message[0].type == "forward") {
  const forwardMsg = event.message[0];
  const content = forwardMsg.data.content;
  
  content.forEach((msg, index) => {
    logger.error(`[第 ${index + 1} 条] ${msg.sender.nickname}: ${msg.raw_message}`);
  });
}
*/





// ================== 检测大部分消息 ==================
if(message.match(/[\s\S]*/)){
    // ================== 来源 ==================
    if(event.message_type == "group"){
        //logger.error("111");//调试
        if(RC_sq == "已授权"){
            //logger.error("222");//调试
            let 开关 = readB(`筱筱吖/事件系统/${event.group_id}.json`, "黑白名单", "关闭");
            let 机器人等级 = 0;
            let 用户等级 = 0;
            if(开关 == "开启"){//有开启检测
                //logger.error("333");
                let data1 = JSON.parse(readA(`筱筱吖/群管系统/黑白名单/全局/人员.json`) || "[]");
                let data2 = JSON.parse(readA(`筱筱吖/群管系统/黑白名单/群聊/${event.group_id}/人员.json`) || "[]");
                let ishmd1 = data1.includes(String(event.user_id));
                let ishmd2 = data2.includes(String(event.user_id));
                //logger.error(ishmd1);//调试
                //logger.error(ishmd2);//调试
                if(ishmd1 || ishmd2){
                    let 参数188 = {group_id : event.group_id,user_id : event.self_id};
                    let dp188 = await BOTAPI(ctx, "get_group_member_info", 参数188);
                    let Robot身份 = (RC_group_role[(dp188?.role || "member")] || 0);
                    机器人等级 = Robot身份;//赋值
                    if(Robot身份 >= 2){//有神权
                        let 参数199 = {group_id : event.group_id,user_id : event.user_id};
                        let dp199 = await BOTAPI(ctx, "get_group_member_info", 参数199);
                        let 用户身份 = (RC_group_role[(dp199?.role || "member")] || 0);
                        用户等级 = 用户身份;
                        if(Robot身份 > 用户身份){//比你大
                            let jjj = {"踢出" : false, "黑踢" : true};
                            let 参数 = {group_id : event.group_id,user_id : [event.user_id],reject_add_request : false};
                            if(data1.includes(event.user_id)){//全局黑名单
                                let nm1 = readA(`筱筱吖/群管系统/黑白名单/全局/处理方式.json`, "方式" , "踢出");
                                参数 = {group_id : event.group_id,user_id : [event.user_id],reject_add_request : jjj[nm1]};
                            }else{
                                let nm2 = readA(`筱筱吖/群管系统/黑白名单/群聊/${event.group_id}/处理方式.json`, "方式" , "踢出");
                                参数 = {group_id : event.group_id,user_id : [event.user_id],reject_add_request : jjj[nm2]};
                            }
                            kickGroupMembersFireAndForget(ctx, 参数.group_id, 参数.user_id, 参数.reject_add_request);
                            //顺便撤回
                            let 参数2 = {message_id : event.message_id};
                            await BOTAPI(ctx, "delete_msg", 参数2);
                        }
                    }
                }
            }
            // ================== 打卡 ==================
            let 今天 = timeA("y-m-d", Math.floor(Date.now() / 1000));
            let 全群打卡 = readB(`筱筱吖/事件系统/全局.json`, "全群打卡", "关闭");
            if(全群打卡 == "开启"){
                let 打卡状态 = readB(`筱筱吖/全群打卡/打卡状态/${今天}.json`, event.group_id, "未");
                if(打卡状态 == "未"){
                    writeB(`筱筱吖/全群打卡/打卡状态/${今天}.json`, event.group_id, "已");
                    let 参数 = {group_id : event.group_id};
                    BOTAPI(ctx, "send_group_sign", 参数);
                }
            }
            // ================== 违禁词检测（全局优先 + 本群兜底） ==================
            let 违禁词已接管 = false;
            let 违禁词已撤回 = false;
            let 违禁开关 = readB(`筱筱吖/事件系统/${event.group_id}.json`, "违禁检测", "关闭");
            if(违禁开关 == "开启" && !(await mkIsPardonExempt(ctx, event, event.user_id))){
                // 先文本匹配，命中后才查身份；全局命中即接管，跳过本群词库二次判断
                const 违禁等级缓存 = { bot: 机器人等级, user: 用户等级 };
                const 违禁结果 = await mkApplyGlobalOrGroupForbidden(ctx, event, eventForbiddenWordMatchText(event), 违禁等级缓存);
                机器人等级 = 违禁等级缓存.bot;
                用户等级 = 违禁等级缓存.user;
                违禁词已接管 = 违禁结果.handled;
                违禁词已撤回 = 违禁结果.recalled;
            }
            // ================== 锁名系统检测开始（优先级高于马甲系统） ==================
            let 锁名内容 = "";
            if(mkLockNameEventOn(event.group_id)){
                锁名内容 = mkLockNameOf(event.group_id, event.user_id);
                if(锁名内容 && event.sender.card != 锁名内容){
                    // ================== 二次正确赋值 ==================
                    if(机器人等级 == 0){
                        let 参数188 = {group_id : event.group_id,user_id : event.self_id};
                        let dp188 = await BOTAPI(ctx, "get_group_member_info", 参数188);
                        let Robot身份 = (RC_group_role[(dp188?.role || "member")] || 0);
                        机器人等级 = Robot身份;
                    }
                    // ================== 判断是否有权限(2级即可) ==================
                    if(机器人等级 >= 2){
                        try {
                            let 参数 = {"group_id": event.group_id, "user_id": event.user_id, "card": 锁名内容};
                            await BOTAPI(ctx, "set_group_card", 参数);
                        } catch (_e) {
                            // QQ 拒改（超长/对方权限更高等）时静默跳过
                        }
                    }
                }
            }
            // ================== 马甲系统检测开始（已锁名的用户跳过） ==================
            let 马甲开关 = readB(`筱筱吖/事件系统/${event.group_id}.json`, "马甲系统", "关闭");
            if(马甲开关 == "开启" && !锁名内容){
                let 马甲 = (readA(`筱筱吖/群管系统/马甲系统/${event.group_id}.json`) || "天宫☆");
                let 字数 = (马甲.length || 0);
                let 原名 = sanitizeMajiaNickname(event.sender.nickname);
                let 现名 = event.sender.card;
                // 进阶检测开启时：昵称含违禁词则用 QQ 号，QQ 号也含违禁词则用 -
                let 马甲进阶 = readB(`筱筱吖/事件系统/${event.group_id}.json`, "进阶检测", "关闭") == "开启";
                // 免死金牌成员豁免违禁词兜底：仍照常用「马甲+原名」
                if(马甲进阶 && await mkIsPardonExempt(ctx, event, event.user_id)){
                    马甲进阶 = false;
                }
                let 组装后 = mkMajiaBuildCard(event.group_id, 马甲, event.sender.nickname, event.user_id, 马甲进阶);
                if(字数 > 0 && 原名 && 组装后 != 现名){
                    // ================== 二次正确赋值 ==================
                    if(机器人等级 == 0){
                        let 参数188 = {group_id : event.group_id,user_id : event.self_id};
                        let dp188 = await BOTAPI(ctx, "get_group_member_info", 参数188);
                        let Robot身份 = (RC_group_role[(dp188?.role || "member")] || 0);
                        机器人等级 = Robot身份;
                    }
                    // ================== 判断是否有权限(2级即可) ==================
                    if(机器人等级 >= 2){
                        try {
                            let 参数 = {"group_id": event.group_id, "user_id": event.user_id, "card": 组装后};
                            await BOTAPI(ctx, "set_group_card", 参数);
                        } catch (_e) {
                            // QQ 拒改（超长等）时静默跳过，避免刷屏 ERROR
                        }
                    }
                }
            }
            // ================== 高级检测 - 专门检测卡片的/合并转发消息的 ==================
            //const leixing = ["video", "json", "forward", "xml"];
            //const oooooo = event.message[0].type;
            //const ispp = ownerQQs.includes(oooooo);//展示不想写这个，先放着
            let 储存消息类型 = [];
            // 全局/本群违禁词已在上方撤回或踢出时，禁发检测无需重复处理
            let 消息是否已被撤回 = 违禁词已撤回;
            let 进阶开关 = readB(`筱筱吖/事件系统/${event.group_id}.json`, "进阶检测", "关闭");
            let cunhhh = (event.message.length || 0);
            for(let i = 0; i < cunhhh; i++){
                const seg = event.message[i];
                const segType = seg && typeof seg === "object" ? seg.type : "";
                if(segType){
                    储存消息类型.push(segType);
                }
            }
            // ================== 高级检测 - 专门检测卡片的/合并转发消息的 ==================
            if(储存消息类型.includes("json") || 储存消息类型.includes("forward")){
                if(进阶开关 == "开启" && !(await mkIsPardonExempt(ctx, event, event.user_id))){
                    // ================== 二次正确赋值 ==================
                    if(机器人等级 == 0){
                        let 参数188 = {group_id : event.group_id,user_id : event.self_id};
                        let dp188 = await BOTAPI(ctx, "get_group_member_info", 参数188);
                        let Robot身份 = (RC_group_role[(dp188?.role || "member")] || 0);
                        机器人等级 = Robot身份;
                    }
                    if(机器人等级 >= 2){
                        // ================== 三次正确赋值 ==================
                        if(用户等级 == 0){
                            let 参数199 = {group_id : event.group_id,user_id : event.user_id};
                            let dp199 = await BOTAPI(ctx, "get_group_member_info", 参数199);
                            let 用户身份 = (RC_group_role[(dp199?.role || "member")] || 0);
                            用户等级 = 用户身份;
                        }
                        if(机器人等级 > 用户等级){//神权王
                            // ================== 高级违禁词验证（合并转发 + JSON/XML 卡片统一扫描；全局优先） ==================
                            let 违禁开关2 = readB(`筱筱吖/事件系统/${event.group_id}.json`, "违禁检测", "关闭");
                            // 上方普通文本检测未接管时才在此扫卡片/合并转发，避免同一条消息重复处置
                            if(违禁开关2 == "开启" && !违禁词已接管){
                                const 高级等级缓存 = { bot: 机器人等级, user: 用户等级 };
                                // collectForbiddenWordMatchText 会递归 forward/node，并提取 json/xml 卡片可见文本
                                const 高级结果 = await mkApplyGlobalOrGroupForbidden(ctx, event, collectForbiddenWordMatchText(event.message), 高级等级缓存);
                                机器人等级 = 高级等级缓存.bot;
                                用户等级 = 高级等级缓存.user;
                                if(高级结果.recalled){ 消息是否已被撤回 = true; }
                            }//进阶违禁检测结束
                        }
                    }
                }
            }
            // ================== 高级检测结束 ==================
            // ================== 禁发检测 ==================
            if(消息是否已被撤回 == false && 进阶开关 == "开启" && !(await mkIsPardonExempt(ctx, event, event.user_id))){
                let 类型次数 = (储存消息类型.length || 0);
                let 是否执行 = false;
                for(let i = 0; i < 类型次数; i++){
                    let 本次类型 = 储存消息类型[i];
                    let 本次开关 = readB(`筱筱吖/群管功能/违禁系统/${event.group_id}/禁发管理.json`, 本次类型, "关闭");
                    if(本次开关 == "开启"){
                        是否执行 = true;
                    }
                }
                //
                if(是否执行 == true){
                    // ================== 二次正确赋值 ==================
                    if(机器人等级 == 0){
                        let 参数188 = {group_id : event.group_id,user_id : event.self_id};
                        let dp188 = await BOTAPI(ctx, "get_group_member_info", 参数188);
                        let Robot身份 = (RC_group_role[(dp188?.role || "member")] || 0);
                        机器人等级 = Robot身份;
                    }
                    if(机器人等级 >= 2){
                        // ================== 三次正确赋值 ==================
                        if(用户等级 == 0){
                            let 参数199 = {group_id : event.group_id,user_id : event.user_id};
                            let dp199 = await BOTAPI(ctx, "get_group_member_info", 参数199);
                            let 用户身份 = (RC_group_role[(dp199?.role || "member")] || 0);
                            用户等级 = 用户身份;
                        }
                    }
                    if(机器人等级 > 用户等级){//神权王
                        let 类型 = readB(`筱筱吖/群管系统/违禁系统/${event.group_id}/处理.json`, "方式", "撤回");
                        let 时长 = readB(`筱筱吖/群管系统/违禁系统/${event.group_id}/处理.json`, "时长", 600);
                        if(类型 == "禁言"){
                            let 参数 = {group_id : event.group_id,user_id : event.user_id,duration : 时长};
                            BOTAPI(ctx, "set_group_ban", 参数);
                            消息是否已被撤回 = true;
                        }else if(类型 == "撤回"){
                            let 参数 = {message_id : event.message_id};
                            await BOTAPI(ctx, "delete_msg", 参数);
                            消息是否已被撤回 = true;
                        }else{
                            //撤回+禁言
                            let 参数1 = {group_id : event.group_id,user_id : event.user_id,duration : 时长};
                            BOTAPI(ctx, "set_group_ban", 参数1);
                            let 参数2 = {message_id : event.message_id};
                            await BOTAPI(ctx, "delete_msg", 参数2);
                            消息是否已被撤回 = true;
                        }
                    }
                }
            }
            // ================== 禁发检测结束 ==================
        }
    }
}


/** 群聊视频解析：解析成功小表情（吃糖，与伪造聊天一致） */
async function 视频解析群聊回应解析成功(event, ctx) {
    if (event.message_type !== "group") return;
    await reactFakeChatCommandMessage(ctx, event.message_id, FAKE_CHAT_EMOJI_REACT_PARSE_OK, BOTAPI);
}

/** 临时视频目录：与「消息记录」同级 */
function mkGetTempVideoDir() {
    const 读写根 = getDataPath() || ".";
    return path.join(path.dirname(path.dirname(读写根)), "临时视频");
}

/** 临时图片目录：与「消息记录」「临时视频」同级 → kakake/data/临时图片 */
function mkGetTempImageDir() {
    const 读写根 = getDataPath() || ".";
    return path.join(path.dirname(path.dirname(读写根)), "临时图片");
}

function mkCleanupTempImageFiles(filePaths) {
    for (const fp of filePaths || []) {
        try {
            if (fp && fs.existsSync(fp)) fs.unlinkSync(fp);
        } catch (e) {
            logger?.warn?.(`[临时图片] 清理失败 路径=${fp}`, e?.message || e);
        }
    }
}

function 视频解析账号头像(event) {
    return `https://q4.qlogo.cn/g?b=qq&nk=${event.self_id}&s=5`;
}

/** 封面为空时回退机器人账号头像（与视频菜单一致） */
function 视频解析安全封面(event, 封面) {
    const c = String(封面 || "").trim();
    return c || 视频解析账号头像(event);
}

function 视频解析清理本地文件(filePath) {
    try {
        if (filePath && fs.existsSync(filePath)) fs.unlinkSync(filePath);
    } catch (e) {
        logger?.warn?.(`[视频解析] 清理临时视频失败 路径=${filePath}`, e?.message || e);
    }
}

/** 视频体积上限：超过则合并转发内改放 URL */
const MK_VIDEO_SEND_MAX_BYTES = 100 * 1024 * 1024;
/** 音频文件体积上限：超过则合并转发内改放 URL（文件段，非语音） */
const MK_AUDIO_FILE_MAX_BYTES = 50 * 1024 * 1024;
/** 图片/封面/动图体积上限：超过则合并转发内改放 URL */
const MK_IMAGE_FILE_MAX_BYTES = 20 * 1024 * 1024;

/** 探测远端体积：HEAD 优先，不支持则用 Range 首字节读 Content-Range；拿不到返回 null */
async function 视频解析探测体积(url, timeoutMs = 15000) {
    const 单次 = async (method, extraHeaders) => {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), Math.max(3000, Number(timeoutMs) || 15000));
        try {
            const res = await fetch(url, {
                method,
                headers: { ...mkBuildDownloadHeaders(url), ...(extraHeaders || {}) },
                signal: controller.signal,
            });
            try {
                await res.body?.cancel?.();
            } catch {
                // ignore
            }
            if (!res.ok && res.status !== 206) return null;
            const range = res.headers.get("content-range");
            const 总长 = String(range || "").match(/\/(\d+)\s*$/);
            if (总长) return Number(总长[1]);
            if (!extraHeaders?.Range) {
                const len = Number(res.headers.get("content-length"));
                if (Number.isFinite(len) && len > 0) return len;
            }
            return null;
        } catch {
            return null;
        } finally {
            clearTimeout(timer);
        }
    };
    const byHead = await 单次("HEAD");
    if (byHead != null) return byHead;
    return await 单次("GET", { Range: "bytes=0-0" });
}

function 视频解析安全文件名(name, fallback = "media") {
    return String(name || fallback)
        .replace(/[^\w\u4e00-\u9fff\-]+/g, "_")
        .replace(/^_+|_+$/g, "")
        .slice(0, 40) || fallback;
}

function 视频解析取音频链接(music) {
    if (!music) return "";
    if (typeof music === "string") {
        const s = music.trim();
        return /^https?:\/\//i.test(s) ? s : "";
    }
    if (typeof music === "object") {
        for (const key of ["url", "playUrl", "play_url", "uri"]) {
            const v = music[key];
            if (typeof v === "string" && /^https?:\/\//i.test(v.trim())) return v.trim();
            if (v && typeof v === "object") {
                const nested = v.uri || v.url || (Array.isArray(v.url_list) ? v.url_list[0] : "") || (Array.isArray(v.urlList) ? v.urlList[0] : "");
                if (typeof nested === "string" && /^https?:\/\//i.test(nested.trim())) return nested.trim();
            }
        }
    }
    return "";
}

function 视频解析音频展示名(music, title) {
    if (music && typeof music === "object") {
        const n = String(music.title || music.name || "").trim();
        if (n) return `${视频解析安全文件名(n, "audio")}.mp3`;
    }
    return `${视频解析安全文件名(title, "audio")}.mp3`;
}

/**
 * 下载到临时目录；过大或失败返回 { ok:false }，成功返回本地路径。
 * cleanup 数组会登记成功路径，由调用方在合并转发发出后清理。
 */
async function 视频解析下载临时文件(url, {
    ext = ".bin",
    basename = "media",
    maxBytes = MK_VIDEO_SEND_MAX_BYTES,
    timeoutMs = 0,
    cleanup = null,
} = {}) {
    const src = String(url || "").trim();
    if (!src) return { ok: false };
    const 临时目录 = mkGetTempVideoDir();
    try {
        fs.mkdirSync(临时目录, { recursive: true });
    } catch {
        return { ok: false };
    }
    const 远端体积 = await 视频解析探测体积(src, Math.min(15000, timeoutMs || 15000));
    if (远端体积 != null && 远端体积 > maxBytes) {
        return { ok: false, tooLarge: true, size: 远端体积 };
    }
    const 本地路径 = path.join(
        临时目录,
        `${Date.now()}_${视频解析安全文件名(basename)}.${String(ext).replace(/^\./, "")}`,
    );
    try {
        const downloaded = await downloadFile(src, 本地路径, true, timeoutMs);
        if (!downloaded || !fs.existsSync(本地路径)) {
            视频解析清理本地文件(本地路径);
            return { ok: false };
        }
        if (Array.isArray(cleanup)) cleanup.push(本地路径);
        return { ok: true, path: 本地路径 };
    } catch {
        视频解析清理本地文件(本地路径);
        return { ok: false };
    }
}

/** 合并转发节点：视频成功下本地 file，失败/过大则放 URL 文本 */
async function 视频解析构建视频节点(event, {
    nodeName,
    label = "",
    videoUrl,
    timeoutMs,
    cleanup,
}) {
    const url = String(videoUrl || "").trim();
    if (!url) return null;
    const dl = await 视频解析下载临时文件(url, {
        ext: "mp4",
        basename: label || nodeName || "video",
        maxBytes: MK_VIDEO_SEND_MAX_BYTES,
        timeoutMs,
        cleanup,
    });
    if (dl.ok) {
        const content = [];
        if (label) content.push(段_文本(label));
        content.push(段_视频(dl.path));
        return 合并节点(nodeName, event.self_id, content);
    }
    const content = [];
    if (label) content.push(段_文本(label));
    content.push(段_文本(url));
    return 合并节点(nodeName, event.self_id, content);
}

function 视频解析猜测图片扩展名(url) {
    const m = String(url || "").split("?")[0].match(/\.(jpe?g|png|gif|webp|bmp)$/i);
    if (!m) return "jpg";
    const ext = m[1].toLowerCase();
    return ext === "jpeg" ? "jpg" : ext;
}

/** 图片段：先下本地，失败/过大则返回 URL 文本段 */
async function 视频解析构建图片内容段(url, { timeoutMs, cleanup } = {}) {
    const src = String(url || "").trim();
    if (!src) return null;
    const dl = await 视频解析下载临时文件(src, {
        ext: 视频解析猜测图片扩展名(src),
        basename: "image",
        maxBytes: MK_IMAGE_FILE_MAX_BYTES,
        timeoutMs,
        cleanup,
    });
    if (dl.ok) return 段_图片(dl.path);
    return 段_文本(src);
}

/** 合并转发节点：图片成功下本地，失败/过大则放 URL */
async function 视频解析构建图片节点(event, {
    nodeName,
    label = "",
    imageUrl,
    timeoutMs,
    cleanup,
}) {
    const seg = await 视频解析构建图片内容段(imageUrl, { timeoutMs, cleanup });
    if (!seg) return null;
    const content = [];
    if (label) content.push(段_文本(label));
    content.push(seg);
    return 合并节点(nodeName, event.self_id, content);
}

/** 合并转发节点：有音频则下成本地「文件」段；失败/过大则放 URL（不是语音） */
async function 视频解析构建音频文件节点(event, {
    nodeName = "音频",
    music,
    title = "",
    timeoutMs,
    cleanup,
}) {
    const url = 视频解析取音频链接(music);
    if (!url) return null;
    const fileName = 视频解析音频展示名(music, title);
    const dl = await 视频解析下载临时文件(url, {
        ext: "mp3",
        basename: path.basename(fileName, path.extname(fileName)) || "audio",
        maxBytes: MK_AUDIO_FILE_MAX_BYTES,
        timeoutMs,
        cleanup,
    });
    if (dl.ok) {
        return 合并节点(nodeName, event.self_id, [段_文件(dl.path, fileName)]);
    }
    return 合并节点(nodeName, event.self_id, [段_文本(url)]);
}

/** 仅合并转发输出，不另发群内提示文案 */
async function 视频解析发出合并转发(event, ctx, {
    platform,
    title = "",
    nodes,
}) {
    const list = Array.isArray(nodes) ? nodes.filter(Boolean) : [];
    if (!list.length) return false;
    return await 发合并消息(
        event,
        list,
        合并预览("视频解析", platform, "[视频解析]", [String(title || platform || "视频解析")]),
    );
}

async function 视频解析统一输出(event, ctx, {
    platform,
    title = "",
    infoText = "",
    cover = "",
    videoUrl = "",
    images = null,
    liveItems = null,
    music = null,
    nodePrefix = "",
}) {
    const timeoutMs = mkBotResolveHostApiTimeoutMs(ctx);
    const cleanup = [];
    const prefix = String(nodePrefix || platform || "解析");
    const nodes = [];
    try {
        const 封面 = String(cover || "").trim();
        const 信息 = String(infoText || "").trim();
        if (信息 || 封面) {
            const content = [];
            if (信息) content.push(段_文本(信息));
            if (封面) {
                const coverSeg = await 视频解析构建图片内容段(封面, { timeoutMs, cleanup });
                if (coverSeg) content.push(coverSeg);
            }
            if (!content.length) content.push(段_文本(""));
            nodes.push(合并节点(prefix, event.self_id, content));
        }

        if (Array.isArray(images) && images.length) {
            for (let index = 0; index < images.length; index++) {
                const u = String(images[index] || "").trim();
                if (!u) continue;
                nodes.push(await 视频解析构建图片节点(event, {
                    nodeName: prefix,
                    label: `[${index + 1}/${images.length}]`,
                    imageUrl: u,
                    timeoutMs,
                    cleanup,
                }));
            }
        }

        if (Array.isArray(liveItems) && liveItems.length) {
            for (let index = 0; index < liveItems.length; index++) {
                const item = liveItems[index] || {};
                const 视频链接 = String(item.video || item["视频"] || "").trim();
                const 图片链接 = String(item.image || item["图片"] || "").trim();
                const label = `[${index + 1}/${liveItems.length}]`;
                if (视频链接) {
                    nodes.push(await 视频解析构建视频节点(event, {
                        nodeName: prefix,
                        label,
                        videoUrl: 视频链接,
                        timeoutMs,
                        cleanup,
                    }));
                } else if (图片链接) {
                    nodes.push(await 视频解析构建图片节点(event, {
                        nodeName: prefix,
                        label,
                        imageUrl: 图片链接,
                        timeoutMs,
                        cleanup,
                    }));
                }
            }
        }

        if (videoUrl) {
            nodes.push(await 视频解析构建视频节点(event, {
                nodeName: prefix,
                label: "",
                videoUrl,
                timeoutMs,
                cleanup,
            }));
        }

        const audioNode = await 视频解析构建音频文件节点(event, {
            nodeName: `${prefix}音频`,
            music,
            title,
            timeoutMs,
            cleanup,
        });
        if (audioNode) nodes.push(audioNode);

        return await 视频解析发出合并转发(event, ctx, { platform, title, nodes });
    } finally {
        for (const fp of cleanup) 视频解析清理本地文件(fp);
    }
}




if(message.match(/([\s\S]*)/)){
    // ================== 检 ==================
    let 解析开关 = readB(`筱筱吖/事件系统/${event.group_id}.json`, "视频解析", "关闭");
    if(RC_sq == "已授权" && event.message_type == "group" && 解析开关 == "开启"){
        const 解析首段 = Array.isArray(event.message) && event.message.length > 0 ? event.message[0] : null;
        const 解析首段类型 = 解析首段 && typeof 解析首段 === "object" ? 解析首段.type : "";
        let 解析链接 = ``;
        let 解析方向 = `哔哩哔哩`;
        const 链接扫描文本 = eventUserTextFromSegments(event);
        // ================== 通过卡片取链接 ==================
        if(解析首段类型 == "json"){
            // 如果是字符串，需要解析
            let jsonData;
            if(typeof event.message[0].data.data === 'string'){
                jsonData = JSON.parse(event.message[0].data.data);
            } else {
                jsonData = event.message[0].data.data;
            }
            let 标题 = jsonData?.meta?.detail_1?.title
            if(标题 == "哔哩哔哩"){
                解析链接 = jsonData?.meta?.detail_1?.qqdocurl;
                //logger.info(`成功接收:${解析链接}`);
                解析方向 = "哔哩哔哩";
            }
        }
        // ================== 通过文本区链接 ==================
        const 取链接 = 链接扫描文本.match(/https?:\/\/b23\.tv\/[a-zA-Z0-9]+/i)?.[0] || 链接扫描文本.match(/https?:\/\/(?:www\.)?bilibili\.com\/video\/BV[a-zA-Z0-9]{10}/i)?.[0];
        if(取链接 && 解析链接 == ``){
            解析链接 = 取链接;
            //logger.info(`成功接收2:${取链接}`);
            解析方向 = "哔哩哔哩";
        }
        // ================== 通过文本区链接 - 抖音 ==================
        const 抖音链接 = 链接扫描文本.match(/https?:\/\/v\.douyin\.com\/[\w-]+/i)?.[0];
        if(抖音链接 && 解析链接 == ``){
            解析链接 = 抖音链接;
            解析方向 = "抖音";
        }
        // ================== 通过文本区链接 - 小红书==================
        const 小红书链接 = 链接扫描文本.match(/https?:\/\/xhslink\.com\/[^\s\]]+/i)?.[0] || 链接扫描文本.match(/https?:\/\/(?:www\.)?xiaohongshu\.com\/[^\s\]]+/i)?.[0];
        if(小红书链接 && 解析链接 == ``){
            解析链接 = 小红书链接;
            解析方向 = "小红书";
        }
        // ================== 通过文本区链接 - 快手 ==================
        const 快手链接 = 链接扫描文本.match(/https?:\/\/v\.kuaishou\.com\/[\w-]+/i)?.[0];
        if(快手链接 && 解析链接 == ``){
            解析链接 = 快手链接;
            解析方向 = "快手";
        }
        // ================== 通过文本区链接 - YouTube ==================
        const 油管链接 =
            链接扫描文本.match(/https?:\/\/(?:www\.|m\.|music\.)?youtube\.com\/(?:shorts|embed|live)\/[\w-]+(?:\?[^\s\]]*)?/i)?.[0]
            || 链接扫描文本.match(/https?:\/\/(?:www\.|m\.|music\.)?youtube\.com\/watch\?[^\s\]]+/i)?.[0]
            || 链接扫描文本.match(/https?:\/\/youtu\.be\/[\w-]+(?:\?[^\s\]]*)?/i)?.[0]
            || 链接扫描文本.match(/https?:\/\/(?:www\.)?youtube-nocookie\.com\/embed\/[\w-]+(?:\?[^\s\]]*)?/i)?.[0];
        if(油管链接 && 解析链接 == ``){
            解析链接 = 油管链接;
            解析方向 = "YouTube";
        }
        // ================== 通过文本区链接 - TikTok ==================
        const TikTok链接 =
            链接扫描文本.match(/https?:\/\/(?:www\.)?tiktok\.com\/t\/[\w-]+\/?(?:\?[^\s\]]*)?/i)?.[0]
            || 链接扫描文本.match(/https?:\/\/(?:vm|vt|t)\.tiktok\.com\/[\w-]+\/?(?:\?[^\s\]]*)?/i)?.[0]
            || 链接扫描文本.match(/https?:\/\/(?:www\.|m\.)?tiktok\.com\/@[^/\s\]]+\/video\/\d+(?:\?[^\s\]]*)?/i)?.[0];
        if(TikTok链接 && 解析链接 == ``){
            解析链接 = TikTok链接;
            解析方向 = "TikTok";
        }
        // ================== 最终结果 ==================
        if(解析链接 != ``){
            // 匹配成功立即表情回应（不等解析完成）
            await 视频解析群聊回应解析成功(event, ctx);
            // ================== 访问接口 ==================
            if(解析方向 == "哔哩哔哩"){
                const API_shuju = await callLocalVideoApi(PLUGIN_DIR, 'blbl', 解析链接);
                if(API_shuju["状态码"] == 200){
                    const 标题 = API_shuju["数据"]["视频标题"];
                    const 描述 = API_shuju["数据"]["视频描述"];
                    const 封面 = API_shuju["数据"]["视频封面"];
                    const 链接 = API_shuju["数据"]["视频链接"];
                    const 时长 = API_shuju["数据"]["视频时长"];
                    const 大小 = API_shuju["数据"]["视频大小"];
                    const 时间 = API_shuju["数据"]["发布时间"];
                    const 播放 = API_shuju["数据"]["播放次数"];
                    const 点赞 = API_shuju["数据"]["点赞数量"];
                    const 收藏 = API_shuju["数据"]["收藏数量"];
                    const 投币 = API_shuju["数据"]["投币数量"];
                    const 分享 = API_shuju["数据"]["分享数量"];
                    const 弹幕 = API_shuju["数据"]["弹幕数量"];
                    const 评论 = API_shuju["数据"]["评论数量"];
                    const up名字 = API_shuju["数据"]["UP主信息"]["UP主名称"];
                    let 返回内容 = `标题:${标题}\n`;
                    返回内容 += `简介:${描述}\n`;
                    返回内容 += `作者:${up名字}\n`;
                    返回内容 += `══════════════\n`;
                    返回内容 += `时长:${时长}\n`;
                    返回内容 += `大小:${大小}\n`;
                    返回内容 += `发布:${时间}\n`;
                    返回内容 += `══════════════\n`;
                    返回内容 += `播放:${播放}\n`;
                    返回内容 += `弹幕:${弹幕}\n`;
                    返回内容 += `评论:${评论}\n`;
                    返回内容 += `分享:${分享}\n`;
                    返回内容 += `点赞:${点赞}\n`;
                    返回内容 += `收藏:${收藏}\n`;
                    返回内容 += `投币:${投币}`;
                    await 视频解析统一输出(event, ctx, {
                        platform: "哔哩哔哩",
                        title: 标题,
                        infoText: 返回内容,
                        cover: 封面,
                        videoUrl: 链接,
                        nodePrefix: "哔哩哔哩",
                    });
                }else{
                    logger.error(`哔哩哔哩视频解析失败: ${API_shuju?.["消息"] ?? API_shuju?.msg ?? API_shuju?.["状态码"] ?? "未知错误"}`);
                }
            }else if(解析方向 == "抖音"){
                const API_shuju = await callLocalVideoApi(PLUGIN_DIR, 'dy', 解析链接);
                if(API_shuju["code"] == 200 && API_shuju["data"]){
                    const 数据 = API_shuju["data"];
                    const 类型 = 数据["type"];
                    const 标题 = 数据["title"] || 数据["desc"] || "";
                    const 作者 = 数据["author"]?.name || 数据["author"] || "";
                    const 封面 = 数据["cover"] || "";
                    const 音乐 = 数据["music"];
                    let 返回内容 = `标题:${标题}\n作者:${作者}`;
                    if(音乐 && typeof 音乐 === "object"){
                        返回内容 += `\n音乐:${音乐.title || ""}${音乐.author ? ` — ${音乐.author}` : ""}`;
                    }
                    if(类型 == "video" && 数据["duration"] != null){
                        返回内容 += `\n时长:${Math.round(Number(数据["duration"]) / 1000)}秒`;
                    }
                    if(类型 == "video"){
                        await 视频解析统一输出(event, ctx, {
                            platform: "抖音",
                            title: 标题,
                            infoText: 返回内容,
                            cover: 封面,
                            videoUrl: 数据["url"],
                            music: 音乐,
                            nodePrefix: "抖音",
                        });
                    }else if(类型 == "image"){
                        await 视频解析统一输出(event, ctx, {
                            platform: "抖音",
                            title: 标题,
                            infoText: 返回内容,
                            cover: 封面 || (Array.isArray(数据["images"]) ? 数据["images"][0] : ""),
                            images: 数据["images"],
                            music: 音乐,
                            nodePrefix: "抖音图集",
                        });
                    }else if(类型 == "live" || 类型 == "animated"){
                        const 实况图 = Array.isArray(数据["live_photo"]) ? 数据["live_photo"] : [];
                        const 图片 = Array.isArray(数据["images"]) ? 数据["images"] : [];
                        const liveItems = [];
                        const 节点总数 = Math.max(实况图.length, 图片.length);
                        for(let index = 0; index < 节点总数; index++){
                            const item = 实况图[index];
                            liveItems.push({
                                video: item?.["video"] ? String(item["video"]).trim() : "",
                                image: (item?.["image"] ? String(item["image"]).trim() : "") || (图片[index] ? String(图片[index]).trim() : ""),
                            });
                        }
                        await 视频解析统一输出(event, ctx, {
                            platform: "抖音",
                            title: 标题,
                            infoText: 返回内容,
                            cover: 封面,
                            liveItems,
                            music: 音乐,
                            nodePrefix: 类型 == "animated" ? "抖音动图" : "抖音实况",
                        });
                    }
                }else{
                    logger.error(`抖音视频解析失败: ${API_shuju?.["msg"] || '未知错误'} | 链接=${解析链接}`);
                }
            }else if(解析方向 == "小红书"){
                const API_shuju = await callLocalVideoApi(PLUGIN_DIR, 'xhs', 解析链接);
                if(API_shuju["success"] == true){
                    const 数据 = API_shuju["data"];
                    const 类型 = 数据["类型"];
                    const 标题 = 数据["标题"];
                    const 描述 = 数据["描述"];
                    const 作者 = 数据["作者"]["名称"];
                    const 封面 = 数据["封面"];
                    let 返回内容 = `标题:${标题}\n作者:${作者}\n描述:${描述}`;
                    if(类型 == "video"){
                        await 视频解析统一输出(event, ctx, {
                            platform: "小红书",
                            title: 标题,
                            infoText: 返回内容,
                            cover: 封面,
                            videoUrl: 数据["视频链接"],
                            nodePrefix: "小红书",
                        });
                    }else if(类型 == "image"){
                        await 视频解析统一输出(event, ctx, {
                            platform: "小红书",
                            title: 标题,
                            infoText: 返回内容,
                            cover: 封面,
                            images: 数据["图片"],
                            nodePrefix: "小红书图片",
                        });
                    }else if(类型 == "live"){
                        const 实况图 = Array.isArray(数据["实况图"]) ? 数据["实况图"] : [];
                        await 视频解析统一输出(event, ctx, {
                            platform: "小红书",
                            title: 标题,
                            infoText: 返回内容,
                            cover: 封面,
                            liveItems: 实况图.map((item) => ({
                                video: item?.["视频"] || "",
                                image: item?.["图片"] || "",
                            })),
                            nodePrefix: "小红书实况",
                        });
                    }
                }else{
                    logger.error(`小红书解析失败: ${API_shuju["error"] || '未知错误'}`);
                }
            }else if(解析方向 == "快手"){
                const API_shuju = await callLocalVideoApi(PLUGIN_DIR, 'ks', 解析链接);
                if(API_shuju["code"] == 200 && API_shuju["data"]){
                    const 数据 = API_shuju["data"];
                    const 类型 = 数据["type"];
                    const 标题 = 数据["title"];
                    const 作者 = 数据["author"];
                    const 封面 = 数据["cover"];
                    const 点赞 = 数据["like"];
                    const 时间戳 = 数据["time"];
                    const 发布时间 = 时间戳 ? new Date(Number(时间戳)).toLocaleString("zh-CN") : "";
                    const 音乐 = 数据["music"];
                    let 返回内容 = `标题:${标题 || ""}\n作者:${作者 || ""}`;
                    if(发布时间) 返回内容 += `\n发布:${发布时间}`;
                    返回内容 += `\n点赞:${点赞 ?? 0}`;
                    if(音乐 && typeof 音乐 === "object"){
                        返回内容 += `\n音乐:${音乐.name || ""}${音乐.artist ? ` — ${音乐.artist}` : ""}`;
                    }
                    if(类型 == "video"){
                        await 视频解析统一输出(event, ctx, {
                            platform: "快手",
                            title: 标题 || "快手视频",
                            infoText: 返回内容,
                            cover: 封面,
                            videoUrl: 数据["url"],
                            music: 音乐,
                            nodePrefix: "快手",
                        });
                    }else if(类型 == "image"){
                        if(数据["count"] != null) 返回内容 += `\n张数:${数据["count"]}`;
                        await 视频解析统一输出(event, ctx, {
                            platform: "快手",
                            title: 标题 || "快手图集",
                            infoText: 返回内容,
                            cover: 封面,
                            images: 数据["images"],
                            music: 音乐,
                            nodePrefix: "快手图集",
                        });
                    }
                }else{
                    logger.error(`快手解析失败: ${API_shuju["msg"] || API_shuju["code"] || "未知错误"}`);
                }
            }else if(解析方向 == "YouTube"){
                const API_shuju = await callLocalVideoApi(PLUGIN_DIR, 'yt', 解析链接);
                if(API_shuju["code"] == 200 && API_shuju["data"]){
                    const 数据 = API_shuju["data"];
                    const 标题 = 数据["title"] || "";
                    const 作者 = 数据["author"] || "";
                    let 返回内容 = `标题:${标题}\n作者:${作者}`;
                    if(数据["duration"] != null) 返回内容 += `\n时长:${Math.round(Number(数据["duration"]))}秒`;
                    await 视频解析统一输出(event, ctx, {
                        platform: "YouTube",
                        title: 标题 || "YouTube视频",
                        infoText: 返回内容,
                        cover: 数据["cover"] || "",
                        videoUrl: 数据["url"],
                        nodePrefix: "YouTube",
                    });
                }else{
                    logger.error(`YouTube解析失败: ${API_shuju?.["msg"] || API_shuju?.["code"] || "未知错误"} | 链接=${解析链接}`);
                }
            }else if(解析方向 == "TikTok"){
                const API_shuju = await callLocalVideoApi(PLUGIN_DIR, 'tt', 解析链接);
                if(API_shuju["code"] == 200 && API_shuju["data"]){
                    const 数据 = API_shuju["data"];
                    const 标题 = 数据["title"] || "";
                    const 作者 = 数据["author"] || "";
                    if(数据["cookie"]) mkSetVideoDownloadCookie("tiktok", 数据["cookie"]);
                    let 返回内容 = `标题:${标题}\n作者:${作者}`;
                    if(数据["duration"] != null) 返回内容 += `\n时长:${Math.round(Number(数据["duration"]))}秒`;
                    try {
                        if(数据["type"] == "image"){
                            await 视频解析统一输出(event, ctx, {
                                platform: "TikTok",
                                title: 标题 || "TikTok图集",
                                infoText: 返回内容,
                                cover: 数据["cover"] || "",
                                images: 数据["images"],
                                music: 数据["music"],
                                nodePrefix: "TikTok图集",
                            });
                        }else{
                            await 视频解析统一输出(event, ctx, {
                                platform: "TikTok",
                                title: 标题 || "TikTok视频",
                                infoText: 返回内容,
                                cover: 数据["cover"] || "",
                                videoUrl: 数据["url"],
                                music: 数据["music"],
                                nodePrefix: "TikTok",
                            });
                        }
                    } finally {
                        mkSetVideoDownloadCookie("tiktok", "");
                    }
                }else{
                    logger.error(`TikTok解析失败: ${API_shuju?.["msg"] || API_shuju?.["code"] || "未知错误"} | 链接=${解析链接}`);
                }
            }
        }
    }
}



if(isQqRedPacketLikeEvent(event)){
    if(event.message_type === "group"){//只检测群聊红包
        // ================== 授权判断 ==================
        if(RC_sq == "已授权"){
            // ================== 开关判断 ==================
            let 开关 = readB(`筱筱吖/事件系统/${event.group_id}.json`, "禁发红包", "关闭");
            if(开关 == "开启"){
                if(await mkIsPardonExempt(ctx, event, event.user_id)){
                    // 免死金牌：跳过禁发红包
                }else{
                // ================== 身份判断 ==================
                let dp188 = await BOTAPI(ctx, "get_group_member_info", {group_id : event.group_id,user_id : event.self_id});
                let dp199 = await BOTAPI(ctx, "get_group_member_info", {group_id : event.group_id,user_id : event.user_id});
                let Robot身份 = (RC_group_role[(dp188?.role || "member")] || 0);
                let 用户身份 = (RC_group_role[(dp199?.role || "member")] || 0);
                if(Robot身份 > 用户身份){
                    // ================== 撤回 ==================
                    let 参数 = {message_id : event.message_id};
                    try {
                        await BOTAPI(ctx, "delete_msg", 参数);
                    } catch (e) {
                        logger?.warn?.("[禁发红包] delete_msg 失败:", e?.message || e);
                    }
                }
                }
            }
        }
    }
}


if(message.match(/([\s\S]*)/)){
    const 问答文本 = eventUserTextFromSegments(event);
    if(event.message_type == "group"){
        let 问答开关 = readB(`筱筱吖/事件系统/${event.group_id}.json`, "问答系统", "关闭");
        if(问答开关 == "开启"){
            await mkQaTryMatchAndReply(event, 问答文本, [
                mkQaLoadStore("全局"),
                mkQaLoadStore(event.group_id),
            ]);
        }
    } else if(event.message_type == "private" && RC_sq == "已授权"){
        await mkQaTryMatchAndReply(event, 问答文本, [
            mkQaLoadStore("全局"),
            mkQaLoadStore("私聊"),
        ]);
    }
}

// ================== 表情制作（实现见 ./auth/bqb.ts） ==================
const bqbResult = await handleBqbCommands(message, event, ctx, RC_sq, {
  readB,
  getDataPath,
  pluginDir: String(ctx?.pluginPath || PLUGIN_DIR || '').trim(),
  logger,
  botApi: BOTAPI,
});
if (bqbResult === 'halt') {
  return null;
}


    return null;
}



// ================== 通知事件处理 ==================
async function handleNotice(event, ctx) {
const noticeType = event.notice_type;




// ================== 特殊通知 - 点赞==================
if(event.sub_type === "profile_like"){
    let 开关 = readB(`筱筱吖/事件系统/全局.json`, "自动点赞", "关闭");
    if(开关 == "开启"){
        //ctx.logger.info(`2用户${event.operator_id}给${event.self_id}点了${event.times}个赞`);//调试
        let 回赞数量 = 10;
        if(event.times > 20){
            回赞数量 = 10;
        }else{
            回赞数量 = event.times;
        }
        // ================== 调用接口 ==================
        let 参数 = {"user_id": event.operator_id, "times": 回赞数量};
        const dp = await BOTAPI(ctx, "send_like", 参数);
        return null;
    }
}




// ================== 群聊的 ==================
const RC_sq = await checkAuthStatus(event);

// ================== 全局开关 - 群聊&私聊 ==================
if(event.group_id && !mkGroupExecAllowed(event.group_id)){
    return null;
}
if(!event.group_id && !mkPrivateExecAllowed(event.user_id)){
    return null;
}


// ================== 授权匹配 ==================
if(RC_sq != "已授权"){
    return null;
}

// ================== 消息记录 · 撤回追回 ==================
if(noticeType === "group_recall" || noticeType === "friend_recall"){
    await mkHandleMessageRecallNotify(event, ctx);
    return null;
}


// ================== 拍一拍回复 ==================
if(event.sub_type === "poke"){
    let 发起者 = event.user_id;
    let 被拍者 = event.target_id;
    let 发送方式 = isImageRenderEnabled(readB);
    if(发送方式 == true){
        if(event.target_id == event.self_id){
            // ================== 数据读取 ==================
            let 今天 = timeA("y-m-d", Math.floor(Date.now() / 1000));
            let 文件 = `筱筱吖/扩展功能/拍一拍记录/${今天}/群.json`;
            let 来源 = event.group_id;
            if(!event.group_id){
                文件 = `筱筱吖/扩展功能/拍一拍记录/${今天}/私.json`;
                来源 = event.user_id;
            }
            let 数 = readB(`${文件}`, 来源, 0);
            writeB(`${文件}`, 来源, 数 + 1);
            // ================== 第一档回复数据 ==================
            let 返回列表 = [
                " 嗯？有什么事吗？",
                " 喵～在这里哦",
                " 呼～刚刚打了个小盹",
                " 补药拍窝！",
                " 补药拍啦！再拍就傻啦！",
                " 诶嘿，突然出现！",
                " 哇，吓我一跳～",
                " 转圈圈～晕乎乎的",
                " 电量不足，需要抱抱充电～",
                " 怎么啦？",
                " 突然被cue到！"
            ];
            // ================== 第二档回复数据 ==================
            if(数 > 15){
                返回列表.push(" 补药拍我啦！");
                返回列表.push(" 补药拍我啦，会傻的！");
                返回列表.push(" 你拍我？我也拍你！");
            }
            // ================== 随机抽取 ==================
            let 随机数 = rand(0, 返回列表.length-1);
            let 输出结果 = 返回列表[随机数];
            // ================== 输出结果 ==================
            let fakeEvent = {message_type: "private", user_id: event.user_id};
            let 反拍 = {"user_id": event.user_id};
            if(event.group_id){
                fakeEvent = {message_type: "group", group_id: event.group_id};
                反拍 = {"group_id":event.group_id, "user_id": event.user_id};
            }
            await 发消息(fakeEvent, [段_文本(`${输出结果}`)]);
            // ================== 是否拍回去 ==================
            if(输出结果 == " 你拍我？我也拍你！"){
                BOTAPI(ctx, "friend_poke", 反拍);
            }
        }
    }
}



// ================== 群禁言事件处理 ==================
if(noticeType === "group_ban") {
    // ================== 检 ==================
    let jj_ofu = readB(`筱筱吖/事件系统/${event.group_id}.json`, "禁言通知", "关闭");
    if(jj_ofu == "开启"){
        // ================== 输出地方 ==================
        let fakeEvent = {message_type: "group", group_id: event.group_id};
        let 返回内容 = ``;
        // ================== 单向操作 ==================
        if(event.user_id != 0){
            // ================== 禁言 ==================
            if(event.sub_type == "ban"){
                if(event.user_id == event.self_id){//如果是机器人被叼
                    return null;
                }
                返回内容 = `${event.user_id}被禁言了【${event.duration}】秒哎～他又不说话了，你总是这样....`;
                await 发消息(fakeEvent, 返回内容);
            // ================== 解禁 ==================
            }else{
                if(event.user_id == event.self_id){//如果是机器人被解开
                    返回内容 = `终于给我解开啦～！窝又可以叭叭叭了！`;
                }else{
                    返回内容 = `${event.user_id}被解禁了哎～他又可以说话了！`;
                }
                await 发消息(fakeEvent, 返回内容);
            }
        // ================== 全体操作 ==================
        }else{
            // ================== 全体禁言 ==================
            if(event.sub_type == "ban"){
                let 参数188 = {group_id : event.group_id,user_id : event.self_id};
                let dp188 = await BOTAPI(ctx, "get_group_member_info", 参数188);
                let Robot身份 = (RC_group_role[(dp188?.role || "member")] || 0);
                if(Robot身份 >= 2){
                    返回内容 = `全体禁言了唉～！大家怎么都不说话了，是不爱说话嘛～？`;
                    await 发消息(fakeEvent, 返回内容);
                }
            // ================== 全体解禁 ==================
            }else{
                返回内容 = `全体闭嘴模式被关闭了唉！！！大家又可以唠嗑了！`;
                await 发消息(fakeEvent, 返回内容);
            }
        }
    }
    return null;
}


// ================== 已入群通知 ==================
if (noticeType === "group_increase") {
    if (mkIsDuplicateGroupIncrease(event)) {
        logger?.warn?.(`[入群通知] 已忽略重复 group_increase：群${event.group_id} 用户${event.user_id}`);
        return null;
    }
    let 放行标准 = true;
    writeB(`筱筱吖/群管系统/入群审核/${event.group_id}/审核状态.json`, event.user_id, "无");
    writeB(`筱筱吖/群管系统/入群审核/${event.group_id}/次数.json`, event.user_id, 0);
    // ================== 黑名单 ==================
    let 黑白开关 = readB(`筱筱吖/事件系统/${event.group_id}.json`, "黑白名单", "关闭");
    if(黑白开关 == "开启"){
        let data1 = JSON.parse(readA(`筱筱吖/群管系统/黑白名单/全局/人员.json`) || "[]");
        let data2 = JSON.parse(readA(`筱筱吖/群管系统/黑白名单/群聊/${event.group_id}/人员.json`) || "[]");
        let ishmd1 = data1.includes(String(event.user_id));
        let ishmd2 = data2.includes(String(event.user_id));
        if(ishmd1 || ishmd2){
            let 参数188 = {group_id : event.group_id,user_id : event.self_id};
            let dp188 = await BOTAPI(ctx, "get_group_member_info", 参数188);
            let Robot身份 = (RC_group_role[(dp188?.role || "member")] || 0);
            if(Robot身份 >= 2){//有神权
                let 参数199 = {group_id : event.group_id,user_id : event.user_id};
                let dp199 = await BOTAPI(ctx, "get_group_member_info", 参数199);
                let 用户身份 = (RC_group_role[(dp199?.role || "member")] || 0);
                if(Robot身份 > 用户身份){//比你大
                    //logger.error("触发黑名单");
                    放行标准 = false;
                    let jjj = {"踢出" : false, "黑踢" : true};
                    let 参数 = {group_id : event.group_id,user_id : [event.user_id],reject_add_request : false};
                    if(data1.includes(event.user_id)){//全局黑名单
                        let nm1 = readB(`筱筱吖/群管系统/黑白名单/全局/处理方式.json`, "方式" , "踢出");
                        参数 = {group_id: event.group_id, user_id: event.user_id, reject_add_request: jjj[nm2]};
                    }else{
                        let nm2 = readB(`筱筱吖/群管系统/黑白名单/群聊/${event.group_id}/处理方式.json`, "方式" , "踢出");
                        参数 = {group_id: event.group_id, user_id: event.user_id, reject_add_request: jjj[nm2]};
                    }
                    kickGroupMembersFireAndForget(
                      ctx,
                      event.group_id,
                      [event.user_id],
                      参数.reject_add_request,
                    );
                }
            }
        }
    }
    // ================== 黑名单直接拦截后续内容 ==================
    if(放行标准 == false){
        return null;
    }
    // ================== 入群私聊 ==================
    let 入群私聊开关 = readB(`筱筱吖/事件系统/${event.group_id}.json`, "入群私聊", "关闭");
    if (入群私聊开关 === "开启" && shouldTriggerJoinGroupPm(readB, String(event.group_id))) {
        try {
            const 消息列表 = JSON.parse(readA(`筱筱吖/扩展功能/入群私聊/分群/${event.group_id}.json`) || "[]");
            if (Array.isArray(消息列表) && 消息列表.length > 0) {
                const 伪造私聊事件 = {
                    message_type: "private",
                    user_id: event.user_id,
                    group_id: event.group_id,
                };
                const joinGroupPmDeps = {
                    readA,
                    writeA,
                    getDataPath,
                    giveText,
                    giveImages,
                    downloadFile,
                    botApi: BOTAPI,
                    rand,
                    logger,
                };
                for (let i = 0; i < 消息列表.length; i++) {
                    try {
                        await replayJoinGroupPmEntry(伪造私聊事件, ctx, 消息列表[i], joinGroupPmDeps, {
                            groupId: event.group_id,
                        });
                        await new Promise(resolve => setTimeout(resolve, 300));
                    } catch (err) {
                        logger?.error?.(`[入群私聊] 发送第 ${i + 1} 条消息失败:`, err);
                    }
                }
            }
        } catch (error) {
            logger?.error?.("[入群私聊] 整体错误:", error);
        }
    }
    
    
    // ================== 黑名单判断结束 ==================
    let fakeEvent = {message_type: "group", group_id: event.group_id};
    // ================== 入群验证 ==================
    let 审核开关 = readB(`筱筱吖/事件系统/${event.group_id}.json`, "入群验证", "关闭");
    if(审核开关 == "开启"){
        let 是否免验证 = false;
        let 秒数 = Number(readB(`筱筱吖/群管系统/入群审核/${event.group_id}/次数.json`, "可用时间", 300));
        let 可用次数 = readB(`筱筱吖/群管系统/入群审核/${event.group_id}/次数.json`, "可用次数", 5);
        // ================== 获取邀请者身份数据 ==================
        if(event.sub_type == "invite"){//是邀请进来的
            let 参数1999 = {group_id: event.group_id, user_id: event.operator_id};
            let dp1999 = await BOTAPI(ctx, "get_group_member_info", 参数1999);
            let 邀请者身份 = (RC_group_role[(dp1999?.role || "member")] || 0);//目标身份
            if(邀请者身份 >= 2){
                是否免验证 = true;//免验证开关
            }
        }
        // ================== 禁言免验：全体禁言时跳过验证码 ==================
        if(是否免验证 == false){
            let 禁言免验开关 = readB(`筱筱吖/事件系统/${event.group_id}.json`, "禁言免验", "开启");
            if(禁言免验开关 == "开启"){
                try {
                    const gi = botApiPayload(await BOTAPI(ctx, "get_group_info", {
                        group_id: event.group_id,
                        no_cache: true,
                    }));
                    const allShut = Number(gi?.group_all_shut ?? gi?.groupAllShut ?? 0);
                    if (Number.isFinite(allShut) && allShut !== 0) {
                        是否免验证 = true;
                    }
                } catch (e) {
                    logger?.warn?.("[入群验证] 查询全体禁言状态失败:", e?.message || e);
                }
            }
        }
        if(是否免验证 == false){//普通群员邀请或主动进群才触发
            let 参数188 = {group_id : event.group_id,user_id : event.self_id};
            let dp188 = await BOTAPI(ctx, "get_group_member_info", 参数188);
            let Robot身份 = (RC_group_role[(dp188?.role || "member")] || 0);
            if(Robot身份 >= 2){
                // ================== 输出内容 ==================
                let 验证方式 = readB(`筱筱吖/群管系统/入群审核/${event.group_id}/次数.json`, "验证方式", "随机数字");
                if(验证方式 != "随机字母" && 验证方式 != "随机算式") 验证方式 = "随机数字";
                let 验证值 = "";
                let 验证提示 = "";
                if(验证方式 == "随机字母"){
                    let 字母表 = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
                    for(let j = 0; j < 4; j++){
                        验证提示 += 字母表[rand(0, 字母表.length - 1)];
                    }
                    验证值 = 验证提示;
                }else if(验证方式 == "随机算式"){
                    let 测试已开 = readB("config.json", "cs_of", false) == true;
                    let 可用运算 = 测试已开 ? ["+", "-", "×", "÷"] : ["+", "-"];
                    let 运算次数 = rand(1, 5);
                    let 首数 = rand(1, 9999);
                    验证提示 = String(首数);
                    let 链尾值 = 首数;
                    for(let j = 0; j < 运算次数; j++){
                        let 运算符 = 可用运算[rand(0, 可用运算.length - 1)];
                        if((运算符 == "×" || 运算符 == "÷") && 链尾值 > 999) 运算符 = ["+", "-"][rand(0, 1)];
                        if(运算符 == "÷"){
                            let 下一数 = rand(1, 999);
                            if(下一数 < 1) 下一数 = 1;
                            while(下一数 > 1 && 链尾值 % 下一数 != 0) 下一数 = rand(1, Math.min(999, Math.max(1, 链尾值)));
                            if(链尾值 % 下一数 != 0){
                                运算符 = "+";
                                下一数 = rand(1, 9999);
                                验证提示 += "+" + 下一数;
                                链尾值 = 下一数;
                            }else{
                                验证提示 += "÷" + 下一数;
                                链尾值 = Math.floor(链尾值 / 下一数);
                            }
                        }else if(运算符 == "×"){
                            let 下一数 = rand(1, 999);
                            验证提示 += "×" + 下一数;
                            链尾值 = 链尾值 * 下一数;
                        }else if(运算符 == "+"){
                            let 下一数 = rand(1, 9999);
                            验证提示 += "+" + 下一数;
                            链尾值 = 下一数;
                        }else{
                            let 下一数 = rand(1, 9999);
                            验证提示 += "-" + 下一数;
                            链尾值 = 下一数;
                        }
                    }
                    验证提示 += "=?";
                    let 令牌 = 验证提示.replace(/=\?$/, "").match(/\d+|[+\-×÷]/g);
                    if(令牌){
                        let 数值 = [Number(令牌[0])];
                        let 符号 = [];
                        for(let t = 1; t < 令牌.length; t += 2){
                            符号.push(令牌[t]);
                            数值.push(Number(令牌[t + 1]));
                        }
                        for(let t = 0; t < 符号.length; t++){
                            if(符号[t] == "×" || 符号[t] == "÷"){
                                let 左 = 数值[t];
                                let 右 = 数值[t + 1];
                                数值[t] = 符号[t] == "×" ? 左 * 右 : Math.floor(左 / 右);
                                数值.splice(t + 1, 1);
                                符号.splice(t, 1);
                                t--;
                            }
                        }
                        let 算式结果 = 数值[0];
                        for(let t = 0; t < 符号.length; t++){
                            算式结果 = 符号[t] == "+" ? 算式结果 + 数值[t + 1] : 算式结果 - 数值[t + 1];
                        }
                        验证值 = String(算式结果);
                    }else{
                        验证值 = 验证提示;
                    }
                }else{
                    验证值 = String(rand(1000, 9999));
                    验证提示 = 验证值;
                }
                let 验证正文 = ` (${event.user_id})\n请在${Math.floor(秒数 / 60)}分钟内发送一下内容进行验证是否活人！`;
                验证正文 += `\n------------------`;
                验证正文 += `\n[验证方式]:${验证方式}`;
                验证正文 += `\n[验证内容]:${验证提示}`;
                验证正文 += `\n[可以机会]:${可用次数}次`;
                验证正文 += `\n------------------`;
                验证正文 += `\n[现在时间]:${timeA("y-m-d H:i:s", Math.floor(Date.now() / 1000))}`;
                验证正文 += `\n[截止时间]:${timeA("y-m-d H:i:s", (Math.floor(Date.now() / 1000) + 秒数))}`;
                await 发消息(fakeEvent, [
                    段_图片(`https://q4.qlogo.cn/g?b=qq&nk=${event.user_id}&s=5`),
                    段_艾特(event.user_id),
                    段_文本(验证正文),
                ]);
                // ================== 记录内容 ==================
                writeB(`筱筱吖/群管系统/入群审核/${event.group_id}/验证码.json`, event.user_id, 验证值);
                writeB(`筱筱吖/群管系统/入群审核/${event.group_id}/验证内容.json`, event.user_id, 验证提示);
                writeB(`筱筱吖/群管系统/入群审核/${event.group_id}/审核状态.json`, event.user_id, "验证中");
                // ================== 循环冷却 ==================
                for(let i = 0; i < 秒数; i++){
                    let sss = readB(`筱筱吖/群管系统/入群审核/${event.group_id}/审核状态.json`, event.user_id, "无");
                    if(sss == "已退群"){
                        //logger.error(`结束验证:${event.user_id} : ${sss}`);
                        return null;
                    }
                    if(sss == "已通过" || sss == "废物" || sss == "无"){
                        //logger.error(`结束验证:${event.user_id} : ${验证值}`);
                        break;
                    }else if(i + 1 >= 秒数){
                        writeB(`筱筱吖/群管系统/入群审核/${event.group_id}/审核状态.json`, event.user_id, "废物");
                        // ================== 重新验证身份 ==================
                        let 参数1888 = {group_id : event.group_id,user_id : event.self_id};
                        let dp1888 = await BOTAPI(ctx, "get_group_member_info", 参数1888);
                        let Robot身份 = (RC_group_role[(dp1888?.role || "member")] || 0);//机器人
                        let 参数1000 = {group_id: event.group_id, user_id: event.user_id};
                        let dp1000 = await BOTAPI(ctx, "get_group_member_info", 参数1000);//用户
                        let 用户身份 = (RC_group_role[(dp1000?.role || "member")] || 0);//目标身份
                        if(Robot身份 > 用户身份){
                            await 发消息(fakeEvent, [段_文本(`【通报】\n[用户]:${event.user_id}\n在规定时间内未成功验证，已处理！`)]);
                            kickGroupMembersFireAndForget(ctx, event.group_id, [event.user_id], false);
                            writeB(`筱筱吖/群管系统/入群审核/${event.group_id}/验证码.json`, event.user_id, false);
                            writeB(`筱筱吖/群管系统/入群审核/${event.group_id}/验证内容.json`, event.user_id, false);
                        }else{
                            writeB(`筱筱吖/群管系统/入群审核/${event.group_id}/验证码.json`, event.user_id, false);
                            writeB(`筱筱吖/群管系统/入群审核/${event.group_id}/验证内容.json`, event.user_id, false);
                            writeB(`筱筱吖/群管系统/入群审核/${event.group_id}/审核状态.json`, event.user_id, "无");
                        }
                    }else{
                        await new Promise(resolve => setTimeout(resolve, 1000));//延迟1秒
                    }
                }
            }
        }
    }
    // ================== 入群验证结束 ==================
    let 审核状态 = readB(`筱筱吖/群管系统/入群审核/${event.group_id}/审核状态.json`, event.user_id, "无");
    // ================== 邀人统计 ==================
    let 通报状态 = false;
    let 统计开关 = readB(`筱筱吖/事件系统/${event.group_id}.json`, "邀人统计", "关闭");
    if(统计开关 == "开启" && (审核状态 == "无" || 审核状态 == "已通过")){
        let mub_BQ_yqr = readB(`筱筱吖/扩展功能/邀人统计/${event.group_id}/绑定数据.json`, event.user_id, "无");
        if(mub_BQ_yqr == "无"){//没绑定人才会触发
            if(event.sub_type == "invite"){//邀请通过的
                // ================== 读取数据 ==================
                let BQ_yqr数据 = JSON.parse(readA(`筱筱吖/扩展功能/邀人统计/${event.group_id}/${event.operator_id}.json`) || "[]");
                let 包含 = BQ_yqr数据.includes(event.user_id);
                // ================== 二次检测 ==================
                if(!包含){//如果之前没有就执行
                    // ================== 写入 ==================
                    BQ_yqr数据.push(event.user_id);
                    writeB(`筱筱吖/扩展功能/邀人统计/${event.group_id}/绑定数据.json`, event.user_id, event.operator_id);
                    writeB(`筱筱吖/扩展功能/邀人统计/${event.group_id}/被绑时间.json`, event.user_id, Math.floor(Date.now() / 1000));
                    writeA(`筱筱吖/扩展功能/邀人统计/${event.group_id}/${event.operator_id}.json`, JSON.stringify(BQ_yqr数据));
                    // ================== 输出 ==================
                    let fakeEvent = {message_type: "group", group_id: event.group_id};
                    let 邀人组装消息 = `新群员(${event.user_id})是被(${event.operator_id})邀请进来的，到目前为止已累计邀请【${BQ_yqr数据.length}】人`;
                    await 发消息(fakeEvent, [段_文本(`${邀人组装消息}`)]);
                    通报状态 = true;
                    let zzzzz = JSON.parse(readA(`筱筱吖/扩展功能/邀人统计/${event.group_id}/邀请官.json`) || "[]");
                    if(!zzzzz.includes(event.operator_id)){
                        zzzzz.push(event.operator_id);
                        writeA(`筱筱吖/扩展功能/邀人统计/${event.group_id}/邀请官.json`, JSON.stringify(zzzzz));
                    }
                }
            }
        }
    }
    // ================== 邀人统计结束 ==================
    // ================== 入群欢迎 ==================
    let 欢迎开关 = readB(`筱筱吖/事件系统/${event.group_id}.json`, "入群欢迎", "关闭");
    let 文件开关 = isImageRenderEnabled(readB);
    if(欢迎开关 == "开启" && 放行标准 == true && (审核状态 == "无" || 审核状态 == "已通过")){
        // ================== 访问接口 ==================
        let 参数 = {user_id : event.user_id};
        let dp = await BOTAPI(ctx, "get_stranger_info", 参数);
        // ================== 获取数据 ==================
        let 性别数据 = {'unknown':"未知",'female':"女",'male':"男"};
        let 性别 = (性别数据[dp["sex"]] || "未知");
        let 昵称 = mkCompatNickname(dp) || "-";
        const by = dp?.birthday_year;
        const bm = dp?.birthday_month;
        const bd = dp?.birthday_day;
        let 年月日 = (by != null && bm != null && bd != null) ? `${by}-${bm}-${bd}` : "-";
        const regTs = Number(dp?.regTime ?? dp?.reg_time ?? 0);
        let 注册时间 = regTs > 0 ? (timeA("y", regTs) + "年") : "-";
        // ================== 解析自定义文案 ==================
        let 自定义内容 = (readA(`筱筱吖/群管系统/入群欢迎词/${event.group_id}.json`) || "[艾特] ([新人QQ])欢迎你的加入\n[时间]");
        const 欢迎文本替换 = {
            "[新人QQ]": event.user_id,
            "[昵称]": 昵称,
            "[群号]": event.group_id,
            "[时间]": timeA("y-m-d H:i:s", Math.floor(Date.now() / 1000)),
            "[性别]": 性别,
            "[年龄]": dp?.age || 0,
            "[等级]": dp?.qqLevel ?? dp?.qq_level ?? dp?.level ?? 0,
            "[注册时间]": 注册时间,
        };
        const 欢迎段 = mkEventTemplateToSegments(自定义内容, {
            userId: event.user_id,
            selfId: event.self_id,
            textReplacements: 欢迎文本替换,
        });
        // ================== 99999999999 ==================
        // ================== 图片版 ==================
        if(文件开关 == true){
            try {
                // 获取当前日期
                let 时间戳秒 = Math.floor(Date.now() / 1000);
                let 现在时间 = timeA("y-m-d H:i:s", 时间戳秒);
                // 构建渲染数据
                const renderData = {
                    "qq": String(event.user_id),
                    "name" : String(昵称 === "-" ? "" : 昵称),
                    "sex" : String(性别 || "未知"),
                    "rrrr" : String(年月日),
                    "age" : String(dp?.age || 0),
                    "denji" : String(dp?.qqLevel ?? dp?.qq_level ?? dp?.level ?? ""),
                    "zhuce" : String(注册时间),
                    "jiaqun" : String(现在时间)
                };
                let imageData = null;
                if (getRenderMode(readB) === "sharp") {
                    imageData = await renderJoinIdentityWithSharp({
                        qq: renderData.qq,
                        name: renderData.name,
                        sex: renderData.sex,
                        birthday: renderData.rrrr,
                        age: renderData.age,
                        qqLevel: renderData.denji,
                        regTime: renderData.zhuce,
                        joinTime: renderData.jiaqun,
                        width: 1400,
                        height: 850,
                        pluginDir: PLUGIN_DIR,
                        dataPath: getDataPath(),
                        bgLocalPath:
                            resolveEffectiveBgAbs('join-identity') ||
                            resolveDefaultResourceImageAbs('heng.jpg') ||
                            '',
                    }, logger);
                    if (!imageData) {
                        logger.warn("[入群身份] Sharp 渲染失败，已回退 HTML 渲染");
                    }
                }
                if (!imageData) {
                // 调用 Puppeteer 渲染
                const htmlContent = readA("默认资源/入群身份.html");
                imageData = await puppeteer(htmlContent, {
                    data: renderData,
                    width: 1400,
                    height: 850
                });
                }
                if (imageData) {
                    // 发送渲染后的图片
                    if(放行标准 == true){
                        await 发消息(fakeEvent, [段_图片(`base64://${imageData}`), ...欢迎段]);
                    }
                } else {
                    logger.error("[测试图片] 渲染失败，请检查 Puppeteer 服务是否运行", error);
                    //await 发消息(event, [段_引用(event.message_id), 段_文本('渲染失败，请检查 Puppeteer 服务是否运行')]);
                }
            } catch (error) {
                logger.error("[测试图片] 错误:", error);
                //await 发消息(event, [段_引用(event.message_id), 段_文本(`测试图片出错: ${error.message}`)]);
            }
        }else{
        // ================== 文字版 ==================
            await 发消息(fakeEvent, 欢迎段);
        }
    }
    // ================== 检 ==================
}







// ================== 退群通知 ==================
if(noticeType == "group_decrease") {
    // 清理入群审核相关缓存
    writeB(`筱筱吖/群管系统/入群审核/${event.group_id}/验证码.json`, event.user_id, false);
    writeB(`筱筱吖/群管系统/入群审核/${event.group_id}/验证内容.json`, event.user_id, false);
    writeB(`筱筱吖/群管系统/入群审核/${event.group_id}/审核状态.json`, event.user_id, "已退群");

    // 读取群级开关
    let 退群通知开关 = readB(`筱筱吖/事件系统/${event.group_id}.json`, "退群通知", "关闭");
    let 退群拉黑开关 = readB(`筱筱吖/事件系统/${event.group_id}.json`, "退群拉黑", "关闭");

    // ================== 获取用于模板的数据 ==================
    let 群名 = String(event.group_id);
    try {
        const groupInfo = await BOTAPI(ctx, "get_group_detail_info", { group_id: event.group_id });
        if (groupInfo && groupInfo.group_name) 群名 = groupInfo.group_name;
    } catch(e) {}

    let 用户昵称 = String(event.user_id);
    try {
        const userInfo = await BOTAPI(ctx, "get_stranger_info", { user_id: event.user_id });
        if (userInfo) {
            const n = mkCompatNickname(userInfo);
            if (n) 用户昵称 = n;
        }
    } catch(e) {}

    let 退群类型文本 = (event.sub_type === "leave") ? "主动退群" : "被踢出";
    let 操作者QQ = "";
    let 操作者昵称 = "";
    if (event.sub_type === "kick" && event.operator_id) {
        操作者QQ = String(event.operator_id);
        操作者昵称 = 操作者QQ;
        try {
            const opInfo = await BOTAPI(ctx, "get_stranger_info", { user_id: event.operator_id });
            if (opInfo) {
                const n = mkCompatNickname(opInfo);
                if (n) 操作者昵称 = n;
            }
        } catch(e) {}
    }
    let 当前时间 = timeA("y-m-d H:i:s", Math.floor(Date.now() / 1000));

    // ================== 读取/生成通知文本 ==================
    let 模板路径 = `筱筱吖/群管系统/退群通知模板/${event.group_id}.json`;
    let 模板内容 = readA(模板路径);
    let 通知文本 = "";
    if (模板内容 && 模板内容.trim()) {
        通知文本 = 模板内容;
    } else {
        // 默认模板
        通知文本 = "[用户QQ] ([用户昵称]) 离开了本群～";
    }

    // 变量替换
    const 退群文本替换 = {
        "[用户QQ]": event.user_id,
        "[用户昵称]": 用户昵称,
        "[操作者QQ]": 操作者QQ,
        "[操作者昵称]": 操作者昵称,
        "[群号]": event.group_id,
        "[群名]": 群名,
        "[时间]": 当前时间,
        "[退群类型]": 退群类型文本,
    };
    let 追加黑名单提示 = "";
    if (退群拉黑开关 === "开启") {
        let 黑名单文件 = `筱筱吖/群管系统/黑白名单/群聊/${event.group_id}/人员.json`;
        let 黑名单 = JSON.parse(readA(黑名单文件) || "[]");
        if (!黑名单.includes(String(event.user_id)) && event.user_id != event.self_id) {
            黑名单.push(String(event.user_id));
            writeA(黑名单文件, JSON.stringify(黑名单));
            if (退群通知开关 === "开启") {
                追加黑名单提示 = "\n（已加入本群黑名单）";
            }
        }
    }
    let 通知段 = mkEventTemplateToSegments(通知文本, {
        userId: event.user_id,
        selfId: event.self_id,
        textReplacements: 退群文本替换,
    });
    if (追加黑名单提示) {
        通知段.push(段_文本(追加黑名单提示));
    }

    // ================== 发送退群通知 ==================
    if (退群通知开关 === "开启") {
        // 机器人自己踢人时不发送通知（避免刷屏）
        if (!(event.sub_type === "kick" && event.operator_id == event.self_id)) {
            let fakeEvent = { message_type: "group", group_id: event.group_id };
            await 发消息(fakeEvent, 通知段);
        }
    }
    return null;
}




return null;
}






// ================== 请求事件处理 ==================
async function handleRequest(event, ctx) {
const requestType = event.request_type;

// ================== 受邀同意 ==================
if (requestType === "group" && String(event.sub_type ?? "") === "invite") {
    let 受邀同意开关 = readB(`筱筱吖/事件系统/全局.json`, "受邀同意", "关闭");
    if (受邀同意开关 === "开启") {
        try {
            await BOTAPI(ctx, "set_group_add_request", {
                flag: event?.flag,
                sub_type: event.sub_type,
                approve: true
            });
        } catch (e) {
            logger?.warn?.("[MKbot] 受邀同意：同意邀请失败:", e?.message || e);
        }
    }
    return null;
}

const RC_sq = await checkAuthStatus(event);

// ================== 全局开关 - 群聊 ==================
if(event.group_id && !mkGroupExecAllowed(event.group_id)){
    return null;
}
if(!event.group_id && !mkPrivateExecAllowed(event.user_id)){
    return null;
}



// ================== 授权匹配 ==================
if(RC_sq != "已授权"){
    return null;
}


// ================== 加群申请 ==================
if (requestType === "group") {
    // ================== 黑名单 ==================
    let 黑白开关 = readB(`筱筱吖/事件系统/${event.group_id}.json`, "黑白名单", "关闭");
    if(黑白开关 == "开启"){
        let data1 = JSON.parse(readA(`筱筱吖/群管系统/黑白名单/全局/人员.json`) || "[]");
        let data2 = JSON.parse(readA(`筱筱吖/群管系统/黑白名单/群聊/${event.group_id}/人员.json`) || "[]");
        let ishmd1 = data1.includes(String(event.user_id));
        let ishmd2 = data2.includes(String(event.user_id));
        if(ishmd1 || ishmd2){
            // ================== 调用接口 ==================
            let 参数 = {flag : event?.flag, approve : false, reason : "你是黑名单用户！"};
            await BOTAPI(ctx, "set_group_add_request", 参数);
            return null;
        }
    }
    let wj_ofu = readB(`筱筱吖/事件系统/${event.group_id}.json`, "入群审核", "关闭");
    // ================== 管你这那的，出去 ==================
    if(wj_ofu == "关闭"){
        return null;
    }
    // ================== 无附加 ==================
    const rqSubType = String(event.sub_type ?? "add");
    const commentTrim = String(event?.comment ?? "").trim();
    if(rqSubType !== "add" || commentTrim === ""){
        let 参数放行 = {flag : event?.flag, sub_type: event.sub_type, approve : true};
        await BOTAPI(ctx, "set_group_add_request", 参数放行);
        let fakeEvent放行 = {message_type: "group", group_id: event.group_id};
        await 发消息(fakeEvent放行, [段_文本(`QQ(${event.user_id})通过入群审核，已同意进入～`)]);
        return null;
    }
    // ================== 获取问题数据 ==================
    let 问题 = "";
    let 答案 = "";
    let text = (event?.comment || "");
    let 今天 = timeA("y-m-d", Math.floor(Date.now() / 1000));
    let wj_tj = readB(`筱筱吖/群管系统/入群审核/${event.group_id}/数据.json`, "条件", "字数");
    let wj_cs = Number(readB(`筱筱吖/群管系统/入群审核/${event.group_id}/数据.json`, "次数", 3));
    let wj_zs = Number(readB(`筱筱吖/群管系统/入群审核/${event.group_id}/数据.json`, "字数数量", 5));
    let me_cs = Number(readB(`筱筱吖/群管系统/入群审核/${event.group_id}/申请次数/${event.user_id}.json`, 今天, 0));
    if(me_cs > wj_cs){
        // ================== 调用接口 ==================
        let 参数 = {flag : event?.flag, approve : false, reason : "你今天的可用申请次数已用完咯～"};
        await BOTAPI(ctx, "set_group_add_request", 参数);
        return null;
    }
    writeB(`筱筱吖/群管系统/入群审核/${event.group_id}/申请次数/${event.user_id}.json`, 今天, me_cs + 1);
    
    // ================== 获取数据 ==================
    const match = text.match(/问题：([\s\S]*)\n答案：([\s\S]*)/);
    if (match) {
        const question = match[1];
        const answer = match[2];
        问题 = ("问题:", question);
        答案 = ("答案:", answer);
    }
    if(答案 == ""){
        答案 = event.comment;
    }

    // ================== QQ等级门槛（在过滤词之上；0=关闭） ==================
    let wj_dj = Number(readB(`筱筱吖/群管系统/入群审核/${event.group_id}/数据.json`, "等级", 0));
    if(!Number.isFinite(wj_dj) || wj_dj < 0) wj_dj = 0;
    if(wj_dj > 0){
        let 用户QQ等级 = 0;
        try {
            const dpLevel = await BOTAPI(ctx, "get_stranger_info", { user_id: event.user_id });
            // 与「查用户」一致：qqLevel / qq_level / level
            const rawLevel = dpLevel?.qqLevel ?? dpLevel?.qq_level ?? dpLevel?.level;
            if(rawLevel !== undefined && rawLevel !== null && rawLevel !== "" && rawLevel !== "-"){
                const n = Number(rawLevel);
                用户QQ等级 = Number.isFinite(n) ? n : 0;
            }
        } catch (_e) {
            用户QQ等级 = 0;
        }
        if(用户QQ等级 < wj_dj){
            let 参数等级 = {
                flag: event?.flag,
                approve: false,
                reason: `本群要求QQ等级≥${wj_dj}级（你当前为${用户QQ等级}级）`,
            };
            await BOTAPI(ctx, "set_group_add_request", 参数等级);
            return null;
        }
    }
    
    // ================== 判断内容 ==================
    let 成功与否 = false;
    let 参数 = {flag : event?.flag, approve : false, reason : "意想不到的回复"};
    
    // ================== 管你这的那的，拦截！ ==================
    if(wj_tj == wj_tj){
        let wj_cc = JSON.parse(readA(`筱筱吖/群管系统/入群审核/${event.group_id}/过滤库.json`) || "[]");
        let 条件数量 = wj_cc.length;
        for(let i = 0; i < 条件数量; i++) {
            let 本次键 = wj_cc[i];
            if(答案.includes(本次键) == true){
                参数 = {flag : event?.flag, approve : false, reason : "你的回答不符合本群设定！3"};
                BOTAPI(ctx, "set_group_add_request", 参数);
                return null;
            }
        }
    }
    
    // ================== 字数验证 ==================
    if(wj_tj == "字数"){
        let 答案字数 = (答案.length || 0);
        if(答案字数 < wj_zs){
            参数 = {flag : event?.flag, approve : false, reason : `本群设定通过内容为:>=${wj_zs}个字`};
        }else{
            成功与否 = true;
            参数 = {flag : event?.flag, approve : true};
        }
    }
    
    // ================== 普通答案验证 ==================
    let 普通答案 = readB(`筱筱吖/群管系统/入群审核/${event.group_id}/数据.json`, "答案", "");
    let 普通答案包含 = 答案.includes(普通答案);
    if(wj_tj == "包含"){
        if(普通答案包含 == false){
            参数 = {flag : event?.flag, approve : false, reason : "你的回答不符合本群设定！1"};
        }else{
            成功与否 = true;
            参数 = {flag : event?.flag, approve : true};
        }
    }
    if(wj_tj == "准确"){
        if(答案 === 普通答案){
            成功与否 = true;
            参数 = {flag : event?.flag, approve : true};
        }else{
            参数 = {flag : event?.flag, approve : false, reason : "你的回答不符合本群设定！2"};
        }
    }
    
    // ================== 高级条件验证 ==================
    let wj_cc = JSON.parse(readA(`筱筱吖/群管系统/入群审核/${event.group_id}/条件库.json`) || "[]");
    let 条件数量 = wj_cc.length;
    if(wj_tj == "模糊多重"){
        for(let i = 0; i < 条件数量; i++) {
            let 本次键 = wj_cc[i];
            if(答案.includes(本次键) == true){
                成功与否 = true;
                参数 = {flag : event?.flag, approve : true};
                break;
            }else{
                参数 = {flag : event?.flag, approve : false, reason : "你的回答不符合本群设定！4"};
            }
        }
    }
    if(wj_tj == "准确多重"){
        for(let i = 0; i < 条件数量; i++) {
            let 本次键 = wj_cc[i];
            if(答案 === 本次键){
                成功与否 = true;
                参数 = {flag : event?.flag, approve : true};
                break;
            }else{
                参数 = {flag : event?.flag, approve : false, reason : "你的回答不符合本群设定！5"};
            }
        }
    }
    // ================== 访问接口 ==================
    BOTAPI(ctx, "set_group_add_request", 参数);
    
    // ================== 组装消息 ==================
    let fakeEvent = {message_type: "group", group_id: event.group_id};//消息指导到触发群聊
    // ================== 输出 ==================
    if(成功与否 == true){//成功
        await 发消息(fakeEvent, [段_文本(`QQ(${event.user_id})通过入群审核，已同意进入～`)]);
    }else{//失败
        //await sendReply(fakeEvent, `QQ(${event.user_id})想加入群聊，但回答的问题不符合条件！`, ctx);//调试的
    }
    //await sendReply(fakeEvent, `[条件]:${wj_tj}\n[数据]:${wj_cc}\n[数量]:${条件数量}\n[答案]:${答案}\n[状态]:${成功与否}\n[参数]:${JSON.stringify(参数)}`, ctx);//调试的
    return null;
}


return null;
}






// ================== 定时任务 ==================
/** 相邻 NapCat API 间隔（毫秒），串行发送避免整点并发导致 send_msg 超时 */
const MK_SCHEDULED_API_GAP_MS = 800;

const MK_XUHUO_IMAGE_URLS = [
    "http://xn--mk-ub3cl61ae1v.xn--c5w857b.xn--fiqs8s/mkbot/image/续火用的/1.jpg",
    "http://xn--mk-ub3cl61ae1v.xn--c5w857b.xn--fiqs8s/mkbot/image/续火用的/2.jpg",
    "http://xn--mk-ub3cl61ae1v.xn--c5w857b.xn--fiqs8s/mkbot/image/续火用的/3.jpg",
    "http://xn--mk-ub3cl61ae1v.xn--c5w857b.xn--fiqs8s/mkbot/image/续火用的/4.jpg",
    "http://xn--mk-ub3cl61ae1v.xn--c5w857b.xn--fiqs8s/mkbot/image/续火用的/5.jpg",
];

function mkScheduledSleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function mkObList(result) {
    if (Array.isArray(result)) return result;
    if (result && Array.isArray(result.data)) return result.data;
    return [];
}

async function mkScheduledBotAPI(ctx, action, params) {
    try {
        const result = await BOTAPI(ctx, action, params);
        await mkScheduledSleep(MK_SCHEDULED_API_GAP_MS);
        return result;
    } catch (error) {
        logger?.warn?.(`[定时任务] ${action} 失败:`, error?.message || error);
        await mkScheduledSleep(MK_SCHEDULED_API_GAP_MS);
        return null;
    }
}

async function mkScheduledSendReply(event, content, ctx) {
    await 发消息(event, content);
    await mkScheduledSleep(MK_SCHEDULED_API_GAP_MS);
}

function mkBuildXuhuoImageFile(indexOneBased) {
    const abs = path.join(getDataPath(), `筱筱吖/扩展功能/续火功能/临时数据/image/${indexOneBased}.jpg`);
    try {
        if (!fs.existsSync(abs)) return null;
        return pathToFileURL(abs).href;
    } catch (_e) {
        return null;
    }
}

async function mkEnsureXuhuoImagesDownloaded() {
    const ready = readB(`筱筱吖/扩展功能/续火功能/临时数据/状态.json`, "下载状态", false);
    if (ready === true) return true;

    let failCount = 0;
    const dataRoot = getDataPath();
    for (let i = 0; i < MK_XUHUO_IMAGE_URLS.length; i++) {
        const dest = path.join(dataRoot, `筱筱吖/扩展功能/续火功能/临时数据/image/${i + 1}.jpg`);
        const ok = await downloadFile(MK_XUHUO_IMAGE_URLS[i], dest, true);
        if (!ok) {
            logger.error(`图片资源:${MK_XUHUO_IMAGE_URLS[i]}，下载失败！`);
            failCount++;
        }
    }
    if (failCount === MK_XUHUO_IMAGE_URLS.length) return false;

    writeB(`筱筱吖/扩展功能/续火功能/临时数据/状态.json`, "可用数量", MK_XUHUO_IMAGE_URLS.length);
    writeB(`筱筱吖/扩展功能/续火功能/临时数据/状态.json`, "下载状态", true);
    logger.warn("续火资源已顺利加载成功！");
    return true;
}

async function mkScheduledSendXuhuo(fakeEvent, ctx) {
    const mode = (readA("筱筱吖/扩展功能/续火功能/续火方式/方式.txt") || "文案");
    if (mode === "图片") {
        if (!(await mkEnsureXuhuoImagesDownloaded())) return false;
        const count = Number(readB(`筱筱吖/扩展功能/续火功能/临时数据/状态.json`, "可用数量", 5)) || 5;
        const pick = rand(1, count);
        const imageFile = mkBuildXuhuoImageFile(pick);
        if (!imageFile) return false;
        await mkScheduledSendReply(fakeEvent, [段_图片(imageFile)], ctx);
        return true;
    }
    const text = (readA("筱筱吖/扩展功能/续火功能/续火内容/文本.txt") || "愿君安心");
    await mkScheduledSendReply(fakeEvent, [段_文本(text)], ctx);
    return true;
}

async function handleScheduledTask(ctx) {
    const 今天 = timeA("y-m-d", Math.floor(Date.now() / 1000));
    
    //ctx.logger.info("定时任务触发：准时续火");//调试
    // ================== 获取数据 - 群聊==================
    const groupList = mkObList(await mkScheduledBotAPI(ctx, "get_group_list", {}));
    const 群数量  = (groupList.length || 0);
    //ctx.logger.info(`数量${群数量}`);//调试
    // ================== 循环 ==================
    for(let i = 0; i < 群数量; i++){
        let 群号 = groupList[i]["group_id"];
        let fakeEvent = {message_type: "group", group_id: 群号};
        let 我可以说话吗 = true;
        try {
        // ================== 续火 ==================
        let 开关 = readB(`筱筱吖/事件系统/${群号}.json`, "群聊续火", "关闭");
        if(开关 == "开启"){//群聊续火开关
            let 状态 = readB(`筱筱吖/扩展功能/续火功能/状态数据/群聊/${今天}.json`, 群号, "未");
            if(状态 == "未"){//今天是否已发过，未就进行
                if (await mkScheduledSendXuhuo(fakeEvent, ctx)) {
                    writeB(`筱筱吖/扩展功能/续火功能/状态数据/群聊/${今天}.json`, 群号, "已");
                    我可以说话吗 = false;
                }
            }
        }
        
        // ================== 整点报时 ==================
        let 状态 = readB(`筱筱吖/事件系统/${群号}.json`, "整点报时", "关闭");
        let 这个群的授权 = await checkAuthStatus({group_id: 群号});
        if(状态 == "开启" && 我可以说话吗 == true && 这个群的授权 == "已授权"){
            let 不报时时间段 = ["01", "02", "03", "04", "05", "06"];
            let isbaoshi = 不报时时间段.includes(timeA("H", Math.floor(Date.now() / 1000)));
            if(!isbaoshi){
                let 报时文案 = readB(`筱筱吖/扩展功能/整点报时/文案.txt`, 群号, "又是一个整点哎！");
                await mkScheduledSendReply(fakeEvent, `${报时文案}`, ctx);
            }
        }
        // ================== 打卡 ==================
        let 全群打卡 = readB(`筱筱吖/事件系统/全局.json`, "全群打卡", "关闭");
        if(全群打卡 == "开启"){
            let 打卡状态 = readB(`筱筱吖/全群打卡/打卡状态/${今天}.json`, 群号, "未");
            if(打卡状态 == "未"){
                const signRes = await mkScheduledBotAPI(ctx, "send_group_sign", { group_id: 群号 });
                if (signRes !== null) {
                    writeB(`筱筱吖/全群打卡/打卡状态/${今天}.json`, 群号, "已");
                }
            }
        }
        } catch (err) {
            logger?.error?.(`[定时任务] 群 ${群号} 处理失败:`, err?.message || err);
        }
    }
    
    // ================== 获取数据 - 好友==================
    const haoyouList = mkObList(await mkScheduledBotAPI(ctx, "get_friend_list", {}));
    const 好友数量  = (haoyouList.length || 0);
    const 登录数据 = await mkScheduledBotAPI(ctx, "get_login_info", {}) || {};
    let 好友续火总开关 = readB(`筱筱吖/事件系统/全局.json`, "好友续火", "关闭");
    let 点赞模式 = (readA(`筱筱吖/扩展功能/自动点赞/模式.json`) || "全部");//点赞模式
    for(let i = 0; i < 好友数量; i++){
        let 本次QQ = haoyouList[i]["user_id"];
        let fakeEvent = {message_type: "private", user_id: 本次QQ};
        try {
        // ================== 每天点赞好友 ==================
        let 点赞开关 = readB(`筱筱吖/事件系统/全局.json`, "自动点赞", "关闭");
        let 点赞记录 = readB(`筱筱吖/扩展功能/点赞记录/${今天}.json`, 本次QQ, "未");
        if(点赞开关 == "开启" && 点赞记录 == "未" && 登录数据?.user_id != 本次QQ && 点赞模式 == "全部"){
            const likeRes = await mkScheduledBotAPI(ctx, "send_like", { user_id: 本次QQ, times: 20 });
            if (likeRes !== null) {
                writeB(`筱筱吖/扩展功能/点赞记录/${今天}.json`, 本次QQ, "已");
            }
        }
        // ================== 检测是否已续火 ==================
        let 状态 = readB(`筱筱吖/扩展功能/续火功能/状态数据/好友/${今天}.json`, 本次QQ, "未");
        let 好友续火开关 = readB(`筱筱吖/扩展功能/续火功能/状态数据/好友/开关.json`, 本次QQ, "关闭");
        if(状态 == "未" && 好友续火开关 == "开启" && 好友续火总开关 == "开启"){//今天是否已发过，未就进行
            if (await mkScheduledSendXuhuo(fakeEvent, ctx)) {
                writeB(`筱筱吖/扩展功能/续火功能/状态数据/好友/${今天}.json`, 本次QQ, "已");
            }
        }
        } catch (err) {
            logger?.error?.(`[定时任务] 好友 ${本次QQ} 处理失败:`, err?.message || err);
        }
    }
    
    // ================== 指定点赞列表 ==================
    let 点赞数据 = JSON.parse(readA(`筱筱吖/扩展功能/自动点赞/用户数据.json`) || "[]");//点赞的用户数据
    let 点赞人数 = (点赞数据.length || 0);
    let 点赞开关 = readB(`筱筱吖/事件系统/全局.json`, "自动点赞", "关闭");
    if(点赞模式 == "特定" && 点赞人数 > 0 && 点赞开关 == "开启"){
        for(let i = 0; i < 点赞人数; i++){
            let 本次QQ = 点赞数据[i];
            try {
            // ================== 每天点赞好友 ==================
            let 点赞记录 = readB(`筱筱吖/扩展功能/点赞记录/${今天}.json`, 本次QQ, "未");
            if(点赞记录 == "未" && 登录数据?.user_id != 本次QQ){
                const likeRes = await mkScheduledBotAPI(ctx, "send_like", { user_id: 本次QQ, times: 20 });
                if (likeRes !== null) {
                    writeB(`筱筱吖/扩展功能/点赞记录/${今天}.json`, 本次QQ, "已");
                }
            }
            } catch (err) {
                logger?.error?.(`[定时任务] 点赞 ${本次QQ} 失败:`, err?.message || err);
            }
        }
    }
    
    // ================== 其他 - 自动备份 ==================
    let 转发QQ = (readA("筱筱吖/扩展功能/自动备份/转发目标.json") || false);
    let 自动备份开关 = readB(`筱筱吖/事件系统/全局.json`, "自动备份", "关闭");
    if(转发QQ && 自动备份开关 == "开启"){//必须是有东西
        let 小时 = timeA("H", Math.floor(Date.now() / 1000));
        if(小时 == "12" || 小时 == "00"){
            // ================== 获取文件夹名字 ==================
            let 文件夹名字 = mkResolvePluginStorageName(ctx);
            // ================== 压缩数据包 ==================
            let 时间戳毫秒 = Date.now();
            let 备份文件名 = mkBackupZipDisplayName(Math.floor(时间戳毫秒 / 1000));
            // ================== 备份目标路径（兼容咔咔珂 / 旧 NapCat） ==================
            const fw = ctx.frameworkEnv;
            const isMkFramework = mkIsKakakeLikeFramework(ctx);
            const 项目根 = isMkFramework && fw.projectRoot ? fw.projectRoot : path.join(ctx.pluginPath, '..', '..');
            let 备份目标 = mkResolvePluginRuntimeDataDir(ctx);
            let 备份路径 = path.join(项目根, '数据备份', 文件夹名字);
            let 备份绝对路径 = 备份路径 + `/${时间戳毫秒}.zip`;
            let 压缩状态 = await zipFile(备份目标, 备份绝对路径);
            // ================== 判断压缩状态 ==================
            if(!压缩状态){
                logger.error("数据压缩失败！");
                return null;
            }
            // ================== 输出方式 ==================
            let 参数 = {"user_id": 转发QQ, "file": 备份绝对路径, "name": 备份文件名};
            // ================== 输出文件 ==================
            await mkScheduledBotAPI(ctx, "upload_private_file", 参数);
        }
    }
}

// ================== 定时任务调度器 - 计算下次执行时间 ==================
/** 为 false 时表示插件已卸载/禁用，不再注册下一次整点 */
async function scheduleNextTask(ctx) {
    if (globalThis.__mk_scheduler_armed === false) {
        return;
    }
    // 清除旧的定时器（防止热重载重复执行）
    if (globalThis.__mk_scheduler_timer) {
        clearTimeout(globalThis.__mk_scheduler_timer);
        globalThis.__mk_scheduler_timer = undefined;
    }

    const now = new Date();
    const nextHour = new Date(now);
    nextHour.setHours(nextHour.getHours() + 1);
    nextHour.setMinutes(0);
    nextHour.setSeconds(0);
    nextHour.setMilliseconds(0);

    const delay = nextHour.getTime() - now.getTime();

    logger.info(`[定时任务] 下次执行时间: ${nextHour.toLocaleString()}, 延迟: ${delay}ms`);

    globalThis.__mk_scheduler_timer = setTimeout(async () => {
        if (globalThis.__mk_scheduler_armed === false) {
            return;
        }
        try {
            logger.info(`[定时任务] 执行定时任务`);
            await handleScheduledTask(ctx);
        } catch (error) {
            logger.error(`[定时任务] 执行出错: ${error.message}`);
        }
        if (globalThis.__mk_scheduler_armed) {
            scheduleNextTask(ctx);
        }
    }, delay);
}

/** 不参与「默认资源」指纹匹配的 data 子目录（避免误把用户数据当模板） */
const DEFAULT_RES_SKIP_DIR_NAMES = new Set(['筱筱吖', 'node_modules']);

/**
 * 在 data 根下解析「默认资源」实际目录：优先正确 UTF-8 名；否则用内置文件指纹识别乱码目录名（NapCat/解压编码错误常见）。
 */
function resolveDefaultResourceSourceDir(dataRoot) {
  if (!dataRoot || !fs.existsSync(dataRoot)) return null;
  const correct = path.join(dataRoot, '默认资源');
  try {
    if (fs.existsSync(correct) && fs.statSync(correct).isDirectory()) return correct;
  } catch {
    return null;
  }
  let entries;
  try {
    entries = fs.readdirSync(dataRoot, { withFileTypes: true });
  } catch {
    return null;
  }
  for (const ent of entries) {
    if (!ent.isDirectory()) continue;
    if (DEFAULT_RES_SKIP_DIR_NAMES.has(ent.name)) continue;
    const dir = path.join(dataRoot, ent.name);
    if (looksLikeDefaultResourceBundle(dir)) return dir;
  }
  return null;
}

function looksLikeDefaultResourceBundle(dir) {
  const fish1 = path.join(dir, '钓鱼数据', '鱼-1.json');
  const fish2 = path.join(dir, '钓鱼数据', '鱼-2.json');
  const nav = path.join(dir, '导航菜单.html');
  const yunshi = path.join(dir, 'text', '运势.json');
  try {
    if (fs.existsSync(fish1) && fs.existsSync(fish2)) return true;
    if (fs.existsSync(nav)) return true;
    if (fs.existsSync(yunshi)) return true;
  } catch {
    return false;
  }
  return false;
}

/** 插件包内 HTML 模板：每次初始化强制覆盖到运行时 data，避免旧版 remixicon 等残留 */
const MK_BUNDLED_TEMPLATE_FORCE_REFRESH = new Set([
  '导航菜单.html',
  '状态.html',
  '签到.html',
  '今日运势.html',
]);

/** 菜单渲染优先读插件包内模板，避免运行时 data 里旧文件导致图标发黑 */
function readMenuHtmlTemplate(pluginPath) {
  const candidates = [];
  const pp = String(pluginPath || "").trim();
  if (pp) candidates.push(path.join(pp, "默认资源", "导航菜单.html"));
  candidates.push(path.join(PLUGIN_DIR, "默认资源", "导航菜单.html"));
  for (const p of candidates) {
    try {
      if (fs.existsSync(p)) {
        const t = fs.readFileSync(p, "utf-8");
        if (String(t || "").trim()) return t;
      }
    } catch (_e) {
    }
  }
  return readA("默认资源/导航菜单.html") || "";
}
function injectMenuIconSprite(html) {
  const raw = String(html || "");
  if (!raw.trim()) return raw;
  if (raw.includes("mk-menu-icon-sprite")) return raw;
  const sprite = buildMenuIconSpriteSvg();
  if (/<body[^>]*>/i.test(raw)) {
    return raw.replace(/<body([^>]*)>/i, `<body$1>
${sprite}`);
  }
  return `${sprite}
${raw}`;
}
function mergeDefaultResourcesTree(fromRoot, toRoot, log, opts) {
  const onlyMissing = opts && opts.onlyMissing !== false;
  function walk(currentSrc, relParts) {
    const entries = fs.readdirSync(currentSrc, { withFileTypes: true });
    for (const ent of entries) {
      const from = path.join(currentSrc, ent.name);
      const nextParts = [...relParts, ent.name];
      const to = path.join(toRoot, ...nextParts);
      if (ent.isDirectory()) {
        if (!fs.existsSync(to)) fs.mkdirSync(to, { recursive: true });
        walk(from, nextParts);
      } else {
        const parent = path.dirname(to);
        if (!fs.existsSync(parent)) fs.mkdirSync(parent, { recursive: true });
        const relKey = nextParts.join("/");
        const forceRefresh = MK_BUNDLED_TEMPLATE_FORCE_REFRESH.has(ent.name) || MK_BUNDLED_TEMPLATE_FORCE_REFRESH.has(relKey);
        if (forceRefresh || !onlyMissing || !fs.existsSync(to)) {
          fs.copyFileSync(from, to);
        }
      }
    }
  }
  if (!fs.existsSync(toRoot)) fs.mkdirSync(toRoot, { recursive: true });
  walk(fromRoot, []);
  log?.info?.(
    `[MKbot] 默认资源树已写入: ${toRoot}${onlyMissing ? "（仅补缺，模板 HTML 强制刷新）" : ""}`
  );
}
function normalizeMojibakeDefaultResourceFolder(dataRoot, log) {
  const want = path.join(dataRoot, "默认资源");
  let candidates = [];
  try {
    for (const ent of fs.readdirSync(dataRoot, { withFileTypes: true })) {
      if (!ent.isDirectory()) continue;
      if (DEFAULT_RES_SKIP_DIR_NAMES.has(ent.name)) continue;
      const dir = path.join(dataRoot, ent.name);
      if (looksLikeDefaultResourceBundle(dir)) candidates.push(dir);
    }
  } catch {
    return;
  }
  if (!candidates.length) {
    log?.warn?.(
      "[MKbot] 未找到默认可识别资源目录；若仍为乱码名，请用 UTF-8 压缩包重新解压插件到 plugins 目录"
    );
    return;
  }
  const norm = (p) => path.normalize(p);
  const wantN = norm(want);
  const extras = candidates.filter((c) => norm(c) !== wantN);
  if (!extras.length) return;
  if (!fs.existsSync(want)) fs.mkdirSync(want, { recursive: true });
  for (const c of extras) {
    try {
      mergeDefaultResourcesTree(c, want, log, { onlyMissing: true });
      fs.rmSync(c, { recursive: true, force: true });
      log?.info?.("[MKbot] 已合并并移除乱码/重复的默认资源目录");
    } catch (e) {
      log?.warn?.(`[MKbot] 处理默认资源目录失败: ${e.message}`);
    }
  }
}
const plugin_init = async (ctx) => {
  logger = { ...defaultLogger, ...ctx.logger ?? {} };
  bindMkbotLogger(logger);
  const dp = ctx.configPath ? path.dirname(ctx.configPath) : "./data";
  if (!fs.existsSync(dp)) {
    fs.mkdirSync(dp, { recursive: true });
  }
  setDataPath(dp);
  setPluginPath(String(ctx.pluginPath || PLUGIN_DIR || "").trim());
  // 开关管理「复制选项」的临时记录只在本次运行内有效，启动/重载时整体清空
  try {
    const 清空数 = clearConfigClipboard(dp);
    if (清空数 > 0) {
      logger?.info?.(`[MKbot] 已清空开关管理复制记录 ${清空数} 项`);
    }
  } catch (e) {
    logger?.warn?.("[MKbot] 清空开关管理复制记录失败:", e?.message || e);
  }
  normalizeMojibakeDefaultResourceFolder(getPluginPath() || ctx.pluginPath, logger);
  const sharpPaths = mkSharpDepsPaths(ctx);
  configureSharpRuntimePaths(sharpPaths);
  configureSharpWorkerPaths({
    pluginDir: sharpPaths.pluginDir,
    dataDir: sharpPaths.dataDir
  });
  initSpamFloodGuard(logger);
  const mkMailSecret = randomBytes(24).toString("hex");
  setMkMailInternalSecret(mkMailSecret);
  mkMailSendDeps = { readA, writeA, getDataPath, __mkMailInternal: mkMailSecret };
  offlineNotifyDeps = { readA, writeA, getDataPath, 发邮箱 };
  mkSetProtocolBackendSetting(readB("config.json", "mkbot_protocol_backend", "auto"));
  await bindBotCtxWithProtocol(ctx);
  logger.warn("没事别更新！更新前要记得备份！");
  const fw = ctx.frameworkEnv;
  const isMkJsbot = fw && fw.frameworkId === "mk-jsbot";
  const isKakake = fw && fw.frameworkId === "kakake";
  const isMkFramework = isMkJsbot || isKakake;
  preferKakakeFrameworkRender = Boolean(isMkFramework);
  if (isKakake) {
    renderPluginId = "kakake-plugin-puppeteer";
    const host = fw.adminHost === "0.0.0.0" || fw.adminHost === "::" ? "127.0.0.1" : fw.adminHost;
    renderApiBase = `http://${host}:${fw.adminPort}`;
    logger.info(
      `[MKbot] 宿主 咔咔珂 Kakake v${fw.frameworkVersion} · OneBot ${fw.ob11Mode} · 项目根 ${fw.projectRoot}`
    );
    logger.info(`[MKbot] HTML渲染接口: ${mkBuildRenderApiUrl(renderApiBase)}（需安装 kakake-plugin-puppeteer）`);
    logger.info(`[MKbot] 本插件数据目录: ${dp}`);
  } else if (isMkJsbot) {
    renderPluginId = "kakake-plugin-puppeteer";
    const host = fw.adminHost === "0.0.0.0" || fw.adminHost === "::" ? "127.0.0.1" : fw.adminHost;
    renderApiBase = `http://${host}:${fw.adminPort}`;
    logger.info(
      `[MKbot] 宿主 咔咔珂 Kakake（mk-jsbot 兼容） v${fw.frameworkVersion} · OneBot ${fw.ob11Mode} · 项目根 ${fw.projectRoot}`
    );
    logger.info(`[MKbot] HTML渲染接口: ${mkBuildRenderApiUrl(renderApiBase)}（需安装 kakake-plugin-puppeteer）`);
    logger.info(`[MKbot] 本插件数据目录: ${dp}`);
  } else {
    renderPluginId = "napcat-plugin-puppeteer";
    try {
      const napRoot = ctx?.core?.context?.pathWrapper?.configPath;
      let napPort = 6099;
      if (napRoot && typeof napRoot === "string") {
        try {
          const webuiJsonPath = path.join(napRoot, "webui.json");
          if (fs.existsSync(webuiJsonPath)) {
            const j = JSON.parse(fs.readFileSync(webuiJsonPath, "utf-8"));
            if (j && typeof j.port === "number" && j.port > 0) napPort = j.port;
          }
        } catch (e) {
          logger?.warn?.("[MKbot] 读取 webui.json 端口失败，渲染接口暂用 6099:", e?.message);
        }
      }
      const napHttps = napRoot && typeof napRoot === "string" && fs.existsSync(path.join(napRoot, "cert.pem")) && fs.existsSync(path.join(napRoot, "key.pem"));
      const napProto = napHttps ? "https" : "http";
      const customRenderBase = String(readB("config.json", "mkbot_render_api_base", "") || "").trim().replace(/\/+$/, "");
      if (customRenderBase) {
        renderApiBase = customRenderBase;
      } else {
        renderApiBase = `${napProto}://127.0.0.1:${napPort}`;
      }
    } catch (e) {
      logger?.warn?.("[MKbot] NapCat 渲染基址初始化异常，使用默认 http://localhost:6099:", e?.message);
    }
    logger?.info?.(
      `[MKbot] NapCat 环境，HTML渲染接口: ${mkBuildRenderApiUrl(renderApiBase)}（可在插件 config.json 设置 mkbot_render_api_base 覆盖）`
    );
    const 即将转移文件夹 = path.join(ctx.pluginPath, "data");
    if (fs.existsSync(即将转移文件夹)) {
      logger.warn("正在进行文件夹数据转移，请等待加载完成！");
      let 文件夹名字 = mkResolvePluginStorageName(ctx);
      const 正式目录 = path.join(ctx.pluginPath, "..", "..", "config", "plugins", 文件夹名字);
      try {
        fs.cpSync(即将转移文件夹, 正式目录, {
          recursive: true,
          force: true,
          filter: (srcPath) => {
            const base = path.basename(srcPath);
            if (base === "默认资源") return false;
            try {
              if (fs.statSync(srcPath).isDirectory() && looksLikeDefaultResourceBundle(srcPath)) return false;
            } catch (_e) {
            }
            return true;
          }
        });
        logger.warn("已完成data文件夹数据转移！");
      } catch (error2) {
        logger.error(`移动失败: ${error2.message}`);
      }
    }
  }
  logger.info("MK 插件已初始化");
  writeB("config.json", "启动时间", Math.floor(Date.now() / 1e3));
  const configPath = ctx.configPath;
  let currentConfig = {};
  if (!fs.existsSync(configPath)) {
    currentConfig = { OwnerQQs: [], nowoner: false, nowonernr: "你不是她.......", noauth: true, noauthnr: "MK没能量啦～要充电电～～" };
    fs.writeFileSync(configPath, JSON.stringify(currentConfig, null, 2), "utf-8");
    logger.info("配置文件已创建");
  } else {
    try {
      currentConfig = JSON.parse(fs.readFileSync(configPath, "utf-8"));
      if (typeof currentConfig.OwnerQQs === "string") {
        const qqArray = currentConfig.OwnerQQs.split(/[,，、\s&|]+/).map((qq) => qq.trim()).filter((qq) => qq && /^\d+$/.test(qq));
        currentConfig.OwnerQQs = qqArray;
      }
      if (currentConfig.nowoner === undefined) {
        currentConfig.nowoner = false;
      }
      if (currentConfig.nowonernr === undefined) {
        currentConfig.nowonernr = "你不是她.......";
      }
      if (currentConfig.noauth === undefined) {
        currentConfig.noauth = true;
      }
      if (currentConfig.noauthnr === undefined) {
        currentConfig.noauthnr = "MK没能量啦～要充电电～～";
      }
      if (currentConfig.图片渲染 === undefined && currentConfig.cs_of === true) {
        currentConfig.图片渲染 = true;
      }
      if (currentConfig.渲染模式 === undefined) {
        currentConfig.渲染模式 = "html";
      }
      if (String(currentConfig.渲染模式).toLowerCase() === "python") {
        currentConfig.渲染模式 = "sharp";
      }
      if (currentConfig.Sharp背景暗度 === undefined) {
        currentConfig.Sharp背景暗度 = 40;
      }
      if (currentConfig.Sharp背景模糊 === undefined) {
        currentConfig.Sharp背景模糊 = 0;
      }
      fs.writeFileSync(configPath, JSON.stringify(currentConfig, null, 2), "utf-8");
    } catch (e) {
      logger.error("配置文件格式错误，使用默认配置");
      currentConfig = { OwnerQQs: [], nowoner: false, nowonernr: "你不是她.......", noauth: true, noauthnr: "MK没能量啦～要充电电～～" };
    }
  }
  const ownerQQsArray = currentConfig.OwnerQQs || [];
  const ownerQQsDisplay = Array.isArray(ownerQQsArray) ? ownerQQsArray.join(", ") : "";
  const nowoner = currentConfig.nowoner ?? false;
  const nowonernr = currentConfig.nowonernr ?? "你不是她.......";
  const noauth = currentConfig.noauth ?? true;
  const noauthnr = currentConfig.noauthnr ?? "MK没能量啦～要充电电～～";
  const 自触开关 = currentConfig.自触开关 ?? false;
  plugin_config_ui = [
    ctx.NapCatConfig.text("OwnerQQs", "主人 QQ", ownerQQsDisplay, "多个 QQ 用逗号分隔，如：123456,789012"),
    ctx.NapCatConfig.boolean("nowoner", "非主人回复开关", nowoner),
    ctx.NapCatConfig.text("nowonernr", "非主人回复", nowonernr),
    ctx.NapCatConfig.boolean("noauth", "未授权回复开关", noauth),
    ctx.NapCatConfig.text("noauthnr", "未授权回复", noauthnr),
    ctx.NapCatConfig.boolean("自触开关", "自触开关", 自触开关, "开启后，机器人自己发送的消息也会触发指令")
  ];
  globalThis.__mk_scheduler_armed = true;
  scheduleNextTask(ctx);
  try {
    const base = ctx.router;
    const ROUTE_PREFIX = "/mkbot";
    const mkbotVerifyNapCatWebUiAuth = async (req) => {
      const root = ctx?.core?.context?.pathWrapper?.configPath;
      if (!root || typeof root !== "string") {
        logger?.warn?.("[MKbot] WebUI 鉴权: 缺少 core.context.pathWrapper.configPath");
        return false;
      }
      let port = 6099;
      try {
        const webuiJsonPath = path.join(root, "webui.json");
        if (fs.existsSync(webuiJsonPath)) {
          const j = JSON.parse(fs.readFileSync(webuiJsonPath, "utf-8"));
          if (j && typeof j.port === "number" && j.port > 0) port = j.port;
        }
      } catch (e) {
        logger?.warn?.("[MKbot] WebUI 鉴权: 读取 webui.json 失败", e?.message);
      }
      const useHttps = fs.existsSync(path.join(root, "cert.pem")) && fs.existsSync(path.join(root, "key.pem"));
      const protocol = useHttps ? "https" : "http";
      const raw = req?.raw || req;
      const auth = raw?.headers?.authorization;
      let webuiTokenQ = typeof raw?.query?.webui_token === "string" ? raw.query.webui_token : undefined;
      if (!webuiTokenQ && raw?.url) {
        try {
          webuiTokenQ = new URL(raw.url, "http://127.0.0.1").searchParams.get("webui_token") || undefined;
        } catch (_) {
          webuiTokenQ = undefined;
        }
      }
      if (!auth && !webuiTokenQ) {
        return false;
      }
      let url = `${protocol}://127.0.0.1:${port}/api/test`;
      if (!auth && webuiTokenQ) {
        url += `?webui_token=${encodeURIComponent(webuiTokenQ)}`;
      }
      const fetchOpts = {
        method: "GET",
        headers: auth ? { Authorization: auth } : {}
      };
      if (protocol === "https") {
        fetchOpts.agent = new https.Agent({ rejectUnauthorized: false });
      }
      try {
        const r = await fetch(url, fetchOpts);
        return r.ok;
      } catch (e) {
        logger?.warn?.("[MKbot] WebUI 鉴权探测失败:", e?.message);
        return false;
      }
    };
    const mkFrameworkAuthRequired = Boolean(isMkFramework && fw?.adminAuthRequired);
    // 咔咔珂/mk-jsbot 鉴权：向宿主 /api/auth/state 复验调用方凭证。
    // 必须由本插件自己再验一次——宿主把 /plugin/<id>/files/* 列为公开路径，
    // 静态未命中时会回落进本插件的「需鉴权」API 路由，那条路上只有这里能拦。
    const MK_FW_AUTH_CACHE_TTL_MS = 10_000;
    const mkFwAuthCache = new Map();
    const mkFwAuthBase = (() => {
      const host = fw?.adminHost === "0.0.0.0" || fw?.adminHost === "::" ? "127.0.0.1" : fw?.adminHost;
      if (!host || !fw?.adminPort) return "";
      return `http://${host}:${fw.adminPort}`;
    })();
    const mkFwAuthStateUrl = mkFwAuthBase ? `${mkFwAuthBase}/api/auth/state` : "";
    /** plugin-info.js 必须在登录前可取，否则前端连登录门都渲染不出来 */
    const mkIsPublicWebUiAsset = (req) => {
      const raw = req?.raw || req;
      const candidates = [req?.path, raw?.path, raw?.url, raw?.originalUrl];
      return candidates.some((p) => /\/static\/plugin-info\.js(?:\?|$)/i.test(String(p || "")));
    };
    const mkPruneFwAuthCache = (now) => {
      for (const [k, v] of mkFwAuthCache) {
        if (now >= v.expireAt) mkFwAuthCache.delete(k);
      }
    };
    /** 向宿主 /api/auth/state 转发本次请求的凭证；返回原始 JSON 或 null */
    const mkFwProbeAuthState = async (cookie, auth) => {
      const headers = {};
      if (cookie) headers.cookie = cookie;
      if (auth) headers.authorization = auth;
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 5000);
      try {
        const r = await fetch(mkFwAuthStateUrl, { method: "GET", headers, signal: ctrl.signal });
        if (!r.ok) return null;
        return await r.json();
      } catch (e) {
        logger?.warn?.("[MKbot] 咔咔珂鉴权探测失败:", e?.message || e);
        return null;
      } finally {
        clearTimeout(timer);
      }
    };
    const mkFwAuthNotRequired = (j) => Boolean(j) && (j.authRequired === false || j.authRequired === "false");
    const mkWarnFwNoAuthOnce = () => {
      if (globalThis.__mkbot_fw_noauth_warned) return;
      globalThis.__mkbot_fw_noauth_warned = true;
      logger?.warn?.(
        "[MKbot] 宿主未启用后台口令（authRequired=false），WebUI 接口无法鉴权；请勿将后台端口暴露到公网"
      );
    };
    const mkbotVerifyKakakeWebUiAuth = async (req) => {
      if (!mkFwAuthStateUrl) {
        logger?.warn?.("[MKbot] WebUI 鉴权: frameworkEnv 缺少 adminHost/adminPort，拒绝访问");
        return false;
      }
      // 宿主已确认不需要口令：无凭证可验，遵从宿主策略
      if (globalThis.__mkbot_fw_auth_not_required === true) {
        mkWarnFwNoAuthOnce();
        return true;
      }

      const raw = req?.raw || req;
      const cookie = typeof raw?.headers?.cookie === "string" ? raw.headers.cookie : "";
      const auth = typeof raw?.headers?.authorization === "string" ? raw.headers.authorization : "";

      const now = Date.now();
      mkPruneFwAuthCache(now);
      // 只缓存「通过」结果；失败不缓存，避免刚登录仍被拒
      const cacheKey = createHash("sha256").update(`${cookie}\n${auth}`).digest("hex");
      const cached = mkFwAuthCache.get(cacheKey);
      if (cached && now < cached.expireAt) return true;

      const j = await mkFwProbeAuthState(cookie, auth);
      if (!j) return false;
      if (mkFwAuthNotRequired(j)) {
        globalThis.__mkbot_fw_auth_not_required = true;
        mkWarnFwNoAuthOnce();
        return true;
      }
      if (!cookie && !auth) return false;
      if (!(j.authed === true || j.authed === "true")) return false;
      mkFwAuthCache.set(cacheKey, { expireAt: Date.now() + MK_FW_AUTH_CACHE_TTL_MS });
      return true;
    };
    globalThis.__mkbot_fw_auth_cache = mkFwAuthCache;
    const wrapMkbotWebUiHandler = (handler) => {
      return async (req, res) => {
        if (mkIsPublicWebUiAsset(req)) {
          return handler(req, res);
        }
        if (isMkFramework) {
          if (!await mkbotVerifyKakakeWebUiAuth(req)) {
            res.status(401).json({ code: -1, message: "需要咔咔珂后台登录凭证" });
            return;
          }
          return handler(req, res);
        }
        if (!await mkbotVerifyNapCatWebUiAuth(req)) {
          res.status(401).json({ code: -1, message: "需要 NapCat WebUI 登录凭证" });
          return;
        }
        return handler(req, res);
      };
    };
    if (base && typeof base.get === "function") {
      const origGet = base.get.bind(base);
      base.get = (routePath, handler) => origGet(routePath, wrapMkbotWebUiHandler(handler));
      if (typeof base.post === "function") {
        const origPost = base.post.bind(base);
        base.post = (routePath, handler) => origPost(routePath, wrapMkbotWebUiHandler(handler));
      }
    }
    const wrapPath = (p) => {
      if (!p) return ROUTE_PREFIX;
      return p.startsWith("/") ? `${ROUTE_PREFIX}${p}` : `${ROUTE_PREFIX}/${p}`;
    };
    if (base && base.static) {
      base.static(wrapPath("/static"), "webui");
    }
    if (base && base.get) {
      base.get(wrapPath("/static/plugin-info.js"), (_req, res) => {
        try {
          res.type("application/javascript");
          let script = `window.__PLUGIN_NAME__ = ${JSON.stringify(ctx.pluginName)};`;
          if (isMkFramework) {
            const fwId = isKakake ? "kakake" : "mk-station";
            const authRequired = mkFrameworkAuthRequired;
            script += `window.__MK_FRAMEWORK__={id:${JSON.stringify(fwId)},authRequired:${authRequired ? "true" : "false"},authStateUrl:"/api/auth/state",loginPath:"/login"};`;
          }
          res.send(script);
        } catch (e) {
          res.status(500).send("// failed to generate plugin-info");
        }
      });
      base.get(wrapPath("/config"), (_req, res) => {
        try {
          const configPath2 = ctx.configPath;
          let config = {};
          if (fs.existsSync(configPath2)) {
            config = JSON.parse(fs.readFileSync(configPath2, "utf-8"));
          }
          // 全群/全私免开真源在全局事件文件，附带到 /config 供基础设置页
          config.全群免开 = mkGlobalEventOn("全群免开");
          config.全私免开 = mkGlobalEventOn("全私免开");
          res.json({ code: 0, data: config });
        } catch (error2) {
          logger?.error("获取配置失败:", error2);
          res.status(500).json({ code: -1, message: "获取配置失败" });
        }
      });
      base.get(wrapPath("/bot-info"), async (_req, res) => {
        try {
          let userId = "";
          let nickname = "";
          try {
            const login = await BOTAPI(ctx, "get_login_info", {});
            userId = String(login?.user_id ?? "").trim();
            nickname = String(login?.nickname ?? login?.user_name ?? "").trim();
          } catch (e) {
            logger?.warn?.("[WebUI] get_login_info 失败:", e?.message || e);
          }
          if (!userId) {
            const uin = ctx?.core?.selfInfo?.uin ?? ctx?.core?.selfInfo?.user_id;
            if (uin != null && String(uin).trim()) userId = String(uin).trim();
          }
          const avatarUrl = userId ? `https://q4.qlogo.cn/g?b=qq&nk=${encodeURIComponent(userId)}&s=640` : "";
          res.json({
            code: 0,
            data: { userId, nickname, avatarUrl, connected: Boolean(userId) }
          });
        } catch (error2) {
          logger?.error("获取机器人信息失败:", error2);
          res.status(500).json({ code: -1, message: "获取机器人信息失败" });
        }
      });
      base.get(wrapPath("/sharp-deps/status"), async (_req, res) => {
        try {
          const status = await getSharpDependencyStatus(mkSharpDepsPaths(ctx));
          res.json({ code: 0, data: status });
        } catch (error2) {
          logger?.error("[Sharp依赖] 状态查询失败:", error2);
          res.status(500).json({ code: -1, message: "状态查询失败" });
        }
      });
      base.get(wrapPath("/groups"), async (_req, res) => {
        try {
          const groups = await ctx.actions.call(
            "get_group_list",
            {},
            ctx.adapterName,
            ctx.pluginManager.config
          );
          res.json({ code: 0, data: { groups: groups || [] } });
        } catch (error2) {
          logger?.error("获取群聊列表失败:", error2);
          res.status(500).json({ code: -1, message: "获取群聊列表失败" });
        }
      });
      base.get(wrapPath("/friends"), async (_req, res) => {
        try {
          const friends = await ctx.actions.call(
            "get_friend_list",
            {},
            ctx.adapterName,
            ctx.pluginManager.config
          );
          res.json({ code: 0, data: { friends: friends || [] } });
        } catch (error2) {
          logger?.error("获取好友列表失败:", error2);
          res.status(500).json({ code: -1, message: "获取好友列表失败" });
        }
      });
      base.get(wrapPath("/events/group"), (req, res) => {
        try {
          const gid = String(req?.query?.group_id ?? "").trim();
          if (!/^\d+$/.test(gid)) {
            res.status(400).json({ code: -1, message: "group_id_required" });
            return;
          }
          const rel = `筱筱吖/事件系统/${gid}.json`;
          let raw = {};
          try {
            raw = JSON.parse(readA(rel) || "{}");
          } catch {
            raw = {};
          }
          const out = {};
          for (const k of array_shijian) {
            const v = raw && typeof raw === "object" ? raw[k] : undefined;
            out[k] = v === "开启" || v === "关闭" ? v : k === "禁言免验" ? "开启" : "关闭";
          }
          res.json({ code: 0, data: { group_id: gid, keys: array_shijian, values: out } });
        } catch (e) {
          logger?.error("读取群事件开关失败:", e);
          res.status(500).json({ code: -1, message: "读取失败" });
        }
      });
      if (base.post) {
        base.post(wrapPath("/events/group"), async (req, res) => {
          try {
            let body = req.body;
            if (!body || Object.keys(body).length === 0) {
              try {
                const raw = await new Promise((resolve) => {
                  let data = "";
                  req.on("data", (chunk) => data += chunk);
                  req.on("end", () => resolve(data));
                });
                if (raw) body = JSON.parse(raw);
              } catch (_e) {
                body = {};
              }
            }
            const gid = String(body?.group_id ?? "").trim();
            if (!/^\d+$/.test(gid)) {
              res.status(400).json({ code: -1, message: "group_id_required" });
              return;
            }
            const values = body?.values && typeof body.values === "object" ? body.values : {};
            const rel = `筱筱吖/事件系统/${gid}.json`;
            let cur = {};
            try {
              cur = JSON.parse(readA(rel) || "{}");
            } catch {
              cur = {};
            }
            if (!cur || typeof cur !== "object") cur = {};
            const allowed = new Set(array_shijian);
            let auditOpenedThisRequest = false;
            for (const [k0, v0] of Object.entries(values)) {
              const k = String(k0 || "").trim();
              if (!allowed.has(k)) continue;
              const v = String(v0 || "").trim();
              const next = v === "开启" ? "开启" : "关闭";
              if (k === "入群审核" && next === "开启") {
                auditOpenedThisRequest = true;
              }
              cur[k] = next;
            }
            writeA(rel, JSON.stringify(cur, null, 2));
            if (auditOpenedThisRequest) {
              await mkTrySyncNapCatJoinOptionForAudit(ctx, gid);
            }
            res.json({ code: 0, data: { group_id: gid } });
          } catch (e) {
            logger?.error("保存群事件开关失败:", e);
            res.status(500).json({ code: -1, message: "保存失败" });
          }
        });
      }
      base.get(wrapPath("/spam-flood/config"), (req, res) => {
        try {
          const gid = String(req?.query?.group_id ?? "").trim();
          if (!/^\d+$/.test(gid)) {
            res.status(400).json({ code: -1, message: "group_id_required" });
            return;
          }
          res.json({ code: 0, data: getSpamFloodWebPayload(gid, readB) });
        } catch (e) {
          logger?.error("读取刷屏配置失败:", e);
          res.status(500).json({ code: -1, message: "读取失败" });
        }
      });
      if (base.post) {
        base.post(wrapPath("/spam-flood/config"), async (req, res) => {
          try {
            let body = req.body;
            if (!body || Object.keys(body).length === 0) {
              try {
                const raw = await new Promise((resolve) => {
                  let data2 = "";
                  req.on("data", (chunk) => data2 += chunk);
                  req.on("end", () => resolve(data2));
                });
                if (raw) body = JSON.parse(raw);
              } catch (_e) {
                body = {};
              }
            }
            const gid = String(body?.group_id ?? "").trim();
            if (!/^\d+$/.test(gid)) {
              res.status(400).json({ code: -1, message: "group_id_required" });
              return;
            }
            const data = applySpamFloodWebSave(gid, body, readB, writeB);
            res.json({ code: 0, data });
          } catch (e) {
            logger?.error("保存刷屏配置失败:", e);
            res.status(500).json({ code: -1, message: "保存失败" });
          }
        });
        base.post(wrapPath("/spam-flood/config/reset"), async (req, res) => {
          try {
            let body = req.body;
            if (!body || Object.keys(body).length === 0) {
              try {
                const raw = await new Promise((resolve) => {
                  let data2 = "";
                  req.on("data", (chunk) => data2 += chunk);
                  req.on("end", () => resolve(data2));
                });
                if (raw) body = JSON.parse(raw);
              } catch (_e) {
                body = {};
              }
            }
            const gid = String(body?.group_id ?? "").trim();
            if (!/^\d+$/.test(gid)) {
              res.status(400).json({ code: -1, message: "group_id_required" });
              return;
            }
            const data = resetSpamFloodWebConfig(gid, readB, writeB);
            res.json({ code: 0, data });
          } catch (e) {
            logger?.error("重置刷屏配置失败:", e);
            res.status(500).json({ code: -1, message: "重置失败" });
          }
        });
      }
      base.get(wrapPath("/auto-like/list"), (_req, res) => {
        try {
          const configDir = path.dirname(ctx.configPath);
          const listPath = path.join(configDir, "筱筱吖/扩展功能/自动点赞/用户数据.json");
          let arr = [];
          if (fs.existsSync(listPath)) {
            try {
              arr = JSON.parse(fs.readFileSync(listPath, "utf-8")) || [];
            } catch {
              arr = [];
            }
          }
          const cleaned = (Array.isArray(arr) ? arr : []).map((x) => String(x).trim()).filter((x) => x && /^\d+$/.test(x));
          const seen =  new Set();
          const uniq = [];
          for (const qq of cleaned) {
            if (seen.has(qq)) continue;
            seen.add(qq);
            uniq.push(qq);
          }
          if (uniq.length !== cleaned.length) {
            const dir = path.dirname(listPath);
            if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
            fs.writeFileSync(listPath, JSON.stringify(uniq, null, 2), "utf-8");
          }
          res.json({ code: 0, data: { list: uniq } });
        } catch (error2) {
          logger?.error("获取自动点赞名单失败:", error2);
          res.status(500).json({ code: -1, message: "获取自动点赞名单失败" });
        }
      });
      base.get(wrapPath("/auto-like/mode"), (_req, res) => {
        try {
          const configDir = path.dirname(ctx.configPath);
          const modePath = path.join(configDir, "筱筱吖/扩展功能/自动点赞/模式.json");
          let mode = "全部";
          if (fs.existsSync(modePath)) {
            try {
              mode = (fs.readFileSync(modePath, "utf-8") || "").trim() || "全部";
            } catch {
              mode = "全部";
            }
          }
          if (mode !== "全部" && mode !== "特定") mode = "全部";
          res.json({ code: 0, data: { mode } });
        } catch (error2) {
          logger?.error("获取自动点赞模式失败:", error2);
          res.status(500).json({ code: -1, message: "获取自动点赞模式失败" });
        }
      });
      const cardShopWebDeps = { readA, writeA, writeB, getDataPath, rand };
      registerCardShopWebGetRoutes(base, wrapPath, cardShopWebDeps, logger);
      const mailWebDeps = { readA, writeA, getDataPath };
      registerMailWebGetRoutes(base, wrapPath, mailWebDeps, logger);
      const offlineNotifyWebDeps = { readA, writeA, getDataPath, 发邮箱 };
      registerOfflineNotifyWebGetRoutes(base, wrapPath, offlineNotifyWebDeps, logger);
      registerEntertainmentSwitchWebGetRoutes(base, wrapPath, { readB }, logger);
      registerGlobalForbiddenWebGetRoutes(base, wrapPath, { readA, readB }, logger);
      const configClipboardDeps = { readA, writeA, readB, writeB, deleteA, deleteKey };
      registerConfigClipboardWebGetRoutes(base, wrapPath, configClipboardDeps, logger);
      registerShopPriceWebGetRoutes(base, wrapPath, logger);
      registerBgEditWebGetRoutes(base, wrapPath, logger);
      const MK_BROADCAST_JSON = "筱筱吖/扩展功能/群发系统/可群发.json";
      const MK_BROADCAST_JSON_LINES = "筱筱吖/扩展功能/群发系统/自定义JSON消息.json";
      const MK_BROADCAST_CQ_LINES_LEGACY = "筱筱吖/扩展功能/群发系统/自定义CQ消息.json";
      const MK_BROADCAST_SEND_PROGRESS = "筱筱吖/扩展功能/群发系统/发送进度.json";
      const MK_BROADCAST_SCHEDULE_JSON = "筱筱吖/扩展功能/群发系统/定时JSON.json";
      const MK_BROADCAST_SCHEDULE_JSON_LEGACY = "筱筱吖/扩展功能/群发系统/定时CQ.json";
      const MK_DATA_EDIT_TYPES = [
        {
          type: "guijian",
          label: "归笺货币",
          file: "筱筱吖/娱乐系统/游戏数据/归笺.json"
        },
        {
          type: "bank_guijian",
          label: "银行货币",
          file: "筱筱吖/娱乐系统/游戏数据/银行系统/银行归笺.json"
        },
        {
          type: "bait",
          label: "诱饵",
          file: "筱筱吖/娱乐系统/钓鱼玩法/道具/诱饵.json"
        },
        {
          type: "mute_card",
          label: "禁言卡",
          file: "筱筱吖/娱乐系统/游戏数据/道具/禁言卡.json"
        }
      ];
      const clampInt = (v, lo, hi, fallback) => {
        const n = Number.parseInt(String(v), 10);
        if (Number.isNaN(n)) return fallback;
        return Math.min(hi, Math.max(lo, n));
      };
      const defaultBroadcastScheduleConfig = () => ({
        registerDedicated: false,
        mode: "interval",
        intervalSec: 3600,
        intervalLastFireAt: 0,
        atAll: false,
        calendarRules: [],
        onceFired: {},
        dailyLast: {},
        hourlyLast: {}
      });
      const loadBroadcastScheduleConfig = () => {
        let o = null;
        try {
          const rawNew = readA(MK_BROADCAST_SCHEDULE_JSON);
          const rawLegacy = readA(MK_BROADCAST_SCHEDULE_JSON_LEGACY);
          o = JSON.parse(rawNew || rawLegacy || "{}");
        } catch {
          o = {};
        }
        if (!o || typeof o !== "object") o = {};
        const d = defaultBroadcastScheduleConfig();
        return {
          registerDedicated: Boolean(o.registerDedicated),
          mode: o.mode === "calendar" ? "calendar" : "interval",
          intervalSec: clampInt(o.intervalSec, 10, 604800, d.intervalSec),
          intervalLastFireAt: Number(o.intervalLastFireAt) || 0,
          atAll: Boolean(o.atAll),
          calendarRules: Array.isArray(o.calendarRules) ? o.calendarRules : [],
          onceFired: o.onceFired && typeof o.onceFired === "object" ? o.onceFired : {},
          dailyLast: o.dailyLast && typeof o.dailyLast === "object" ? o.dailyLast : {},
          hourlyLast: o.hourlyLast && typeof o.hourlyLast === "object" ? o.hourlyLast : {}
        };
      };
      const saveBroadcastScheduleConfig = (cfg) => {
        writeA(MK_BROADCAST_SCHEDULE_JSON, JSON.stringify(cfg, null, 2));
      };
      const normalizeCalendarRulesForSave = (raw) => {
        if (!Array.isArray(raw)) return [];
        const out = [];
        for (const r of raw) {
          if (!r || typeof r !== "object") continue;
          const kind = String(r.kind || "").toLowerCase();
          if (kind === "once") {
            const iso = String(r.iso || "").trim();
            if (!iso) continue;
            out.push({ kind: "once", iso });
          } else if (kind === "daily") {
            out.push({
              kind: "daily",
              hour: clampInt(r.hour, 0, 23, 0),
              minute: clampInt(r.minute, 0, 59, 0),
              second: clampInt(r.second, 0, 59, 0)
            });
          } else if (kind === "hourly") {
            out.push({
              kind: "hourly",
              minute: clampInt(r.minute, 0, 59, 0),
              second: clampInt(r.second, 0, 59, 0)
            });
          }
        }
        return out;
      };
      const mkbotExecuteBroadcastJsonLinesInternal = async (ctx2, jsonLines, atAll) => {
        const lines = Array.isArray(jsonLines) ? jsonLines.filter((x) => Array.isArray(x) && x.length > 0) : [];
        if (!lines.length) {
          return { ok: false, reason: "no_lines" };
        }
        const 数据 = loadBroadcastListFromDisk();
        if (!数据.length) {
          return { ok: false, reason: "empty_list" };
        }
        if (globalThis.__mkbot_broadcast_send_busy) {
          return { ok: false, reason: "busy" };
        }
        const login = await BOTAPI(ctx2, "get_login_info", {});
        const selfId = Number(login?.user_id);
        const 群发成功后尝试纯艾特全体 = async (gidStr, gidNum, 已知身份) => {
          if (!atAll) return;
          let r = 已知身份;
          if (r === undefined || r === null) {
            const dpAt = await BOTAPI(ctx2, "get_group_member_info", {
              group_id: gidNum,
              user_id: selfId
            });
            r = RC_group_role[dpAt?.role || "member"] || 0;
          }
          if (r < 2) return;
          try {
            const resAt = await ctx2.actions.call(
              "send_msg",
              {
                message: [段_艾特("all")],
                message_type: "group",
                group_id: gidStr
              },
              ctx2.adapterName,
              ctx2.pluginManager.config
            );
            if (resAt && typeof resAt === "object" && "retcode" in resAt && Number(resAt.retcode) !== 0) {
              logger?.error(`[定时JSON·艾特全体] 群${gidStr} retcode=${resAt.retcode}`);
            }
          } catch (errAt) {
            logger?.error(`[定时JSON·艾特全体] 群${gidStr}:`, errAt);
          }
        };
        let 成功 = 0;
        const 失败 = [];
        globalThis.__mkbot_broadcast_send_busy = true;
        try {
          for (let i = 0; i < 数据.length; i++) {
            const gidRaw = 数据[i];
            const gidNum = typeof gidRaw === "number" ? gidRaw : Number(String(gidRaw).trim());
            const gidStr = String(gidNum);
            if (!gidNum || Number.isNaN(gidNum)) {
              失败.push(`${gidRaw}(无效)`);
              continue;
            }
            let lineFail = 0;
            for (let li = 0; li < lines.length; li++) {
              const seg = lines[li];
              try {
                const rmsg = await ctx2.actions.call(
                  "send_msg",
                  {
                    message: seg,
                    message_type: "group",
                    group_id: gidStr
                  },
                  ctx2.adapterName,
                  ctx2.pluginManager.config
                );
                if (rmsg === undefined) lineFail++;
              } catch (err) {
                logger?.error(`[定时JSON] 群${gidStr} 第${li + 1}条:`, err);
                lineFail++;
              }
            }
            if (lineFail === 0) {
              成功++;
              if (atAll) {
                await 群发成功后尝试纯艾特全体(gidStr, gidNum);
              }
            } else {
              失败.push(`${gidStr}(${lineFail}/${lines.length}条失败)`);
            }
          }
          logger?.info(
            `[定时JSON] 执行完成：成功 ${成功}/${数据.length}，失败 ${失败.length}`
          );
          return { ok: true, total: 数据.length, success: 成功, failed: 失败 };
        } finally {
          globalThis.__mkbot_broadcast_send_busy = false;
        }
      };
      const readBroadcastSendProgressFile = () => {
        try {
          const raw = readA(MK_BROADCAST_SEND_PROGRESS);
          if (raw == null || String(raw).trim() === "") return { status: "idle" };
          const o = JSON.parse(raw);
          return o && typeof o === "object" ? o : { status: "idle" };
        } catch {
          return { status: "idle" };
        }
      };
      const writeBroadcastSendProgressFile = (obj) => {
        try {
          writeA(MK_BROADCAST_SEND_PROGRESS, JSON.stringify(obj, null, 2));
        } catch (error2) {
          logger?.error("[群发进度] 写入失败:", error2);
        }
      };
      writeBroadcastSendProgressFile({ status: "idle", at: Date.now() });
      const loadJsonLinesFromDisk = () => {
        let arr = [];
        try {
          const rawNew = readA(MK_BROADCAST_JSON_LINES);
          const rawLegacy = readA(MK_BROADCAST_CQ_LINES_LEGACY);
          arr = JSON.parse(rawNew || rawLegacy || "[]") || [];
        } catch {
          arr = [];
        }
        if (!Array.isArray(arr)) return [];
        const lines = [];
        for (const item of arr) {
          const norm = normalizeBroadcastMessageLine(item);
          if (norm && norm.length) lines.push(norm);
        }
        if (!readA(MK_BROADCAST_JSON_LINES) && lines.length && readA(MK_BROADCAST_CQ_LINES_LEGACY)) {
          saveJsonLinesToDisk(lines);
        }
        return lines;
      };
      const saveJsonLinesToDisk = (raw) => {
        const arr = Array.isArray(raw) ? raw : [];
        const lines = [];
        for (const x of arr) {
          const norm = normalizeBroadcastMessageLine(x);
          if (norm && norm.length) lines.push(norm);
        }
        writeA(MK_BROADCAST_JSON_LINES, JSON.stringify(lines, null, 2));
        return lines;
      };
      const loadBroadcastListFromDisk = () => {
        let arr = [];
        try {
          arr = JSON.parse(readA(MK_BROADCAST_JSON) || "[]") || [];
        } catch {
          arr = [];
        }
        const cleaned = (Array.isArray(arr) ? arr : []).map((x) => String(x).trim()).filter((x) => x && /^\d+$/.test(x));
        const seen =  new Set();
        const uniq = [];
        for (const id of cleaned) {
          if (seen.has(id)) continue;
          seen.add(id);
          uniq.push(id);
        }
        return uniq;
      };
      const saveBroadcastListToDisk = (list) => {
        const seen =  new Set();
        const uniq = [];
        for (const id of list) {
          const s = String(id).trim();
          if (!s || !/^\d+$/.test(s) || seen.has(s)) continue;
          seen.add(s);
          uniq.push(s);
        }
        writeA(MK_BROADCAST_JSON, JSON.stringify(uniq, null, 2));
        return uniq;
      };
      const mkbotRunScheduledBroadcastTick = async (ctx2) => {
        const cfg = loadBroadcastScheduleConfig();
        if (!cfg.registerDedicated) return;
        const jsonLines = loadJsonLinesFromDisk();
        if (!jsonLines.length) return;
        if (globalThis.__mkbot_broadcast_send_busy) return;
        const now = Date.now();
        if (globalThis.__mkbot_schedule_last_fire_ts && now - globalThis.__mkbot_schedule_last_fire_ts < 2500) {
          return;
        }
        let shouldFire = false;
        const onceToMark = [];
        const nextCfg = {
          ...cfg,
          onceFired: { ...cfg.onceFired },
          dailyLast: { ...cfg.dailyLast },
          hourlyLast: { ...cfg.hourlyLast }
        };
        if (cfg.mode === "interval") {
          const sec = Math.max(10, cfg.intervalSec);
          let last = cfg.intervalLastFireAt || 0;
          if (!last) {
            nextCfg.intervalLastFireAt = now;
            saveBroadcastScheduleConfig(nextCfg);
            return;
          }
          if (now - last >= sec * 1e3) {
            shouldFire = true;
          }
        } else {
          const d =  new Date();
          const y = d.getFullYear();
          const mo = d.getMonth() + 1;
          const day = d.getDate();
          const h = d.getHours();
          const mi = d.getMinutes();
          const s = d.getSeconds();
          const dayKey = `${y}-${String(mo).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
          const hourKey = `${dayKey}-${String(h).padStart(2, "0")}`;
          for (let ri = 0; ri < cfg.calendarRules.length; ri++) {
            const rule = cfg.calendarRules[ri];
            if (!rule || typeof rule !== "object") continue;
            const kind = String(rule.kind || "").toLowerCase();
            if (kind === "once") {
              const iso = String(rule.iso || "").trim();
              if (!iso) continue;
              const t = new Date(iso);
              if (Number.isNaN(t.getTime())) continue;
              const firedKey = `once-${ri}`;
              if (nextCfg.onceFired[firedKey]) continue;
              if (Math.abs(now - t.getTime()) < 2e3) {
                shouldFire = true;
                onceToMark.push(firedKey);
              }
            } else if (kind === "daily") {
              const th = clampInt(rule.hour, 0, 23, 0);
              const tmi = clampInt(rule.minute, 0, 59, 0);
              const ts = clampInt(rule.second, 0, 59, 0);
              if (h === th && mi === tmi && s === ts) {
                const dk = `d${ri}`;
                if (nextCfg.dailyLast[dk] !== dayKey) {
                  shouldFire = true;
                  nextCfg.dailyLast[dk] = dayKey;
                }
              }
            } else if (kind === "hourly") {
              const tmi = clampInt(rule.minute, 0, 59, 0);
              const ts = clampInt(rule.second, 0, 59, 0);
              if (mi === tmi && s === ts) {
                const hk = `h${ri}`;
                if (nextCfg.hourlyLast[hk] !== hourKey) {
                  shouldFire = true;
                  nextCfg.hourlyLast[hk] = hourKey;
                }
              }
            }
          }
        }
        if (!shouldFire) return;
        if (globalThis.__mkbot_broadcast_send_busy) return;
        if (cfg.mode === "interval") {
          nextCfg.intervalLastFireAt = now;
        }
        globalThis.__mkbot_schedule_last_fire_ts = now;
        saveBroadcastScheduleConfig(nextCfg);
        try {
          const r = await mkbotExecuteBroadcastJsonLinesInternal(ctx2, jsonLines, cfg.atAll);
          if (r && r.ok && onceToMark.length) {
            const latest = loadBroadcastScheduleConfig();
            const merged = { ...latest, onceFired: { ...latest.onceFired } };
            for (const k of onceToMark) merged.onceFired[k] = true;
            saveBroadcastScheduleConfig(merged);
          }
        } catch (e) {
          logger?.error("[定时JSON] 执行异常:", e);
        }
      };
      const normalizeGroupListResponse = (raw) => {
        if (!raw) return [];
        if (Array.isArray(raw)) return raw;
        if (typeof raw === "object") return Object.values(raw).filter(Boolean);
        return [];
      };
      const getDataEditTypeMeta = (type) => {
        return MK_DATA_EDIT_TYPES.find((x) => x.type === type) || null;
      };
      const readDataEditMap = (relPath) => {
        let obj = {};
        try {
          obj = JSON.parse(readA(relPath) || "{}");
        } catch {
          obj = {};
        }
        if (!obj || typeof obj !== "object" || Array.isArray(obj)) obj = {};
        return obj;
      };
      const writeDataEditMap = (relPath, obj) => {
        writeA(relPath, JSON.stringify(obj, null, 2));
      };
      base.get(wrapPath("/broadcast/list"), (_req, res) => {
        try {
          const list = loadBroadcastListFromDisk();
          res.json({ code: 0, data: { list } });
        } catch (error2) {
          logger?.error("获取群发列表失败:", error2);
          res.status(500).json({ code: -1, message: "获取群发列表失败" });
        }
      });
      base.get(wrapPath("/data-edit/types"), (_req, res) => {
        try {
          const list = MK_DATA_EDIT_TYPES.map((x) => ({
            type: x.type,
            label: x.label
          }));
          res.json({ code: 0, data: { list } });
        } catch (error2) {
          logger?.error("获取修改数据类型失败:", error2);
          res.status(500).json({ code: -1, message: "获取修改数据类型失败" });
        }
      });
      base.get(wrapPath("/data-edit/list"), (_req, res) => {
        try {
          const type = String(_req?.query?.type || "guijian").trim();
          const meta = getDataEditTypeMeta(type);
          if (!meta) {
            res.status(400).json({ code: -1, message: "invalid_type" });
            return;
          }
          const page = Math.max(1, Number.parseInt(String(_req?.query?.page || "1"), 10) || 1);
          const pageSizeRaw = Number.parseInt(String(_req?.query?.pageSize || "100"), 10) || 100;
          const pageSize = Math.min(100, Math.max(1, pageSizeRaw));
          const dataMap = readDataEditMap(meta.file);
          const entries = Object.entries(dataMap).map(([k, v]) => {
            const userId = String(k || "").trim();
            const n = Number(v);
            return {
              user_id: userId,
              value: Number.isFinite(n) ? Math.floor(n) : 0
            };
          }).filter((x) => /^\d+$/.test(x.user_id)).sort((a, b) => b.value - a.value || Number(a.user_id) - Number(b.user_id));
          const total = entries.length;
          const totalPages = Math.max(1, Math.ceil(total / pageSize));
          const safePage = Math.min(page, totalPages);
          const start = (safePage - 1) * pageSize;
          const list = entries.slice(start, start + pageSize).map((x, idx) => ({
            user_id: x.user_id,
            value: x.value,
            rank: start + idx + 1,
            avatar: `https://q4.qlogo.cn/g?b=qq&nk=${x.user_id}&s=5`
          }));
          res.json({
            code: 0,
            data: {
              type: meta.type,
              label: meta.label,
              page: safePage,
              pageSize,
              total,
              totalPages,
              list
            }
          });
        } catch (error2) {
          logger?.error("获取修改数据分页失败:", error2);
          res.status(500).json({ code: -1, message: "获取修改数据分页失败" });
        }
      });
      base.get(wrapPath("/data-edit/search"), (_req, res) => {
        try {
          const type = String(_req?.query?.type || "guijian").trim();
          const q = String(_req?.query?.q || "").trim();
          const meta = getDataEditTypeMeta(type);
          if (!meta) {
            res.status(400).json({ code: -1, message: "invalid_type" });
            return;
          }
          if (!q) {
            res.json({ code: 0, data: { list: [] } });
            return;
          }
          const map = readDataEditMap(meta.file);
          const max = Math.min(100, Math.max(1, Number.parseInt(String(_req?.query?.limit || "20"), 10) || 20));
          const list = Object.entries(map).map(([k, v]) => {
            const userId = String(k || "").trim();
            const n = Number(v);
            return {
              user_id: userId,
              value: Number.isFinite(n) ? Math.floor(n) : 0
            };
          }).filter((x) => /^\d+$/.test(x.user_id) && x.user_id.includes(q)).sort((a, b) => a.user_id.length - b.user_id.length || Number(a.user_id) - Number(b.user_id)).slice(0, max).map((x) => ({
            user_id: x.user_id,
            value: x.value,
            avatar: `https://q4.qlogo.cn/g?b=qq&nk=${x.user_id}&s=5`
          }));
          res.json({ code: 0, data: { list } });
        } catch (error2) {
          logger?.error("搜索修改数据用户失败:", error2);
          res.status(500).json({ code: -1, message: "搜索修改数据用户失败" });
        }
      });
      base.get(wrapPath("/data-edit/user"), (_req, res) => {
        try {
          const type = String(_req?.query?.type || "guijian").trim();
          const userId = String(_req?.query?.user_id || "").trim();
          const meta = getDataEditTypeMeta(type);
          if (!meta) {
            res.status(400).json({ code: -1, message: "invalid_type" });
            return;
          }
          if (!/^\d+$/.test(userId)) {
            res.status(400).json({ code: -1, message: "invalid_user_id" });
            return;
          }
          const map = readDataEditMap(meta.file);
          const n = Number(map[userId]);
          const value = Number.isFinite(n) ? Math.floor(n) : 0;
          res.json({
            code: 0,
            data: {
              user_id: userId,
              value,
              avatar: `https://q4.qlogo.cn/g?b=qq&nk=${userId}&s=5`
            }
          });
        } catch (error2) {
          logger?.error("获取修改数据用户失败:", error2);
          res.status(500).json({ code: -1, message: "获取修改数据用户失败" });
        }
      });
      base.get(wrapPath("/broadcast/cards"), async (_req, res) => {
        try {
          const list = loadBroadcastListFromDisk();
          const login = await BOTAPI(ctx, "get_login_info", {});
          const selfId = Number(login?.user_id);
          const groups = normalizeGroupListResponse(await BOTAPI(ctx, "get_group_list", {}));
          const nameById =  new Map();
          for (const g of groups) {
            const gid = g?.group_id;
            if (gid == null) continue;
            nameById.set(String(gid), String(g.group_name || ""));
          }
          const cards = [];
          for (const gidStr of list) {
            const gidNum = Number(gidStr);
            let roleKey = "unknown";
            let roleLevel = 0;
            try {
              const dp2 = await BOTAPI(ctx, "get_group_member_info", {
                group_id: gidNum,
                user_id: selfId
              });
              roleKey = String(dp2?.role || "member");
              roleLevel = RC_group_role[roleKey] ?? RC_group_role.member;
            } catch {
            }
            const roleZh = roleLevel >= 3 ? "群主" : roleLevel >= 2 ? "管理员" : "成员";
            cards.push({
              group_id: gidStr,
              group_name: nameById.get(gidStr) || `群 ${gidStr}`,
              role: roleKey,
              role_level: roleLevel,
              role_zh: roleZh
            });
          }
          res.json({ code: 0, data: { list, cards } });
        } catch (error2) {
          logger?.error("获取群发卡片失败:", error2);
          res.status(500).json({ code: -1, message: "获取群发卡片失败" });
        }
      });
      const handleGetBroadcastJsonLines = (_req, res) => {
        try {
          const lines = loadJsonLinesFromDisk();
          res.json({ code: 0, data: { lines } });
        } catch (error2) {
          logger?.error("获取自定义 JSON 草稿失败:", error2);
          res.status(500).json({ code: -1, message: "获取自定义 JSON 草稿失败" });
        }
      };
      base.get(wrapPath("/broadcast/json-lines"), handleGetBroadcastJsonLines);
      base.get(wrapPath("/broadcast/cq-lines"), handleGetBroadcastJsonLines);
      base.get(wrapPath("/broadcast/send-progress"), (_req, res) => {
        try {
          const data = readBroadcastSendProgressFile();
          res.json({ code: 0, data });
        } catch (error2) {
          logger?.error("读取群发发送进度失败:", error2);
          res.status(500).json({ code: -1, message: "读取群发发送进度失败" });
        }
      });
      base.get(wrapPath("/broadcast/schedule-json"), (_req, res) => {
        try {
          const data = loadBroadcastScheduleConfig();
          res.json({ code: 0, data });
        } catch (error2) {
          logger?.error("读取定时 JSON 配置失败:", error2);
          res.status(500).json({ code: -1, message: "读取定时 JSON 配置失败" });
        }
      });
      base.get(wrapPath("/broadcast/schedule-cq"), (_req, res) => {
        try {
          const data = loadBroadcastScheduleConfig();
          res.json({ code: 0, data });
        } catch (error2) {
          logger?.error("读取定时 JSON 配置失败:", error2);
          res.status(500).json({ code: -1, message: "读取定时 JSON 配置失败" });
        }
      });
      if (base.post) {
        base.post(wrapPath("/config"), async (req, res) => {
          try {
            let body = req.body;
            if (!body || Object.keys(body).length === 0) {
              try {
                const raw = await new Promise((resolve) => {
                  let data = "";
                  req.on("data", (chunk) => data += chunk);
                  req.on("end", () => resolve(data));
                });
                if (raw) body = JSON.parse(raw);
              } catch (e) {
                logger?.error("解析请求体失败:", e);
              }
            }
            const configPath2 = ctx.configPath;
            const configDir = path.dirname(configPath2);
            if (!fs.existsSync(configDir)) {
              fs.mkdirSync(configDir, { recursive: true });
            }
            let config = {};
            if (fs.existsSync(configPath2)) {
              config = JSON.parse(fs.readFileSync(configPath2, "utf-8"));
            }
            const bodyObj = body && typeof body === "object" ? { ...body } : {};
            // 全群/全私免开写入全局事件，不落 config.json
            if (Object.prototype.hasOwnProperty.call(bodyObj, "全群免开")) {
              writeB(MK_GLOBAL_EVENT_FILE, "全群免开", bodyObj.全群免开 ? "开启" : "关闭");
              delete bodyObj.全群免开;
            }
            if (Object.prototype.hasOwnProperty.call(bodyObj, "全私免开")) {
              writeB(MK_GLOBAL_EVENT_FILE, "全私免开", bodyObj.全私免开 ? "开启" : "关闭");
              delete bodyObj.全私免开;
            }
            Object.assign(config, bodyObj);
            // 防止历史误写入残留
            delete config.全群免开;
            delete config.全私免开;
            fs.writeFileSync(configPath2, JSON.stringify(config, null, 2), "utf-8");
            logger?.info("配置已保存");
            res.json({ code: 0, message: "ok" });
          } catch (error2) {
            logger?.error("保存配置失败:", error2);
            res.status(500).json({ code: -1, message: "保存配置失败" });
          }
        });
        base.post(wrapPath("/sharp-deps/install"), async (_req, res) => {
          try {
            const paths = mkSharpDepsPaths(ctx);
            const result = await triggerSharpDependencyInstall(paths, logger);
            const status = await getSharpDependencyStatus(paths);
            res.json({
              code: 0,
              message: result.message,
              data: status
            });
          } catch (error2) {
            logger?.error("[Sharp依赖] 启动安装失败:", error2);
            res.status(500).json({ code: -1, message: error2?.message || "启动安装失败" });
          }
        });
        base.post(wrapPath("/time-data"), async (req, res) => {
          try {
            let body = req.body;
            if (!body || Object.keys(body).length === 0) {
              try {
                const raw = await new Promise((resolve) => {
                  let data = "";
                  req.on("data", (chunk) => data += chunk);
                  req.on("end", () => resolve(data));
                });
                if (raw) body = JSON.parse(raw);
              } catch (e) {
                logger?.error("解析请求体失败:", e);
              }
            }
            const configDir = path.dirname(ctx.configPath);
            if (!fs.existsSync(configDir)) {
              fs.mkdirSync(configDir, { recursive: true });
            }
            const timeDataPath = path.join(configDir, "变态.json");
            const timeData = {
              群: body?.群 || [],
              QQ: body?.QQ || [],
              转发: body?.转发 || "",
              方式: body?.方式 || "私聊"
            };
            fs.writeFileSync(timeDataPath, JSON.stringify(timeData, null, 2), "utf-8");
            logger?.info("时间数据已保存");
            res.json({ code: 0, message: "ok" });
          } catch (error2) {
            logger?.error("保存时间数据失败:", error2);
            res.status(500).json({ code: -1, message: "保存时间数据失败" });
          }
        });
        base.post(wrapPath("/getDeepEntertainmentStatus"), async (req, res) => {
          try {
            let body = req.body;
            if (!body || Object.keys(body).length === 0) {
              try {
                const raw = await new Promise((resolve) => {
                  let data = "";
                  req.on("data", (chunk) => data += chunk);
                  req.on("end", () => resolve(data));
                });
                if (raw) body = JSON.parse(raw);
              } catch (e) {
                logger?.error("解析请求体失败:", e);
                res.status(400).json({ code: -1, message: "解析请求体失败" });
                return;
              }
            }
            const { path: configPath2, key } = body || {};
            if (!configPath2 || !key) {
              res.status(400).json({ code: -1, message: "缺少必要参数" });
              return;
            }
            const configDir = path.dirname(ctx.configPath);
            const deepEntertainmentPath = path.join(configDir, configPath2);
            let status = true;
            if (fs.existsSync(deepEntertainmentPath)) {
              try {
                const content = fs.readFileSync(deepEntertainmentPath, "utf-8");
                const data = JSON.parse(content);
                status = data[key] ?? true;
              } catch (e) {
                logger?.error("读取深度娱乐开关状态失败:", e);
              }
            }
            res.json({ code: 0, data: { status } });
          } catch (error2) {
            logger?.error("获取深度娱乐开关状态失败:", error2);
            res.status(500).json({ code: -1, message: `获取深度娱乐开关状态失败: ${error2.message}` });
          }
        });
        base.post(wrapPath("/msg-record/status"), async (req, res) => {
          try {
            let body = req.body;
            if (!body || Object.keys(body).length === 0) {
              const raw = await new Promise((resolve) => {
                let data = "";
                req.on("data", (chunk) => data += chunk);
                req.on("end", () => resolve(data));
              });
              if (raw) body = JSON.parse(raw);
            }
            const userId = String(body?.user_id || "").trim();
            if (!userId || !/^\d+$/.test(userId)) {
              res.status(400).json({ code: -1, message: "user_id 无效" });
              return;
            }
            const enabled = readB(MK_MSG_RECORD_HAOYOU_SWITCH, userId, "关闭") === "开启";
            res.json({ code: 0, data: { enabled } });
          } catch (error2) {
            logger?.error("查询消息记录开关失败:", error2);
            res.status(500).json({ code: -1, message: "查询消息记录开关失败" });
          }
        });
        base.post(wrapPath("/msg-record/set"), async (req, res) => {
          try {
            let body = req.body;
            if (!body || Object.keys(body).length === 0) {
              const raw = await new Promise((resolve) => {
                let data = "";
                req.on("data", (chunk) => data += chunk);
                req.on("end", () => resolve(data));
              });
              if (raw) body = JSON.parse(raw);
            }
            const userId = String(body?.user_id || "").trim();
            const enabled = !!body?.enabled;
            if (!userId || !/^\d+$/.test(userId)) {
              res.status(400).json({ code: -1, message: "user_id 无效" });
              return;
            }
            writeB(MK_MSG_RECORD_HAOYOU_SWITCH, userId, enabled ? "开启" : "关闭");
            res.json({ code: 0, data: { enabled } });
          } catch (error2) {
            logger?.error("设置消息记录开关失败:", error2);
            res.status(500).json({ code: -1, message: "设置消息记录开关失败" });
          }
        });
        base.post(wrapPath("/auto-like/status"), async (req, res) => {
          try {
            let body = req.body;
            if (!body || Object.keys(body).length === 0) {
              const raw = await new Promise((resolve) => {
                let data = "";
                req.on("data", (chunk) => data += chunk);
                req.on("end", () => resolve(data));
              });
              if (raw) body = JSON.parse(raw);
            }
            const userId = String(body?.user_id || "").trim();
            if (!userId || !/^\d+$/.test(userId)) {
              res.status(400).json({ code: -1, message: "user_id 无效" });
              return;
            }
            const configDir = path.dirname(ctx.configPath);
            const listPath = path.join(configDir, "筱筱吖/扩展功能/自动点赞/用户数据.json");
            let arr = [];
            if (fs.existsSync(listPath)) {
              try {
                arr = JSON.parse(fs.readFileSync(listPath, "utf-8")) || [];
              } catch {
                arr = [];
              }
            }
            const enabled = (Array.isArray(arr) ? arr : []).map((x) => String(x)).includes(userId);
            res.json({ code: 0, data: { enabled } });
          } catch (error2) {
            logger?.error("查询自动点赞状态失败:", error2);
            res.status(500).json({ code: -1, message: "查询自动点赞状态失败" });
          }
        });
        base.post(wrapPath("/auto-like/set"), async (req, res) => {
          try {
            let body = req.body;
            if (!body || Object.keys(body).length === 0) {
              const raw = await new Promise((resolve) => {
                let data = "";
                req.on("data", (chunk) => data += chunk);
                req.on("end", () => resolve(data));
              });
              if (raw) body = JSON.parse(raw);
            }
            const userId = String(body?.user_id || "").trim();
            const enabled = !!body?.enabled;
            if (!userId || !/^\d+$/.test(userId)) {
              res.status(400).json({ code: -1, message: "user_id 无效" });
              return;
            }
            const configDir = path.dirname(ctx.configPath);
            const listPath = path.join(configDir, "筱筱吖/扩展功能/自动点赞/用户数据.json");
            let arr = [];
            if (fs.existsSync(listPath)) {
              try {
                arr = JSON.parse(fs.readFileSync(listPath, "utf-8")) || [];
              } catch {
                arr = [];
              }
            }
            let cleaned = (Array.isArray(arr) ? arr : []).map((x) => String(x).trim()).filter((x) => x && /^\d+$/.test(x));
            if (enabled) {
              cleaned.push(userId);
            } else {
              cleaned = cleaned.filter((x) => x !== userId);
            }
            const seen =  new Set();
            const uniq = [];
            for (const qq of cleaned) {
              if (seen.has(qq)) continue;
              seen.add(qq);
              uniq.push(qq);
            }
            const dir = path.dirname(listPath);
            if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
            fs.writeFileSync(listPath, JSON.stringify(uniq, null, 2), "utf-8");
            res.json({ code: 0, data: { list: uniq, enabled: uniq.includes(userId) } });
          } catch (error2) {
            logger?.error("设置自动点赞名单失败:", error2);
            res.status(500).json({ code: -1, message: "设置自动点赞名单失败" });
          }
        });
        base.post(wrapPath("/auto-like/mode"), async (req, res) => {
          try {
            let body = req.body;
            if (!body || Object.keys(body).length === 0) {
              const raw = await new Promise((resolve) => {
                let data = "";
                req.on("data", (chunk) => data += chunk);
                req.on("end", () => resolve(data));
              });
              if (raw) body = JSON.parse(raw);
            }
            let mode = String(body?.mode || "").trim();
            if (mode !== "全部" && mode !== "特定") {
              res.status(400).json({ code: -1, message: "mode 必须是 全部 或 特定" });
              return;
            }
            const configDir = path.dirname(ctx.configPath);
            const modePath = path.join(configDir, "筱筱吖/扩展功能/自动点赞/模式.json");
            const dir = path.dirname(modePath);
            if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
            fs.writeFileSync(modePath, mode, "utf-8");
            res.json({ code: 0, data: { mode } });
          } catch (error2) {
            logger?.error("设置自动点赞模式失败:", error2);
            res.status(500).json({ code: -1, message: "设置自动点赞模式失败" });
          }
        });
        base.post(wrapPath("/broadcast/refresh"), async (_req, res) => {
          try {
            const login = await BOTAPI(ctx, "get_login_info", {});
            const selfId = Number(login?.user_id);
            const 总群数据 = normalizeGroupListResponse(await BOTAPI(ctx, "get_group_list", {}));
            if (!总群数据.length) {
              res.status(500).json({ code: -1, message: "获取群聊列表失败或为空" });
              return;
            }
            const 有效群 = [];
            for (let i = 0; i < 总群数据.length; i++) {
              const 本次群号 = 总群数据[i]?.group_id;
              if (!本次群号) continue;
              const dp188 = await BOTAPI(ctx, "get_group_member_info", {
                group_id: 本次群号,
                user_id: selfId
              });
              const Robot身份 = RC_group_role[dp188?.role || "member"] || 0;
              if (Robot身份 >= 2) 有效群.push(String(本次群号));
            }
            if (有效群.length === 0) {
              res.status(400).json({
                code: -1,
                message: "遍历完成：机器人在全部群均无管理员及以上权限"
              });
              return;
            }
            const list = saveBroadcastListToDisk(有效群);
            res.json({ code: 0, data: { list, count: list.length } });
          } catch (error2) {
            logger?.error("刷新群发列表失败:", error2);
            res.status(500).json({ code: -1, message: "刷新群发列表失败" });
          }
        });
        base.post(wrapPath("/broadcast/refresh-all"), async (_req, res) => {
          try {
            const 总群数据 = normalizeGroupListResponse(await BOTAPI(ctx, "get_group_list", {}));
            if (!总群数据.length) {
              res.status(500).json({ code: -1, message: "获取群聊列表失败或为空" });
              return;
            }
            const 全部群号 = [];
            for (let i = 0; i < 总群数据.length; i++) {
              const id = 总群数据[i]?.group_id;
              if (id != null) 全部群号.push(String(id));
            }
            const list = saveBroadcastListToDisk(全部群号);
            res.json({ code: 0, data: { list, count: list.length } });
          } catch (error2) {
            logger?.error("全部获取群发列表失败:", error2);
            res.status(500).json({ code: -1, message: "全部获取群发列表失败" });
          }
        });
        base.post(wrapPath("/broadcast/add"), async (req, res) => {
          try {
            let body = req.body;
            if ((body == null || typeof body !== "object") && req.rawBody) {
              try {
                body = JSON.parse(req.rawBody);
              } catch {
                body = {};
              }
            }
            const gid = String(body?.group_id ?? "").trim();
            if (!/^\d+$/.test(gid)) {
              res.status(400).json({ code: -1, message: "群号无效" });
              return;
            }
            const cur = loadBroadcastListFromDisk();
            if (cur.includes(gid)) {
              res.json({ code: 0, data: { list: cur, added: false } });
              return;
            }
            cur.push(gid);
            const list = saveBroadcastListToDisk(cur);
            res.json({ code: 0, data: { list, added: true } });
          } catch (error2) {
            logger?.error("新增群发目标失败:", error2);
            res.status(500).json({ code: -1, message: "新增群发目标失败" });
          }
        });
        base.post(wrapPath("/broadcast/remove"), async (req, res) => {
          try {
            let body = req.body;
            if ((body == null || typeof body !== "object") && req.rawBody) {
              try {
                body = JSON.parse(req.rawBody);
              } catch {
                body = {};
              }
            }
            const gid = String(body?.group_id ?? "").trim();
            if (!/^\d+$/.test(gid)) {
              res.status(400).json({ code: -1, message: "群号无效" });
              return;
            }
            const cur = loadBroadcastListFromDisk();
            if (!cur.includes(gid)) {
              res.json({ code: 0, data: { list: cur, removed: false } });
              return;
            }
            const list = saveBroadcastListToDisk(cur.filter((x) => x !== gid));
            res.json({ code: 0, data: { list, removed: true } });
          } catch (error2) {
            logger?.error("移除群发目标失败:", error2);
            res.status(500).json({ code: -1, message: "移除群发目标失败" });
          }
        });
        const handlePostBroadcastJsonLines = async (req, res) => {
          try {
            let body = req.body;
            if ((body == null || typeof body !== "object") && req.rawBody) {
              try {
                body = JSON.parse(req.rawBody);
              } catch {
                body = {};
              }
            }
            const raw = body?.lines;
            const lines = saveJsonLinesToDisk(Array.isArray(raw) ? raw : []);
            res.json({ code: 0, data: { lines } });
          } catch (error2) {
            logger?.error("保存自定义 JSON 草稿失败:", error2);
            res.status(500).json({ code: -1, message: "保存自定义 JSON 草稿失败" });
          }
        };
        base.post(wrapPath("/broadcast/json-lines"), handlePostBroadcastJsonLines);
        base.post(wrapPath("/broadcast/cq-lines"), handlePostBroadcastJsonLines);
        const handlePostBroadcastScheduleJson = async (req, res) => {
          try {
            let body = req.body;
            if ((body == null || typeof body !== "object") && req.rawBody) {
              try {
                body = JSON.parse(req.rawBody);
              } catch {
                body = {};
              }
            }
            const cur = loadBroadcastScheduleConfig();
            const registerDedicated = Boolean(body?.registerDedicated);
            const mode = String(body?.mode || "").toLowerCase() === "calendar" ? "calendar" : "interval";
            const intervalSec = clampInt(body?.intervalSec, 10, 604800, cur.intervalSec);
            const atAll = Boolean(body?.atAll);
            const calendarRules = registerDedicated ? normalizeCalendarRulesForSave(body?.calendarRules) : [];
            const next = {
              registerDedicated,
              mode,
              intervalSec,
              atAll,
              calendarRules,
              onceFired: registerDedicated ? { ...cur.onceFired } : {},
              dailyLast: registerDedicated ? { ...cur.dailyLast } : {},
              hourlyLast: registerDedicated ? { ...cur.hourlyLast } : {},
              intervalLastFireAt: registerDedicated ? cur.intervalLastFireAt || 0 : 0
            };
            if (registerDedicated && !cur.registerDedicated) {
              next.intervalLastFireAt = 0;
            }
            if (registerDedicated && body?.resetIntervalAnchor) {
              next.intervalLastFireAt = 0;
            }
            saveBroadcastScheduleConfig(next);
            res.json({ code: 0, data: loadBroadcastScheduleConfig() });
          } catch (error2) {
            logger?.error("保存定时 JSON 配置失败:", error2);
            res.status(500).json({ code: -1, message: "保存定时 JSON 配置失败" });
          }
        };
        base.post(wrapPath("/broadcast/schedule-json"), handlePostBroadcastScheduleJson);
        base.post(wrapPath("/broadcast/schedule-cq"), handlePostBroadcastScheduleJson);
        base.post(wrapPath("/broadcast/send"), async (req, res) => {
          try {
            let body = req.body;
            if ((body == null || typeof body !== "object") && req.rawBody) {
              try {
                body = JSON.parse(req.rawBody);
              } catch {
                body = {};
              }
            }
            const modeRaw = String(body?.mode || "text").toLowerCase();
            const modeNorm = modeRaw === "notice" ? "notice" : modeRaw === "text" ? "text" : null;
            if (!modeNorm) {
              res.status(400).json({ code: -1, message: "mode 仅支持 text 或 notice" });
              return;
            }
            const content = String(body?.content ?? "").trim();
            const imageFile = String(body?.imageFile ?? "").trim();
            const atAll = Boolean(body?.atAll);
            let jsonLines = [];
            if (modeNorm === "text") {
              if (Array.isArray(body?.lines)) {
                for (const x of body.lines) {
                  const norm = normalizeBroadcastMessageLine(x);
                  if (norm && norm.length) jsonLines.push(norm);
                }
              }
              const legacyContent = String(body?.content ?? "").trim();
              if (!jsonLines.length && legacyContent) {
                const norm = normalizeBroadcastMessageLine(legacyContent);
                if (norm && norm.length) jsonLines.push(norm);
              }
            }
            const 数据 = loadBroadcastListFromDisk();
            const 总数量 = 数据.length;
            if (总数量 === 0) {
              res.status(400).json({ code: -1, message: "可群发列表为空" });
              return;
            }
            const login = await BOTAPI(ctx, "get_login_info", {});
            const selfId = Number(login?.user_id);
            const text_count = content.length;
            if (modeNorm === "text") {
              if (jsonLines.length < 1) {
                res.status(400).json({
                  code: -1,
                  message: "至少一条自定义 JSON 消息段"
                });
                return;
              }
            }
            if (modeNorm === "notice" && text_count < 1) {
              res.status(400).json({ code: -1, message: "群发公告至少需要文字内容" });
              return;
            }
            let 图片文件 = "";
            if (modeNorm === "notice" && imageFile) {
              const dp0 = await BOTAPI(ctx, "get_image", { file: imageFile });
              图片文件 = dp0?.file || "";
            }
            const 群发成功后尝试纯艾特全体 = async (gidStr, gidNum, 已知身份) => {
              if (!atAll) return;
              let r = 已知身份;
              if (r === undefined || r === null) {
                const dpAt = await BOTAPI(ctx, "get_group_member_info", {
                  group_id: gidNum,
                  user_id: selfId
                });
                r = RC_group_role[dpAt?.role || "member"] || 0;
              }
              if (r < 2) return;
              try {
                const resAt = await ctx.actions.call(
                  "send_msg",
                  {
                    message: [段_艾特("all")],
                    message_type: "group",
                    group_id: gidStr
                  },
                  ctx.adapterName,
                  ctx.pluginManager.config
                );
                if (resAt && typeof resAt === "object" && "retcode" in resAt && Number(resAt.retcode) !== 0) {
                  logger?.error(`[WebUI群发·艾特全体] 群${gidStr} retcode=${resAt.retcode}`);
                }
              } catch (errAt) {
                logger?.error(`[WebUI群发·艾特全体] 群${gidStr}:`, errAt);
              }
            };
            const clipBd = (line, max = 72) => clipBroadcastLinePreview(line, max);
            let validCount = 0;
            for (let vi = 0; vi < 总数量; vi++) {
              const gr = 数据[vi];
              const gn = typeof gr === "number" ? gr : Number(String(gr).trim());
              if (gn && !Number.isNaN(gn)) validCount++;
            }
            let totalSteps = 1;
            if (modeNorm === "text") {
              totalSteps = Math.max(1, validCount * jsonLines.length + (atAll ? validCount : 0));
            } else {
              totalSteps = Math.max(1, validCount * (1 + (atAll ? 1 : 0)));
            }
            if (globalThis.__mkbot_broadcast_send_busy) {
              res.status(409).json({ code: -1, message: "已有群发任务进行中" });
              return;
            }
            let currentStep = 0;
            const flushProgress = (detail, phase) => {
              const percent = Math.min(99, Math.round(100 * currentStep / totalSteps));
              writeBroadcastSendProgressFile({
                status: "running",
                mode: modeNorm,
                phase: phase || "",
                percent,
                currentStep,
                totalSteps,
                detail: String(detail || "发送中…"),
                at: Date.now()
              });
            };
            const bumpStep = (detail, phase) => {
              currentStep = Math.min(totalSteps, currentStep + 1);
              flushProgress(detail, phase);
            };
            let 成功 = 0;
            const 失败 = [];
            const 无管理员 = [];
            globalThis.__mkbot_broadcast_send_busy = true;
            try {
              flushProgress("准备发送…", "init");
              for (let i = 0; i < 总数量; i++) {
                const gidRaw = 数据[i];
                const gidNum = typeof gidRaw === "number" ? gidRaw : Number(String(gidRaw).trim());
                const gidStr = String(gidNum);
                if (!gidNum || Number.isNaN(gidNum)) {
                  失败.push(`${gidRaw}(无效)`);
                  continue;
                }
                if (modeNorm === "text") {
                  let lineFail = 0;
                  for (let li = 0; li < jsonLines.length; li++) {
                    const seg = jsonLines[li];
                    flushProgress(
                      `群 ${gidStr} · 第 ${li + 1}/${jsonLines.length} 条 JSON：${clipBd(seg)}`,
                      "json"
                    );
                    try {
                      const rmsg = await ctx.actions.call(
                        "send_msg",
                        {
                          message: seg,
                          message_type: "group",
                          group_id: gidStr
                        },
                        ctx.adapterName,
                        ctx.pluginManager.config
                      );
                      if (rmsg === undefined) lineFail++;
                    } catch (err) {
                      logger?.error(`[WebUI群发·JSON] 群${gidStr} 第${li + 1}条:`, err);
                      lineFail++;
                    }
                    bumpStep(
                      `群 ${gidStr} · 第 ${li + 1}/${jsonLines.length} 条已尝试`,
                      "json_done"
                    );
                  }
                  if (lineFail === 0) {
                    成功++;
                    if (atAll) {
                      flushProgress(`群 ${gidStr} · @全体成员`, "at_all");
                      await 群发成功后尝试纯艾特全体(gidStr, gidNum);
                      bumpStep(`群 ${gidStr} · @全体成员已尝试`, "at_all_done");
                    }
                  } else {
                    失败.push(`${gidStr}(${lineFail}/${jsonLines.length}条失败)`);
                  }
                  continue;
                }
                flushProgress(`群 ${gidStr} · 检查权限并发送公告`, "notice");
                const dp188 = await BOTAPI(ctx, "get_group_member_info", {
                  group_id: gidNum,
                  user_id: selfId
                });
                const Robot身份 = RC_group_role[dp188?.role || "member"] || 0;
                if (Robot身份 < 2) {
                  无管理员.push(gidStr);
                  bumpStep(`群 ${gidStr} · 无管理权限，跳过公告`, "notice_skip");
                  continue;
                }
                const 参数 = {
                  group_id: gidNum,
                  content,
                  image: 图片文件,
                  pinned: 0,
                  type: 0,
                  confirm_required: 0,
                  is_show_edit_card: 0,
                  tip_window_type: 0
                };
                try {
                  flushProgress(`群 ${gidStr} · 提交公告：${clipBd(content, 48)}`, "notice_send");
                  const rsn = await BOTAPI(ctx, "_send_group_notice", 参数);
                  if (rsn === undefined) {
                    失败.push(gidStr);
                    bumpStep(`群 ${gidStr} · 公告发送失败`, "notice_fail");
                  } else if (typeof rsn === "object" && "retcode" in rsn && Number(rsn.retcode) !== 0) {
                    失败.push(gidStr);
                    bumpStep(`群 ${gidStr} · 公告 retcode=${rsn.retcode}`, "notice_fail");
                  } else {
                    成功++;
                    bumpStep(`群 ${gidStr} · 公告已发送`, "notice_ok");
                    if (atAll) {
                      flushProgress(`群 ${gidStr} · @全体成员`, "at_all");
                      await 群发成功后尝试纯艾特全体(gidStr, gidNum, Robot身份);
                      bumpStep(`群 ${gidStr} · @全体成员已尝试`, "at_all_done");
                    }
                  }
                } catch (err) {
                  logger?.error(`[WebUI群发·公告] 群${gidStr}:`, err);
                  失败.push(gidStr);
                  bumpStep(`群 ${gidStr} · 公告异常`, "notice_err");
                }
              }
              currentStep = totalSteps;
              const detailDone = `完成：成功 ${成功}/${总数量}${无管理员.length ? `；无管理 ${无管理员.length}` : ""}${失败.length ? `；失败 ${失败.length}` : ""}`;
              writeBroadcastSendProgressFile({
                status: "completed",
                mode: modeNorm,
                percent: 100,
                currentStep: totalSteps,
                totalSteps,
                detail: detailDone,
                at: Date.now()
              });
              res.json({
                code: 0,
                data: {
                  ok: true,
                  total: 总数量,
                  success: 成功,
                  failed: 失败,
                  noAdmin: 无管理员
                }
              });
            } catch (runErr) {
              logger?.error("群发发送过程异常:", runErr);
              writeBroadcastSendProgressFile({
                status: "error",
                mode: modeNorm,
                percent: 100,
                detail: String(runErr?.message || "群发异常"),
                at: Date.now()
              });
              throw runErr;
            } finally {
              globalThis.__mkbot_broadcast_send_busy = false;
            }
          } catch (error2) {
            logger?.error("群发发送失败:", error2);
            if (!res.headersSent) {
              res.status(500).json({ code: -1, message: "群发发送失败" });
            }
          }
        });
        base.post(wrapPath("/setDeepEntertainmentStatus"), async (req, res) => {
          try {
            let body = req.body;
            if (!body || Object.keys(body).length === 0) {
              try {
                const raw = await new Promise((resolve) => {
                  let data2 = "";
                  req.on("data", (chunk) => data2 += chunk);
                  req.on("end", () => resolve(data2));
                });
                if (raw) body = JSON.parse(raw);
              } catch (e) {
                logger?.error("解析请求体失败:", e);
                res.status(400).json({ code: -1, message: "解析请求体失败" });
                return;
              }
            }
            const { path: configPath2, key, status } = body || {};
            if (!configPath2 || key === undefined) {
              res.status(400).json({ code: -1, message: "缺少必要参数" });
              return;
            }
            const configDir = path.dirname(ctx.configPath);
            const deepEntertainmentPath = path.join(configDir, configPath2);
            const dir = path.dirname(deepEntertainmentPath);
            if (!fs.existsSync(dir)) {
              fs.mkdirSync(dir, { recursive: true });
            }
            let data = {};
            if (fs.existsSync(deepEntertainmentPath)) {
              try {
                const content = fs.readFileSync(deepEntertainmentPath, "utf-8");
                data = JSON.parse(content);
              } catch (e) {
                logger?.error("读取深度娱乐配置文件失败:", e);
                data = {};
              }
            }
            data[key] = status;
            fs.writeFileSync(deepEntertainmentPath, JSON.stringify(data, null, 2), "utf-8");
            res.json({ code: 0, message: "ok" });
          } catch (error2) {
            logger?.error("设置深度娱乐开关状态失败:", error2);
            res.status(500).json({ code: -1, message: `设置深度娱乐开关状态失败: ${error2.message}` });
          }
        });
        registerCardShopWebPostRoutes(base, wrapPath, cardShopWebDeps, logger);
        registerMailWebPostRoutes(base, wrapPath, mailWebDeps, logger);
        registerOfflineNotifyWebPostRoutes(base, wrapPath, offlineNotifyWebDeps, logger);
        registerEntertainmentSwitchWebPostRoutes(base, wrapPath, { readB, writeB }, logger);
        registerGlobalForbiddenWebPostRoutes(base, wrapPath, { readA, writeA, readB, writeB }, logger);
        registerConfigClipboardWebPostRoutes(base, wrapPath, configClipboardDeps, logger);
        registerShopPriceWebPostRoutes(base, wrapPath, logger);
        registerBgEditWebPostRoutes(base, wrapPath, logger);
        base.post(wrapPath("/data-edit/update"), async (req, res) => {
          try {
            let body = req.body;
            if (!body || Object.keys(body).length === 0) {
              try {
                const raw = await new Promise((resolve) => {
                  let data = "";
                  req.on("data", (chunk) => data += chunk);
                  req.on("end", () => resolve(data));
                });
                if (raw) body = JSON.parse(raw);
              } catch {
                body = {};
              }
            }
            const type = String(body?.type || "").trim();
            const userId = String(body?.user_id || "").trim();
            const action = String(body?.action || "").trim();
            const amountRaw = Number(body?.amount);
            const currentValueRaw = Number(body?.currentValue);
            const meta = getDataEditTypeMeta(type);
            if (!meta) {
              res.status(400).json({ code: -1, message: "invalid_type" });
              return;
            }
            if (!/^\d+$/.test(userId)) {
              res.status(400).json({ code: -1, message: "invalid_user_id" });
              return;
            }
            if (!["reset", "increase", "decrease", "custom"].includes(action)) {
              res.status(400).json({ code: -1, message: "invalid_action" });
              return;
            }
            const amount = Number.isFinite(amountRaw) ? Math.floor(amountRaw) : 0;
            const currentValue = Number.isFinite(currentValueRaw) ? Math.floor(currentValueRaw) : 0;
            if ((action === "increase" || action === "decrease" || action === "custom") && amount < 0) {
              res.status(400).json({ code: -1, message: "invalid_amount" });
              return;
            }
            const map = readDataEditMap(meta.file);
            const nowValueNum = Number(map[userId]);
            const nowValue = Number.isFinite(nowValueNum) ? Math.floor(nowValueNum) : 0;
            if (action !== "custom" && nowValue !== currentValue) {
              res.status(409).json({
                code: -2,
                message: "value_conflict",
                data: { latest: nowValue }
              });
              return;
            }
            let nextValue = nowValue;
            if (action === "reset") {
              nextValue = 0;
            } else if (action === "increase") {
              nextValue = nowValue + amount;
            } else if (action === "decrease") {
              nextValue = Math.max(0, nowValue - amount);
            } else if (action === "custom") {
              nextValue = Math.max(0, amount);
            }
            map[userId] = nextValue;
            writeDataEditMap(meta.file, map);
            res.json({
              code: 0,
              data: {
                type,
                user_id: userId,
                oldValue: nowValue,
                newValue: nextValue
              }
            });
          } catch (error2) {
            logger?.error("保存修改数据失败:", error2);
            res.status(500).json({ code: -1, message: "保存修改数据失败" });
          }
        });
      }
      if (base && base.get) {
        base.get(wrapPath("/announcement"), async (_req, res) => {
          try {
            const key = _req.query?.key || "";
            const localPack = loadMkbotLocalAnnouncementsForWebUI();
            let remoteItems = null;
            let remoteErrMsg = "";
            try {
              remoteItems = await fetchMkbotRemoteAnnouncementData(key);
            } catch (e) {
              remoteErrMsg = e?.message || String(e);
              logger?.error("获取远程公告失败:", remoteErrMsg);
            }
            const rc = countMkbotRemoteComparableAnnouncements(remoteItems || []);
            const lc = localPack.comparableCount;
            if (remoteErrMsg) {
              if (!localPack.items.length) {
                res.status(500).json({ code: -1, message: "获取公告失败: " + remoteErrMsg });
                return;
              }
              res.json({
                code: 0,
                data: localPack.items,
                meta: {
                  source: "local",
                  reason: "remote_failed",
                  hint: "网络公告不可用，已显示本机「默认资源/更新公告」"
                }
              });
              return;
            }
            if (lc >= rc + 1) {
              res.json({
                code: 0,
                data: localPack.items,
                meta: {
                  source: "local",
                  reason: "local_preferred",
                  hint: `本地版本类公告（${lc} 条）比网络（${rc} 条）至少多 1 条，已显示本机全部公告`,
                  localComparable: lc,
                  remoteComparable: rc
                }
              });
              return;
            }
            res.json({ code: 0, data: remoteItems || [], meta: { source: "remote" } });
          } catch (error2) {
            logger?.error("公告接口异常:", error2.message);
            res.status(500).json({ code: -1, message: "获取公告失败: " + error2.message });
          }
        });
        base.get(wrapPath("/sponsor"), async (_req, res) => {
          try {
            const raw = await fetchAPI("https://xn--mk-ub3cl61ae1v.xn--c5w857b.xn--fiqs8s/mkbot/赞助.json");
            if (!raw) {
              res.status(500).json({ code: -1, message: "获取赞助公告失败" });
              return;
            }
            const list = Array.isArray(raw) ? raw : [];
            res.json({ code: 0, data: list });
          } catch (error2) {
            logger?.error("赞助公告接口异常:", error2?.message || error2);
            res.status(500).json({ code: -1, message: "获取赞助公告失败: " + (error2?.message || error2) });
          }
        });
        base.get(wrapPath("/plugin-version"), async (_req, res) => {
          try {
            let current = "";
            try {
              current = mkReadPluginVersion(ctx);
            } catch (e) {
              logger?.warn?.("读取本地插件版本失败:", e?.message || e);
            }
            const remote = await fetchAPI("https://xn--mk-ub3cl61ae1v.xn--c5w857b.xn--fiqs8s/mkbot/config.json");
            const latest = remote?.version != null ? String(remote.version) : "";
            const downloadUrl = remote && (remote.downloadUrl || remote.download || remote.url) || "http://xn--mk-ub3cl61ae1v.xn--c5w857b.xn--fiqs8s/mkbot/kakake-plugin-mkbot.zip";
            const hasUpdate = Boolean(latest && current) && compareMkbotVersions(latest, current) > 0;
            res.json({
              code: 0,
              data: { current, latest, hasUpdate, downloadUrl }
            });
          } catch (error2) {
            logger?.error("获取插件版本失败:", error2?.message || error2);
            res.status(500).json({ code: -1, message: "获取插件版本失败: " + (error2?.message || error2) });
          }
        });
      }
      if (base && base.get) {
        base.get(wrapPath("/time-data"), (_req, res) => {
          try {
            const configDir = path.dirname(ctx.configPath);
            const timeDataPath = path.join(configDir, "变态.json");
            let timeData = { 群: [], QQ: [], 转发: "", 方式: "私聊" };
            if (fs.existsSync(timeDataPath)) {
              try {
                const content = fs.readFileSync(timeDataPath, "utf-8");
                timeData = JSON.parse(content);
              } catch (e) {
                logger?.error("解析时间数据失败:", e);
                timeData = { 群: [], QQ: [], 转发: "", 方式: "私聊" };
              }
            }
            res.json({ code: 0, data: timeData });
          } catch (error2) {
            logger?.error("获取时间数据失败:", error2);
            res.status(500).json({ code: -1, message: "获取时间数据失败" });
          }
        });
      }
      if (base && base.page) {
        base.page({
          path: "mkbot-dashboard",
          title: "MKbot插件",
          icon: PLUGIN_ICON_PATH,
          htmlFile: "webui/admin.html",
          description: "管理 MKbot 插件功能"
        });
        logger?.info("WebUI 页面已注册");
      }
      if (globalThis.__mkbot_broadcast_schedule_timer) {
        clearInterval(globalThis.__mkbot_broadcast_schedule_timer);
        globalThis.__mkbot_broadcast_schedule_timer = undefined;
      }
      globalThis.__mkbot_broadcast_schedule_timer = setInterval(() => {
        Promise.resolve(mkbotRunScheduledBroadcastTick(ctx)).catch(
          (err) => logger?.error("[定时JSON] tick:", err)
        );
      }, 1e3);
    }
    logger?.info("WebUI 路由已注册");
  } catch (e) {
    logger?.warn("注册 WebUI 路由失败:", e);
  }
};
const plugin_onmessage = async (ctx, event) => {
  await bindBotCtxWithProtocol(ctx);
  const 自触开关 = readB("config.json", "自触开关", false);
  let shouldHandle = false;
  if (event.post_type === "message") {
    shouldHandle = true;
  } else if (event.post_type === "message_sent") {
    if (自触开关 === true) {
      shouldHandle = true;
    }
  }
  if (shouldHandle) {
    const message = resolveEventPlainMessage(event);
    let reply = await handleMessage(message, event, ctx);
    if (reply) {
      if (reply.type === "delay") {
        for (const item of reply.messages) {
          if (item.delay > 0) {
            await new Promise((resolve) => setTimeout(resolve, item.delay));
          }
          await 发消息(event, [段_文本(item.text)]);
        }
      } else if (Array.isArray(reply)) {
        for (const msg of reply) {
          await 发消息(event, msg);
        }
      } else {
        await 发消息(event, [段_文本(String(reply))]);
      }
    }
  }
};
const plugin_onevent = async (ctx, event) => {
  await bindBotCtxWithProtocol(ctx);
  if (event.post_type === "notice" && event.notice_type === "bot_offline") {
    if (offlineNotifyDeps) {
      await handleOfflineNotifyBotOffline(event, offlineNotifyDeps);
    }
    return;
  }
  if (event.post_type === "notice") {
    await handleNotice(event, ctx);
  } else if (event.post_type === "request") {
    await handleRequest(event, ctx);
  }
};
function plugin_on_config_change(ctx, _, key, value) {
  const configPath = ctx.configPath;
  let config = {};
  if (fs.existsSync(configPath)) {
    try {
      config = JSON.parse(fs.readFileSync(configPath, "utf-8"));
    } catch (e) {
      config = {};
    }
  }
  if (key === "OwnerQQs") {
    const qqArray = value.split(/[,，、\s&|]+/).map((qq) => qq.trim()).filter((qq) => qq && /^\d+$/.test(qq));
    config.OwnerQQs = qqArray;
    logger?.info(`主人 QQ 已更新: ${qqArray.join(", ")}`);
  }
  if (key === "nowoner") {
    config.nowoner = value;
    logger?.info(`认主已${value ? "启用" : "禁用"}`);
  }
  if (key === "nowonernr") {
    config.nowonernr = value;
    logger?.info(`非主人回复已更新`);
  }
  if (key === "noauth") {
    config.noauth = value;
    logger?.info(`未授权回复已${value ? "启用" : "禁用"}`);
  }
  if (key === "noauthnr") {
    config.noauthnr = value;
    logger?.info(`未授权回复文案已更新`);
  }
  if (key === "自触开关") {
    config.自触开关 = value;
    logger?.info(`自触开关已${value ? "启用" : "禁用"}`);
  }
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2), "utf-8");
}
const plugin_cleanup = async (_ctx) => {
  globalThis.__mk_scheduler_armed = false;
  cleanupSpamFloodGuard();
  if (globalThis.__mk_scheduler_timer) {
    clearTimeout(globalThis.__mk_scheduler_timer);
    globalThis.__mk_scheduler_timer = undefined;
  }
  if (globalThis.__mkbot_broadcast_schedule_timer) {
    clearInterval(globalThis.__mkbot_broadcast_schedule_timer);
    globalThis.__mkbot_broadcast_schedule_timer = undefined;
  }
  globalThis.__mkbot_broadcast_send_busy = false;
  // 热重载后不得复用旧的「已通过」凭证缓存
  try {
    globalThis.__mkbot_fw_auth_cache?.clear?.();
    globalThis.__mkbot_fw_auth_cache = undefined;
    globalThis.__mkbot_fw_auth_not_required = undefined;
    globalThis.__mkbot_fw_noauth_warned = undefined;
  } catch (_e) {
  }
  try {
    disposeSharpWorker();
  } catch (_e) {
  }
  try {
    cancelSharpDependencyInstall(logger);
  } catch (e) {
    logger?.warn?.("[MKbot] 取消 Sharp 安装任务异常:", e?.message || e);
  }
  try {
    resetSharpModuleCache();
  } catch (_e) {
  }
  try {
    bindBotCtx(null);
  } catch (_e) {
  }
  logger?.info?.("[MKbot] 插件已清理（定时任务、群发调度、Sharp 安装、鉴权缓存已停止）");
  logger?.warn?.("[MKbot] 若仍无法删除插件目录，请先停用插件再重启宿主（Sharp 原生模块卸载前可能占用 node_modules）");
};


export {
  plugin_init,
  plugin_cleanup,
  plugin_onmessage,
  plugin_onevent,
  plugin_on_config_change,
  plugin_config_ui,
  readA,
  readB,
  writeA,
  writeB,
  deleteKey,
  hasKey,
  getKeys,
  clear,
  timeA,
  timeB,
  rand,
  moneyA,
  downloadFile,
  发合并消息,
  发消息,
  发语音,
  发视频,
  发卡片,
  发音乐卡片,
  giveAT,
  giveImages,
  giveImages_name,
  giveText,
  BOTAPI,
  checkAuthStatus,
  getAuthStatus,
  setAuthStatus,
  getDataPath,
  setDataPath,
  getSystemInfo,
  getProcessList,
  puppeteer,
  unzipFile,
  zipFile,
  qzonePublishDynamic,
  qzoneGetFeeds,
  qzoneLike,
  qzoneComment,
  qzoneReplyComment,
  guanjiaTestSend,
  captureGuanjiaTokenFromMessage,
  ensureGuanjiaToken,
};
