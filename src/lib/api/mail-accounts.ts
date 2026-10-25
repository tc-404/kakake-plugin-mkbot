// ---------------------------------------------------------------------------
// 邮箱绑定 — 支持多服务商、最多 10 个账号，发信按列表顺序失败轮替
// 数据目录：筱筱吖/邮箱配置/
//   绑定列表.json     账号索引（不含密钥）
//   凭据/<id>/        授权码分片加密后的密文
// ---------------------------------------------------------------------------

import fs from 'fs';
import path from 'path';
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  scryptSync,
} from 'crypto';
import type { MailSecurity } from './mail-smtp';
import { runSmtpSession } from './mail-smtp';
import { loadQqMailCredentials } from './qq-mail';

export const MAIL_ROOT = '筱筱吖/邮箱配置/';
export const MAIL_MAX_ACCOUNTS = 10;
const INDEX_FILE = '绑定列表.json';
const SEAL_DIR = '凭据';
const VAULT_PEPPER = 'mkbot.mail.vault.pepper.v1';

export type MailProviderId = 'qq' | 'netease' | 'feishu' | 'dingtalk' | 'custom';
export type MailAccountStatus = 'unknown' | 'ok' | 'fail';
export type { MailSecurity };

export interface MailProviderPreset {
  id: MailProviderId;
  name: string;
  smtpHost: string;
  smtpPort: number;
  security: MailSecurity;
  /** 授权凭据在该服务商的叫法 */
  secretLabel: string;
  /** true 表示 SMTP 参数由后台按标准写死，前端不可改 */
  fixed: boolean;
  /** 该服务商的常见邮箱域名，仅用于填充输入框示例 */
  domains: string[];
  /** true 表示邮箱域名必须落在 domains 内；企业自定义域名的服务商须为 false */
  strictDomain: boolean;
  hint: string;
}

export const MAIL_PROVIDERS: MailProviderPreset[] = [
  {
    id: 'qq',
    name: 'QQ邮箱',
    smtpHost: 'smtp.qq.com',
    smtpPort: 465,
    security: 'ssl',
    secretLabel: '客户端授权码',
    fixed: true,
    domains: ['qq.com', 'foxmail.com', 'vip.qq.com'],
    strictDomain: true,
    hint: 'QQ 邮箱设置 → 账号与安全 → 生成授权码（不是 QQ 密码）',
  },
  {
    id: 'netease',
    name: '网易邮箱',
    smtpHost: 'smtp.163.com',
    smtpPort: 465,
    security: 'ssl',
    secretLabel: '客户端授权码',
    fixed: true,
    domains: ['163.com', '126.com', 'yeah.net', 'vip.163.com', 'vip.126.com'],
    strictDomain: true,
    hint: '网易邮箱设置 → POP3/SMTP/IMAP → 开启服务并获取授权码',
  },
  {
    id: 'feishu',
    name: '飞书邮箱',
    smtpHost: 'smtp.feishu.cn',
    smtpPort: 465,
    security: 'ssl',
    secretLabel: '邮箱密码 / 专用密码',
    fixed: true,
    domains: ['feishu.cn'],
    strictDomain: false,
    hint: '飞书邮箱 → 设置 → 客户端登录，使用专用密码；企业自定义域名（如 name@公司域名）同样可用',
  },
  {
    id: 'dingtalk',
    name: '钉钉邮箱',
    smtpHost: 'smtp.dingtalk.com',
    smtpPort: 465,
    security: 'ssl',
    secretLabel: '邮箱密码',
    fixed: true,
    domains: ['dingtalk.com'],
    strictDomain: false,
    hint: '钉钉邮箱 → 设置 → 客户端设置，开启 SMTP 后使用邮箱密码；企业自定义域名（如 name@公司域名）同样可用',
  },
  {
    id: 'custom',
    name: '其他邮箱',
    smtpHost: '',
    smtpPort: 465,
    security: 'ssl',
    secretLabel: '授权码 / 密码 / SMTP Key',
    fixed: false,
    domains: [],
    strictDomain: false,
    hint: '普通邮箱、企业邮箱、自建邮箱通用：授权码、密码、SMTP Key 填同一个输入框即可',
  },
];

