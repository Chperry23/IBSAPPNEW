# 🚀 Quick Start - Build Your First Release

Get from code to deployed app in 20 minutes!

---

## ⚡ **Option 1: Automated (Easiest) - 10 Minutes**

### 1. Install Inno Setup (one-time, 3 minutes)
```powershell
# Download and install from:
Start-Process "https://jrsoftware.org/download.php/is.exe"
# Use default settings
```

### 2. Run the build script (5 minutes)
```powershell
cd "C:\IBS APP\TABLET-DEPLOYMENT"
.\build-and-release.ps1 -Version "2.1.0"
```

### 3. Done! ✅
```
Output in dist/:
✅ CabinetPM-v2.1.0/ (clean folder)
✅ CabinetPM-v2.1.0.zip (manual install)
✅ installers/CabinetPM-Setup-v2.1.0.exe (installer)
✅ version.json (for auto-update)
```

---

## 🔧 **Option 2: Manual (Step-by-Step) - 15 Minutes**

### Step 1: Build everything (5 minutes)
```powershell
cd "C:\IBS APP\TABLET-DEPLOYMENT"
node build-release.js
```

### Step 2: Create ZIP (1 minute)
```powershell
Compress-Archive -Path "dist\CabinetPM-v2.1.0" -DestinationPath "dist\CabinetPM-v2.1.0.zip" -Force
```

### Step 3: Build installer (3 minutes)
```powershell
# Open Inno Setup:
Start-Process "cabinet-pm-installer.iss"
# Click: Build → Compile
# Wait for completion
```

### Step 4: Test it (5 minutes)
```powershell
# Copy to USB drive
Copy-Item "dist\installers\CabinetPM-Setup-v2.1.0.exe" "E:\" -Force

# Run on test iPad
# Verify it works
```

---

## 📤 **Publishing to GitHub (5 Minutes)**

### 1. Create GitHub Release
```
1. Go to: https://github.com/YOUR-USERNAME/cabinet-pm/releases/new
2. Tag: v2.1.0
3. Title: Cabinet PM Tablet v2.1.0
4. Description: 
   - Enhanced merge replication
   - UUID-based sync
   - Auto-update system
```

### 2. Upload Files
```
Drag and drop these files:
📦 CabinetPM-v2.1.0.zip
📀 CabinetPM-Setup-v2.1.0.exe
📄 version.json
```

### 3. Update version.json
```json
{
  "downloads": {
    "full": "https://github.com/YOUR-USERNAME/cabinet-pm/releases/download/v2.1.0/CabinetPM-v2.1.0.zip",
    "installer": "https://github.com/YOUR-USERNAME/cabinet-pm/releases/download/v2.1.0/CabinetPM-Setup-v2.1.0.exe"
  }
}
```

### 4. Commit to main branch
```powershell
Copy-Item "dist\version.json" "version.json"
git add version.json
git commit -m "Release v2.1.0"
git push origin main
```

---

## 📲 **Deploying to First iPad (Test) - 5 Minutes**

### Using Installer (Recommended):
```
1. Copy CabinetPM-Setup-v2.1.0.exe to USB
2. Run on iPad
3. Enter MongoDB IP: 172.16.10.124
4. Click Next → Install
5. Launch app
6. Login: admin / cabinet123
7. Go to Sync → Reset Sync State → Safe Push
```

### Using ZIP (Quick test):
```
1. Extract CabinetPM-v2.1.0.zip to C:\CabinetPM\
2. Run cabinet-pm-tablet.exe
3. Open browser: http://localhost:3000
4. Login: admin / cabinet123
```

---

## 🔍 **Quick Test Checklist**

After installing on test iPad:

- [ ] App launches without errors
- [ ] Can login with admin/cabinet123
- [ ] Dashboard loads
- [ ] Sync page connects to MongoDB
- [ ] Safe Pull downloads master data
- [ ] Safe Push uploads local changes
- [ ] Device ID shown in Sync page
- [ ] No console errors

If all ✅ → Deploy to remaining iPads!

---

## 🆘 **Troubleshooting**

### "pkg not found"
```powershell
npm install -g pkg
```

### "Cannot find module"
```powershell
npm install
```

### "ISCC.exe not found"
```
Install Inno Setup from: https://jrsoftware.org/isdl.php
```

### "Build failed"
```powershell
# Clean and rebuild
Remove-Item node_modules -Recurse -Force
Remove-Item dist -Recurse -Force
npm install
npm run build
```

---

## 📞 **Need Help?**

1. Check `DEPLOYMENT-GUIDE.md` for detailed docs
2. Review logs in terminal output
3. Test on dev machine first before deploying

---

## 🎯 **Your First Release in 3 Commands**

```powershell
# 1. Build
cd "C:\IBS APP\TABLET-DEPLOYMENT"
.\build-and-release.ps1

# 2. Test
.\dist\CabinetPM-v2.1.0\cabinet-pm-tablet.exe

# 3. Deploy
# Copy dist/installers/CabinetPM-Setup-v2.1.0.exe to USB → Install on iPads
```

**That's it!** 🎉

---

**Next:** Once this works, enable auto-update and never manually deploy again!

