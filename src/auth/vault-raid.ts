// @ts-nocheck
// ---------------------------------------------------------------------------
// 闯金库（升级版打劫）— 升级版打劫银行，仅群聊触发，娱乐分项「闯金库」管控
//
// 由 mkbot-core 注入 readB/writeB/BOTAPI 等；Vite 与主入口打包为单文件 index.mjs。
// 原版「打劫 @人」完全不动，两者是两条独立分支。
//
// 与旧版打劫的区别：
//   · 抢的是「银行金库」这个公共池，不是某个玩家
//   · 奖励 / 惩罚都分档，成败都有账可查（统一写进 筱筱吖/娱乐系统/闯金库/流水/）
//   · 反白嫖靠「风险敞口」——能赢多少取决于能输多少，不需要新道具 / 入场券 / 每日限次
// ---------------------------------------------------------------------------

import type {
  AuthRcStatus,
  MkMessageEvent,
  MkPluginContext,
  VaultRaidDeps,
  VaultRaidHandleResult,
} from '../types';
import { 发消息, 段_引用, 段_文本 } from '../BOT';
import { requireAuthorized } from '../lib/unauth-reply';
import {
  calc敞口,
  calc奖励,
  calc罚款,
  calc禁言分钟,
  抽惩罚档位,
  抽奖励档位,
  格式化时间,
  金库出账,
  金库入账,
  累加统计,
  读金库,
  剩余冷却秒,
  写冷却,
  写流水,
  是空手,
  掷成败,
  有效配置,
} from '../lib/vault-raid';

/** 触发指令（不进任何菜单，只在娱乐管理里作为分项开关出现） */
const 执行指令 = new Set(['闯金库']);

/** 现有货币（现金，可被罚没） */
const 货币文件 = '筱筱吖/娱乐系统/游戏数据/归笺.json';
/** 银行存款（不会被罚没，只按系数计入敞口） */
const 银行文件 = '筱筱吖/娱乐系统/游戏数据/银行系统/银行归笺.json';

/** 冷却记录文件（用于算「预计什么时候好」） */
const 冷却文件 = '筱筱吖/娱乐系统/闯金库/冷却.json';

/** 群身份等级：与 mkbot-core 的 RC_group_role 保持一致 */
const 身份等级表 = { owner: 3, admin: 2, member: 1, unknown: 0 };

