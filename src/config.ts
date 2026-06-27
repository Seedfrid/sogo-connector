/**
 * Configuration for the SOGo MCP connector.
 *
 * Supports one or more accounts. The primary account comes from the
 * SOGO_HOST / SOGO_USERNAME / SOGO_PASSWORD environment variables. Additional
 * accounts can be declared as a JSON array in SOGO_EXTRA_ACCOUNTS, e.g.:
 *
 *   [
 *     { "label": "perso", "username": "me@example.com", "password": "..." },
 *     { "label": "work",  "host": "mail.work.com",
 *       "username": "me@work.com", "password": "..." }
 *   ]
 *
 * Fields omitted in an extra account inherit from the primary account
 * (host, ports, DAV URL, TLS setting).
 *
 * Note: on SOGo the IMAP/SMTP login is usually the FULL email address, even if
 * the web interface accepts a short username.
 */

export interface SogoConfig {
  /** Human-friendly name used to select this account. */
  label: string;

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

interface AccountSpec {
  label?: string;
  host?: string;
  username: string;
  password: string;
  from?: string;
  imapHost?: string;
  imapPort?: number;
  smtpHost?: string;
  smtpPort?: number;
  smtpSecure?: boolean;
  davUrl?: string;
  allowInsecureTls?: boolean;
}

interface Defaults {
  host: string;
  imapPort: number;
  smtpPort: number;
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

function buildAccount(spec: AccountSpec, defaults: Defaults): SogoConfig {
  const host = cleanHost(spec.host) || defaults.host;
  const smtpPort = spec.smtpPort ?? defaults.smtpPort;
  const username = (spec.username || '').trim();
  return {
    label: (spec.label || username).trim(),
    host,
    username,
    password: spec.password || '',
    imapHost: cleanHost(spec.imapHost) || host,
    imapPort: spec.imapPort ?? defaults.imapPort,
    smtpHost: cleanHost(spec.smtpHost) || host,
    smtpPort,
    smtpSecure: spec.smtpSecure ?? smtpPort === 465,
    davUrl: (spec.davUrl || `https://${host}/SOGo/dav`).trim().replace(/\/+$/, ''),
    fromAddress: (spec.from || username).trim(),
    allowInsecureTls: spec.allowInsecureTls ?? defaults.allowInsecureTls,
  };
}

/** Return all configured accounts; the first one is the primary/default. */
export function getAccounts(): SogoConfig[] {
  const defaults: Defaults = {
    host: cleanHost(process.env.SOGO_HOST),
    imapPort: int(process.env.IMAP_PORT, 993),
    smtpPort: int(process.env.SMTP_PORT, 587),
    allowInsecureTls: bool(process.env.SOGO_ALLOW_INSECURE_TLS, false),
  };

  const primary = buildAccount(
    {
      label: process.env.SOGO_LABEL,
      host: process.env.SOGO_HOST,
      username: process.env.SOGO_USERNAME || '',
      password: process.env.SOGO_PASSWORD || '',
      from: process.env.SOGO_FROM,
      imapHost: process.env.IMAP_HOST,
      smtpHost: process.env.SMTP_HOST,
      smtpPort: process.env.SMTP_PORT ? int(process.env.SMTP_PORT, 587) : undefined,
      smtpSecure: process.env.SMTP_SECURE
        ? bool(process.env.SMTP_SECURE, false)
        : undefined,
      davUrl: process.env.SOGO_DAV_URL,
    },
    defaults
  );

  const accounts: SogoConfig[] = [primary];

  const extraRaw = (process.env.SOGO_EXTRA_ACCOUNTS || '').trim();
  if (extraRaw) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(extraRaw);
    } catch {
      throw new Error(
        'SOGO_EXTRA_ACCOUNTS is not valid JSON. Expected a JSON array of accounts.'
      );
    }
    if (!Array.isArray(parsed)) {
      throw new Error('SOGO_EXTRA_ACCOUNTS must be a JSON array.');
    }
    for (const item of parsed as AccountSpec[]) {
      if (!item || !item.username || !item.password) {
        throw new Error(
          'Each entry in SOGO_EXTRA_ACCOUNTS needs at least "username" and "password".'
        );
      }
      accounts.push(buildAccount(item, defaults));
    }
  }

  // De-duplicate labels so account selection stays unambiguous.
  const seen = new Map<string, number>();
  for (const acc of accounts) {
    const key = acc.label.toLowerCase();
    if (seen.has(key)) {
      const n = seen.get(key)! + 1;
      seen.set(key, n);
      acc.label = `${acc.label}-${n}`;
    } else {
      seen.set(key, 1);
    }
  }

  return accounts;
}

/** Validate that the primary account has the minimum required fields. */
export function assertCredentials(primary: SogoConfig): string | null {
  if (!primary.host) {
    return 'Missing SOGo server host. Set the hostname (e.g. mail.example.com).';
  }
  if (!primary.username || !primary.password) {
    return 'Missing credentials. Set the username and password.';
  }
  return null;
}

/** Pick an account by label (or username); defaults to the primary account. */
export function resolveAccount(
  accounts: SogoConfig[],
  selector?: string
): SogoConfig {
  if (!selector) return accounts[0];
  const want = selector.trim().toLowerCase();
  const found = accounts.find(
    (a) =>
      a.label.toLowerCase() === want || a.username.toLowerCase() === want
  );
  if (!found) {
    const available = accounts.map((a) => a.label).join(', ');
    throw new Error(
      `Unknown account "${selector}". Available accounts: ${available}.`
    );
  }
  return found;
}
