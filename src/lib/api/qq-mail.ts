// ---------------------------------------------------------------------------
// 旧版 QQ 邮箱配置（SMTP 465 / smtp.qq.com）— 已被 mail-accounts.ts 的多邮箱绑定取代
// 现在仅保留读取能力，供 mail-accounts.ts 把旧槽位一次性迁移成绑定列表
// 数据目录：筱筱吖/邮箱配置/QQ邮箱/
// ---------------------------------------------------------------------------

import fs from 'fs';
import path from 'path';
import tls from 'tls';
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  scryptSync,
} from 'crypto';

export const QQ_MAIL_ROOT = '筱筱吖/邮箱配置/QQ邮箱/';
const INDEX_FILE = 'slots.index.json';
const SEAL_DIR = 'seal';
const VAULT_PEPPER = 'mkbot.qqmail.vault.pepper.v2';
const SMTP_HOST = 'smtp.qq.com';
const SMTP_PORT = 465;

export type QqMailSlotStatus = 'empty' | 'incomplete' | 'unknown' | 'ok' | 'fail';

export interface QqMailPublicSlot {
  slot: number;
  email: string;
  hasAuth: boolean;
  configured: boolean;
  status: QqMailSlotStatus;
  statusMsg: string;
  lastCheckAt: string | null;
}

export interface QqMailDeps {
  readA: (relPath: string) => string | null | undefined;
  writeA: (relPath: string, content: string) => void;
  getDataPath: () => string;
}

interface QqMailSlotRecord {
  slot: number;
  email: string;
  hasAuth: boolean;
  authRev: number;
  status: QqMailSlotStatus;
  statusMsg: string;
  lastCheckAt: string | null;
}

interface SealMeta {
  iv: string;
  tag: string;
  rev: number;
  mix: string;
}

function absRoot(deps: QqMailDeps) {
  return path.join(deps.getDataPath(), QQ_MAIL_ROOT);
}

function absSealDir(deps: QqMailDeps, slot: number) {
  return path.join(absRoot(deps), SEAL_DIR, String(slot));
}

function readJsonFile<T>(filePath: string, fallback: T): T {
  if (!fs.existsSync(filePath)) return fallback;
  try {
    const obj = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    return obj as T;
  } catch {
    return fallback;
  }
}

function writeJsonFile(filePath: string, data: unknown) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
}

function defaultSlotRecord(slot: number): QqMailSlotRecord {
  return {
    slot,
    email: '',
    hasAuth: false,
    authRev: 0,
    status: 'empty',
    statusMsg: '',
    lastCheckAt: null,
  };
}

function loadSlotRecords(deps: QqMailDeps): QqMailSlotRecord[] {
  const indexPath = path.join(absRoot(deps), INDEX_FILE);
  const raw = readJsonFile<{ slots?: QqMailSlotRecord[] }>(indexPath, { slots: [] });
  const map = new Map<number, QqMailSlotRecord>();
  for (const item of raw.slots || []) {
    const slot = Number(item?.slot);
    if (slot === 1 || slot === 2) {
      map.set(slot, {
        ...defaultSlotRecord(slot),
        ...item,
        slot,
        email: String(item.email || '').trim(),
        hasAuth: !!item.hasAuth,
        authRev: Number(item.authRev) || 0,
        status: normalizeStatus(item.status, item),
        statusMsg: String(item.statusMsg || ''),
        lastCheckAt: item.lastCheckAt ? String(item.lastCheckAt) : null,
      });
    }
  }
  return [1, 2].map((slot) => map.get(slot) || defaultSlotRecord(slot));
}

function saveSlotRecords(deps: QqMailDeps, slots: QqMailSlotRecord[]) {
  const indexPath = path.join(absRoot(deps), INDEX_FILE);
  writeJsonFile(indexPath, { slots });
}

function normalizeStatus(status: unknown, item: Partial<QqMailSlotRecord>): QqMailSlotStatus {
  const allowed: QqMailSlotStatus[] = ['empty', 'incomplete', 'unknown', 'ok', 'fail'];
  if (typeof status === 'string' && allowed.includes(status as QqMailSlotStatus)) {
    return status as QqMailSlotStatus;
  }
  const email = String(item.email || '').trim();
  if (!email) return 'empty';
  if (!item.hasAuth) return 'incomplete';
  return 'unknown';
}

