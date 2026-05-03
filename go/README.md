# SmartHouse Go backend

This directory contains an idiomatic Go port of the Python server bootstrap.

## What is already ported

- HTTP server bootstrap
- Environment-based configuration
- CORS handling
- `/health`
- `/api/ping`
- `/api/news`
- `/api/sunmoon`
- `/api/devices`
- `/api/devices/stats`
- `/api/devices/most_connected_days`
- `/api/devices/alerts`
- `/api/devices/history`
- favicon serving
- React SPA fallback for non-API routes

## Run locally

```bash
cd go
go run ./cmd/smarthouse
```

## Build

```bash
cd go
go build ./cmd/smarthouse
```

## Docker

From the repository root:

```bash
docker compose up --build app_go
```

This uses `go/Dockerfile` and serves the React static bundle from `src/static/react`.
The service is published on host port `5001` to avoid clashing with the existing Python backend.

## Environment variables

- `HOST` default `0.0.0.0`
- `PORT` default `5000`
- `STATIC_DIR` default `src/static/react`
- `HOME_LAT` default `41.7276`
- `HOME_LON` default `13.3681`
- `REDIS_HOST` default `redis`
- `REDIS_PORT` default `6379`
- `CORS_ALLOWED_ORIGIN` default `*`
- `CORS_ALLOWED_METHODS` default `GET,HEAD,POST,PUT,PATCH,DELETE,OPTIONS`
- `CORS_ALLOWED_HEADERS` default `Content-Type,Authorization`

## Notes

The Python repository contains many domain-specific blueprints and database-backed services. Those can be ported next as dedicated Go packages using the same router pattern.
