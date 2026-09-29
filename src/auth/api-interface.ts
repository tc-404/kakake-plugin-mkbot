// ---------------------------------------------------------------------------
// API 接口功能（从 mkbot-core 拆出）
// 含：视频/图片菜单、接口功能菜单、今日运势
// 由 mkbot-core 注入 readB/sendReply/renderHtmlWithCompat 等；Vite 与主入口打包为单文件 index.mjs。
// ---------------------------------------------------------------------------

import { 发视频, 发消息, 段_引用, 段_文本, 段_图片 } from '../BOT';
import type {
    ApiInterfaceDeps,
    ApiInterfaceHandleResult,
    AuthRcStatus,
    FortuneRenderCard,
    MkHtmlRenderOptions,
    MkMessageEvent,
    MkPluginContext,
    MkReadB,
    MkWriteB,
} from '../types';
import { getRenderMode, isImageRenderEnabled } from '../lib/image-render';
import { requireAuthorized } from '../lib/unauth-reply';
import { buildApiInterfaceMenuText } from '../lib/api-interface-menu';
import { renderApiInterfaceMenuWithSharp } from '../lib/api-interface-sharp-render';
import { renderFortuneWithSharp } from '../lib/fortune-sharp-render';

// ---------------------------------------------------------------------------
// 领域类型
// ---------------------------------------------------------------------------

type MediaUrlTable = Record<string, readonly string[]>;

interface FortuneSignEntry {
    Sorte?: string;
    Estrelas?: string;
    signText?: string;
    unSignText?: string;
}

interface FortuneUserDailyRecord {
    文本?: number;
    图片?: number;
}

interface FortuneUrlObject {
    url?: string;
    remote?: string;
    link?: string;
}

type FortuneUrlItem = string | FortuneUrlObject;

interface FortuneImageFields {
    图片: string;
    图片远程: string;
}

interface FortuneBgConfig {
    css: string;
    url: string;
    imageName: string;
    netUrl: string;
}

// ---------------------------------------------------------------------------
// 常量
// ---------------------------------------------------------------------------

const MEDIA_MENU_COLUMNS = 3;

const PROTOTYPE_POLLUTION_KEYS = new Set([
    'toString',
    'valueOf',
    'hasOwnProperty',
    'isPrototypeOf',
    'propertyIsEnumerable',
    'toLocaleString',
    'constructor',
    '__proto__',
    '__defineGetter__',
    '__defineSetter__',
    '__lookupGetter__',
    '__lookupSetter__',
]);

const IMAGE_DATA: MediaUrlTable = {
    腹肌: ['http://api.yujn.cn/api/fujiimg.php?'],
    黑丝: ['http://api.yujn.cn/api/heisi.php'],
    夕阳: ['http://api.yujn.cn/api/xiyang.php'],
    布布: ['http://api.yujn.cn/api/bubu.php?'],
    萌宠: ['http://api.yujn.cn/api/mc.php?'],
    JK图: ['https://api.suyanw.cn/api/jk.php'],
    COS图: ['http://api.yujn.cn/api/cos.php'],
    猫羽雫: ['https://api.suyanw.cn/api/mao.php'],
    动漫壁纸: [
        'http://api.yujn.cn/api/cos.php',
        'http://api.yujn.cn/api/pcbizi.php',
        'http://api.yujn.cn/api/ACG.php',
        'https://api.suyanw.cn/api/ys.php',
    ],
    朋友圈壁纸: ['https://api.suyanw.cn/api/pyqbj.php'],
    小姐姐图片: [
        'http://api.yujn.cn/api/ksxjj.php',
        'http://api.yujn.cn/api/xjjtp.php?',
        'http://api.yujn.cn/api/jk.php?',
    ],
};

