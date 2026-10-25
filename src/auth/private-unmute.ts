// @ts-nocheck
// ---------------------------------------------------------------------------
// 私聊解禁（从 mkbot-core 拆出）
// 由 mkbot-core 注入 readB/writeB/BOTAPI 等；Vite 与主入口打包为单文件 index.mjs。
//
// 仅在私聊触发，解除「发消息的人」自己的禁言，按次收取虚拟货币。
// 不绕过授权与私聊开关：这两层由 mkbot-core 的统一前置保证（未授权 /
// 未放行私聊根本走不到这里），本模块只在此基础上做娱乐分项与业务校验。
//
// ── 调用节流（针对「机器人几百个群 → 一次指令打出几百个 get_group_member_info」）──
//   · 匹配到指令后先回一条「查询中请稍等」，避免用户以为机器人没反应
//   · 扫描按批走：每查 10 个群冷却 4 秒，杜绝瞬时并发打爆协议端
//   · 本地预筛（群娱乐开关 + 「用户不在该群」缓存），能不发接口就不发
//   · 同一人 15 秒内不重复全量扫描，防止连点刷爆
// ---------------------------------------------------------------------------

import type {
  AuthRcStatus,
  MkMessageEvent,
  MkPluginContext,
  PrivateUnmuteDeps,
  PrivateUnmuteHandleResult,
} from '../types';
import { 发消息, 段_引用, 段_文本 } from '../BOT';
import { requireAuthorized } from '../lib/unauth-reply';
import { calcUnmutePrice, loadUnmutePriceConfig, UNMUTE_FREE_TIMES } from '../lib/unmute-price';

/** 次数记录：key = QQ 号，值为「已成功解禁次数」 */
const 次数文件 = '筱筱吖/娱乐系统/私聊解禁/次数.json';
/** 货币余额文件（与签到 / 商店 / 发卡共用） */
const 货币文件 = '筱筱吖/娱乐系统/游戏数据/归笺.json';
/** 已确认「该用户不在该群」的缓存：key = QQ，值 = { 群号: 过期时间戳 } */
const 不在群缓存文件 = '筱筱吖/娱乐系统/私聊解禁/不在群缓存.json';
/** 全量扫描冷却：key = QQ，值 = 冷却到期时间戳 */
const 冷却文件 = '筱筱吖/娱乐系统/私聊解禁/冷却.json';

/** 群身份等级：与 mkbot-core 的 RC_group_role 保持一致 */
const 身份等级表 = { owner: 3, admin: 2, member: 1, unknown: 0 };

/** 单次最多扫描多少个群，避免超大号把协议端打爆 */
const 最大扫描群数 = 60;
/** 每批并发查多少个群 */
const 每批群数 = 10;
/** 每批之间的冷却（毫秒）—— 即「每查 10 个群冷却 4 秒」 */
const 批间冷却毫秒 = 4000;
/** 同一人的全量扫描冷却，防止连点指令反复扫一遍 */
const 指令冷却毫秒 = 15 * 1000;
/** 「不在群」缓存有效期：2 小时（用户可能中途加群，不能久缓存） */
const 不在群缓存有效期毫秒 = 2 * 60 * 60 * 1000;
/** 单个用户的缓存条目上限，防止文件无限膨胀 */
const 不在群缓存上限 = 500;

/** 执行指令（可带群号） */
const 执行指令 = /^(解禁|解除禁言|我要解禁|私聊解禁)(?:[\s]+(\d{5,12}))?$/;
/** 说明指令 */
const 说明指令 = new Set(['解禁说明', '私聊解禁说明', '解禁菜单']);

/** 取接口有效数据；retcode≠0 或空壳一律视为不可用 */
function 取接口数据(res) {
  if (!res || typeof res !== 'object') return null;
  if (res.retcode != null && Number(res.retcode) !== 0) return null;
  const d = res.data && typeof res.data === 'object' ? res.data : res;
  if (!d || Object.keys(d).length === 0) return null;
  return d;
}

/** get_group_list 在 NapCat / SnowLuma 下可能是数组、{data:[]} 两种形态 */
function 取群列表(res) {
  let raw = res;
  if (Array.isArray(raw)) {
    // 原样
  } else if (raw && typeof raw === 'object' && Array.isArray(raw.data)) {
    raw = raw.data;
  } else {
    return [];
  }
  return raw
    .map((g) => String((g && (g.group_id ?? g.groupid)) || ''))
    .filter(Boolean);
}

