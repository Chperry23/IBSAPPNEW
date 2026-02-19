@echo off
title Cabinet PM Tablet Server
echo ============================================
echo   Cabinet PM Tablet Server
echo ============================================
echo.

cd /d "%~dp0"

if not exist "CabinetPM.exe" (
    echo ERROR: CabinetPM.exe not found in %~dp0
    echo Make sure you extracted the full ZIP file.
    echo.
    pause
    exit /b 1
)

if not exist "node_modules\sqlite3" (
    echo ERROR: node_modules\sqlite3 folder not found.
    echo Make sure you extracted the full ZIP file.
    echo.
    pause
    exit /b 1
)

echo Starting Cabinet PM...
echo Logs will be saved to the "logs" folder.
echo.

CabinetPM.exe

echo.
echo ============================================
echo   Server has stopped.
echo   Check the "logs" folder for details.
echo ============================================
echo.
pause
