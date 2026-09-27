@echo off
setlocal

REM ============================================================
REM  HAZORA Dashboard - run LOCALLY for live camera / AI demos
REM
REM  Use this on the same Wi-Fi as your ESP32 camera(s).
REM  Browsers block a PUBLIC site (the AWS one) from reaching a
REM  LOCAL camera IP, so live streams + AI detection must run
REM  from localhost on the same network as the cameras.
REM ============================================================

REM Move to the dashboard project root (parent of this deploy folder).
cd /d "%~dp0.."

echo.
echo ============================================================
echo  HAZORA - LOCAL DEMO MODE
echo ============================================================
echo.

where npm >nul 2>&1
if errorlevel 1 (
    echo [ERROR] 'npm' not found. Install Node.js first: https://nodejs.org
    echo.
    pause
    exit /b 1
)

REM Install dependencies only if they are missing.
if not exist "node_modules" (
    echo [setup] Installing dependencies - first run only...
    call npm install
    if errorlevel 1 (
        echo [ERROR] npm install failed. See the errors above.
        echo.
        pause
        exit /b 1
    )
)

echo.
echo Starting the local dev server...
echo.
echo   1. Make sure this PC is on the SAME Wi-Fi as your ESP32 camera.
echo   2. When it opens, go to Live Streams and enter the camera IP
echo      such as 192.168.55.103 then click the arrow to connect.
echo   3. Press Ctrl+C in this window to stop the server when done.
echo.

REM --host exposes it on your LAN too, so a phone/tablet on the same
REM Wi-Fi can open http://<this-pc-ip>:5173 and also see the cameras.
call npm run dev -- --host

endlocal