/** 禁言结束时间戳（秒），兼容 NapCat / SnowLuma 多种字段名 */
function 取禁言到期(d) {
  const v = Number(d.shut_up_timestamp ?? d.shutUpTimestamp ?? d.shut_up_time ?? d.shutUpTime ?? 0);
  return Number.isFinite(v) ? v : 0;
}

async function 查成员(BOTAPI, ctx, 群号, QQ) {
  try {
    const res = await BOTAPI(ctx, 'get_group_member_info', {
      group_id: Number(群号),
      user_id: Number(QQ),
      no_cache: true,
    });
    return 取接口数据(res);
  } catch {
    return null;
  }
}

function 默认休眠(毫秒) {
  return new Promise((resolve) => setTimeout(resolve, 毫秒));
}

/** 读「用户不在该群」缓存：{ 群号: 过期时间戳 } */
function 读不在群缓存(readB, QQ) {
  const v = readB(不在群缓存文件, QQ, null);
  if (!v || typeof v !== 'object' || Array.isArray(v)) return {};
  return v;
}

/** 合入本次新确认的「不在群」，并清掉过期与超量条目 */
function 写不在群缓存(readB, writeB, QQ, 新不在群) {
  const 缓存 = 读不在群缓存(readB, QQ);
  const 到期 = Date.now() + 不在群缓存有效期毫秒;
  for (const 群号 of 新不在群) 缓存[String(群号)] = 到期;

  const 现在 = Date.now();
  for (const k of Object.keys(缓存)) {
    if (!(Number(缓存[k]) > 现在)) delete 缓存[k];
  }
  let keys = Object.keys(缓存);
  if (keys.length > 不在群缓存上限) {
    keys = keys.sort((a, b) => Number(缓存[a]) - Number(缓存[b]));
    for (const k of keys.slice(0, keys.length - Math.floor(不在群缓存上限 / 2))) delete 缓存[k];
  }
  writeB(不在群缓存文件, QQ, 缓存);
}

/**
 * 分批扫描禁言状态。
 * 每 每批群数 个群并发查一次，批与批之间休眠 批间冷却毫秒（最后一批后不休眠）。
 * 返回 { 被禁群, 不在群 }：「不在群」会被记进缓存，下次直接跳过。
 */
async function 分批扫描(BOTAPI, ctx, 群列表, QQ, 现在秒, 休眠) {
  const 被禁群 = [];
  const 不在群 = [];
  for (let i = 0; i < 群列表.length; i += 每批群数) {
    const 批 = 群列表.slice(i, i + 每批群数);
    const 结果 = await Promise.all(
      批.map(async (群号) => {
        const 信息 = await 查成员(BOTAPI, ctx, 群号, QQ);
        if (!信息) return '不在群';
        return 取禁言到期(信息) > 现在秒 ? '被禁言' : '正常';
      })
    );
    批.forEach((群号, idx) => {
      const s = 结果[idx];
      if (s === '被禁言') 被禁群.push(群号);
      else if (s === '不在群') 不在群.push(群号);
    });
    // 还有下一批才冷却：最后一批查完立刻出结果，不白等
    if (i + 每批群数 < 群列表.length) await 休眠(批间冷却毫秒);
  }
  return { 被禁群, 不在群 };
}

