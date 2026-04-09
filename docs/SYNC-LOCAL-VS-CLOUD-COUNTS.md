# Why "Local" and "Cloud" counts can differ (and when pull matches master)

## What you want

- **After Pull:** Local should match master (you get everything from the cloud).
- **Your unpushed local changes** should not be overwritten (they’re kept by conflict strategy).

## How pull works

1. **Incremental pull:** We only fetch from master records that changed **since last sync** (`updated_at > lastSync`). So we don’t re-fetch the whole table every time.
2. **Reconciliation:** After that, if **master count ≠ local count**, we find master rows that are “missing” locally (by `_id`) and pull those. So in theory, if master has more rows than local, we fill the gap.

So: besides your 1 unsynced change (which we keep when “local wins”), pull is designed to bring local in line with master.

## Why Node Maintenance can still show Local 976 vs Cloud 1112

**session_node_maintenance** is keyed in the DB by:

- **Primary key:** `id` (autoincrement, different on each device).
- **Logical key:** `(session_id, node_id)` — one row per session per node (UNIQUE).

When **multiple devices** push:

- Device A has 976 rows with `id` 1..976.
- Device B has 1112 rows with `id` 1..1112.
- Master ends up with 1112 documents (B’s push overwrote A’s where `_id` overlapped).

So on master, **the same logical row (session_id, node_id) can appear under different `_id`s** (e.g. one from A, one from B). Master “count” is then 1112 even though there aren’t 1112 unique (session_id, node_id).

When **you** pull:

- We pull “missing” master rows by `_id` (e.g. 977..1112).
- We insert/update using **INSERT OR REPLACE**.
- SQLite’s UNIQUE is on `(session_id, node_id)`, so inserting a row with a new `id` but **same (session_id, node_id)** as an existing row **replaces** that row; it doesn’t add a second row.
- So those 136 “extra” master rows often **replace** existing local rows (same session/node, different id). Your local total can stay at 976: one row per (session, node). You’re not missing 136 logical rows; master just has duplicate (session_id, node_id) under different ids.

So the difference is mostly **counting**: master counts 1112 documents; you have 976 **unique (session_id, node_id)** rows, which can be correct.

## What you can do

1. **Trust the reconciliation:** Pull already runs a “count mismatch” pass and pulls missing master records by id. Your 1 unsynced change is kept when conflict strategy is “local wins.”
2. **“Download & match cloud”:** Makes this device **match the cloud** by removing local-only rows so that local count ≤ master. Use when you want this device to mirror master; be aware it can remove rows that exist only on this device (your 1 unsynced change could be overwritten if master has a row for the same id).
3. **Future improvement:** Sync could treat **session_node_maintenance** as keyed by `(session_id, node_id)` instead of `id`, so master doesn’t accumulate duplicate (session_id, node_id) and “Local” vs “Cloud” counts align better.

## Summary

- **Yes, the fix is in the code:** Pull is incremental then reconciles by pulling “missing” master rows by id; your unpushed local changes are preserved when local wins.
- **Local 976 vs Cloud 1112** for Node Maintenance is often **not** “missing data” — it’s master having more documents than unique (session_id, node_id), and your device having one row per (session, node) after replace-by-unique. If you want, we can add sync logic that keys **session_node_maintenance** by (session_id, node_id) so master and local counts line up and duplicates don’t build up on master.
