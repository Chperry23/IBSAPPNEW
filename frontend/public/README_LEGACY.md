# Legacy HTML Frontend

## ⚠️ This directory contains the OLD HTML/CSS/JS frontend

This frontend has been replaced with a modern React + Tailwind CSS application located in `frontend-react/`.

### Status: LEGACY / ARCHIVED

These files are kept for:
- **Reference** - Compare old implementation with new React components
- **Backup** - In case you need to reference the original code
- **Gradual Migration** - If you want to migrate additional pages not yet converted

### What to Do

**Option 1: Keep as Reference (Recommended)**
- Keep these files for now
- Delete once you're confident the React app covers all functionality

**Option 2: Delete Immediately**
If you're confident the React migration is complete:
```bash
# From the root directory
rm -rf frontend/public
# Or on Windows
rmdir /s /q frontend\public
```

**Option 3: Rename for Clarity**
```bash
mv frontend/public frontend/public-legacy
```

### Migrated Files

The following files have been successfully migrated to React:

| HTML File | React Component | Location |
|-----------|----------------|----------|
| `login.html` | `Login.jsx` | `frontend-react/src/pages/Login.jsx` |
| `dashboard.html` | `Dashboard.jsx` | `frontend-react/src/pages/Dashboard.jsx` |
| `pages/sessions.html` | `Sessions.jsx` | `frontend-react/src/pages/Sessions.jsx` |
| `pages/customers.html` | `Customers.jsx` | `frontend-react/src/pages/Customers.jsx` |

### Not Yet Migrated

The following pages still need migration (if you want to continue):
- `pages/session.html` - Session detail view
- `pages/cabinet.html` - Cabinet management
- `pages/nodes.html` - Node management
- `pages/ii-session.html` - II session view
- `sync/distributed-sync.html` - Sync page

### Server Behavior

The `server-tablet.js` has been updated to:
1. **Prefer React app** - If `frontend-react/dist` exists, serve React
2. **Fallback to HTML** - If React build doesn't exist, serve from here

Currently, the React build exists and is being served, so these HTML files are NOT being used by the server.
