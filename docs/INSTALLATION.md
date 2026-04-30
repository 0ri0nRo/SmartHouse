# Installation and Setup

This document describes recommended ways to run SmartHouse locally and in development.

## Recommended: Docker Compose

1. Copy or create `src/.env` with required environment variables (database URIs, secrets).
2. Build and start the stack:

```bash
docker compose up -d --build
```

3. Verify services:

```bash
docker compose ps
curl http://localhost:5000/health
```

4. Stop the stack:

```bash
docker compose down
```

Notes:
- Docker Compose brings up Postgres, MongoDB, Redis, the Flask backend and the frontend (if configured).
- TLS and Nginx configs are in the `nginx/` folder for reference; adjust for your deployment.

## Backend (Standalone)

For Python development without Docker:

```bash
cd src
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python app.py
```

Ensure Postgres, MongoDB and Redis are available and environment variables in `src/.env` point to them.

## Frontend (Standalone)

```bash
cd client
pnpm install
pnpm dev
```

For production build:

```bash
pnpm build
```

## Optional: TLS and Reverse Proxy

See `nginx/` for example configurations. For production, use a reverse proxy (Nginx) with proper TLS and environment-specific settings.

## Next Steps

- Add a `src/.env.example` with all required variables (I can create this if you'd like).
- Add `CONTRIBUTING.md` with workflow and code style guidelines.
