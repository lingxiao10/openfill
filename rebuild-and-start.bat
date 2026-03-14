@echo off
echo Rebuilding libs...
call npm run build:libs
if %errorlevel% neq 0 (
    echo Build failed!
    pause
    exit /b 1
)
echo Starting extension dev mode...
npm run dev:ext
