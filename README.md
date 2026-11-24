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

Dans **Paramètres**, configurer le nom de la boutique, téléphone, adresse, email, NIF/RCCM, message de pied de page et logo PNG/JPG/WebP (90 Ko maximum). Chaque modification conserve une version de l'en-tête en base à des fins d'historique, mais **toutes les factures de vente et tous les reçus (anciens ou nouveaux) affichent l'en-tête actuellement enregistré dans Paramètres** lors de leur prochaine consultation/impression. Les montants, les dates et les lignes historiques de vente ne changent pas. Les PDF déjà téléchargés ne sont pas modifiés.

Depuis **Caisse > Dernières ventes** ou après une vente, cliquer **Facture** ; depuis **Créances**, cliquer **Facture** ou **Reçu** sur un versement. L'aperçu contient les lignes, montants, IMEI des téléphones, paiement et solde sans exposer le coût d'achat ni la marge. Choisir **A4, A5 ou Ticket 80 mm**, puis utiliser « Imprimer / Enregistrer en PDF » : la fonction PDF repose sur le dialogue d'impression du navigateur, pas sur un export PDF serveur.

### Liste des paiements de créances

En bas de la page « Créances », une section **Liste des paiements de créances** montre directement les 100 derniers acomptes initiaux et remboursements des ventes à crédit, avec client, référence, date, moyen de paiement, montant et bouton Reçu. Elle reste visible après paiement complet, indépendamment du filtre En cours/Payées, et suit la recherche du client. Le chiffre d’affaires n’est jamais additionné une deuxième fois lors d’un remboursement. Les cartes s’adaptent aux téléphones.

## Phase 07 — Rapports, dépenses et alertes

**Rapports :** Aujourd'hui, semaine, mois, année ou période. Distingue chiffre d'affaires, encaissements à la date réelle du paiement, coût des marchandises vendues, marge brute, dépenses, résultat indicatif et sommes encore dues. Liste des marchandises vendues et chronologie par jour. Impression navigateur possible.

**Dépenses :** formulaire bref Motif / Montant / Date / Note facultative, historique et calcul du total par période. Enregistrement UUID idempotent, accès propriétaire uniquement, sans suppression des anciennes opérations. Les achats pour stock restent dans « Achats & fournisseurs » : sinon le coût serait compté deux fois.

**Notifications :** alertes calculées à l'ouverture ou par clic sur Actualiser (stock faible ou épuisé, créances en retard ou arrivant dans les trois jours). Aucun envoi en tâche de fond pour l'instant.

**Relances WhatsApp :** depuis Créances, choisir un texte poli ou ferme, le modifier, puis cliquer « Ouvrir WhatsApp ». Le logiciel n'envoie pas le message automatiquement.


## Phase 08 — Premier socle de fonctionnement hors connexion

