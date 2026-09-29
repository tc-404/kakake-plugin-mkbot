// @ts-nocheck
// ---------------------------------------------------------------------------
// 发卡系统 · 邮箱二次发送（兑换成功私聊后可选同步发邮件）
// ---------------------------------------------------------------------------

import type { CardShopDeps } from '../types';
import { hasMailConfigured } from '../lib/api/mail-accounts';

const CARD_SHOP_ROOT = `筱筱吖/扩展功能/发卡系统/`;
export const CARD_SHOP_EMAIL_RESEND_FILE = '邮箱二次发送.json';

export const CARD_SHOP_MAIL_SUBJECT = '【MKbot发卡系统】您的卡密已送达';
export const CARD_SHOP_MAIL_FROM_NAME = 'MKbot发卡系统';

function loadEmailResendSettingsRaw(deps: CardShopDeps) {
  const content = deps.readA(`${CARD_SHOP_ROOT}${CARD_SHOP_EMAIL_RESEND_FILE}`);
  if (!content) return { enabled: false };
  try {
    const obj = JSON.parse(content);
    return obj && typeof obj === 'object' ? obj : { enabled: false };
  } catch {
    return { enabled: false };
  }
}

export function isCardShopEmailResendEnabled(deps: CardShopDeps): boolean {
  const raw = loadEmailResendSettingsRaw(deps);
  return raw.enabled === true || raw.enabled === 'true' || raw.enabled === 1 || raw.enabled === '1';
}

export function getCardShopEmailResendSettings(deps: CardShopDeps) {
  const enabled = isCardShopEmailResendEnabled(deps);
  const mailConfigured = hasMailConfigured(deps);
  return {
    enabled,
    mailConfigured,
    canSend: enabled && mailConfigured,
  };
}

export function setCardShopEmailResendEnabled(deps: CardShopDeps, enabled: boolean) {
  deps.writeA(
    `${CARD_SHOP_ROOT}${CARD_SHOP_EMAIL_RESEND_FILE}`,
    JSON.stringify({ enabled: !!enabled }, null, 2),
  );
  return getCardShopEmailResendSettings(deps);
}

function buildCardShopMailBody(input: {
  productName: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  cardLines: string[];
  remaining: number;
  qq: string;
}) {
  const cardText = input.cardLines.map((line, idx) => `${idx + 1}. ${line}`).join('\n');
  return [
    'MKbot 发卡系统 · 兑换成功',
    '══════════════',
    `QQ：${input.qq}`,
    `商品：${input.productName} × ${input.quantity}`,
    `消耗：${input.totalPrice} 归笺（单价 ${input.unitPrice}）`,
    `当前剩余归笺：${input.remaining}`,
    '',
    '卡密内容：',
    cardText,
    '',
    '请妥善保管，勿泄露给他人。',
    '══════════════',
    '此邮件由 MKbot 发卡系统自动发送',
  ].join('\n');
}

/** 兑换成功后调用；失败静默，不影响私聊发货结果 */
export async function trySendCardShopExchangeEmail(
  deps: CardShopDeps,
  input: {
    userId: unknown;
    productName: string;
    quantity: number;
    unitPrice: number;
    totalPrice: number;
    cardLines: string[];
    remaining: number;
  },
) {
  if (!isCardShopEmailResendEnabled(deps)) return;
  if (!hasMailConfigured(deps)) return;
  if (typeof deps.发邮箱 !== 'function') return;

  const qq = String(input.userId ?? '').trim().replace(/\D/g, '');
  if (!qq) return;

  const content = buildCardShopMailBody({
    ...input,
    qq,
  });

  try {
    await deps.发邮箱('邮箱', {
      标题: CARD_SHOP_MAIL_SUBJECT,
      名字: CARD_SHOP_MAIL_FROM_NAME,
      内容: content,
      收件人: `${qq}@qq.com`,
    });
  } catch {
    /* 邮件失败不阻断兑换 */
  }
}
