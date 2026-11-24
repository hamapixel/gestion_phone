# Phase 09 — Prototype Windows : Tauri 2 + coffre SQLite sécurisé

**État : prototype technique. Pas encore de livraison commerciale.**

## Socle déjà codé

- Conteneur Windows Tauri 2 utilisant React/Vite, fenêtre redimensionnable et cible NSIS.
- SQLite locale dans le dossier applicatif Windows avec tables versionnées et commandes natives Rust.
- JSON de catalogue et de ventes en attente chiffrés par AES-256-GCM, avec AAD associé à l'identifiant; clé Argon2id issue d'une phrase secrète de 12 caractères minimum, conservée uniquement en mémoire.
- Anti-doublon local : même client_ref et même JSON = rejeu accepté sans double insertion; contenu différent pour le même UUID = refus.
- L'écran natif permet d'initialiser, déverrouiller et verrouiller la base SQLite, et de voir le nombre de brouillons.
- Les tests Rust vérifient le chiffrement sur disque, le redémarrage et le refus d'une phrase secrète incorrecte.

## Limites encore importantes

- La caisse React n'est PAS encore raccordée au magasin SQLite natif. Les ventes restent gérées par le serveur Django ou par l'IndexedDB du mode web Phase 08.
- Les anciennes données du navigateur ne sont pas importées automatiquement; ne rien effacer avant une migration contrôlée.
- La synchronisation native avec PostgreSQL, l'autorisation des appareils, la sauvegarde chiffrée et la signature Windows restent à développer.
- Aucun APK Android ni installateur Windows signé/testé sur un PC client n'est encore livré.

## Tester le prototype Windows (PowerShell)

Installer Rust stable >= 1.90, Microsoft C++ Build Tools avec SDK Windows, WebView2, Node.js 22+.

```powershell
cd "$HOME\Desktop\gestion_phone"
npm --prefix frontend install
npm --prefix desktop install
npm --prefix desktop run dev
```

Créer une phrase secrète locale, verrouiller et déverrouiller. Ne pas utiliser encore pour des ventes réelles.

### Générer un installateur NSIS non signé

```powershell
npm --prefix desktop run build
```

Résultat attendu après compilation : dossier desktop/src-tauri/target/release/bundle/nsis. Le nom exact du fichier est à vérifier au build.

### Tests

```powershell
docker compose exec backend python manage.py test core
docker compose exec frontend npm run test
npm --prefix frontend run build
cargo test --manifest-path desktop/src-tauri/Cargo.toml --lib
```

## Suite de la Phase 09

1. Raccorder les écrans de caisse et de catalogue au dépôt SQLite; migration sécurisée et réversible depuis IndexedDB.
2. Mettre en œuvre l'appairage appareil, l'authentification native et les flux push/pull idempotents avec Django comme source de vérité.
3. Gérer les conflits stock/IMEI et la récupération réseau, puis les factures confirmées, sauvegardes et la signature Windows.
4. Tester l'installateur sur plusieurs PC Windows, puis seulement commencer Android.

**Ne jamais utiliser docker compose down -v : cela supprimerait PostgreSQL.**