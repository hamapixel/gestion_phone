# Phase 09 — Application native Windows puis Android (proposition d'architecture)

> **Statut : préparation technique seulement. Aucun installateur Windows, APK Android ni base SQLite native n'est livré par ce document.** Ne pas confondre la Phase 08 (IndexedDB chiffrée, PWA et synchronisation manuelle) avec une application native installable.

## Décision d'architecture

**Ordre obligatoire : Windows d'abord, Android ensuite.**

- **Windows** : Tauri 2, frontend React/Vite existant, moteur Rust natif, base locale **SQLite**. Adapter la source de données du frontend pour la persistance locale; ne pas faire tourner le serveur Django dans chaque poste Windows par défaut.
- **Android** : réutiliser l'UI React et les règles métiers; comparer Tauri 2 mobile (support Android et plugin SQL) avec Capacitor + plugin SQLite/SQLCipher lors de l'étape Android. Fixer un seul runtime Android après preuve de concept installée sur un vrai appareil; ne pas maintenir deux implémentations si Tauri mobile convient.
- **Serveur de référence** : Django + PostgreSQL, seul arbitre des stocks, numéros de factures définitifs, créances et paiements. Un brouillon local **n'est jamais une vente validée** et ne doit pas créer de facture définitive.
- **Un seul propriétaire / une boutique** : pas d'écran vendeurs, pas de nouveaux rôles.

Références :
- https://v2.tauri.app/start/prerequisites/
- https://v2.tauri.app/plugin/sql/
- https://github.com/capacitor-community/sqlite

## Livrables Windows — par sous-étape, sans changement destructif

