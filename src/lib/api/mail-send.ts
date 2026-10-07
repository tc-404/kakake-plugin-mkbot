// ---------------------------------------------------------------------------
// 邮箱发信 — 仅 MK 主包引用
// 调用：发邮箱("邮箱", { 标题, 名字, 内容, 收件人 })
// 按绑定列表顺序发送，只有当前邮箱报错/失败时才轮替下一个
// ---------------------------------------------------------------------------

import {
  MAIL_PROVIDERS,
  loadMailCredentialChain,
  markMailAccountResult,
  type MailDeps,
} from './mail-accounts';
import { runSmtpSession } from './mail-smtp';

export type MkMailSendDeps = MailDeps & { __mkMailInternal?: string };

export interface MkMailSendPayload {
  标题?: string;
  subject?: string;
  名字?: string;
  fromName?: string;
  内容?: string;
  content?: string;
  html?: string;
  text?: string;
  收件人?: string | string[];
  to?: string | string[];
}

export interface MkMailSendResult {
  ok: boolean;
  message?: string;
  accountId?: string;
  provider?: string;
  from?: string;
  to?: string[];
  attempts?: Array<{ email: string; provider: string; message: string }>;
}

let mkMailInternalSecret = '';

/** 仅 mkbot-core 在 plugin_init 时调用 */
export function setMkMailInternalSecret(secret: string) {
  mkMailInternalSecret = String(secret || '');
}

function isMkInternalSendAllowed(deps: MkMailSendDeps) {
  return Boolean(
    mkMailInternalSecret &&
    deps.__mkMailInternal &&
    deps.__mkMailInternal === mkMailInternalSecret,
  );
}

function encodeMimeHeader(text: string) {
  const raw = String(text || '').trim();
  if (!raw) return '';
  if (/^[\x20-\x7E]+$/.test(raw)) return raw;
  return `=?UTF-8?B?${Buffer.from(raw, 'utf8').toString('base64')}?=`;
}

function normalizeRecipients(input: unknown): string[] {
  const list = Array.isArray(input) ? input : [input];
  const out: string[] = [];
  for (const item of list) {
    const email = String(item ?? '').trim();
    if (!email) continue;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/i.test(email)) continue;
    if (!out.includes(email)) out.push(email);
  }
  return out;
}

function parsePayload(args: unknown[]): MkMailSendPayload | null {
  if (!args.length) return null;
  const first = args[0];
  if (first && typeof first === 'object' && !Array.isArray(first)) {
    return first as MkMailSendPayload;
  }
  const [标题, 名字, 内容, 收件人] = args;
  return {
    标题: 标题 != null ? String(标题) : '',
    名字: 名字 != null ? String(名字) : '',
    内容: 内容 != null ? String(内容) : '',
    收件人: 收件人 as string | string[],
  };
}

function dotStuff(text: string) {
  return text.replace(/^\./gm, '..');
}

function buildMimeMessage(input: {
  fromEmail: string;
  fromName?: string;
  to: string[];
  subject: string;
  content: string;
}) {
  const subject = encodeMimeHeader(input.subject || '(无主题)');
  const fromName = String(input.fromName || '').trim();
  const from = fromName ? `${encodeMimeHeader(fromName)} <${input.fromEmail}>` : input.fromEmail;
  const body = String(input.content ?? '');
  const isHtml = /<[a-z][\s\S]*>/i.test(body);
  const encodedBody = Buffer.from(body, 'utf8').toString('base64');
  const foldedBody = encodedBody.replace(/.{1,76}/g, (m) => `${m}\r\n`).trimEnd();
  return dotStuff([
    `From: ${from}`,
    `To: ${input.to.join(', ')}`,
    `Subject: ${subject}`,
    `Date: ${new Date().toUTCString()}`,
    'MIME-Version: 1.0',
    `Content-Type: ${isHtml ? 'text/html' : 'text/plain'}; charset=UTF-8`,
    'Content-Transfer-Encoding: base64',
    '',
    foldedBody,
  ].join('\r\n'));
}

/** 渠道名可指定优先服务商；不匹配时按绑定顺序发送 */
function sortByPreferredProvider<T extends { providerName: string }>(chain: T[], channel: string) {
  const key = String(channel || '').trim();
  if (!key || key === '邮箱' || key === '自动') return chain;
  const preset = MAIL_PROVIDERS.find((p) => p.id === key || p.name === key);
  if (!preset) return chain;
  return [
    ...chain.filter((item) => item.providerName === preset.name),
    ...chain.filter((item) => item.providerName !== preset.name),
  ];
}

/**
 * MK 插件内部发信。渠道名仅用于指定优先服务商，
 * 实际发送遍历全部已绑定邮箱，失败才轮替下一个。
 */
export async function sendMkMail(
  deps: MkMailSendDeps,
  channel: string,
  args: unknown[],
): Promise<MkMailSendResult> {
  if (!isMkInternalSendAllowed(deps)) {
    return { ok: false, message: '发邮箱仅允许 MK 插件内部调用' };
  }

  const payload = parsePayload(args);
  if (!payload) return { ok: false, message: '缺少发信参数' };

  const subject = String(payload.标题 ?? payload.subject ?? '').trim() || '(无主题)';
  const fromNameInput = String(payload.名字 ?? payload.fromName ?? '').trim();
  const content = String(payload.内容 ?? payload.content ?? payload.html ?? payload.text ?? '');
  const recipients = normalizeRecipients(payload.收件人 ?? payload.to);

  if (!recipients.length) return { ok: false, message: '收件人无效或为空' };
  if (!content.trim()) return { ok: false, message: '邮件内容不能为空' };

  const chain = sortByPreferredProvider(loadMailCredentialChain(deps), channel);
  if (!chain.length) {
    return { ok: false, message: '未绑定可用邮箱，请先在后台进阶设置中绑定' };
  }

  const attempts: Array<{ email: string; provider: string; message: string }> = [];

  for (const item of chain) {
    const raw = buildMimeMessage({
      fromEmail: item.email,
      // 账号自定义名字优先；账号未填时才回退到调用方给的默认名字
      fromName: item.fromName || fromNameInput,
      to: recipients,
      subject,
      content,
    });

    const result = await runSmtpSession(item.cred, {
      from: item.email,
      recipients,
      message: raw,
      timeoutMs: 30000,
    });
    markMailAccountResult(deps, item.id, result.ok, result.message);

    if (result.ok) {
      return {
        ok: true,
        message: result.message,
        accountId: item.id,
        provider: item.providerName,
        from: item.email,
        to: recipients,
        attempts,
      };
    }
    attempts.push({ email: item.email, provider: item.providerName, message: result.message });
  }

  return {
    ok: false,
    message: `已绑定的 ${attempts.length} 个邮箱均发送失败：${attempts
      .map((a) => `${a.email} ${a.message}`)
      .join('；')}`,
    attempts,
  };
}