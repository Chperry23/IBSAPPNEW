# Changelog - Cabinet PM Tablet Application

## [2.1.1] - Sync Page Fix - December 4, 2025 11:12 AM

### 🐛 Bug Fixes
- **Fixed sync page 404 errors**: Updated `distributed-sync.html` to use new enhanced merge replication endpoints
  - Changed `/api/distributed-sync/*` → `/api/sync/enhanced-merge/*`
  - Changed `/api/distributed-sync/*` → `/api/sync/device/*` and `/api/sync/connection/*`
  - Updated page title to "Enhanced Merge Sync v2.1.0"
  - All sync buttons now work correctly
- **Rebuilt executable**: `cabinet-pm-tablet.exe` (83.9 MB, built 11:12 AM)

---

## [2.1.0] - Enhanced Merge Replication System - December 4, 2025

### 🎉 Major Update: Production-Ready Multi-Device Sync

This update implements a comprehensive **merge replication system** that enables reliable data synchronization across 10+ iPads with a central MongoDB server.

### ✨ New Features

#### Enhanced Merge Replication System
- **UUID-Based Identity**: Every record now has a globally unique identifier (UUID)
  - Eliminates ID collisions between devices
  - 2,471 UUIDs generated for existing records
  
- **Device Tracking**: Each record tracks which device created/modified it
  - Device ID automatically assigned: `L5420-H52Z4M3_1763135760180_5c9a6e9a`
  - Enables audit trail and conflict resolution

- **Bi-Directional Sync**: Pull from master + Push to master
  - Incremental sync (only changed records)
  - Tombstone deletions (soft deletes propagate)
  - Conflict detection and resolution

- **Three Conflict Resolution Strategies**:
  - `local_wins` - Prioritize user's offline work (default)
  - `master_wins` - Server is source of truth
  - `latest_wins` - Most recent timestamp wins (recommended)

#### New API Endpoints (14 total)

**Core Sync:**
- `POST /api/sync/enhanced-merge/full` - Full merge sync (pull + push)
- `POST /api/sync/enhanced-merge/pull` - Pull from master only
- `POST /api/sync/enhanced-merge/push` - Push to master only
- `GET /api/sync/enhanced-merge/status` - Sync status and health
- `POST /api/sync/enhanced-merge/strategy` - Set conflict resolution strategy

**Migration & Setup:**
- `POST /api/sync/migration/run` - Prepare database for merge replication
- `GET /api/sync/migration/status` - Check if database is ready
- `POST /api/sync/migration/generate-uuids` - Generate UUIDs for records
- `POST /api/sync/migration/ensure-columns` - Add sync columns

**Diagnostics:**
- `GET /api/sync/device/info` - Device information and ID
- `GET /api/sync/connection/test` - Test MongoDB connection
- `GET /api/sync/unsynced/counts` - Count unsynced records per table
- `GET /api/sync/last-sync/times` - Last sync timestamp per table

#### Database Schema Enhancements

All 13 tables now include sync metadata:
- `uuid` (TEXT) - Global unique identifier
- `synced` (INTEGER) - 0 = needs sync, 1 = synced
- `device_id` (TEXT) - Device that created/modified record
- `deleted` (INTEGER) - 0 = active, 1 = soft deleted (tombstone)
- `updated_at` (DATETIME) - Last modification timestamp

**Tables updated:**
- users (2 records migrated)
- customers (921 records migrated)
- sessions (6 records migrated)
- cabinets (196 records migrated)
- nodes (773 records migrated)
- session_node_maintenance (548 records migrated)
- session_node_tracker (30 records migrated)
- cabinet_locations (25 records migrated)
- session_pm_notes (8 records migrated)
- session_ii_documents (3 records migrated)
- session_ii_equipment (2 records migrated)
- session_ii_checklist (58 records migrated)
- session_ii_equipment_used (0 records - empty table)

### 🔧 New Utilities

#### Migration Utility (`sync-migration-utility.js`)
- Automated database preparation
- UUID generation for existing records
- Device ID initialization
- Sync column setup
- Migration status checking

#### Verification Utility (`sync-verification-utility.js`)
- Sync health monitoring
- UUID conflict detection
- Data consistency checks
- Repair tools for common issues
- Health report generation

