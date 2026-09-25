param([string]$ObsPath = 'C:\Program Files\obs-studio', [switch]$AllowMissingOBS)
$ErrorActionPreference = 'Stop'
$projectRoot = $PSScriptRoot
$version = '32.0.1'
$depsPath = Join-Path $projectRoot 'build-obs-deps'
$archivePath = Join-Path $depsPath "OBS-Studio-$version-Sources.tar.gz"
$sourcePath = Join-Path $depsPath "obs-studio-$version-sources"
$obsExe = Join-Path $ObsPath 'bin\64bit\obs64.exe'
if (Test-Path -LiteralPath $obsExe) {
    $installedVersion = (Get-Item -LiteralPath $obsExe).VersionInfo.ProductVersion
    if ($installedVersion -ne $version) { throw "This build is pinned to OBS $version; installed version is $installedVersion. Update and verify the SDK pin before building for another version." }
} elseif (-not $AllowMissingOBS) { throw 'OBS Studio x64 was not found. CI can build with -AllowMissingOBS; this does not validate runtime compatibility.' }
New-Item -ItemType Directory -Path $depsPath -Force | Out-Null
if (-not (Test-Path -LiteralPath $archivePath)) {
    Invoke-WebRequest -Uri "https://github.com/obsproject/obs-studio/releases/download/$version/OBS-Studio-$version-Sources.tar.gz" -OutFile $archivePath
}
$expectedHash = '72B19FCC970F9B066B512326A3377526E1EFB0CA1EB92CF89AF26A1167F2FE35'
# Use the built-in crypto API even when a parent shell's module path prevents
# Windows PowerShell from auto-loading the Get-FileHash function.
$archiveStream = [IO.File]::OpenRead($archivePath)
$sha256 = [Security.Cryptography.SHA256]::Create()
try { $actualHash = ([BitConverter]::ToString($sha256.ComputeHash($archiveStream))).Replace('-', '') }
finally { $archiveStream.Dispose(); $sha256.Dispose() }
if ($actualHash -ne $expectedHash) { throw 'OBS source archive hash mismatch.' }
# Only public headers and their source provenance are needed; no build-tool symlinks.
& tar -xzf $archivePath -C $depsPath "obs-studio-$version-sources/libobs" "obs-studio-$version-sources/frontend/api" "obs-studio-$version-sources/COPYING"
if ($LASTEXITCODE -ne 0) { throw 'OBS header extraction failed' }
cmake -S $projectRoot -B "$projectRoot\build-obs" -G 'Visual Studio 17 2022' -A x64 -DA1_BUILD_OBS_PLUGIN=ON "-DA1_OBS_SOURCE_DIR=$sourcePath"
if ($LASTEXITCODE -ne 0) { throw 'OBS plugin configure failed' }
cmake --build "$projectRoot\build-obs" --config Release --parallel
if ($LASTEXITCODE -ne 0) { throw 'OBS plugin build failed' }
ctest --test-dir "$projectRoot\build-obs" -C Release --output-on-failure
if ($LASTEXITCODE -ne 0) { throw 'Tests failed' }
Write-Host "Built: $projectRoot\build-obs\Release\a1-local-source.dll"
