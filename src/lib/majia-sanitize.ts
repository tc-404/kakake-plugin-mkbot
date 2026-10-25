// ---------------------------------------------------------------------------
// 马甲系统：清理 QQ 昵称中的不可见字符与花式拉丁字母，保留正常标点（《》等）
// ---------------------------------------------------------------------------

/** 不可见、零宽、双向排版控制符 */
const MAJIA_INVISIBLE_RE = /[\u200B-\u200F\u202A-\u202E\u2060-\u2064\u2066-\u2069\uFEFF]/g;

/** 拉丁小型大写 / 修饰字母等（如 ᴡsᴍ，非普通 a-z） */
const MAJIA_FANCY_LATIN_RE = /[\u1D00-\u1DBF\uA720-\uA7FF]/g;

/**
 * 马甲拼接用昵称：去掉特殊 Unicode，书名号等常见标点保留。
 */
export function sanitizeMajiaNickname(name: string): string {
  let s = String(name ?? '');
  s = s.replace(MAJIA_INVISIBLE_RE, '');
  s = s.replace(MAJIA_FANCY_LATIN_RE, '');
  s = s.replace(/\s+/g, ' ').trim();
  return s;
}

/** 前缀 + 清理后的昵称 */
export function buildMajiaCard(prefix: string, nickname: string): string {
  const clean = sanitizeMajiaNickname(nickname);
  if (!clean) return String(prefix ?? '');
  return String(prefix ?? '') + clean;
}
