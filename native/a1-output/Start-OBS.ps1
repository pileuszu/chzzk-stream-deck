$ErrorActionPreference = 'Stop'
$obsExe = 'C:\Program Files\obs-studio\bin\64bit\obs64.exe'
if (Get-Process -Name obs64 -ErrorAction SilentlyContinue) {
    Write-Host 'OBS is already running. Stream Deck connects the current scene.'
    exit 0
}
$senderProcesses = @(Get-Process -Name 'a1-ndi-sender' -ErrorAction SilentlyContinue)
if ($senderProcesses.Count) {
    $senderExe = Join-Path $PSScriptRoot 'build\Release\a1-ndi-sender.exe'
    if (-not (Test-Path -LiteralPath $senderExe)) { $senderExe = Join-Path $PSScriptRoot 'build-obs\Release\a1-ndi-sender.exe' }
    & $senderExe --stop
    if ($LASTEXITCODE -ne 0) { throw 'Could not request standalone sender shutdown.' }
    foreach ($senderProcess in $senderProcesses) {
        if (-not $senderProcess.WaitForExit(10000)) { throw 'Standalone sender did not stop in time.' }
    }
}
Start-Process -FilePath $obsExe -WorkingDirectory (Split-Path -Parent $obsExe) -WindowStyle Normal
Write-Host 'OBS opened with the current scene collection. Stream Deck will attach its capture source.'
