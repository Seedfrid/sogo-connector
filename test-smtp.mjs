#!/usr/bin/env node
/**
 * Test SMTP autonome pour le connecteur SOGo.
 *
 * Utilise les mêmes options que src/clients/smtp.ts (Nodemailer).
 * Lit les identifiants depuis les variables d'environnement (ou un .env).
 *
 * Étapes :
 *   1. Vérification de la connexion + authentification SMTP (transporter.verify)
 *   2. Envoi d'un email de test (sauf si SMTP_VERIFY_ONLY=true)
 *
 * Usage :
 *   SOGO_HOST=mail.exemple.fr SOGO_USERNAME=moi@exemple.fr SOGO_PASSWORD=... \
 *     node test-smtp.mjs
 *
 * Options env supplémentaires :
 *   SMTP_HOST, SMTP_PORT (587=STARTTLS, 465=TLS), SMTP_SECURE,
 *   SOGO_FROM, SOGO_ALLOW_INSECURE_TLS,
 *   SMTP_TO (destinataire du test, défaut = SOGO_USERNAME),
 *   SMTP_VERIFY_ONLY=true (ne fait que vérifier, n'envoie rien)
 */
import nodemailer from 'nodemailer';
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

function bool(v) {
  return /^(1|true|yes|on)$/i.test((v || '').trim());
}

const host = cleanHost(process.env.SOGO_HOST);
const smtpPort = parseInt(process.env.SMTP_PORT || '587', 10);
const config = {
  smtpHost: cleanHost(process.env.SMTP_HOST) || host,
  smtpPort,
  smtpSecure: process.env.SMTP_SECURE ? bool(process.env.SMTP_SECURE) : smtpPort === 465,
  username: (process.env.SOGO_USERNAME || '').trim(),
  password: process.env.SOGO_PASSWORD || '',
  fromAddress: (process.env.SOGO_FROM || process.env.SOGO_USERNAME || '').trim(),
  allowInsecureTls: bool(process.env.SOGO_ALLOW_INSECURE_TLS),
};

const to = (process.env.SMTP_TO || config.username).trim();
const verifyOnly = bool(process.env.SMTP_VERIFY_ONLY);

function fail(msg) {
  console.error('\n❌ ' + msg);
  process.exit(1);
}

if (!config.smtpHost) fail('SOGO_HOST (ou SMTP_HOST) manquant.');
if (!config.username || !config.password) fail('SOGO_USERNAME / SOGO_PASSWORD manquants.');

const transporter = nodemailer.createTransport({
  host: config.smtpHost,
  port: config.smtpPort,
  secure: config.smtpSecure,
  auth: { user: config.username, pass: config.password },
  tls: { rejectUnauthorized: !config.allowInsecureTls },
});

const t0 = Date.now();
console.log(
  `\n📤 SMTP → ${config.smtpHost}:${config.smtpPort} ` +
  `(secure=${config.smtpSecure}, user: ${config.username})`
);

try {
  // 1) Vérification connexion + auth
  await transporter.verify();
  console.log(`✅ Connexion + authentification SMTP OK (${Date.now() - t0} ms)`);

  if (verifyOnly) {
    console.log('\nℹ️  SMTP_VERIFY_ONLY=true → aucun email envoyé.');
    console.log(`\n✅ Test SMTP réussi (${Date.now() - t0} ms total).`);
    process.exit(0);
  }

  // 2) Envoi d'un email de test
  const stamp = new Date().toISOString();
  const info = await transporter.sendMail({
    from: config.fromAddress,
    to,
    subject: `[Test SOGo] Connecteur MCP — ${stamp}`,
    text:
      `Ceci est un email de test envoyé par le connecteur MCP SOGo.\n\n` +
      `Serveur SMTP : ${config.smtpHost}:${config.smtpPort} (secure=${config.smtpSecure})\n` +
      `Compte       : ${config.username}\n` +
      `Horodatage   : ${stamp}\n`,
  });

  console.log(`\n✉️  Email envoyé à ${to}`);
  console.log(`   Message-ID : ${info.messageId}`);
  console.log(`   Accepté    : ${(info.accepted || []).join(', ') || '—'}`);
  console.log(`   Rejeté     : ${(info.rejected || []).join(', ') || '—'}`);
  if (info.response) console.log(`   Réponse    : ${info.response}`);

  console.log(`\n✅ Test SMTP réussi (${Date.now() - t0} ms total). Vérifie ta boîte de réception.`);
  process.exit(0);
} catch (err) {
  fail(`Échec SMTP : ${err.message}`);
}
