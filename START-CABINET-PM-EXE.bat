@echo off
title ECI Cabinet PM
cd /d "%~dp0"

echo ============================================
echo   ECI Cabinet PM - Starting...
echo ============================================
echo.

:: ─────────────────────────────────────────────
:: Pre-flight checks before launching the exe
:: ─────────────────────────────────────────────

if not exist "CabinetPM.exe" (
    echo.
    echo  ERROR: CabinetPM.exe not found!
    echo  Make sure you extracted the FULL ZIP file.
    echo  Expected location: %~dp0CabinetPM.exe
    echo.
    pause
    exit /b 1
)

if not exist "node_modules\sqlite3" (
    echo.
    echo  ERROR: node_modules\sqlite3\ folder not found!
    echo  Make sure you extracted the FULL ZIP file.
    echo  The node_modules folder must be next to CabinetPM.exe
    echo.
    pause
    exit /b 1
)

if not exist "frontend-react\dist\index.html" (
    echo.
    echo  ERROR: frontend-react\dist\index.html not found!
    echo  Make sure you extracted the FULL ZIP file.
    echo.
    pause
    exit /b 1
)

:: ─────────────────────────────────────────────
:: Remove the old crash report so we start fresh
:: ─────────────────────────────────────────────
if exist "STARTUP-CRASH-REPORT.txt" del /f /q "STARTUP-CRASH-REPORT.txt"

echo  All files present. Launching app...
echo  Logs saved to: %~dp0logs\
echo.

:: Run the exe — it opens the browser automatically
CabinetPM.exe

:: ─────────────────────────────────────────────
:: The exe exited — check if there is a crash report
:: ─────────────────────────────────────────────
echo.
echo ============================================
echo   Cabinet PM has stopped.
echo ============================================
echo.

if exist "STARTUP-CRASH-REPORT.txt" (
    echo  A crash report was written. Opening it now...
    echo  File: %~dp0STARTUP-CRASH-REPORT.txt
    echo.
    :: Show the file content right in this window
    type "STARTUP-CRASH-REPORT.txt"
    echo.
    :: Also open it in Notepad for easy reading/copying
    start notepad "STARTUP-CRASH-REPORT.txt"
)

if exist "logs\latest.log" (
    echo  Full log: %~dp0logs\latest.log
)

echo.
pause
