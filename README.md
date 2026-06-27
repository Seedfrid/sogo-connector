# SOGo Connector for Claude Desktop

A Model Context Protocol (MCP) connector that lets Claude work with your
**self-hosted SOGo / Zentyal** account — mail, calendar and contacts — using
the standard open protocols **IMAP, SMTP, CalDAV and CardDAV**. No Google, no
Microsoft, no third-party cloud.

Packaged as a one-click **`.mcpb`** bundle for Claude Desktop.

## Features

| Area | Tools |
|------|-------|
| 📧 **Mail** | list, search, read full message, send, delete, list folders |
| 📅 **Calendar** | list calendars, list events in a window, create & delete events |
| 👥 **Contacts** | list address books, list/search contacts, create & delete contacts |

Complete tool list (15): `sogo_list_accounts`, `sogo_list_emails`,
`sogo_search_emails`, `sogo_read_email`, `sogo_list_mailboxes`,
`sogo_send_email`, `sogo_delete_email`, `sogo_list_calendars`,
`sogo_list_events`, `sogo_create_event`, `sogo_delete_event`,
`sogo_list_address_books`, `sogo_list_contacts`, `sogo_create_contact`,
`sogo_delete_contact`.

### Multiple accounts

The connector can manage several SOGo accounts at once. Configure the primary
account with the main fields, then add the others as a JSON array in the
**Extra accounts** field:

```json
[
  { "label": "perso", "username": "me@example.com", "password": "secret" },
  { "label": "work",  "host": "mail.work.com", "username": "me@work.com", "password": "secret" }
]
```

Fields omitted in an extra account (host, ports, DAV URL, TLS) inherit from the
primary account. Every tool then accepts an optional `account` parameter (a
label or email) to target a specific account — e.g. *"list unread emails in my
work account"*. Omit it to use the primary account, and use `sogo_list_accounts`
to see what is configured.

> **SOGo login tip:** use the **full email address** as the username (e.g.
> `you@example.com`), even if the SOGo web interface lets you log in with just a
> short name — IMAP/SMTP require the full address.

> Deletions are designed to be safe: `sogo_delete_email` moves the message to
> Trash by default (pass `permanent: true` to delete irreversibly); calendar
> and contact deletions are by `uid`.

## Install (recommended — one click)

1. Download **`sogo-connector.mcpb`** from this folder (or the Releases page).
2. Open **Claude Desktop → Settings → Extensions**.
3. Drag and drop the `.mcpb` file (or click **Install** and select it).
4. Fill in the configuration fields:
   - **SOGo server host** — e.g. `mail.example.com` (no `https://`)
   - **Username / email** — your full SOGo login
   - **Password**
   - *(optional)* DAV URL, IMAP/SMTP ports, "Allow insecure TLS"
5. Enable the extension. Done — ask Claude *"list my unread emails"* or
   *"what's on my calendar next week?"*.

The defaults (IMAP 993, SMTP 587 STARTTLS, DAV at `https://<host>/SOGo/dav`)
match a standard SOGo / Zentyal install, so usually only host + login +
password are needed.

> **Self-signed certificate?** Many self-hosted servers use one. Turn on
> **Allow insecure TLS** in the configuration if the connection fails with a
> certificate error.

## Configuration reference

| Field | Env var | Default | Required |
|-------|---------|---------|----------|
| SOGo server host | `SOGO_HOST` | — | ✅ |
| Username / email | `SOGO_USERNAME` | — | ✅ |
| Password | `SOGO_PASSWORD` | — | ✅ |
| DAV URL | `SOGO_DAV_URL` | `https://<host>/SOGo/dav` | |
| IMAP port | `IMAP_PORT` | `993` | |
| SMTP port | `SMTP_PORT` | `587` | |
| Allow insecure TLS | `SOGO_ALLOW_INSECURE_TLS` | `false` | |

## Security

- Credentials are stored by Claude Desktop and passed only to the local
  connector process. They are never sent to any third party.
- All connections go **directly** from your machine to your SOGo server over
  TLS (IMAPS / SMTP+STARTTLS / HTTPS).
- The connector writes no logs of your password and stores no data.

## Build from source

Requires Node.js 18+.

```bash
npm install
npm run typecheck     # type-check (no emit)
npm run build         # bundle to dist/index.js (single file, via esbuild)
```

Package the `.mcpb` yourself:

```bash
npm install -g @anthropic-ai/mcpb
mkdir -p build/server
cp manifest.json build/
cp dist/index.js build/server/index.mjs
mcpb validate build/manifest.json
mcpb pack build sogo-connector.mcpb
```

For local development you can also run the server directly over stdio:

```bash
cp .env.example .env   # fill in your credentials
SOGO_HOST=mail.example.com SOGO_USERNAME=you@example.com SOGO_PASSWORD=... \
  node dist/index.js
```

## Project layout

```
src/
  index.ts            MCP server + tool definitions
  config.ts           Environment configuration
  clients/
    imap.ts           IMAP (list/search/read) via ImapFlow
    smtp.ts           SMTP (send) via Nodemailer
    dav.ts            CalDAV + CardDAV via tsdav, parsing via ical.js
manifest.json         MCPB manifest (Claude Desktop)
esbuild.config.mjs    Single-file bundler config
```

## Troubleshooting

- **Authentication failed** — verify the login works in SOGo webmail; the
  username is usually the full email address.
- **Certificate / TLS error** — enable *Allow insecure TLS* (self-signed cert).
- **Cannot connect** — check the host and that ports 993 / 587 and the SOGo
  web port are reachable from your machine (firewall / VPN).

## License

MIT
