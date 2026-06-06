Frontend theme and tokens
========================

This short guide explains the token-based theme introduced in the client and where to edit it.

Main token file
---------------

- `client/src/styles/global.css` — central place for color tokens, gradients, spacing, and light/dark theme variables. Update colors here to affect the whole app.

Shared UI primitives
--------------------

- `client/src/components/ui/Card.css`
- `client/src/components/ui/Button.css`
- `client/src/components/ui/ThemeToggle.css`

When to change what
--------------------

- Global look & colors: change tokens in `global.css`.
- Component-specific spacing / layout: edit the corresponding CSS in `client/src/components/*`.
- Page layout wrappers: check `client/src/pages/*` — pages use a `WidgetShell` / `PageShell` pattern.

Common tokens (examples)
------------------------

- `--bg-page`, `--bg-surface`, `--bg-surface-2`
- `--border`, `--accent`, `--text-primary`, `--text-secondary`
- `--card-air-accent`, `--color-success`

Quick workflow
--------------

1. Edit `client/src/styles/global.css` tokens.
2. Run `pnpm dev` and verify in the browser.
3. Build with `pnpm run build` to ensure no bundling regressions.

If you want, I can create a small script or Storybook story to preview token changes interactively.
