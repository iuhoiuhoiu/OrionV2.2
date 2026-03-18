@echo off
title Orion Browser — Build .exe
color 0B
echo.
echo  ╔══════════════════════════════════════════╗
echo  ║       Orion Browser — Build .exe         ║
echo  ║   Just wait. The installer will appear.  ║
echo  ╚══════════════════════════════════════════╝
echo.

:: ── STEP 1: Check for Node.js ─────────────────────────────────────────────────
echo  [1/4] Checking for Node.js...
node --version >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo.
    echo  Node.js is not installed. Downloading installer now...
    echo  (This is the only thing you need to install manually)
    echo.

    :: Download Node.js LTS installer using PowerShell
    powershell -Command "Invoke-WebRequest -Uri 'https://nodejs.org/dist/v20.11.1/node-v20.11.1-x64.msi' -OutFile '%TEMP%\node-installer.msi'" >nul 2>&1
    if %ERRORLEVEL% NEQ 0 (
        echo  ERROR: Could not download Node.js automatically.
        echo.
        echo  Please install it manually:
        echo    1. Open your browser and go to: https://nodejs.org
        echo    2. Click the big LTS download button
        echo    3. Run the installer, click Next through everything
        echo    4. RESTART your computer
        echo    5. Double-click build.bat again
        echo.
        pause
        exit /b 1
    )

    echo  Installing Node.js silently (takes ~1 minute)...
    msiexec /i "%TEMP%\node-installer.msi" /qn /norestart
    if %ERRORLEVEL% NEQ 0 (
        echo  ERROR: Node.js installation failed.
        echo  Please install manually from https://nodejs.org then re-run this file.
        pause
        exit /b 1
    )

    :: Refresh PATH so node is available immediately
    for /f "tokens=*" %%i in ('where node 2^>nul') do set NODE_PATH=%%i
    if not defined NODE_PATH (
        set "PATH=%PATH%;C:\Program Files\nodejs"
    )

    node --version >nul 2>&1
    if %ERRORLEVEL% NEQ 0 (
        echo.
        echo  Node.js was installed but requires a restart to be detected.
        echo  Please RESTART YOUR COMPUTER then double-click build.bat again.
        echo.
        pause
        exit /b 1
    )
)
echo  Node.js found: 
node --version
echo.

:: ── STEP 2: Install npm dependencies ─────────────────────────────────────────
echo  [2/4] Installing dependencies (Electron ~100MB — first time only)...
echo  This may take a few minutes. Please wait.
echo.
call npm install
if %ERRORLEVEL% NEQ 0 (
    echo.
    echo  ERROR: npm install failed.
    echo  Check your internet connection and try again.
    echo.
    pause
    exit /b 1
)
echo.
echo  Dependencies installed.
echo.

:: ── STEP 3: Build the .exe ────────────────────────────────────────────────────
echo  [3/4] Building Orion.exe installer...
echo  This takes 2-5 minutes. Do not close this window.
echo.
call npm run build-win
if %ERRORLEVEL% NEQ 0 (
    echo.
    echo  ERROR: Build failed.
    echo  Try running this file again. If it keeps failing,
    echo  make sure you have at least 2GB of free disk space.
    echo.
    pause
    exit /b 1
)
echo.

:: ── STEP 4: Open the dist folder ─────────────────────────────────────────────
echo  [4/4] Done! Opening the dist folder...
echo.
echo  ╔══════════════════════════════════════════╗
echo  ║   BUILD COMPLETE!                        ║
echo  ║                                          ║
echo  ║   Your .exe installer is in the          ║
echo  ║   dist\ folder that just opened.         ║
echo  ║                                          ║
echo  ║   Double-click the Setup .exe to         ║
echo  ║   install Orion on this computer.        ║
echo  ╚══════════════════════════════════════════╝
echo.

if exist "dist\" (
    explorer dist\
) else (
    echo  Could not find dist\ folder. Check above for errors.
)

pause