const VIDEO_DATA: MediaUrlTable = {
    小姐姐: [
        'https://api.yujn.cn/api/zzxjj.php?type=video',
        'https://api.yujn.cn/api/xjj.php?type=video',
        'http://api.yujn.cn/api/juhexjj.php?type=video',
        'http://api.yujn.cn/api/ksxjjsp.php',
    ],
    鞠婧祎: ['http://api.yujn.cn/api/jjy.php?type=video'],
    章若楠: ['http://api.yujn.cn/api/zrn.php?type=video'],
    女大学生: ['https://api.yujn.cn/api/nvda.php?type=video'],
    双倍快乐: ['http://api.yujn.cn/api/sbkl.php?type=video'],
    你的欲梦: ['http://api.yujn.cn/api/ndym.php?type=video'],
    完美身材: ['http://api.yujn.cn/api/wmsc.php?type=video'],
    极品狱卒: ['http://api.yujn.cn/api/jpmt.php?type=video', 'http://api.yujn.cn/api/yuzu.php?type=video'],
    纯情女高: ['http://api.yujn.cn/api/nvgao.php?type=video'],
    帅哥视频: ['http://api.yujn.cn/api/xgg.php?type=video'],
    黑丝视频: ['http://api.yujn.cn/api/heisis.php?type=video'],
    白丝视频: ['http://api.yujn.cn/api/baisis.php?type=video'],
    漫展视频: ['https://api.yujn.cn/api/manzhan.php?type=video'],
    风景视频: ['http://api.yujn.cn/api/bianzhuang.php?'],
    穿搭系列: ['http://api.yujn.cn/api/chuanda.php?type=video'],
    舞蹈系列: ['http://api.yujn.cn/api/shwd.php?type=video', 'http://api.yujn.cn/api/rewu.php?type=video'],
    古风系列: ['http://api.yujn.cn/api/hanfu.php?type=video'],
    萌娃系列: ['http://api.yujn.cn/api/mengwa.php?type=video'],
    慢摇系列: ['http://api.yujn.cn/api/manyao.php?type=video'],
    吊带系列: ['http://api.yujn.cn/api/diaodai.php?type=video'],
    清纯系列: ['http://api.yujn.cn/api/qingchun.php?type=video'],
    COS系列: ['http://api.yujn.cn/api/COS.php?type=video'],
    变装系列: ['http://api.yujn.cn/api/ksbianzhuang.php?type=video', 'http://api.yujn.cn/api/bianzhuang.php?'],
};

// ---------------------------------------------------------------------------
// 工具函数
// ---------------------------------------------------------------------------

function isTruthyConfigFlag(value: unknown): boolean {
    return value === true || value === 'true' || value === '开启' || value === 1 || value === '1';
}

/** 与历史 config 读取一致：保留 `== false` 宽松判断 */
function isLegacyConfigFalse(value: unknown): boolean {
    return value == false;
}

function errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}

function userStorageKey(userId: number | undefined): string {
    return String(userId ?? '');
}

function parseJsonArray<T>(raw: string): T[] {
    try {
        const parsed: unknown = JSON.parse(raw);
        return Array.isArray(parsed) ? (parsed as T[]) : [];
    } catch {
        return [];
    }
}

function parseFortuneUserRecord(raw: unknown): FortuneUserDailyRecord {
    if (typeof raw === 'string') {
        try {
            const parsed: unknown = JSON.parse(raw);
            return typeof parsed === 'object' && parsed !== null ? (parsed as FortuneUserDailyRecord) : {};
        } catch {
            return {};
        }
    }
    if (typeof raw === 'object' && raw !== null) {
        return raw as FortuneUserDailyRecord;
    }
    return {};
}

function hasMediaKey(table: MediaUrlTable, key: string): boolean {
    return Object.prototype.hasOwnProperty.call(table, key);
}

function pickRandomUrl(urls: readonly string[]): string | undefined {
    if (urls.length === 0) {
        return undefined;
    }
    const index = Math.floor(Math.random() * urls.length);
    return urls[index];
}

function buildMediaMenuText(keys: readonly string[], columns: number): string {
    let menuText = '══════════════\n';
    for (let i = 0; i < keys.length; i += columns) {
        const row = keys.slice(i, i + columns);
        menuText += `${row.join(' - ')}\n`;
    }
    menuText += '══════════════';
    menuText += '\n发送：看xxxx    即可选择';
    return menuText;
}

function resolveFortuneImageFields(item: FortuneUrlItem | undefined): FortuneImageFields {
    let 图片 = '';
    let 图片远程 = '';

    if (typeof item === 'string') {
        const trimmed = item.trim();
        if (/^https?:\/\//i.test(trimmed)) {
            图片远程 = trimmed;
        } else {
            图片 = trimmed;
        }
    } else if (item && typeof item === 'object') {
        图片远程 = String(item.url ?? item.remote ?? item.link ?? '').trim();
    }

    return { 图片, 图片远程 };
}

