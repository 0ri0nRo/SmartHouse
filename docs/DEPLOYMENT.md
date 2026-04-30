# Deployment Guide

This document covers deployment-related steps for SmartHouse: Docker Compose, Nginx reverse proxy, TLS, and common operational commands.

## Docker Compose (recommended for local and small deployments)

Build and start the stack:

```bash
docker compose up -d --build
```

Check status and logs:

```bash
docker compose ps
docker compose logs -f
```

Update (pull changes, rebuild services):

```bash
git pull
docker compose up -d --build
```

Stop and remove containers:

```bash
docker compose down
```

## Environment variables

The backend reads runtime configuration from environment variables placed under `src/.env` (not tracked). Use `src/.env.example` as a starting point when provisioning.

Key variables include:
- `DATABASE_URL` — Postgres connection string
- `MONGODB_URI` — MongoDB connection string
- `REDIS_URL` — Redis connection URL
- `SECRET_KEY` — Flask secret key
- `FRONTEND_URL` — frontend base URL for CORS / builds

## Nginx and TLS (reverse proxy)

The `nginx/` folder contains example configs used in development. For production:

- Configure Nginx to proxy `/api/` and websocket endpoints to the Flask backend (port 5000 by default).
- Serve the production-built frontend as static files from the `client/dist` folder or via the Flask static handler.
- Use certbot or your TLS provider to obtain certificates and reference them in your Nginx server blocks.

Example proxy snippet for websockets and HTTP (conceptual):

```
location /socket.io/ {
    proxy_pass http://127.0.0.1:5000/socket.io/;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
}

location /api/ {
    proxy_pass http://127.0.0.1:5000/api/;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
}
```

Adjust upstream host/ports to match your container or host network setup.

## Backups and database maintenance

- PostgreSQL: use `pg_dump` or the provided `src/backup.sh` script for full dumps.
- MongoDB: use `mongodump` / `mongorestore` for collections and telemetry.

## Systemd / Production process supervision

If running the Flask app directly (not in containers), use a process manager (systemd, Gunicorn + systemd) and configure a reverse proxy in front of it. Prefer containerized deployments for simplicity.

## Troubleshooting

- `docker compose logs -f <service>` to follow service logs.
- Check `curl http://localhost:5000/health` for backend health.
- Verify DB connectivity from inside the backend container: `docker compose exec backend ping -c 1 <db-host>` or use `psql` / `mongo` clients.

## Security and hardening

- Do not commit `src/.env` to version control. Use secrets management in production.
- Keep TLS certificates updated and restrict access to admin endpoints.

## Next steps

- Add CI/CD pipeline to automate builds and deployments.
- Add automated backups and health-check monitoring.
