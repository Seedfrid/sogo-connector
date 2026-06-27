# Cahier des Charges - Plugin Claude Desktop SOGo/Zentyal

> ℹ️ **Note (mise à jour) :** ce cahier proposait initialement une approche en
> scripts Shell. La version livrée est un **connecteur MCP en TypeScript/Node
> packagé en `.mcpb`** (installable en un clic dans Claude Desktop), couvrant
> mail (IMAP/SMTP), agenda (CalDAV) et contacts (CardDAV) en lecture **et**
> écriture. Voir `README.md` pour la documentation à jour.

## 📋 Vue d'ensemble

**Objectif** : Créer un plugin Claude Desktop simple, robuste et partageable permettant d'accéder à SOGo/Zentyal pour lire et gérer :
- 📧 Emails (IMAP)
- 📅 Événements calendrier (CalDAV)
- 👥 Contacts (CardDAV)

**Public cible** : Utilisateurs Zentyal 8 avec SOGo, désirant intégrer leur communication dans Claude.

---

## 🎯 Objectifs

### Fonctionnalités principales

1. **Emails (IMAP)**
   - Lister les emails récents de la boîte de réception
   - Rechercher des emails par mots-clés
   - Afficher le contenu d'un email
   - Consulter les dossiers disponibles

2. **Calendrier (CalDAV)**
   - Lister les événements à venir
   - Créer un nouvel événement
   - Modifier un événement existant
   - Consulter les détails d'un événement

3. **Contacts (CardDAV)**
   - Lister les contacts
   - Chercher un contact par nom/email
   - Créer un nouveau contact
   - Modifier un contact existant

### Critères de succès

- ✅ Plugin installable dans Claude Desktop en un clic
- ✅ Configuration simple (URL + credentials)
- ✅ Aucune dépendance npm complexe
- ✅ Fonctionne sur Ubuntu, macOS, Windows
- ✅ Partageable à la communauté (format .plugin)
- ✅ Documentation claire pour l'installation

---

## 🏗️ Architecture proposée

### Approche : Shell Scripts + Curl (robuste et simple)

```
sogo-zentyal-plugin/
├── CAHIER_DES_CHARGES.md     (ce fichier)
├── README.md                  (guide utilisateur)
├── INSTALL.md                 (instructions d'installation)
├── plugin.json               (définition du plugin)
├── bin/
│   ├── sogo-server.sh       (serveur MCP principal)
│   └── tools/
│       ├── email-list.sh
│       ├── email-search.sh
│       ├── calendar-list.sh
│       ├── calendar-create.sh
│       ├── contacts-list.sh
│       └── contacts-search.sh
└── config/
    └── .env.example         (template de configuration)
```

### Avantages de cette approche

| Aspect | Avantage |
|--------|----------|
| **Dépendances** | Utilise `curl` et `bash` (déjà sur tous les systèmes) |
| **Complexité** | Scripts simples et lisibles |
| **Maintenance** | Facile à modifier/étendre |
| **Compatibilité** | Fonctionne sur tous les OS (Linux, macOS, Windows + WSL) |
| **Performance** | Léger et rapide |
| **Partageable** | Zippable et distribuable facilement |

---

## 🔌 Intégration Claude Desktop

### Structure du plugin

```json
{
  "mcpServers": {
    "sogo-zentyal": {
      "command": "bash",
      "args": ["./bin/sogo-server.sh"],
      "env": {
        "SOGO_HOST": "mail.netetic.fr",
        "SOGO_USERNAME": "user@domain.fr",
        "SOGO_PASSWORD": "password",
        "IMAP_PORT": "993",
        "CALDAV_URL": "https://mail.netetic.fr/SOGo/dav"
      }
    }
  }
}
```

### Outils exposés à Claude

```
Tools MCP:
├── list_emails(mailbox="INBOX", limit=20)
├── search_emails(query, mailbox="INBOX")
├── list_calendar_events(days_ahead=7)
├── create_calendar_event(title, start, end, description)
├── list_contacts(limit=20)
└── search_contacts(query)
```

---

## 🔐 Sécurité

- ⚠️ Les credentials sont stockés dans `.env` local (pas de sync cloud)
- ⚠️ TLS vérifié par défaut (option pour désactiver en développement)
- ⚠️ Aucun log de password
- ⚠️ Connexions directes IMAP/DAV (pas de proxy)

---

## 📦 Livrables

### Phase 1 : MVP (Emails)
- ✅ Plugin fonctionnel
- ✅ Lister emails (IMAP)
- ✅ Chercher emails
- ✅ Documentation README
- ✅ Guide d'installation

### Phase 2 : Calendrier
- ✅ Lister événements (CalDAV)
- ✅ Créer événement

### Phase 3 : Contacts
- ✅ Lister contacts (CardDAV)
- ✅ Créer contact

### Phase 4 : Distribution
- ✅ Format `.plugin` partageable
- ✅ Documentation utilisateur
- ✅ Exemples d'utilisation

---

## 📋 Configuration utilisateur

Fichier `.env` simplifié :

```env
# Serveur SOGo
SOGO_HOST=mail.netetic.fr
SOGO_PORT=993

# Authentification
SOGO_USERNAME=freddy@polytalents.fr
SOGO_PASSWORD=ton_mot_de_passe

# CalDAV/CardDAV
DAV_BASE_URL=https://mail.netetic.fr/SOGo/dav
```

---

## 🧪 Tests

- Test IMAP : `./bin/tools/email-list.sh`
- Test CalDAV : `./bin/tools/calendar-list.sh`
- Test CardDAV : `./bin/tools/contacts-list.sh`

Chaque script doit être testable indépendamment.

---

## 📊 Comparaison avec l'approche initiale

| Point | MCP TypeScript | Plugin Shell |
|-------|---|---|
| **Dépendances npm** | ❌ Problématiques | ✅ Aucune |
| **Complexité** | ❌ Élevée | ✅ Simple |
| **Maintenabilité** | ❌ Complexe | ✅ Facile |
| **Temps de dev** | ❌ Long | ✅ Court |
| **Partageable** | ⚠️ Oui (mais lourd) | ✅ Très facile |
| **Performance** | ✅ Bonne | ✅ Très bonne |

---

## 🚀 Prochaines étapes

1. ✅ Approuver ce cahier des charges
2. → Créer structure de base du plugin
3. → Développer scripts IMAP (Phase 1)
4. → Développer scripts CalDAV (Phase 2)
5. → Développer scripts CardDAV (Phase 3)
6. → Tester et valider
7. → Packager en `.plugin`
8. → Publier et partager

---

## ✍️ Notes

- **Date** : 27 Juin 2026
- **Auteur** : Claude (via Cowork)
- **Statut** : En attente d'approbation
- **Version** : 1.0

---

## 📞 Support

Pour questions ou modifications : voir README.md et INSTALL.md
