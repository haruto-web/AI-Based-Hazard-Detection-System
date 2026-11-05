@echo off
setlocal

REM Run the local AI API for the dashboard and ESP32 camera.
cd /d "%~dp0"

echo.
echo ============================================================
echo  HAZORA - LOCAL AI SERVICE
echo ============================================================
echo.

if not exist ".venv\Scripts\python.exe" (
    where py >nul 2>&1
    if not errorlevel 1 (
        echo [setup] Creating the AI service virtual environment...
        py -3 -m venv .venv
    ) else (
        where python >nul 2>&1
        if errorlevel 1 (
            echo [ERROR] Python 3 was not found. Install Python and try again.
            echo.
            pause
            exit /b 1
        )
        echo [setup] Creating the AI service virtual environment...
        python -m venv .venv
    )
    if errorlevel 1 (
        echo [ERROR] Could not create the virtual environment.
        echo.
        pause
        exit /b 1
    )
)

set "PYTHON=.venv\Scripts\python.exe"
"%PYTHON%" -m pip show fastapi uvicorn pillow ai-edge-litert numpy >nul 2>&1
if errorlevel 1 (
    echo [setup] Installing AI service dependencies - first run only...
    "%PYTHON%" -m pip install -r requirements.txt
    if errorlevel 1 (
        echo [ERROR] Dependency installation failed. See the errors above.
        echo.
        pause
        exit /b 1
    )
)

if exist "local-settings.bat" call "local-settings.bat"
if not defined AI_ACTIVE_DETECTORS set "AI_ACTIVE_DETECTORS=all"

echo.
echo Active detectors: %AI_ACTIVE_DETECTORS%
echo Starting the local AI service at http://localhost:8001
echo Keep this window open while using the local dashboard.
echo Press Ctrl+C to stop the service.
echo.

"%PYTHON%" -m uvicorn app:app --host 0.0.0.0 --port 8001 --reload
set "EXIT_CODE=%ERRORLEVEL%"
if not "%EXIT_CODE%"=="0" (
    echo.
    echo [ERROR] The AI service stopped with exit code %EXIT_CODE%.
    pause
)

endlocal & exit /b %EXIT_CODE%
