$ErrorActionPreference = 'Stop'
$obsExe = 'C:\Program Files\obs-studio\bin\64bit\obs64.exe'
$collection = Join-Path $env:APPDATA 'obs-studio\basic\scenes\A1_Local.json'
if (-not (Test-Path -LiteralPath $collection)) { throw 'A1 Local collection is missing. See OBS-LOCAL.md for setup.' }
if (Get-Process -Name obs64 -ErrorAction SilentlyContinue) {
    Write-Host 'OBS is already running. Select the A1 Local profile and scene collection.'
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
Start-Process -FilePath $obsExe -WorkingDirectory (Split-Path -Parent $obsExe) -WindowStyle Normal -ArgumentList '--profile "A1 Local" --collection "A1 Local" --scene "A1 Local Broadcast"'
Write-Host 'OBS opened with A1 Local. Recording and Internet streaming are controlled in OBS.'
