# 🚀 SUPER EASY TABLET DEPLOYMENT

## 📱 For Technicians/End Users

### ✨ The Easiest Way (Recommended)

**On YOUR computer (one time):**
```bash
npm run deploy
```
This creates: `ECI-Cabinet-PM-Complete.zip`

**On EACH tablet:**
1. Copy the ZIP file from USB drive
2. Extract it anywhere (Desktop is fine)
3. Double-click: **`README-TABLET.txt`** (read it)
4. Double-click: **`INSTALL-ON-TABLET.bat`** (one time setup)
5. Double-click: **`START-CABINET-PM.bat`** (to run the app)

**That's it!** No command line needed! 🎉

---

## 🔄 Updating Tablets Later

**After you make changes:**

1. **On YOUR computer:**
   ```bash
   npm run deploy
   ```

2. **On tablets:**
   - Copy new ZIP from USB
   - Extract and replace old files
   - Double-click `START-CABINET-PM.bat`
   - Updates install automatically!

---

## 🎯 What Tablets Need

**Option A: With Executable (Coming Soon)**
- Nothing! The .exe includes Node.js

**Option B: Current Method**
- Node.js installed (one-time download from nodejs.org)
- That's it!

---

## 📦 Three Deployment Options

### Option 1: Simple Batch Files (Current - EASIEST)
```bash
npm run deploy
```
- ✅ No programming knowledge needed
- ✅ Double-click to install
- ✅ Double-click to run
- ⚠️ Tablets need Node.js installed once

### Option 2: Standalone Executable (Advanced)
```bash
npm run build:exe
npm run build:full
```
- ✅ Includes Node.js (60-70 MB)
- ✅ One .exe file
- ✅ No dependencies on tablets
- ⚠️ Larger file size

### Option 3: Inno Setup Installer (Windows Installer)
1. Install Inno Setup from: https://jrsoftware.org/isdl.php
2. Open `cabinet-pm-installer.iss`
3. Click Compile
4. Get a professional Windows installer .exe

---

## 💡 Recommended Workflow

**For multiple tablets in the field:**

1. **Build once:**
   ```bash
   npm run deploy
   ```

2. **Copy to USB drive:**
   - One ZIP file
   - 5-10 MB compressed

3. **On each tablet:**
   - Extract ZIP
   - Run INSTALL-ON-TABLET.bat (once)
   - Create desktop shortcut (once)
   - Daily: Double-click desktop icon

4. **For updates:**
   - Run `npm run deploy` again
   - Copy new ZIP to USB
   - On tablets: Extract over old files
   - Done!

---

## 🆘 Support

**Common Issues:**

**"Node.js not found"**
- Download from nodejs.org
- Install LTS version
- Restart tablet

**"Port 3000 in use"**
- Another instance is running
- Close it first

**Can't save data**
- Check tablet has write permissions
- Run as administrator if needed

---

## ✅ Checklist for New Tablet Setup

- [ ] Node.js installed (v18 or higher)
- [ ] ZIP copied from USB
- [ ] ZIP extracted to C:\IBS-APP or Desktop
- [ ] Ran INSTALL-ON-TABLET.bat successfully
- [ ] Created desktop shortcut
- [ ] Tested: Double-click START-CABINET-PM.bat
- [ ] Browser opens to localhost:3000
- [ ] Can login with admin/cabinet123
- [ ] Tested sync with main database

---

**That's it! You're ready to go! 🎉**