function toFortuneRenderData(
    event: MkMessageEvent,
    bg: FortuneBgConfig,
    标题: string | undefined,
    星数: string | undefined,
    附言: string | undefined,
    细附: string | undefined
): FortuneRenderCard {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const dateStr = `${year}/${month}/${day}`;

    return {
        qq: String(event.user_id ?? ''),
        time: dateStr,
        Sorte: 标题 || '大吉',
        Estrelas: 星数 || '★★★★★★★',
        signText: 附言 || '福星高照，万事如意',
        unSignText: 细附 || '此签为大吉之兆',
        image_name: bg.imageName,
        backgroundImageCSS: bg.css,
        backgroundImageUrl: bg.url,
    };
}

function toFortuneUrlBgConfig(fortuneNetUrl: string): FortuneBgConfig {
    return {
        css: `url(${fortuneNetUrl})`,
        url: fortuneNetUrl,
        imageName: fortuneNetUrl,
        netUrl: fortuneNetUrl,
    };
}

function toFortuneLocalBgConfig(localFileName: string, bgFields: {
    backgroundImageCSS: string;
    backgroundImageUrl: string;
}): FortuneBgConfig {
    return {
        css: bgFields.backgroundImageCSS,
        url: bgFields.backgroundImageUrl,
        imageName: localFileName,
        netUrl: '',
    };
}

function toRenderedImageCq(imageData: string | null | undefined): string | null {
    if (!imageData) {
        return null;
    }
    return String(imageData).startsWith('base64://') ? String(imageData) : `base64://${imageData}`;
}

async function sendRenderedFortuneImage(
    event: MkMessageEvent,
    imageData: string | null | undefined
): Promise<void> {
    const imageUrl = toRenderedImageCq(imageData);
    if (!imageUrl) {
        return;
    }
    await 发消息(event, [段_引用(event.message_id), 段_图片(imageUrl)]);
}

// ---------------------------------------------------------------------------
// 子处理器
// ---------------------------------------------------------------------------

async function handleMediaMenuCommands(
    message: string,
    event: MkMessageEvent,
    ctx: MkPluginContext,
    d: ApiInterfaceDeps
): Promise<ApiInterfaceHandleResult> {
    const { logger } = d;

    if (message === '视频菜单') {
        const keys = Object.keys(VIDEO_DATA);
        const menuText = buildMediaMenuText(keys, MEDIA_MENU_COLUMNS);
        await 发消息(event, [段_引用(event.message_id), 段_文本(menuText)]);
        return 'halt';
    }

    if (message === '图片菜单') {
        const keys = Object.keys(IMAGE_DATA);
        const menuText = buildMediaMenuText(keys, MEDIA_MENU_COLUMNS);
        await 发消息(event, [段_引用(event.message_id), 段_文本(menuText)]);
        return 'halt';
    }

    const watchMatch = message.match(/^看(.*)$/);
    if (!watchMatch) {
        return 'pass';
    }

    const target = watchMatch[1];
    if (!target || PROTOTYPE_POLLUTION_KEYS.has(String(target))) {
        return 'pass';
    }

    if (hasMediaKey(VIDEO_DATA, target)) {
        const urls = VIDEO_DATA[target];
        const videoUrl = pickRandomUrl(urls);
        if (videoUrl) {
            const 封面 = `https://q4.qlogo.cn/g?b=qq&nk=${event.self_id}&s=5`;
            await 发视频(event, 封面, videoUrl, target);
        } else {
            logger.error(`视频:${target}，数量为空`);
        }
    }

    if (hasMediaKey(IMAGE_DATA, target)) {
        const urls = IMAGE_DATA[target];
        const imageUrl = pickRandomUrl(urls);
        if (imageUrl) {
            await 发消息(event, [段_引用(event.message_id), 段_图片(imageUrl)]);
        } else {
            logger.error(`图片:${target}，数量为空`);
        }
    }

    return 'pass';
}

async function handleApiFeatureMenu(
    event: MkMessageEvent,
    ctx: MkPluginContext,
    d: ApiInterfaceDeps,
): Promise<ApiInterfaceHandleResult> {
    const { readB, logger, getDataPath, resolveDefaultResourceImageAbs, resolveEffectiveBgAbs } = d;
    const 图片渲染开 = isImageRenderEnabled(readB);
    const useSharp = 图片渲染开 && getRenderMode(readB) === 'sharp';

    if (useSharp) {
        const imageData = await renderApiInterfaceMenuWithSharp(
            {
                // 竖向排列：使用 shu.jpg 并降低宽度触发 cols=1
                width: 720,
                pluginDir: String(ctx?.pluginPath || ''),
                dataPath: getDataPath(),
                bgLocalPath: resolveEffectiveBgAbs?.('api-menu') || resolveDefaultResourceImageAbs('shu.jpg') || '',
            },
            logger,
        );
        if (imageData) {
            await sendRenderedFortuneImage(event, imageData);
            return 'halt';
        }
        logger.warn('[API功能] 接口功能菜单 Sharp 渲染失败，已回退文本输出');
    }

    await 发消息(event, [段_引用(event.message_id), 段_文本(buildApiInterfaceMenuText())]);
    return 'halt';
}

