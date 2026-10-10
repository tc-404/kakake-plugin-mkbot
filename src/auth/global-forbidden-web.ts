// @ts-nocheck
// ---------------------------------------------------------------------------
// 全局违禁词库 — WebUI API
//   · 词库 / 惩罚配置仅后台可维护（指令层不提供增删查）
//   · 按群两个独立开关：
//       开关B「启用群」   → 该群是否参与全局违禁词匹配
//       开关A「跟随惩罚」 → 命中全局词后用全局惩罚配置还是本群 处理.json
// ---------------------------------------------------------------------------

type Logger = { error?: (...args: unknown[]) => void; info?: (...args: unknown[]) => void };

// ================== 数据路径（全部落在全局违禁词路径下） ==================
export const GLOBAL_FORBIDDEN_WORDS_FILE = '筱筱吖/群管系统/违禁系统/全局/违禁词.json';
export const GLOBAL_FORBIDDEN_PUNISH_FILE = '筱筱吖/群管系统/违禁系统/全局/处理.json';
export const GLOBAL_FORBIDDEN_ENABLE_FILE = '筱筱吖/群管系统/违禁系统/全局/启用群.json';
export const GLOBAL_FORBIDDEN_FOLLOW_FILE = '筱筱吖/群管系统/违禁系统/全局/跟随惩罚.json';

const KICK_MODES = new Set(['黑踢', '普通']);
const BAN_DURATION_MAX = 2592000; // 30 天

function eventFile(gid: string): string {
  return `筱筱吖/事件系统/${gid}.json`;
}

function normalizeGroupId(raw: unknown): string | null {
  const s = String(raw ?? '').trim();
  return /^\d{5,12}$/.test(s) ? s : null;
}

function normalizeOnOff(raw: unknown): '开启' | '关闭' | null {
  if (raw === '开启' || raw === true || raw === 1 || raw === 'true' || raw === '1') return '开启';
  if (raw === '关闭' || raw === false || raw === 0 || raw === 'false' || raw === '0') return '关闭';
  return null;
}

/** 读整数组词库，并清洗历史脏数据（空串 / 非字符串项） */
function readWords(readA: (file: string) => string): string[] {
  try {
    const raw = JSON.parse(readA(GLOBAL_FORBIDDEN_WORDS_FILE) || '[]');
    if (!Array.isArray(raw)) return [];
    return raw.filter((item) => typeof item === 'string' && item.trim() !== '');
  } catch {
    return [];
  }
}

/** 读 JSON 对象型文件（启用群 / 跟随惩罚 的整表），失败回空对象 */
function readMap(readA: (file: string) => string, file: string): Record<string, string> {
  try {
    const raw = JSON.parse(readA(file) || '{}');
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
      if (v === '开启') out[String(k)] = '开启';
    }
    return out;
  } catch {
    return {};
  }
}

