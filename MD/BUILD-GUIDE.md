n# 🚀 Build & Deploy Guide

**Version 2.1.0** - Enhanced Merge Replication System

## Quick Start

### Development Mode
```bash
npm start
```
Starts the server at http://localhost:3000

### Build Executable
```bash
npm run build
```
Creates `cabinet-pm-tablet.exe` in the `dist/` folder

### Platform-Specific Builds
```bash
npm run build-win     # Windows (default)
npm run build-linux   # Linux
npm run build-mac     # macOS
```

## How the Executable Works

When you run `cabinet-pm-tablet.exe`:

1. ✅ **Auto-starts the backend server** on port 3000
2. ✅ **Auto-opens your browser** to http://localhost:3000
3. ✅ **Includes all files** (frontend, backend, database)
4. ✅ **No installation needed** - just run the .exe file

## What Gets Packaged

The executable includes:
- ✅ `frontend/public/**` - All HTML, CSS, JS, assets
- ✅ `data/**` - Database files
- ✅ `backend/**` - Backend code (including enhanced merge replication)
- ✅ SQLite3 native bindings
- ✅ Node.js runtime
- ✅ MongoDB Mongoose drivers
- ✅ Sync utilities and helpers

## File Structure After Build

```
dist/
└── cabinet-pm-tablet.exe    # Single executable file

When running, it expects:
data/
└── cabinet_pm_tablet.db     # Database (include with distribution)
```

## Distribution

To distribute to users:

### Step 1: Build the Executable
```bash
npm run build
```
This creates `cabinet-pm-tablet.exe` with all the enhanced merge replication features.

### Step 2: Prepare for Distribution
Package these files:
- `cabinet-pm-tablet.exe` - The application
- `data/cabinet_pm_tablet.db` - Database file (or empty template)
- `check-current-data.js` - Migration check script
- `run-migration.js` - Migration script

### Step 3: First-Time Setup on Each iPad

User runs these commands once:
```bash
# 1. Check if migration is needed
node check-current-data.js

# 2. Run migration (adds UUIDs, sync columns)
node run-migration.js

# 3. Start the application
cabinet-pm-tablet.exe
```

### Step 4: MongoDB Sync Setup
- Configure MongoDB connection string (if different from default)
- Run first sync: `POST /api/sync/enhanced-merge/full`
- All iPads will now stay in sync!

## Default Login

**Username**: `admin`  
**Password**: `cabinet123`

## Notes

- The executable is ~100-150 MB (includes Node.js runtime)
- First launch may take a few seconds to extract files
- Database path is automatically detected
- Browser opens automatically on launch
- Server runs on port 3000 (configurable via PORT env var)

## Enhanced Merge Replication Features (v2.1.0)

This build includes:
- ✅ UUID-based record identity (no ID collisions)
- ✅ Device tracking (audit trail)
- ✅ Conflict resolution (3 strategies)
- ✅ Tombstone deletions (deletions propagate)
- ✅ 14 new API endpoints for sync operations
- ✅ Migration utilities
- ✅ Verification and repair tools

**MongoDB Connection**: `mongodb://172.16.10.124:27017/cabinet_pm_db`  
**Default Conflict Strategy**: `latest_wins`

## Troubleshooting

**Port already in use?**
- Close any other instance of the app
- PowerShell: `Stop-Process -Name node -Force`

**Database not found?**
- Ensure `data/cabinet_pm_tablet.db` is in the same folder as the .exe

**Browser doesn't open automatically?**
- Manually navigate to http://localhost:3000

**Sync issues?**
- Run migration: `node run-migration.js`
- Check sync status: `GET /api/sync/enhanced-merge/status`
- See CHANGELOG.md for detailed troubleshooting

**Records missing UUIDs?**
- Run: `POST /api/sync/migration/generate-uuids`

## Version History

**v2.1.0** (Current) - Enhanced Merge Replication
- 2,471 records migrated with UUIDs
- 14 new sync endpoints
- Production-ready multi-device support

**v2.0.0** - Previous Version
- Basic MongoDB sync
- Known issues with ID collisions (fixed in v2.1.0)

---

**Built with ❤️ by ECI Industrial Solutions**

