$ErrorActionPreference = 'Stop'
$obsExe = 'C:\Program Files\obs-studio\bin\64bit\obs64.exe'
if (-not (Test-Path -LiteralPath $obsExe) -or (Get-Item -LiteralPath $obsExe).VersionInfo.ProductVersion -ne '32.0.1') {
    throw 'This plugin requires the verified OBS Studio 32.0.1 x64 installation.'
}
if (Get-Process -Name obs64 -ErrorAction SilentlyContinue) { throw 'Close OBS before installing the local source plugin.' }
$pluginDll = Join-Path $PSScriptRoot 'build-obs\Release\a1-local-source.dll'
if (-not (Test-Path -LiteralPath $pluginDll)) { throw 'Run Build-OBSPlugin.ps1 first.' }
$pluginDirectory = Join-Path $env:ProgramData 'obs-studio\plugins\a1-local-source\bin\64bit'
New-Item -ItemType Directory -Path $pluginDirectory -Force | Out-Null
$destination = Join-Path $pluginDirectory 'a1-local-source.dll'
if (Test-Path -LiteralPath $destination) {
    $backupDirectory = Join-Path $PSScriptRoot ('logs\plugin-backup-' + (Get-Date -Format 'yyyyMMdd-HHmmss'))
    New-Item -ItemType Directory -Path $backupDirectory -Force | Out-Null
    Copy-Item -LiteralPath $destination -Destination $backupDirectory
}
Copy-Item -LiteralPath $pluginDll -Destination $destination -Force
Write-Host "Installed $destination"
