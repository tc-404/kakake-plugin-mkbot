// @ts-nocheck
// ---------------------------------------------------------------------------
// 离线通知：监听 NapCat/SL 协议 bot_offline 上报，邮件通知指定邮箱地址
// 数据目录：筱筱吖/扩展功能/离线通知/
// 收件人配置独立存放于 收件邮箱.json；旧版「配置.json」里的 QQ 号写法不再读取
// ---------------------------------------------------------------------------

import { hasMailConfigured } from '../lib/api/mail-accounts';

export const OFFLINE_NOTIFY_ROOT = '筱筱吖/扩展功能/离线通知/';
const CONFIG_FILE = '收件邮箱.json';
const MAX_NOTIFY_EMAILS = 20;

export const OFFLINE_MAIL_SUBJECT = '【MKbot离线通知】机器人账号已掉线';
export const OFFLINE_MAIL_FROM_NAME = 'MKbot离线监控';
export const OFFLINE_SIMULATE_SUBJECT = '【MKbot离线通知·模拟演示】演示邮件，机器人并未掉线';
export const OFFLINE_SIMULATE_FROM_NAME = 'MKbot离线监控（模拟演示）';

export interface OfflineNotifyDeps {
  readA: (relPath: string) => string | null | undefined;
  writeA: (relPath: string, content: string) => void;
  getDataPath: () => string;
  发邮箱?: (provider: string, ...args: unknown[]) => Promise<{ ok: boolean; message?: string }>;
}

interface OfflineNotifyConfig {
  enabled: boolean;
  notifyEmails: string[];
}

function defaultConfig(): OfflineNotifyConfig {
  return { enabled: false, notifyEmails: [] };
}

function normalizeEmailList(input: unknown): string[] {
  const list = Array.isArray(input) ? input : [];
  const out: string[] = [];
  for (const item of list) {
    const email = String(item ?? '').trim();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) continue;
    if (out.some((e) => e.toLowerCase() === email.toLowerCase())) continue;
    out.push(email);
    if (out.length >= MAX_NOTIFY_EMAILS) break;
  }
  return out;
}

function loadConfigRaw(deps: OfflineNotifyDeps): OfflineNotifyConfig {
  const content = deps.readA(`${OFFLINE_NOTIFY_ROOT}${CONFIG_FILE}`);
  if (!content) return defaultConfig();
  try {
    const obj = JSON.parse(content);
    return {
      enabled: obj?.enabled === true || obj?.enabled === 'true' || obj?.enabled === 1 || obj?.enabled === '1',
      notifyEmails: normalizeEmailList(obj?.notifyEmails),
    };
  } catch {
    return defaultConfig();
  }
}

export function getOfflineNotifySettings(deps: OfflineNotifyDeps) {
  const cfg = loadConfigRaw(deps);
  const mailConfigured = hasMailConfigured(deps);
  return {
    enabled: cfg.enabled,
    notifyEmails: cfg.notifyEmails,
    maxEmails: MAX_NOTIFY_EMAILS,
    mailConfigured,
    canNotify: cfg.enabled && mailConfigured && cfg.notifyEmails.length > 0,
  };
}

export function saveOfflineNotifySettings(
  deps: OfflineNotifyDeps,
  input: { enabled?: unknown; notifyEmails?: unknown },
) {
  const current = loadConfigRaw(deps);
  const enabled =
    input.enabled === true ||
    input.enabled === 'true' ||
    input.enabled === 1 ||
    input.enabled === '1';
  const notifyEmails = input.notifyEmails !== undefined
    ? normalizeEmailList(input.notifyEmails)
    : current.notifyEmails;
  const next: OfflineNotifyConfig = { enabled, notifyEmails };
  deps.writeA(`${OFFLINE_NOTIFY_ROOT}${CONFIG_FILE}`, JSON.stringify(next, null, 2));
  return getOfflineNotifySettings(deps);
}

function buildOfflineMailBody(event: Record<string, unknown>) {
  const selfId = String(event.self_id ?? '—');
  const tag = String(event.tag ?? '下线通知');
  const msg = String(event.message ?? '账号已掉线');
  const ts = event.time ? new Date(Number(event.time) * 1000).toLocaleString() : new Date().toLocaleString();
  return [
    'MKbot 离线通知',
    '══════════════',
    `机器人 QQ：${selfId}`,
    `上报类型：bot_offline（NapCat/SL 协议）`,
    `标签：${tag}`,
    `说明：${msg}`,
    `上报时间：${ts}`,
    '══════════════',
    '请尽快检查 NapCat 登录状态并重新登录。',
    '此邮件由 MKbot 离线监控自动发送。',
  ].join('\n');
}

