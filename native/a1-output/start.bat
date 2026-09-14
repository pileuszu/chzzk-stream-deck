@echo off
setlocal
pushd "%~dp0"
if errorlevel 1 (
    echo Cannot open the project folder.
    pause
    exit /b 1
)
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0Start-Sender.ps1"
set "senderExit=%ERRORLEVEL%"
popd
if not "%senderExit%"=="0" (
    echo.
    echo Sender did not start. See the message above and logs\run-error.log.
    pause
)
exit /b %senderExit%
