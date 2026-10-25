// ---------------------------------------------------------------------------
// 下载超时：空闲超时 + 整体上限
//
// 旧实现只有一个「从发起请求起算、且收数据期间不重置」的整体 timer，
// 于是「文件大 / CDN 慢但一直在下」会被误判成超时（日志：`下载超时: 120000ms`）。
//
// 现在分两层：
//   · 空闲超时 stall —— 每收到一批数据就重置，只有连接真卡住才 abort
//   · 整体上限 total —— 从发起请求起算，防止极慢的下载无限拖下去；0 = 不设
//
// 单靠空闲超时不够：慢到 1KB/s 的下载不会卡死，但永远下不完，所以整体上限必须保留。
// 真正让大文件下得完的是上层的「超时也重试 + Range 续传」，这两层只是让每次尝试
// 的失败判定更准（卡死快速放弃，慢速尽量多拿字节）。
// ---------------------------------------------------------------------------

export interface DownloadTimeoutOptions {
  /** 空闲超时（毫秒）：连续这么久没收到任何字节就 abort；0 = 不设 */
  stallMs?: number;
  /** 整体上限（毫秒）：从创建起算；0 = 不设 */
  totalMs?: number;
}

export interface DownloadTimeoutHandle {
  signal: AbortSignal;
  /** 收到一批数据就调一次，给空闲计时续命 */
  reset: () => void;
  dispose: () => void;
}

export function createDownloadTimeout(options: DownloadTimeoutOptions = {}): DownloadTimeoutHandle {
  const stallMs = Number(options?.stallMs) > 0 ? Number(options.stallMs) : 0;
  const totalMs = Number(options?.totalMs) > 0 ? Number(options.totalMs) : 0;

  const controller = new AbortController();
  let stallTimer: ReturnType<typeof setTimeout> | null = null;
  let totalTimer: ReturnType<typeof setTimeout> | null = null;
  let disposed = false;

  const arm = () => {
    if (disposed || stallMs <= 0) return;
    if (stallTimer) clearTimeout(stallTimer);
    stallTimer = setTimeout(() => controller.abort(), stallMs);
  };

  arm();
  if (totalMs > 0) {
    totalTimer = setTimeout(() => controller.abort(), totalMs);
  }

  return {
    signal: controller.signal,
    /** 收到一批数据就调一次，给空闲计时续命 */
    reset: arm,
    dispose() {
      disposed = true;
      if (stallTimer) clearTimeout(stallTimer);
      if (totalTimer) clearTimeout(totalTimer);
      stallTimer = null;
      totalTimer = null;
    },
  };
}

/** base64 字符串长度上限：ws 默认 maxPayload 100MB，留 10MB 余量给帧头与其它段 */
export const MK_MEDIA_BASE64_LIMIT = 90 * 1024 * 1024;
/** 反推能内联的最大原始字节数（约 67.5MB）——媒体出口与下载预判共用同一口径 */
export const MK_MEDIA_INLINE_MAX_BYTES = maxInlineBytesForBase64Limit(MK_MEDIA_BASE64_LIMIT);

/** 由原始字节数估算 base64 后的字符串长度（不真的编码，用于提前判断是否超限） */
export function estimateBase64Length(bytes: number): number {
  return Math.ceil(Number(bytes) / 3) * 4;
}

/** 给定 base64 字符串长度上限，反推能内联的最大原始字节数 */
export function maxInlineBytesForBase64Limit(base64Limit: number): number {
  return Math.floor(Number(base64Limit) / 4) * 3;
}
