# SmartHouse

Full-stack smart home dashboard with a Flask backend and a React/Vite frontend.

## Overview

The project exposes APIs for sensors, security, network devices, calendar, recipes, shopping list, trains, honeypot data, and related modules. The React frontend is served by Flask with an SPA fallback to `index.html` for non-API routes.

Main stack:
- Backend: Flask, Flask-SocketIO, PostgreSQL, MongoDB, Redis
- Frontend: React, Vite, React Router
- Local deployment: Docker Compose

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