/** 取接口有效数据 */
function 取接口数据(res) {
  if (!res || typeof res !== 'object') return null;
  if (res.retcode != null && Number(res.retcode) !== 0) return null;
  const d = res.data && typeof res.data === 'object' ? res.data : res;
  if (!d || Object.keys(d).length === 0) return null;
  return d;
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

/** 机器人能否禁言该目标；顺带给出等级，便于提示文案 */
async function 能否禁言(BOTAPI, ctx, 群号, selfId, userId) {
  // 原因文案保持简短：会出现在回执括号里，手机上一行要放得下
  const 机器人 = await 查成员(BOTAPI, ctx, 群号, selfId);
  if (!机器人) return { 能: false, 原因: '查不到我' };
  const 机器人等级 = 身份等级表[String(机器人.role || 'member')] ?? 0;
  if (机器人等级 < 2) return { 能: false, 原因: '我不是管理' };
  const 目标 = await 查成员(BOTAPI, ctx, 群号, userId);
  if (!目标) return { 能: false, 原因: '查不到你' };
  const 目标等级 = 身份等级表[String(目标.role || 'member')] ?? 0;
  // 管理员之间不能互相禁言；群主（3）可压管理员
  if (目标等级 >= 机器人等级) return { 能: false, 原因: '身份太高' };
  return { 能: true, 原因: '' };
}

export async function handleVaultRaidCommands(
  message: string,
  event: MkMessageEvent,
  ctx: MkPluginContext,
  RC_sq: AuthRcStatus,
  d: VaultRaidDeps
): Promise<VaultRaidHandleResult> {
  // ================== 仅群聊触发 ==================
  if (event?.message_type !== 'group') return false;

  const 原文 = String(message || '').trim();
  if (!执行指令.has(原文)) return false;

  const { readB, writeB, BOTAPI, 货币名 } = d;

  // ================== 授权校验 ==================
  if (!(await requireAuthorized(RC_sq, event, readB))) return 'halt';

  const 名 = typeof 货币名 === 'function' ? 货币名() : '归笺';
  // 生效配置：未自定义的前两档已按经济体量抬价过
  const { 配置, 系数: 抬价系数, 抬价字段 } = 有效配置();

  // ================== 冷却 ==================
  const 剩余秒 = 剩余冷却秒(event.user_id, 配置);
  if (剩余秒 > 0) {
    const 分 = Math.floor(剩余秒 / 60);
    const 秒 = 剩余秒 % 60;
    const 到期秒 = Number(readB(冷却文件, String(event.user_id), 0)) || 0;
    let 文本 = `金库刚被你惊动过，守卫还没换班呢～`;
    文本 += `\n还需等待 ${分} 分 ${秒} 秒（冷却 ${配置.冷却分钟} 分钟）`;
    if (到期秒 > 0) 文本 += `\n预计时间：${格式化时间(到期秒 * 1000)}`;
    await 发消息(event, [段_引用(event.message_id), 段_文本(文本)]);
    return 'halt';
  }

  // ================== 读账 ==================
  const 群号 = String(event.group_id ?? '');
  const 现有货币 = Math.max(0, Math.floor(Number(readB(货币文件, event.user_id, 0)) || 0));
  const 银行存款 = Math.max(0, Math.floor(Number(readB(银行文件, event.user_id, 0)) || 0));
  const 金库原本 = 读金库();

  // ================== 空手门槛（反白嫖第一条） ==================
  if (是空手(现有货币, 银行存款)) {
    await 发消息(event, [
      段_引用(event.message_id),
      段_文本(`两手空空也想闯金库呀？\n身上和银行里都一分钱没有，守卫连拦都懒得拦你～`),
    ]);
    return 'halt';
  }

  // ================== 风险敞口（反白嫖第二条） ==================
  const 敞口 = calc敞口(现有货币, 银行存款, 配置);

  // ================== 成败 ==================
  const 成功 = 掷成败(配置);
  const 冷却到期 = 写冷却(event.user_id, 配置);

  let 增减 = 0;
  let 档位名 = '';
  let 新货币 = 现有货币;
  let 金库现在 = 金库原本;
  let 禁言分钟 = 0;
  let 命中免死 = false;
  let 未封顶奖励 = 0;

  if (成功) {
    // ---------------- 成功：发放奖励 ----------------
    const 档位 = 抽奖励档位(配置);
    档位名 = 档位 === '隐藏' ? '隐藏' : 档位;
    未封顶奖励 = calc奖励(档位, 现有货币, 金库原本, 配置);
    // ① 敞口封顶：能赢多少取决于能输多少
    const 封顶后 = Math.max(0, Math.min(未封顶奖励, 敞口));
    // ② 金库不透支：库里有多少才能拿走多少
    const 实发 = 金库出账(封顶后, 配置);
    金库现在 = 读金库();
    新货币 = 现有货币 + 实发;
    if (实发 > 0) writeB(货币文件, event.user_id, 新货币);
    增减 = 实发;
  } else {
    // ---------------- 失败：基础禁言 + 分档罚没 ----------------
    const 档位 = 抽惩罚档位(配置);
    档位名 = 档位 === '隐藏' ? '隐藏' : 档位;
    禁言分钟 = calc禁言分钟(配置);

    const 原始罚款 = calc罚款(档位, 现有货币, 配置);
    // 只扣现有货币，且不会扣成负数；银行存款分毫不动
    const 实扣 = Math.max(0, Math.min(原始罚款, 现有货币));
    新货币 = 现有货币 - 实扣;

    // ---- 禁言：先看机器人够不够格，够格才去查免死金牌 ----
    let 禁言成功 = false;
    let 未禁言原因 = '';
    if (禁言分钟 > 0) {
      const 判定 = await 能否禁言(BOTAPI, ctx, event.group_id, event.self_id, event.user_id);
      if (!判定.能) {
        未禁言原因 = 判定.原因;
      } else {
        const 免死 = typeof d.免死金牌 === 'function'
          ? !!(await d.免死金牌(event.user_id))
          : false;
        if (免死) {
          命中免死 = true;
        } else {
          try {
            const res = await BOTAPI(ctx, 'set_group_ban', {
              group_id: Number(event.group_id),
              user_id: Number(event.user_id),
              duration: Math.floor(禁言分钟 * 60),
            });
            禁言成功 = !(res && typeof res === 'object' && res.retcode != null && Number(res.retcode) !== 0);
          } catch {
            禁言成功 = false;
          }
        }
      }
    }

    if (实扣 > 0) {
      writeB(货币文件, event.user_id, 新货币);
      // 罚没款统一充公：进金库（也就是银行总值）
      金库入账(实扣, 配置);
    }
    金库现在 = 读金库();
    增减 = -实扣;

    if (!禁言成功) 禁言分钟 = 0;
    // 原因不再挂到档位名后面：回执末尾「未禁言（…）」已单独说明，挂两遍既重复又把那行撑长
  }

  // ================== 统计与流水（成败都记） ==================
  累加统计(event.user_id, 成功, 增减);
  写流水(群号, {
    时间: 格式化时间(),
    时间戳: Math.floor(Date.now() / 1000),
    群号,
    QQ: String(event.user_id),
    指令: 原文,
    结果: 成功 ? '成功' : '失败',
    档位: 档位名,
    增减,
    原本: 现有货币,
    现在: 新货币,
    银行存款,
    金库原本,
    金库现在,
    禁言分钟,
    免死金牌: 命中免死,
    冷却到期,
  });

  // ================== 回执 ==================
  let 回执 = `════ 闯金库 ════`;
  if (成功) {
    回执 += `\n你摸进了金库，得手了！`;
    回执 += `\n · 运气档位：${档位名}`;
    回执 += `\n · 到手：+${增减} ${名}`;
    if (未封顶奖励 > 增减) {
      回执 += `\n · （敞口 ${敞口}，已封顶）`;
    }
  } else {
    回执 += `\n守卫把你按住了，闯库失败…`;
    回执 += `\n · 惩罚档位：${档位名}`;
    if (档位名 === '隐藏') {
      回执 += `\n · 隐藏惩罚：${名}清零（存款不动）`;
    }
    回执 += `\n · 罚没：-${Math.abs(增减)} ${名}`;
    if (命中免死) {
      回执 += `\n · 免死金牌生效，本次不用蹲禁闭～`;
    } else if (禁言分钟 > 0) {
      回执 += `\n · 蹲禁闭：${禁言分钟} 分钟`;
    } else {
      回执 += `\n · 未禁言${未禁言原因 ? `（${未禁言原因}）` : ''}`;
    }
  }
  回执 += `\n──────────────`;
  回执 += `\n现有${名}：${现有货币} → ${新货币}`;
  回执 += `\n下次可闯：${配置.冷却分钟} 分钟后`;
  回执 += `\n预计时间：${格式化时间(冷却到期 * 1000)}`;
  if (抬价系数 !== 1 && 抬价字段.length > 0) {
    回执 += `\n当前抬价系数：×${抬价系数}`;
  }
  回执 += `\n══════════════`;

  await 发消息(event, [段_引用(event.message_id), 段_文本(回执)]);
  return 'halt';
}
