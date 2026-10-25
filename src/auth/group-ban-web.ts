// @ts-nocheck
// ---------------------------------------------------------------------------
// 单群违禁词 — WebUI API
//   · 与「全局违禁」互补：这里管理某一个群的词库 / 处理方式 / 禁发 / 事件开关
//   · 数据路径与指令层完全一致（指令改完后台能看到，后台改完指令也生效）
//      模糊词库: 筱筱吖/群管系统/违禁系统/{gid}/违禁词.json        (string[]，包含匹配)
//      精准词库: 筱筱吖/群管系统/违禁系统/{gid}/精准违禁词.json    (string[]，完全匹配)
//      处理    : 筱筱吖/群管系统/违禁系统/{gid}/处理.json          (方式 / 时长)
//      禁发    : 筱筱吖/群管功能/违禁系统/{gid}/禁发管理.json      (image/video/record/json/xml/forward)
//      事件    : 筱筱吖/事件系统/{gid}.json                        (违禁检测 / 进阶检测)
// ---------------------------------------------------------------------------

type Logger = { error?: (...args: unknown[]) => void; info?: (...args: unknown[]) => void };

const PUNISH_MODES = new Set(['撤回', '禁言', '撤回禁言']);
const BAN_DURATION_MAX = 2592000; // 30 天，与指令层 clamp 保持一致
const BAN_DURATION_DEFAULT = 600;

/** 禁发类型 → 存进禁发管理.json 的键（与 mkbot-core 的 类型映射 一致） */
const FORBID_KEYS = new Set(['image', 'video', 'record', 'json', 'xml', 'forward']);
/** 本群事件里与违禁直接相关的两个开关 */
const EVENT_KEYS = new Set(['违禁检测', '进阶检测']);

/** 模糊词库（包含匹配）—— 与指令层「违禁词.json」同一份数据 */
function fuzzyWordsFile(gid: string): string {
  return `筱筱吖/群管系统/违禁系统/${gid}/违禁词.json`;
}
/** 精准词库（完全匹配）—— 与指令层「精准违禁词.json」同一份数据 */
function exactWordsFile(gid: string): string {
  return `筱筱吖/群管系统/违禁系统/${gid}/精准违禁词.json`;
}
/** kind('exact' | 'fuzzy') → 词库文件；缺省按模糊，与指令层默认行为一致 */
function wordsPathOf(gid: string, kind: unknown): string {
  return String(kind ?? '').trim() === 'exact' ? exactWordsFile(gid) : fuzzyWordsFile(gid);
}
function punishFile(gid: string): string {
  return `筱筱吖/群管系统/违禁系统/${gid}/处理.json`;
}
function forbidFile(gid: string): string {
  return `筱筱吖/群管功能/违禁系统/${gid}/禁发管理.json`;
}
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

/** 读某个词库文件（整数组），并清洗历史脏数据（空串 / 非字符串项） */
function readWordsAt(readA: (file: string) => string, file: string): string[] {
  try {
    const raw = JSON.parse(readA(file) || '[]');
    if (!Array.isArray(raw)) return [];
    return raw.filter((item) => typeof item === 'string' && item.trim() !== '');
  } catch {
    return [];
  }
}

function readPunish(readB: (file: string, key: string, def?: unknown) => unknown, gid: string) {
  const 方式Raw = String(readB(punishFile(gid), '方式', '撤回') ?? '撤回');
  const dur = Number(readB(punishFile(gid), '时长', BAN_DURATION_DEFAULT));
  return {
    方式: PUNISH_MODES.has(方式Raw) ? 方式Raw : '撤回',
    时长: Number.isFinite(dur) && dur > 0 ? Math.min(Math.floor(dur), BAN_DURATION_MAX) : BAN_DURATION_DEFAULT,
  };
}

function readForbid(readB: (file: string, key: string, def?: unknown) => unknown, gid: string) {
  const out: Record<string, string> = {};
  for (const key of FORBID_KEYS) {
    out[key] = readB(forbidFile(gid), key, '关闭') === '开启' ? '开启' : '关闭';
  }
  return out;
}

