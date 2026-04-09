# PM Session – Diagnostics / Maintenance and How the DB Fits

## The model (1 customer → many sessions → many nodes → diag per node)

The design **is** that hierarchy:

- **1 customer** → many **sessions**
- **1 session** → many **nodes** (controllers, computers, switches, … in that session)
- **1 node (in this session)** → one set of **maintenance/diag fields** (notes, checkboxes, completed, …)

So there is one row per (session, node) for those fields. The problem is not the shape of the data; it’s that two different devices were treated as the same “node” (same id).

---

## What you have in the DB (design)

- **One row per (session, node)** in `session_node_maintenance`.
- **Notes/reason** are stored on that row: they are already “for this session and this node in this session”.

So in the DB, notes are correctly “session + node” scoped. The problem is **which “node”** we use.

---

## Tables involved

```
sessions
  id (e.g. UUID)     ← the PM session

session_node_maintenance
  session_id   → which session
  node_id      → which “node” (integer)
  notes        ← notes/reason for this session + this node
  dv_checked, os_checked, completed, ...
  has_io_errors INTEGER  ← 1 = Errors checked (controller has I/O issues); 0 = no I/O issues
  UNIQUE(session_id, node_id)   ← one row per (session, node)
```

So: **one row = one session + one node**. Notes are a column on that row. No extra “parameter” is needed; the row itself is the parameter (session + node).

---

## I/O errors page vs Diagnostics checklist

- **`has_io_errors = 1` (true):** **Errors** is checked — this controller **has** I/O issues to record → it **appears** on the **I/O Errors** tab (unless you’ve logged nothing and later clear the flag; rows with data still show).
- **`has_io_errors = 0` (false):** No I/O issues — **hidden** from I/O Errors when there’s no diagnostic data for that controller.

Default when there is **no** maintenance row yet: treat as **has I/O errors** (`has_io_errors` true), same as the UI default.

---

## I/O errors (manual flow) — `io_card_slot`

- **Manual entry (step 1):** Card type + multiple card numbers → **Add cards** creates `session_diagnostics` rows with `error_type = 'io_card_slot'` (placeholders).
- **Step 2:** Click each **Card software** chip → add real errors (channels, ports, error type, etc.).

---

## Node id uniqueness (historical note)

So we only need to change **how we assign the id** for each node when we build the list for the PM session: give workstations, controllers, switches, CIOCs, etc. **different number ranges** so the same integer never means two different devices. Then:

- Frontend still keys by `node.id` and sends `node_id` to the API.
- Backend still does `INSERT/UPDATE session_node_maintenance (session_id, node_id, notes, ...)`.
- No new columns, no new “parameter” for notes — just a unique `node_id` per device in that session.

That’s the minimal change: **unique ids in the nodes list** so “this session + this node” is unambiguous in the DB.