/** 演示邮件正文：比正式通知更详细，且开头就声明这是演示内容 */
function buildOfflineSimulateMailBody(
  event: Record<string, unknown>,
  cfg: OfflineNotifyConfig,
) {
  const selfId = String(event.self_id ?? '').trim();
  const ts = event.time
    ? new Date(Number(event.time) * 1000).toLocaleString()
    : new Date().toLocaleString();
  const sampleEvent = {
    ...event,
    self_id: selfId || '（掉线账号的 QQ 号）',
    tag: '下线通知',
    message: '账号已掉线',
  };
  const officialPreview = buildOfflineMailBody(sampleEvent)
    .split('\n')
    .map((line) => `    ${line}`)
    .join('\n');
  return [
    '【模拟演示邮件 · 不是真实告警】',
    '══════════════',
    '重要：这封邮件是演示内容，机器人当前并没有掉线，你不需要做任何处理。',
    '它由 MKbot 后台「离线通知配置 → 模拟发送」按钮人工触发，',
    '目的是验证「绑定的发信邮箱 → 发信 → 收件邮箱」这条链路是否真的通。',
    '',
    '一、这次模拟具体做了什么',
    '  1. 后台伪造了一条与 NapCat/SL 协议同构的 bot_offline 掉线上报；',
    '  2. 这条上报被送进与真实掉线完全相同的处理流程（同一份配置、同一个发信函数）；',
    '  3. 发信按绑定顺序取用邮箱，只有当前邮箱失败时才自动轮替下一个；',
    '  4. 你能读到这封邮件，说明整条链路可用，真实掉线时也能收到通知。',
    '',
    '二、本次模拟上报的字段',
    '  post_type：notice',
    '  notice_type：bot_offline',
    `  机器人 QQ：${selfId || '未提供（模拟上报不携带真实账号信息）'}`,
    `  标签：${String(event.tag ?? '模拟演示')}`,
    `  说明：${String(event.message ?? '人工触发的模拟掉线上报')}`,
    `  触发时间：${ts}`,
    '',
    '三、触发时的离线通知配置',
    `  离线通知开关：${cfg.enabled ? '已开启' : '未开启（模拟发送不受开关限制，但真实掉线时不会自动发信）'}`,
    `  收件邮箱（${cfg.notifyEmails.length} 个）：${cfg.notifyEmails.join('、') || '无'}`,
    '  发信邮箱：已绑定至少一个可用邮箱，本次实际使用的地址就是这封邮件的发件人',
    '',
    '四、真实掉线时你会收到的邮件',
    `  标题：${OFFLINE_MAIL_SUBJECT}`,
    '  正文（比这封演示邮件简短，只保留关键信息）：',
    officialPreview,
    '',
    '五、如果这封邮件本身就收不到',
    '  1. 先翻一下垃圾邮件 / 广告邮件分类；',
    '  2. 到后台「邮箱绑定」点「刷新状态」，确认绑定邮箱状态正常；',
    '  3. QQ 邮箱、网易邮箱必须填「授权码」，不是登录密码；',
    '  4. 换一个收件地址再模拟一次，排除单个邮箱服务商拦截。',
    '══════════════',
    '此邮件由 MKbot 离线监控在人工触发下发送，仅用于演示与自检。',
  ].join('\n');
}

export type OfflineNotifyRunCode =
  | 'ok'
  | 'ignored'
  | 'disabled'
  | 'no_target'
  | 'no_account'
  | 'no_sender'
  | 'send_failed';

export interface OfflineNotifyRunResult {
  ok: boolean;
  code: OfflineNotifyRunCode;
  message: string;
  simulated: boolean;
  enabled: boolean;
  recipients: string[];
  provider?: string;
  from?: string;
}

