// ---------------------------------------------------------------------------
// 开关管理 · 复制选项 / 粘贴选项
// 可复制节点注册表 + 临时剪贴板（插件启动/重载时整体清空）
// 复制/粘贴一律沿用原有读写方式：整文件走 readA/writeA，键值走 readB/writeB，
// 源那边为空时用 deleteA/deleteKey 把目标对齐成同样的空，因此不会改动任何既有数据结构。
// ---------------------------------------------------------------------------

import fs from 'fs';
import path from 'path';

export type ClipScope = 'group' | 'friend';

/** 剪贴板根目录（相对插件数据目录）；重启/重载直接整体删除 */
export const CLIP_ROOT = '筱筱吖/临时数据/配置复制';

/** 剪贴板文件格式版本，结构变更时旧记录自动失效 */
export const CLIP_VERSION = 1;

const SCOPE_DIR_NAME: Record<ClipScope, string> = { group: '群聊', friend: '私聊' };

/** 未配置哨兵：区分「键不存在」与「值本身为空」 */
const UNSET = '__MK_CLIP_UNSET__';

/** 旧版娱乐总开关文件（键为群号 / 「私聊」） */
const ENT_MASTER_FILE = '筱筱吖/娱乐系统/深度娱乐/娱乐模式.json';

export type ClipEntryKind = 'file' | 'keys' | 'scoped' | 'member';

export type ClipEntry = {
  /** 条目稳定标识：粘贴时按槽名与剪贴板快照对齐 */
  槽: string;
  类型: ClipEntryKind;
  /** 目标文件（相对数据目录）；scoped / member 为固定共享文件 */
  文件: (id: string) => string;
  /** scoped 用：共享文件里代表该对象的键 */
  键?: (id: string) => string;
  /** keys 用：只搬白名单键，避开同文件内的运行时状态 */
  键白名单?: readonly string[];
};

export type ClipNode = {
  键: string;
  名称: string;
  说明: string;
  条目: readonly ClipEntry[];
};

function 整文件(文件: (id: string) => string, 槽 = 'main'): ClipEntry {
  return { 槽, 类型: 'file', 文件 };
}

/** 共享文件里以对象自身为键的单条配置 */
function 对象键(
  文件: string,
  槽 = 'scoped',
  键: (id: string) => string = (id) => id,
): ClipEntry {
  return { 槽, 类型: 'scoped', 文件: () => 文件, 键 };
}

/** 同一文件内只搬指定键（其余键多为运行时状态） */
function 指定键(文件: (id: string) => string, 键白名单: readonly string[], 槽 = 'keys'): ClipEntry {
  return { 槽, 类型: 'keys', 文件, 键白名单 };
}

/** JSON 数组名单里的成员身份（在 / 不在） */
function 名单成员(文件: string, 槽 = 'member'): ClipEntry {
  return { 槽, 类型: 'member', 文件: () => 文件 };
}

// ---------------------------------------------------------------------------
// 群聊可复制节点（id = 群号）
// ---------------------------------------------------------------------------

