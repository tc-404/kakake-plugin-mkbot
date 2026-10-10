// ---------------------------------------------------------------------------
// 货币配置（货币名称 / 签到奖励 / 打工参数）— WebUI API
// ---------------------------------------------------------------------------

import {
  defaultCurrencyPayload,
  loadCurrencyConfig,
  saveCurrencyConfig,
} from '../lib/currency-config';

type Logger = { error?: (...args: unknown[]) => void };

type Res = {
  json: (o: unknown) => void;
  status?: (n: number) => { json: (o: unknown) => void };
};

type PostReq = {
  body?: unknown;
  readableEnded?: boolean;
  complete?: boolean;
  on?: (ev: string, fn: (...args: unknown[]) => void) => void;
};

/**
 * 读取 POST body。宿主可能已解析并读完请求流，此时再等 data/end 会永久挂住
 * （空 body 时 req.body 是 {}，最容易踩到），所以先判断流是否可读并加兜底超时。
 */
async function parsePostBody(req: PostReq): Promise<Record<string, unknown>> {
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
        req.on?.('data', (chunk: unknown) => { data += String(chunk); });
        req.on?.('end', () => { clearTimeout(guard); resolve(data); });
        req.on?.('error', () => { clearTimeout(guard); resolve(''); });
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

function configPayload(cfg = loadCurrencyConfig()) {
  return { ...cfg, 默认值: defaultCurrencyPayload() };
}

export function registerCurrencyWebGetRoutes(
  base: { get: (path: string, handler: (...args: unknown[]) => unknown) => void },
  wrapPath: (p: string) => string,
  logger?: Logger,
): void {
  base.get(wrapPath('/currency/config'), (_req, res) => {
    try {
      (res as Res).json({ code: 0, data: configPayload() });
    } catch (e) {
      logger?.error?.('读取货币配置失败:', e);
      (res as Res).status?.(500).json({ code: -1, message: '读取货币配置失败' });
    }
  });
}

export function registerCurrencyWebPostRoutes(
  base: { post?: (path: string, handler: (...args: unknown[]) => unknown) => void },
  wrapPath: (p: string) => string,
  logger?: Logger,
): void {
  if (!base.post) return;

  base.post(wrapPath('/currency/config'), async (req, res) => {
    try {
      const body = await parsePostBody(req as PostReq);
      // section 级合并：某个大块缺失时保留当前值，避免前端漏传导致整块被清空。
      // 注意「签到.名次」内部不做深合并 —— 深合并会把用户主动清空的 null 捞回旧值，
      // 「清空回退默认」就会失效。
      const cur = loadCurrencyConfig();
      const saved = saveCurrencyConfig({
        货币: body.货币 ?? cur.货币,
        签到: body.签到 ?? cur.签到,
        打工: body.打工 ?? cur.打工,
      });
      (res as Res).json({ code: 0, message: 'ok', data: configPayload(saved) });
    } catch (e) {
      logger?.error?.('保存货币配置失败:', e);
      (res as Res).status?.(500).json({ code: -1, message: '保存货币配置失败' });
    }
  });
}
