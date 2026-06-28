/**
 * Configuration for the SOGo MCP connector (single account).
 *
 * The account is read from the environment:
 *   SOGO_HOST / SOGO_USERNAME / SOGO_PASSWORD  (required)
 *   IMAP_HOST / IMAP_PORT / SMTP_HOST / SMTP_PORT / SMTP_SECURE  (optional)
 *   SOGO_DAV_URL / SOGO_FROM / SOGO_ALLOW_INSECURE_TLS           (optional)
 *
 * Note: on SOGo the IMAP/SMTP login is usually the FULL email address, even if
 * the web interface accepts a short username.
 */

export interface SogoConfig {
  host: string;
  username: string;
  password: string;

  imapHost: string;
  imapPort: number;

  smtpHost: string;
  smtpPort: number;
  smtpSecure: boolean;

  davUrl: string;
  fromAddress: string;
  allowInsecureTls: boolean;
}

function bool(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined || value === '') return fallback;
  return /^(1|true|yes|on)$/i.test(value.trim());
}

function int(value: string | undefined, fallback: number): number {
  const n = parseInt((value ?? '').trim(), 10);
  return Number.isFinite(n) ? n : fallback;
}

/**
 * Normalise a hostname: tolerate a full URL ("https://mail.x/SOGo"), a trailing
 * slash, or an accidental :port, and reduce it to a bare hostname.
 */
function cleanHost(value: string | undefined): string {
  return (value || '')
    .trim()
    .replace(/^[a-z][a-z0-9+.-]*:\/\//i, '')
    .replace(/\/.*$/, '')
    .replace(/:\d+$/, '')
    .trim();
}

/** Build the single account configuration from the environment. */
export function getConfig(): SogoConfig {
  const host = cleanHost(process.env.SOGO_HOST);
  const username = (process.env.SOGO_USERNAME || '').trim();
  const smtpPort = int(process.env.SMTP_PORT, 587);
  return {
    host,
    username,
    password: process.env.SOGO_PASSWORD || '',
    imapHost: cleanHost(process.env.IMAP_HOST) || host,
    imapPort: int(process.env.IMAP_PORT, 993),
    smtpHost: cleanHost(process.env.SMTP_HOST) || host,
    smtpPort,
    smtpSecure: process.env.SMTP_SECURE
      ? bool(process.env.SMTP_SECURE, false)
      : smtpPort === 465,
    davUrl: (process.env.SOGO_DAV_URL || `https://${host}/SOGo/dav`)
      .trim()
      .replace(/\/+$/, ''),
    fromAddress: (process.env.SOGO_FROM || username).trim(),
    allowInsecureTls: bool(process.env.SOGO_ALLOW_INSECURE_TLS, false),
  };
}

/** Validate that the account has the minimum required fields. */
export function assertCredentials(config: SogoConfig): string | null {
  if (!config.host) {
    return 'Missing SOGo server host. Set the hostname (e.g. mail.example.com).';
  }
  if (!config.username || !config.password) {
    return 'Missing credentials. Set the username and password.';
  }
  return null;
}