export const GROUP_CLIP_NODES: readonly ClipNode[] = [
  {
    键: 'ent-switches',
    名称: '娱乐管理开关',
    说明: '娱乐分项开关，含旧版总开关',
    条目: [
      整文件((id) => `筱筱吖/娱乐系统/娱乐开关/${id}.json`),
      对象键(ENT_MASTER_FILE, 'master'),
    ],
  },
  {
    键: 'event-switches',
    名称: '事件管理开关',
    说明: '30 项群事件开关',
    条目: [整文件((id) => `筱筱吖/事件系统/${id}.json`)],
  },
  {
    键: 'spam-flood',
    名称: '刷屏参数配置',
    说明: '短/长窗口、次数、禁言时长',
    条目: [整文件((id) => `筱筱吖/群管功能/刷屏检测/${id}.json`)],
  },
  {
    键: 'banned-words',
    名称: '违禁词数据',
    说明: '本群违禁词库',
    条目: [整文件((id) => `筱筱吖/群管系统/违禁系统/${id}/违禁词.json`)],
  },
  {
    键: 'banned-action',
    名称: '违禁处理方式',
    说明: '撤回 / 禁言与禁言时长',
    条目: [整文件((id) => `筱筱吖/群管系统/违禁系统/${id}/处理.json`)],
  },
  {
    键: 'forbid-media',
    名称: '禁发管理',
    说明: '图片/卡片/语音/视频/合并转发',
    条目: [整文件((id) => `筱筱吖/群管功能/违禁系统/${id}/禁发管理.json`)],
  },
  {
    键: 'speak-limit',
    名称: '发言限制',
    说明: '字数 / 行数 / 艾特上限',
    条目: [整文件((id) => `筱筱吖/群管功能/发言限制/${id}.json`)],
  },
  {
    键: 'blacklist',
    名称: '黑名单数据和配置',
    说明: '本群黑名单人员与处理方式',
    条目: [
      整文件((id) => `筱筱吖/群管系统/黑白名单/群聊/${id}/人员.json`, '人员'),
      整文件((id) => `筱筱吖/群管系统/黑白名单/群聊/${id}/处理方式.json`, '处理方式'),
    ],
  },
  {
    键: 'pardon',
    名称: '免死金牌',
    说明: '免死名单与管理员免死配置',
    条目: [
      整文件((id) => `筱筱吖/群管系统/免死金牌/${id}/人员.json`, '人员'),
      整文件((id) => `筱筱吖/群管系统/免死金牌/${id}/配置.json`, '配置'),
    ],
  },
  {
    键: 'join-audit',
    名称: '入群审核配置',
    说明: '条件/答案/次数/等级、条件库、过滤词、验证方式',
    条目: [
      整文件((id) => `筱筱吖/群管系统/入群审核/${id}/数据.json`, '数据'),
      整文件((id) => `筱筱吖/群管系统/入群审核/${id}/条件库.json`, '条件库'),
      整文件((id) => `筱筱吖/群管系统/入群审核/${id}/过滤库.json`, '过滤库'),
      指定键(
        (id) => `筱筱吖/群管系统/入群审核/${id}/次数.json`,
        ['可用次数', '可用时间', '验证方式'],
        '验证参数',
      ),
    ],
  },
  {
    键: 'join-welcome',
    名称: '入群欢迎词',
    说明: '本群欢迎语模板',
    条目: [整文件((id) => `筱筱吖/群管系统/入群欢迎词/${id}.json`)],
  },
  {
    键: 'leave-notify',
    名称: '退群通知模板',
    说明: '退群通报文案',
    条目: [整文件((id) => `筱筱吖/群管系统/退群通知模板/${id}.json`)],
  },
  {
    键: 'nickname-mask',
    名称: '马甲系统内容',
    说明: '群昵称马甲前缀',
    条目: [整文件((id) => `筱筱吖/群管系统/马甲系统/${id}.json`)],
  },
  {
    键: 'lock-name',
    名称: '锁名名单',
    说明: '个体锁定群名片名单',
    条目: [整文件((id) => `筱筱吖/群管系统/锁名系统/${id}/名单.json`)],
  },
  {
    键: 'ash-clean',
    名称: '清理骨灰标准',
    说明: '骨灰群员筛选秒数',
    条目: [整文件((id) => `筱筱吖/群管系统/清理骨灰/${id}/获取标准.json`)],
  },
  {
    键: 'hourly-chime',
    名称: '整点报时文案',
    说明: '本群整点报时内容',
    条目: [对象键('筱筱吖/扩展功能/整点报时/文案.txt')],
  },
  {
    键: 'join-pm',
    名称: '入群私聊配置',
    说明: '触发概率与私聊话术库',
    条目: [
      对象键('筱筱吖/扩展功能/入群私聊/概率.json', '概率'),
      整文件((id) => `筱筱吖/扩展功能/入群私聊/分群/${id}.json`, '话术'),
    ],
  },
  {
    键: 'invite-stat',
    名称: '邀人统计邀请官',
    说明: '本群邀请官名单',
    条目: [整文件((id) => `筱筱吖/扩展功能/邀人统计/${id}/邀请官.json`)],
  },
  {
    键: 'ai-voice',
    名称: 'AI 声聊模型',
    说明: '当前音色与可选模型列表',
    条目: [
      整文件((id) => `筱筱吖/扩展功能/AI声聊/${id}/正在使用.json`, '正在使用'),
      整文件((id) => `筱筱吖/扩展功能/AI声聊/${id}/模型列表.json`, '模型列表'),
    ],
  },
  {
    键: 'fake-chat',
    名称: '伪造聊天声明',
    说明: '伪造聊天末尾声明开关',
    条目: [整文件((id) => `筱筱吖/伪造聊天/${id}/声明.json`)],
  },
];

