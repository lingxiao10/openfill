@echo off
echo [standard mode] Rebuilding libs...
call npm run build:libs
if %errorlevel% neq 0 (
    echo Build failed!
    pause
    exit /b 1
)
echo [standard mode] Starting extension dev mode...
npm run dev:ext
