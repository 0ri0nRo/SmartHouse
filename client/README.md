# SmartHouse Frontend

React/Vite single-page application for the SmartHouse project.

## Requirements

- Node.js 20+
- pnpm

## Development

Install dependencies and start the dev server:

```bash
pnpm install
pnpm dev
```

The dev server provides fast HMR and opens on `localhost:5173` by default.

## Production Build

```bash
pnpm build
```

## Build Preview

```bash
pnpm preview
```

## Linting

```bash
pnpm lint
```

## Configuration

The frontend is a typical Vite app. Environment variables for the build (if needed) can be provided via `.env` files in this folder. In production, built assets are copied/served by the Flask backend.

## Notes

- The frontend uses React Router for client-side navigation.
- For local API integration, run the backend (see root README) and ensure `src/.env` or proxy settings point to the backend API URL.
