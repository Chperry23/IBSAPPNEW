# Obsidian vault for Cabinet PM

Your friend's PSS project keeps a vault **beside** the repo (`../../notes/`). Cabinet PM uses the same pattern: **`notes/`** at the repo root, **gitignored**, opened as an Obsidian vault.

## Quick setup

1. **Open Obsidian** → *Open folder as vault* → select:
   ```
   C:\IBS APP\notes
   ```
2. If the folder is empty, copy the starter tree:
   ```
   docs/vault-starter/*  →  notes/
   ```
3. In Cursor, agents read `notes/agents/README.md` and `notes/agents/cursor-plans/INDEX.md` at session start.

## Folder layout

```
notes/                          ← Obsidian vault root (gitignored)
  agents/                       ← AI/agent writes HERE only
    README.md
    cursor-plans/
      INDEX.md
    Cabinet PM/
      git workflow and versioning.md
    sessions/
    97_Templates/
      agent_session.md
  00_Home/                      ← optional: your human notes
  99_Inbox/
```

## Rules

| Zone | Who edits |
|------|-----------|
| `notes/agents/` | Cursor / agents (session logs, plans, runbooks) |
| Everything else | You — agents need explicit permission |

- Do **not** wikilink from human folders into `agents/` (keeps agent noise out of your graph)
- Agent notes **may** link to code paths and `docs/` in the repo

## Attach vault to this workspace

**Option A — same folder (recommended)**  
Vault lives in `notes/` inside the repo. Obsidian and Cursor both open `C:\IBS APP`.

**Option B — external vault**  
If you already have a vault elsewhere (e.g. `C:\Users\you\Documents\Obsidian\ECI`):

1. Create a junction or symlink:
   ```powershell
   New-Item -ItemType Junction -Path "C:\IBS APP\notes" -Target "C:\path\to\your\vault\Cabinet PM"
   ```
2. Or set `notes/` to your path in `notes/.vault-path` (documented for agents in README)

**Option C — multi-root in Cursor**  
File → Add Folder to Workspace → your Obsidian vault folder.

## Session notes

Use template: `notes/agents/97_Templates/agent_session.md`

Save completed sessions under `notes/agents/sessions/` with readable names:
```
2026-06-25 sync change_log prune fix.md
```

## Sync with git versioning doc

Copy or link `docs/git-workflow-and-versioning.md` into the vault for offline reference:
```
notes/agents/Cabinet PM/git workflow and versioning.md
```

The starter template includes a stub for this.
