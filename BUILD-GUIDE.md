# 🚀 Build & Deploy Guide

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
- ✅ `backend/**` - Backend code
- ✅ SQLite3 native bindings
- ✅ Node.js runtime

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
1. Build the executable: `npm run build`
2. Copy from `dist/cabinet-pm-tablet.exe`
3. Include the `data/` folder with the database
4. User just double-clicks the .exe file!

## Default Login

**Username**: `admin`  
**Password**: `cabinet123`

## Notes

- The executable is ~100-150 MB (includes Node.js runtime)
- First launch may take a few seconds to extract files
- Database path is automatically detected
- Browser opens automatically on launch
- Server runs on port 3000 (configurable via PORT env var)

## Troubleshooting

**Port already in use?**
- Close any other instance of the app
- Check for node processes: `taskkill /F /IM node.exe`

**Database not found?**
- Ensure `data/cabinet_pm_tablet.db` is in the same folder as the .exe

**Browser doesn't open automatically?**
- Manually navigate to http://localhost:3000

---

**Built with ❤️ by ECI Industrial Solutions**