// ---------------------------------------------------------------------------
// 私聊可复制节点（id = 好友 QQ）
// 说明：娱乐开关与事件开关在私聊侧是全局共用一份（键固定为「私聊」）
// ---------------------------------------------------------------------------

export const FRIEND_CLIP_NODES: readonly ClipNode[] = [
  {
    键: 'ent-switches',
    名称: '娱乐管理开关',
    说明: '私聊娱乐分项开关（全局共用）',
    条目: [
      整文件(() => '筱筱吖/娱乐系统/娱乐开关/私聊.json'),
      对象键(ENT_MASTER_FILE, 'master', () => '私聊'),
    ],
  },
  {
    键: 'event-switches',
    名称: '事件管理开关',
    说明: '私聊事件开关（全局共用）',
    条目: [整文件(() => '筱筱吖/事件系统/私聊.json')],
  },
  {
    键: 'msg-record',
    名称: '消息记录开关',
    说明: '该好友私聊记录开关',
    条目: [对象键('筱筱吖/扩展功能/消息记录/好友开关.json')],
  },
  {
    键: 'auto-like',
    名称: '自动点赞开关',
    说明: '是否在自动点赞名单内',
    条目: [名单成员('筱筱吖/扩展功能/自动点赞/用户数据.json')],
  },
  {
    键: 'xuhuo-friend',
    名称: '好友续火开关',
    说明: '该好友续火开关',
    条目: [对象键('筱筱吖/扩展功能/续火功能/状态数据/好友/开关.json')],
  },
];

// ---------------------------------------------------------------------------
// 剪贴板快照
// ---------------------------------------------------------------------------

export type ClipSnapshotItem =
  | { 槽: string; 类型: 'file'; 存在: boolean; 内容: string }
  | { 槽: string; 类型: 'keys'; 值: Record<string, unknown>; 缺失: string[] }
  | { 槽: string; 类型: 'scoped'; 存在: boolean; 值: unknown }
  | { 槽: string; 类型: 'member'; 在列表: boolean };

export type ClipRecord = {
  版本: number;
  节点: string;
  名称: string;
  作用域: ClipScope;
  来源: string;
  时间: number;
  条目: ClipSnapshotItem[];
};

export type ClipDeps = {
  readA: (file: string) => string;
  writeA: (file: string, content: string) => boolean;
  readB: (file: string, key: string, def?: unknown) => unknown;
  writeB: (file: string, key: string, value: unknown) => boolean;
  /** 源那边没有的数据，粘贴时把目标一并清掉，保证目标与源一致 */
  deleteA: (file: string) => boolean;
  deleteKey: (file: string, key: string) => boolean;
};

export function clipNodes(scope: ClipScope): readonly ClipNode[] {
  return scope === 'friend' ? FRIEND_CLIP_NODES : GROUP_CLIP_NODES;
}

export function findClipNode(scope: ClipScope, 节点键: string): ClipNode | null {
  const k = String(节点键 || '').trim();
  return clipNodes(scope).find((n) => n.键 === k) ?? null;
}

export function clipScopeDir(scope: ClipScope): string {
  return `${CLIP_ROOT}/${SCOPE_DIR_NAME[scope]}`;
}

/** 每个节点一个文件，重复复制直接覆盖 */
export function clipRecordFile(scope: ClipScope, 节点键: string): string {
  return `${clipScopeDir(scope)}/${节点键}.json`;
}

function 读名单(文件: string, deps: ClipDeps): string[] {
  try {
    const raw = JSON.parse(deps.readA(文件) || '[]') as unknown;
    if (!Array.isArray(raw)) return [];
    return raw.map((x) => String(x).trim()).filter((x) => x !== '');
  } catch {
    return [];
  }
}

