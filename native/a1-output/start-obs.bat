@echo off
setlocal
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0Start-OBS.ps1"
set "obsExit=%ERRORLEVEL%"
if not "%obsExit%"=="0" pause
exit /b %obsExit%
