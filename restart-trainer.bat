@echo off
echo [trainer] Stopping existing server on port 3002...

for /f "tokens=5" %%a in ('netstat -ano ^| findstr "127.0.0.1:3002 " ^| findstr "LISTENING"') do (
    echo [trainer] Killing PID %%a
    taskkill /PID %%a /F >nul 2>&1
)

timeout /t 1 /nobreak >nul

echo [trainer] Starting trainer server...
cd /d "%~dp0packages\trainer"
start "Trainer Server" /min cmd /c "npx tsx src/index.ts > ..\..\trainer.log 2>&1"

echo [trainer] Waiting for server to start...
timeout /t 4 /nobreak >nul

curl -s http://127.0.0.1:3002/api/bridge/status
echo.
echo [trainer] Done. Log: trainer.log
