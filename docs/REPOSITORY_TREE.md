# Repository Tree

This file provides a concise view of the repository structure to help contributors quickly locate important code and assets.

Top-level (important paths):

- `docker-compose.yml` — local multi-service stack
- `README.md` — project overview and quick start
- `CONTRIBUTING.md` — contribution guidelines
- `LICENSE`
- `docs/` — project docs (INSTALLATION, DEPLOYMENT, ARCHITECTURE, REPOSITORY_TREE)
- `client/` — React/Vite frontend
- `src/` — Flask backend, services, API blueprints and utilities
- `nginx/` — example Nginx configuration and TLS assets
- `uploads/` — runtime files (GeoIP DB, uploads)
- `utils/` — misc scripts and hardware helpers

Selected expanded view:

- client/
  - README.md
  - package.json
  - index.html
  - public/
    - manifest.json
    - sw.js
    - favicon.svg
  - src/
    - main.jsx
    - App.jsx
    - api/
    - components/ (UI widgets like `NetworkDevicesWidget`, `ChartCard`, `RecipeWidget`)
    - pages/ (Home, Calendar, Security, Train, AirQuality, etc.)

- src/
  - app.py (Flask entry)
  - main.py, scanner_service.py, sensor_reader.py
  - requirements.txt
  - backup.sh
  - .env.example
  - api/ (blueprints: `sensor_routes.py`, `network_devices_routes.py`, `todolist_routes.py`, `honeypot_routes.py`, ...)
  - services/ (domain services like `network_service.py`, `sensor_service.py`, `todolist_service.py`, `recipe_service.py`)
  - models/ (database models and helpers)
  - client/ (backend-side clients: `MongoClient.py`, `PostgresClient.py`, `GoogleCalendarClient.py`)
  - config/ (settings and credential placeholders)
  - static/ (static assets served by backend)
  - utils/ (helpers: `json_encoder.py`, `redis_cache.py`, scanner utilities)

- nginx/
  - nginx.conf (example configs and legacy variants)

- uploads/
  - GeoLite2-City.mmdb

Where to look for common tasks:

- API endpoints and handlers: `src/api/`
- Background services and scheduled jobs: `src/` root and `src/services/`
- Frontend components: `client/src/components/` and `client/src/pages/`
- Environment and deployment: `src/.env.example`, `docker-compose.yml`, `docs/DEPLOYMENT.md`

If you want, I can also add a generated full tree with file counts or create per-directory README files.
