@echo off
if not exist "%~dp0build\Release\a1-ndi-sender.exe" (
    "%~dp0build-obs\Release\a1-ndi-sender.exe" --stop
    exit /b
)
"%~dp0build\Release\a1-ndi-sender.exe" --stop
