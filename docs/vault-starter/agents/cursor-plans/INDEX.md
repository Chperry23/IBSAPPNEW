# Cursor plans index — Cabinet PM

**Last updated:** 2026-06-25

## Active / recent

| Plan | Status | Notes |
|------|--------|-------|
| Sync UUID + tombstone fix | Done | uuid on insert, soft delete, prune change_log |
| Sync 138k push / txn abort | Done | prune journal, batched commit |
| Cursor rules + SemVer + Obsidian | In progress | `.cursor/rules/`, `CHANGELOG.md` |

## Current truth

- Version: see `package.json` (SemVer `vX.Y.Z` tags on `main`)
- Sync push builds from `synced=0` only; run `prune-stale-change-log.js` if slow
- Registry-heavy customers (e.g. Ellwood 254) can have 80k+ charms locally — normal

## Archive

Move completed plan rows here or to dated session notes under `sessions/`.
