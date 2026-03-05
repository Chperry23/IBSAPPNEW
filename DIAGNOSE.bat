@echo off
title Cabinet PM Diagnostics
cd /d "%~dp0"

echo ============================================
echo   Cabinet PM - Diagnostic Check
echo ============================================
echo.

echo  Folder: %~dp0
echo.

:: ─── File checks ───────────────────────────────
echo  Checking required files:
echo.

if exist "CabinetPM.exe"                         (echo    OK  CabinetPM.exe) else (echo    MISSING  CabinetPM.exe)
if exist "frontend-react\dist\index.html"        (echo    OK  frontend-react\dist\index.html) else (echo    MISSING  frontend-react\dist\index.html)
if exist "backend\server.js"                     (echo    OK  backend\server.js) else (echo    MISSING  backend\server.js)
if exist "node_modules\sqlite3"                  (echo    OK  node_modules\sqlite3\) else (echo    MISSING  node_modules\sqlite3\)
if exist "node_modules\sqlite3\lib\binding"      (echo    OK  node_modules\sqlite3\lib\binding\) else (echo    MISSING  node_modules\sqlite3\lib\binding\)

echo.
echo  SQLite3 native binding folders:
if exist "node_modules\sqlite3\lib\binding" (
    dir /b "node_modules\sqlite3\lib\binding" 2>nul || echo    (empty!)
) else (
    echo    (directory not found)
)

echo.
echo  Recent crash report:
if exist "STARTUP-CRASH-REPORT.txt" (
    echo    FOUND — contents below:
    echo    ----------------------------------------
    type "STARTUP-CRASH-REPORT.txt"
    echo    ----------------------------------------
) else (
    echo    No crash report found (app may not have run yet, or started OK)
)

echo.
echo  Latest log:
if exist "logs\latest.log" (
    echo    FOUND — last 30 lines:
    echo    ----------------------------------------
    powershell -command "Get-Content 'logs\latest.log' -Tail 30"
    echo    ----------------------------------------
) else (
    echo    No log file found yet
)

echo.
echo ============================================
echo   Diagnostics complete.
echo   If you see MISSING items above, re-extract
echo   the full ZIP file and try again.
echo ============================================
echo.
pause