/** 网易系不同域名对应不同发信服务器 */
const NETEASE_HOSTS: Record<string, string> = {
  '163.com': 'smtp.163.com',
  '126.com': 'smtp.126.com',
  'yeah.net': 'smtp.yeah.net',
  'vip.163.com': 'smtp.vip.163.com',
  'vip.126.com': 'smtp.vip.126.com',
};

/** 「其他邮箱」的域名参数建议表，前端据此自动填充 */
export const MAIL_DOMAIN_HINTS: Record<string, { smtpHost: string; smtpPort: number; security: MailSecurity }> = {
  'gmail.com': { smtpHost: 'smtp.gmail.com', smtpPort: 465, security: 'ssl' },
  'googlemail.com': { smtpHost: 'smtp.gmail.com', smtpPort: 465, security: 'ssl' },
  'outlook.com': { smtpHost: 'smtp-mail.outlook.com', smtpPort: 587, security: 'starttls' },
  'hotmail.com': { smtpHost: 'smtp-mail.outlook.com', smtpPort: 587, security: 'starttls' },
  'live.com': { smtpHost: 'smtp-mail.outlook.com', smtpPort: 587, security: 'starttls' },
  'msn.com': { smtpHost: 'smtp-mail.outlook.com', smtpPort: 587, security: 'starttls' },
  'icloud.com': { smtpHost: 'smtp.mail.me.com', smtpPort: 587, security: 'starttls' },
  'me.com': { smtpHost: 'smtp.mail.me.com', smtpPort: 587, security: 'starttls' },
  'yahoo.com': { smtpHost: 'smtp.mail.yahoo.com', smtpPort: 465, security: 'ssl' },
  'zoho.com': { smtpHost: 'smtp.zoho.com', smtpPort: 465, security: 'ssl' },
  'sina.com': { smtpHost: 'smtp.sina.com', smtpPort: 465, security: 'ssl' },
  'sina.cn': { smtpHost: 'smtp.sina.cn', smtpPort: 465, security: 'ssl' },
  'sohu.com': { smtpHost: 'smtp.sohu.com', smtpPort: 465, security: 'ssl' },
  'aliyun.com': { smtpHost: 'smtp.aliyun.com', smtpPort: 465, security: 'ssl' },
  '139.com': { smtpHost: 'smtp.139.com', smtpPort: 465, security: 'ssl' },
  '189.cn': { smtpHost: 'smtp.189.cn', smtpPort: 465, security: 'ssl' },
  'exmail.qq.com': { smtpHost: 'smtp.exmail.qq.com', smtpPort: 465, security: 'ssl' },
  'qiye.163.com': { smtpHost: 'smtp.qiye.163.com', smtpPort: 465, security: 'ssl' },
};

export interface MailDeps {
  readA: (relPath: string) => string | null | undefined;
  writeA: (relPath: string, content: string) => void;
  getDataPath: () => string;
}

export interface MailAccountPublic {
  id: string;
  provider: MailProviderId;
  providerName: string;
  email: string;
  loginUser: string;
  fromName: string;
  smtpHost: string;
  smtpPort: number;
  security: MailSecurity;
  hasSecret: boolean;
  status: MailAccountStatus;
  statusMsg: string;
  lastCheckAt: string | null;
}

interface MailAccountRecord {
  id: string;
  provider: MailProviderId;
  email: string;
  loginUser: string;
  fromName: string;
  smtpHost: string;
  smtpPort: number;
  security: MailSecurity;
  hasSecret: boolean;
  secretRev: number;
  status: MailAccountStatus;
  statusMsg: string;
  lastCheckAt: string | null;
  createdAt: string;
}

interface SealMeta {
  iv: string;
  tag: string;
  rev: number;
  mix: string;
}

// --------------------------- 基础工具 ---------------------------

function absRoot(deps: MailDeps) {
  return path.join(deps.getDataPath(), MAIL_ROOT);
}

function absIndexPath(deps: MailDeps) {
  return path.join(absRoot(deps), INDEX_FILE);
}

function absSealDir(deps: MailDeps, id: string) {
  return path.join(absRoot(deps), SEAL_DIR, id);
}

function readJsonFile<T>(filePath: string, fallback: T): T {
  if (!fs.existsSync(filePath)) return fallback;
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8')) as T;
  } catch {
    return fallback;
  }
}

function writeJsonFile(filePath: string, data: unknown) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
}

