// @ts-nocheck
// ---------------------------------------------------------------------------
// 开关管理 · 复制选项 / 粘贴选项 — WebUI API
// 前端只传作用域 + 对象 id + 节点键，实际文件路径全部由服务端节点表生成
// ---------------------------------------------------------------------------

import {
  clipNodeStates,
  clipNodes,
  copyClipNode,
  findClipNode,
  pasteClipNode,
  readClipRecord,
} from '../lib/config-clipboard';

function normalizeScope(raw) {
  const s = String(raw ?? '').trim();
  return s === 'group' || s === 'friend' ? s : null;
}

function normalizeId(raw) {
  const s = String(raw ?? '').trim();
  return /^\d{5,12}$/.test(s) ? s : null;
}

type PostReq = {
  body?: unknown;
  readableEnded?: boolean;
  complete?: boolean;
  on?: (ev: string, fn: (...args: unknown[]) => void) => void;
};

/** 与邮箱/离线通知同款加固：流已读完时不再等 data/end，另加兜底超时 */
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
  return body && typeof body === 'object' && !Array.isArray(body) ? body : {};
}

/** nodes 支持 '*'（全部）或节点键数组 */
function resolveNodes(scope, raw) {
  const all = clipNodes(scope);
  if (raw === '*' || raw === 'all') return { nodes: [...all], 未知: [] };
  const list = Array.isArray(raw) ? raw : [];
  const nodes = [];
  const 未知 = [];
  const seen = new Set();
  for (const item of list) {
    const key = String(item ?? '').trim();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    const node = findClipNode(scope, key);
    if (node) nodes.push(node);
    else 未知.push(key);
  }
  return { nodes, 未知 };
}

export function registerConfigClipboardWebGetRoutes(base, wrapPath, deps, logger) {
  base.get(wrapPath('/config-clipboard/state'), (req, res) => {
    try {
      const q = req?.query || {};
      const scope = normalizeScope(q.scope);
      const id = normalizeId(q.id);
      if (!scope) {
        res.status(400).json({ code: -1, message: 'scope_required' });
        return;
      }
      if (!id) {
        res.status(400).json({ code: -1, message: 'id_required' });
        return;
      }
      const nodes = clipNodeStates(scope, id, deps);
      res.json({
        code: 0,
        data: {
          scope,
          id,
          nodes,
          有数据数: nodes.filter((n) => n.有数据).length,
          已复制数: nodes.filter((n) => n.已复制).length,
        },
      });
    } catch (e) {
      logger?.error?.('读取复制粘贴状态失败:', e);
      res.status(500).json({ code: -1, message: '读取复制粘贴状态失败' });
    }
  });
}

export function registerConfigClipboardWebPostRoutes(base, wrapPath, deps, logger) {
  if (!base.post) return;

  base.post(wrapPath('/config-clipboard/copy'), async (req, res) => {
    try {
      const body = await parsePostBody(req);
      const scope = normalizeScope(body.scope);
      const id = normalizeId(body.id);
      if (!scope || !id) {
        res.status(400).json({ code: -1, message: !scope ? 'scope_required' : 'id_required' });
        return;
      }
      const { nodes, 未知 } = resolveNodes(scope, body.nodes);
      if (!nodes.length) {
        res.status(400).json({ code: -1, message: 'nodes_required' });
        return;
      }
      const 成功 = [];
      const 跳过 = [];
      for (const node of nodes) {
        const r = copyClipNode(scope, id, node, deps);
        if (r.ok) 成功.push({ 键: node.键, 名称: node.名称, 空: r.空 });
        else 跳过.push({ 键: node.键, 名称: node.名称, 原因: '写入剪贴板失败' });
      }
      res.json({
        code: 0,
        data: { scope, id, 成功, 跳过, 未知, nodes: clipNodeStates(scope, id, deps) },
      });
    } catch (e) {
      logger?.error?.('复制开关配置失败:', e);
      res.status(500).json({ code: -1, message: '复制开关配置失败' });
    }
  });

  base.post(wrapPath('/config-clipboard/paste'), async (req, res) => {
    try {
      const body = await parsePostBody(req);
      const scope = normalizeScope(body.scope);
      const id = normalizeId(body.id);
      if (!scope || !id) {
        res.status(400).json({ code: -1, message: !scope ? 'scope_required' : 'id_required' });
        return;
      }
      const { nodes, 未知 } = resolveNodes(scope, body.nodes);
      const 可粘贴 = nodes.filter((node) => Boolean(readClipRecord(scope, node.键, deps)));
      if (!可粘贴.length) {
        res.status(400).json({ code: -1, message: 'no_clipboard_record' });
        return;
      }
      const 成功 = [];
      const 跳过 = [];
      for (const node of 可粘贴) {
        const r = pasteClipNode(scope, id, node, deps);
        if (r.ok) 成功.push({ 键: node.键, 名称: node.名称, 写入: r.写入, 清空: r.清空 });
        else 跳过.push({ 键: node.键, 名称: node.名称, 原因: r.原因 || '粘贴失败' });
      }
      res.json({
        code: 0,
        data: { scope, id, 成功, 跳过, 未知, nodes: clipNodeStates(scope, id, deps) },
      });
    } catch (e) {
      logger?.error?.('粘贴开关配置失败:', e);
      res.status(500).json({ code: -1, message: '粘贴开关配置失败' });
    }
  });
}