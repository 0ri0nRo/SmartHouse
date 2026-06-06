# React + Vite

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend using TypeScript with type-aware lint rules enabled. Check out the [TS template](https://github.com/vitejs/vite/tree/main/packages/create-vite/template-react-ts) for information on how to integrate TypeScript and [`typescript-eslint`](https://typescript-eslint.io) in your project.

## Project specifics (SmartHouse client)

This repository contains a React + Vite single-page app under this `client/` folder. Recent work refactored the UI to a token-based aesthetic theme and restyled the main pages for visual consistency.

- Theme tokens: `client/src/styles/global.css` — update colors, gradients, and tokens here.
- Shared UI primitives: `client/src/components/ui/` (Card, Button, ThemeToggle, etc.).
- Pages restyled: `Home`, `Floorplan`, `Security`, `Calendar`, `AirQuality` (see `client/src/pages/`).

### Local development

Install and run the dev server with HMR:

```bash
cd client
pnpm install
pnpm dev
```

### Production build

```bash
cd client
pnpm install --frozen-lockfile
pnpm run build
pnpm run preview    # serve the built bundle locally
```

### Notes for contributors

- When changing the visual theme, edit `client/src/styles/global.css` and then review `client/src/components/ui/*` for components using inline or legacy styles.
- If you modify large, shared components, run a local build to catch bundling warnings: `pnpm run build`.
- Bundle warnings: the build currently reports some large chunks (>500KB). Use code-splitting or adjust `build.chunkSizeWarningLimit` in `vite.config.js` if needed.

### Helpful paths

- `client/src/styles/global.css` — design tokens and global styles
- `client/src/components/ui/` — shared UI controls (Card, Button, etc.)
- `client/src/pages/` — page-level components
- `client/src/lib/` — utilities, api clients

If you want, I can add a CONTRIBUTING.md with local dev tips and PR checklist.
