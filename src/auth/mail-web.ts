// @ts-nocheck
// ---------------------------------------------------------------------------
// 邮箱绑定 WebUI API（授权码只写不回读）
// ---------------------------------------------------------------------------

import {
  deleteMailAccount,
  getMailProviderCatalog,
  listMailAccounts,
  saveMailAccount,
  verifyAllMailAccounts,
  verifyMailAccount,
  MAIL_MAX_ACCOUNTS,
  type MailDeps,
} from '../lib/api/mail-accounts';

const ERROR_MESSAGES: Record<string, string> = {
  not_found: '该邮箱绑定不存在或已被删除',
  limit_reached: `最多只能绑定 ${MAIL_MAX_ACCOUNTS} 个邮箱`,
  invalid_provider: '未知的邮箱服务商',
  invalid_email: '邮箱地址格式不正确',
  domain_mismatch: '邮箱域名与所选服务商不匹配，请改用「其他邮箱」',
  duplicated: '该邮箱地址已经绑定过了',
  invalid_host: '请填写正确的 SMTP 服务器地址',
  secret_required: '首次绑定必须填写授权码 / 密码 / SMTP Key',
};

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

export function registerMailWebGetRoutes(
  base: { get: (path: string, handler: (...args: unknown[]) => unknown) => void },
  wrapPath: (p: string) => string,
  deps: MailDeps,
  logger?: { error?: (...args: unknown[]) => void },
) {
  base.get(wrapPath('/mail/providers'), (_req, res) => {
    try {
      res.json({ code: 0, data: getMailProviderCatalog() });
    } catch (error) {
      logger?.error?.('获取邮箱服务商列表失败:', error);
      res.status(500).json({ code: -1, message: '获取邮箱服务商列表失败' });
    }
  });

  base.get(wrapPath('/mail/accounts'), (_req, res) => {
    try {
      res.json({ code: 0, data: listMailAccounts(deps) });
    } catch (error) {
      logger?.error?.('获取邮箱绑定列表失败:', error);
      res.status(500).json({ code: -1, message: '获取邮箱绑定列表失败' });
    }
  });
}

export function registerMailWebPostRoutes(
  base: { post: (path: string, handler: (...args: unknown[]) => unknown) => void },
  wrapPath: (p: string) => string,
  deps: MailDeps,
  logger?: { error?: (...args: unknown[]) => void },
) {
  base.post(wrapPath('/mail/save'), async (req, res) => {
    try {
      const body = await parsePostBody(req);
      const r = saveMailAccount(deps, body);
      if (!r.ok) {
        res.status(400).json({ code: -1, message: ERROR_MESSAGES[r.message] || r.message });
        return;
      }
      res.json({ code: 0, data: r.data });
    } catch (error) {
      logger?.error?.('保存邮箱绑定失败:', error);
      res.status(500).json({ code: -1, message: '保存邮箱绑定失败' });
    }
  });

  base.post(wrapPath('/mail/delete'), async (req, res) => {
    try {
      const body = await parsePostBody(req);
      const r = deleteMailAccount(deps, body.id);
      if (!r.ok) {
        res.status(400).json({ code: -1, message: ERROR_MESSAGES[r.message] || r.message });
        return;
      }
      res.json({ code: 0, data: r.data });
    } catch (error) {
      logger?.error?.('删除邮箱绑定失败:', error);
      res.status(500).json({ code: -1, message: '删除邮箱绑定失败' });
    }
  });

  base.post(wrapPath('/mail/verify'), async (req, res) => {
    try {
      const body = await parsePostBody(req);
      const r = await verifyMailAccount(deps, body.id);
      if (!r.ok) {
        res.status(400).json({ code: -1, message: ERROR_MESSAGES[r.message] || r.message });
        return;
      }
      res.json({ code: 0, data: r.data });
    } catch (error) {
      logger?.error?.('验证邮箱绑定失败:', error);
      res.status(500).json({ code: -1, message: '验证邮箱绑定失败' });
    }
  });

  base.post(wrapPath('/mail/verify-all'), async (_req, res) => {
    try {
      const r = await verifyAllMailAccounts(deps);
      res.json({ code: 0, data: r.data });
    } catch (error) {
      logger?.error?.('批量验证邮箱绑定失败:', error);
      res.status(500).json({ code: -1, message: '批量验证邮箱绑定失败' });
    }
  });
}