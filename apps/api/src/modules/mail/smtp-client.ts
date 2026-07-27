import { connect as tlsConnect } from 'tls';
import { createConnection, Socket } from 'net';

export interface SmtpConfig {
  host: string;
  port: number;
  secure: boolean;
  user?: string;
  pass?: string;
  from: string;
}

export interface OutgoingMail {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

/**
 * Minimal SMTP client (AUTH LOGIN, STARTTLS optional) without external deps.
 * Suitable for self-hosted KeenDNS / local mail relay.
 */
export async function sendSmtp(config: SmtpConfig, mail: OutgoingMail): Promise<void> {
  const socket = await openSocket(config);
  try {
    await expect(socket, 220);
    await write(socket, `EHLO dah.local\r\n`);
    await expect(socket, 250);

    if (!config.secure && config.port !== 465) {
      await write(socket, `STARTTLS\r\n`);
      await expect(socket, 220);
      const upgraded = await upgradeTls(socket, config.host);
      await write(upgraded, `EHLO dah.local\r\n`);
      await expect(upgraded, 250);
      await authAndSend(upgraded, config, mail);
      await write(upgraded, `QUIT\r\n`);
      upgraded.end();
      return;
    }

    await authAndSend(socket, config, mail);
    await write(socket, `QUIT\r\n`);
    socket.end();
  } catch (err) {
    socket.destroy();
    throw err;
  }
}

async function authAndSend(socket: Socket, config: SmtpConfig, mail: OutgoingMail) {
  if (config.user && config.pass) {
    await write(socket, `AUTH LOGIN\r\n`);
    await expect(socket, 334);
    await write(socket, `${Buffer.from(config.user).toString('base64')}\r\n`);
    await expect(socket, 334);
    await write(socket, `${Buffer.from(config.pass).toString('base64')}\r\n`);
    await expect(socket, 235);
  }

  await write(socket, `MAIL FROM:<${extractEmail(config.from)}>\r\n`);
  await expect(socket, 250);
  await write(socket, `RCPT TO:<${extractEmail(mail.to)}>\r\n`);
  await expect(socket, 250);
  await write(socket, `DATA\r\n`);
  await expect(socket, 354);

  const boundary = `dah_${Date.now()}`;
  const headers = [
    `From: ${config.from}`,
    `To: ${mail.to}`,
    `Subject: =?UTF-8?B?${Buffer.from(mail.subject).toString('base64')}?=`,
    `MIME-Version: 1.0`,
    `Date: ${new Date().toUTCString()}`,
  ];

  let body: string;
  if (mail.html) {
    headers.push(`Content-Type: multipart/alternative; boundary="${boundary}"`);
    body = [
      `--${boundary}`,
      `Content-Type: text/plain; charset=UTF-8`,
      ``,
      mail.text,
      `--${boundary}`,
      `Content-Type: text/html; charset=UTF-8`,
      ``,
      mail.html,
      `--${boundary}--`,
      ``,
    ].join('\r\n');
  } else {
    headers.push(`Content-Type: text/plain; charset=UTF-8`);
    body = mail.text;
  }

  const data = `${headers.join('\r\n')}\r\n\r\n${body}\r\n.\r\n`;
  await write(socket, data);
  await expect(socket, 250);
}

function extractEmail(from: string): string {
  const m = from.match(/<([^>]+)>/);
  return m ? m[1] : from.trim();
}

function openSocket(config: SmtpConfig): Promise<Socket> {
  return new Promise((resolve, reject) => {
    if (config.secure || config.port === 465) {
      const s = tlsConnect(
        { host: config.host, port: config.port, servername: config.host },
        () => resolve(s),
      );
      s.on('error', reject);
    } else {
      const s = createConnection({ host: config.host, port: config.port }, () => resolve(s));
      s.on('error', reject);
    }
  });
}

function upgradeTls(socket: Socket, host: string): Promise<Socket> {
  return new Promise((resolve, reject) => {
    const s = tlsConnect({ socket, servername: host }, () => resolve(s));
    s.on('error', reject);
  });
}

function write(socket: Socket, data: string): Promise<void> {
  return new Promise((resolve, reject) => {
    socket.write(data, (err) => (err ? reject(err) : resolve()));
  });
}

function expect(socket: Socket, code: number): Promise<string> {
  return new Promise((resolve, reject) => {
    let buf = '';
    const onData = (chunk: Buffer) => {
      buf += chunk.toString('utf8');
      if (!buf.includes('\n')) return;
      // multi-line SMTP: last line is "CODE ..."
      const lines = buf.split(/\r?\n/).filter(Boolean);
      const last = lines[lines.length - 1] ?? '';
      if (/^\d{3}-/.test(last)) return; // continuation
      const match = last.match(/^(\d{3})/);
      if (!match) return;
      socket.off('data', onData);
      socket.off('error', onErr);
      const got = Number(match[1]);
      if (got === code || (code === 250 && got >= 200 && got < 400)) {
        resolve(buf);
      } else {
        reject(new Error(`SMTP expected ${code}, got: ${buf.trim()}`));
      }
    };
    const onErr = (err: Error) => {
      socket.off('data', onData);
      reject(err);
    };
    socket.on('data', onData);
    socket.once('error', onErr);
  });
}