### 09.1 — Conteneur natif testable
1. Créer \`desktop/\` avec la configuration Tauri 2, fenêtre Windows 1280×800 redimensionnable et minimum raisonnable (petits laptops), icônes propres, titre dynamique **nom de boutique**.
2. Conserver l'interface React et les vues Caisse, Articles, Créances, Factures, Paramètres, Rapports, Dépenses. Les scrolls indépendants restent actifs.
3. Utiliser l'interface native seulement lorsque l'application s'exécute sous Tauri; garder Docker et \`localhost:5178\` pour le développement web, sans régression.
4. Proposer une installation Windows **NSIS x64** signable. Tester le démarrage avec et sans Internet, y compris après redémarrage du PC. L'installeur n'est valide qu'après tests réels sur Windows.

### 09.2 — Base de données locale SQLite
Créer un schéma versionné avec migrations et transactions :

\`\`\`sql
CREATE TABLE device_state (
  device_id TEXT PRIMARY KEY,
  schema_version INTEGER NOT NULL,
  last_server_cursor TEXT,
  last_pull_at TEXT,
  last_successful_sync_at TEXT
);

CREATE TABLE local_catalog (
  product_id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  available_qty_snapshot INTEGER NOT NULL DEFAULT 0,
  unit_price_minor INTEGER NOT NULL,
  server_version TEXT,
  refreshed_at TEXT NOT NULL
);

CREATE TABLE pending_sales (
  client_ref TEXT PRIMARY KEY,
  device_id TEXT NOT NULL,
  payload_ciphertext BLOB NOT NULL,
  payload_digest TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'sending', 'confirmed', 'conflict')),
  server_sale_id TEXT,
  server_reference TEXT,
  conflict_code TEXT,
  conflict_detail TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE sync_events (
  event_id TEXT PRIMARY KEY,
  client_ref TEXT NOT NULL,
  event_type TEXT NOT NULL,
  occurred_at TEXT NOT NULL,
  server_ack_at TEXT,
  details_ciphertext BLOB
);
\`\`\`

Ce schéma est **indicatif et non encore migré**. Les montants doivent être stockés en **entiers FCFA** (ou unité mineure explicitement définie), jamais en flottants pour la comptabilité.

**Protection indispensable :** SQLite seule **n'est pas chiffrée**. Comparer SQLCipher natif ou le chiffrement authentifié des champs sensibles (AES-GCM), avec une clé protégée par le stockage sécurisé du système Windows. Ne pas stocker les coordonnées, IMEI, clés de chiffrement et jetons d'authentification en clair. Lancer les migrations de façon atomique et réversible. Activer les clés étrangères, éviter les accès SQL par concaténation, limiter les droits du frontend sur la base.

### 09.3 — Migration du coffre Web (Phase 08) vers SQLite
1. Déverrouiller explicitement l'IndexedDB existante avec la phrase secrète locale; **ne jamais effacer les brouillons d'origine avant l'accusé de copie**.
2. Exporter les éléments avec leurs \`client_ref\`, leur charge utile exacte et leur origine; chiffrer sous la clé native et les insérer dans une transaction SQLite.
3. Contrôler nombres, empreintes (SHA-256), unicité des UUID et capacité à déchiffrer les échantillons.
4. Ne marquer l'ancienne copie comme migrée qu'après confirmation; garder un outil d'export chiffré pour secours. Tester l'interruption au milieu de la migration et la récupération.

### 09.4 — Contrat de synchronisation protégé
- **Montée (push)** : même \`client_ref\`, même \`device_ref\`, mêmes lignes/IMEI et même total à chaque tentative. Interdire la transformation silencieuse d'une vente refusée.
- **Descente (pull)** : endpoint paginé et versionné, *cursor* serveur monotone, produits, quantités, changements d'IMEI, ventes, créances et paiements du seul propriétaire. Ce mécanisme **n'existe pas encore dans l'API actuelle**; il faut le développer avec des tests de rattrapage.
- **Idempotence** : conserver les validations déjà acquises même si la réponse réseau a été perdue. Enregistrer l'accusé uniquement lorsque l'état serveur est confirmé.
- **Conflit d'IMEI/stock** : statut \`conflict\`, motif clair, résolution manuelle. Ne jamais forcer une facture ou décrémenter le stock serveur par une vente locale non acceptée.
- **Créances** : ID de paiement stable et montant encaissé lié à une vente existante. Enregistrer les paiements hors ligne comme opérations *en attente* jusqu'à confirmation; pas de double comptage de recette.
- **Authentification des appareils** : enregistrement explicite de l'appareil par le propriétaire, sessions/token courts, rotation et révocation, transport HTTPS. Ne jamais copier un cookie Django en clair dans SQLite. L'API actuelle est cookie/CSRF et **ne gère pas encore le protocole natif**; créer une authentification adaptée et auditée.
- **Réseau** : backoff borné, état visible, bouton Réessayer, horodatage du dernier succès, aucune perte si PC fermé à mi-synchronisation.

### 09.5 — Sauvegarde et restauration
- Sauvegarde locale **chiffrée** avec version du schéma, checksum et date, restauration testée sur un autre PC autorisé.
- Ne pas mélanger la sauvegarde locale et la synchronisation au serveur : ce sont deux protections distinctes.
- Ne jamais inclure de mots de passe ou clés en clair dans les journaux de support.

### 09.6 — Tests obligatoires avant publication de l'installeur
- Fenêtre 1024×768, 1280×800, 1366×768, 1920×1080; écrans 125 % et 150 %.
- Connexion/déconnexion, mode sombre, impression A4/A5/80 mm, logo et nom de boutique.
- 1000+ produits, recherche immédiate et saisie IMEI, caisse rapide, navigation clavier, aucun panneau qui déborde.
- 30 ventes offline; redémarrage PC; restauration des ventes en attente; réseau indisponible pendant l'envoi.
- Doublon UUID, stock devenu insuffisant, IMEI déjà vendu sur un autre appareil, dates incorrectes, tentatives de rejeu et transactions interrompues.
- Interruption brutale au milieu d'une migration SQLite, redémarrage, restauration, sauvegarde USB chiffrée.

## Android — seulement après validation de 09 Windows
1. Vérifier le runtime retenu et le composant SQLite chiffré sur **un téléphone Android réel**.
2. Adapter les cartes, barre de navigation, clavier numérique, scanner IMEI, saisie tactile, impression/partage PDF et safe area.
3. Appareil autorisé sur le **même compte propriétaire** et accès au **même serveur HTTPS**. Le PC et le téléphone conservent chacun **leur propre base locale**; on ne copie pas un même fichier SQLite entre eux.
4. Même contrat \`client_ref\`/\`device_ref\`, mêmes statuts de conflit et d'accusé serveur, séparation stricte des boutiques.
5. Livrer l'APK/AAB **uniquement après** tests d'installation, redémarrage, modes avion/réseau et récupération sur appareil Android.

## Séquencement GitHub suggéré

- PR 09A : conteneur Tauri Windows / UX / build CI (sans prétendre que SQLite est en production).
- PR 09B : stockage SQLite chiffré, migration du coffre, transactions et tests.
- PR 09C : endpoint \`pull\` versionné, appairage appareil et réconciliation sécurisée.
- PR 09D : installation Windows, signature, backup/restauration et tests utilisateurs.
- PR 09E : Android (runtime retenu après preuve de concept), interface mobile, SQLite et tests multi-appareils.

**Interdiction :** \`docker compose down -v\` ou toute suppression du volume PostgreSQL existant. Toujours passer par branches et PR, puis validation locale avant fusion.
