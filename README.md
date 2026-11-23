# PhoneStock Pro

Socle technique de l'application de gestion de téléphones, pochettes et produits divers.

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

**Phase 01 uniquement :** ce dépôt contient le socle Django/PostgreSQL/React/Docker et une interface de navigation. Les ventes, l'authentification, les créances, la synchronisation et les installateurs Windows/Android sont prévus pour les phases suivantes. Ne pas exposer l'environnement de développement sur Internet.

Voir [docs/ROADMAP.md](docs/ROADMAP.md).
