// @ts-nocheck
// ---------------------------------------------------------------------------
// 背景修改 — WebUI API（鉴权由 mkbot-core wrapMkbotWebUiHandler 统一加）
// ---------------------------------------------------------------------------

import {
  getBgEditSlot,
  listBgEditSlotsPayload,
  parseImageDataUrl,
  resetCustomBg,
  resolveEffectiveBgAbs,
  fileToDataUrl,
  setCustomBg,
} from '../lib/bg-edit';

type Logger = { error?: (...args: unknown[]) => void };

const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;

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

function queryId(req: { query?: Record<string, unknown>; url?: string }): string {
  const q = req?.query && typeof req.query === 'object' ? String(req.query.id ?? '').trim() : '';
  if (q) return q;
  try {
    const u = new URL(String(req?.url || ''), 'http://127.0.0.1');
    return String(u.searchParams.get('id') || '').trim();
  } catch {
    return '';
  }
}

export function registerBgEditWebGetRoutes(
  base: { get: (path: string, handler: (...args: unknown[]) => unknown) => void },
  wrapPath: (p: string) => string,
  logger?: Logger,
): void {
  base.get(wrapPath('/bg-edit/list'), (_req, res) => {
    try {
      (res as { json: (o: unknown) => void }).json({
        code: 0,
        data: { list: listBgEditSlotsPayload() },
      });
    } catch (e) {
      logger?.error?.('读取背景列表失败:', e);
      (res as { status: (n: number) => { json: (o: unknown) => void } }).status(500).json({
        code: -1,
        message: '读取背景列表失败',
      });
    }
  });

  base.get(wrapPath('/bg-edit/preview'), (req, res) => {
    try {
      const id = queryId(req as { query?: Record<string, unknown>; url?: string });
      if (!getBgEditSlot(id)) {
        (res as { status: (n: number) => { json: (o: unknown) => void } }).status(400).json({
          code: -1,
          message: '未知背景槽位',
        });
        return;
      }
      const abs = resolveEffectiveBgAbs(id);
      const dataUrl = abs ? fileToDataUrl(abs) : '';
      (res as { json: (o: unknown) => void }).json({
        code: 0,
        data: { id, dataUrl, hasFile: Boolean(dataUrl) },
      });
    } catch (e) {
      logger?.error?.('读取背景预览失败:', e);
      (res as { status: (n: number) => { json: (o: unknown) => void } }).status(500).json({
        code: -1,
        message: '读取背景预览失败',
      });
    }
  });
}

export function registerBgEditWebPostRoutes(
  base: { post?: (path: string, handler: (...args: unknown[]) => unknown) => void },
  wrapPath: (p: string) => string,
  logger?: Logger,
): void {
  if (!base.post) return;

  base.post(wrapPath('/bg-edit/set'), async (req, res) => {
    try {
      const body = await parsePostBody(req as Parameters<typeof parsePostBody>[0]);
      const id = String(body.id || '').trim();
      if (!getBgEditSlot(id)) {
        (res as { status: (n: number) => { json: (o: unknown) => void } }).status(400).json({
          code: -1,
          message: '未知背景槽位',
        });
        return;
      }
      const parsed = parseImageDataUrl(String(body.dataUrl || ''));
      if (!parsed) {
        (res as { status: (n: number) => { json: (o: unknown) => void } }).status(400).json({
          code: -1,
          message: '请上传 png / jpg / webp 图片',
        });
        return;
      }
      if (parsed.buffer.length > MAX_UPLOAD_BYTES) {
        (res as { status: (n: number) => { json: (o: unknown) => void } }).status(400).json({
          code: -1,
          message: '图片过大（上限 8MB）',
        });
        return;
      }
      setCustomBg(id, parsed.buffer, parsed.ext);
      (res as { json: (o: unknown) => void }).json({
        code: 0,
        message: 'ok',
        data: { id, hasCustom: true },
      });
    } catch (e) {
      logger?.error?.('保存自定义背景失败:', e);
      (res as { status: (n: number) => { json: (o: unknown) => void } }).status(500).json({
        code: -1,
        message: e instanceof Error ? e.message : '保存自定义背景失败',
      });
    }
  });

  base.post(wrapPath('/bg-edit/reset'), async (req, res) => {
    try {
      const body = await parsePostBody(req as Parameters<typeof parsePostBody>[0]);
      const id = String(body.id || '').trim();
      if (!getBgEditSlot(id)) {
        (res as { status: (n: number) => { json: (o: unknown) => void } }).status(400).json({
          code: -1,
          message: '未知背景槽位',
        });
        return;
      }
      resetCustomBg(id);
      (res as { json: (o: unknown) => void }).json({
        code: 0,
        message: 'ok',
        data: { id, hasCustom: false },
      });
    } catch (e) {
      logger?.error?.('重置背景失败:', e);
      (res as { status: (n: number) => { json: (o: unknown) => void } }).status(500).json({
        code: -1,
        message: '重置背景失败',
      });
    }
  });
}