export function getMailProvider(id: unknown): MailProviderPreset | null {
  const key = String(id ?? '').trim();
  return MAIL_PROVIDERS.find((p) => p.id === key) || null;
}

function emailDomain(email: string) {
  const at = email.lastIndexOf('@');
  return at < 0 ? '' : email.slice(at + 1).toLowerCase();
}

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

function isValidHost(host: string) {
  return /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/i.test(host.trim());
}

function normalizeSecurity(value: unknown, fallback: MailSecurity): MailSecurity {
  const key = String(value ?? '').trim().toLowerCase();
  if (key === 'ssl' || key === 'starttls' || key === 'none') return key;
  return fallback;
}

/** 按服务商标准解析 SMTP 参数；custom 走用户填写值 */
function resolveSmtpParams(
  preset: MailProviderPreset,
  email: string,
  input: { smtpHost?: unknown; smtpPort?: unknown; security?: unknown },
): { ok: true; smtpHost: string; smtpPort: number; security: MailSecurity } | { ok: false; message: string } {
  if (preset.fixed) {
    const domain = emailDomain(email);
    const host = preset.id === 'netease' ? NETEASE_HOSTS[domain] || preset.smtpHost : preset.smtpHost;
    return { ok: true, smtpHost: host, smtpPort: preset.smtpPort, security: preset.security };
  }

  const domain = emailDomain(email);
  const hint = MAIL_DOMAIN_HINTS[domain];
  const rawHost = String(input.smtpHost ?? '').trim().toLowerCase();
  const smtpHost = rawHost || hint?.smtpHost || '';
  if (!smtpHost || !isValidHost(smtpHost)) {
    return { ok: false, message: 'invalid_host' };
  }

  const rawPort = Number(input.smtpPort);
  const smtpPort = Number.isFinite(rawPort) && rawPort > 0 && rawPort <= 65535
    ? Math.trunc(rawPort)
    : (hint?.smtpPort ?? 465);

  const security = normalizeSecurity(
    input.security,
    hint?.security ?? (smtpPort === 587 ? 'starttls' : smtpPort === 25 ? 'none' : 'ssl'),
  );

  return { ok: true, smtpHost, smtpPort, security };
}

// --------------------------- 凭据分片加密 ---------------------------

function deriveKey(deps: MailDeps, id: string, rev: number) {
  const material = `${deps.getDataPath()}|${MAIL_ROOT}|${id}|${rev}|${VAULT_PEPPER}`;
  return scryptSync(material, `mail-${id}-salt`, 32);
}

function deriveMixKey(deps: MailDeps, id: string, rev: number, mix: string) {
  return scryptSync(`${mix}|${deps.getDataPath()}|${id}|${rev}`, 'mail-mix', 32);
}

function xorBuffer(buf: Buffer, key: Buffer) {
  const out = Buffer.alloc(buf.length);
  for (let i = 0; i < buf.length; i++) out[i] = buf[i] ^ key[i % key.length];
  return out;
}

function writeSeal(deps: MailDeps, id: string, secret: string, rev: number) {
  const sealDir = absSealDir(deps, id);
  if (fs.existsSync(sealDir)) {
    for (const name of fs.readdirSync(sealDir)) {
      try {
        fs.unlinkSync(path.join(sealDir, name));
      } catch {
        /* ignore */
      }
    }
  } else {
    fs.mkdirSync(sealDir, { recursive: true });
  }

  const key = deriveKey(deps, id, rev);
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const enc = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  const mix = randomBytes(16).toString('hex');
  const mixKey = deriveMixKey(deps, id, rev, mix);
  const mixKeyRev = Buffer.from(mixKey).reverse();
  const mid = Math.ceil(enc.length / 2);
  const partA = xorBuffer(enc.subarray(0, mid), mixKey);
  const partB = xorBuffer(enc.subarray(mid), mixKeyRev);

  const meta: SealMeta = { iv: iv.toString('base64'), tag: tag.toString('base64'), rev, mix };
  writeJsonFile(path.join(sealDir, 'meta.json'), meta);
  fs.writeFileSync(path.join(sealDir, 'chunk.alpha'), partA.toString('base64'), 'utf-8');
  fs.writeFileSync(path.join(sealDir, 'chunk.beta'), partB.toString('base64'), 'utf-8');
  fs.writeFileSync(path.join(sealDir, 'noise.dat'), randomBytes(32).toString('base64'), 'utf-8');
  fs.writeFileSync(
    path.join(sealDir, 'fp.sig'),
    createHash('sha256').update(`${secret}|${rev}|${id}`).digest('hex').slice(0, 16),
    'utf-8',
  );
}

