# Changelog

All notable changes to this project are documented here.
This project follows [Semantic Versioning](https://semver.org/).

## [1.3.0] — 2026-06-28

### Changed
- **Single-account connector.** The multi-account feature has been removed. The
  connector now manages exactly one SOGo account, configured from `SOGO_HOST` /
  `SOGO_USERNAME` / `SOGO_PASSWORD` (plus the optional overrides). This matches
  the common case of a single mailbox and removes a frequent source of
  configuration errors.

### Removed
- The **Extra accounts (JSON)** configuration field and the `SOGO_EXTRA_ACCOUNTS`
  environment variable.
- The `sogo_list_accounts` tool.
- The optional `account` parameter on every tool.

### Fixed
- The build now writes **both** `dist/index.js` and `server/index.mjs` in one
  step (`esbuild.config.mjs`). Previously `npm run build` only produced
  `dist/index.js`, while the `.mcpb` ships `server/index.mjs` — the two could
  silently drift, so a rebuilt package could keep shipping stale code.

### Added
- Standalone test scripts `test-imap.mjs` and `test-smtp.mjs` for quick IMAP /
  SMTP connectivity checks outside Claude Desktop.

### Notes
- Hostnames are still normalised automatically (a `https://…` prefix or trailing
  path is stripped — `cleanHost`).
- After installing this version, **fully quit and relaunch Claude Desktop** so
  the new server process is loaded.

## [1.2.x] — earlier

- Multi-account support (extra accounts, per-tool `account` parameter,
  `sogo_list_accounts`).
- Tolerate `https://` and a path in the host field.
- Mail, calendar and contacts over IMAP / SMTP / CalDAV / CardDAV, packaged as a
  Claude Desktop `.mcpb` extension.
