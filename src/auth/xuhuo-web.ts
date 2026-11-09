// @ts-nocheck
import fs from 'fs';
import path from 'path';
import { getDataPath } from '../data-fs';
import { parseImageDataUrl } from '../lib/bg-edit';
import {
  XUHUO_IMAGE_DIR,
  ensureXuhuoConfigFile,
  isSafeXuhuoImageName,
  isXuhuoImageUsable,
  localXuhuoImageExists,
  newXuhuoId,
  normalizeXuhuoConfig,
  pruneXuhuoState,
  readXuhuoDayState,
  readXuhuoHistory,
  resolveXuhuoImageAbs,
  writeXuhuoConfig,
  xuhuoDateKey,
} from '../lib/xuhuo';

type Req = {
  body?: unknown;
  rawBody?: string;
  query?: Record<string, unknown>;
  params?: Record<string, unknown>;
  on?: (ev: string, fn: (...args: unknown[]) => void) => void;
};
type Res = {
  json: (o: unknown) => void;
  status: (n: number) => Res;
};
type Logger = { error?: (...a: unknown[]) => void; warn?: (...a: unknown[]) => void };

type Deps = {
  listGroups: () => Promise<any[]>;
  listFriends: () => Promise<any[]>;
  readB: (file: string, key: string, def?: unknown) => unknown;
  writeB: (file: string, key: string, value: unknown) => unknown;
  rearm: () => void;
  friendSwitchOf: (qq: string) => string;
  groupSwitchOf: (gid: string) => string;
  setFriendMaster: (on: boolean) => void;
};

const GROUP_EVENT_FILE = (gid: string) => `筱筱吖/事件系统/${gid}.json`;
const FRIEND_SWITCH_FILE = '筱筱吖/扩展功能/续火功能/状态数据/好友/开关.json';

async function readBody(req: Req): Promise<Record<string, unknown>> {
  let body = req.body;
  if (!body || (typeof body === 'object' && !Array.isArray(body) && Object.keys(body as object).length === 0)) {
    if (req.rawBody) {
      try {
        body = JSON.parse(req.rawBody);
      } catch {
        body = {};
      }
    }
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    try {
      const raw = await new Promise<string>((resolve) => {
        let data = '';
        req.on?.('data', (chunk: Buffer | string) => {
          data += chunk;
        });
        req.on?.('end', () => resolve(data));
      });
      if (raw) body = JSON.parse(raw);
    } catch {
      body = {};
    }
  }
  return body && typeof body === 'object' && !Array.isArray(body) ? (body as Record<string, unknown>) : {};
}