function 取快照(entry: ClipEntry, id: string, deps: ClipDeps): ClipSnapshotItem {
  const 文件 = entry.文件(id);
  if (entry.类型 === 'file') {
    const 内容 = deps.readA(文件);
    return { 槽: entry.槽, 类型: 'file', 存在: 内容 !== '', 内容 };
  }
  if (entry.类型 === 'keys') {
    const 值: Record<string, unknown> = {};
    const 缺失: string[] = [];
    for (const k of entry.键白名单 ?? []) {
      const v = deps.readB(文件, k, UNSET);
      if (v !== UNSET) 值[k] = v;
      else 缺失.push(k);
    }
    return { 槽: entry.槽, 类型: 'keys', 值, 缺失 };
  }
  if (entry.类型 === 'scoped') {
    const 键 = entry.键 ? entry.键(id) : id;
    const v = deps.readB(文件, 键, UNSET);
    return { 槽: entry.槽, 类型: 'scoped', 存在: v !== UNSET, 值: v === UNSET ? null : v };
  }
  return { 槽: entry.槽, 类型: 'member', 在列表: 读名单(文件, deps).includes(id) };
}

function 条目有数据(item: ClipSnapshotItem): boolean {
  if (item.类型 === 'file') return item.存在;
  if (item.类型 === 'keys') return Object.keys(item.值).length > 0;
  if (item.类型 === 'scoped') return item.存在;
  // 名单成员：在 / 不在都是有效状态，均可复制
  return true;
}

// ---------------------------------------------------------------------------
// 复制 / 粘贴
// ---------------------------------------------------------------------------

export type ClipCopyResult = { ok: boolean; 空: boolean; 条目数: number };

/**
 * 复制单个节点到剪贴板。
 * 源当前没有任何数据也照样记录（记为空配置），粘贴时会把目标一起对齐成空，
 * 这样「复制」按钮不会因为源是新对象而变成不可点。
 */
export function copyClipNode(
  scope: ClipScope,
  id: string,
  node: ClipNode,
  deps: ClipDeps,
): ClipCopyResult {
  const 条目 = node.条目.map((e) => 取快照(e, id, deps));
  const 有效 = 条目.filter((x) => 条目有数据(x));
  const record: ClipRecord = {
    版本: CLIP_VERSION,
    节点: node.键,
    名称: node.名称,
    作用域: scope,
    来源: id,
    时间: Math.floor(Date.now() / 1000),
    条目,
  };
  const ok = deps.writeA(clipRecordFile(scope, node.键), JSON.stringify(record, null, 2));
  return { ok, 空: 有效.length === 0, 条目数: 有效.length };
}

export function readClipRecord(scope: ClipScope, 节点键: string, deps: ClipDeps): ClipRecord | null {
  const raw = deps.readA(clipRecordFile(scope, 节点键));
  if (!raw) return null;
  try {
    const rec = JSON.parse(raw) as ClipRecord;
    if (!rec || typeof rec !== 'object') return null;
    if (Number(rec.版本) !== CLIP_VERSION) return null;
    if (rec.节点 !== 节点键 || rec.作用域 !== scope) return null;
    if (!Array.isArray(rec.条目)) return null;
    return rec;
  } catch {
    return null;
  }
}

export type ClipPasteResult = { ok: boolean; 原因?: string; 写入: number; 清空: number };

/**
 * 把剪贴板记录写回目标对象；按槽名对齐。
 * 源那边有数据就写入，源那边是空的就把目标同一处清掉，最终目标与源一致。
 */
