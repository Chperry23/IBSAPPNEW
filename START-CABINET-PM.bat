@echo off
REM ECI Cabinet PM - Node.js Version Launcher

echo ================================================================
echo    ECI Cabinet PM - Starting Application
echo ================================================================
echo.

REM Get the directory where this script is located
cd /d "%~dp0"

REM Check if Node.js is installed
where node >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Node.js is not installed!
    echo.
    echo Please install Node.js from: https://nodejs.org
    echo.
    pause
    exit /b 1
)

REM Check if node_modules exists
if not exist "node_modules\" (
    echo [INFO] Dependencies not installed. Running installation...
    echo.
    call npm install --production
    if %ERRORLEVEL% NEQ 0 (
        echo [ERROR] Installation failed!
        pause
        exit /b 1
    )
    echo.
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
node server-tablet.js

REM If it stops, show message
echo.
echo ================================================
echo   Server stopped.
echo ================================================
pause