1. Ouvrir **Hors connexion** lorsque Django est accessible. Choisir une **phrase secrète distincte du mot de passe**, d'au moins huit caractères. La clé ne reste qu'en mémoire et les données locales sont chiffrées AES-GCM par WebCrypto ; la phrase n'est jamais envoyée au serveur.
2. Cliquer **Mettre à jour le catalogue** avant de couper le réseau. Le navigateur mémorise au plus 200 articles (limite actuelle de l'API). Les quantités ne sont que le dernier état observé, **pas une réservation** ; la vérification est toujours faite par Django à la synchronisation.
3. Dans le coffre, composer un panier et enregistrer **en attente**. Les ventes avec téléphone exigent un IMEI saisi manuellement ; un brouillon ne diminue pas le stock central, ne met pas à jour les chiffres du jour et ne crée aucune facture définitive.
4. Dès que le réseau revient, se connecter au même propriétaire, déverrouiller le coffre local, puis cliquer **Synchroniser les ventes**. Les opérations sont transmises une à une avec leur `client_ref` d'origine ; Django vérifie les stocks/IMEI et accepte sans doublon les retransmissions identiques. Les conflits restent visibles et demandent une intervention manuelle.
5. Le coffre est **local à un navigateur/appareil** : les brouillons non synchronisés ne sont pas partagés avec un autre PC ou téléphone. Une vente en conflit n'est jamais automatiquement confirmée. Les factures n'existent qu'après confirmation serveur.

**Sécurité et limites :** les cookies, mots de passe et données d'API ne sont jamais enregistrés dans le cache HTTP du Service Worker. Les brouillons/coordonnées clients sont chiffrés dans IndexedDB. Si le navigateur efface ses données, si l'appareil est perdu ou si la phrase secrète est oubliée, les brouillons peuvent être irrécupérables. Le coffre n'est pas une sauvegarde. Le navigateur exige HTTPS ou `localhost` pour utiliser WebCrypto/Service Worker ; pour ouvrir le PC depuis un téléphone, `localhost:5178` sur le téléphone ne pointe pas vers le PC. Une adresse HTTPS accessible et sécurisée sera nécessaire.

**Note importante :** cette phase est une base **web** ; elle ne transforme pas encore React en une application SQLite Windows/Android native. Le socle de synchronisation utilise le PostgreSQL Django existant comme source de vérité ; la base SQLite native et l'installation seront traitées dans une phase ultérieure.

Ne jamais utiliser `docker compose down -v` : cette commande supprimerait la base PostgreSQL locale.


## Personnalisation premium de l'identité boutique

Dans **Paramètres → Identité de ma boutique**, configurer le nom, logo, téléphone, email, adresse et texte de facture. Après **Enregistrer l'identité de ma boutique**, le nom et le logo deviennent l'identité de l'interface : menu latéral, fil d'Ariane, tableau de bord, icône utilisateur, onglet du navigateur et page de connexion. La mise à jour des écrans déjà ouverts est immédiate, sans recharger l'application. Les factures et reçus (anciens et nouveaux) reprennent toujours l'en-tête actuel.

- La page de connexion utilise `GET /api/shop/identity/` : seuls le **nom et le logo** sont publics, jamais le téléphone, l'email, l'adresse ou le NIF.
- Le manifeste PWA utilise `GET /api/shop/manifest.webmanifest` et reprend le nom de la boutique lors d'une nouvelle installation ; sur une PWA **déjà installée**, le navigateur peut conserver l'ancien nom tant qu'il ne met pas le manifeste à jour (parfois réinstallation nécessaire).
- Le logo de l'interface et le favicon s'adaptent au logo configuré. L'icône générique de secours reste celle du manifeste lorsque le navigateur réclame un format d'icône spécifique.
- **PhoneStock Pro** reste cité discrètement comme fabricant du logiciel ; les titres et menus affichent prioritairement le nom de la boutique.
- Cette personnalisation ne modifie aucune vente, facture comptable, IMEI, dette, licence ou base de données. Le thème jour/nuit, l'impression et le mode hors ligne restent fonctionnels.


## Tableau de bord dynamique (Chart.js) et compte propriétaire

L'accueil du propriétaire affiche **les données enregistrées en PostgreSQL**, lues à chaque visite dans l'API \`GET /api/reports/\` (authentification obligatoire) avec choix **Aujourd'hui / Semaine / Mois / Année / Période** et bouton Actualiser.

- Six cartes lisibles : chiffre d'affaires des ventes de la période, encaissements réellement reçus pendant la période (incluant paiements d'anciennes créances), créances encore dues des ventes de la période, marge brute historique, dépenses et résultat indicatif.
- **Chart.js 4.6.1** : anneau dynamique répartissant le total des ventes de la période entre **déjà réglé sur ces ventes** et **reste dû sur ces ventes**, courbe des ventes/marges par jour, barres des 5 marchandises les plus vendues par montant. Les graphiques sont remontés à partir des données réelles, jamais de données de démonstration.
- Période sans vente : état vide explicite. Erreur réseau : aucune carte avec des zéros supposés. Tous les graphiques sont responsives sur PC/tablette/mobile et s'adaptent au thème.
- L'anneau utilise \`ventes_de_la_période - reste_dû_de_ces_ventes\` : **ne pas y injecter \`collected\`**, qui peut contenir le remboursement d'une dette d'une ancienne période.
- Les calculs en FCFA restent côté Django (Decimal) ; Chart.js convertit uniquement les résultats pour le rendu visuel.

**Mon profil** est accessible depuis la navigation ou le bouton avatar dans la barre supérieure. Le propriétaire peut mettre à jour prénom, nom et adresse email du compte via \`GET/PUT /api/account/profile/\`, et modifier son mot de passe via \`POST /api/account/password/\`. Le compte reste le seul propriétaire ; l'identifiant de connexion est conservé. Le mot de passe actuel est obligatoire, les validateurs Django s'appliquent au nouveau, les écritures exigent une session Django et CSRF. Après modification du mot de passe, la session courante reste ouverte et les autres sessions sont invalidées par le changement du hash d'authentification. Aucun mot de passe n'est renvoyé dans les réponses.

**Tester** : créer une vente à crédit avec acompte et vérifier que chiffre d'affaires, encaissements et solde sont différents ; ajouter une dépense et revenir au tableau de bord pour constater l'effet sur le résultat indicatif ; réinitialiser le mot de passe avec son mot de passe courant et vérifier que la session reste active. L'interface « Mon profil » n'est pas visible pour un utilisateur non connecté. Ne jamais utiliser \`docker compose down -v\`.
