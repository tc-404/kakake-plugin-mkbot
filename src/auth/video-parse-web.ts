// @ts-nocheck
// ---------------------------------------------------------------------------
// 视频解析 WebUI API（侧边栏独立页「视频解析」）
//
// 职责：
//   · 各平台 Cookie 的读取 / 保存 / 续期（保存登录状态 → 实时刷新最新 Cookie）
//   · 解析相关基础设置（并发下载数 / 下载并发路数 / 内联图片落盘）统一在此页管理
//   · 测试解析：用当前配置对一条链接跑一遍解析，直接看成没成
//
// 路由（wrapPath 前缀 /video-parse）：
//   GET  /video-parse/config           配置总览（Cookie 状态 + 设置）
//   POST /video-parse/cookie           保存某平台 Cookie { platform, cookie }
//   POST /video-parse/refresh          续期某平台 Cookie { platform }
//   POST /video-parse/test             测试解析 { platform, url }
// ---------------------------------------------------------------------------

import {
  VIDEO_COOKIE_FILE,
  VIDEO_COOKIE_PLATFORMS,
  mkVideoCookieReadAll,
  mkVideoCookieReadUpdatedAt,
  mkVideoCookieRefresh,
  mkVideoCookieWrite,
  mkVideoQrPoll,
  mkVideoQrStart,
} from '../lib/video-cookies';

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

function platformHasSession(platform: string, cookie: string): boolean {
  const keys: Record<string, string[]> = {
    哔哩哔哩: ['SESSDATA'],
    抖音: ['sessionid', 'ttwid'],
    小红书: ['web_session', 'a1'],
    快手: ['did', 'kuaishou.server.webday7_st', 'passToken'],
  };
  const list = keys[platform] || [];
  return list.some((k) => cookie.includes(`${k}=`));
}

export interface VideoParseWebDeps {
  readB?: (file: string, key: string, def?: unknown) => unknown;
  writeB?: (file: string, key: string, value: unknown) => void;
  /** 用当前配置跑一次解析（由 mkbot-core 注入，内部走 callLocalVideoApi） */
  testParse?: (platform: string, url: string) => Promise<{ ok: boolean; message: string }>;
  logger?: { info?: (...a: unknown[]) => void; warn?: (...a: unknown[]) => void; error?: (...a: unknown[]) => void };
}

const SETTING_KEYS = ['并发下载数', '下载并发路数', '内联图片落盘'] as const;

export function registerVideoParseWebGetRoutes(
  base: { get: (path: string, handler: (...args: unknown[]) => unknown) => void },
  wrapPath: (p: string) => string,
  deps: VideoParseWebDeps,
  logger?: { error?: (...args: unknown[]) => void },
) {
  base.get(wrapPath('/video-parse/config'), async (_req, res) => {
    try {
      const cookies: Record<string, { cookie: string; hasSession: boolean; updatedAt: number }> = {};
      const all = mkVideoCookieReadAll(deps.readB);
      const stamps = mkVideoCookieReadUpdatedAt(deps.readB);
      for (const p of VIDEO_COOKIE_PLATFORMS) {
        const cookie = all[p] || '';
        cookies[p] = {
          cookie,
          hasSession: platformHasSession(p, cookie),
          updatedAt: stamps[p] || 0,
        };
      }
      // 设置项直接从 config.json 读，与「渲染设置」同源
      const settings: Record<string, unknown> = {};
      for (const k of SETTING_KEYS) {
        const v = deps.readB?.('config.json', k, '');
        if (k === '内联图片落盘') {
          // 存的是开关语义：''/true=开；"0"/"false"/"关闭"=关
          const s = String(v ?? '').trim().toLowerCase();
          settings[k] = !(s === '0' || s === 'false' || s === 'off' || s === 'no' || s === '关闭');
        } else {
          settings[k] = v ?? '';
        }
      }
      res.json({ code: 0, data: { platforms: VIDEO_COOKIE_PLATFORMS, cookies, settings } });
    } catch (error) {
      logger?.error?.('获取视频解析配置失败:', error);
      res.status(500).json({ code: -1, message: '获取视频解析配置失败' });
    }
  });
}