function readPunish(readB: (file: string, key: string, def?: unknown) => unknown) {
  const dur = Number(readB(GLOBAL_FORBIDDEN_PUNISH_FILE, '禁言时长', 600));
  const kick = String(readB(GLOBAL_FORBIDDEN_PUNISH_FILE, '踢出方式', '黑踢'));
  return {
    禁言: normalizeOnOff(readB(GLOBAL_FORBIDDEN_PUNISH_FILE, '禁言', '关闭')) || '关闭',
    撤回: normalizeOnOff(readB(GLOBAL_FORBIDDEN_PUNISH_FILE, '撤回', '关闭')) || '关闭',
    踢出: normalizeOnOff(readB(GLOBAL_FORBIDDEN_PUNISH_FILE, '踢出', '关闭')) || '关闭',
    禁言时长: Number.isFinite(dur) && dur > 0 ? Math.min(dur, BAN_DURATION_MAX) : 600,
    踢出方式: KICK_MODES.has(kick) ? kick : '黑踢',
  };
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

function jsonOk(res: unknown, data: unknown) {
  (res as { json: (o: unknown) => void }).json({ code: 0, data });
}
function jsonErr(res: unknown, status: number, message: string) {
  (res as { status: (n: number) => { json: (o: unknown) => void } }).status(status).json({ code: -1, message });
}

// ================== GET 路由 ==================
export function registerGlobalForbiddenWebGetRoutes(
  base: { get: (path: string, handler: (...args: unknown[]) => unknown) => void },
  wrapPath: (p: string) => string,
  deps: {
    readA: (file: string) => string;
    readB: (file: string, key: string, def?: unknown) => unknown;
  },
  logger?: Logger,
): void {
  // 词库 + 惩罚配置
  base.get(wrapPath('/global-ban/config'), (_req, res) => {
    try {
      jsonOk(res, { words: readWords(deps.readA), punish: readPunish(deps.readB) });
    } catch (e) {
      logger?.error?.('[全局违禁] 读取配置失败:', e);
      jsonErr(res, 500, '读取全局违禁配置失败');
    }
  });

  // 各群开关状态（enable=开关B，follow=开关A）
  base.get(wrapPath('/global-ban/groups'), (_req, res) => {
    try {
      jsonOk(res, {
        enable: readMap(deps.readA, GLOBAL_FORBIDDEN_ENABLE_FILE),
        follow: readMap(deps.readA, GLOBAL_FORBIDDEN_FOLLOW_FILE),
      });
    } catch (e) {
      logger?.error?.('[全局违禁] 读取群开关失败:', e);
      jsonErr(res, 500, '读取全局违禁群开关失败');
    }
  });
}

// ================== POST 路由 ==================
export function registerGlobalForbiddenWebPostRoutes(
  base: { post?: (path: string, handler: (...args: unknown[]) => unknown) => void },
  wrapPath: (p: string) => string,
  deps: {
    readA: (file: string) => string;
    writeA: (file: string, content: string) => void;
    readB: (file: string, key: string, def?: unknown) => unknown;
    writeB: (file: string, key: string, value: unknown) => void;
  },
  logger?: Logger,
): void {
  if (!base.post) return;

  // 词库增删清空
  base.post(wrapPath('/global-ban/words'), async (req, res) => {
    try {
      const body = await parsePostBody(req as Parameters<typeof parsePostBody>[0]);
      const action = String(body.action ?? '').trim();
      let words = readWords(deps.readA);

      if (action === 'clear') {
        deps.writeA(GLOBAL_FORBIDDEN_WORDS_FILE, '[]');
        jsonOk(res, { words: [] });
        return;
      }

      const word = String(body.word ?? '').trim();
      if (!word) {
        jsonErr(res, 400, '违禁词不能为空');
        return;
      }

      if (action === 'add') {
        if (!words.includes(word)) words.push(word);
      } else if (action === 'del') {
        words = words.filter((w) => w !== word);
      } else {
        jsonErr(res, 400, 'action_invalid');
        return;
      }

      deps.writeA(GLOBAL_FORBIDDEN_WORDS_FILE, JSON.stringify(words));
      jsonOk(res, { words });
    } catch (e) {
      logger?.error?.('[全局违禁] 词库写入失败:', e);
      jsonErr(res, 500, '写入全局违禁词失败');
    }
  });

  // 惩罚配置（多选 + 子项）
  base.post(wrapPath('/global-ban/punish'), async (req, res) => {
    try {
      const body = await parsePostBody(req as Parameters<typeof parsePostBody>[0]);

      for (const key of ['禁言', '撤回', '踢出']) {
        if (key in body) {
          const v = normalizeOnOff(body[key]);
          if (v) deps.writeB(GLOBAL_FORBIDDEN_PUNISH_FILE, key, v);
        }
      }
      if ('禁言时长' in body) {
        const dur = Number(body['禁言时长']);
        if (Number.isFinite(dur) && dur > 0) {
          deps.writeB(GLOBAL_FORBIDDEN_PUNISH_FILE, '禁言时长', Math.min(Math.floor(dur), BAN_DURATION_MAX));
        }
      }
      if ('踢出方式' in body) {
        const mode = String(body['踢出方式'] ?? '').trim();
        if (KICK_MODES.has(mode)) deps.writeB(GLOBAL_FORBIDDEN_PUNISH_FILE, '踢出方式', mode);
      }

      jsonOk(res, { punish: readPunish(deps.readB) });
    } catch (e) {
      logger?.error?.('[全局违禁] 惩罚配置写入失败:', e);
      jsonErr(res, 500, '写入全局违禁惩罚配置失败');
    }
  });

  // 开关B：本群是否启用全局违禁词匹配（开启时顺带开启 违禁检测 事件）
  base.post(wrapPath('/global-ban/group-enable'), async (req, res) => {
    try {
      const body = await parsePostBody(req as Parameters<typeof parsePostBody>[0]);
      const gid = normalizeGroupId(body.group_id);
      if (!gid) {
        jsonErr(res, 400, 'group_id_invalid');
        return;
      }
      const status = normalizeOnOff(body.enabled);
      if (!status) {
        jsonErr(res, 400, 'enabled_required');
        return;
      }
      deps.writeB(GLOBAL_FORBIDDEN_ENABLE_FILE, gid, status);

      // 开启全局匹配时，若该群「违禁检测」事件未开则顺带开启
      let 违禁检测联动 = false;
      if (status === '开启') {
        const cur = String(deps.readB(eventFile(gid), '违禁检测', '关闭'));
        if (cur !== '开启') {
          deps.writeB(eventFile(gid), '违禁检测', '开启');
          违禁检测联动 = true;
        }
      }
      jsonOk(res, { group_id: gid, enabled: status, 违禁检测联动 });
    } catch (e) {
      logger?.error?.('[全局违禁] 群启用开关写入失败:', e);
      jsonErr(res, 500, '写入全局违禁群启用开关失败');
    }
  });

  // 开关A：本群命中全局词后是否跟随全局惩罚机制
  base.post(wrapPath('/global-ban/group-follow'), async (req, res) => {
    try {
      const body = await parsePostBody(req as Parameters<typeof parsePostBody>[0]);
      const gid = normalizeGroupId(body.group_id);
      if (!gid) {
        jsonErr(res, 400, 'group_id_invalid');
        return;
      }
      const status = normalizeOnOff(body.enabled);
      if (!status) {
        jsonErr(res, 400, 'enabled_required');
        return;
      }
      deps.writeB(GLOBAL_FORBIDDEN_FOLLOW_FILE, gid, status);
      jsonOk(res, { group_id: gid, enabled: status });
    } catch (e) {
      logger?.error?.('[全局违禁] 群跟随惩罚开关写入失败:', e);
      jsonErr(res, 500, '写入全局违禁群跟随惩罚开关失败');
    }
  });
}
