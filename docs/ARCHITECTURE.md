# Architecture Overview

This file gives a short overview of the SmartHouse architecture and major components.

## High-level

- Frontend: React single-page application built with Vite (`client/`). Served as static assets by the backend in production.
- Backend: Flask application (`src/app.py`) exposing REST and WebSocket endpoints. Uses Flask blueprints under `src/api/`.
- Data stores: PostgreSQL (primary relational data), MongoDB (document store for logs/telemetry), Redis (cache / ephemeral state / pubsub).

## Services and responsibilities

- `sensor_service.py` and related modules: ingest sensor readings and expose endpoints.
- `network_service.py`: discovery and monitoring of LAN devices.
- `todolist_service.py`, `recipe_service.py`, `train_service.py`: domain services exposing APIs consumed by the frontend.

## Deployment

- `docker-compose.yml` provides a convenient local stack for development and testing.
- `nginx/` contains example reverse proxy and TLS assets for production or staging.

## Where to look in the code

- API blueprints: `src/api/`
- Services: `src/services/`
- Frontend app entry: `client/src/main.jsx` (or `client/src/App.jsx`)
