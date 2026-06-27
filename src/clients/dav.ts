/**
 * CalDAV + CardDAV client built on tsdav, with iCalendar / vCard parsing
 * powered by ical.js.
 *
 * SOGo exposes calendars under <dav>/<user>/Calendar/ and address books under
 * <dav>/<user>/Contacts/. We rely on tsdav's standard DAV discovery rather than
 * hardcoding those paths, so the connector also works on other DAV servers.
 */
import { DAVClient } from 'tsdav';
import ICAL from 'ical.js';
import { randomUUID } from 'node:crypto';
import type { SogoConfig } from '../config.js';

export interface CalendarInfo {
  url: string;
  displayName: string;
}

export interface CalendarEvent {
  uid: string;
  summary: string;
  start: string;
  end: string;
  location?: string;
  description?: string;
  calendar?: string;
}

export interface AddressBookInfo {
  url: string;
  displayName: string;
}

export interface Contact {
  uid: string;
  name: string;
  emails: string[];
  phones: string[];
  organization?: string;
  url: string;
}

function davCredentials(config: SogoConfig) {
  return {
    serverUrl: config.davUrl,
    credentials: { username: config.username, password: config.password },
    authMethod: 'Basic' as const,
  };
}

async function calClient(config: SogoConfig): Promise<DAVClient> {
  setTlsEnv(config);
  const client = new DAVClient({
    ...davCredentials(config),
    defaultAccountType: 'caldav',
  });
  await client.login();
  return client;
}

async function cardClient(config: SogoConfig): Promise<DAVClient> {
  setTlsEnv(config);
  const client = new DAVClient({
    ...davCredentials(config),
    defaultAccountType: 'carddav',
  });
  await client.login();
  return client;
}

/**
 * tsdav uses the global fetch / Node TLS stack. For self-signed servers we
 * relax certificate verification process-wide when explicitly requested.
 */
function setTlsEnv(config: SogoConfig): void {
  if (config.allowInsecureTls) {
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
  }
}

function displayName(value: unknown, fallback: string): string {
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object') {
    const v = value as { _cdata?: string; _text?: string };
    return v._cdata || v._text || fallback;
  }
  return fallback;
}

/* ----------------------------- Calendars ----------------------------- */

export async function listCalendars(config: SogoConfig): Promise<CalendarInfo[]> {
  const client = await calClient(config);
  const calendars = await client.fetchCalendars();
  return calendars.map((c) => ({
    url: c.url,
    displayName: displayName(c.displayName, c.url),
  }));
}

export async function listEvents(
  config: SogoConfig,
  daysAhead = 7,
  limit = 50,
  daysBack = 0
): Promise<CalendarEvent[]> {
  const client = await calClient(config);
  const calendars = await client.fetchCalendars();

  const now = new Date();
  const start = new Date(now.getTime() - daysBack * 86400000);
  const end = new Date(now.getTime() + daysAhead * 86400000);

  const events: CalendarEvent[] = [];

  for (const calendar of calendars) {
    let objects;
    try {
      objects = await client.fetchCalendarObjects({
        calendar,
        timeRange: { start: start.toISOString(), end: end.toISOString() },
      });
    } catch {
      continue; // skip calendars that don't support time-range queries
    }

    for (const obj of objects) {
      if (!obj.data) continue;
      const parsed = parseEvents(obj.data, displayName(calendar.displayName, ''));
      events.push(...parsed);
    }
  }

  events.sort((a, b) => (a.start < b.start ? -1 : 1));
  return events.slice(0, limit);
}

export async function createEvent(
  config: SogoConfig,
  params: {
    title: string;
    start: string;
    end: string;
    description?: string;
    location?: string;
    calendarUrl?: string;
  }
): Promise<{ uid: string; calendar: string }> {
  const client = await calClient(config);
  const calendars = await client.fetchCalendars();
  if (calendars.length === 0) {
    throw new Error('No calendar found for this account.');
  }

  const target =
    (params.calendarUrl &&
      calendars.find((c) => c.url === params.calendarUrl)) ||
    calendars[0];

  const uid = `${randomUUID()}`;
  const iCalString = buildVEvent({ ...params, uid });

  await client.createCalendarObject({
    calendar: target,
    filename: `${uid}.ics`,
    iCalString,
  });

  return { uid, calendar: displayName(target.displayName, target.url) };
}

