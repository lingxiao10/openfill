@echo off
cd /d "%~dp0"

echo Building extension...
call npm run build:ext
if errorlevel 1 (
    echo Build failed!
    pause
    exit /b 1
)

echo Copying zip to .output...
if not exist ".output" mkdir ".output"
for %%f in ("packages\extension\.output\*.zip") do (
    copy /y "%%f" ".output\" >nul
    echo Copied: %%~nxf
)

echo.
echo Done! ZIP is in: %~dp0.output\
explorer "%~dp0.output"
