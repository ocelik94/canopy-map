# Contributing to Canopy

Thanks for helping! Bug reports and feature ideas go into GitHub issues (please use the templates).
For security problems, follow [SECURITY.md](SECURITY.md) instead of opening an issue.

## Development setup

Requirements: Node.js 24 (see `.nvmrc`) and pnpm (the version is pinned in `package.json`; with
Corepack, `corepack enable` is enough).

```bash
pnpm install
pnpm db:migrate
ADMIN_PASSWORD='choose-a-long-password' pnpm create-admin admin
pnpm dev                     # http://localhost:5173
```

Optional demo data: `pnpm seed:hessen` creates a realistic test fleet. For a map in development, put a
`.pmtiles` file into `data/tiles/` (see "Map tiles" in the README).

## Checks

Run these before opening a pull request; CI runs the same:

```bash
pnpm lint            # Prettier
pnpm check           # svelte-check / TypeScript
pnpm test            # Vitest unit tests (sync, auth, admin, logs, CSV, routing, ...)
pnpm test:e2e        # Playwright on an emulated phone (first run: pnpm exec playwright install chromium)
pnpm licenses:check  # dependency licences
yamllint --strict .
```

## Project layout

```
src/lib/server/      auth, database (Drizzle + SQLite), sync, admin, audit logs, tiles
src/lib/client/      IndexedDB store (Dexie), outbox and sync engine, map helpers
src/lib/shared/      zod schemas, CSV/GeoJSON, planning and routing logic (used by both sides)
src/lib/components/  Svelte components
src/lib/i18n/        UI strings, one file per language
src/routes/          pages and the /api endpoints
drizzle/             database migrations
scripts/             admin, seeding, backup and build scripts
```

## Guidelines

- **Mobile first.** Field staff use phones, often with gloves and in sunlight. Test on a phone-sized
  screen and, for UI changes, on iPhone Safari; keep touch targets large and controls the same height.
- **Offline first.** The UI reads and writes the local database; changes go through the functions in
  `src/lib/client/repo.ts`, which record them in the outbox. Never call the API directly for field data.
- **Strings.** Every UI text goes into both `src/lib/i18n/en.ts` and `de.ts` (the type check enforces
  identical keys). English is the default.
- **Privacy.** Never write exact device coordinates, passwords or tokens to logs or error messages.
- **Comments.** Keep them rare; prefer clear names and small functions.
- **Schema changes.** Edit `src/lib/server/db/schema.ts`, then run `pnpm db:generate` and commit the
  new migration in `drizzle/`. CI fails if the schema and migrations disagree.

## Dependencies

Canopy must stay usable without commercial services and under permissive licences:

- Allowed: MIT, MIT-0, ISC, BSD-2-Clause, BSD-3-Clause, 0BSD, Apache-2.0, MPL-2.0 (unmodified),
  BlueOak-1.0.0, CC0-1.0, Unlicense, Python-2.0, Zlib; CC-BY-4.0 for data and OFL-1.1 for fonts.
- Not allowed: GPL, AGPL, LGPL, SSPL, BUSL, "source available" or non-commercial licences, proprietary
  SDKs, and anything that calls third-party services at runtime (maps, geocoding, analytics, CDNs).

Check a licence before adding a package (`pnpm view <package> license`), then run
`pnpm licenses:check`. For new production dependencies also run `pnpm licenses:generate` and commit
the updated `THIRD_PARTY_LICENSES.md`.

## Container image

The image is built with [melange](https://github.com/chainguard-dev/melange) and
[apko](https://github.com/chainguard-dev/apko) from [Wolfi](https://wolfi.dev) packages: no shell, no
package manager, non-root. To build it locally (Linux with bubblewrap):

```bash
scripts/build-image.sh canopy-map:dev
docker load < canopy-map.tar
```

## Pull requests

1. Fork and create a branch from `main`.
2. Keep changes focused; add or update tests.
3. Fill in the pull request checklist.

## Releases

Maintainers release by pushing a tag `vX.Y.Z` on `main`. The release workflow runs all checks, builds
the image for amd64 and arm64, scans it, publishes it to `ghcr.io/ocelik94/canopy-map` (`X.Y.Z`, `X.Y`,
`X`, `latest`) with provenance and an SBOM, and creates the GitHub release. Pre-release tags such as
`v1.3.0-rc.1` are published under their own tag only and never become `latest`. Pushes to `main` never
publish an image.
