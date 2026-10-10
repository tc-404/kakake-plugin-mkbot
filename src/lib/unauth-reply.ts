import { 发消息, 段_引用, 段_文本 } from '../BOT';

export const DEFAULT_UNAUTH_REPLY = 'MK没能量啦～要充电电～～';

export type MkReadBFn = (path: string, key: string, defaultValue?: unknown) => unknown;

type MkMessageEventLike = { message_id?: unknown };

export async function sendUnauthReplyIfEnabled(
  event: MkMessageEventLike,
  readB: MkReadBFn,
): Promise<void> {
  const noauth = readB('config.json', 'noauth', true);
  const noauthnr = readB('config.json', 'noauthnr', DEFAULT_UNAUTH_REPLY);
  if (noauth && noauthnr) {
    await 发消息(event, [段_引用(event.message_id), 段_文本(String(noauthnr))]);
  }
}

/** @returns true 表示已授权 */
export async function requireAuthorized(
  RC_sq: string,
  event: MkMessageEventLike,
  readB: MkReadBFn,
  silent = false,
): Promise<boolean> {
  if (RC_sq === '已授权') return true;
  if (!silent) await sendUnauthReplyIfEnabled(event, readB);
  return false;
}
