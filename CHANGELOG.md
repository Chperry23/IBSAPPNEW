# Changelog

All notable changes to Cabinet PM are documented here.

Format based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
Versioning follows [Semantic Versioning](https://semver.org/).

## [Unreleased]

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

[Unreleased]: https://github.com/Chperry23/IBSAPPNEW/compare/v2.0.0...develop
[2.0.0]: https://github.com/Chperry23/IBSAPPNEW/releases/tag/v2.0.0
