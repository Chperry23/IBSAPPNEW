# Agent notes — Cabinet PM

This folder is for **AI/agent-generated** context only. Humans maintain other vault folders.

## Session start (read first)

1. This file
2. `cursor-plans/INDEX.md` — current truth and active work

## Where to write

| Type | Path |
|------|------|
| Session logs | `sessions/YYYY-MM-DD topic.md` |
| Plans / ADRs | `cursor-plans/` |
| Runbooks | `Cabinet PM/` |
| Templates | `97_Templates/` |

## Current truth

Update `cursor-plans/INDEX.md` when these change.

- **App:** Cabinet PM tablet (`package.json` version)
- **Local DB:** `data/cabinet_pm_tablet.db` (SQLite WAL)
- **Sync:** sync-server HTTP → MongoDB master (`172.16.10.124` or env)
- **Build:** `npm run build` → `dist/CabinetPM.exe`
- **Git:** `develop` = work, `main` + `vX.Y.Z` tags = releases

## Repo docs (not duplicated here unless needed)

- `AGENTS.md` — agent overview
- `docs/git-workflow-and-versioning.md` — SemVer + release
- `docs/obsidian-vault.md` — vault setup

## Voice

- Factual, terse session logs
- Link file paths, customer names, session IDs when relevant
- No filler; capture decisions and open questions
