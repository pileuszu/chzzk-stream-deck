@echo off
setlocal
cd /d "%~dp0"
if not exist "node_modules\electron\dist\electron.exe" (
    echo Run npm ci and npm run build:native from this folder first.
    pause
    exit /b 1
)
call npm run app
if errorlevel 1 pause
