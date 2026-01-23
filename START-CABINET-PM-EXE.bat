@echo off
REM ECI Cabinet PM - Standalone Launcher (No Node.js Required!)

echo ================================================================
echo    ECI Cabinet PM - Starting Application
echo ================================================================
echo.

REM Get the directory where this script is located
cd /d "%~dp0"

REM Check if the exe exists
if not exist "CabinetPM.exe" (
    echo [ERROR] CabinetPM.exe not found!
    echo.
    echo Please make sure all files from the ZIP were extracted.
    echo.
    pause
    exit /b 1
)

echo [STARTING] Cabinet PM Server...
echo.
echo ================================================
echo   Opening browser at: http://localhost:3000
echo ================================================
echo.
echo Login credentials:
echo   Username: admin
echo   Password: cabinet123
echo.
echo ================================================
echo.
echo Keep this window open while using the application.
echo Press Ctrl+C to stop the server.
echo.

REM Start the application and open browser
start http://localhost:3000
CabinetPM.exe

REM If it stops, show message
echo.
echo ================================================
echo   Server stopped.
echo ================================================
pause
