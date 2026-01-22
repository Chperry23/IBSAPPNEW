# Cabinet PM Tablet - Changelog

## Version 2.2.0 (2026-01-20)

### 🎯 Major Features

#### Unclassified Node Management
- Added new "Unclassified / Other Equipment" section in customer profile
- Nodes that don't fit standard categories are now visible and manageable
- Easy dropdown to reassign node types (Controller, CIOC, SIS, Switch, Workstation, etc.)
- New API endpoint: `PUT /api/nodes/:nodeId` for updating node types
- Prevents lost or misclassified equipment

#### Simplified PM Workflow
- **Removed Node List Tracker tab** - streamlined the PM session interface
- Reduced redundancy and confusion in the workflow
- Cleaner session management experience

#### Enhanced Cabinet Naming System
- **Renamed `cabinet_location` to `cabinet_name`** throughout the application
- Clearer distinction between:
  - **Cabinet Name**: The identifier/label (e.g., "CTRL-01", "Cabinet A")
  - **Cabinet Location**: Physical location assignment (e.g., "Building 44", "Control Room")
- Updated all forms, labels, and UI text
- Database migration handles upgrade automatically

#### Improved Location Assignment
- **Fixed** location dropdown not populating in "Add Cabinet" modal
- **Added** cabinet location assignment in cabinet detail view
- Location dropdown now shows in cabinet editing alongside name and date
- Seamless integration with existing location management system
- Backend properly saves and retrieves location assignments

### 🔧 Technical Improvements

- Database schema updated with automatic migration
- Backward compatibility maintained for existing installations
- All backend routes updated (cabinets, nodes, sessions, etc.)
- Frontend components updated (session.html, cabinet.html, customer-detail.html)
- MongoDB models updated to match new schema
- PDF generation updated with new field names

### 🐛 Bug Fixes

- Fixed cabinet location dropdown not showing available locations
- Fixed location assignment not being saved
- Fixed node type update functionality
- Corrected field naming inconsistencies

### 📚 Documentation

- Updated README with new features
- Added migration notes
- Updated configuration examples

---

## Version 2.1.0 (2025-12-11)

### Features
- Enhanced merge replication system with UUID-based identity
- Conflict resolution (local wins, master wins, latest wins)
- Tombstone deletions for proper sync
- Fixed sync page API endpoints
- Added sync state management
- Auto-update system integrated

---

## Version 2.0.0

### Features
- Initial release of Cabinet PM Tablet Application
- SQLite local database
- PM Session management
- Cabinet inspections
- Node maintenance tracking
- PDF report generation
- Optional MongoDB sync

