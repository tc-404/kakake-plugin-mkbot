// @ts-nocheck
// ---------------------------------------------------------------------------
// 离线通知 WebUI API
// ---------------------------------------------------------------------------

import type { OfflineNotifyDeps } from './offline-notify';
import {
  getOfflineNotifySettings,
  saveOfflineNotifySettings,
  simulateOfflineNotify,
} from './offline-notify';

type PostReq = {
  body?: unknown;
  readableEnded?: boolean;
  complete?: boolean;
  on?: (ev: string, fn: (...args: unknown[]) => void) => void;
};

/**
 * 读取 POST body。宿主可能已经解析并读完了请求流，此时再等 data/end 会永远挂住
 * （空 body 的请求 req.body 是 {}，最容易踩到），所以先判断流是否还可读，并加兜底超时。
 */
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

export function registerOfflineNotifyWebGetRoutes(
  base: { get: (path: string, handler: (...args: unknown[]) => unknown) => void },
  wrapPath: (p: string) => string,
  deps: OfflineNotifyDeps,
  logger?: { error?: (...args: unknown[]) => void },
) {
  base.get(wrapPath('/offline-notify/config'), (_req, res) => {
    try {
      res.json({ code: 0, data: getOfflineNotifySettings(deps) });
    } catch (error) {
      logger?.error?.('获取离线通知配置失败:', error);
      res.status(500).json({ code: -1, message: '获取离线通知配置失败' });
    }
  });
}

export function registerOfflineNotifyWebPostRoutes(
  base: { post: (path: string, handler: (...args: unknown[]) => unknown) => void },
  wrapPath: (p: string) => string,
  deps: OfflineNotifyDeps,
  logger?: {
    error?: (...args: unknown[]) => void;
    warn?: (...args: unknown[]) => void;
    info?: (...args: unknown[]) => void;
  },
) {
  base.post(wrapPath('/offline-notify/save'), async (req, res) => {
    try {
      const body = await parsePostBody(req);
      res.json({ code: 0, data: saveOfflineNotifySettings(deps, body) });
    } catch (error) {
      logger?.error?.('保存离线通知配置失败:', error);
      res.status(500).json({ code: -1, message: '保存离线通知配置失败' });
    }
  });

  // 模拟发送：伪造 bot_offline 上报走真实处理流程并真实发信，用于自检整条链路。
  // 不读请求 body（模拟不需要入参），避免宿主已读完请求流时卡在 body 解析上。
  base.post(wrapPath('/offline-notify/simulate'), async (_req, res) => {
    logger?.info?.('[MKbot] 离线通知模拟发送：开始');
    try {
      const r = await simulateOfflineNotify(deps, {});
      if (!r.ok) {
        logger?.warn?.(`[MKbot] 离线通知模拟发送未完成（${r.code}）：${r.message}`);
        res.status(400).json({ code: -1, message: r.message, data: r });
        return;
      }
      logger?.info?.(`[MKbot] 离线通知模拟发送成功：发件 ${r.from || '未知'} → ${r.recipients.join('、')}`);
      res.json({ code: 0, message: r.message, data: r });
    } catch (error) {
      logger?.error?.('离线通知模拟发送失败:', error);
      res.status(500).json({ code: -1, message: '模拟发送失败，请查看框架日志' });
    }
  });
}
