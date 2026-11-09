// ---------------------------------------------------------------------------
// 媒体下发方式：内联（base64）开关 + 协议端本地可读开关
//
// 【一】内联（base64）
// 默认关闭：本地文件按「本地路径」下发（file://），由协议端自己读盘上传。
//
// 为什么默认不内联：
//   内联会把整份文件塞进 WS 帧。60MB 视频 → 80MB JSON，实测会拖垮/撑断连接
//   （kakake 侧报「连接已断开 / 连接未连接」）。而本地路径只传几 KB 的字符串，
//   大文件由协议端直传 QQ 服务器 —— 8Mbps 下 60MB 约 140 秒，这才是正常量级。
//
// 什么时候需要开：
//   协议端读不到宿主机文件（SnowLuma 跑在容器里 → realpath 报 EACCES）时。
//   但内联只适合图片这类小文件；大文件应优先去解决容器挂载，而不是硬塞 WS。
//
// 更根本的解法（优先于开内联）：
//   把 kakake 的目录以**相同路径**挂进容器，例如
//   -v /root/kakake:/root/kakake
//   这样 file:// 路径在容器内依旧有效，协议端能直接读盘，消息体也只有几 KB。
//
//   mk 脚本 2.11.0 起内置了这件事，不用手敲 docker run：
//     mk → [3] SnowLuma → [20] 容器挂载目录 → [2] 添加（填 /root/kakake）
//     → [7] 修权限（补父目录 o+x）→ [6] 重建容器 → [8] 验证
//   挂好后把「协议端读本地文件」切回 true、「媒体内联上限」清空即可恢复原样。
//
// 【二】协议端能否读宿主本地文件（容器部署开关）
//   默认 true（非 docker / 已挂载目录）：本地路径可用，一切照旧。
//   SnowLuma 跑在容器里且**没挂 data 目录**时，协议端 realpath 宿主机路径会 EACCES，
//   节点里只要含本地媒体路径，整条合并转发会被拒（实测 retcode=100）。
//   置 false 后：渲染图片改走自包含的 base64:// 内联（超过「图片内联体积上限」
//   会先用 sharp 压成 JPEG），不再依赖共享文件系统；只有确实带不过去的大文件
//   才在下载前跳过并降级成链接。
//   另外，发送层捕获到这类确定性失败会自动调用 markProtocolLocalFileUnavailable()
//   把这里切成 false —— 即便用户没改配置，Docker 部署也能自愈，见本文件下方说明。
// ---------------------------------------------------------------------------

const DEFAULT_LIMIT_BYTES = 0;

let inlineLimitBytes = DEFAULT_LIMIT_BYTES;

/** 协议端是否能读宿主本地文件；false = 容器部署且未挂载 data 目录 */
let protocolReadsLocalFile = true;

// ---------------------------------------------------------------------------
// 运行时自愈：协议端读不到宿主文件（Docker / 容器未挂载 / WS 转发到另一台机器）
//
// 配置里的「协议端读本地文件」是人工开关，默认「能读」。Docker 部署时用户往往
// 不知道要改，于是插件把 sharp 渲染图落盘成 file:///root/kakake/... 下发，
// 协议端容器内没有该路径 → send_msg retcode=100。
// 发送层捕获到这类确定性失败后调用 markProtocolLocalFileUnavailable()：
// 之后所有图片不再落盘、一律改走自包含的 base64://（并自动压缩），
// 首条消息自动重试一次成功，后续消息直接走对的形式。无需改宿主框架。
// ---------------------------------------------------------------------------
let runtimeLocalFileUnavailable = false;
let runtimeLocalFileUnavailableReason = '';
let lastProtocolLocalReadRaw = '';

export function markProtocolLocalFileUnavailable(reason: unknown, logger?: MkLoggerLike): void {
  if (runtimeLocalFileUnavailable) return;
  runtimeLocalFileUnavailable = true;
  runtimeLocalFileUnavailableReason = String(reason ?? '').slice(0, 200);
  logger?.info?.(
    '[媒体] 检测到协议端读不到宿主本地文件（Docker/容器未挂载 data 目录）：' +
      '已自动切换为「图片 base64 内联」，不再使用 file:// 本地路径。' +
      (runtimeLocalFileUnavailableReason ? ` 原因: ${runtimeLocalFileUnavailableReason}` : ''),
  );
}

