@echo off
echo ========================================
echo Cabinet PM Tablet - Git Setup Script
echo ========================================
echo.

REM Check if git is installed
git --version >nul 2>&1
if %errorlevel% neq 0 (
    echo Git is not installed!
    echo.
    echo Please install Git from: https://git-scm.com/download/win
    echo Then run this script again.
    echo.
    pause
    exit /b 1
)

echo Git is installed! Setting up repository...
echo.

REM Initialize git repository
git init

REM Add all files
git add .

REM Create initial commit
git commit -m "Initial commit: Cabinet PM Tablet Application"

REM Set main branch
git branch -M main

REM Add remote repository
git remote add origin https://github.com/Chperry23/IBSAPPNEW.git

REM Push to GitHub
echo Pushing to GitHub...
git push -u origin main

echo.
echo ========================================
echo Setup complete! 
echo Repository: https://github.com/Chperry23/IBSAPPNEW
echo ========================================
pause
