/**
 * IMAP client built on ImapFlow (promise-based, modern).
 *
 * Provides listing, searching and reading messages, plus mailbox discovery.
 */
import { ImapFlow, type ImapFlowOptions } from 'imapflow';
import { simpleParser } from 'mailparser';
import type { SogoConfig } from '../config.js';

export interface EmailSummary {
  uid: number;
  seq: number;
  from: string;
  to: string;
  subject: string;
  date: string;
  seen: boolean;
  flagged: boolean;
  hasAttachments: boolean;
}

export interface EmailFull extends EmailSummary {
  cc: string;
  text: string;
  attachments: string[];
}

export interface MailboxInfo {
  path: string;
  name: string;
  specialUse?: string;
  subscribed: boolean;
}

function clientOptions(config: SogoConfig): ImapFlowOptions {
  return {
    host: config.imapHost,
    port: config.imapPort,
    secure: true,
    auth: { user: config.username, pass: config.password },
    logger: false,
    tls: { rejectUnauthorized: !config.allowInsecureTls },
  };
}

function addr(value: unknown): string {
  if (!value) return '';
  const list = (value as { name?: string; address?: string }[]) || [];
  return list
    .map((a) => (a.name ? `${a.name} <${a.address}>` : a.address || ''))
    .filter(Boolean)
    .join(', ');
}

async function withClient<T>(
  config: SogoConfig,
  fn: (client: ImapFlow) => Promise<T>
): Promise<T> {
  const client = new ImapFlow(clientOptions(config));
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.logout().catch(() => client.close());
  }
}

export async function listEmails(
  config: SogoConfig,
  mailbox = 'INBOX',
  limit = 20,
  unseenOnly = false
): Promise<EmailSummary[]> {
  return withClient(config, async (client) => {
    const lock = await client.getMailboxLock(mailbox);
    try {
      const status = client.mailbox;
      const total = status && typeof status === 'object' ? status.exists : 0;
      if (!total) return [];

      const results: EmailSummary[] = [];

      // Determine which messages to fetch.
      let uids: number[] | null = null;
      if (unseenOnly) {
        const found = await client.search({ seen: false }, { uid: true });
        if (!found || found.length === 0) return [];
        uids = found.slice(-limit);
      }

      const range = uids
        ? uids.join(',')
        : `${Math.max(1, total - limit + 1)}:*`;

      for await (const msg of client.fetch(
        range,
        { uid: true, envelope: true, flags: true, bodyStructure: true },
        { uid: Boolean(uids) }
      )) {
        const env = msg.envelope;
        const flags = msg.flags || new Set<string>();
        results.push({
          uid: msg.uid,
          seq: msg.seq,
          from: addr(env?.from),
          to: addr(env?.to),
          subject: env?.subject || '(no subject)',
          date: env?.date ? new Date(env.date).toISOString() : '',
          seen: flags.has('\\Seen'),
          flagged: flags.has('\\Flagged'),
          hasAttachments: hasAttachments(msg.bodyStructure),
        });
      }

      results.sort((a, b) => (a.date < b.date ? 1 : -1));
      return results.slice(0, limit);
    } finally {
      lock.release();
    }
  });
}

export async function searchEmails(
  config: SogoConfig,
  query: string,
  mailbox = 'INBOX',
  limit = 20
): Promise<EmailSummary[]> {
  return withClient(config, async (client) => {
    const lock = await client.getMailboxLock(mailbox);
    try {
      const uids = await client.search(
        { or: [{ subject: query }, { from: query }, { body: query }] },
        { uid: true }
      );
      if (!uids || uids.length === 0) return [];

      const wanted = uids.slice(-limit);
      const results: EmailSummary[] = [];

      for await (const msg of client.fetch(
        wanted.join(','),
        { uid: true, envelope: true, flags: true, bodyStructure: true },
        { uid: true }
      )) {
        const env = msg.envelope;
        const flags = msg.flags || new Set<string>();
        results.push({
          uid: msg.uid,
          seq: msg.seq,
          from: addr(env?.from),
          to: addr(env?.to),
          subject: env?.subject || '(no subject)',
          date: env?.date ? new Date(env.date).toISOString() : '',
          seen: flags.has('\\Seen'),
          flagged: flags.has('\\Flagged'),
          hasAttachments: hasAttachments(msg.bodyStructure),
        });
      }

      results.sort((a, b) => (a.date < b.date ? 1 : -1));
      return results.slice(0, limit);
    } finally {
      lock.release();
    }
  });
}

