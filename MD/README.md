# Cabinet PM Tablet Application

A comprehensive preventive maintenance (PM) and inspection & identification (I&I) management system designed for multi-device deployment in industrial environments.

**Version 2.1.0** - Enhanced Merge Replication System

## Features

- **Session Management**: Create and manage PM/I&I sessions
- **Cabinet Tracking**: Track maintenance across multiple cabinets
- **Node Management**: Monitor individual components and nodes
- **✨ Enhanced Merge Replication**: Production-ready multi-device sync (NEW!)
  - UUID-based record identity (no ID collisions)
  - Device tracking (know who modified what)
  - Conflict detection and resolution (3 strategies)
  - Tombstone deletions (deletions propagate)
  - Incremental sync (only changed records)
- **Offline Capability**: Works offline with sync when connection is available
- **Tablet Optimized**: Touch-friendly interface designed for tablet use
- **10+ Device Support**: Designed for multiple iPads syncing to central server

## Quick Start

### For End Users (Deployment)

1. **Run the Application**:
   ```
   cabinet-pm-tablet.exe
   ```

2. **Access the Interface**:
   - Open browser to `http://localhost:3000`
   - Default login: `admin` / `cabinet123`

3. **Enhanced Merge Replication Setup** (for multi-device sync):
   
   **First Time Setup on Each Device:**
   ```bash
   # Check if migration is needed
   node check-current-data.js
   
   # Run migration to prepare database
   node run-migration.js
   ```
   
   **Or via API:**
   ```bash
   POST http://localhost:3000/api/sync/migration/run
   ```
   
   **Perform Sync:**
   ```bash
   POST http://localhost:3000/api/sync/enhanced-merge/full
   ```

### For Developers

1. **Install Dependencies**:
   ```bash
   npm install
   ```

2. **Run Development Server**:
   ```bash
   npm start
   ```

3. **Build Executable**:
   ```bash
   npm run build-win
   ```

## Architecture

- **Backend**: Node.js with Express
- **Database**: SQLite (local) + MongoDB (cloud sync)
- **Frontend**: Vanilla HTML/CSS/JavaScript
- **Packaging**: pkg for executable creation

## Key Files

### Core Application
- `server-tablet.js` - Main application server
- `cabinet_pm_tablet.db` - Local SQLite database
- `frontend/public/` - Web interface files

### Enhanced Merge Replication (NEW!)
- `backend/services/enhanced-merge-replication.js` - Core sync engine
- `backend/services/enhanced-merge-sync-endpoints.js` - Sync API (14 endpoints)
- `backend/services/sync-migration-utility.js` - Database migration
- `backend/services/sync-verification-utility.js` - Diagnostics & repair
- `backend/models/mongodb-models.js` - MongoDB schemas with sync fields
- `backend/utils/uuid-helper.js` - Helper utilities

### Migration Scripts
- `check-current-data.js` - Check database sync readiness
- `run-migration.js` - Prepare database for merge replication

## Enhanced Merge Replication Features (v2.1.0)

### Core Capabilities
- **UUID-Based Identity**: Every record has globally unique ID
- **Device Tracking**: Know which iPad created/modified each record
- **Bi-Directional Sync**: Pull from master + Push to master in one operation
- **Incremental Sync**: Only syncs changed records (fast!)
- **Conflict Resolution**: 3 strategies - local_wins, master_wins, latest_wins
- **Tombstone Deletions**: Deletions propagate as soft deletes
- **Verification Tools**: Diagnose and repair sync issues

### API Endpoints

**Core Sync:**
- `POST /api/sync/enhanced-merge/full` - Full merge sync (recommended)
- `POST /api/sync/enhanced-merge/pull` - Pull only
- `POST /api/sync/enhanced-merge/push` - Push only
- `GET /api/sync/enhanced-merge/status` - Sync status
- `POST /api/sync/enhanced-merge/strategy` - Set conflict strategy

**Setup & Migration:**
- `POST /api/sync/migration/run` - Prepare database
- `GET /api/sync/migration/status` - Check readiness

**Diagnostics:**
- `GET /api/sync/device/info` - Device information
- `GET /api/sync/connection/test` - Test MongoDB
- `GET /api/sync/unsynced/counts` - Unsynced record counts

### MongoDB Configuration
**Connection String**: `mongodb://172.16.10.124:27017/cabinet_pm_db`  
**Device ID**: Auto-generated on first run  
**Conflict Strategy**: `latest_wins` (recommended)

## Deployment Notes

- Database file location: Same directory as executable
- Supports both development and packaged executable modes
- Auto-detects packaged vs development environment
- Includes comprehensive error logging

## Troubleshooting

### Sync Issues

**First Time Setup:**
```bash
# 1. Check database status
node check-current-data.js

# 2. Run migration if needed
node run-migration.js

# 3. Test sync
POST /api/sync/enhanced-merge/full
```

**Common Issues:**

1. **Records without UUIDs**
   - Run: `POST /api/sync/migration/generate-uuids`

2. **Sync conflicts every time**
   - Check unsynced counts: `GET /api/sync/unsynced/counts`
   - Change strategy: `POST /api/sync/enhanced-merge/strategy` with `{"strategy": "latest_wins"}`

3. **Deletions not propagating**
   - Make sure you're using soft deletes (UPDATE... SET deleted=1, not DELETE)
   
4. **Large sync times**
   - System uses incremental sync by default
   - Check MongoDB indexes are created
   - Verify last_sync times: `GET /api/sync/last-sync/times`

### Verification & Repair

**Run sync verification:**
- Check sync health: `GET /api/sync/enhanced-merge/status`
- Check migration status: `GET /api/sync/migration/status`

### Build Issues
- Ensure Node.js and npm are installed
- Check that all dependencies are installed: `npm install`
- For pkg issues, ensure target platform matches your system

## Documentation

- **CHANGELOG.md** - Version history and what changed
- **MERGE-REPLICATION-GUIDE.md** - Complete merge replication guide (200+ lines)
- **BUILD-GUIDE.md** - Building and deployment instructions
- **INTEGRATION-EXAMPLE.js** - Code examples for developers

## License

Internal use only - ECI Industrial Solutions
