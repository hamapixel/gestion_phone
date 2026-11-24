# Phase 09 — YaraPhone Windows : caisse locale SQLite chiffrée (prototype)

**La PR #11 est un prototype et ne doit pas encore servir à des ventes clients.**

## Ce qui fonctionne maintenant

- Application Windows native Tauri 2 avec la même caisse hors connexion React que la version web.
- Catalogue local, panier provisoire, prix, quantités, IMEI, crédits et historique des brouillons.
- Les brouillons et le catalogue sont stockés en SQLite locale, avec AES-256-GCM, clé Argon2id protégée par une phrase secrète.
- Chaque vente locale garde un UUID stable et un identifiant d'appareil stable. Aucun reçu final n'est émis avant confirmation serveur.
- L'app ne contacte pas automatiquement Django : la synchronisation native et l'authentification des appareils restent à développer.
- Transfert chiffré depuis l'ancienne version web : **aucune suppression des données IndexedDB**.
- Le stockage Windows et les anciennes données du navigateur sont distincts.

## Tester sur Windows

### 1 — Mettre la branche de Phase 09 à jour

```powershell
cd "$HOME\Desktop\gestion_phone"
git switch feature/phase-09-windows-tauri-sqlite-foundation
git pull --ff-only origin feature/phase-09-windows-tauri-sqlite-foundation
cd desktop
npm install
npm run dev
```

Le serveur Tauri de développement est sur `http://127.0.0.1:5188` et l'interface web Docker reste sur `http://localhost:5178` ; les deux peuvent fonctionner simultanément.

### 2 — Exporter depuis le navigateur YaraPhone web

Dans Chrome sur **http://localhost:5178**, connectez le propriétaire, ouvrez **Hors connexion** et déverrouillez le coffre IndexedDB web avec sa phrase habituelle. Cliquez sur **Export chiffré Windows**, créez une **nouvelle phrase de transfert** d'au moins 12 caractères et enregistrez le fichier JSON chiffré. Conservez la phrase séparément du fichier. **Le navigateur ne supprime pas les originaux.**

Si le coffre web contient un brouillon en conflit, résolvez d'abord ce conflit via la version web. Aucun conflit non résolu ne doit être importé en SQLite native.

### 3 — Importer dans YaraPhone Windows

Dans la fenêtre Tauri, déverrouillez le coffre SQLite avec sa phrase **locale Windows** (différente ou non de la phrase de transfert). Cliquez sur **Importer depuis la version web**, sélectionnez le JSON chiffré et indiquez sa phrase de transfert. Vérifiez les produits et les brouillons.

L'import refuse de remplacer silencieusement un catalogue déjà présent et détecte les collisions UUID avec contenu différent. En cas de panne pendant l'import, le fichier et les données web ne sont pas effacés; les reprises identiques sont idempotentes.

### 4 — Tester uniquement avec des données non commerciales

Ajoutez un article du catalogue dans le panier, vérifiez le total et cliquez sur **Enregistrer en attente**. Le brouillon est chiffré dans SQLite. Fermez et rouvrez l'application, déverrouillez et vérifiez sa présence.

**Ne supprimez pas de brouillon important, ne transférez pas de vrais paiements et ne distribuez pas encore cet installateur.** La validation des ventes, paiements et factures reste exclusivement côté Django.

## Ce qui reste à implémenter pour une version commerciale

- Appairage sécurisé du PC et authentification du propriétaire côté serveur HTTPS.
- Synchronisation native push/pull fiable (stocks, produits, ventes, créances, IMEI), idempotence et gestion des conflits.
- Récupération et validation des factures/reçus définitifs.
- Sauvegarde et restauration chiffrées de SQLite, stratégie de changement de phrase secrète.
- Tests sur plusieurs PC, signature du programme et vérification NSIS; puis Android.

## Vérifications développeur

```powershell
cd "$HOME\Desktop\gestion_phone"
docker compose exec backend python manage.py test core
docker compose exec frontend npm run test
cd frontend
npm run build
cd ..
cargo test --manifest-path desktop/src-tauri/Cargo.toml --lib
```

**Jamais `docker compose down -v` : cette commande détruirait les données PostgreSQL.**