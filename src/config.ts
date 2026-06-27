/**
 * Configuration for the SOGo MCP connector.
 *
 * All values come from environment variables. Only SOGO_HOST, SOGO_USERNAME
 * and SOGO_PASSWORD are strictly required; everything else is derived from the
 * host with sensible SOGo/Zentyal defaults.
 */

export interface SogoConfig {
  host: string;
  username: string;
  password: string;

  imapHost: string;
  imapPort: number;

  smtpHost: string;
  smtpPort: number;
  /** STARTTLS (587) when false, implicit TLS (465) when true. */
  smtpSecure: boolean;

  davUrl: string;

  /** Address used in the From header when sending mail. */
  fromAddress: string;

  /** When true, TLS certificates are NOT verified (self-signed servers). */
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

export function getConfig(): SogoConfig {
  const host = (process.env.SOGO_HOST || '').trim();
  const username = (process.env.SOGO_USERNAME || '').trim();
  const password = process.env.SOGO_PASSWORD || '';

  const smtpPort = int(process.env.SMTP_PORT, 587);

  return {
    host,
    username,
    password,
    imapHost: (process.env.IMAP_HOST || host).trim(),
    imapPort: int(process.env.IMAP_PORT, 993),
    smtpHost: (process.env.SMTP_HOST || host).trim(),
    smtpPort,
    smtpSecure: bool(process.env.SMTP_SECURE, smtpPort === 465),
    davUrl: (process.env.SOGO_DAV_URL || `https://${host}/SOGo/dav`)
      .trim()
      .replace(/\/+$/, ''),
    fromAddress: (process.env.SOGO_FROM || username).trim(),
    allowInsecureTls: bool(process.env.SOGO_ALLOW_INSECURE_TLS, false),
  };
}

export function assertCredentials(config: SogoConfig): string | null {
  if (!config.host) {
    return 'Missing SOGO_HOST. Set the SOGo server hostname (e.g. mail.example.com).';
  }
  if (!config.username || !config.password) {
    return 'Missing credentials. Set SOGO_USERNAME and SOGO_PASSWORD.';
  }
  return null;
}
