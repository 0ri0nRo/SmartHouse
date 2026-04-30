# Contributing

Thanks for wanting to contribute to SmartHouse! A few guidelines to make collaboration smooth.

## How to contribute

- Fork the repo (if applicable) and open a branch for your work: `git checkout -b feat/short-description`.
- Keep changes focused and use clear commit messages.
- Open a pull request against the `master` branch with a short description of the change and any manual test steps.

## Code style and checks

- Python: follow common conventions (PEP8). Run linting (if configured) and unit tests where applicable.
- Frontend: run `pnpm lint` in `client/` and ensure builds pass with `pnpm build`.

## Tests

- Add or update tests for new features or bug fixes where reasonable. Describe manual verification steps in the PR if automated tests are not available.

## Communication

- Explain the motivation for the change in your PR description.
- If the change affects deployment or environment variables, update `docs/INSTALLATION.md` or `docs/DEPLOYMENT.md` accordingly.

If you want, I can add a `code_of_conduct.md` and a sample `ISSUE_TEMPLATE.md` next.
