# Changelog

All notable changes to Cabinet PM are documented here.

Format based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
Versioning follows [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added
- Dell Parts / HDD dispatch on customer profile (Needs request queue, submit wizard, open tracker) plus `/dispatches` and PM session Request shortcut
- Local `dell_dispatches` table (sync metadata) with SDSR sandbox submit that queues when CheckLogin is not ready
- Workstation Dell warranty cache on `sys_workstations` (ends / coverage / product / service level); customer profile loads from cache; **Refresh warranties** hits Dell again
- Dell dispatch auto-link: create/submit attaches to an existing TechDirect work order when one is already open, and drops denied local duplicates
- Dispatch status history and an on-site service snapshot (technician, parts tracking, Dell last-update time)

### Fixed
- Dell inquiry status mapping for denied/duplicate work orders and pipe-separated DPS numbers
- System Registry (`/csv-tracking`) load: `/api/system-registry/imports` now uses one grouped count per table instead of seven queries per customer (sys_charms can be 80k+ rows)

### Known
- Appointment windows and “technician en route” text stay on dell.com — the Self-Dispatch inquiry API does not return that timeline 

## [2.0.1] - 2026-06-25

### Added
- Cursor rules (`.cursor/rules/`), `AGENTS.md`, Obsidian vault starter, SemVer release scripts
- Sync: prune stale `change_log`, `synced=0`-only push changeset, batched sync-server commit

### Fixed
- Sync: registry import journal bloat causing 100k+ row push attempts
- Sync: MongoDB transaction abort on large commits


## [2.0.0] - 2026-06-18

### Added
- Phase 3 sync-server HTTP protocol (upload/commit/pull)
- UUID + soft-delete tombstones for synced tables
- Customer import bundle (FHX/registry)

[Unreleased]: https://github.com/Chperry23/IBSAPPNEW/compare/v2.0.1...develop
[2.0.0]: https://github.com/Chperry23/IBSAPPNEW/releases/tag/v2.0.0
[2.0.1]: https://github.com/Chperry23/IBSAPPNEW/compare/v2.0.0...v2.0.1
