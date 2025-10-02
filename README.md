# Cabinet PM Tablet Application

A comprehensive preventive maintenance (PM) and inspection & identification (I&I) management system designed for tablet deployment in industrial environments.

## Features

- **Session Management**: Create and manage PM/I&I sessions
- **Cabinet Tracking**: Track maintenance across multiple cabinets
- **Node Management**: Monitor individual components and nodes
- **MongoDB Sync**: Synchronize data across multiple devices and a central server
- **Offline Capability**: Works offline with sync when connection is available
- **Tablet Optimized**: Touch-friendly interface designed for tablet use

## Quick Start

### For End Users (Deployment)

1. **Run the Application**:
   ```
   cabinet-pm-tablet.exe
   ```

2. **Access the Interface**:
   - Open browser to `http://localhost:3000`
   - Default login: `admin` / `cabinet123`

3. **MongoDB Sync Setup** (if using multi-device sync):
   - Go to `/mongo-sync` page
   - Configure MongoDB connection string
   - Use "Full Refresh" to sync data from master server

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

- `server-tablet.js` - Main application server
- `mongo-cloud-sync.js` - MongoDB synchronization system
- `mongo-sync-endpoints.js` - Sync API endpoints
- `public/` - Web interface files
- `cabinet_pm_tablet.db` - Local SQLite database

## MongoDB Sync Features

### Standard Sync
- **Pull**: Download new data from master server
- **Push**: Upload local changes to master server
- **Full Sync**: Pull then Push (recommended)

### Full Refresh (New!)
- **Complete replacement** of local data with master data
- **No conflict resolution** - exact copy of master
- **Solves ID mapping issues** and sync conflicts
- **Use when**: Standard sync fails or data becomes inconsistent

## Deployment Notes

- Database file location: Same directory as executable
- Supports both development and packaged executable modes
- Auto-detects packaged vs development environment
- Includes comprehensive error logging

## Troubleshooting

### Sync Issues
1. Try "Full Refresh" instead of standard sync
2. Check MongoDB connection string
3. Verify network connectivity to master server

### Session Access Issues
- Usually caused by ID mapping problems during sync
- Solution: Use "Full Refresh" to get exact master data

### Build Issues
- Ensure Node.js and npm are installed
- Check that all dependencies are installed: `npm install`
- For pkg issues, ensure target platform matches your system

## License

Internal use only - ECI Industrial Solutions