function readSeal(deps: MailDeps, record: MailAccountRecord): string | null {
  if (!record.hasSecret || !record.secretRev) return null;
  const sealDir = absSealDir(deps, record.id);
  const meta = readJsonFile<SealMeta | null>(path.join(sealDir, 'meta.json'), null);
  const alphaPath = path.join(sealDir, 'chunk.alpha');
  const betaPath = path.join(sealDir, 'chunk.beta');
  if (!meta || !fs.existsSync(alphaPath) || !fs.existsSync(betaPath)) return null;
  try {
    const mixKey = deriveMixKey(deps, record.id, meta.rev, meta.mix);
    const mixKeyRev = Buffer.from(mixKey).reverse();
    const bufA = xorBuffer(Buffer.from(fs.readFileSync(alphaPath, 'utf-8').trim(), 'base64'), mixKey);
    const bufB = xorBuffer(Buffer.from(fs.readFileSync(betaPath, 'utf-8').trim(), 'base64'), mixKeyRev);
    const key = deriveKey(deps, record.id, meta.rev);
    const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(meta.iv, 'base64'));
    decipher.setAuthTag(Buffer.from(meta.tag, 'base64'));
    return Buffer.concat([decipher.update(Buffer.concat([bufA, bufB])), decipher.final()]).toString('utf8');
  } catch {
    return null;
  }
}

function clearSeal(deps: MailDeps, id: string) {
  const sealDir = absSealDir(deps, id);
  if (!fs.existsSync(sealDir)) return;
  for (const name of fs.readdirSync(sealDir)) {
    try {
      fs.unlinkSync(path.join(sealDir, name));
    } catch {
      /* ignore */
    }
  }
  try {
    fs.rmdirSync(sealDir);
  } catch {
    /* ignore */
  }
}

// --------------------------- 索引读写 ---------------------------

function newAccountId() {
  return randomBytes(6).toString('hex');
}

function normalizeRecord(raw: Partial<MailAccountRecord> | null | undefined): MailAccountRecord | null {
  if (!raw || typeof raw !== 'object') return null;
  const preset = getMailProvider(raw.provider);
  const id = String(raw.id || '').trim();
  const email = String(raw.email || '').trim();
  if (!id || !preset || !email) return null;
  const port = Number(raw.smtpPort);
  return {
    id,
    provider: preset.id,
    email,
    loginUser: String(raw.loginUser || '').trim(),
    fromName: String(raw.fromName || '').trim(),
    smtpHost: String(raw.smtpHost || preset.smtpHost || '').trim(),
    smtpPort: Number.isFinite(port) && port > 0 ? Math.trunc(port) : preset.smtpPort,
    security: normalizeSecurity(raw.security, preset.security),
    hasSecret: !!raw.hasSecret,
    secretRev: Number(raw.secretRev) || 0,
    status: raw.status === 'ok' || raw.status === 'fail' ? raw.status : 'unknown',
    statusMsg: String(raw.statusMsg || ''),
    lastCheckAt: raw.lastCheckAt ? String(raw.lastCheckAt) : null,
    createdAt: raw.createdAt ? String(raw.createdAt) : new Date().toISOString(),
  };
}

function saveRecords(deps: MailDeps, records: MailAccountRecord[]) {
  writeJsonFile(absIndexPath(deps), { version: 1, accounts: records });
}

/**
 * 旧版「QQ 邮箱槽位 1/2」一次性迁移为绑定列表，避免用户重填授权码。
 * 只在绑定列表尚未建立时执行一次。
 */
