#!/usr/bin/env node
/**
 * SOGo MCP connector.
 *
 * Exposes one or more self-hosted SOGo / Zentyal groupware accounts (mail,
 * calendar, contacts) to Claude over the Model Context Protocol, using the
 * standard IMAP / SMTP / CalDAV / CardDAV protocols.
 *
 * Every tool accepts an optional `account` parameter to choose which configured
 * account to act on (by label or email). When omitted, the primary account is
 * used. Use `sogo_list_accounts` to see what is configured.
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

import {
  getAccounts,
  assertCredentials,
  resolveAccount,
  type SogoConfig,
} from './config.js';
import {
  listEmails,
  searchEmails,
  readEmail,
  listMailboxes,
  deleteEmail,
  type EmailSummary,
} from './clients/imap.js';
import { sendEmail } from './clients/smtp.js';
import {
  listCalendars,
  listEvents,
  createEvent,
  deleteEvent,
  listAddressBooks,
  listContacts,
  createContact,
  deleteContact,
} from './clients/dav.js';

const server = new McpServer({
  name: 'sogo_mcp',
  version: '1.2.0',
});

type TextResult = {
  content: { type: 'text'; text: string }[];
  isError?: boolean;
};

function text(body: string, isError = false): TextResult {
  return { content: [{ type: 'text', text: body }], isError };
}

function fail(error: unknown): TextResult {
  const message = error instanceof Error ? error.message : String(error);
  let hint = '';
  if (/unknown account/i.test(message)) {
    hint = ''; // already actionable
  } else if (/auth|login|credential|invalid/i.test(message)) {
    hint =
      '\nCheck the username / password (on SOGo the IMAP login is usually the full email address).';
  } else if (/self.signed|certificate|altname|tls/i.test(message)) {
    hint =
      '\nTLS certificate problem. If your SOGo server uses a self-signed certificate, enable "Allow insecure TLS".';
  } else if (/ECONNREFUSED|ENOTFOUND|timeout|EAI_AGAIN/i.test(message)) {
    hint =
      '\nCannot reach the server. Verify the host, ports, and that the server is reachable from this machine.';
  }
  return text(`Error: ${message}${hint}`, true);
}

/** Resolve the requested account, validating the primary account first. */
function requireAccount(account?: string): SogoConfig {
  const accounts = getAccounts();
  const problem = assertCredentials(accounts[0]);
  if (problem) throw new Error(problem);
  return resolveAccount(accounts, account);
}

/** Shared schema fragment: optional account selector present on every tool. */
const accountField = {
  account: z
    .string()
    .optional()
    .describe(
      'Which configured account to use (label or email). Omit to use the primary account.'
    ),
};

function formatSummary(e: EmailSummary): string {
  const flags = [
    e.seen ? '' : '🔵 unread',
    e.flagged ? '⭐ flagged' : '',
    e.hasAttachments ? '📎' : '',
  ]
    .filter(Boolean)
    .join(' ');
  return [
    `• [uid ${e.uid}] ${e.subject}`,
    `   From: ${e.from || '(unknown)'}`,
    `   Date: ${e.date || '(unknown)'}${flags ? '   ' + flags : ''}`,
  ].join('\n');
}

/* ----------------------------- Accounts ------------------------------ */