async function sendFortuneTextReply(
    event: MkMessageEvent,
    标题: string | undefined,
    星数: string | undefined,
    附言: string | undefined,
    细附: string | undefined
): Promise<void> {
    let 组装消息 = '✦•┈┈┈┈┈┈┈┈┈┈┈•✦';
    组装消息 += '\n🜲 今日运势 🜲';
    组装消息 += '\n✦•┈┈┈┈┈┈┈┈┈┈┈•✦';
    组装消息 += `\n[运势]:${标题}`;
    组装消息 += `\n[星级]:${星数}`;
    组装消息 += `\n[签文]:${附言}`;
    组装消息 += `\n[解签]:${细附}`;
    组装消息 += '\n✦•┈┈┈┈┈┈┈┈┈┈┈•✦';
    await 发消息(event, [段_引用(event.message_id), 段_文本(组装消息)]);
}

async function renderFortuneImageCard(
    event: MkMessageEvent,
    ctx: MkPluginContext,
    d: ApiInterfaceDeps,
    renderData: FortuneRenderCard
): Promise<string | null | undefined> {
    const { readA, readB, renderHtmlWithCompat, puppeteer, buildSimpleFortuneHtml, logger, getDataPath } = d;
    const renderOptions: MkHtmlRenderOptions = {
        data: renderData as Record<string, unknown>,
        width: 720,
        height: 1280,
        waitForSelector: 'body[data-render-ready="1"]',
        pageGotoTimeoutMs: 15000,
        waitForTimeout: 300,
    };

    if (getRenderMode(readB) === 'sharp') {
        const sharpImage = await renderFortuneWithSharp(
            {
                card: renderData,
                pluginDir: String(ctx?.pluginPath || ''),
                dataPath: getDataPath(),
                width: 720,
                height: 1280,
            },
            logger,
        );
        if (sharpImage) return sharpImage;
        logger.warn('[Function] 今日运势 Sharp 渲染失败，已回退 HTML 渲染');
    }

    const htmlContent = readA('默认资源/今日运势.html');
    let finalImageData = await renderHtmlWithCompat(htmlContent, renderOptions);
    if (!finalImageData) {
        const simpleHtml = buildSimpleFortuneHtml(renderData);
        finalImageData = await puppeteer(simpleHtml, {
            data: {},
            width: 720,
            height: 1280,
            waitForSelector: 'body[data-render-ready="1"]',
            pageGotoTimeoutMs: 15000,
            waitForTimeout: 300,
        });
        if (finalImageData) {
            logger.warn('[Function] 今日运势主模板渲染失败，已切换极简模板输出');
        }
    }
    return finalImageData;
}

async function handleFortuneRenderFailure(
    event: MkMessageEvent,
    ctx: MkPluginContext,
    d: ApiInterfaceDeps,
    fortuneNetUrl: string,
    skipRawFallback: unknown
): Promise<void> {
    const { resolveImageForCq, logger } = d;
    const fallbackImage = resolveImageForCq(fortuneNetUrl);

    if (isTruthyConfigFlag(skipRawFallback)) {
        logger.warn(
            '[Function] 今日运势：签文卡片渲染失败，且已开启 config「今日运势失败不发原图」，未发送背景图'
        );
        await 发消息(event, [段_引用(event.message_id), 段_文本('运势卡片合成失败（HTML 渲染未成功）。请检查 puppeteer 渲染插件与 默认资源/今日运势.html；或在 config.json 将「今日运势失败不发原图」设为 false 以在失败时仅发送背景网络图。')]);
        return;
    }

    if (fallbackImage) {
        logger.warn('[Function] 今日运势：签文卡片 HTML 渲染失败，已降级仅发送背景网络图（未叠加签文）');
        await 发消息(event, [
            段_引用(event.message_id),
            段_文本('⚠️运势卡片合成失败，已改为仅发送背景图（网络地址，未叠加签文）。'),
            段_图片(fallbackImage),
        ]);
        return;
    }

    await 发消息(event, [段_引用(event.message_id), 段_文本('渲染失败，请检查 Puppeteer 服务是否运行')]);
}

