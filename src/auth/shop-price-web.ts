// @ts-nocheck
// ---------------------------------------------------------------------------
// 修改道具（商店默认价格 / 限购 / 浮动）— WebUI API
// ---------------------------------------------------------------------------

import {
  defaultShopPriceConfig,
  listShopPriceEditableItems,
  loadShopPriceConfig,
  saveShopPriceConfig,
} from '../lib/shop-price-config';

type Logger = { error?: (...args: unknown[]) => void };

async function parsePostBody(req: {
  body?: unknown;
  on?: (ev: string, fn: (...args: unknown[]) => void) => void;
}): Promise<Record<string, unknown>> {
  let body = req.body;
  if (!body || (typeof body === 'object' && !Array.isArray(body) && Object.keys(body as object).length === 0)) {
    try {
      const raw = await new Promise<string>((resolve) => {
        let data = '';
        req.on?.('data', (chunk: Buffer | string) => { data += chunk; });
        req.on?.('end', () => resolve(data));
      });
      if (raw) body = JSON.parse(raw);
    } catch {
      body = {};
    }
  }
  return body && typeof body === 'object' && !Array.isArray(body)
    ? (body as Record<string, unknown>)
    : {};
}

function configPayload(cfg = loadShopPriceConfig()) {
  return {
    items: listShopPriceEditableItems(cfg),
    float: cfg.float,
    prices: cfg.prices,
    limits: cfg.limits,
    defaults: defaultShopPriceConfig(),
  };
}

export function registerShopPriceWebGetRoutes(
  base: { get: (path: string, handler: (...args: unknown[]) => unknown) => void },
  wrapPath: (p: string) => string,
  logger?: Logger,
): void {
  base.get(wrapPath('/shop-price/config'), (_req, res) => {
    try {
      (res as { json: (o: unknown) => void }).json({
        code: 0,
        data: configPayload(),
      });
    } catch (e) {
      logger?.error?.('读取道具价格配置失败:', e);
      (res as { status: (n: number) => { json: (o: unknown) => void } }).status(500).json({
        code: -1,
        message: '读取道具价格配置失败',
      });
    }
  });
}

export function registerShopPriceWebPostRoutes(
  base: { post?: (path: string, handler: (...args: unknown[]) => unknown) => void },
  wrapPath: (p: string) => string,
  logger?: Logger,
): void {
  if (!base.post) return;

  base.post(wrapPath('/shop-price/config'), async (req, res) => {
    try {
      const body = await parsePostBody(req as Parameters<typeof parsePostBody>[0]);
      const saved = saveShopPriceConfig({
        prices: body.prices,
        limits: body.limits,
        float: body.float,
      });
      (res as { json: (o: unknown) => void }).json({
        code: 0,
        message: 'ok',
        data: configPayload(saved),
      });
    } catch (e) {
      logger?.error?.('保存道具价格配置失败:', e);
      (res as { status: (n: number) => { json: (o: unknown) => void } }).status(500).json({
        code: -1,
        message: '保存道具价格配置失败',
      });
    }
  });
}