function imageDirAbs(): string {
  const dir = path.join(getDataPath(), XUHUO_IMAGE_DIR);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function listLocalImages(): string[] {
  const dir = path.join(getDataPath(), XUHUO_IMAGE_DIR);
  try {
    if (!fs.existsSync(dir)) return [];
    return fs
      .readdirSync(dir)
      .filter((n) => isSafeXuhuoImageName(n))
      .sort((a, b) => a.localeCompare(b, 'en', { numeric: true }));
  } catch {
    return [];
  }
}

function daySummary(date: string) {
  const tally = (state: Record<string, string>) => {
    let 已 = 0;
    let 失败 = 0;
    for (const v of Object.values(state)) {
      if (v === '已') 已++;
      else if (v === '失败') 失败++;
    }
    return { 已发: 已, 失败 };
  };
  return { 群聊: tally(readXuhuoDayState('群聊', date)), 私聊: tally(readXuhuoDayState('私聊', date)) };
}

export function registerXuhuoWebGetRoutes(
  base: { get: (p: string, h: (...a: unknown[]) => unknown) => void },
  wrapPath: (p: string) => string,
  deps: Deps,
  logger?: Logger,
): void {
  base.get(wrapPath('/xuhuo/config'), (_req, res: Res) => {
    try {
      const cfg = ensureXuhuoConfigFile();
      const today = xuhuoDateKey();
      const images = cfg.图片.资源.map((it) => ({
        ...it,
        可用: isXuhuoImageUsable(it),
        本地存在: it.来源 === '本地' ? localXuhuoImageExists(it.值) : true,
      }));
      res.json({
        code: 0,
        data: {
          config: cfg,
          images,
          本地图片: listLocalImages(),
          今日: { 日期: today, ...daySummary(today) },
          历史: readXuhuoHistory().slice(-30),
        },
      });
    } catch (e) {
      logger?.error?.('读取续火配置失败:', e);
      res.status(500).json({ code: -1, message: '读取续火配置失败' });
    }
  });

  base.get(wrapPath('/xuhuo/image/read'), (req: Req, res: Res) => {
    try {
      const name = String(req?.query?.name ?? '').trim();
      if (!isSafeXuhuoImageName(name)) {
        res.status(400).json({ code: -1, message: '文件名无效' });
        return;
      }
      const abs = resolveXuhuoImageAbs(name);
      if (!abs || !fs.existsSync(abs)) {
        res.status(404).json({ code: -1, message: '图片不存在' });
        return;
      }
      const ext = path.extname(abs).slice(1).toLowerCase();
      const mime = ext === 'jpg' ? 'jpeg' : ext;
      const dataUrl = `data:image/${mime};base64,${fs.readFileSync(abs).toString('base64')}`;
      res.json({ code: 0, data: { name, dataUrl } });
    } catch (e) {
      logger?.error?.('读取续火图片失败:', e);
      res.status(500).json({ code: -1, message: '读取续火图片失败' });
    }
  });

  base.get(wrapPath('/xuhuo/targets'), async (req: Req, res: Res) => {
    try {
      const scope = String(req?.query?.scope ?? '群聊') === '私聊' ? '私聊' : '群聊';
      const today = xuhuoDateKey();
      const state = readXuhuoDayState(scope, today);
      if (scope === '群聊') {
        const groups = (await deps.listGroups()) || [];
        const list = groups
          .map((g) => ({
            id: String(g?.group_id ?? ''),
            name: String(g?.group_name ?? g?.group_id ?? ''),
            人数: Number(g?.member_count) || 0,
            开启: deps.groupSwitchOf(String(g?.group_id ?? '')) === '开启',
            今日: state[String(g?.group_id ?? '')] || '未',
          }))
          .filter((x) => x.id)
          .sort((a, b) => a.name.localeCompare(b.name, 'zh-Hans-CN'));
        res.json({ code: 0, data: { scope, list } });
        return;
      }
      const friends = (await deps.listFriends()) || [];
      const list = friends
        .map((f) => ({
          id: String(f?.user_id ?? ''),
          name: String(f?.nickname ?? f?.remark ?? f?.user_id ?? ''),
          开启: deps.friendSwitchOf(String(f?.user_id ?? '')) === '开启',
          今日: state[String(f?.user_id ?? '')] || '未',
        }))
        .filter((x) => x.id)
        .sort((a, b) => a.name.localeCompare(b.name, 'zh-Hans-CN'));
      res.json({ code: 0, data: { scope, list } });
    } catch (e) {
      logger?.error?.('读取续火发送对象失败:', e);
      res.status(500).json({ code: -1, message: '读取续火发送对象失败' });
    }
  });

  base.get(wrapPath('/xuhuo/records'), (req: Req, res: Res) => {
    try {
      const daysRaw = Number(req?.query?.days);
      const days = Math.min(60, Math.max(3, Number.isFinite(daysRaw) ? Math.floor(daysRaw) : 14));
      const rows: any[] = [];
      const now = Date.now();
      for (let i = 0; i < days; i++) {
        const key = xuhuoDateKey(now - i * 86400000);
        rows.push({ 日期: key, ...daySummary(key) });
      }
      res.json({ code: 0, data: { rows, 历史: readXuhuoHistory().slice(-60) } });
    } catch (e) {
      logger?.error?.('读取续火记录失败:', e);
      res.status(500).json({ code: -1, message: '读取续火记录失败' });
    }
  });
}

export function registerXuhuoWebPostRoutes(
  base: { post?: (p: string, h: (...a: unknown[]) => unknown) => void },
  wrapPath: (p: string) => string,
  deps: Deps,
  logger?: Logger,
): void {
  if (!base.post) return;

  base.post(wrapPath('/xuhuo/config'), async (req: Req, res: Res) => {
    try {
      const body = await readBody(req);
      const incoming = body?.config;
      if (!incoming || typeof incoming !== 'object') {
        res.status(400).json({ code: -1, message: '缺少配置内容' });
        return;
      }
      const cfg = normalizeXuhuoConfig(incoming);
      if (!writeXuhuoConfig(cfg)) {
        res.status(500).json({ code: -1, message: '配置写入失败' });
        return;
      }
      deps.setFriendMaster(cfg.私聊.启用);
      deps.rearm();
      res.json({ code: 0, message: 'ok', data: { config: cfg } });
    } catch (e) {
      logger?.error?.('保存续火配置失败:', e);
      res.status(500).json({ code: -1, message: '保存续火配置失败' });
    }
  });

  base.post(wrapPath('/xuhuo/image/upload'), async (req: Req, res: Res) => {
    try {
      const body = await readBody(req);
      const parsed = parseImageDataUrl(String(body?.dataUrl || ''));
      if (!parsed) {
        res.status(400).json({ code: -1, message: '请上传 png / jpg / webp 图片' });
        return;
      }
      if (parsed.buffer.length > 8 * 1024 * 1024) {
        res.status(400).json({ code: -1, message: '图片过大（上限 8MB）' });
        return;
      }
      const dir = imageDirAbs();
      const name = `xh_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}.${parsed.ext}`;
      fs.writeFileSync(path.join(dir, name), parsed.buffer);
      res.json({
        code: 0,
        data: { name, item: { id: newXuhuoId(), 来源: '本地', 值: name } },
      });
    } catch (e) {
      logger?.error?.('续火图片上传失败:', e);
      res.status(500).json({ code: -1, message: '续火图片上传失败' });
    }
  });

  base.post(wrapPath('/xuhuo/image/delete'), async (req: Req, res: Res) => {
    try {
      const body = await readBody(req);
      const names = Array.isArray(body?.names)
        ? body.names.map((n) => String(n ?? '').trim()).filter((n) => isSafeXuhuoImageName(n))
        : [];
      const deleted: string[] = [];
      for (const name of names) {
        try {
          const abs = resolveXuhuoImageAbs(name);
          if (abs && fs.existsSync(abs)) {
            fs.unlinkSync(abs);
            deleted.push(name);
          }
        } catch (e) {
          logger?.error?.(`[续火图片] 删除失败 ${name}:`, e);
        }
      }
      res.json({ code: 0, data: { deleted } });
    } catch (e) {
      logger?.error?.('删除续火图片失败:', e);
      res.status(500).json({ code: -1, message: '删除续火图片失败' });
    }
  });

  base.post(wrapPath('/xuhuo/targets'), async (req: Req, res: Res) => {
    try {
      const body = await readBody(req);
      const scope = String(body?.scope ?? '群聊') === '私聊' ? '私聊' : '群聊';
      const value = String(body?.value ?? '') === '开启' ? '开启' : '关闭';
      const ids = Array.isArray(body?.ids)
        ? body.ids.map((x) => String(x ?? '').trim()).filter((x) => /^\d{5,12}$/.test(x))
        : [];
      if (!ids.length) {
        res.status(400).json({ code: -1, message: '未选择对象' });
        return;
      }
      if (scope === '群聊') {
        for (const gid of ids) deps.writeB(GROUP_EVENT_FILE(gid), '群聊续火', value);
      } else {
        for (const qq of ids) deps.writeB(FRIEND_SWITCH_FILE, qq, value);
        if (value === '开启') {
          const cfg = ensureXuhuoConfigFile();
          if (!cfg.私聊.启用) {
            cfg.私聊.启用 = true;
            writeXuhuoConfig(cfg);
            deps.setFriendMaster(true);
            deps.rearm();
          }
        }
      }
      res.json({ code: 0, data: { scope, value, count: ids.length } });
    } catch (e) {
      logger?.error?.('保存续火发送对象失败:', e);
      res.status(500).json({ code: -1, message: '保存续火发送对象失败' });
    }
  });

  base.post(wrapPath('/xuhuo/prune'), async (req: Req, res: Res) => {
    try {
      const body = await readBody(req);
      const keep = Number(body?.keepDays);
      const result = pruneXuhuoState(Number.isFinite(keep) ? keep : 90);
      res.json({ code: 0, data: result });
    } catch (e) {
      logger?.error?.('清理续火状态失败:', e);
      res.status(500).json({ code: -1, message: '清理续火状态失败' });
    }
  });
}