export function pasteClipNode(
  scope: ClipScope,
  id: string,
  node: ClipNode,
  deps: ClipDeps,
): ClipPasteResult {
  const rec = readClipRecord(scope, node.键, deps);
  if (!rec) return { ok: false, 原因: '无复制记录', 写入: 0, 清空: 0 };
  let 写入 = 0;
  let 清空 = 0;
  for (const entry of node.条目) {
    const item = rec.条目.find((x) => x && x.槽 === entry.槽 && x.类型 === entry.类型);
    if (!item) continue;
    const 文件 = entry.文件(id);
    if (item.类型 === 'file') {
      if (item.存在) {
        if (deps.writeA(文件, String(item.内容 ?? ''))) 写入 += 1;
      } else {
        deps.deleteA(文件);
        清空 += 1;
      }
    } else if (item.类型 === 'keys') {
      const 白名单 = entry.键白名单 ?? [];
      for (const [k, v] of Object.entries(item.值 ?? {})) {
        if (!白名单.includes(k)) continue;
        if (deps.writeB(文件, k, v)) 写入 += 1;
      }
      for (const k of item.缺失 ?? []) {
        if (!白名单.includes(k)) continue;
        deps.deleteKey(文件, k);
        清空 += 1;
      }
    } else if (item.类型 === 'scoped') {
      const 键 = entry.键 ? entry.键(id) : id;
      if (item.存在) {
        if (deps.writeB(文件, 键, item.值)) 写入 += 1;
      } else {
        deps.deleteKey(文件, 键);
        清空 += 1;
      }
    } else {
      const 名单 = 读名单(文件, deps);
      const 已在 = 名单.includes(id);
      if (item.在列表 && !已在) 名单.push(id);
      const 下一步 = item.在列表 ? 名单 : 名单.filter((x) => x !== id);
      if (已在 !== item.在列表) deps.writeA(文件, JSON.stringify(下一步, null, 2));
      写入 += 1;
    }
  }
  if (写入 === 0 && 清空 === 0) return { ok: false, 原因: '记录里没有可对齐的数据', 写入: 0, 清空: 0 };
  return { ok: true, 写入, 清空 };
}

// ---------------------------------------------------------------------------
// 状态列表与清理
// ---------------------------------------------------------------------------

export type ClipNodeState = {
  键: string;
  名称: string;
  说明: string;
  /** 当前对象是否已有数据；没有数据也能复制，只是复制出来的是空配置 */
  有数据: boolean;
  /** 剪贴板是否已有该节点记录（决定粘贴能否点击） */
  已复制: boolean;
  /** 记录本身是空配置，粘贴会把目标同一处清空 */
  记录为空: boolean;
  来源: string;
  时间: number;
  /** 记录来源就是当前对象 */
  同源: boolean;
};

/** 记录里一条有效数据都没有 */
export function clipRecordEmpty(rec: ClipRecord | null): boolean {
  if (!rec || !Array.isArray(rec.条目)) return true;
  return !rec.条目.some((x) => x && 条目有数据(x));
}

export function clipNodeStates(scope: ClipScope, id: string, deps: ClipDeps): ClipNodeState[] {
  return clipNodes(scope).map((node) => {
    const 快照 = node.条目.map((e) => 取快照(e, id, deps));
    const rec = readClipRecord(scope, node.键, deps);
    return {
      键: node.键,
      名称: node.名称,
      说明: node.说明,
      有数据: 快照.some((x) => 条目有数据(x)),
      已复制: Boolean(rec),
      记录为空: Boolean(rec) && clipRecordEmpty(rec),
      来源: rec ? String(rec.来源 ?? '') : '',
      时间: rec ? Number(rec.时间 ?? 0) : 0,
      同源: Boolean(rec) && String(rec?.来源 ?? '') === String(id),
    };
  });
}

/** 插件启动 / 重载时整体清空剪贴板目录，返回删除的记录文件数 */
export function clearConfigClipboard(dataPath: string): number {
  const root = String(dataPath || '').trim();
  if (!root) return 0;
  const abs = path.join(root, CLIP_ROOT);
  let 计数 = 0;
  try {
    if (!fs.existsSync(abs)) return 0;
    for (const scope of Object.values(SCOPE_DIR_NAME)) {
      const dir = path.join(abs, scope);
      if (!fs.existsSync(dir)) continue;
      计数 += fs.readdirSync(dir).filter((n) => n.toLowerCase().endsWith('.json')).length;
    }
    fs.rmSync(abs, { recursive: true, force: true });
  } catch {
    return 计数;
  }
  return 计数;
}