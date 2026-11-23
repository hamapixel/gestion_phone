# PhoneStock Pro

Socle technique de l'application de gestion de téléphones, pochettes et produits divers. **Chaque logiciel est réservé au propriétaire de la boutique : un seul compte, sans rôles gérant/vendeur.** Le propriétaire pourra utiliser le même compte sur son PC et son téléphone (synchronisation prévue dans une phase ultérieure).

## Démarrage Windows (Phases 01 et 02)

~~~powershell
git clone https://github.com/hamapixel/gestion_phone.git
cd gestion_phone
git switch feature/phase-02-owner-auth-sticky-header
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

L'API impose une session serveur, des cookies HttpOnly pour la session, CSRF pour les requêtes d'écriture et une limitation des tentatives de connexion conservée en base PostgreSQL. La Phase 02 est **en ligne uniquement** : l'authentification hors ligne sera étudiée avec le stockage sécurisé par appareil en Phase 08.

Les ventes, créances, synchronisation hors ligne et installateurs Windows/Android ne sont pas encore développés. Ne pas exposer l'environnement de développement sur Internet.

Voir [docs/ROADMAP.md](docs/ROADMAP.md).
