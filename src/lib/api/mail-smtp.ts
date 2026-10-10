// ---------------------------------------------------------------------------
// 通用 SMTP 客户端 — 支持 SSL(465) / STARTTLS(587) / 无加密(25)
// 登录校验与实际发信共用同一套会话状态机
// ---------------------------------------------------------------------------

import net from 'net';
import tls from 'tls';

export type MailSecurity = 'ssl' | 'starttls' | 'none';

export interface SmtpCredential {
  host: string;
  port: number;
  security: MailSecurity;
  /** 登录用户名，通常与邮箱地址相同 */
  user: string;
  /** 授权码 / 密码 / SMTP Key（同一个东西，按服务商叫法不同） */
  pass: string;
}

export interface SmtpResult {
  ok: boolean;
  message: string;
}

export interface SmtpTask {
  /** MAIL FROM 地址；带收件人时必填 */
  from?: string;
  recipients?: string[];
  /** 已构造好的 MIME 报文，不含结尾的 \r\n.\r\n */
  message?: string;
  timeoutMs?: number;
}

type Phase =
  | 'greet'
  | 'ehlo'
  | 'starttls'
  | 'auth_login'
  | 'auth_user'
  | 'auth_pass'
  | 'auth_plain'
  | 'mail_from'
  | 'rcpt'
  | 'data'
  | 'body'
  | 'done';

const EHLO_NAME = 'mkbot.local';

function b64(text: string) {
  return Buffer.from(text, 'utf8').toString('base64');
}

/** 常见失败码翻译成可读提示，避免后台只显示一串英文 */
function explainSmtpError(code: number, detail: string) {
  const raw = detail.trim();
  if (code === 535 || code === 534 || code === 538) {
    return `认证被拒绝（${code}）：授权码/密码不正确，或该邮箱未开启 SMTP 服务${raw ? ` · ${raw}` : ''}`;
  }
  if (code === 550 || code === 553) {
    return `服务器拒绝（${code}）：发件地址与登录账号不一致或收件人无效${raw ? ` · ${raw}` : ''}`;
  }
  if (code === 554) {
    return `服务器拒绝投递（554）${raw ? `：${raw}` : ''}`;
  }
  if (code === 421 || code === 450 || code === 451 || code === 452) {
    return `服务器暂时不可用（${code}）${raw ? `：${raw}` : ''}`;
  }
  return raw || `SMTP 错误 (${code})`;
}

/**
 * 执行一次 SMTP 会话。
 * 只传凭据时做登录校验；同时传 recipients + message 时执行投递。
 */
