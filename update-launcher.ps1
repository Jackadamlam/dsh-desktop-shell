# ============================================================================
# update-launcher.ps1 - Sync the fixed launcher copy (app\) from the newest
# build in dist\. The launcher exe is the stable shortcut target:
#   shortcut -> "<project>\app\DSH Desktop Shell.exe" --launcher
# Run this once after setup or whenever the launcher logic itself changes.
# ============================================================================

$dist = Join-Path $PSScriptRoot 'dist'
$app = Join-Path $PSScriptRoot 'app'

if (-not (Test-Path $dist)) {
    Write-Host 'dist not found. Run npm run dist first.' -ForegroundColor Red
    exit 1
}

$versions = Get-ChildItem $dist -Directory -ErrorAction SilentlyContinue |
    Where-Object { $_.Name -match '^v?\d+\.\d+\.\d+' } |
    Sort-Object { [version]($_.Name -replace '^v', '') } -Descending

foreach ($v in $versions) {
    $src = Join-Path $v.FullName 'win-unpacked'
    if (Test-Path (Join-Path $src 'DSH Desktop Shell.exe')) {
        New-Item -ItemType Directory -Path $app -Force | Out-Null
        robocopy $src $app /E /NFL /NDL /NJH /NJS /NP | Out-Null
        Write-Host "Synced $($v.Name) -> app\" -ForegroundColor Green
        Write-Host "Launcher: $app\DSH Desktop Shell.exe --launcher" -ForegroundColor Cyan
        exit 0
    }
}

Write-Host 'No build found in dist. Run npm run dist first.' -ForegroundColor Red
exit 1
