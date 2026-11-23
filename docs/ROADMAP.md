# Développement par phases

- **Phase 01** : socle Docker + Django + PostgreSQL + React, interface premium responsive, état API et tests.
- **Phase 02** : boutiques isolées, login compact et sécurisé, permissions propriétaire/gérant/vendeur.
- **Phase 03** : catalogue téléphones, IMEI individuels, pochettes, produits divers, stock.
- **Phase 04** : achats fournisseurs multi-lignes et réception du stock.
- **Phase 05** : caisse rapide et panier intelligent, paiements complets ou partiels.
- **Phase 06** : factures avec en-tête personnalisable et reçus A4/A5/80 mm/PDF.
- **Phase 07** : créances, versements, WhatsApp, dépenses, rapports et notifications.
- **Phase 08** : SQLite locale, synchronisation idempotente et gestion des conflits hors ligne.
- **Phase 09** : Tauri Windows, Capacitor Android, activation sécurisée, distribution et sauvegarde.

## Principes obligatoires

1. Une boutique ne doit jamais voir les données d'une autre.
2. Une vente porte un UUID stable et un auteur, avec journaux d'opérations.
3. Une créance encaissée ne doit jamais doubler le chiffre d'affaires.
4. Les unités de téléphone ont un IMEI unique et leur propre historique.
5. La marge tient compte du coût historique du produit vendu.
6. Les factures conservent leur en-tête d'origine même après changement du logo.
7. Le stock vendu simultanément hors ligne requiert une stratégie explicite de réservation/conflit.
8. Pas d'écrans prétendant enregistrer réellement des ventes avant implémentation du backend.

## Ports de développement

Frontend 5178, API 8031, base PostgreSQL 55433. Ne pas exposer les ports en production.