export function getProtocolLocalFileUnavailableReason(): string {
  return runtimeLocalFileUnavailableReason;
}

/** 供回归脚本 / 手动改回「能读」时复位 */
export function resetProtocolLocalFileUnavailable(): void {
  runtimeLocalFileUnavailable = false;
  runtimeLocalFileUnavailableReason = '';
}

// ---------------------------------------------------------------------------
// 单张内联图片的体积上限（解码后的字节数）
//
// 1.6MB PNG → 2.2MB base64；4MB PNG → 5.4MB base64，后者会被多数协议端的
// WS maxPayload（咔咔珂同款防护是 4MiB）拒掉，表现为「base64 也读不到」。
// 超过上限的静态图片在发送前由 sharp 自动压成 JPEG，把帧压回 1~2MB 内。
// 留空 / 非法 = 1200KB；可填 64~8192(KB)。
// ---------------------------------------------------------------------------
const DEFAULT_INLINE_IMAGE_MAX_BYTES = 1200 * 1024;
let inlineImageMaxBytes = DEFAULT_INLINE_IMAGE_MAX_BYTES;

export function configureInlineImageMaxBytes(valueKb: unknown, logger?: MkLoggerLike): void {
  const raw = String(valueKb ?? '').trim();
  if (!raw) {
    inlineImageMaxBytes = DEFAULT_INLINE_IMAGE_MAX_BYTES;
    return;
  }
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 64 || n > 8192) {
    inlineImageMaxBytes = DEFAULT_INLINE_IMAGE_MAX_BYTES;
    logger?.warn?.('[媒体] 图片内联体积上限无效（应为 64~8192 KB 或留空），已回退默认 1200KB:', raw);
    return;
  }
  const next = Math.floor(n) * 1024;
  if (next !== inlineImageMaxBytes) {
    logger?.info?.(`[媒体] 图片内联体积上限设为 ${Math.floor(n)}KB（超出自动压成 JPEG 再内联）`);
  }
  inlineImageMaxBytes = next;
}

export function getInlineImageMaxBytes(): number {
  return inlineImageMaxBytes;
}

// ---------------------------------------------------------------------------
// 大图内联策略：原图优先（默认），画质不打折
//
//   original-first  首发按原图字节发（file:// 或原样 base64://）；
//                   只有协议端明确拒绝（读不到宿主路径 / WS 帧过大）才压成 JPEG 重试。
//   compress-first  发送前就把超限大图压好（上一版行为，最省帧、最稳，但画质有损）。
//   never-compress  任何情况都不压缩，原图字节始终不变；发不出去就如实报错/降级。
//
// 注意：压缩只作用于「base64 内联」的图片。file:// 路径模式（非容器 / 已挂载目录）
// 永远由协议端直读原始文件，根本不经过编码器；未超「图片内联上限」的图也不压缩。
// ---------------------------------------------------------------------------
export type LargeImagePolicy = 'original-first' | 'compress-first' | 'never-compress';

let largeImagePolicy: LargeImagePolicy = 'original-first';

export function configureLargeImagePolicy(value: unknown, logger?: MkLoggerLike): void {
  const raw = String(value ?? '').trim().toLowerCase();
  let next: LargeImagePolicy = 'original-first';
  if (raw === '压缩优先' || raw === 'compress-first' || raw === 'compress' || raw === '压缩') {
    next = 'compress-first';
  } else if (
    raw === '不压缩' || raw === '原图直发' || raw === '原图直发不压缩' ||
    raw === 'never-compress' || raw === 'never' || raw === 'none' || raw === 'off' || raw === '关闭'
  ) {
    next = 'never-compress';
  } else if (
    raw && raw !== '原图优先' && raw !== 'original-first' && raw !== 'auto' && raw !== 'true' && raw !== '1'
  ) {
    logger?.warn?.('[媒体] 大图内联策略无效（原图优先/压缩优先/不压缩），已回退「原图优先」:', raw);
  }
  if (next !== largeImagePolicy) {
    logger?.info?.(`[媒体] 大图内联策略设为「${{ 'original-first': '原图优先', 'compress-first': '压缩优先', 'never-compress': '不压缩' }[next]}」`);
  }
  largeImagePolicy = next;
}

