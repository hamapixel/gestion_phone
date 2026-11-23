# PhoneStock Pro

Socle technique de l'application de gestion de téléphones, pochettes et produits divers. **Chaque logiciel est réservé au propriétaire de la boutique : un seul compte, sans rôles gérant/vendeur.** Le propriétaire pourra utiliser le même compte sur son PC et son téléphone (synchronisation prévue dans une phase ultérieure).

## Démarrage Windows (Phase 01)

~~~powershell
git clone https://github.com/hamapixel/gestion_phone.git
cd gestion_phone
git switch feature/phase-01-socle
Copy-Item .env.example .env
docker compose up --build -d
docker compose ps
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

**Phase 01 uniquement :** ce dépôt contient le socle Django/PostgreSQL/React/Docker et une interface de navigation. Les ventes, la connexion sécurisée du propriétaire, les créances, la synchronisation et les installateurs Windows/Android sont prévus pour les phases suivantes. Ne pas exposer l'environnement de développement sur Internet.

Voir [docs/ROADMAP.md](docs/ROADMAP.md).