#### UUID Helper (`uuid-helper.js`)
- Helper functions for developers
- `prepareNewRecord()` - Initialize new records with sync metadata
- `prepareUpdateRecord()` - Mark records for sync on update
- `markAsDeleted()` - Soft delete with sync propagation

### 📚 New Documentation

1. **MERGE-REPLICATION-GUIDE.md** (200+ lines)
   - Complete architectural overview
   - How merge replication works
   - API documentation
   - Troubleshooting guide
   - Best practices

2. **CHANGELOG.md** (this file)
   - Version history
   - What was changed and why

3. **Integration examples** (`INTEGRATION-EXAMPLE.js`)
   - 7 different integration patterns
   - Frontend sync button examples
   - Scheduled auto-sync setup

### 🔨 Technical Improvements

#### MongoDB Models
- Added sync fields to all schemas
- Created optimized indexes:
  - `uuid` (unique, sparse)
  - `updated_at + deleted` (compound)
  - `device_id`

#### Server Integration
- Enhanced merge replication endpoints integrated into `server-tablet.js`
- MongoDB connection: `mongodb://172.16.10.124:27017/cabinet_pm_db`
- Backward compatible with existing sync systems

#### Migration Scripts
- `check-current-data.js` - Diagnostic tool to check database status
- `run-migration.js` - One-command migration execution

### 🚀 Performance

- **Incremental sync**: Only changed records since last sync
- **Fast queries**: Optimized MongoDB indexes
- **Batch processing**: Efficient handling of large datasets
- **Minimal downtime**: Migration runs in seconds

### ⚙️ Configuration

**Default Conflict Strategy**: `local_wins`  
**MongoDB Connection**: `mongodb://172.16.10.124:27017/cabinet_pm_db`  
**Device ID**: Auto-generated on first run  

### 📊 Migration Statistics

**Total records migrated**: 2,471
- UUIDs generated: 2,471
- Device IDs set: 175
- Sync flags initialized: All existing records marked as `synced=1`

### 🐛 Bug Fixes

- Fixed ID collision issues between multiple devices
- Fixed deletion propagation (deletions now sync as tombstones)
- Fixed conflict detection (local changes are preserved)
- Fixed foreign key issues with document_id in I&I tables

### 💡 Breaking Changes

**None** - This is a non-destructive update:
- All existing data preserved
- New columns added (no data removed)
- Backward compatible with existing workflows
- Existing sync endpoints still functional

### 📝 Notes

- **Device ID** is automatically generated: `{hostname}_{timestamp}_{random}`
- **Existing records** are marked as `synced=1` (don't need initial push to master)
- **New records** are marked as `synced=0` (will be pushed on next sync)
- **MongoDB master** should be running before attempting sync

### 🎯 Use Cases Solved

#### Problem: 10 iPads, Same Customers
- **Before**: ID collisions, lost updates, missing deletions
- **After**: Each record has unique UUID, all devices stay in sync

#### Problem: User 1 Creates PM, User 2 Can't See It
- **Before**: Changes don't propagate
- **After**: User 1 syncs → PM pushed to master → User 2 syncs → Both have the PM

#### Problem: Deletion on One Device Doesn't Remove on Others
- **Before**: Hard deletes don't propagate
- **After**: Soft deletes (`deleted=1`) propagate as tombstones

### 🔮 Future Enhancements

- Field-level conflict merging (currently whole-record)
- Conflict resolution UI for user intervention
- Automatic scheduled sync
- Sync progress indicators in UI
- Multi-master replication (not just master-client)

---

## [2.0.0] - Previous Version

### Features
- Basic MongoDB sync (pull/push)
- Full refresh capability
- Session and cabinet management
- I&I documentation system
- Node maintenance tracking

### Known Issues (Fixed in 2.1.0)
- ID collisions between devices
- Deletion propagation problems
- Conflict resolution not automated
- No device tracking

---

**For detailed usage instructions, see:**
- `MERGE-REPLICATION-GUIDE.md` - Complete guide
- `README.md` - Quick start
- `BUILD-GUIDE.md` - Building and deployment