export async function handlePrivateUnmuteCommands(
  message: string,
  event: MkMessageEvent,
  ctx: MkPluginContext,
  RC_sq: AuthRcStatus,
  d: PrivateUnmuteDeps
): Promise<PrivateUnmuteHandleResult> {
  // ================== 仅私聊触发 ==================
  // 私聊只是「接收消息」的入口：能不能发进来由 core 的 haoyou_of / 全私免开 决定。
  // 本功能真正的开关跟着目标群走，见下方「② 群娱乐事件校验（本地预筛）」。
  if (event?.message_type !== 'private') return false;

  const 原文 = String(message || '').trim();
  const 是说明 = 说明指令.has(原文);
  const 匹配 = 原文.match(执行指令);
  if (!是说明 && !匹配) return false;

  const { readB, writeB, BOTAPI, 货币名, 娱乐功能按群 } = d;
  const 休眠 = typeof d.休眠 === 'function' ? d.休眠 : 默认休眠;

  // ================== 授权校验 ==================
  if (!(await requireAuthorized(RC_sq, event, readB))) return 'halt';

  const 名 = typeof 货币名 === 'function' ? 货币名() : '归笺';
  const 配置 = loadUnmutePriceConfig();

  // ================== 说明菜单 ==================
  if (是说明) {
    let 文本 = `════ 私聊解禁 ════`;
    文本 += `\n在私聊对我说「解禁」，我就会帮你解除禁言`;
    文本 += `\n`;
    文本 += `\n【收费规则】`;
    文本 += `\n · 前 ${UNMUTE_FREE_TIMES} 次：免费`;
    文本 += `\n · 第 ${UNMUTE_FREE_TIMES + 1} 次起：${配置.初始收费} ${名}`;
    if (Number(配置.上涨百分比) > 0) {
      文本 += `\n · 之后每解禁一次，费用上涨 ${配置.上涨百分比}%`;
    } else {
      文本 += `\n · 当前涨幅为 0，费用不上涨`;
    }
    文本 += `\n`;
    文本 += `\n【指令】`;
    文本 += `\n解禁`;
    文本 += `\n解禁 群号`;
    文本 += `\n══════════════`;
    await 发消息(event, [段_引用(event.message_id), 段_文本(文本)]);
    return 'halt';
  }

  const 指定群 = 匹配[2] || '';

  // ================== ① 候选群 ==================
  let 候选群 = 取群列表(await BOTAPI(ctx, 'get_group_list', {}));
  if (指定群) {
    if (!候选群.includes(指定群)) {
      await 发消息(event, [段_引用(event.message_id), 段_文本(`我不在群「${指定群}」里，没法帮你解禁哦～`)]);
      return 'halt';
    }
    候选群 = [指定群];
  }
  if (候选群.length === 0) {
    await 发消息(event, [段_引用(event.message_id), 段_文本(`我好像还不在任何群里，帮不了你～`)]);
    return 'halt';
  }

  // ================== ② 群娱乐事件校验（本地预筛，零接口调用） ==================
  // 开关跟着「目标群」走：群没开「私聊解禁」，哪怕人确实被禁言也不处理。
  // 放在扫描之前 —— 顺带把没开功能的群从待查列表里剔除，直接省掉大量接口调用。
  const 开启群 = 候选群.filter((群) => 娱乐功能按群('私聊解禁', 群));
  if (开启群.length === 0) {
    const 文本 = 指定群
      ? `群「${指定群}」还没有开启「私聊解禁」这个娱乐功能，帮不了你～`
      : `暂时还没有开启「私聊解禁」的群，帮不了你～`;
    await 发消息(event, [段_引用(event.message_id), 段_文本(文本)]);
    return 'halt';
  }

  // ================== ③ 指令冷却（仅全量扫描，指定群号不受限） ==================
  if (!指定群) {
    const 冷却到期 = Number(readB(冷却文件, event.user_id, 0)) || 0;
    const 剩余毫秒 = 冷却到期 - Date.now();
    if (剩余毫秒 > 0) {
      await 发消息(event, [
        段_引用(event.message_id),
        段_文本(`刚刚才帮你查过啦，请 ${Math.ceil(剩余毫秒 / 1000)} 秒后再试～\n（也可以直接发「解禁 群号」指定一个群）`),
      ]);
      return 'halt';
    }
  }

  // ================== ④ 跳过已确认「不在群」的群（零接口调用） ==================
  // 上次扫出来「成员不存在」的群会记进缓存，本次直接跳过：
  // 机器人几百个群时，这一层能把调用量从上百次压到个位数。
  const 不在群缓存 = 指定群 ? {} : 读不在群缓存(readB, event.user_id);
  const 现在毫秒 = Date.now();
  const 待查群 = 开启群.filter((群) => !(Number(不在群缓存[String(群)]) > 现在毫秒));

  if (待查群.length === 0) {
    await 发消息(event, [
      段_引用(event.message_id),
      段_文本(指定群 ? `你在群「${指定群}」里没有被禁言哦～` : `我查了一遍，你当前没有被禁言的群哦～`),
    ]);
    return 'halt';
  }

  // ================== ⑤ 立即回执：让用户知道在处理 ==================
  const 实际扫描数 = Math.min(待查群.length, 最大扫描群数);
  await 发消息(event, [
    段_引用(event.message_id),
    段_文本(
      指定群
        ? `正在查询你在群「${指定群}」的状态，请稍等…`
        : `正在查询你在 ${实际扫描数} 个群的状态，查询中请稍等…`
    ),
  ]);

  // ================== ⑥ 分批扫描 ==================
  const 现在秒 = Math.floor(现在毫秒 / 1000);
  const { 被禁群, 不在群 } = await 分批扫描(
    BOTAPI,
    ctx,
    待查群.slice(0, 最大扫描群数),
    event.user_id,
    现在秒,
    休眠
  );

  // 回写缓存与冷却（无论结果如何：这次已经问过协议端了）
  if (不在群.length > 0) 写不在群缓存(readB, writeB, event.user_id, 不在群);
  if (!指定群) writeB(冷却文件, event.user_id, Date.now() + 指令冷却毫秒);

  if (被禁群.length === 0) {
    await 发消息(event, [
      段_引用(event.message_id),
      段_文本(指定群 ? `你在群「${指定群}」里没有被禁言哦～` : `我查了一遍，你当前没有被禁言的群哦～`),
    ]);
    return 'halt';
  }

  if (被禁群.length > 1 && !指定群) {
    let 文本 = `你在 ${被禁群.length} 个群里被禁言了，请指定一个群号：`;
    文本 += `\n${被禁群.map((g) => ` - ${g}`).join('\n')}`;
    文本 += `\n\n发送：解禁 群号`;
    await 发消息(event, [段_引用(event.message_id), 段_文本(文本)]);
    return 'halt';
  }

  const 群号 = 被禁群[0];

  // ================== ⑦ 机器人是否在群 + 是否有群管权限 ==================
  const 机器人 = await 查成员(BOTAPI, ctx, 群号, event.self_id);
  if (!机器人) {
    await 发消息(event, [
      段_引用(event.message_id),
      段_文本(`我在群「${群号}」里查不到自己，可能已经不在群里了～`),
    ]);
    return 'halt';
  }
  const 机器人等级 = 身份等级表[String(机器人.role || 'member')] ?? 0;
  if (机器人等级 < 2) {
    await 发消息(event, [
      段_引用(event.message_id),
      段_文本(`我在群「${群号}」没有管理权限，解不了禁言唉～`),
    ]);
    return 'halt';
  }

  // ================== ⑧ 目标身份（管理员之间不能互相解除） ==================
  const 目标 = await 查成员(BOTAPI, ctx, 群号, event.user_id);
  if (!目标) {
    await 发消息(event, [
      段_引用(event.message_id),
      段_文本(`在群「${群号}」里查不到你，可能不在这个群～`),
    ]);
    return 'halt';
  }
  const 目标等级 = 身份等级表[String(目标.role || 'member')] ?? 0;
  if (目标等级 >= 机器人等级) {
    await 发消息(event, [
      段_引用(event.message_id),
      段_文本(`你在群「${群号}」的身份不低于我，我解不了～（管理员之间无法互相解除禁言）`),
    ]);
    return 'halt';
  }

  // ================== ⑨ 价格与余额校验 ==================
  const 已解除 = Number(readB(次数文件, event.user_id, 0)) || 0;
  const 本次收费 = calcUnmutePrice(已解除, 配置);
  let 余额 = Number(readB(货币文件, event.user_id, 0));
  if (!Number.isFinite(余额)) 余额 = 0;

  if (余额 < 本次收费) {
    await 发消息(event, [
      段_引用(event.message_id),
      段_文本(`${名}不够啦～\n本次需要：${本次收费} ${名}\n你当前有：${余额} ${名}`),
    ]);
    return 'halt';
  }

  // ================== ⑩ 执行解禁（失败不扣费） ==================
  let 失败原因 = '';
  try {
    const res = await BOTAPI(ctx, 'set_group_ban', {
      group_id: Number(群号),
      user_id: Number(event.user_id),
      duration: 0,
    });
    if (res && typeof res === 'object' && res.retcode != null && Number(res.retcode) !== 0) {
      失败原因 = res.wording || res.message || `retcode=${res.retcode}`;
    }
  } catch (e) {
    失败原因 = (e && e.message) || '未知错误';
  }

  if (失败原因) {
    await 发消息(event, [
      段_引用(event.message_id),
      段_文本(`解禁失败了（${失败原因}）\n本次没有扣除任何${名}，可以稍后再试～`),
    ]);
    return 'halt';
  }

  // ================== ⑪ 成功后才扣费 ==================
  if (本次收费 > 0) writeB(货币文件, event.user_id, 余额 - 本次收费);
  writeB(次数文件, event.user_id, 已解除 + 1);

  const 下次收费 = calcUnmutePrice(已解除 + 1, 配置);
  let 回执 = `✅ 已解除你在群「${群号}」的禁言啦～`;
  回执 += `\n══════════════`;
  if (本次收费 > 0) {
    回执 += `\n💰 本次消耗：${本次收费} ${名}（剩余 ${余额 - 本次收费}）`;
  } else {
    回执 += `\n🎁 本次免费（前 ${UNMUTE_FREE_TIMES} 次免费）`;
  }
  if (下次收费 > 0) 回执 += `\n📈 下次费用：${下次收费} ${名}`;
  回执 += `\n🎫 已解禁次数：${已解除 + 1}`;
  回执 += `\n══════════════`;
  await 发消息(event, [段_引用(event.message_id), 段_文本(回执)]);
  return 'halt';
}