function deriveKey(deps: QqMailDeps, slot: number, rev: number) {
  const material = `${deps.getDataPath()}|${QQ_MAIL_ROOT}|${slot}|${rev}|${VAULT_PEPPER}`;
  return scryptSync(material, `slot-${slot}-salt`, 32);
}

function deriveMixKey(deps: QqMailDeps, slot: number, rev: number, mix: string) {
  const material = `${mix}|${deps.getDataPath()}|${slot}|${rev}`;
  return scryptSync(material, 'qq-mail-mix', 32);
}

function xorBuffer(buf: Buffer, key: Buffer) {
  const out = Buffer.alloc(buf.length);
  for (let i = 0; i < buf.length; i++) out[i] = buf[i] ^ key[i % key.length];
  return out;
}

function encryptAuthCode(deps: QqMailDeps, slot: number, rev: number, authCode: string) {
  const key = deriveKey(deps, slot, rev);
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const enc = Buffer.concat([cipher.update(authCode, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  const mix = randomBytes(16).toString('hex');
  const mixKey = deriveMixKey(deps, slot, rev, mix);
  const mixKeyRev = Buffer.from(mixKey).reverse();
  const mid = Math.ceil(enc.length / 2);
  const partA = xorBuffer(enc.subarray(0, mid), mixKey);
  const partB = xorBuffer(enc.subarray(mid), mixKeyRev);
  const decoy = randomBytes(24 + (slot * 7));
  return {
    meta: { iv: iv.toString('base64'), tag: tag.toString('base64'), rev, mix } as SealMeta,
    partA: partA.toString('base64'),
    partB: partB.toString('base64'),
    decoy: decoy.toString('base64'),
    fingerprint: createHash('sha256').update(`${authCode}|${rev}|${slot}`).digest('hex').slice(0, 16),
  };
}

function decryptAuthCode(deps: QqMailDeps, slot: number, record: QqMailSlotRecord): string | null {
  if (!record.hasAuth || !record.authRev) return null;
  const sealDir = absSealDir(deps, slot);
  const meta = readJsonFile<SealMeta | null>(path.join(sealDir, 'meta.json'), null);
  const partA = fs.existsSync(path.join(sealDir, 'chunk.alpha'))
    ? fs.readFileSync(path.join(sealDir, 'chunk.alpha'), 'utf-8').trim()
    : '';
  const partB = fs.existsSync(path.join(sealDir, 'chunk.beta'))
    ? fs.readFileSync(path.join(sealDir, 'chunk.beta'), 'utf-8').trim()
    : '';
  if (!meta || !partA || !partB) return null;
  try {
    const mixKey = deriveMixKey(deps, slot, meta.rev, meta.mix);
    const mixKeyRev = Buffer.from(mixKey).reverse();
    const bufA = xorBuffer(Buffer.from(partA, 'base64'), mixKey);
    const bufB = xorBuffer(Buffer.from(partB, 'base64'), mixKeyRev);
    const enc = Buffer.concat([bufA, bufB]);
    const key = deriveKey(deps, slot, meta.rev);
    const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(meta.iv, 'base64'));
    decipher.setAuthTag(Buffer.from(meta.tag, 'base64'));
    const plain = Buffer.concat([
      decipher.update(enc),
      decipher.final(),
    ]).toString('utf8');
    return plain;
  } catch {
    return null;
  }
}

function writeSeal(deps: QqMailDeps, slot: number, authCode: string, rev: number) {
  const sealDir = absSealDir(deps, slot);
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
  const sealed = encryptAuthCode(deps, slot, rev, authCode);
  writeJsonFile(path.join(sealDir, 'meta.json'), sealed.meta);
  fs.writeFileSync(path.join(sealDir, 'chunk.alpha'), sealed.partA, 'utf-8');
  fs.writeFileSync(path.join(sealDir, 'chunk.beta'), sealed.partB, 'utf-8');
  fs.writeFileSync(path.join(sealDir, 'noise.dat'), sealed.decoy, 'utf-8');
  fs.writeFileSync(path.join(sealDir, 'fp.sig'), sealed.fingerprint, 'utf-8');
}

function clearSeal(deps: QqMailDeps, slot: number) {
  const sealDir = absSealDir(deps, slot);
  if (!fs.existsSync(sealDir)) return;
  for (const name of fs.readdirSync(sealDir)) {
    try {
      fs.unlinkSync(path.join(sealDir, name));
    } catch {
      /* ignore */
    }
  }
}

function toPublicSlot(record: QqMailSlotRecord): QqMailPublicSlot {
  const email = record.email.trim();
  const configured = !!(email && record.hasAuth);
  let status = record.status;
  if (!email && !record.hasAuth) status = 'empty';
  else if (email && !record.hasAuth) status = 'incomplete';
  else if (status === 'empty') status = 'unknown';
  return {
    slot: record.slot,
    email,
    hasAuth: record.hasAuth,
    configured,
    status,
    statusMsg: record.statusMsg,
    lastCheckAt: record.lastCheckAt,
  };
}

function isValidQqMail(email: string) {
  return /^[^\s@]+@(qq\.com|foxmail\.com)$/i.test(email.trim());
}

export function listQqMailSlots(deps: QqMailDeps) {
  const slots = loadSlotRecords(deps).map(toPublicSlot);
  return { slots };
}

export function saveQqMailSlot(
  deps: QqMailDeps,
  input: {
    slot?: unknown;
    email?: unknown;
    authCode?: unknown;
    clear?: unknown;
  },
) {
  const slot = Number(input.slot);
  if (slot !== 1 && slot !== 2) return { ok: false as const, message: 'invalid_slot' };

  const slots = loadSlotRecords(deps);
  const idx = slot - 1;
  const current = { ...slots[idx] };

  if (input.clear === true || input.clear === 'true' || input.clear === 1 || input.clear === '1') {
    clearSeal(deps, slot);
    slots[idx] = defaultSlotRecord(slot);
    saveSlotRecords(deps, slots);
    return { ok: true as const, data: { slot, cleared: true } };
  }

  const email = String(input.email ?? current.email ?? '').trim();

  if (email && !isValidQqMail(email)) {
    return { ok: false as const, message: 'invalid_email' };
  }

  const authCodeRaw = String(input.authCode ?? '').trim();
  let authCodeOnce: string | undefined;
  let authChanged = false;

  if (authCodeRaw) {
    writeSeal(deps, slot, authCodeRaw, (current.authRev || 0) + 1);
    current.authRev = (current.authRev || 0) + 1;
    current.hasAuth = true;
    authChanged = true;
    authCodeOnce = authCodeRaw;
  } else if (!current.hasAuth && email) {
    return { ok: false as const, message: 'auth_required' };
  }

  current.email = email;
  if (!email && !current.hasAuth) {
    current.status = 'empty';
    current.statusMsg = '';
    current.lastCheckAt = null;
  } else if (email && !current.hasAuth) {
    current.status = 'incomplete';
    current.statusMsg = '缺少授权码';
  } else if (authChanged) {
    current.status = 'unknown';
    current.statusMsg = '授权码已更新，请刷新状态验证';
    current.lastCheckAt = null;
  }

  slots[idx] = current;
  saveSlotRecords(deps, slots);

  const data: Record<string, unknown> = {
    slot,
    email: current.email,
    hasAuth: current.hasAuth,
    status: current.status,
    statusMsg: current.statusMsg,
  };
  if (authCodeOnce) data.authCodeOnce = authCodeOnce;

  return { ok: true as const, data };
}

function smtpVerifyLogin(email: string, authCode: string): Promise<{ ok: boolean; message: string }> {
  return new Promise((resolve) => {
    let settled = false;
    let buffer = '';
    let phase: 'greet' | 'ehlo' | 'auth' | 'user' | 'pass' | 'done' = 'greet';
    let ehloPending = false;

    const finish = (result: { ok: boolean; message: string }) => {
      if (settled) return;
      settled = true;
      try {
        socket.end();
        socket.destroy();
      } catch {
        /* ignore */
      }
      resolve(result);
    };

    const socket = tls.connect(
      { host: SMTP_HOST, port: SMTP_PORT, servername: SMTP_HOST, rejectUnauthorized: true },
      () => {},
    );

    socket.setTimeout(20000, () => finish({ ok: false, message: 'SMTP 连接超时' }));

    socket.on('data', (chunk: Buffer) => {
      buffer += chunk.toString('utf8');
      const parts = buffer.split(/\r?\n/);
      buffer = parts.pop() || '';

      for (const line of parts) {
        if (!line || line.length < 3) continue;
        const code = Number.parseInt(line.slice(0, 3), 10);
        if (Number.isNaN(code)) continue;

        if (code >= 400 && phase !== 'done') {
          finish({ ok: false, message: (line.slice(4).trim() || `SMTP 错误 (${code})`) });
          return;
        }

        if (phase === 'greet' && code === 220) {
          phase = 'ehlo';
          ehloPending = true;
          socket.write('EHLO mkbot.local\r\n');
        } else if (phase === 'ehlo' && code === 250) {
          if (ehloPending && line.length > 3 && line[3] === ' ') {
            ehloPending = false;
            phase = 'auth';
            socket.write('AUTH LOGIN\r\n');
          }
        } else if (phase === 'auth' && code === 334) {
          phase = 'user';
          socket.write(`${Buffer.from(email, 'utf8').toString('base64')}\r\n`);
        } else if (phase === 'user' && code === 334) {
          phase = 'pass';
          socket.write(`${Buffer.from(authCode, 'utf8').toString('base64')}\r\n`);
        } else if (phase === 'pass') {
          phase = 'done';
          if (code === 235) finish({ ok: true, message: 'SMTP 登录验证成功' });
          else finish({ ok: false, message: line.slice(4).trim() || `SMTP 认证失败 (${code})` });
          return;
        }
      }
    });

    socket.on('error', (err) => finish({ ok: false, message: err.message || 'SMTP 连接失败' }));
  });
}

export async function verifyQqMailSlot(deps: QqMailDeps, slotInput: unknown) {
  const slot = Number(slotInput);
  if (slot !== 1 && slot !== 2) return { ok: false as const, message: 'invalid_slot' };

  const slots = loadSlotRecords(deps);
  const idx = slot - 1;
  const record = { ...slots[idx] };

  if (!record.email.trim()) {
    return { ok: false as const, message: 'not_configured' };
  }
  if (!record.hasAuth) {
    record.status = 'incomplete';
    record.statusMsg = '缺少授权码';
    record.lastCheckAt = new Date().toISOString();
    slots[idx] = record;
    saveSlotRecords(deps, slots);
    return {
      ok: true as const,
      data: { slot, status: record.status, statusMsg: record.statusMsg, lastCheckAt: record.lastCheckAt },
    };
  }

  const authCode = decryptAuthCode(deps, slot, record);
  if (!authCode) {
    record.status = 'fail';
    record.statusMsg = '授权码读取失败，请重新设置';
    record.lastCheckAt = new Date().toISOString();
    slots[idx] = record;
    saveSlotRecords(deps, slots);
    return {
      ok: true as const,
      data: { slot, status: record.status, statusMsg: record.statusMsg, lastCheckAt: record.lastCheckAt },
    };
  }

  const result = await smtpVerifyLogin(record.email.trim(), authCode);
  record.status = result.ok ? 'ok' : 'fail';
  record.statusMsg = result.message;
  record.lastCheckAt = new Date().toISOString();
  slots[idx] = record;
  saveSlotRecords(deps, slots);

  return {
    ok: true as const,
    data: {
      slot,
      status: record.status,
      statusMsg: record.statusMsg,
      lastCheckAt: record.lastCheckAt,
    },
  };
}

export async function verifyAllQqMailSlots(deps: QqMailDeps) {
  const results = [];
  for (const slot of [1, 2]) {
    const r = await verifyQqMailSlot(deps, slot);
    if (r.ok && r.data) results.push(r.data);
    else results.push({ slot, status: 'empty' as QqMailSlotStatus, statusMsg: r.message || 'skip', lastCheckAt: null });
  }
  return { ok: true as const, data: { results, slots: loadSlotRecords(deps).map(toPublicSlot) } };
}

/** 供 MK 内部发信模块读取；不暴露给 Web GET */
export function loadQqMailCredentials(deps: QqMailDeps, slot: number) {
  if (slot !== 1 && slot !== 2) return null;
  const record = loadSlotRecords(deps)[slot - 1];
  if (!record.email.trim() || !record.hasAuth) return null;
  const authCode = decryptAuthCode(deps, slot, record);
  if (!authCode) return null;
  return {
    email: record.email.trim(),
    authCode,
    smtpHost: SMTP_HOST,
    smtpPort: SMTP_PORT,
  };
}

/** 槽位 1 或 2 任一侧完整配置即视为可用 */
export function hasQqMailConfigured(deps: QqMailDeps): boolean {
  return !!(loadQqMailCredentials(deps, 1) || loadQqMailCredentials(deps, 2));
}
