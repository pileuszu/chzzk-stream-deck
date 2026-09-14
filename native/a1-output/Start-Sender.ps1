$ErrorActionPreference = 'Stop'
$senderExe = Join-Path $PSScriptRoot 'build\Release\a1-ndi-sender.exe'
if (-not (Test-Path -LiteralPath $senderExe)) {
    $obsBuildExe = Join-Path $PSScriptRoot 'build-obs\Release\a1-ndi-sender.exe'
    if (Test-Path -LiteralPath $obsBuildExe) { $senderExe = $obsBuildExe }
}
$senderProcesses = Get-Process -Name 'a1-ndi-sender' -ErrorAction SilentlyContinue
if ($senderProcesses) { Write-Host 'A1 NDI Sender is already running. No second sender was started.'; exit 0 }
if (-not (Test-Path -LiteralPath (Join-Path $PSScriptRoot 'sender.ini'))) {
    throw 'sender.ini is missing. Restore it from the repository before starting.'
}
if (-not (Test-Path -LiteralPath $senderExe)) {
    if (-not (Get-Command cmake -ErrorAction SilentlyContinue)) {
        throw 'First build requires CMake 3.24+ and Visual Studio 2022 C++ Build Tools with Windows SDK. See README.md.'
    }
    Write-Host 'First run: building the sender and running its tests...'
    & (Join-Path $PSScriptRoot 'build.ps1')
    if (-not (Test-Path -LiteralPath $senderExe)) { throw 'Build did not produce the sender executable.' }
}
New-Item -ItemType Directory -Path "$PSScriptRoot\logs" -Force | Out-Null
$senderProcess = Start-Process -FilePath $senderExe -WorkingDirectory $PSScriptRoot -WindowStyle Hidden -RedirectStandardOutput "$PSScriptRoot\logs\run.log" -RedirectStandardError "$PSScriptRoot\logs\run-error.log" -PassThru
Start-Sleep -Seconds 3
if ($senderProcess.HasExited) {
    Get-Content -LiteralPath "$PSScriptRoot\logs\run-error.log"
    throw 'Sender failed to start.'
}
Write-Host 'A1 NDI Sender started in the background.'
Write-Host 'Select the source named in sender.ini on the receiving PC. Default: A1 Desktop Sync.'
Write-Host 'Use the tray icon or Stop-Sender.cmd to stop. Status: logs\status.json'