export function registerVideoParseWebPostRoutes(
  base: { post: (path: string, handler: (...args: unknown[]) => unknown) => void },
  wrapPath: (p: string) => string,
  deps: VideoParseWebDeps,
  logger?: { error?: (...args: unknown[]) => void },
) {
  base.post(wrapPath('/video-parse/cookie'), async (req, res) => {
    try {
      const body = await parsePostBody(req);
      const platform = String(body.platform || '').trim();
      const cookie = String(body.cookie ?? '').trim();
      if (!mkVideoCookieWrite(deps.writeB, platform, cookie, deps.readB)) {
        res.status(400).json({ code: -1, message: `不支持的平台：${platform || '（空）'}` });
        return;
      }
      logger?.info?.(`[视频解析] 已保存 ${platform} Cookie（${cookie ? `${cookie.length} 字符` : '已清空'}）`);
      res.json({ code: 0, message: cookie ? 'Cookie 已保存' : 'Cookie 已清空' });
    } catch (error) {
      logger?.error?.('保存视频解析 Cookie 失败:', error);
      res.status(500).json({ code: -1, message: '保存失败' });
    }
  });

  base.post(wrapPath('/video-parse/refresh'), async (req, res) => {
    try {
      const body = await parsePostBody(req);
      const platform = String(body.platform || '').trim();
      if (!(VIDEO_COOKIE_PLATFORMS as readonly string[]).includes(platform)) {
        res.status(400).json({ code: -1, message: `不支持的平台：${platform || '（空）'}` });
        return;
      }
      const current = mkVideoCookieReadAll(deps.readB)[platform] || '';
      const r = await mkVideoCookieRefresh(platform, current, deps.logger);
      // 续期成功才回写合并后的 Cookie；失败时保留原值（避免误清登录态）
      if (r.ok && r.cookie && r.cookie !== current) {
        mkVideoCookieWrite(deps.writeB, platform, r.cookie, deps.readB);
      }
      logger?.info?.(`[视频解析] ${platform} Cookie 续期：${r.message}`);
      res.json({
        code: r.ok ? 0 : -1,
        message: r.message,
        data: { loginOk: r.loginOk === true, cookie: r.cookie, updated: r.ok && r.cookie !== current },
      });
    } catch (error) {
      logger?.error?.('续期视频解析 Cookie 失败:', error);
      res.status(500).json({ code: -1, message: '续期失败' });
    }
  });

  base.post(wrapPath('/video-parse/login/start'), async (req, res) => {
    try {
      const body = await parsePostBody(req);
      const platform = String(body.platform || '').trim();
      if (!(VIDEO_COOKIE_PLATFORMS as readonly string[]).includes(platform)) {
        res.status(400).json({ code: -1, message: `不支持的平台：${platform || '（空）'}` });
        return;
      }
      const r = await mkVideoQrStart(platform, deps.logger);
      res.json({ code: r.ok ? 0 : -1, message: r.message, data: { qr: r.qr, token: r.token } });
    } catch (error) {
      logger?.error?.('扫码登录发起失败:', error);
      res.status(500).json({ code: -1, message: '扫码登录发起失败' });
    }
  });

  base.post(wrapPath('/video-parse/login/poll'), async (req, res) => {
    try {
      const body = await parsePostBody(req);
      const platform = String(body.platform || '').trim();
      const token = String(body.token || '').trim();
      if (!token || !(VIDEO_COOKIE_PLATFORMS as readonly string[]).includes(platform)) {
        res.status(400).json({ code: -1, message: '参数缺失' });
        return;
      }
      const current = mkVideoCookieReadAll(deps.readB)[platform] || '';
      const r = await mkVideoQrPoll(platform, token, current, deps.logger);
      if (r.status === 'confirmed' && r.ok && r.cookie) {
        // 扫码成功 → Cookie 直接入库（与已有值合并），并刷新更新时间
        mkVideoCookieWrite(deps.writeB, platform, r.cookie, deps.readB);
        logger?.info?.(`[视频解析] ${platform} 扫码登录成功，Cookie 已入库`);
      }
      res.json({
        code: r.status === 'error' ? -1 : 0,
        message: r.message,
        data: { status: r.status, ok: r.ok },
      });
    } catch (error) {
      logger?.error?.('扫码状态轮询失败:', error);
      res.status(500).json({ code: -1, message: '轮询失败' });
    }
  });

  base.post(wrapPath('/video-parse/test'), async (req, res) => {
    try {
      const body = await parsePostBody(req);
      const platform = String(body.platform || '').trim();
      const url = String(body.url || '').trim();
      if (!url) {
        res.status(400).json({ code: -1, message: '请填写要测试的链接' });
        return;
      }
      if (!deps.testParse) {
        res.status(500).json({ code: -1, message: '测试能力未注入' });
        return;
      }
      const r = await deps.testParse(platform, url);
      res.json({ code: r.ok ? 0 : -1, message: r.message });
    } catch (error) {
      logger?.error?.('测试解析失败:', error);
      res.status(500).json({ code: -1, message: '测试失败' });
    }
  });
}
