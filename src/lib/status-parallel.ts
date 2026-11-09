// ---------------------------------------------------------------------------
// 「运行状态」并行数据采集调度器
//
// 旧实现把数据源一个一个 await：
//   get_login_info → 系统快照 → 协议身份 → 日志统计 → 连接列表 → 渲染
// 每段独立耗时相加，实测 7~8 秒；其中连接列表还会逐个地址试，每个 1.5s 超时，
// 最坏光这一项就 4.5s。
//
// 这些数据源之间互不依赖（渲染才需要它们的结果），完全可以同时启动。
// 本模块提供统一的「并行启动 + 逐项兜底」调度器：
//   · 任一项失败只影响自己，回落 fallback，不拖垮整条命令；
//   · 总耗时 ≈ 最慢的一项，而不是所有项之和。
// ---------------------------------------------------------------------------

export interface MkParallelTask<T = unknown> {
  /** 结果键名 */
  key: string;
  /** 采集函数（同步值或 Promise 都行） */
  run: () => Promise<T> | T;
  /** 失败时的兜底值 */
  fallback: T;
  /** 失败回调：用于打日志，回调自身抛错也会被吞掉 */
  onError?: (key: string, error: unknown) => void;
}

/**
 * 并行执行全部任务，返回 key → 结果。
 * 单个任务抛错不会让 Promise.all 提前失败，其它任务照常完成。
 */
export async function runParallelSafe<T = unknown>(
  tasks: MkParallelTask<T>[],
  onError?: (key: string, error: unknown) => void,
): Promise<Record<string, T>> {
  const out: Record<string, T> = {};
  await Promise.all(
    tasks.map(async (task) => {
      try {
        out[task.key] = await task.run();
      } catch (error) {
        const report = task.onError ?? onError;
        try {
          report?.(task.key, error);
        } catch {
          /* 日志回调失败不影响结果 */
        }
        out[task.key] = task.fallback;
      }
    }),
  );
  return out;
}

/** 只按「最长耗时」计时的小工具：用于运行状态的分段耗时日志 */
export function mkElapsedSince(startMs: number): number {
  return Math.max(0, Date.now() - startMs);
}