export async function readEmail(
  config: SogoConfig,
  uid: number,
  mailbox = 'INBOX',
  markSeen = false
): Promise<EmailFull | null> {
  return withClient(config, async (client) => {
    const lock = await client.getMailboxLock(mailbox);
    try {
      const message = await client.fetchOne(
        String(uid),
        { uid: true, source: true, flags: true },
        { uid: true }
      );
      if (!message || !message.source) return null;

      const parsed = await simpleParser(message.source as Buffer);
      const flags = message.flags || new Set<string>();

      if (markSeen) {
        await client.messageFlagsAdd(String(uid), ['\\Seen'], { uid: true });
      }

      return {
        uid,
        seq: message.seq,
        from: parsed.from?.text || '',
        to: Array.isArray(parsed.to)
          ? parsed.to.map((t: any) => t.text).join(', ')
          : parsed.to?.text || '',
        cc: Array.isArray(parsed.cc)
          ? parsed.cc.map((t: any) => t.text).join(', ')
          : parsed.cc?.text || '',
        subject: parsed.subject || '(no subject)',
        date: parsed.date ? parsed.date.toISOString() : '',
        seen: flags.has('\\Seen') || markSeen,
        flagged: flags.has('\\Flagged'),
        hasAttachments: (parsed.attachments?.length || 0) > 0,
        text: parsed.text || (parsed.html ? stripHtml(parsed.html) : ''),
        attachments: (parsed.attachments || []).map(
          (a: any) => `${a.filename || 'unnamed'} (${a.contentType}, ${a.size} bytes)`
        ),
      };
    } finally {
      lock.release();
    }
  });
}

export async function deleteEmail(
  config: SogoConfig,
  uid: number,
  mailbox = 'INBOX',
  permanent = false
): Promise<{ action: string }> {
  return withClient(config, async (client) => {
    const lock = await client.getMailboxLock(mailbox);
    try {
      if (permanent) {
        await client.messageDelete(String(uid), { uid: true });
        return { action: 'permanently deleted' };
      }

      const boxes = await client.list();
      const trash =
        boxes.find((b) => b.specialUse === '\\Trash') ||
        boxes.find((b) => /trash|corbeille/i.test(b.path));

      if (!trash || trash.path === mailbox) {
        await client.messageDelete(String(uid), { uid: true });
        return { action: 'deleted (no separate Trash folder)' };
      }

      await client.messageMove(String(uid), trash.path, { uid: true });
      return { action: `moved to "${trash.path}"` };
    } finally {
      lock.release();
    }
  });
}

export async function listMailboxes(config: SogoConfig): Promise<MailboxInfo[]> {
  return withClient(config, async (client) => {
    const boxes = await client.list();
    return boxes.map((b) => ({
      path: b.path,
      name: b.name,
      specialUse: b.specialUse,
      subscribed: Boolean(b.subscribed),
    }));
  });
}

function hasAttachments(structure: unknown): boolean {
  if (!structure || typeof structure !== 'object') return false;
  const node = structure as {
    disposition?: string;
    childNodes?: unknown[];
  };
  if (node.disposition && node.disposition.toLowerCase() === 'attachment') {
    return true;
  }
  if (Array.isArray(node.childNodes)) {
    return node.childNodes.some((c) => hasAttachments(c));
  }
  return false;
}

function stripHtml(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
