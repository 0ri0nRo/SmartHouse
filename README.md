# SmartHouse

Full-stack smart home dashboard with a Flask backend and a React/Vite frontend.

## Overview

The project exposes HTTP and WebSocket APIs for sensors, security, network devices, calendar, recipes, shopping lists, train times, honeypot data, and other home-automation related modules. The React frontend is served by Flask with an SPA fallback to `index.html` for non-API routes.

Main stack:
- Backend: Flask, Flask-SocketIO, PostgreSQL, MongoDB, Redis
- Frontend: React, Vite, React Router
- Local deployment: Docker Compose

## Features

- Sensor data collection and REST APIs
- Real-time updates via WebSockets (Flask-SocketIO)
- Network device discovery and monitoring
- Calendar integration and event notifications
- Recipe management and shopping list support
- Honeypot telemetry and geoip enrichment (optional)

## Services and important components

- `src/` — Flask app, API blueprints and background services
- `client/` — React/Vite frontend (SPA)
- `docker-compose.yml` — multi-container local stack (Postgres, Mongo, Redis, backend, frontend, optional services)
- `nginx/` — example Nginx config and local TLS assets
- `uploads/` — runtime files (GeoIP DB, uploads)

## Repository Structure

- `src/`: Flask backend, services, API blueprints, support scripts
- `client/`: React/Vite frontend
- `docker-compose.yml`: local multi-service stack
- `nginx/`: Nginx configuration and local certificates
- `uploads/`: runtime files (for example GeoIP database)

## Prerequisites

- Docker + Docker Compose plugin (`docker compose`)
- Node.js 20+ and pnpm (for standalone frontend development)
- Python 3.11+ (for standalone backend development)

## Configuration

Place runtime environment variables in `src/.env` (example: database URLs, credentials, API keys). Some services require additional credentials stored under `src/config/credentials/`.

See [docs/INSTALLATION.md](docs/INSTALLATION.md) for detailed setup and [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for a short architecture overview.

## Quick Start with Docker (Recommended)

1. Configure environment variables in `src/.env`.
2. Start the stack:

```bash
docker compose up -d --build
```

3. Check service status:

```bash
docker compose ps
```

4. Stop the stack:

```bash
docker compose down
```

## Local Backend Development (Without Docker)

```bash
cd src
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python app.py
```

Note: full runtime requires PostgreSQL, MongoDB, Redis, and consistent environment variables.

## Contributing

Contributions are welcome. When opening changes:

- Keep commits small and focused.
- Add tests or manual verification steps for behavioral changes.
- Update documentation for new features or breaking changes.

If you want, I can add a `CONTRIBUTING.md` and example `.env.example` next.

## Local Frontend Development

```bash
cd client
pnpm install
pnpm dev
```

Production frontend build:

```bash
cd client
pnpm build
```

## Deployment

Standard deployment:

```bash
docker compose up -d --build
```

Update workflow:

```bash
git pull
docker compose up -d --build
```

## Useful Operations

PostgreSQL backup (project script):

```bash
sudo src/backup.sh
```

Backend health endpoint:

```bash
curl http://localhost:5000/health
```

## Maintenance Notes

- Legacy server-rendered HTML routes are no longer used. UI is managed by the React frontend.
- Keep docs aligned with the current repository structure and avoid references to removed legacy templates.
