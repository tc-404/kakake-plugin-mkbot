// @ts-nocheck
// ---------------------------------------------------------------------------
// 娱乐分项开关 — WebUI API
// ---------------------------------------------------------------------------

import {
  ENT_FEATURE_KEYS,
  entSwitchFile,
  resolveEntertainmentSwitches,
} from '../lib/entertainment-switches';

type Logger = { error?: (...args: unknown[]) => void; info?: (...args: unknown[]) => void };

function normalizeScope(raw: unknown): string | null {
  const s = String(raw ?? '').trim();
  if (!s) return null;
  if (s === '私聊') return s;
  if (/^\d{5,12}$/.test(s)) return s;
  return null;
}

function normalizeOnOff(raw: unknown): '开启' | '关闭' | null {
  if (raw === '开启' || raw === true || raw === 1 || raw === 'true' || raw === '1') return '开启';
  if (raw === '关闭' || raw === false || raw === 0 || raw === 'false' || raw === '0') return '关闭';
  return null;
}

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

function readMasterPath(readB: (file: string, key: string, def?: unknown) => unknown): string {
  return String(readB('config.json', '深度娱乐路径', '筱筱吖/娱乐系统/深度娱乐/娱乐模式.json') || '')
    || '筱筱吖/娱乐系统/深度娱乐/娱乐模式.json';
}

export function registerEntertainmentSwitchWebGetRoutes(
  base: { get: (path: string, handler: (...args: unknown[]) => unknown) => void },
  wrapPath: (p: string) => string,
  deps: {
    readB: (file: string, key: string, def?: unknown) => unknown;
  },
  logger?: Logger,
): void {
  base.get(wrapPath('/entertainment/switches'), (req, res) => {
    try {
      const q = (req as { query?: Record<string, unknown> })?.query || {};
      const scope = normalizeScope(q.scope);
      if (!scope) {
        (res as { status: (n: number) => { json: (o: unknown) => void } }).status(400).json({
          code: -1,
          message: 'scope_required',
        });
        return;
      }
      const masterPath = readMasterPath(deps.readB);
      const values = resolveEntertainmentSwitches(scope, deps.readB, masterPath, ENT_FEATURE_KEYS);
      (res as { json: (o: unknown) => void }).json({
        code: 0,
        data: {
          scope,
          keys: [...ENT_FEATURE_KEYS],
          values,
        },
      });
    } catch (e) {
      logger?.error?.('读取娱乐开关失败:', e);
      (res as { status: (n: number) => { json: (o: unknown) => void } }).status(500).json({
        code: -1,
        message: '读取娱乐开关失败',
      });
    }
  });
}

export function registerEntertainmentSwitchWebPostRoutes(
  base: { post?: (path: string, handler: (...args: unknown[]) => unknown) => void },
  wrapPath: (p: string) => string,
  deps: {
    readB: (file: string, key: string, def?: unknown) => unknown;
    writeB: (file: string, key: string, value: unknown) => void;
  },
  logger?: Logger,
): void {
  if (!base.post) return;

  base.post(wrapPath('/entertainment/switches'), async (req, res) => {
    try {
      const body = await parsePostBody(req as Parameters<typeof parsePostBody>[0]);
      const scope = normalizeScope(body.scope);
      if (!scope) {
        (res as { status: (n: number) => { json: (o: unknown) => void } }).status(400).json({
          code: -1,
          message: 'scope_required',
        });
        return;
      }
      const valuesRaw = body.values;
      if (!valuesRaw || typeof valuesRaw !== 'object' || Array.isArray(valuesRaw)) {
        (res as { status: (n: number) => { json: (o: unknown) => void } }).status(400).json({
          code: -1,
          message: 'values_required',
        });
        return;
      }

      const allowed = new Set<string>(ENT_FEATURE_KEYS as unknown as string[]);
      const file = entSwitchFile(scope);
      let written = 0;
      for (const [k, v] of Object.entries(valuesRaw as Record<string, unknown>)) {
        const key = String(k || '').trim();
        if (!key || !allowed.has(key)) continue;
        const status = normalizeOnOff(v);
        if (!status) continue;
        deps.writeB(file, key, status);
        written += 1;
      }

      const masterPath = readMasterPath(deps.readB);
      const values = resolveEntertainmentSwitches(scope, deps.readB, masterPath, ENT_FEATURE_KEYS);
      (res as { json: (o: unknown) => void }).json({
        code: 0,
        message: 'ok',
        data: { scope, keys: [...ENT_FEATURE_KEYS], values, written },
      });
    } catch (e) {
      logger?.error?.('保存娱乐开关失败:', e);
      (res as { status: (n: number) => { json: (o: unknown) => void } }).status(500).json({
        code: -1,
        message: '保存娱乐开关失败',
      });
    }
  });
}
