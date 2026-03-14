@echo off
echo [1/3] Starting debug log server...
start "Debug Log Server" cmd /k "node debug-log-server.js"

echo [2/3] Rebuilding libs...
call npm run build:libs
if %errorlevel% neq 0 (
    echo Build failed!
    pause
    exit /b 1
)

echo [3/3] Starting extension dev mode...
echo.
echo =====================================================
echo  Debug log server: http://localhost:7373
echo  Logs written to:  debug.log (project root)
echo  Clear logs:       GET http://localhost:7373/clear
echo =====================================================
echo.
npm run dev:ext