export function runSmtpSession(cred: SmtpCredential, task: SmtpTask = {}): Promise<SmtpResult> {
  const timeoutMs = task.timeoutMs && task.timeoutMs > 0 ? task.timeoutMs : 30000;
  const recipients = Array.isArray(task.recipients) ? task.recipients.filter(Boolean) : [];
  const wantSend = Boolean(task.message && recipients.length);
  const mailFrom = String(task.from || cred.user || '').trim();

  return new Promise<SmtpResult>((resolve) => {
    let settled = false;
    let buffer = '';
    let replyLines: string[] = [];
    let phase: Phase = 'greet';
    let tlsUpgraded = cred.security === 'ssl';
    let rcptIndex = 0;
    let socket: net.Socket | tls.TLSSocket;

    const finish = (result: SmtpResult) => {
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

    const write = (line: string) => {
      try {
        socket.write(`${line}\r\n`);
      } catch (error) {
        finish({ ok: false, message: (error as Error)?.message || 'SMTP 写入失败' });
      }
    };

    const onAuthed = () => {
      if (!wantSend) {
        finish({ ok: true, message: 'SMTP 登录验证成功' });
        return;
      }
      phase = 'mail_from';
      write(`MAIL FROM:<${mailFrom}>`);
    };

    const startAuth = (caps: string[]) => {
      const authCap = caps.find((c) => c.startsWith('AUTH')) || '';
      if (authCap.includes('LOGIN') || !authCap.includes('PLAIN')) {
        phase = 'auth_login';
        write('AUTH LOGIN');
        return;
      }
      phase = 'auth_plain';
      write(`AUTH PLAIN ${b64(`\0${cred.user}\0${cred.pass}`)}`);
    };

    const upgradeToTls = () => {
      const plain = socket;
      plain.removeAllListeners('data');
      plain.removeAllListeners('error');
      plain.removeAllListeners('timeout');
      const secure = tls.connect(
        { socket: plain, servername: cred.host, rejectUnauthorized: true },
        () => {
          tlsUpgraded = true;
          buffer = '';
          replyLines = [];
          phase = 'ehlo';
          write(`EHLO ${EHLO_NAME}`);
        },
      );
      socket = secure;
      attach(secure);
    };

    const onReply = (code: number, lines: string[]) => {
      const last = lines[lines.length - 1] || '';
      if (code >= 400) {
        finish({ ok: false, message: explainSmtpError(code, last.slice(4)) });
        return;
      }

      switch (phase) {
        case 'greet':
          if (code === 220) {
            phase = 'ehlo';
            write(`EHLO ${EHLO_NAME}`);
          }
          break;

        case 'ehlo': {
          if (code !== 250) return;
          const caps = lines.map((l) => l.slice(4).trim().toUpperCase());
          if (cred.security === 'starttls' && !tlsUpgraded) {
            if (!caps.some((c) => c.startsWith('STARTTLS'))) {
              finish({ ok: false, message: '服务器未提供 STARTTLS，请改用 SSL 或关闭加密' });
              return;
            }
            phase = 'starttls';
            write('STARTTLS');
            return;
          }
          startAuth(caps);
          break;
        }

        case 'starttls':
          if (code === 220) upgradeToTls();
          break;

        case 'auth_login':
          if (code === 334) {
            phase = 'auth_user';
            write(b64(cred.user));
          }
          break;

        case 'auth_user':
          if (code === 334) {
            phase = 'auth_pass';
            write(b64(cred.pass));
          }
          break;

        case 'auth_pass':
        case 'auth_plain':
          if (code === 235 || code === 200 || code === 250) onAuthed();
          else finish({ ok: false, message: explainSmtpError(code, last.slice(4)) });
          break;

        case 'mail_from':
          if (code === 250) {
            phase = 'rcpt';
            rcptIndex = 0;
            write(`RCPT TO:<${recipients[0]}>`);
          }
          break;

        case 'rcpt':
          if (code === 250 || code === 251) {
            rcptIndex += 1;
            if (rcptIndex < recipients.length) {
              write(`RCPT TO:<${recipients[rcptIndex]}>`);
            } else {
              phase = 'data';
              write('DATA');
            }
          }
          break;

        case 'data':
          if (code === 354) {
            phase = 'body';
            try {
              socket.write(`${task.message}\r\n.\r\n`);
            } catch (error) {
              finish({ ok: false, message: (error as Error)?.message || 'SMTP 报文写入失败' });
            }
          }
          break;

        case 'body':
          if (code === 250) {
            phase = 'done';
            finish({ ok: true, message: '邮件发送成功' });
          }
          break;

        default:
          break;
      }
    };

    const feed = (chunk: Buffer) => {
      buffer += chunk.toString('utf8');
      const parts = buffer.split(/\r?\n/);
      buffer = parts.pop() || '';
      for (const line of parts) {
        if (line.length < 3) continue;
        const code = Number.parseInt(line.slice(0, 3), 10);
        if (Number.isNaN(code)) continue;
        replyLines.push(line);
        // 多行应答以 "250-" 续行，最后一行是 "250 " 或纯 3 位码
        if (line.length > 3 && line[3] !== ' ') continue;
        const lines = replyLines;
        replyLines = [];
        onReply(code, lines);
        if (settled) return;
      }
    };

    function attach(target: net.Socket | tls.TLSSocket) {
      target.setTimeout(timeoutMs, () => finish({ ok: false, message: 'SMTP 连接超时' }));
      target.on('data', feed);
      target.on('error', (err: Error) =>
        finish({ ok: false, message: err?.message || 'SMTP 连接失败' }),
      );
    }

    if (cred.security === 'ssl') {
      socket = tls.connect({
        host: cred.host,
        port: cred.port,
        servername: cred.host,
        rejectUnauthorized: true,
      });
    } else {
      socket = net.connect({ host: cred.host, port: cred.port });
    }
    attach(socket);
  });
}