async function handleFortuneRenderError(
    event: MkMessageEvent,
    ctx: MkPluginContext,
    d: ApiInterfaceDeps,
    fortuneNetUrl: string,
    error: unknown
): Promise<void> {
    const { readB, resolveImageForCq, logger } = d;
    logger.error('[测试图片] 错误:', error);

    const skipRawFallback = readB('config.json', '今日运势失败不发原图', false);
    const fallbackImage = fortuneNetUrl ? resolveImageForCq(fortuneNetUrl) : '';
    const message = errorMessage(error);

    if (isTruthyConfigFlag(skipRawFallback)) {
        await 发消息(event, [段_引用(event.message_id), 段_文本(`运势卡片异常：${message}\n已按配置不发送背景图。`)]);
        return;
    }

    if (fallbackImage) {
        logger.warn('[Function] 今日运势：渲染异常，已降级仅发送背景网络图');
        await 发消息(event, [
            段_引用(event.message_id),
            段_文本(`⚠️运势处理异常（${message}），已改为仅发送背景网络图。`),
            段_图片(fallbackImage),
        ]);
        return;
    }

    await 发消息(event, [段_引用(event.message_id), 段_文本(`测试图片出错: ${message}`)]);
}

async function loadFortuneSelection(
    readB: MkReadB,
    writeB: MkWriteB,
    readA: ApiInterfaceDeps['readA'],
    rand: ApiInterfaceDeps['rand'],
    event: MkMessageEvent,
    今天: string
): Promise<{
    序号: number;
    图片序号: number;
    数据: FortuneSignEntry[];
    图片数据: FortuneUrlItem[];
}> {
    const 今日我的 = parseFortuneUserRecord(
        readB(`筱筱吖/娱乐系统/今日运势/${今天}.json`, userStorageKey(event.user_id), '{}')
    );
    const 数据 = parseJsonArray<FortuneSignEntry>(readA('默认资源/text/运势.json') || '[]');
    const 图片数据 = parseJsonArray<FortuneUrlItem>(readA('默认资源/text/URL.json') || '[]');
    const 数据_count = 数据.length;
    const 图片数据_count = 图片数据.length;

    let 序号 = 0;
    let 图片序号 = 0;

    if (!今日我的 || Object.keys(今日我的).length === 0) {
        序号 = rand(0, Math.max(0, 数据_count - 1));
        图片序号 = rand(0, Math.max(0, 图片数据_count - 1));
        const json数据: FortuneUserDailyRecord = { 文本: 序号, 图片: 图片序号 };
        writeB(
            `筱筱吖/娱乐系统/今日运势/${今天}.json`,
            userStorageKey(event.user_id),
            JSON.stringify(json数据)
        );
    } else {
        序号 = Number(今日我的.文本 ?? 0);
        图片序号 = Number(今日我的.图片 ?? 0);
    }

    return { 序号, 图片序号, 数据, 图片数据 };
}