function migrateLegacyQqSlots(deps: MailDeps): MailAccountRecord[] {
  const preset = getMailProvider('qq');
  if (!preset) return [];
  const migrated: MailAccountRecord[] = [];
  for (const slot of [1, 2]) {
    let legacy: { email: string; authCode: string } | null = null;
    try {
      legacy = loadQqMailCredentials(deps, slot);
    } catch {
      legacy = null;
    }
    if (!legacy?.email || !legacy.authCode) continue;
    const id = newAccountId();
    const now = new Date().toISOString();
    writeSeal(deps, id, legacy.authCode, 1);
    migrated.push({
      id,
      provider: 'qq',
      email: legacy.email,
      loginUser: '',
      fromName: '',
      smtpHost: preset.smtpHost,
      smtpPort: preset.smtpPort,
      security: preset.security,
      hasSecret: true,
      secretRev: 1,
      status: 'unknown',
      statusMsg: '由旧版 QQ 邮箱配置迁移，建议刷新状态验证',
      lastCheckAt: null,
      createdAt: now,
    });
  }
  if (migrated.length) saveRecords(deps, migrated);
  return migrated;
}

function loadRecords(deps: MailDeps): MailAccountRecord[] {
  const indexPath = absIndexPath(deps);
  if (!fs.existsSync(indexPath)) {
    return migrateLegacyQqSlots(deps);
  }
  const raw = readJsonFile<{ accounts?: Partial<MailAccountRecord>[] }>(indexPath, { accounts: [] });
  const out: MailAccountRecord[] = [];
  for (const item of raw.accounts || []) {
    const record = normalizeRecord(item);
    if (record && !out.some((r) => r.id === record.id)) out.push(record);
  }
  return out.slice(0, MAIL_MAX_ACCOUNTS);
}

function toPublic(record: MailAccountRecord): MailAccountPublic {
  const preset = getMailProvider(record.provider);
  return {
    id: record.id,
    provider: record.provider,
    providerName: preset?.name || record.provider,
    email: record.email,
    loginUser: record.loginUser,
    fromName: record.fromName,
    smtpHost: record.smtpHost,
    smtpPort: record.smtpPort,
    security: record.security,
    hasSecret: record.hasSecret,
    status: record.status,
    statusMsg: record.statusMsg,
    lastCheckAt: record.lastCheckAt,
  };
}

// --------------------------- 对外接口 ---------------------------

export function getMailProviderCatalog() {
  return {
    max: MAIL_MAX_ACCOUNTS,
    providers: MAIL_PROVIDERS,
    hints: MAIL_DOMAIN_HINTS,
  };
}

export function listMailAccounts(deps: MailDeps) {
  return {
    max: MAIL_MAX_ACCOUNTS,
    accounts: loadRecords(deps).map(toPublic),
  };
}

export interface SaveMailAccountInput {
  id?: unknown;
  provider?: unknown;
  email?: unknown;
  secret?: unknown;
  loginUser?: unknown;
  fromName?: unknown;
  smtpHost?: unknown;
  smtpPort?: unknown;
  security?: unknown;
}

export function saveMailAccount(deps: MailDeps, input: SaveMailAccountInput) {
  const records = loadRecords(deps);
  const id = String(input.id ?? '').trim();
  const index = id ? records.findIndex((r) => r.id === id) : -1;
  if (id && index < 0) return { ok: false as const, message: 'not_found' };
  if (!id && records.length >= MAIL_MAX_ACCOUNTS) return { ok: false as const, message: 'limit_reached' };

  const preset = getMailProvider(input.provider ?? records[index]?.provider);
  if (!preset) return { ok: false as const, message: 'invalid_provider' };

  const email = String(input.email ?? '').trim();
  if (!isValidEmail(email)) return { ok: false as const, message: 'invalid_email' };
  if (preset.strictDomain && preset.domains.length && !preset.domains.includes(emailDomain(email))) {
    return { ok: false as const, message: 'domain_mismatch' };
  }
  if (records.some((r, i) => i !== index && r.email.toLowerCase() === email.toLowerCase())) {
    return { ok: false as const, message: 'duplicated' };
  }

  const smtp = resolveSmtpParams(preset, email, input);
  if (!smtp.ok) return { ok: false as const, message: smtp.message };

  const current = index >= 0 ? { ...records[index] } : null;
  const secret = String(input.secret ?? '').trim();
  if (!secret && !current?.hasSecret) return { ok: false as const, message: 'secret_required' };

  const next: MailAccountRecord = {
    id: current?.id || newAccountId(),
    provider: preset.id,
    email,
    loginUser: String(input.loginUser ?? '').trim(),
    fromName: String(input.fromName ?? '').trim(),
    smtpHost: smtp.smtpHost,
    smtpPort: smtp.smtpPort,
    security: smtp.security,
    hasSecret: current?.hasSecret ?? false,
    secretRev: current?.secretRev ?? 0,
    status: current?.status ?? 'unknown',
    statusMsg: current?.statusMsg ?? '',
    lastCheckAt: current?.lastCheckAt ?? null,
    createdAt: current?.createdAt || new Date().toISOString(),
  };

  if (secret) {
    next.secretRev = (current?.secretRev ?? 0) + 1;
    next.hasSecret = true;
    next.status = 'unknown';
    next.statusMsg = '凭据已更新，请刷新状态验证';
    next.lastCheckAt = null;
    writeSeal(deps, next.id, secret, next.secretRev);
  }

  if (index >= 0) records[index] = next;
  else records.push(next);
  saveRecords(deps, records);

  return { ok: true as const, data: { account: toPublic(next), accounts: records.map(toPublic) } };
}

