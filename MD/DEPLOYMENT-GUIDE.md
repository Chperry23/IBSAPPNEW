# 🚀 Cabinet PM Tablet - Complete Deployment Guide

Complete guide for building, packaging, and deploying Cabinet PM Tablet with auto-updates.

---

## 📋 **Prerequisites**

### Required Software:
1. **Node.js** - Already installed ✅
2. **Inno Setup** - Download from: https://jrsoftware.org/isdl.php
3. **Git** - Already configured ✅
4. **GitHub Account** - Already connected ✅

### One-Time Setup:

#### 1. Install Inno Setup (5 minutes)
```powershell
# Download and run installer
Start-Process "https://jrsoftware.org/download.php/is.exe"

# Follow installation wizard
# Default options are fine
```

#### 2. Create GitHub Release Structure (2 minutes)
```powershell
# In your GitHub repo, create these files in the root:
# - version.json (will be auto-generated, but create placeholder)
# - README.md (if not exists)
```

---

## 🏗️ **Building a Release**

### Step 1: Update Version Number (1 minute)

Update version in these files:
- `package.json` → `"version": "2.1.1"`
- `build-release.js` → `const VERSION = '2.1.1';`
- `cabinet-pm-installer.iss` → `#define MyAppVersion "2.1.1"`

### Step 2: Run Build Script (3 minutes)

```powershell
cd "C:\IBS APP\TABLET-DEPLOYMENT"

# Clean build and create distribution
node build-release.js
```

**Output:**
```
dist/
├── CabinetPM-v2.1.1/
│   ├── cabinet-pm-tablet.exe (83.9 MB)
│   ├── config.json
│   ├── README.txt
│   ├── LICENSE.txt
│   └── CHECKSUMS.txt
└── version.json
```

### Step 3: Create ZIP Archive (1 minute)

```powershell
# Create ZIP for manual distribution
Compress-Archive -Path "dist\CabinetPM-v2.1.1" -DestinationPath "dist\CabinetPM-v2.1.1.zip" -Force
```

### Step 4: Build Installer with Inno Setup (2 minutes)

```powershell
# Option A: Open Inno Setup GUI
Start-Process "cabinet-pm-installer.iss"
# Then click: Build → Compile

# Option B: Command line (if ISCC.exe is in PATH)
iscc cabinet-pm-installer.iss
```

**Output:**
```
dist/installers/
└── CabinetPM-Setup-v2.1.1.exe (~85 MB)
```

---

## 📤 **Publishing to GitHub Releases**

### Step 1: Create GitHub Release (3 minutes)

```powershell
# 1. Go to your GitHub repo
# 2. Click "Releases" → "Draft a new release"
# 3. Create tag: v2.1.1
# 4. Release title: Cabinet PM Tablet v2.1.1
# 5. Description: Copy changelog from version.json
```

### Step 2: Upload Release Assets (2 minutes)

Upload these files as release assets:
- `dist\CabinetPM-v2.1.1.zip` (manual install)
- `dist\installers\CabinetPM-Setup-v2.1.1.exe` (installer)
- `dist\version.json` (for auto-update)

### Step 3: Update version.json URLs (1 minute)

After uploading, edit `dist/version.json`:
```json
{
  "version": "2.1.1",
  "downloads": {
    "full": "https://github.com/YOUR-USERNAME/cabinet-pm/releases/download/v2.1.1/CabinetPM-v2.1.1.zip",
    "installer": "https://github.com/YOUR-USERNAME/cabinet-pm/releases/download/v2.1.1/CabinetPM-Setup-v2.1.1.exe"
  }
}
```

### Step 4: Commit version.json to main branch (1 minute)

```powershell
# Copy version.json to repo root
Copy-Item "dist\version.json" "version.json"

# Commit and push
git add version.json
git commit -m "Release v2.1.1"
git push origin main
```

---

## 📲 **Deploying to iPads**

### Method 1: Using Installer (Recommended)

#### First-Time Installation (Per iPad):
```
1. Download CabinetPM-Setup-v2.1.1.exe to USB drive
2. Plug USB into iPad
3. Run installer
4. When prompted:
   - MongoDB Server: 172.16.10.124 (or your IP)
   - Accept defaults
5. Installer completes
6. Launch app from Start Menu or Desktop
7. Login: admin / cabinet123
8. Go to Sync page → Pull from Master
```

**Time per iPad: ~3 minutes**

#### Updates (With Auto-Update):
```
1. App checks for updates on startup
2. User sees notification: "Update available to v2.1.1"
3. User clicks "Update Now"
4. Download happens automatically
5. Installer runs silently
6. App restarts with new version
```

**Time: ~2 minutes (mostly automatic)**

### Method 2: Using ZIP (Quick Test)

```
1. Copy CabinetPM-v2.1.1.zip to USB drive
2. Extract on iPad to: C:\CabinetPM\
3. Run cabinet-pm-tablet.exe
4. Access at: http://localhost:3000
```

---

