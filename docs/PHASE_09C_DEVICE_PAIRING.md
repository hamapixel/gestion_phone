# Phase 09C — Appairage sécurisé des PC Windows (API serveur, étape 1)

**Statut : fondation serveur en cours de validation, pas encore une synchronisation de vente.**
Les brouillons existants dans le coffre SQLite Windows et les ventes PostgreSQL ne changent pas.

## Flux de sécurité
1. Le propriétaire ouvre **YaraPhone Web** en HTTPS et, après connexion, demande un code à usage unique avec \`POST /api/devices/pairing/new/\`, protégé par session et CSRF.
2. Le code à **12 chiffres**, valide **5 minutes**, n'est renvoyé qu'une fois et n'est jamais stocké en clair. Un seul code en attente par propriétaire.
3. L'application Windows transmet le code, son identifiant stable \`device_ref\` et un nom d'appareil à \`POST /api/devices/pairing/redeem/\` via **HTTPS**, sans cookie. En développement local, HTTP localhost est permis uniquement si Django \`DEBUG=True\`.
4. Le serveur remet un **jeton aléatoire**, valable **30 jours**; son empreinte HMAC est seule conservée dans PostgreSQL. Le propriétaire peut lister \`GET /api/devices/\` et révoquer \`POST /api/devices/revoke/\` un appareil.
5. \`GET /api/devices/session/\` permet seulement de contrôler un jeton Bearer : son **scope est \`device-session-only\`**, sans accès aux ventes. Les codes erronés sont limités à cinq tentatives par adresse (15 minutes).

**Points encore à développer :** 
- Interface web pour générer/afficher le code et interface native Windows pour saisir le code.
- Transfert des jetons exclusivement côté Rust, chiffrés dans la SQLite native et supprimés après révocation.
- Endpoint de synchronisation **push** des ventes avec UUID stables et revue des conflits, puis **pull** paginé des produits et des soldes.
- Vérification explicite du serveur HTTPS de destination (configuration fixe et pinning éventuel), appairage et révocation testés depuis Windows.

**Ne jamais appeler directement \`/api/sales/\` avec le Bearer appareil** : cet endpoint attend la session propriétaire web Django. La Phase 09C n'ajoute pas encore de passerelle de vente native. Aucun brouillon ne doit être supprimé parce qu'un réseau répond simplement « OK ».

Les tests couvrent le CSRF, la connexion propriétaire, les codes expirés/à usage unique, la prévention du bruteforce, la rotation des jetons, la révocation, l'expiration et la contrainte HTTPS.
