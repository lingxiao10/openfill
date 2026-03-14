@echo off
echo [debugger mode] Rebuilding libs...
call npm run build:libs
if %errorlevel% neq 0 (
    echo Build failed!
    pause
    exit /b 1
)
echo [debugger mode] Starting extension dev mode...
set BUILD_MODE=debugger
npm run dev:ext
