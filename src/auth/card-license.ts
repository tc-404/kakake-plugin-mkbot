// ---------------------------------------------------------------------------
// 卡密 / 授权（从 mkbot-core 拆出）
// 由 mkbot-core 注入 readB/writeB/sendReply 等；Vite 与主入口打包为单文件 index.mjs。
// ---------------------------------------------------------------------------

import type {
  AuthRcStatus,
  CardKmPayload,
  CardLicenseDeps,
  KmDurationKind,
  LicenseGlobalState,
  MkMessageEvent,
  MkPluginContext,
  MkReadB,
  MkWriteB,
} from '../types';
import { 合并节点, 段_引用, 段_文本, 发合并消息, 发消息 } from '../BOT';
import { requireAuthorized, sendUnauthReplyIfEnabled } from '../lib/unauth-reply';

// ---------------------------------------------------------------------------
// 授权核心
// ---------------------------------------------------------------------------

export const licenseGlobalStatus: LicenseGlobalState = { RC_sq: '未授权' };

export async function checkAuthStatusImpl(
  readB: MkReadB,
  writeB: MkWriteB,
  event: MkMessageEvent
): Promise<AuthRcStatus> {
  const 绕过状态 = readB('config.json', '绕过授权', false);
  if (绕过状态 === true) {
    licenseGlobalStatus.RC_sq = '已授权';
    return '已授权';
  }

  let dir_wj_time = '';
  if (event.group_id !== undefined && event.group_id !== null) {
    dir_wj_time = `筱筱吖/授权系统/授权信息/${event.group_id}.json`;
  } else {
    dir_wj_time = '筱筱吖/授权系统/授权信息/私聊.json';
  }

  const xz_time = Math.floor(Date.now() / 1000);
  const wj_time = Number(readB(dir_wj_time, '授权时间', 0));
  const wj_km_time = Number(readB(dir_wj_time, '卡密时长', 0));
  const jjjj = xz_time - wj_time;
  let 授权状态: AuthRcStatus = '未授权';

  if (wj_time === 0 || wj_km_time === 0) {
    授权状态 = '未授权';
  } else if (jjjj > wj_km_time) {
    授权状态 = '未授权';
    writeB(dir_wj_time, '授权时间', 0);
    writeB(dir_wj_time, '卡密时长', 0);
  } else {
    授权状态 = '已授权';
  }

  licenseGlobalStatus.RC_sq = 授权状态;
  return 授权状态;
}

export function getAuthStatus(): AuthRcStatus {
  return licenseGlobalStatus.RC_sq;
}

export function setAuthStatus(status: AuthRcStatus): void {
  licenseGlobalStatus.RC_sq = status;
}

// ---------------------------------------------------------------------------
// 授权检测（群）
// ---------------------------------------------------------------------------

export async function checkGroupAuthImpl(
  readB: MkReadB,
  writeB: MkWriteB,
  groupId: string | number,
  event: MkMessageEvent,
  needReply = true
): Promise<boolean> {
  const dir_wj_time = `筱筱吖/授权系统/授权信息/${groupId}.json`;

  const xz_time = Math.floor(Date.now() / 1000);
  const wj_time = Number(readB(dir_wj_time, '授权时间', 0));
  const wj_km_time = Number(readB(dir_wj_time, '卡密时长', 0));
  const jjjj = xz_time - wj_time;

  let isAuthed = false;

  if (wj_time !== 0 && wj_km_time !== 0 && jjjj <= wj_km_time) {
    isAuthed = true;
  } else if (jjjj > wj_km_time) {
    writeB(dir_wj_time, '授权时间', 0);
    writeB(dir_wj_time, '卡密时长', 0);
  }

  if (!isAuthed && needReply) {
    await sendUnauthReplyIfEnabled(event, readB);
  }

  return isAuthed;
}

// ---------------------------------------------------------------------------
// 卡密时长（秒）
// ---------------------------------------------------------------------------

const KM_TIME_TABLE: Record<KmDurationKind, number> = {
  天: 86400,
  周: 604800,
  月: 2678400,
  半年: 15724800,
  年: 31622400,
  永久: 311040000,
};

function isKmKind(s: string): s is KmDurationKind {
  return s in KM_TIME_TABLE;
}

// ---------------------------------------------------------------------------
// 指令路由（卡密生成、使用、列表、取消授权等；返回 true 表示已消费指令）
// ---------------------------------------------------------------------------