export function getLargeImagePolicy(): LargeImagePolicy {
  return largeImagePolicy;
}

/** 首发是否就压缩（只有「压缩优先」是） */
export function shouldCompressOnFirstSend(): boolean {
  return largeImagePolicy === 'compress-first';
}

/** 失败重试时是否允许压缩（「不压缩」禁止） */
export function canCompressOnRetry(): boolean {
  return largeImagePolicy !== 'never-compress';
}

/**
 * 内联图片（base64:// / data:）落盘目录。
 * 由启动处注入（与「临时视频」同级，协议端读得到）；空 = 不落盘，仍走 base64。
 */
let inlineMaterializeDir = '';
let inlineMaterializeLogger: MkLoggerLike | undefined;

export function configureInlineMaterializeDir(dir: unknown, logger?: MkLoggerLike): void {
  const d = String(dir ?? '').trim();
  inlineMaterializeDir = d || '';
  if (logger) inlineMaterializeLogger = logger;
}

export function getInlineMaterializeDir(): string {
  return inlineMaterializeDir;
}

export function getInlineMaterializeLogger(): MkLoggerLike | undefined {
  return inlineMaterializeLogger;
}

type MkLoggerLike = {
  info?: (msg: string, ...args: unknown[]) => void;
  warn?: (msg: string, ...args: unknown[]) => void;
};

/**
 * 配置媒体内联上限。
 * @param valueMb 单位 MB；0 / 空 / 非法 = 关闭内联（回到本地路径）
 */
export function configureMediaInlineLimit(valueMb: unknown, logger?: MkLoggerLike): void {
  const raw = String(valueMb ?? '').trim();
  if (!raw) {
    inlineLimitBytes = DEFAULT_LIMIT_BYTES;
    return;
  }
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) {
    inlineLimitBytes = DEFAULT_LIMIT_BYTES;
    return;
  }
  inlineLimitBytes = Math.max(1, Math.floor(n)) * 1024 * 1024;
  logger?.info?.(`[媒体] 本地文件内联上限设为 ${inlineLimitBytes / 1024 / 1024}MB（超过则按本地路径下发）`);
}

/** 内联上限（字节）；0 表示关闭 */
export function getMediaInlineLimitBytes(): number {
  return inlineLimitBytes;
}

/** 是否启用内联 */
export function isMediaInlineEnabled(): boolean {
  return inlineLimitBytes > 0;
}

/**
 * 配置「协议端能否读宿主本地文件」。
 * @param value true / "1" / "true" = 能读（默认，非容器或已挂载）；
 *              false / "0" / "false" = 读不到（容器部署且未挂载 data 目录）
 */
export function configureProtocolLocalRead(value: unknown, logger?: MkLoggerLike): void {
  const raw = String(value ?? '').trim().toLowerCase();
  const off = raw === '0' || raw === 'false' || raw === 'off' || raw === 'no' || raw === '读不到' || raw === '读不到（容器）';
  // 用户显式把开关切回「能读」时，清掉运行时自动判定（挂好目录后能恢复 file:// 直读）
  if (raw && raw !== lastProtocolLocalReadRaw && !off) {
    resetProtocolLocalFileUnavailable();
  }
  lastProtocolLocalReadRaw = raw;
  if (!raw) {
    protocolReadsLocalFile = true;
    return;
  }
  protocolReadsLocalFile = !off;
  if (!protocolReadsLocalFile) {
    logger?.info?.('[媒体] 协议端读不到宿主本地文件（容器部署）→ 图片改走 base64 内联并自动压缩，大文件仍按链接降级');
  }
}

/**
 * 协议端能否读宿主本地文件。
 * 运行时一旦捕获到「本地路径读不到」的确定性失败，这里立即变 false，
 * 图片落盘（file://）与本地路径下发会随之停用，无需用户手工改配置。
 */
export function canProtocolReadLocalFile(): boolean {
  return protocolReadsLocalFile && !runtimeLocalFileUnavailable;
}

