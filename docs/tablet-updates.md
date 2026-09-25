# Cabinet PM tablet updates

Field tablets keep their SQLite database in `%APPDATA%\CabinetPM\`. The installer replaces program files only. Schema changes apply on the next launch through `backend/config/init-db.js`.

## Configure a tablet

Copy `cabinet-pm.env.example` to **one** of:

- Beside `CabinetPM.exe` (the install folder)
- `%APPDATA%\CabinetPM\cabinet-pm.env` (preferred — survives upgrades; wins if both exist)

Set `CABINET_PM_UPDATE_URL` to the **folder** that contains `version.json` (do not include the filename).

### Office share

```
CABINET_PM_UPDATE_URL=\\office-server\share\CabinetPM\updates
```

`version.json` can use a filename for `installerUrl` (for example `CabinetPM-Setup-2.0.2.exe`) sitting in that same folder.

### GitHub Releases

Host `version.json` somewhere the tablet can GET it, and set `installerUrl` to the **full HTTPS** asset URL:

```json
{
  "version": "2.0.2",
  "buildId": "2.0.2-abc",
  "notes": "What changed",
  "installerUrl": "https://github.com/Chperry23/IBSAPPNEW/releases/download/v2.0.2/CabinetPM-Setup-2.0.2.exe"
}
```

```
CABINET_PM_UPDATE_URL=https://raw.githubusercontent.com/ORG/REPO/main/updates
```

(or any HTTPS folder that serves `version.json`).

## What the tablet does

When the tablet is online it checks the feed on startup (banner) and again on the Sync page (including after a successful cloud sync). If a newer version is listed, **Install update** downloads the setup exe and runs Inno Setup quietly (`/VERYSILENT`). Cabinet PM closes so the installer can replace files. Reopen the app when the installer finishes. The AppData database is not replaced.

Offline or a missing feed is a quiet skip — work continues.

## Publish a build

1. `npm run version:patch` (or minor/major) when you want a new semver.
2. `npm run build:frontend && npm run build:exe && npm run build:installer`
   - Needs [Inno Setup 6](https://jrsoftware.org/isinfo.php) (`ISCC.exe`). Set `INNO_SETUP_PATH` if it is not in the default Program Files folder.
3. Publish the feed:

```
node scripts/publish-tablet-update.js --out \\office-server\share\CabinetPM\updates --notes "Short release notes"
```

For GitHub, upload `dist/installer/CabinetPM-Setup-<version>.exe` to the release, then publish `version.json` with `--installer-url` set to that asset URL (the exe is still copied next to `version.json` for a local/UNC copy).

Do not put the live tablet database in the update folder.
