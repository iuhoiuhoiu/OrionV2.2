@echo off
title Orion Browser
color 0B
echo.
echo  ╔══════════════════════════════════════╗
echo  ║         Orion Browser v2             ║
echo  ║    Chromium-based  ·  BrowserView    ║
echo  ╚══════════════════════════════════════╝
echo.

:: Check Node.js
node --version >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo  ERROR: Node.js not found.
    echo.
    echo  1. Go to https://nodejs.org
    echo  2. Download the LTS version
    echo  3. Install it (just click Next)
    echo  4. RESTART your computer
    echo  5. Run this file again
    echo.
    pause
    exit /b 1
)
echo  Node.js: 
node --version

:: Install if needed
if not exist "node_modules\electron\dist\electron.exe" (
    echo.
    echo  First run — downloading Electron (~100MB)...
    echo  This only happens once. Please wait.
    echo.
    npm install --prefer-offline
    if %ERRORLEVEL% NEQ 0 (
        echo.
        echo  npm install failed. Check your internet and try again.
        pause
        exit /b 1
    )
)

echo.
echo  Launching Orion...
echo.
npx electron .
