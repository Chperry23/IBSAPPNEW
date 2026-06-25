# Git workflow and semantic versioning

Cabinet PM uses **SemVer**, **Conventional Commits**, and a **develop → main** release flow (adapted from our PSS project rules).

## Branches

| Branch | Purpose |
|--------|---------|
| `main` | Production releases only — every merge gets a `vX.Y.Z` tag |
| `develop` | Integration branch for day-to-day work |
| `feature/*` | New features (from `develop`) |
| `fix/*` | Bug fixes (from `develop`) |
| `chore/*` | Tooling, docs, deps (from `develop`) |

Never push directly to `main` except via release merge.

## Version number

Single source of truth: **`package.json`** `"version"` field (currently `2.0.0`).

Also reflected in:
- `build-info.json` (via `npm run build:info`)
- Git annotated tag `vX.Y.Z`
- `CHANGELOG.md` section headers

### When to bump

| Change | Bump | Example |
|--------|------|---------|
| Bug fix, sync repair, small patch | **PATCH** | `2.0.0` → `2.0.1` |
| New feature, non-breaking API/UI | **MINOR** | `2.0.1` → `2.1.0` |
| Breaking schema, forced migration, incompatible sync | **MAJOR** | `2.1.0` → `3.0.0` |

## Conventional Commits

```
feat: add registry export bundle
fix: prune stale change_log before push
sync: batch commit without mega-transaction
chore: bump deps
docs: update sync setup guide
```

## Day-to-day workflow

```bash
git checkout develop
git pull origin develop
git checkout -b feature/my-change

# ... work, commit when ready (user asks agent to commit) ...

git checkout develop
git merge feature/my-change
git push origin develop
```

## Release workflow (push to production)

```bash
git checkout main
git merge develop

# Bump version + changelog (pick one):
npm run version:patch
# npm run version:minor
# npm run version:major

git add package.json package-lock.json CHANGELOG.md build-info.json
git commit -m "chore: release vX.Y.Z"

git tag -a vX.Y.Z -m "Cabinet PM vX.Y.Z"
git push origin main --tags

# Build field tablet package
npm run build
```

Tag format is always **`v` + SemVer** (e.g. `v2.0.1`), not bare `2.0.1`.

## Changelog

- Edit **`[Unreleased]`** on `develop` as you merge features
- On release, `npm run version:*` moves `[Unreleased]` bullets under the new version heading with today's date

## What not to tag

- Individual tablet DB files (`data/*.db`)
- `dist/*.exe` build artifacts (attach to GitHub Release manually if needed)
- Roboflow / ML artifact versions (not app version) — N/A for Cabinet PM but kept as convention

## Cursor / agent rules

- `.cursor/rules/git-versioning.mdc` — summary for AI
- Ask before `git push` unless user explicitly requests release steps