const RUN_MESSAGES: Record<string, string> = {
  ignored: '不是 bot_offline 上报，已忽略',
  disabled: '离线通知开关未开启',
  no_target: '还没有添加收件邮箱地址，请先在「收件邮箱」里加一个能收信的地址并保存',
  no_account: '还没有可用的发信邮箱绑定，请先在「邮箱绑定」里绑定并测试一个邮箱',
  no_sender: '邮箱发信服务尚未就绪，请重启插件或框架后再试',
};

/**
 * 离线通知统一处理管道。真实上报与后台「模拟发送」走同一条路径，
 * 区别只有正文模板、发件人名称，以及模拟时忽略开关状态。
 */
async function runOfflineNotify(
  event: Record<string, unknown>,
  deps: OfflineNotifyDeps,
  options: { simulate?: boolean; ignoreEnabled?: boolean } = {},
): Promise<OfflineNotifyRunResult> {
  const simulate = options.simulate === true;
  const cfg = loadConfigRaw(deps);
  const fail = (code: OfflineNotifyRunCode, message?: string): OfflineNotifyRunResult => ({
    ok: false,
    code,
    message: message || RUN_MESSAGES[code] || '离线通知发送失败',
    simulated: simulate,
    enabled: cfg.enabled,
    recipients: cfg.notifyEmails,
  });

  if (!cfg.enabled && options.ignoreEnabled !== true) return fail('disabled');
  if (!cfg.notifyEmails.length) return fail('no_target');
  if (!hasMailConfigured(deps)) return fail('no_account');
  if (typeof deps.发邮箱 !== 'function') return fail('no_sender');

  const result = await deps.发邮箱('邮箱', {
    标题: simulate ? OFFLINE_SIMULATE_SUBJECT : OFFLINE_MAIL_SUBJECT,
    名字: simulate ? OFFLINE_SIMULATE_FROM_NAME : OFFLINE_MAIL_FROM_NAME,
    内容: simulate ? buildOfflineSimulateMailBody(event, cfg) : buildOfflineMailBody(event),
    收件人: cfg.notifyEmails,
  });

  if (!result || result.ok !== true) {
    return fail('send_failed', String(result?.message || '').trim() || '邮件发送失败');
  }

  return {
    ok: true,
    code: 'ok',
    message: `已向 ${cfg.notifyEmails.length} 个收件邮箱发送${simulate ? '模拟演示邮件' : '离线通知'}`,
    simulated: simulate,
    enabled: cfg.enabled,
    recipients: cfg.notifyEmails,
    provider: (result as { provider?: string }).provider,
    from: (result as { from?: string }).from,
  };
}

/** 仅响应 notice_type === bot_offline，忽略重连/心跳等日志 */
export async function handleOfflineNotifyBotOffline(
  event: Record<string, unknown>,
  deps: OfflineNotifyDeps,
): Promise<OfflineNotifyRunResult> {
  const ignored: OfflineNotifyRunResult = {
    ok: false,
    code: 'ignored',
    message: RUN_MESSAGES.ignored,
    simulated: false,
    enabled: false,
    recipients: [],
  };
  if (String(event?.post_type) !== 'notice') return ignored;
  if (String(event?.notice_type) !== 'bot_offline') return ignored;

  try {
    return await runOfflineNotify(event, deps);
  } catch {
    /* 静默失败，不阻断事件处理 */
    return {
      ok: false,
      code: 'send_failed',
      message: '离线通知发送异常',
      simulated: false,
      enabled: true,
      recipients: [],
    };
  }
}

/**
 * 后台「模拟发送」：伪造一条 bot_offline 上报走真实流程并真实发信。
 * 不受离线通知开关限制，但缺收件邮箱或缺发信邮箱绑定时直接返回原因。
 */
export async function simulateOfflineNotify(
  deps: OfflineNotifyDeps,
  input: { selfId?: unknown } = {},
): Promise<OfflineNotifyRunResult> {
  const selfId = String(input?.selfId ?? '').trim().replace(/[^0-9]/g, '').slice(0, 20);
  const event: Record<string, unknown> = {
    post_type: 'notice',
    notice_type: 'bot_offline',
    self_id: selfId,
    tag: '模拟演示',
    message: '后台「模拟发送」人工触发的演示上报，机器人当前并未真的掉线',
    time: Math.floor(Date.now() / 1000),
    __mk_simulate: true,
  };
  return runOfflineNotify(event, deps, { simulate: true, ignoreEnabled: true });
}