function readEvents(readB: (file: string, key: string, def?: unknown) => unknown, gid: string) {
  const out: Record<string, string> = {};
  for (const key of EVENT_KEYS) {
    out[key] = readB(eventFile(gid), key, '关闭') === '开启' ? '开启' : '关闭';
  }
  return out;
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
export function registerGroupBanWebGetRoutes(
  base: { get: (path: string, handler: (...args: unknown[]) => unknown) => void },
  wrapPath: (p: string) => string,
  deps: {
    readA: (file: string) => string;
    readB: (file: string, key: string, def?: unknown) => unknown;
  },
  logger?: Logger,
): void {
  // 群列表摘要：批量返回每个群的词库数量 + 两个事件开关状态
  base.get(wrapPath('/group-ban/summary'), (req, res) => {
    try {
      const q = (req as { query?: Record<string, unknown> })?.query || {};
      const rawIds = String(q.ids ?? '').trim();
      const ids = rawIds
        ? rawIds.split(',').map((s) => normalizeGroupId(s)).filter((s): s is string => !!s)
        : [];
      const groups: Record<string, { fuzzy: number; exact: number; words: number; detect: string; advanced: string }> = {};
      for (const gid of ids) {
        const fuzzy = readWordsAt(deps.readA, fuzzyWordsFile(gid)).length;
        const exact = readWordsAt(deps.readA, exactWordsFile(gid)).length;
        groups[gid] = {
          fuzzy,
          exact,
          words: fuzzy + exact,
          detect: readEvents(deps.readB, gid)['违禁检测'],
          advanced: readEvents(deps.readB, gid)['进阶检测'],
        };
      }
      jsonOk(res, { groups });
    } catch (e) {
      logger?.error?.('[单群违禁] 读取群摘要失败:', e);
      jsonErr(res, 500, '读取单群违禁摘要失败');
    }
  });

  // 单个群的完整配置：词库 + 处理方式 + 禁发 + 事件开关
  base.get(wrapPath('/group-ban/config'), (req, res) => {
    try {
      const q = (req as { query?: Record<string, unknown> })?.query || {};
      const gid = normalizeGroupId(q.group_id);
      if (!gid) {
        jsonErr(res, 400, 'group_id_invalid');
        return;
      }
      jsonOk(res, {
        group_id: gid,
        words: readWordsAt(deps.readA, fuzzyWordsFile(gid)),
        exactWords: readWordsAt(deps.readA, exactWordsFile(gid)),
        punish: readPunish(deps.readB, gid),
        forbid: readForbid(deps.readB, gid),
        events: readEvents(deps.readB, gid),
      });
    } catch (e) {
      logger?.error?.('[单群违禁] 读取群配置失败:', e);
      jsonErr(res, 500, '读取单群违禁配置失败');
    }
  });
}

// ================== POST 路由 ==================
export function registerGroupBanWebPostRoutes(
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

  // 词库增 / 删 / 清空
  base.post(wrapPath('/group-ban/words'), async (req, res) => {
    try {
      const body = await parsePostBody(req as Parameters<typeof parsePostBody>[0]);
      const gid = normalizeGroupId(body.group_id);
      if (!gid) {
        jsonErr(res, 400, 'group_id_invalid');
        return;
      }
      const action = String(body.action ?? '').trim();
      const kind = String(body.kind ?? 'fuzzy').trim() === 'exact' ? 'exact' : 'fuzzy';
      const file = wordsPathOf(gid, kind);
      let words = readWordsAt(deps.readA, file);

      if (action === 'clear') {
        deps.writeA(file, '[]');
        jsonOk(res, { kind, words: [] });
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

      deps.writeA(file, JSON.stringify(words));
      jsonOk(res, { kind, words });
    } catch (e) {
      logger?.error?.('[单群违禁] 词库写入失败:', e);
      jsonErr(res, 500, '写入单群违禁词失败');
    }
  });

  // 处理方式（方式 + 禁言时长）
  base.post(wrapPath('/group-ban/punish'), async (req, res) => {
    try {
      const body = await parsePostBody(req as Parameters<typeof parsePostBody>[0]);
      const gid = normalizeGroupId(body.group_id);
      if (!gid) {
        jsonErr(res, 400, 'group_id_invalid');
        return;
      }
      if ('方式' in body) {
        const mode = String(body['方式'] ?? '').trim();
        if (!PUNISH_MODES.has(mode)) {
          jsonErr(res, 400, '方式_invalid');
          return;
        }
        deps.writeB(punishFile(gid), '方式', mode);
      }
      if ('时长' in body) {
        const dur = Number(body['时长']);
        if (!Number.isFinite(dur) || dur <= 0) {
          jsonErr(res, 400, '时长_invalid');
          return;
        }
        deps.writeB(punishFile(gid), '时长', Math.min(Math.floor(dur), BAN_DURATION_MAX));
      }
      jsonOk(res, { punish: readPunish(deps.readB, gid) });
    } catch (e) {
      logger?.error?.('[单群违禁] 处理方式写入失败:', e);
      jsonErr(res, 500, '写入单群违禁处理方式失败');
    }
  });

  // 禁发管理（按消息类型：image/video/record/json/xml/forward）
  base.post(wrapPath('/group-ban/forbid'), async (req, res) => {
    try {
      const body = await parsePostBody(req as Parameters<typeof parsePostBody>[0]);
      const gid = normalizeGroupId(body.group_id);
      if (!gid) {
        jsonErr(res, 400, 'group_id_invalid');
        return;
      }
      const keysRaw = Array.isArray(body.keys) ? body.keys : (body.key != null ? [body.key] : []);
      const keys = keysRaw.map((k) => String(k ?? '').trim()).filter((k) => FORBID_KEYS.has(k));
      if (!keys.length) {
        jsonErr(res, 400, 'key_invalid');
        return;
      }
      const status = normalizeOnOff(body.enabled);
      if (!status) {
        jsonErr(res, 400, 'enabled_required');
        return;
      }
      for (const key of keys) {
        deps.writeB(forbidFile(gid), key, status);
      }
      jsonOk(res, { forbid: readForbid(deps.readB, gid) });
    } catch (e) {
      logger?.error?.('[单群违禁] 禁发写入失败:', e);
      jsonErr(res, 500, '写入单群禁发失败');
    }
  });

  // 事件开关（违禁检测 / 进阶检测）
  base.post(wrapPath('/group-ban/events'), async (req, res) => {
    try {
      const body = await parsePostBody(req as Parameters<typeof parsePostBody>[0]);
      const gid = normalizeGroupId(body.group_id);
      if (!gid) {
        jsonErr(res, 400, 'group_id_invalid');
        return;
      }
      const key = String(body.key ?? '').trim();
      if (!EVENT_KEYS.has(key)) {
        jsonErr(res, 400, 'key_invalid');
        return;
      }
      const status = normalizeOnOff(body.enabled);
      if (!status) {
        jsonErr(res, 400, 'enabled_required');
        return;
      }
      deps.writeB(eventFile(gid), key, status);
      jsonOk(res, { events: readEvents(deps.readB, gid) });
    } catch (e) {
      logger?.error?.('[单群违禁] 事件开关写入失败:', e);
      jsonErr(res, 500, '写入单群违禁事件开关失败');
    }
  });
}
