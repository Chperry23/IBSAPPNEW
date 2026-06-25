# Cabinet PM — Agent guidance

Guidance for Cursor / AI agents working in this repo.

## Overview

**Cabinet PM** (ECI Industrial Solutions) — offline-first tablet app for preventive maintenance
and cabinet inspections at customer sites.

- **Local:** SQLite (`data/cabinet_pm_tablet.db`) on each Windows tablet
- **Cloud:** MongoDB master + HTTP `sync-server` for bidirectional sync
- **Stack:** Node/Express backend, React (Vite) frontend, pkg-built `.exe` for field tablets

Key domains: PM sessions, cabinets, system registry (XML/FHX import), diagnostics, I&I documents, sync.

## Commands

```bash
npm start                    # tablet server (server-tablet.js)
npm run dev:frontend         # Vite dev server
npm run build                # frontend + exe + full package
npm run build:info           # regenerate build-info.json
npm run sync-server          # local sync-server (port 3090)
node scripts/prune-stale-change-log.js   # repair bloated change_log before upload
node scripts/audit-unsynced-by-table.js  # per-table unsynced breakdown
```

## Architecture pointers

| Area | Location |
|------|----------|
| Sync tables / models | `backend/services/sync-tables.js`, `backend/models/mongodb-models.js` |
| Tablet sync client | `backend/services/sync-client.js` |
| Master commit | `sync-server/services/commit.js` |
| SQLite schema | `backend/config/init-db.js` |
| Sync write helpers | `backend/utils/sync-write-helper.js`, `change-journal.js` |
| Registry import | `backend/routes/systemRegistry.js`, `fhxBundleIngest.js` |

Upload eligibility: `synced = 0 AND uuid IS NOT NULL`. Registry imports can bloat `change_log` — prune before push.

## Git & versioning

- SemVer in `package.json` (currently aligned with release tags `vX.Y.Z`)
- Work on **`develop`**; `feature/*`, `fix/*`, `chore/*` branch from there
- **`main`** = tagged releases only
- Conventional Commits; `CHANGELOG.md` follows Keep a Changelog
- Full workflow: `docs/git-workflow-and-versioning.md`
- Release: `npm run version:patch` (or `minor` / `major`) then tag and push per workflow doc

## Obsidian vault (`notes/`)

Work log and cross-session context live in **`notes/`** (gitignored — open as Obsidian vault).

- AI/agent content **only** under `notes/agents/`
- Do not edit human vault folders without explicit ask
- Session start: read `notes/agents/README.md` and `notes/agents/cursor-plans/INDEX.md`

Setup: `docs/obsidian-vault.md`

## Session start

Before substantive work, read:

1. `notes/agents/README.md`
2. `notes/agents/cursor-plans/INDEX.md`

## Autonomy

**Proceed without asking:** backend/frontend source, docs, scripts, tests, local commits when user asks.

**Ask before:** `.env`, `data/*.db`, Mongo connection strings, `git push`, production deploy, bulk Obsidian edits outside `notes/agents/`, marking all rows unsynced.

**Hard limits:** never commit secrets; never force-push `main`; only commit when user explicitly asks.