## 🔄 **Auto-Update System**

### How It Works:

```
App Startup
    ↓
Fetch version.json from GitHub
    ↓
Compare versions
    ↓
If newer → Show notification
    ↓
User clicks "Update"
    ↓
Download installer from GitHub
    ↓
Verify checksum
    ↓
Run installer silently
    ↓
App restarts automatically
```

### Configuration:

Edit `config.json` on each iPad:
```json
{
  "version": "2.1.1",
  "autoUpdate": {
    "enabled": true,
    "checkOnStartup": true,
    "updateUrl": "https://raw.githubusercontent.com/YOUR-USERNAME/cabinet-pm/main/version.json"
  }
}
```

### Testing Auto-Update:

```powershell
# 1. Install v2.1.0 on test iPad
# 2. Publish v2.1.1 to GitHub
# 3. Launch app on iPad
# 4. Should see update notification within 10 seconds
# 5. Click "Update Now"
# 6. Verify it downloads and installs v2.1.1
```

---

## 🧪 **Testing Checklist**

Before deploying to all iPads:

### Build Testing:
- [ ] Clean build completes without errors
- [ ] Executable runs on development machine
- [ ] Installer builds successfully
- [ ] ZIP archive is < 150 MB

### Installer Testing:
- [ ] Run installer on clean test machine
- [ ] Verify MongoDB IP configuration works
- [ ] Check desktop shortcut created
- [ ] App launches after installation
- [ ] Can login with admin/cabinet123
- [ ] Sync page connects to MongoDB

### Auto-Update Testing:
- [ ] Publish test release to GitHub
- [ ] Install older version
- [ ] Launch app, verify update notification appears
- [ ] Click "Update Now"
- [ ] Verify download and installation
- [ ] Check app restarts with new version

### Data Sync Testing:
- [ ] Fresh install has no data
- [ ] Pull from master populates data
- [ ] Push local changes uploads to master
- [ ] Full sync works bidirectionally
- [ ] Conflict resolution works correctly

---

## 📊 **Deployment Metrics**

| Task | Old Method | With ZIP | With Installer | With Auto-Update |
|------|-----------|----------|----------------|------------------|
| Copy time per iPad | 20 min | 30 sec | 3 min | 2 min |
| Total time (10 iPads) | 200 min | 5 min | 30 min | 20 min |
| User intervention | High | High | Medium | Low |
| Professionalism | Low | Medium | High | Very High |

---

## 🔧 **Troubleshooting**

### Build fails:
```powershell
# Clean node_modules and rebuild
Remove-Item node_modules -Recurse -Force
npm install
npm run build
```

### Installer fails to build:
```
- Ensure Inno Setup is installed
- Check paths in cabinet-pm-installer.iss
- Verify dist/CabinetPM-v2.1.1/ exists
- Run Inno Setup as Administrator
```

### Auto-update not working:
```
- Check internet connection
- Verify version.json URL is correct
- Ensure GitHub release is public
- Check console logs for errors
- Verify checksums match
```

### Sync issues:
```
- Verify MongoDB IP is correct
- Test connection on Sync page
- Check firewall settings
- Ensure MongoDB is running
- Check device ID is unique
```

---

## 📁 **File Structure Reference**

```
TABLET-DEPLOYMENT/
├── build-release.js              # Build automation script
├── cabinet-pm-installer.iss      # Inno Setup script
├── package.json                  # Version and dependencies
├── server-tablet.js              # Main server file
│
├── backend/
│   └── services/
│       ├── auto-updater.js       # Update checker
│       ├── auto-update-endpoints.js  # Update API
│       ├── enhanced-merge-replication.js
│       └── enhanced-merge-sync-endpoints.js
│
├── dist/                         # Generated by build
│   ├── CabinetPM-v2.1.1/        # Clean distribution
│   ├── CabinetPM-v2.1.1.zip     # ZIP archive
│   ├── installers/
│   │   └── CabinetPM-Setup-v2.1.1.exe  # Installer
│   └── version.json             # Update manifest
│
└── DEPLOYMENT-GUIDE.md          # This file
```

---

## 🎯 **Quick Reference Commands**

```powershell
# Full build process (run all in order)
cd "C:\IBS APP\TABLET-DEPLOYMENT"
node build-release.js
Compress-Archive -Path "dist\CabinetPM-v2.1.1" -DestinationPath "dist\CabinetPM-v2.1.1.zip" -Force
iscc cabinet-pm-installer.iss

# Test locally
.\dist\CabinetPM-v2.1.1\cabinet-pm-tablet.exe

# Check version
node -e "console.log(require('./package.json').version)"

# Git release
git tag v2.1.1
git push origin v2.1.1
```

---

## 📞 **Support**

For issues or questions:
1. Check this guide first
2. Review logs in `logs/` folder
3. Test on development machine before deploying
4. Keep GitHub releases organized with clear changelogs

---

**Last Updated:** 2025-12-04
**Version:** 2.1.1
**Author:** Cabinet PM Development Team

