// @ts-nocheck
// ---------------------------------------------------------------------------
// 上传节点择优 WebUI API
// ---------------------------------------------------------------------------

import {
  mkNetOptApply,
  mkNetOptRollback,
  mkNetOptScan,
  mkNetOptSetEnabled,
  mkNetOptStatus,
} from '../lib/net-optimize';

type PostReq = {
  body?: unknown;
  readableEnded?: boolean;
  complete?: boolean;
  on?: (ev: string, fn: (...args: unknown[]) => void) => void;
};

async function parsePostBody(req: PostReq) {
  let body = req.body;
  const isEmptyObject = !body
    || (typeof body === 'object' && !Array.isArray(body) && Object.keys(body).length === 0);
  const streamUsable = typeof req.on === 'function'
    && req.readableEnded !== true
    && req.complete !== true;
  if (isEmptyObject && streamUsable) {
    try {
      const raw = await new Promise<string>((resolve) => {
        let data = '';
        const guard = setTimeout(() => resolve(data), 3000);
        req.on?.('data', (chunk: Buffer | string) => { data += chunk; });
        req.on?.('end', () => { clearTimeout(guard); resolve(data); });
        req.on?.('error', () => { clearTimeout(guard); resolve(''); });
      });
      if (raw) body = JSON.parse(raw);
    } catch {
      body = {};
    }
  }
  return body && typeof body === 'object' && !Array.isArray(body) ? body as Record<string, unknown> : {};
}

export function registerNetOptimizeWebGetRoutes(
  base: { get: (path: string, handler: (...args: unknown[]) => unknown) => void },
  wrapPath: (p: string) => string,
  deps: { readB?: unknown; writeB?: unknown },
  logger?: { error?: (...args: unknown[]) => void },
) {
  base.get(wrapPath('/net-optimize/status'), async (_req, res) => {
    try {
      res.json({ code: 0, data: await mkNetOptStatus(deps) });
    } catch (error) {
      logger?.error?.('获取网络择优状态失败:', error);
      res.status(500).json({ code: -1, message: '获取网络择优状态失败' });
    }
  });
}

export function registerNetOptimizeWebPostRoutes(
  base: { post: (path: string, handler: (...args: unknown[]) => unknown) => void },
  wrapPath: (p: string) => string,
  deps: { readB?: unknown; writeB?: unknown },
  logger?: {
    error?: (...args: unknown[]) => void;
    warn?: (...args: unknown[]) => void;
    info?: (...args: unknown[]) => void;
  },
) {
  // 体检：只探测不改系统，返回每个节点的延迟/丢包与判定
  base.post(wrapPath('/net-optimize/scan'), async (_req, res) => {
    try {
      const peers = await mkNetOptScan(deps);
      res.json({ code: 0, data: { peers, scannedAt: Date.now() } });
    } catch (error) {
      logger?.error?.('网络体检失败:', error);
      res.status(500).json({ code: -1, message: '网络体检失败' });
    }
  });

  base.post(wrapPath('/net-optimize/toggle'), async (req, res) => {
    try {
      const body = await parsePostBody(req);
      const enabled = String(body.enabled ?? '') === '开启' || body.enabled === true;
      mkNetOptSetEnabled(deps, enabled);
      res.json({ code: 0, data: await mkNetOptStatus(deps) });
    } catch (error) {
      logger?.error?.('切换网络择优开关失败:', error);
      res.status(500).json({ code: -1, message: '切换网络择优开关失败' });
    }
  });

  base.post(wrapPath('/net-optimize/apply'), async (_req, res) => {
    try {
      const r = await mkNetOptApply(deps);
      res.json({ code: r.ok ? 0 : -1, message: r.message, data: r });
    } catch (error) {
      logger?.error?.('应用网络择优规则失败:', error);
      res.status(500).json({ code: -1, message: '应用网络择优规则失败' });
    }
  });

  base.post(wrapPath('/net-optimize/rollback'), async (_req, res) => {
    try {
      const r = await mkNetOptRollback(deps);
      res.json({ code: 0, message: r.message, data: r });
    } catch (error) {
      logger?.error?.('回滚网络择优规则失败:', error);
      res.status(500).json({ code: -1, message: '回滚网络择优规则失败' });
    }
  });
}