/**
 * 下载前预判：这份文件下成本地后，到底能不能发出去。
 * 用来避免「先下一整段（60MB 约 140 秒）→ 才发现协议端读不到 → 整条合并转发被拒」。
 *
 * @param byteSize 远端体积（字节）；传 null 表示未知，按乐观处理
 */
export function shouldDownloadMediaForSend(byteSize: number | null | undefined): boolean {
  // 协议端读得到 → 本地路径就能发，照常下载
  if (canProtocolReadLocalFile()) return true;
  // 读不到 → 只能靠内联（base64）把字节带过去。
  // 图片会自动压到「图片内联体积上限」以内再内联，所以小图依然值得下；
  // 只有明显超过可内联体积的大文件（视频等）才提前停手，避免白跑一整段下载。
  const cap = Math.max(
    isMediaInlineEnabled() ? getMediaInlineLimitBytes() : 0,
    getInlineImageMaxBytes(),
  );
  if (byteSize == null || !Number.isFinite(byteSize)) return true;
  return byteSize <= cap;
}

/**
 * 内联上限是否会反过来**收窄**下载体积上限。
 *
 * 只有「协议端读不到宿主本地文件」时才是：那种情况下大文件下完也转不成 base64，
 * 发了必定失败，不如早停（60MB 白跑约 140 秒）。
 * 协议端看得到本地文件（非容器 / 已用 mk 挂载）时走的是本地路径，
 * 超过内联上限的文件照样能发，所以体积不该被内联上限卡住 ——
 * 否则会出现「配了挂载、又开着内联，70MB 视频反被判 tooLarge 降级成链接」。
 */
export function shouldClampDownloadToInlineLimit(): boolean {
  return isMediaInlineEnabled() && !canProtocolReadLocalFile();
}

/**
 * 启动自检：这两个开关是否还停在「容器没挂载」那个年代的降级状态。
 *
 * 背景：早期 SnowLuma 跑容器里读不到宿主文件，只能靠这两个开关绕。
 * 现在正解是挂载（mk [3] → [20]）。挂好之后如果开关没复位：
 *   · 协议端读本地文件 = false → 媒体全被降级成链接，能发但图片/视频没了
 *   · 媒体内联上限 > 0        → base64 白白把文件撑大 1/3 塞进 WS，零收益
 * 这里只在启动时提示一次，不自动改用户配置。
 *
 * @returns 提示文案数组（空数组=配置正常）
 */
export function auditMediaConfig(logger?: MkLoggerLike): string[] {
  const hints: string[] = [];
  if (runtimeLocalFileUnavailable) {
    hints.push(
      '[媒体] 运行时已自动判定「协议端读不到宿主本地文件」：图片改走 base64 内联（超上限自动压成 JPEG）。' +
        '若已用 mk（[3] SnowLuma → [20] 容器挂载目录）把 kakake 目录挂进容器，' +
        '请在「渲染设置 → 协议端读本地文件」切回「能读」以恢复 file:// 直读。',
    );
  }
  if (!protocolReadsLocalFile) {
    hints.push(
      '[媒体] 「协议端读本地文件」当前是「读不到（容器）」：渲染图片会改走 base64 内联（超上限自动压 JPEG），远端大文件会降级成链接。' +
        '若已用 mk（[3] SnowLuma → [20] 容器挂载目录）把 kakake 目录挂进容器，' +
        '请在「渲染设置 → 协议端读本地文件」切回「能读」，大文件才会恢复 file:// 直读。',
    );
    if (!isMediaInlineEnabled()) {
      hints.push(
        '[媒体] 且内联上限为 0：超过「图片内联体积上限」的远端媒体下载会被跳过（避免白跑），' +
          '只有大视频/大文件会降级成链接——渲染图片仍会正常以 base64 发出。',
      );
    }
  } else if (isMediaInlineEnabled()) {
    hints.push(
      `[媒体] 协议端已「能读」本地文件，但内联上限仍开着（${inlineLimitBytes / 1024 / 1024}MB）：` +
        '此时走本地路径更优（只传几 KB），内联只会把文件撑大 1/3 塞进 WS。' +
        '建议把「渲染设置 → 媒体内联上限」清空（=0）。',
    );
  }
  for (const h of hints) {
    logger?.info?.(h);
  }
  return hints;
}
