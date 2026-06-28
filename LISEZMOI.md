# Connecteur SOGo pour Claude Desktop

*🇬🇧 [English version](README.md)*

Un connecteur Model Context Protocol (MCP) qui permet à Claude d'accéder à votre
compte **SOGo / Zentyal auto-hébergé** — courriel, agenda et contacts — via les
protocoles ouverts standards **IMAP, SMTP, CalDAV et CardDAV**. Sans Google,
sans Microsoft, sans cloud tiers.

Livré sous forme de paquet **`.mcpb`** installable en un clic dans Claude
Desktop.

## Fonctionnalités

| Domaine | Outils |
|---------|--------|
| 📧 **Courriel** | lister, rechercher, lire un message complet, envoyer, supprimer, lister les dossiers |
| 📅 **Agenda** | lister les agendas, lister les événements d'une période, créer & supprimer des événements |
| 👥 **Contacts** | lister les carnets d'adresses, lister/rechercher des contacts, créer & supprimer des contacts |

Liste complète des outils (14) : `sogo_list_emails`, `sogo_search_emails`,
`sogo_read_email`, `sogo_list_mailboxes`, `sogo_send_email`,
`sogo_delete_email`, `sogo_list_calendars`, `sogo_list_events`,
`sogo_create_event`, `sogo_delete_event`, `sogo_list_address_books`,
`sogo_list_contacts`, `sogo_create_contact`, `sogo_delete_contact`.

> **Astuce identifiant SOGo :** utilisez l'**adresse e-mail complète** comme nom
> d'utilisateur (par ex. `vous@exemple.fr`), même si l'interface web de SOGo
> accepte un nom court — l'IMAP/SMTP exige l'adresse complète.

> Les suppressions sont conçues pour être sûres : `sogo_delete_email` déplace le
> message vers la Corbeille par défaut (passez `permanent: true` pour une
> suppression définitive) ; les suppressions d'événements et de contacts se font
> par `uid`.

## Installation (recommandé — en un clic)

1. Téléchargez **`sogo-connector.mcpb`** depuis la [page Releases](../../releases)
   (ou depuis ce dossier).
2. **Installez-le**, au choix :
   - Ouvrez **Claude Desktop → Réglages → Extensions** et glissez-y le `.mcpb`
     (ou cliquez **Installer** et sélectionnez-le), **ou**
   - Double-cliquez sur le `.mcpb` / **Ouvrir avec → Claude** — Claude Desktop
     proposera de l'installer.
3. Renseignez les champs de configuration :
   - **Serveur SOGo** — par ex. `mail.exemple.fr` (un `https://…` complet ou un
     chemin en trop sont tolérés et nettoyés automatiquement)
   - **Identifiant / e-mail** — votre login SOGo complet
   - **Mot de passe**
   - *(optionnel)* URL DAV, ports IMAP/SMTP, « Autoriser le TLS non sécurisé »
4. Activez l'extension. C'est prêt — demandez à Claude *« liste mes e-mails non
   lus »* ou *« qu'est-ce que j'ai à l'agenda la semaine prochaine ? »*.

Les valeurs par défaut (IMAP 993, SMTP 587 STARTTLS, DAV à
`https://<serveur>/SOGo/dav`) correspondent à une installation SOGo / Zentyal
standard ; en général seuls le serveur, le login et le mot de passe sont
nécessaires.

> **Certificat auto-signé ?** Beaucoup de serveurs auto-hébergés en utilisent un.
> Activez **Autoriser le TLS non sécurisé** dans la configuration si la connexion
> échoue avec une erreur de certificat.

> **Après une mise à jour du connecteur**, quittez complètement puis relancez
> Claude Desktop pour que la nouvelle version soit chargée (une simple
> réinstallation peut laisser tourner l'ancien processus).

## Référence de configuration

| Champ | Variable d'env. | Défaut | Requis |
|-------|-----------------|--------|--------|
| Serveur SOGo | `SOGO_HOST` | — | ✅ |
| Identifiant / e-mail | `SOGO_USERNAME` | — | ✅ |
| Mot de passe | `SOGO_PASSWORD` | — | ✅ |
| URL DAV | `SOGO_DAV_URL` | `https://<serveur>/SOGo/dav` | |
| Port IMAP | `IMAP_PORT` | `993` | |
| Port SMTP | `SMTP_PORT` | `587` | |
| Autoriser le TLS non sécurisé | `SOGO_ALLOW_INSECURE_TLS` | `false` | |

Le connecteur gère **un seul compte**. Les surcharges avancées `IMAP_HOST`,
`SMTP_HOST`, `SMTP_SECURE` et `SOGO_FROM` sont également lues depuis
l'environnement si elles sont définies.

## Sécurité

- Les identifiants sont stockés par Claude Desktop et transmis uniquement au
  processus local du connecteur. Ils ne sont jamais envoyés à un tiers.
- Toutes les connexions vont **directement** de votre machine à votre serveur
  SOGo, en TLS (IMAPS / SMTP+STARTTLS / HTTPS).
- Le connecteur n'écrit aucun journal de votre mot de passe et ne stocke aucune
  donnée.

## Compiler depuis les sources

Nécessite Node.js 18+.

```bash
npm install
npm run typecheck     # vérification de types (sans génération)
npm run build         # bundle vers dist/index.js ET server/index.mjs (esbuild)
```

> La compilation écrit **les deux** fichiers : `dist/index.js` (utilisé par
> `npm start`) et `server/index.mjs` (le point d'entrée embarqué dans le
> `.mcpb`), pour qu'ils ne puissent jamais diverger.

Construire le `.mcpb` vous-même :

```bash
npm install -g @anthropic-ai/mcpb
npm run build
mcpb validate manifest.json
mcpb pack . sogo-connector.mcpb
```

Le paquet ne contient que `manifest.json`, `icon.png` et `server/index.mjs`.

Pour le développement local, vous pouvez aussi lancer le serveur directement en
stdio, ou utiliser les scripts de test autonomes :

```bash
cp .env.example .env   # renseignez vos identifiants
node dist/index.js     # lance le serveur MCP en stdio

node test-imap.mjs     # test rapide de connexion / lecture IMAP
node test-smtp.mjs     # test rapide d'auth + envoi SMTP (SMTP_VERIFY_ONLY=true pour ne pas envoyer)
```

## Structure du projet

```
src/
  index.ts            Serveur MCP + définitions des outils
  config.ts           Configuration depuis l'environnement (compte unique)
  clients/
    imap.ts           IMAP (lister/rechercher/lire) via ImapFlow
    smtp.ts           SMTP (envoi) via Nodemailer
    dav.ts            CalDAV + CardDAV via tsdav, analyse via ical.js
manifest.json         Manifeste MCPB (Claude Desktop)
esbuild.config.mjs    Configuration du bundler (écrit dist + server)
test-imap.mjs         Test IMAP autonome
test-smtp.mjs         Test SMTP autonome
```

## Dépannage

- **Échec d'authentification** — vérifiez que le login fonctionne dans le webmail
  SOGo ; l'identifiant est généralement l'adresse e-mail complète.
- **Erreur de certificat / TLS** — activez *Autoriser le TLS non sécurisé*
  (certificat auto-signé).
- **`ENOTFOUND` / `EBADNAME` avec `https://…`** — une ancienne version tourne
  encore. Quittez complètement puis relancez Claude Desktop après avoir installé
  le dernier `.mcpb`.
- **Connexion impossible** — vérifiez le serveur et que les ports 993 / 587 ainsi
  que le port web de SOGo sont joignables depuis votre machine (pare-feu / VPN).

## Licence

MIT