export async function deleteEvent(
  config: SogoConfig,
  identifier: string
): Promise<{ deleted: boolean; summary?: string }> {
  const client = await calClient(config);
  const calendars = await client.fetchCalendars();

  for (const calendar of calendars) {
    let objects;
    try {
      objects = await client.fetchCalendarObjects({ calendar });
    } catch {
      continue;
    }
    for (const obj of objects) {
      if (!obj.data) continue;
      const events = parseEvents(obj.data, '');
      const match = events.find((e) => e.uid === identifier);
      if (match || obj.url === identifier || obj.url.endsWith(`/${identifier}.ics`)) {
        await client.deleteCalendarObject({
          calendarObject: { url: obj.url, etag: obj.etag },
        });
        return { deleted: true, summary: match?.summary || events[0]?.summary };
      }
    }
  }
  return { deleted: false };
}

/* ----------------------------- Contacts ------------------------------ */

export async function listAddressBooks(
  config: SogoConfig
): Promise<AddressBookInfo[]> {
  const client = await cardClient(config);
  const books = await client.fetchAddressBooks();
  return books.map((b) => ({
    url: b.url,
    displayName: displayName(b.displayName, b.url),
  }));
}

export async function listContacts(
  config: SogoConfig,
  search?: string,
  limit = 50
): Promise<Contact[]> {
  const client = await cardClient(config);
  const books = await client.fetchAddressBooks();

  const contacts: Contact[] = [];
  for (const book of books) {
    let vcards;
    try {
      vcards = await client.fetchVCards({ addressBook: book });
    } catch {
      continue;
    }
    for (const card of vcards) {
      if (!card.data) continue;
      const parsed = parseVCard(card.data, card.url);
      if (parsed) contacts.push(parsed);
    }
  }

  let filtered = contacts;
  if (search) {
    const q = search.toLowerCase();
    filtered = contacts.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.emails.some((e) => e.toLowerCase().includes(q)) ||
        (c.organization || '').toLowerCase().includes(q)
    );
  }

  filtered.sort((a, b) => a.name.localeCompare(b.name));
  return filtered.slice(0, limit);
}

export async function createContact(
  config: SogoConfig,
  params: {
    name: string;
    email?: string;
    phone?: string;
    organization?: string;
    addressBookUrl?: string;
  }
): Promise<{ uid: string; addressBook: string }> {
  const client = await cardClient(config);
  const books = await client.fetchAddressBooks();
  if (books.length === 0) {
    throw new Error('No address book found for this account.');
  }

  const target =
    (params.addressBookUrl &&
      books.find((b) => b.url === params.addressBookUrl)) ||
    books[0];

  const uid = `${randomUUID()}`;
  const vCardString = buildVCard({ ...params, uid });

  await client.createVCard({
    addressBook: target,
    filename: `${uid}.vcf`,
    vCardString,
  });

  return { uid, addressBook: displayName(target.displayName, target.url) };
}

export async function deleteContact(
  config: SogoConfig,
  identifier: string
): Promise<{ deleted: boolean; name?: string }> {
  const client = await cardClient(config);
  const books = await client.fetchAddressBooks();

  for (const book of books) {
    let vcards;
    try {
      vcards = await client.fetchVCards({ addressBook: book });
    } catch {
      continue;
    }
    for (const card of vcards) {
      if (!card.data) continue;
      const parsed = parseVCard(card.data, card.url);
      if (
        (parsed && parsed.uid === identifier) ||
        card.url === identifier ||
        card.url.endsWith(`/${identifier}.vcf`)
      ) {
        await client.deleteVCard({
          vCard: { url: card.url, etag: card.etag },
        });
        return { deleted: true, name: parsed?.name };
      }
    }
  }
  return { deleted: false };
}

