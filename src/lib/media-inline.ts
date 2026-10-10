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
//   此时必须置为 false：媒体不再走本地路径，改放 URL；**并且下载前就跳过**
//   —— 否则会白跑一整段下载（60MB 约 140 秒）再失败，耗时翻倍还发不出去。
// ---------------------------------------------------------------------------

const DEFAULT_LIMIT_BYTES = 0;

let inlineLimitBytes = DEFAULT_LIMIT_BYTES;

/** 协议端是否能读宿主本地文件；false = 容器部署且未挂载 data 目录 */
let protocolReadsLocalFile = true;

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
  if (!raw) {
    protocolReadsLocalFile = true;
    return;
  }
  const off = raw === '0' || raw === 'false' || raw === 'off' || raw === 'no';
  protocolReadsLocalFile = !off;
  if (!protocolReadsLocalFile) {
    logger?.info?.('[媒体] 协议端读不到宿主本地文件（容器部署）→ 媒体改放 URL，且跳过本地下载');
  }
}

/** 协议端能否读宿主本地文件 */
export function canProtocolReadLocalFile(): boolean {
  return protocolReadsLocalFile;
}

/**
 * 下载前预判：这份文件下成本地后，到底能不能发出去。
 * 用来避免「先下一整段（60MB 约 140 秒）→ 才发现协议端读不到 → 整条合并转发被拒」。
 *
 * @param byteSize 远端体积（字节）；传 null 表示未知，按乐观处理
 */
export function shouldDownloadMediaForSend(byteSize: number | null | undefined): boolean {
  // 协议端读得到 → 本地路径就能发，照常下载
  if (protocolReadsLocalFile) return true;
  // 读不到 → 只能靠内联（base64）把字节带过去；没开内联或超上限就别下
  if (!isMediaInlineEnabled()) return false;
  if (byteSize == null || !Number.isFinite(byteSize)) return true;
  return byteSize <= getMediaInlineLimitBytes();
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
  if (!protocolReadsLocalFile) {
    hints.push(
      '[媒体] 「协议端读本地文件」当前是「读不到（容器）」：媒体会全部降级成链接。' +
        '若已用 mk（[3] SnowLuma → [20] 容器挂载目录）把 kakake 目录挂进容器，' +
        '请在「渲染设置 → 协议端读本地文件」切回「能读」，图片/视频才会正常发出。',
    );
    if (!isMediaInlineEnabled()) {
      hints.push(
        '[媒体] 且内联上限为 0：此组合下媒体下载会被直接跳过（避免白跑），' +
          '所以图片/视频只会以链接形式出现——这是预期行为，不是故障。',
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