export function deleteMailAccount(deps: MailDeps, idInput: unknown) {
  const id = String(idInput ?? '').trim();
  const records = loadRecords(deps);
  const index = records.findIndex((r) => r.id === id);
  if (index < 0) return { ok: false as const, message: 'not_found' };
  records.splice(index, 1);
  clearSeal(deps, id);
  saveRecords(deps, records);
  return { ok: true as const, data: { accounts: records.map(toPublic) } };
}

function buildCredential(record: MailAccountRecord, secret: string) {
  return {
    host: record.smtpHost,
    port: record.smtpPort,
    security: record.security,
    user: record.loginUser || record.email,
    pass: secret,
  };
}

export async function verifyMailAccount(deps: MailDeps, idInput: unknown) {
  const id = String(idInput ?? '').trim();
  const records = loadRecords(deps);
  const index = records.findIndex((r) => r.id === id);
  if (index < 0) return { ok: false as const, message: 'not_found' };

  const record = { ...records[index] };
  const secret = readSeal(deps, record);
  if (!secret) {
    record.status = 'fail';
    record.statusMsg = '凭据读取失败，请重新填写授权码';
  } else {
    const result = await runSmtpSession(buildCredential(record, secret), { timeoutMs: 20000 });
    record.status = result.ok ? 'ok' : 'fail';
    record.statusMsg = result.message;
  }
  record.lastCheckAt = new Date().toISOString();
  records[index] = record;
  saveRecords(deps, records);

  return { ok: true as const, data: { account: toPublic(record), accounts: records.map(toPublic) } };
}

export async function verifyAllMailAccounts(deps: MailDeps) {
  const ids = loadRecords(deps).map((r) => r.id);
  for (const id of ids) {
    await verifyMailAccount(deps, id);
  }
  return { ok: true as const, data: { accounts: loadRecords(deps).map(toPublic) } };
}

/** 供发信模块使用：按绑定顺序返回可用凭据，前一个失败再用下一个 */
export function loadMailCredentialChain(deps: MailDeps) {
  const chain: Array<{
    id: string;
    email: string;
    fromName: string;
    providerName: string;
    cred: ReturnType<typeof buildCredential>;
  }> = [];
  for (const record of loadRecords(deps)) {
    if (!record.hasSecret || !record.smtpHost) continue;
    const secret = readSeal(deps, record);
    if (!secret) continue;
    chain.push({
      id: record.id,
      email: record.email,
      fromName: record.fromName,
      providerName: getMailProvider(record.provider)?.name || record.provider,
      cred: buildCredential(record, secret),
    });
  }
  return chain;
}

/** 绑定了任意一个可用邮箱即视为已配置 */
export function hasMailConfigured(deps: MailDeps): boolean {
  return loadMailCredentialChain(deps).length > 0;
}

/** 发信结果回写，便于后台看出是哪个邮箱失败 */
export function markMailAccountResult(deps: MailDeps, id: string, ok: boolean, message: string) {
  try {
    const records = loadRecords(deps);
    const index = records.findIndex((r) => r.id === id);
    if (index < 0) return;
    records[index] = {
      ...records[index],
      status: ok ? 'ok' : 'fail',
      statusMsg: message,
      lastCheckAt: new Date().toISOString(),
    };
    saveRecords(deps, records);
  } catch {
    /* 状态回写失败不影响发信结果 */
  }
}