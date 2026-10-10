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
import {
  defaultUnmutePriceConfig,
  loadUnmutePriceConfig,
  saveUnmutePriceConfig,
} from '../lib/unmute-price';
import {
  defaultVaultRaidConfig,
  loadVaultRaidConfig,
  saveVaultRaidConfig,
  读金库,
  写金库,
  清抬价缓存,
} from '../lib/vault-raid';

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
    unmute: loadUnmutePriceConfig(),
    unmuteDefaults: defaultUnmutePriceConfig(),
    vault: loadVaultRaidConfig(),
    vaultDefaults: defaultVaultRaidConfig(),
    vaultFund: 读金库(),
  };
}

/** 金库余额：后台可直接读写（改动不经过配置保存，独立按钮触发） */
export function registerVaultFundWebGetRoutes(
  base: { get: (path: string, handler: (...args: unknown[]) => unknown) => void },
  wrapPath: (p: string) => string,
  logger?: Logger,
): void {
  base.get(wrapPath('/vault/fund'), (_req, res) => {
    try {
      (res as { json: (o: unknown) => void }).json({ code: 0, data: { 总值: 读金库() } });
    } catch (e) {
      logger?.error?.('读取金库余额失败:', e);
      (res as { status: (n: number) => { json: (o: unknown) => void } }).status(500).json({
        code: -1, message: '读取金库余额失败',
      });
    }
  });
}

export function registerVaultFundWebPostRoutes(
  base: { post?: (path: string, handler: (...args: unknown[]) => unknown) => void },
  wrapPath: (p: string) => string,
  logger?: Logger,
): void {
  if (!base.post) return;
  base.post(wrapPath('/vault/fund'), async (req, res) => {
    try {
      const body = await parsePostBody(req as Parameters<typeof parsePostBody>[0]);
      const n = Number(body.总值);
      if (!Number.isFinite(n) || n < 0) {
        (res as { status: (n: number) => { json: (o: unknown) => void } }).status(400).json({
          code: -1, message: '金库余额必须是不小于 0 的数字',
        });
        return;
      }
      const 现值 = 写金库(Math.floor(n));
      (res as { json: (o: unknown) => void }).json({ code: 0, message: 'ok', data: { 总值: 现值 } });
    } catch (e) {
      logger?.error?.('保存金库余额失败:', e);
      (res as { status: (n: number) => { json: (o: unknown) => void } }).status(500).json({
        code: -1, message: '保存金库余额失败',
      });
    }
  });
}

export function registerShopPriceWebGetRoutes(
  base: { get: (path: string, handler: (...args: unknown[]) => unknown) => void },
  wrapPath: (p: string) => string,
  logger?: Logger,
): void {
  registerVaultFundWebGetRoutes(base, wrapPath, logger);
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
  registerVaultFundWebPostRoutes(base, wrapPath, logger);

  base.post(wrapPath('/shop-price/config'), async (req, res) => {
    try {
      const body = await parsePostBody(req as Parameters<typeof parsePostBody>[0]);
      // 私聊解禁配置：仅在请求携带时保存，避免被其它保存动作清空
      if (body.unmute && typeof body.unmute === 'object') {
        saveUnmutePriceConfig(body.unmute);
      }
      // 闯金库配置：仅在请求携带时保存，避免被其它保存动作清空。
      // 改了「自动抬价 / 基准人均」要清掉系数缓存，否则 30 分钟内还是旧值。
      if (body.vault && typeof body.vault === 'object') {
        saveVaultRaidConfig(body.vault);
        清抬价缓存();
      }
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