export async function handleCardLicenseCommands(
  message: string,
  event: MkMessageEvent,
  ctx: MkPluginContext,
  d: CardLicenseDeps
): Promise<boolean> {
  const { readB, writeB, readA, writeA, deleteKey, timeA, timeB, rand, checkOwner3 } =
    d;

  const authJudge = message.match(/^授权判断([0-9]+|)$/);
  if (authJudge) {
    let 来源 = '未知';
    let dir_wj_time = '';
    const two_km = authJudge[1] ?? '';
    if (event.message_type === 'group' && two_km === '') {
      来源 = `群聊(${event.group_id})`;
      dir_wj_time = `筱筱吖/授权系统/授权信息/${event.group_id}.json`;
    } else if (event.message_type !== 'group' && two_km === '') {
      来源 = '私聊';
      dir_wj_time = '筱筱吖/授权系统/授权信息/私聊.json';
    } else if (two_km !== '') {
      来源 = `群聊(${two_km})`;
      dir_wj_time = `筱筱吖/授权系统/授权信息/${two_km}.json`;
    } else {
      await 发消息(event, [段_引用(event.message_id), 段_文本('出现未知类型报错')]);
      return true;
    }

    const xz_time = Math.floor(Date.now() / 1000);
    const wj_time = Number(readB(dir_wj_time, '授权时间', 0));
    const wj_km_time = Number(readB(dir_wj_time, '卡密时长', 0));
    const jjjj = xz_time - wj_time;

    if (jjjj < wj_km_time) {
      const scsq_time = timeA('y-m-d H:i:s', wj_time);
      const sysc_time = timeB('d天H时i分s秒', wj_km_time - jjjj);
      const expireDateStr = timeA('y-m-d H:i:s', wj_time + wj_km_time);
      let 组装消息 = `${来源} - 授权数据`;
      组装消息 += `\n══════════════`;
      组装消息 += `\n[授权时间]:${scsq_time}`;
      组装消息 += `\n[剩余时长]:${sysc_time}`;
      组装消息 += `\n[到期时间]:${expireDateStr}`;
      组装消息 += `\n══════════════`;
      await 发消息(event, [段_引用(event.message_id), 段_文本(组装消息)]);
    } else {
      const scsq_time = timeA('y-m-d H:i:s', wj_time);
      const expireDateStr = timeA('y-m-d H:i:s', wj_time + wj_km_time);
      let 组装消息 = `${来源} - 授权数据`;
      组装消息 += `\n══════════════`;
      组装消息 += `\n[授权时间]:${scsq_time}`;
      组装消息 += `\n[到期时间]:${expireDateStr}`;
      组装消息 += `\n══════════════`;
      await 发消息(event, [段_引用(event.message_id), 段_文本(组装消息)]);
    }
    return true;
  }

  if (message === '授权系统') {
    let 返回内容1 = '用户指令:';
    返回内容1 += `\n══════════════`;
    返回内容1 += `\n授权判断`;
    返回内容1 += `\n授权判断[群号]`;
    返回内容1 += `\n使用卡密[卡密]`;
    返回内容1 += `\n══════════════`;
    let 返回内容2 = '后台指令:';
    返回内容2 += `\n══════════════`;
    返回内容2 += `\n - 单次生成`;
    返回内容2 += `\n生成天卡授权  生`;
    返回内容2 += `\n生成周卡授权  成`;
    返回内容2 += `\n生成月卡授权  卡`;
    返回内容2 += `\n生成半年授权  密`;
    返回内容2 += `\n生成年卡授权  授`;
    返回内容2 += `\n生成永久授权  权`;
    返回内容2 += `\n - 批量生成`;
    返回内容2 += `\n生成天卡授权[数量]  批`;
    返回内容2 += `\n生成周卡授权[数量]  量`;
    返回内容2 += `\n生成月卡授权[数量]  生`;
    返回内容2 += `\n生成半年授权[数量]  成`;
    返回内容2 += `\n生成年卡授权[数量]  授`;
    返回内容2 += `\n生成永久授权[数量]  权`;
    返回内容2 += `\n`;
    返回内容2 += `\n - 添加到当前群聊`;
    返回内容2 += `\n添加天卡授权  添`;
    返回内容2 += `\n添加周卡授权  加`;
    返回内容2 += `\n添加月卡授权  本`;
    返回内容2 += `\n添加半年授权  群`;
    返回内容2 += `\n添加年卡授权  授`;
    返回内容2 += `\n添加永久授权  权`;
    返回内容2 += `\n - 添加到指定群聊`;
    返回内容2 += `\n添加天卡授权[群号]  跨`;
    返回内容2 += `\n添加周卡授权[群号]  群`;
    返回内容2 += `\n添加月卡授权[群号]  添`;
    返回内容2 += `\n添加半年授权[群号]  加`;
    返回内容2 += `\n添加年卡授权[群号]  授`;
    返回内容2 += `\n添加永久授权[群号]  权`;
    返回内容2 += `\n`;
    返回内容2 += `\n - 看列表的`;
    返回内容2 += `\n卡密列表`;
    返回内容2 += `\n`;
    返回内容2 += `\n - 删除卡密`;
    返回内容2 += `\n删除卡密[卡密]`;
    返回内容2 += `\n清空全部`;
    返回内容2 += `\n`;
    返回内容2 += `\n - 取消授权`;
    返回内容2 += `\n删除授权`;
    返回内容2 += `\n删除授权[群号]`;
    返回内容2 += `\n══════════════`;
    let 返回内容3 = `后记:`;
    返回内容3 += `\n - 该授权为插件授权`;
    返回内容3 += `\n - 仅适用于MK插件`;
    返回内容3 += `\n - 授权时间数据纯本地文件的`;
    返回内容3 += `\n - 不需要授权系统的可以在后台开启「绕过授权」`;
    const messages = [
      合并节点('[授权系统]', event.self_id, [段_文本(返回内容1)]),
      合并节点('[授权系统]', event.self_id, [段_文本(返回内容2)]),
      合并节点('[授权系统]', event.self_id, [段_文本(返回内容3)]),
    ];
    await 发合并消息(event, messages);
    return true;
  }

  const genMatch = message.match(/^生成(天|周|月|半年|年|永久)(卡|)授权([0-9]+|)$/);
  if (genMatch) {
    if (!(await checkOwner3(event, ctx, false, false))) return true;

    const one_km = genMatch[1] as string;
    const countRaw = genMatch[3] ?? '';
    const two_km = countRaw === '' ? 1 : Number(countRaw);

    if (two_km <= 0 || two_km >= 101) {
      await 发消息(event, [段_引用(event.message_id), 段_文本('请正常给我参数哦～')]);
      return true;
    }

    if (!isKmKind(one_km)) {
      await 发消息(event, [段_引用(event.message_id), 段_文本('请正常给我参数哦～')]);
      return true;
    }

    const km_time = KM_TIME_TABLE[one_km];

    let 循环次数 = two_km;
    let 本次序号 = 0;
    let 组装消息 = `已生成【${循环次数}】张【${one_km}卡】`;
    for (let i = 0; i < 循环次数; i++) {
      本次序号 = i + 1;
      const km_key = `MK${rand(100000, 999999)}${Math.floor(Date.now() / 1000)}`;
      const 内容: CardKmPayload = { 类型: one_km, 时长: km_time };
      writeB('筱筱吖/授权系统/卡密管理/卡密数据.json', km_key, 内容);
      组装消息 += `\n【${本次序号}】${km_key}`;
    }

    await 发消息(event, [段_引用(event.message_id), 段_文本('已发给你的私聊啦，请查收～')]);
    const fakeEvent: MkMessageEvent = {
      message_type: 'private',
      user_id: event.user_id,
    };
    if (循环次数 > 10) {
      await 发合并消息(fakeEvent, [合并节点('[新的卡密]', event.self_id, [段_文本(组装消息)])]);
    } else {
      await 发消息(fakeEvent, [段_文本(组装消息)]);
    }
    return true;
  }

  const addMatch = message.match(/^添加(天|周|月|半年|年|永久)(卡|)授权([0-9]+|)$/);
  if (addMatch) {
    if (!(await checkOwner3(event, ctx, false, false))) return true;

    const one_km = addMatch[1] as string;
    const two_km = addMatch[3] ?? '';

    let dir_wj_time = '';
    if (event.message_type === 'group' && two_km === '') {
      dir_wj_time = `筱筱吖/授权系统/授权信息/${event.group_id}.json`;
    } else if (event.message_type !== 'group' && two_km === '') {
      dir_wj_time = '筱筱吖/授权系统/授权信息/私聊.json';
    } else if (two_km !== '') {
      dir_wj_time = `筱筱吖/授权系统/授权信息/${two_km}.json`;
    } else {
      await 发消息(event, [段_引用(event.message_id), 段_文本('出现未知类型报错')]);
      return true;
    }

    const xz_time = Math.floor(Date.now() / 1000);
    const wj_time = Number(readB(dir_wj_time, '授权时间', 0));
    const wj_km_time = Number(readB(dir_wj_time, '卡密时长', 0));
    const jjjj = xz_time - wj_time;

    if (!isKmKind(one_km)) {
      await 发消息(event, [段_引用(event.message_id), 段_文本('出现未知类型报错')]);
      return true;
    }
    const km_time = KM_TIME_TABLE[one_km];

    let 添加方式 = '';
    let extime = 0;
    if (jjjj > wj_km_time) {
      添加方式 = '重新添加授权';
      extime = xz_time + km_time;
      writeB(dir_wj_time, '授权时间', xz_time);
      writeB(dir_wj_time, '卡密时长', km_time);
    } else {
      添加方式 = '续期卡密时长';
      extime = xz_time + km_time + wj_km_time;
      writeB(dir_wj_time, '卡密时长', km_time + wj_km_time);
    }

    const expireDateStr = timeA('y-m-d H:i:s', extime);
    let 组装消息 = ``;
    组装消息 += `══════════════`;
    组装消息 += `\n已${添加方式}`;
    组装消息 += `\n[卡密类型]:${one_km}卡`;
    组装消息 += `\n[新增时长]:${km_time}秒`;
    组装消息 += `\n[到期时间]:${expireDateStr}`;
    组装消息 += `\n══════════════`;
    await 发消息(event, [段_引用(event.message_id), 段_文本(组装消息)]);
    return true;
  }

  const useMatch = message.match(/^使用卡密([\s\S]*)$/);
  if (useMatch) {
    const one_km = useMatch[1] ?? '';

    const raw = readB('筱筱吖/授权系统/卡密管理/卡密数据.json', one_km, {}) as Record<string, unknown>;
    const data = raw as CardKmPayload;
    const 卡密类型 = data.类型;
    const 卡密时长 = typeof data.时长 === 'number' ? data.时长 : Number(data.时长);

    if (卡密类型 === undefined || Number.isNaN(卡密时长)) {
      await 发消息(event, [段_引用(event.message_id), 段_文本('卡密无效！')]);
      return true;
    }

    let 来源 = '未知';
    let dir_wj_time = '';
    if (event.message_type === 'group') {
      来源 = `群聊(${event.group_id})`;
      dir_wj_time = `筱筱吖/授权系统/授权信息/${event.group_id}.json`;
    } else if (event.message_type !== 'group') {
      来源 = '私聊';
      dir_wj_time = '筱筱吖/授权系统/授权信息/私聊.json';
    } else {
      await 发消息(event, [段_引用(event.message_id), 段_文本('出现未知类型报错')]);
      return true;
    }

    const xz_time = Math.floor(Date.now() / 1000);
    const wj_time = Number(readB(dir_wj_time, '授权时间', 0));
    const wj_km_time = Number(readB(dir_wj_time, '卡密时长', 0));
    const jjjj = xz_time - wj_time;

    let 添加方式 = '';
    let extime = 0;
    if (jjjj > wj_km_time) {
      添加方式 = '重新添加授权';
      extime = xz_time + 卡密时长;
      writeB(dir_wj_time, '授权时间', xz_time);
      writeB(dir_wj_time, '卡密时长', 卡密时长);
    } else {
      添加方式 = '续期卡密时长';
      extime = xz_time + 卡密时长 + wj_km_time;
      writeB(dir_wj_time, '卡密时长', 卡密时长 + wj_km_time);
    }

    const expireDateStr = timeA('y-m-d H:i:s', extime);
    let 组装消息 = '';
    组装消息 += `══════════════`;
    组装消息 += `\n[使用目标]:${来源}`;
    组装消息 += `\n[增加模式]:${添加方式}`;
    组装消息 += `\n[卡密类型]:${卡密类型}卡`;
    组装消息 += `\n[新增时长]:${卡密时长}秒`;
    组装消息 += `\n[到期时间]:${expireDateStr}`;
    组装消息 += `\n══════════════`;
    await 发消息(event, [段_引用(event.message_id), 段_文本(组装消息)]);

    deleteKey('筱筱吖/授权系统/卡密管理/卡密数据.json', one_km);
    return true;
  }

  const delKmMatch = message.match(/^(删除|清空)卡密([\s\S]*)$/);
  if (delKmMatch) {
    if (!(await checkOwner3(event, ctx, false, false))) return true;

    const ly_km = delKmMatch[1] ?? '';
    const one_km = delKmMatch[2] ?? '';

    const raw = readB('筱筱吖/授权系统/卡密管理/卡密数据.json', one_km, {}) as Record<string, unknown>;
    const data = raw as CardKmPayload;
    const 卡密类型 = data.类型;
    const 卡密时长 = data.时长;

    if ((卡密类型 === undefined || 卡密时长 === undefined) && ly_km !== '清空') {
      await 发消息(event, [段_引用(event.message_id), 段_文本('卡密不存在！')]);
      return true;
    }

    if (ly_km === '清空') {
      writeA('筱筱吖/授权系统/卡密管理/卡密数据.json', '{}');
      await 发消息(event, [段_引用(event.message_id), 段_文本('已清空现在有的全部卡密啦～！')]);
      return true;
    }

    deleteKey('筱筱吖/授权系统/卡密管理/卡密数据.json', one_km);
    await 发消息(event, [段_引用(event.message_id), 段_文本(`已删除卡密【${one_km}】`)]);
    return true;
  }

  if (message === '卡密列表') {
    if (!(await checkOwner3(event, ctx, false, false))) return true;

    const km_content = readA('筱筱吖/授权系统/卡密管理/卡密数据.json');
    let km_data: Record<string, CardKmPayload> = {};
    if (km_content && km_content.trim()) {
      try {
        km_data = JSON.parse(km_content) as Record<string, CardKmPayload>;
      } catch {
        km_data = {};
      }
    }
    const km_count = Object.keys(km_data).length;

    if (km_count === 0) {
      await 发消息(event, [段_引用(event.message_id), 段_文本('目前没有卡密哦～')]);
      return true;
    }

    let 组装消息 = '';
    let 序号 = 1;
    let 永久卡数量 = 0;
    let 年卡数量 = 0;
    let 半年卡数量 = 0;
    let 月卡数量 = 0;
    let 周卡数量 = 0;
    let 天卡数量 = 0;

    for (const [键, 值] of Object.entries(km_data)) {
      const 本次类型 = 值['类型'];
      const 本次时长 = 值['时长'];

      if (本次类型 === undefined || 本次时长 === undefined) {
        continue;
      }
      组装消息 += `\n${序号}.[${本次类型}卡]:【${键}】`;
      序号++;

      if (本次类型 === '永久') {
        永久卡数量++;
      } else if (本次类型 === '年') {
        年卡数量++;
      } else if (本次类型 === '半年') {
        半年卡数量++;
      } else if (本次类型 === '月') {
        月卡数量++;
      } else if (本次类型 === '周') {
        周卡数量++;
      } else {
        天卡数量++;
      }
    }

    let 组装消息2 = `共计【${km_count}】张卡密`;
    组装消息2 += `\n══════════════`;
    组装消息2 += `\n[天卡]:${天卡数量}`;
    组装消息2 += `\n[周卡]:${周卡数量}`;
    组装消息2 += `\n[月卡]:${月卡数量}`;
    组装消息2 += `\n[半年]:${半年卡数量}`;
    组装消息2 += `\n[年卡]:${年卡数量}`;
    组装消息2 += `\n[永久]:${永久卡数量}`;
    组装消息2 += `\n══════════════`;

    await 发消息(event, [段_引用(event.message_id), 段_文本('已发给你的私聊啦，请查收～')]);
    const fakeEvent: MkMessageEvent = {
      message_type: 'private',
      user_id: event.user_id,
    };
    await 发合并消息(fakeEvent, [合并节点('[授权系统]', event.self_id, [段_文本(组装消息2 + 组装消息)])]);
    return true;
  }

  const cancelAuthMatch = message.match(/^(删除|取消)授权([\s\S]*)$/);
  if (cancelAuthMatch) {
    if (!(await checkOwner3(event, ctx, false, false))) return true;

    const one_km = cancelAuthMatch[2] ?? '';

    let mub: string | number | undefined = '';
    let dir_wj_time = '';
    if (event.message_type === 'group' && one_km === '') {
      mub = event.group_id;
      dir_wj_time = `筱筱吖/授权系统/授权信息/${event.group_id}.json`;
    } else if (event.message_type !== 'group' && one_km === '') {
      mub = '私聊';
      dir_wj_time = '筱筱吖/授权系统/授权信息/私聊.json';
    } else if (one_km !== '') {
      mub = one_km;
      dir_wj_time = `筱筱吖/授权系统/授权信息/${one_km}.json`;
    } else {
      await 发消息(event, [段_引用(event.message_id), 段_文本('出现未知类型报错')]);
      return true;
    }

    writeB(dir_wj_time, '授权时间', 0);
    writeB(dir_wj_time, '卡密时长', 0);

    await 发消息(event, [段_引用(event.message_id), 段_文本(`我这就去把【${mub}】的授权状态给bian了！`)]);
    return true;
  }

  return false;
}