server.registerTool(
  'sogo_list_accounts',
  {
    title: 'List configured accounts',
    description:
      'List the SOGo accounts configured in this connector (labels and emails). ' +
      'Use a label or email as the "account" parameter of other tools to target a specific account.',
    inputSchema: {},
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
  async () => {
    try {
      const accounts = getAccounts();
      const problem = assertCredentials(accounts[0]);
      if (problem) return text(`Error: ${problem}`, true);
      return text(
        `Configured accounts (${accounts.length}):\n` +
          accounts
            .map(
              (a, i) =>
                `• ${a.label}${i === 0 ? ' (primary)' : ''} — ${a.username} @ ${a.host}`
            )
            .join('\n')
      );
    } catch (e) {
      return fail(e);
    }
  }
);

/* ------------------------------- Mail -------------------------------- */

server.registerTool(
  'sogo_list_emails',
  {
    title: 'List emails',
    description:
      'List recent emails from a SOGo mailbox (default INBOX), newest first. ' +
      'Returns a summary (uid, sender, subject, date, flags). Use sogo_read_email with a uid to read the full message.',
    inputSchema: {
      mailbox: z
        .string()
        .default('INBOX')
        .describe('Mailbox/folder name (e.g. "INBOX", "Sent", "Drafts").'),
      limit: z
        .number()
        .int()
        .min(1)
        .max(100)
        .default(20)
        .describe('Maximum number of emails to return (1-100).'),
      unseen_only: z
        .boolean()
        .default(false)
        .describe('When true, return only unread messages.'),
      ...accountField,
    },
    annotations: { readOnlyHint: true, openWorldHint: true },
  },
  async ({ mailbox, limit, unseen_only, account }) => {
    try {
      const config = requireAccount(account);
      const emails = await listEmails(config, mailbox, limit, unseen_only);
      if (emails.length === 0) {
        return text(`No emails found in "${mailbox}" (account: ${config.label}).`);
      }
      return text(
        `Found ${emails.length} email(s) in "${mailbox}" (account: ${config.label}):\n\n` +
          emails.map(formatSummary).join('\n\n')
      );
    } catch (e) {
      return fail(e);
    }
  }
);

server.registerTool(
  'sogo_search_emails',
  {
    title: 'Search emails',
    description:
      'Search a mailbox for emails whose subject, sender or body contains the query text.',
    inputSchema: {
      query: z.string().min(1).describe('Text to search for.'),
      mailbox: z.string().default('INBOX').describe('Mailbox to search in.'),
      limit: z.number().int().min(1).max(100).default(20).describe('Max results.'),
      ...accountField,
    },
    annotations: { readOnlyHint: true, openWorldHint: true },
  },
  async ({ query, mailbox, limit, account }) => {
    try {
      const config = requireAccount(account);
      const emails = await searchEmails(config, query, mailbox, limit);
      if (emails.length === 0) {
        return text(`No emails matching "${query}" in "${mailbox}" (account: ${config.label}).`);
      }
      return text(
        `Found ${emails.length} email(s) matching "${query}" (account: ${config.label}):\n\n` +
          emails.map(formatSummary).join('\n\n')
      );
    } catch (e) {
      return fail(e);
    }
  }
);

server.registerTool(
  'sogo_read_email',
  {
    title: 'Read email',
    description:
      'Read the full content (headers and body text) of a single email identified by its uid.',
    inputSchema: {
      uid: z.number().int().describe('The uid of the email (from sogo_list_emails).'),
      mailbox: z.string().default('INBOX').describe('Mailbox the email is in.'),
      mark_seen: z
        .boolean()
        .default(false)
        .describe('Mark the message as read after fetching.'),
      ...accountField,
    },
    annotations: { readOnlyHint: true, openWorldHint: true },
  },
  async ({ uid, mailbox, mark_seen, account }) => {
    try {
      const config = requireAccount(account);
      const email = await readEmail(config, uid, mailbox, mark_seen);
      if (!email) return text(`No email with uid ${uid} in "${mailbox}".`);
      const parts = [
        `Account: ${config.label}`,
        `Subject: ${email.subject}`,
        `From: ${email.from}`,
        `To: ${email.to}`,
        email.cc ? `Cc: ${email.cc}` : '',
        `Date: ${email.date}`,
        email.attachments.length
          ? `Attachments: ${email.attachments.join('; ')}`
          : '',
        '',
        email.text || '(empty body)',
      ].filter(Boolean);
      return text(parts.join('\n'));
    } catch (e) {
      return fail(e);
    }
  }
);

server.registerTool(
  'sogo_list_mailboxes',
  {
    title: 'List mailboxes',
    description: 'List all mailboxes/folders available in the account.',
    inputSchema: { ...accountField },
    annotations: { readOnlyHint: true, openWorldHint: true },
  },
  async ({ account }) => {
    try {
      const config = requireAccount(account);
      const boxes = await listMailboxes(config);
      return text(
        `Mailboxes for ${config.label} (${boxes.length}):\n` +
          boxes
            .map((b) => `• ${b.path}${b.specialUse ? ` (${b.specialUse})` : ''}`)
            .join('\n')
      );
    } catch (e) {
      return fail(e);
    }
  }
);

server.registerTool(
  'sogo_send_email',
  {
    title: 'Send email',
    description:
      'Send an email through the SOGo SMTP server, from the configured account.',
    inputSchema: {
      to: z.string().min(1).describe('Recipient(s), comma-separated.'),
      subject: z.string().describe('Email subject.'),
      body: z.string().describe('Email body.'),
      cc: z.string().optional().describe('Cc recipient(s), comma-separated.'),
      bcc: z.string().optional().describe('Bcc recipient(s), comma-separated.'),
      html: z
        .boolean()
        .default(false)
        .describe('Treat body as HTML instead of plain text.'),
      ...accountField,
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      openWorldHint: true,
    },
  },
  async ({ to, subject, body, cc, bcc, html, account }) => {
    try {
      const config = requireAccount(account);
      const result = await sendEmail(config, { to, subject, body, cc, bcc, html });
      return text(
        `Email sent from ${config.label} (id ${result.messageId}).\n` +
          `Accepted: ${result.accepted.join(', ') || 'none'}` +
          (result.rejected.length ? `\nRejected: ${result.rejected.join(', ')}` : '')
      );
    } catch (e) {
      return fail(e);
    }
  }
);

server.registerTool(
  'sogo_delete_email',
  {
    title: 'Delete email',
    description:
      'Delete an email by uid. By default it is moved to the Trash folder; set permanent=true to delete it irreversibly.',
    inputSchema: {
      uid: z.number().int().describe('The uid of the email (from sogo_list_emails).'),
      mailbox: z.string().default('INBOX').describe('Mailbox the email is in.'),
      permanent: z
        .boolean()
        .default(false)
        .describe('Permanently delete instead of moving to Trash.'),
      ...accountField,
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: true,
      openWorldHint: true,
    },
  },
  async ({ uid, mailbox, permanent, account }) => {
    try {
      const config = requireAccount(account);
      const result = await deleteEmail(config, uid, mailbox, permanent);
      return text(`Email uid ${uid} (account ${config.label}): ${result.action}.`);
    } catch (e) {
      return fail(e);
    }
  }
);

/* ----------------------------- Calendar ------------------------------ */

server.registerTool(
  'sogo_list_calendars',
  {
    title: 'List calendars',
    description: 'List the calendars available in the account.',
    inputSchema: { ...accountField },
    annotations: { readOnlyHint: true, openWorldHint: true },
  },
  async ({ account }) => {
    try {
      const config = requireAccount(account);
      const calendars = await listCalendars(config);
      if (calendars.length === 0) return text('No calendars found.');
      return text(
        `Calendars for ${config.label} (${calendars.length}):\n` +
          calendars.map((c) => `• ${c.displayName}\n   ${c.url}`).join('\n')
      );
    } catch (e) {
      return fail(e);
    }
  }
);

server.registerTool(
  'sogo_list_events',
  {
    title: 'List calendar events',
    description:
      'List calendar events within a time window (default: next 7 days), across all calendars.',
    inputSchema: {
      days_ahead: z
        .number()
        .int()
        .min(0)
        .max(366)
        .default(7)
        .describe('How many days into the future to include.'),
      days_back: z
        .number()
        .int()
        .min(0)
        .max(366)
        .default(0)
        .describe('How many days into the past to include.'),
      limit: z.number().int().min(1).max(200).default(50).describe('Max events.'),
      ...accountField,
    },
    annotations: { readOnlyHint: true, openWorldHint: true },
  },
  async ({ days_ahead, days_back, limit, account }) => {
    try {
      const config = requireAccount(account);
      const events = await listEvents(config, days_ahead, limit, days_back);
      if (events.length === 0) {
        return text(`No events found in the selected window (account: ${config.label}).`);
      }
      return text(
        `Found ${events.length} event(s) for ${config.label}:\n\n` +
          events
            .map((e) =>
              [
                `• ${e.summary}`,
                `   ${e.start} → ${e.end}`,
                e.location ? `   📍 ${e.location}` : '',
                e.calendar ? `   🗓 ${e.calendar}` : '',
              ]
                .filter(Boolean)
                .join('\n')
            )
            .join('\n\n')
      );
    } catch (e) {
      return fail(e);
    }
  }
);

server.registerTool(
  'sogo_create_event',
  {
    title: 'Create calendar event',
    description:
      'Create a new calendar event. Datetimes must be ISO 8601 (e.g. 2026-07-01T14:00:00). ' +
      'If no calendar_url is given, the first calendar is used.',
    inputSchema: {
      title: z.string().min(1).describe('Event title.'),
      start: z.string().describe('Start datetime, ISO 8601.'),
      end: z.string().describe('End datetime, ISO 8601.'),
      description: z.string().optional().describe('Event description/notes.'),
      location: z.string().optional().describe('Event location.'),
      calendar_url: z
        .string()
        .optional()
        .describe('Target calendar URL (from sogo_list_calendars).'),
      ...accountField,
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      openWorldHint: true,
    },
  },
  async ({ title, start, end, description, location, calendar_url, account }) => {
    try {
      const config = requireAccount(account);
      const result = await createEvent(config, {
        title,
        start,
        end,
        description,
        location,
        calendarUrl: calendar_url,
      });
      return text(
        `Event "${title}" created in calendar "${result.calendar}" (account ${config.label}, uid ${result.uid}).`
      );
    } catch (e) {
      return fail(e);
    }
  }
);

server.registerTool(
  'sogo_delete_event',
  {
    title: 'Delete calendar event',
    description:
      'Delete a calendar event by its uid (as returned when listing or creating events). Searches all calendars.',
    inputSchema: {
      uid: z.string().min(1).describe('The uid of the event to delete.'),
      ...accountField,
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: true,
      openWorldHint: true,
    },
  },
  async ({ uid, account }) => {
    try {
      const config = requireAccount(account);
      const result = await deleteEvent(config, uid);
      if (!result.deleted) return text(`No event found with uid ${uid}.`);
      return text(
        `Event deleted${result.summary ? ` ("${result.summary}")` : ''} (account ${config.label}, uid ${uid}).`
      );
    } catch (e) {
      return fail(e);
    }
  }
);

/* ----------------------------- Contacts ------------------------------ */

server.registerTool(
  'sogo_list_address_books',
  {
    title: 'List address books',
    description: 'List the address books available in the account.',
    inputSchema: { ...accountField },
    annotations: { readOnlyHint: true, openWorldHint: true },
  },
  async ({ account }) => {
    try {
      const config = requireAccount(account);
      const books = await listAddressBooks(config);
      if (books.length === 0) return text('No address books found.');
      return text(
        `Address books for ${config.label} (${books.length}):\n` +
          books.map((b) => `• ${b.displayName}\n   ${b.url}`).join('\n')
      );
    } catch (e) {
      return fail(e);
    }
  }
);

server.registerTool(
  'sogo_list_contacts',
  {
    title: 'List / search contacts',
    description:
      'List contacts from all address books, optionally filtered by a search term ' +
      '(matches name, email or organization).',
    inputSchema: {
      search: z
        .string()
        .optional()
        .describe('Optional filter on name, email or organization.'),
      limit: z.number().int().min(1).max(500).default(50).describe('Max contacts.'),
      ...accountField,
    },
    annotations: { readOnlyHint: true, openWorldHint: true },
  },
  async ({ search, limit, account }) => {
    try {
      const config = requireAccount(account);
      const contacts = await listContacts(config, search, limit);
      if (contacts.length === 0) {
        return text(
          search
            ? `No contacts matching "${search}" (account: ${config.label}).`
            : `No contacts found (account: ${config.label}).`
        );
      }
      return text(
        `Found ${contacts.length} contact(s) for ${config.label}:\n\n` +
          contacts
            .map((c) =>
              [
                `• ${c.name}`,
                c.emails.length ? `   ✉ ${c.emails.join(', ')}` : '',
                c.phones.length ? `   ☎ ${c.phones.join(', ')}` : '',
                c.organization ? `   🏢 ${c.organization}` : '',
              ]
                .filter(Boolean)
                .join('\n')
            )
            .join('\n\n')
      );
    } catch (e) {
      return fail(e);
    }
  }
);

server.registerTool(
  'sogo_create_contact',
  {
    title: 'Create contact',
    description:
      'Create a new contact in an address book. If no address_book_url is given, the first one is used.',
    inputSchema: {
      name: z.string().min(1).describe('Full name of the contact.'),
      email: z.string().optional().describe('Email address.'),
      phone: z.string().optional().describe('Phone number.'),
      organization: z.string().optional().describe('Organization / company.'),
      address_book_url: z
        .string()
        .optional()
        .describe('Target address book URL (from sogo_list_address_books).'),
      ...accountField,
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      openWorldHint: true,
    },
  },
  async ({ name, email, phone, organization, address_book_url, account }) => {
    try {
      const config = requireAccount(account);
      const result = await createContact(config, {
        name,
        email,
        phone,
        organization,
        addressBookUrl: address_book_url,
      });
      return text(
        `Contact "${name}" created in "${result.addressBook}" (account ${config.label}, uid ${result.uid}).`
      );
    } catch (e) {
      return fail(e);
    }
  }
);

server.registerTool(
  'sogo_delete_contact',
  {
    title: 'Delete contact',
    description:
      'Delete a contact by its uid (as returned when listing or creating contacts). Searches all address books.',
    inputSchema: {
      uid: z.string().min(1).describe('The uid of the contact to delete.'),
      ...accountField,
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: true,
      openWorldHint: true,
    },
  },
  async ({ uid, account }) => {
    try {
      const config = requireAccount(account);
      const result = await deleteContact(config, uid);
      if (!result.deleted) return text(`No contact found with uid ${uid}.`);
      return text(
        `Contact deleted${result.name ? ` ("${result.name}")` : ''} (account ${config.label}, uid ${uid}).`
      );
    } catch (e) {
      return fail(e);
    }
  }
);

/* ------------------------------- Main -------------------------------- */

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('SOGo MCP connector running (stdio).');
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
