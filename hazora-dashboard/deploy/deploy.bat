@echo off
setlocal enabledelayedexpansion

REM ============================================================
REM  HAZORA Dashboard - one-click deploy to EC2 (nginx)
REM  Run by double-clicking or: deploy\deploy.bat
REM ============================================================

REM ---- Configuration (edit these if they change) -------------
set "PEM=D:\Downloads\Hazora.pem"
set "EC2_USER=ec2-user"
set "EC2_HOST=54.254.183.46"
set "REMOTE_ROOT=/usr/share/nginx/hazora"
set "REMOTE_TMP=/tmp/hazora-dist"
set "REMOTE_CONF=/etc/nginx/conf.d/hazora.conf"
REM ------------------------------------------------------------

REM Move to the dashboard project root (parent of this deploy folder).
cd /d "%~dp0.."

echo.
echo ============================================================
echo  HAZORA deploy  -^>  %EC2_USER%@%EC2_HOST%
echo ============================================================
echo.

REM ---- 0. Sanity checks --------------------------------------
if not exist "%PEM%" (
    echo [ERROR] PEM key not found: %PEM%
    echo         Update the PEM path at the top of deploy.bat.
    goto :fail
)

where ssh >nul 2>&1
if errorlevel 1 (
    echo [ERROR] 'ssh' not found. Install the Windows OpenSSH client.
    goto :fail
)

where npm >nul 2>&1
if errorlevel 1 (
    echo [ERROR] 'npm' not found. Install Node.js and try again.
    goto :fail
)

REM ---- 1. Build ----------------------------------------------
echo [1/4] Building dashboard (npm run build)...
call npm run build
if errorlevel 1 (
    echo [ERROR] Build failed. Fix the errors above and retry.
    goto :fail
)
if not exist "dist\index.html" (
    echo [ERROR] Build finished but dist\index.html is missing.
    goto :fail
)
echo       Build OK.
echo.

REM ---- 2. Upload dist to a clean temp folder -----------------
echo [2/4] Uploading files to %EC2_HOST%...
ssh -i "%PEM%" -o StrictHostKeyChecking=no %EC2_USER%@%EC2_HOST% "rm -rf %REMOTE_TMP% && mkdir -p %REMOTE_TMP%"
if errorlevel 1 goto :ssh_fail

scp -i "%PEM%" -o StrictHostKeyChecking=no -r dist\* %EC2_USER%@%EC2_HOST%:%REMOTE_TMP%/
if errorlevel 1 goto :ssh_fail
echo       Upload OK.
echo.

REM ---- 3. (Optional) refresh nginx site config ---------------
if exist "deploy\hazora.conf" (
    echo [3/4] Refreshing nginx site config...
    scp -i "%PEM%" -o StrictHostKeyChecking=no "deploy\hazora.conf" %EC2_USER%@%EC2_HOST%:/tmp/hazora.conf
    if errorlevel 1 goto :ssh_fail
    ssh -i "%PEM%" -o StrictHostKeyChecking=no %EC2_USER%@%EC2_HOST% "sudo mv /tmp/hazora.conf %REMOTE_CONF%"
    if errorlevel 1 goto :ssh_fail
    echo       Config updated.
) else (
    echo [3/4] No deploy\hazora.conf found - skipping config refresh.
)
echo.

REM ---- 4. Swap into web root and reload nginx ----------------
echo [4/4] Publishing to web root and reloading nginx...
ssh -i "%PEM%" -o StrictHostKeyChecking=no %EC2_USER%@%EC2_HOST% "sudo rm -rf %REMOTE_ROOT% && sudo mkdir -p %REMOTE_ROOT% && sudo cp -r %REMOTE_TMP%/* %REMOTE_ROOT%/ && sudo chown -R nginx:nginx %REMOTE_ROOT% && sudo chmod -R 755 %REMOTE_ROOT% && sudo nginx -t && sudo systemctl restart nginx && rm -rf %REMOTE_TMP%"
if errorlevel 1 goto :ssh_fail
echo       Published and nginx reloaded.
echo.

echo ============================================================
echo  DEPLOY SUCCESSFUL
echo  Live at: http://%EC2_HOST%/
echo ============================================================
echo.
goto :done

:ssh_fail
echo.
echo [ERROR] A remote (ssh/scp) step failed. See the output above.
goto :fail

:fail
echo.
echo DEPLOY FAILED.
endlocal
pause
exit /b 1

:done
endlocal
pause
exit /b 0
