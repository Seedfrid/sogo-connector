#!/usr/bin/env node
/**
 * Test IMAP autonome pour le connecteur SOGo.
 *
 * Utilise les mêmes options que src/clients/imap.ts (ImapFlow + secure TLS).
 * Lit les identifiants depuis les variables d'environnement (ou un .env).
 *
 * Étapes :
 *   1. Connexion IMAP (TLS 993)
 *   2. Liste des boîtes (mailboxes)
 *   3. Liste des N derniers messages de l'INBOX
 *   4. Lecture du message le plus récent (sujet, expéditeur, extrait)
 *
 * Usage :
 *   SOGO_HOST=mail.exemple.fr SOGO_USERNAME=moi@exemple.fr SOGO_PASSWORD=... \
 *     node test-imap.mjs
 *
 * Options env supplémentaires : IMAP_HOST, IMAP_PORT, SOGO_ALLOW_INSECURE_TLS
 */
import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';
import fs from 'node:fs';

// --- Mini chargeur .env (si présent) ---
try {
  const env = fs.readFileSync(new URL('.env', import.meta.url), 'utf8');
  for (const line of env.split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) {
      process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  }
} catch { /* pas de .env, on continue avec l'environnement */ }

function cleanHost(v) {
  return (v || '').trim()
    .replace(/^[a-z][a-z0-9+.-]*:\/\//i, '')
    .replace(/\/.*$/, '')
    .replace(/:\d+$/, '')
    .trim();
}

const host = cleanHost(process.env.SOGO_HOST);
const config = {
  imapHost: cleanHost(process.env.IMAP_HOST) || host,
  imapPort: parseInt(process.env.IMAP_PORT || '993', 10),
  username: (process.env.SOGO_USERNAME || '').trim(),
  password: process.env.SOGO_PASSWORD || '',
  allowInsecureTls: /^(1|true|yes|on)$/i.test(process.env.SOGO_ALLOW_INSECURE_TLS || ''),
};

const LIMIT = parseInt(process.env.TEST_LIMIT || '5', 10);

function fail(msg) {
  console.error('\n❌ ' + msg);
  process.exit(1);
}

if (!config.imapHost) fail('SOGO_HOST (ou IMAP_HOST) manquant.');
if (!config.username || !config.password) fail('SOGO_USERNAME / SOGO_PASSWORD manquants.');

function addr(value) {
  if (!value) return '';
  return (value || [])
    .map((a) => (a.name ? `${a.name} <${a.address}>` : a.address || ''))
    .filter(Boolean)
    .join(', ');
}

const client = new ImapFlow({
  host: config.imapHost,
  port: config.imapPort,
  secure: true,
  auth: { user: config.username, pass: config.password },
  logger: false,
  tls: { rejectUnauthorized: !config.allowInsecureTls },
});

const t0 = Date.now();
console.log(`\n🔌 Connexion IMAP → ${config.imapHost}:${config.imapPort} (user: ${config.username})`);

try {
  await client.connect();
  console.log(`✅ Connecté et authentifié (${Date.now() - t0} ms)`);

  // 1) Mailboxes
  const boxes = await client.list();
  console.log(`\n📁 ${boxes.length} boîte(s) :`);
  for (const b of boxes) {
    console.log(`   - ${b.path}${b.specialUse ? `  [${b.specialUse}]` : ''}`);
  }

  // 2) INBOX : derniers messages
  const lock = await client.getMailboxLock('INBOX');
  let lastUid = null;
  try {
    const total = client.mailbox?.exists || 0;
    console.log(`\n📥 INBOX : ${total} message(s) au total`);
    if (total > 0) {
      const range = `${Math.max(1, total - LIMIT + 1)}:*`;
      const rows = [];
      for await (const msg of client.fetch(range, { uid: true, envelope: true, flags: true })) {
        rows.push(msg);
      }
      rows.sort((a, b) => (a.envelope?.date < b.envelope?.date ? 1 : -1));
      console.log(`\n   ${LIMIT} dernier(s) :`);
      for (const m of rows.slice(0, LIMIT)) {
        const env = m.envelope;
        const d = env?.date ? new Date(env.date).toISOString().slice(0, 16).replace('T', ' ') : '';
        const seen = (m.flags || new Set()).has('\\Seen') ? ' ' : '•';
        console.log(`   ${seen} uid ${m.uid} | ${d} | ${addr(env?.from).slice(0, 30).padEnd(30)} | ${(env?.subject || '(sans objet)').slice(0, 50)}`);
      }
      lastUid = rows[0]?.uid ?? null;
    }
  } finally {
    lock.release();
  }

  // 3) Lecture complète du message le plus récent
  if (lastUid != null) {
    const lock2 = await client.getMailboxLock('INBOX');
    try {
      const message = await client.fetchOne(String(lastUid), { uid: true, source: true }, { uid: true });
      if (message?.source) {
        const parsed = await simpleParser(message.source);
        const body = (parsed.text || '').replace(/\s+/g, ' ').trim().slice(0, 200);
        console.log(`\n📖 Lecture uid ${lastUid} :`);
        console.log(`   De      : ${parsed.from?.text || ''}`);
        console.log(`   Objet   : ${parsed.subject || '(sans objet)'}`);
        console.log(`   Pièces  : ${parsed.attachments?.length || 0}`);
        console.log(`   Extrait : ${body || '(corps vide)'}`);
      }
    } finally {
      lock2.release();
    }
  }

  await client.logout();
  console.log(`\n✅ Test IMAP réussi (${Date.now() - t0} ms total).`);
} catch (err) {
  await client.logout().catch(() => client.close());
  fail(`Échec IMAP : ${err.message}`);
}
