# PhoneStock Pro

Socle technique de l'application de gestion de téléphones, pochettes et produits divers. **Chaque logiciel est réservé au propriétaire de la boutique : un seul compte, sans rôles gérant/vendeur.** Le propriétaire pourra utiliser le même compte sur son PC et son téléphone (synchronisation prévue dans une phase ultérieure).

## Démarrage Windows (Phase 06 : factures et reçus)

~~~powershell
git clone https://github.com/hamapixel/gestion_phone.git
cd gestion_phone
git switch feature/phase-06-invoices-receipts
Copy-Item .env.example .env
docker compose up --build -d
docker compose ps
docker compose exec backend python manage.py init_owner
~~~

Interface : http://localhost:5178
API : http://localhost:8031/api/health/

Tests :

~~~powershell
docker compose exec backend python manage.py test core
docker compose exec backend python manage.py check
docker compose exec frontend npm run test
docker compose exec frontend npm run build
~~~

Arrêt : `docker compose down`. Attention, `docker compose down -v` supprime les volumes de données.

**Phase 02** : le header devient sticky et la connexion du propriétaire est active. Créer le seul compte propriétaire avec `init_owner` (invite interactive, mot de passe non inscrit dans Git). Puis aller sur http://localhost:5178 et se connecter. Il n'existe pas d'inscription publique ni de comptes employés.

Pour réinitialiser le mot de passe localement avec accès à Docker :
~~~powershell
docker compose exec backend python manage.py reset_owner_password
~~~

L'API impose une session serveur, des cookies HttpOnly pour la session, CSRF pour les requêtes d'écriture et une limitation des tentatives de connexion conservée en base PostgreSQL. La saisie du téléphone est simplifiée : **Nom du produit** (ex. Téléphone), **Marque** (Samsung), **Modèle** (Galaxy A17), **État** (Neuf ou Occasion), prix et IMEI facultatif lors de la création. Il n'y a plus de champs Catégorie ou Référence à saisir. Les IMEI doivent normalement comporter 15 chiffres ; pour trouver les 15 chiffres, composer `*#06#` sur l'appareil. Si 14 chiffres sont saisis, le formulaire peut proposer le dernier chiffre calculé, mais l'utilisateur doit confirmer sa correspondance avec l'appareil. La base refuse les doublons et les IMEI non valides.

La Phase 03 enregistre réellement les produits et stocks sur PostgreSQL. Ouvrir « Produits & stock » après connexion. Les téléphones sont enregistrés individuellement avec IMEI principal et IMEI secondaire facultatif. Les pochettes et articles divers ont une quantité initiale et des corrections tracées. La recherche et les alertes de stock faible sont actives.

La Phase 02 est **en ligne uniquement** : l'authentification hors ligne sera étudiée avec le stockage sécurisé par appareil en Phase 08.

Les ventes, créances, synchronisation hors ligne et installateurs Windows/Android ne sont pas encore développés. Ne pas exposer l'environnement de développement sur Internet.

Voir [docs/ROADMAP.md](docs/ROADMAP.md).

## Phase 04 : achats fournisseurs

Dans « Achats & fournisseurs », clique sur « Nouvel achat », saisis le fournisseur, ajoute des produits et les quantités achetées. Les téléphones exigent un IMEI réel par unité. Valider la réception augmente le stock et conserve les coûts des lignes et l'historique. Une référence unique protège contre les doubles validations en cas de réessai réseau.

## Si le navigateur affiche une ancienne phase (Windows / Docker)

Avec Docker Desktop sous Windows, les modifications Git peuvent ne pas déclencher le rechargement à chaud de Vite. Le mode polling est activé dans `frontend/vite.config.ts`. Après un `git pull`, pour reconstruire le serveur web sans toucher à PostgreSQL :

~~~powershell
docker compose up -d --force-recreate --no-deps frontend
docker compose logs --tail 25 frontend
~~~

Attendre dans les journaux le message `VITE ... ready`, puis ouvrir `http://localhost:5178` et faire `Ctrl + Shift + R`. Tester éventuellement dans une fenêtre privée. **Ne pas exécuter `docker compose down -v` : cette commande détruirait les volumes PostgreSQL.**

## Phase 05 — Caisse et ventes

Dans « Caisse », rechercher un article et cliquer Ajouter. Pour un téléphone, scanner ou saisir son IMEI de 15 chiffres (ou choisir un IMEI du stock proposé) ; chaque téléphone physique ne peut être vendu qu'une fois. Pour les pochettes/accessoires, utiliser les boutons +/− de quantité. Les prix peuvent être modifiés dans le panier par le propriétaire.

Choisir **Tout**, **Moitié** ou **Autre montant**, puis le moyen de paiement. En cas de reste à payer, nom et téléphone du client sont obligatoires ; le remboursement ultérieur sera ajouté en Phase 07. Après validation, les mouvements de stock et le bénéfice brut sont enregistrés dans PostgreSQL et la vente apparaît dans l'historique. La facture personnalisée et l'impression sont prévues en Phase 06. La caisse nécessite actuellement une connexion au serveur (offline : phase ultérieure).

La référence `client_ref` rend un nouvel envoi identique sûr contre les ventes en double. Si une coupure survient pendant l'enregistrement, utiliser « Réessayer la même vente » sans modifier le panier. Ne jamais arrêter Docker avec `down -v`.

## Créances actives (complément Phase 05)

Les ventes payées à moitié ou à crédit apparaissent dans « Créances » avec client, téléphone, échéance, total, encaissé et solde. Filtres En cours / En retard / Payées / Toutes, recherche, historique des versements. « Encaisser » permet Tout / Moitié / Autre montant, avec moyen de paiement, validation atomique et référence UUID anti-doublon. Les remboursements ne s'ajoutent **jamais** au chiffre d'affaires de la vente. L'option « Relancer WhatsApp » ouvre un message prérempli sans l'envoyer automatiquement.

## Phase 06 — En-tête personnalisable, factures, reçus

Dans **Paramètres**, configurer le nom de la boutique, téléphone, adresse, email, NIF/RCCM, message de pied de page et logo PNG/JPG/WebP (90 Ko maximum). Chaque modification crée une **version immuable** de l'en-tête. Les ventes gardent la version active au moment de la vente. Les ventes existantes avant cette mise à jour reçoivent une seule fois l'en-tête initial par défaut lors de la migration.

Depuis **Caisse > Dernières ventes** ou après une vente, cliquer **Facture** ; depuis **Créances**, cliquer **Facture** ou **Reçu** sur un versement. L'aperçu contient les lignes, montants, IMEI des téléphones, paiement et solde sans exposer le coût d'achat ni la marge. Choisir **A4, A5 ou Ticket 80 mm**, puis utiliser « Imprimer / Enregistrer en PDF » : la fonction PDF repose sur le dialogue d'impression du navigateur, pas sur un export PDF serveur.
