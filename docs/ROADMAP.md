# Développement par phases

- **Phase 01** : socle Docker + Django + PostgreSQL + React, interface premium responsive, état API et tests.
- **Phase 02** : compte unique du propriétaire, login compact et sécurisé, session Django, CSRF, protection contre les tentatives de connexion ; création et réinitialisation par commande locale.
- **Phase 03** : catalogue téléphones, IMEI individuels, pochettes, produits divers, stock initial et corrections tracées (achats fournisseurs en Phase 04).
- **Phase 04** : achats fournisseurs multi-lignes, prix d'achat par ligne, réception du stock idempotente et journal des achats.
- **Phase 05** : caisse rapide et panier intelligent, IMEI obligatoires pour téléphones, paiements complets ou partiels, clients identifiés pour crédit, historique et vente atomique/idempotente.
- **Phase 06** : en-tête global personnalisable (nom, logo, coordonnées, NIF) appliqué à toutes les factures et tous les reçus lors de leur consultation, y compris les anciens, factures de vente et reçus de versement imprimables A4/A5/80 mm, enregistrement PDF via impression navigateur.
- **Phase 05 (complément)** : liste réelle des créances et encaissements partiels idempotents ; sans doubler le chiffre d'affaires.
- **Phase 07** : rapports journaliers/hebdomadaires/mensuels/annuels et périodes personnalisées, dépenses simples, résultat brut moins dépenses, alertes stocks et échéances calculées à l'ouverture, relances WhatsApp préremplies.
- **Phase 08** : premier socle web hors ligne : cache d'interface (Service Worker, aucune API sensible en cache), IndexedDB chiffrée (AES-GCM/PBKDF2) avec phrase secrète locale, catalogue préparé à l'avance, brouillons de caisse avec UUID stables, synchronisation manuelle via session Django/CSRF et conflits de stock/IMEI visibles. SQLite locale native sera étudiée avec Tauri en Phase 09 ; elle n'est pas disponible dans un navigateur React sans moteur supplémentaire.
- **Phase 09 (préparation)** : priorité Windows/Tauri 2 avec vraie SQLite locale chiffrée, migrations et synchronisation sécurisée; Android ensuite, en choisissant Tauri mobile ou Capacitor après un prototype réel. Voir [plan technique détaillé](PHASE_09_WINDOWS_ANDROID.md). Aucun installeur n'est encore livré.

## Principes obligatoires

1. Une installation/licence est destinée à un seul propriétaire et sa boutique. Les données de chaque client restent isolées, sans profils gérant/vendeur ni gestion multi-utilisateurs.
2. Une vente porte un UUID stable, un identifiant d'appareil et un journal d'opérations ; aucun système de vendeurs n'est requis.
3. Une créance encaissée ne doit jamais doubler le chiffre d'affaires.
4. Les unités de téléphone ont un IMEI unique et leur propre historique.
5. La marge tient compte du coût historique du produit vendu.
6. Toutes les factures et tous les reçus affichent l'en-tête actuel de la boutique. Les données financières historiques restent inchangées, et les anciens PDF imprimés ne sont pas réécrits.
7. Le stock vendu simultanément hors ligne requiert une stratégie explicite de réservation/conflit.
8. Pas d'écrans prétendant enregistrer réellement des ventes avant implémentation du backend.

## Périmètre propriétaire unique

- Un logiciel acquis pour une boutique = un seul compte propriétaire ; aucun écran « Utilisateurs » ou invitation de personnel.
- Le même propriétaire peut autoriser son PC Windows et son téléphone Android avec son unique compte.
- La synchronisation entre ses appareils est prévue, avec protections anti-doublons et conflits de stock.
- L'accès sécurisé à plusieurs appareils ne crée pas de comptes d'employés.
- Chaque commerçant utilise sa propre installation et ses propres données ; aucun tableau de bord SaaS multi-boutiques n'est nécessaire dans la V1.

## Ports de développement

Frontend 5178, API 8031, base PostgreSQL 55433. Ne pas exposer les ports en production.
