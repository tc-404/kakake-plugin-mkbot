/**
 * 视频解析的媒体抓取调度。
 *
 * 背景（2026-10-01 实测日志）：
 *   一次解析要下封面 + 图集 + 视频 + 音频，旧实现是「for 循环里逐个 await」，
 *   总耗时 = 各文件耗时之和。实测 23:03 那次 = 4209 + 21799 + 11274 = 37.3s。
 *   这些下载彼此无依赖，完全可以并行 —— 并发后总耗时 ≈ 最慢的那一个（21.8s）。
 *
 *   注意：Node 的 fetch 本身就是异步 I/O，串行 await 并不会阻塞主线程
 *   （机器人照样收发别的消息），只是让"这条解析任务"等得更久。
 *   所以这里不需要 worker_threads，只要别把 Promise 排成一条队即可。
 */

/** 默认并发下载数；留空/非法时用它 */
const DEFAULT_CONCURRENCY = 3;
/** 并发上限：再高容易触发源站 429，且对单条解析已无收益 */
const MAX_CONCURRENCY = 8;

let concurrency: number = DEFAULT_CONCURRENCY;

/** 归一化并发数：非法/越界回落默认值，1~8 */
export function normalizeMediaFetchConcurrency(value: unknown): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return DEFAULT_CONCURRENCY;
  const i = Math.floor(n);
  if (i < 1) return DEFAULT_CONCURRENCY;
  return Math.min(MAX_CONCURRENCY, i);
}

/** 配置并发下载数（与后台「并发下载数」联动） */
export function configureMediaFetchConcurrency(value: unknown, logger?: any): number {
  const raw = String(value ?? '').trim();
  concurrency = raw === '' ? DEFAULT_CONCURRENCY : normalizeMediaFetchConcurrency(raw);
  logger?.info?.(`[媒体] 并发下载数设为 ${concurrency}`);
  return concurrency;
}

/** 当前并发下载数 */
export function getMediaFetchConcurrency(): number {
  return concurrency;
}

/** 测试用：恢复默认 */
export function resetMediaFetchConcurrency(): void {
  concurrency = DEFAULT_CONCURRENCY;
}

/**
 * 带并发上限的 map。
 *
 * 与 Promise.all(items.map(fn)) 的区别：**任务是被调度时才启动的**，
 * 不是一次性把所有 Promise 都创建出来（那样就等于无限并发了）。
 *
 * 结果数组的顺序与输入严格一致；单个任务抛错不会拖垮其它任务，
 * 失败位置回填 null，由调用方决定降级策略（视频解析里就是「该节点放 URL 文本」）。
 */
export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number | undefined,
  mapper: (item: T, index: number) => Promise<R>,
): Promise<(R | null)[]> {
  const list = Array.isArray(items) ? items : [];
  const results: (R | null)[] = new Array(list.length).fill(null);
  if (!list.length) return results;

  const n = Math.max(1, Math.min(normalizeMediaFetchConcurrency(limit), list.length));
  let cursor = 0;
  const workers: Promise<void>[] = [];

  for (let w = 0; w < n; w++) {
    workers.push(
      (async () => {
        for (;;) {
          const index = cursor++;
          if (index >= list.length) return;
          try {
            results[index] = await mapper(list[index], index);
          } catch {
            // 单个下载失败不该让整批解析挂掉：保持 null，交给上层降级
            results[index] = null;
          }
        }
      })(),
    );
  }

  await Promise.all(workers);
  return results;
}

/**
 * 按当前配置的并发数跑一批 thunk。
 *
 * 传 thunk（() => Promise）而不是 Promise，是为了让调度器决定何时真正启动下载。
 */
export async function runThunksWithConcurrency<R>(
  thunks: readonly (() => Promise<R>)[],
  limit?: number,
): Promise<(R | null)[]> {
  return mapWithConcurrency(thunks, limit ?? getMediaFetchConcurrency(), (t) => t());
}