async function handleFortuneCommands(
    event: MkMessageEvent,
    ctx: MkPluginContext,
    d: ApiInterfaceDeps
): Promise<ApiInterfaceHandleResult> {
    const {
        readB,
        readA,
        writeB,
        timeA,
        rand,
        resolveFortuneNetworkBgUrl,
        buildBgImageCss,
        buildHtmlBackgroundFields,
        isKakakeLikeFramework,
        resolveFortuneLocalImageFileName,
        logger,
        resolveEffectiveBgAbs,
    } = d;

    const 今天 = timeA('y-m-d', Math.floor(Date.now() / 1000));
    const { 序号, 图片序号, 数据, 图片数据 } = await loadFortuneSelection(
        readB,
        writeB,
        readA,
        rand,
        event,
        今天
    );

    const entry = 数据[序号];
    const 标题 = entry?.Sorte;
    const 星数 = entry?.Estrelas;
    const 附言 = entry?.signText;
    const 细附 = entry?.unSignText;
    const { 图片, 图片远程 } = resolveFortuneImageFields(图片数据[图片序号]);

    const 图片渲染开 = isImageRenderEnabled(readB);
    if (!图片渲染开) {
        await sendFortuneTextReply(event, 标题, 星数, 附言, 细附);
        return 'halt';
    }

    const fortuneSkipRawFallback = readB('config.json', '今日运势失败不发原图', false);
    const useLocalFortune = isKakakeLikeFramework(ctx) && 图片渲染开;

    const tryRenderFortuneCard = async (bg: FortuneBgConfig): Promise<boolean> => {
        const renderData = toFortuneRenderData(event, bg, 标题, 星数, 附言, 细附);
        const finalImageData = await renderFortuneImageCard(event, ctx, d, renderData);
        if (!finalImageData) {
            return false;
        }
        await sendRenderedFortuneImage(event, finalImageData);
        return true;
    };

    if (useLocalFortune) {
        const localFileName = resolveFortuneLocalImageFileName(图片序号);
        const fortuneIndex = Math.max(1, Math.min(17, (Number(图片序号) || 0) + 1));
        const effectiveAbs = resolveEffectiveBgAbs?.(`fortune-${fortuneIndex}`) || '';
        const bgFields = buildHtmlBackgroundFields(effectiveAbs || localFileName);
        if (bgFields.backgroundImageUrl) {
            try {
                if (await tryRenderFortuneCard(toFortuneLocalBgConfig(effectiveAbs || localFileName, bgFields))) {
                    return 'halt';
                }
                logger.warn('[Function] 今日运势本地模式渲染失败，已回退 URL 模式');
            } catch (error) {
                logger.warn('[Function] 今日运势本地模式异常，已回退 URL 模式:', error);
            }
        } else {
            logger.warn(`[Function] 今日运势本地图片 ${localFileName} 不可用，已回退 URL 模式`);
        }
    }

    let fortuneNetUrl = '';
    try {
        fortuneNetUrl = resolveFortuneNetworkBgUrl(图片, 图片远程);
        if (!fortuneNetUrl) {
            await 发消息(event, [段_引用(event.message_id), 段_文本('今日运势图片模式需要可用的 https 图片地址。\n请将「默认资源/text/URL.json」配置为仅含 https 链接的 JSON 数组（每项一条链接）；若使用对象格式则仅读取其中的 url/remote/link 字段。')]);
            return 'halt';
        }

        if (await tryRenderFortuneCard(toFortuneUrlBgConfig(fortuneNetUrl))) {
            return 'halt';
        }
        await handleFortuneRenderFailure(event, ctx, d, fortuneNetUrl, fortuneSkipRawFallback);
    } catch (error) {
        await handleFortuneRenderError(event, ctx, d, fortuneNetUrl, error);
    }

    return 'halt';
}

// ---------------------------------------------------------------------------
// 指令路由（返回 false=未匹配；halt=终止 handleMessage；pass=看xxx 已处理但继续后续指令）
// ---------------------------------------------------------------------------

function isMediaMenuMessage(message: string): boolean {
    return message === '视频菜单' || message === '图片菜单' || /^看(.*)$/.test(message);
}

function isApiMenuMessage(message: string): boolean {
    return message === '接口功能' || message === 'API接口' || message === '扩展功能';
}

export async function handleApiInterfaceCommands(
    message: string,
    event: MkMessageEvent,
    ctx: MkPluginContext,
    RC_sq: AuthRcStatus,
    娱乐_开关: unknown,
    d: ApiInterfaceDeps
): Promise<ApiInterfaceHandleResult> {
    const isMediaMenu = isMediaMenuMessage(message);
    const isApiMenu = isApiMenuMessage(message);
    const isFortune = message === '今日运势';

    if (!isMediaMenu && !isApiMenu && !isFortune) {
        return false;
    }

    if (isMediaMenu) {
        if (!(await requireAuthorized(RC_sq, event, d.readB))) {
            return 'halt';
        }

        try {
            return await handleMediaMenuCommands(message, event, ctx, d);
        } catch (error) {
            d.logger.error('[API功能] 视频/图片菜单功能异常:', error);
            await 发消息(event, [段_引用(event.message_id), 段_文本('视频/图片接口处理异常，请稍后再试')]);
            return 'halt';
        }
    }

    if (isApiMenu) {
        if (!(await requireAuthorized(RC_sq, event, d.readB))) {
            return 'halt';
        }
        return handleApiFeatureMenu(event, ctx, d);
    }

    if (isFortune && 娱乐_开关) {
        if (!(await requireAuthorized(RC_sq, event, d.readB))) {
            return 'halt';
        }
        return handleFortuneCommands(event, ctx, d);
    }

    return false;
}