/* --------------------------- iCal / vCard ---------------------------- */

function parseEvents(ics: string, calendarName: string): CalendarEvent[] {
  try {
    const jcal = ICAL.parse(ics);
    const comp = new ICAL.Component(jcal);
    const vevents = comp.getAllSubcomponents('vevent');
    return vevents.map((ve) => {
      const event = new ICAL.Event(ve);
      return {
        uid: event.uid || '',
        summary: event.summary || '(no title)',
        start: event.startDate ? event.startDate.toJSDate().toISOString() : '',
        end: event.endDate ? event.endDate.toJSDate().toISOString() : '',
        location: event.location || undefined,
        description: event.description || undefined,
        calendar: calendarName || undefined,
      };
    });
  } catch {
    return [];
  }
}

function parseVCard(data: string, url: string): Contact | null {
  try {
    const jcard = ICAL.parse(data);
    const comp = new ICAL.Component(jcard);

    const emails = comp
      .getAllProperties('email')
      .map((p) => String(p.getFirstValue()))
      .filter(Boolean);
    const phones = comp
      .getAllProperties('tel')
      .map((p) => String(p.getFirstValue()))
      .filter(Boolean);

    const orgValue = comp.getFirstPropertyValue('org');
    const organization = Array.isArray(orgValue)
      ? orgValue.filter(Boolean).join(', ')
      : orgValue
        ? String(orgValue)
        : undefined;

    const name =
      (comp.getFirstPropertyValue('fn') as string) ||
      (Array.isArray(comp.getFirstPropertyValue('n'))
        ? (comp.getFirstPropertyValue('n') as string[]).filter(Boolean).join(' ')
        : '') ||
      '(no name)';

    const uid = (comp.getFirstPropertyValue('uid') as string) || url;

    return { uid, name, emails, phones, organization, url };
  } catch {
    return null;
  }
}

function escapeIcs(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');
}

function toIcsDate(iso: string): string {
  // Convert an ISO datetime to UTC iCalendar format: YYYYMMDDTHHMMSSZ
  const d = new Date(iso);
  if (isNaN(d.getTime())) {
    throw new Error(`Invalid datetime: "${iso}". Use ISO 8601 (e.g. 2026-07-01T14:00:00).`);
  }
  return d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

function buildVEvent(params: {
  uid: string;
  title: string;
  start: string;
  end: string;
  description?: string;
  location?: string;
}): string {
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//SOGo MCP Connector//EN',
    'CALSCALE:GREGORIAN',
    'BEGIN:VEVENT',
    `UID:${params.uid}`,
    `DTSTAMP:${stamp}`,
    `DTSTART:${toIcsDate(params.start)}`,
    `DTEND:${toIcsDate(params.end)}`,
    `SUMMARY:${escapeIcs(params.title)}`,
  ];
  if (params.description) lines.push(`DESCRIPTION:${escapeIcs(params.description)}`);
  if (params.location) lines.push(`LOCATION:${escapeIcs(params.location)}`);
  lines.push('END:VEVENT', 'END:VCALENDAR');
  return lines.join('\r\n');
}

function buildVCard(params: {
  uid: string;
  name: string;
  email?: string;
  phone?: string;
  organization?: string;
}): string {
  const lines = [
    'BEGIN:VCARD',
    'VERSION:3.0',
    `UID:${params.uid}`,
    `FN:${escapeIcs(params.name)}`,
    `N:${escapeIcs(params.name)};;;;`,
  ];
  if (params.email) lines.push(`EMAIL;TYPE=INTERNET:${params.email}`);
  if (params.phone) lines.push(`TEL:${params.phone}`);
  if (params.organization) lines.push(`ORG:${escapeIcs(params.organization)}`);
  lines.push('END:VCARD');
  return lines.join('\r\n');
}
