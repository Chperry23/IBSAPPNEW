# Cabinet PM Sync API

HTTP sync service for master machine (`172.16.10.124`). See [docs/SYNC-MASTER-SERVER-SETUP.md](../docs/SYNC-MASTER-SERVER-SETUP.md) for install.

## Quick start

```powershell
cd "C:\IBS APP"
$env:MONGODB_URI = "mongodb://127.0.0.1:27017/cabinet_pm_db?directConnection=true"
npm run sync-server
```

Health: `http://localhost:3090/health`  
Dashboard: `http://localhost:3090/dashboard`

## Tablet cutover

On each iPad, set before starting the app:

```powershell
$env:SYNC_API_URL = "http://172.16.10.124:3090"
# or
$env:SYNC_USE_API = "1"
```

When `SYNC_API_URL` is set, Upload/Download/Sync All use the sync API. Unset to keep legacy direct Mongo.

## After code updates on master

Copy `sync-server/` and `backend/services/` to `C:\IBS APP` on the master, then:

```powershell
Restart-Service CabinetPMSyncAPI
Invoke-RestMethod http://127.0.0.1:3090/health
```

Fresh-install bootstrap uses `GET /sync/registry-table/:tableName` (paginated, gzipped).
