# ============================================================================
# clean-old.ps1 - Remove old versioned build artifacts, keep the newest N.
# Usage:  .\clean-old.ps1            (keep newest 2 by default)
#         .\clean-old.ps1 -Keep 3    (keep newest 3)
# Each version is ~440 MB (Electron runtime), so cleaning saves GBs.
# ============================================================================

param([int]$Keep = 2)

$dist = Join-Path $PSScriptRoot 'dist'
if (-not (Test-Path $dist)) {
    Write-Host 'dist not found.' -ForegroundColor Red
    exit 1
}

$versions = Get-ChildItem $dist -Directory -ErrorAction SilentlyContinue |
    Where-Object { $_.Name -match '^v?\d+\.\d+\.\d+' } |
    Sort-Object { [version]($_.Name -replace '^v', '') } -Descending

if ($versions.Count -le $Keep) {
    Write-Host "Only $($versions.Count) version(s), nothing to clean." -ForegroundColor Green
    exit 0
}

$toDelete = $versions | Select-Object -Skip $Keep
$freed = 0

foreach ($v in $toDelete) {
    $sizeMB = [math]::Round(((Get-ChildItem $v.FullName -Recurse -File -ErrorAction SilentlyContinue |
        Measure-Object Length -Sum).Sum / 1MB), 1)
    Write-Host "Deleting $($v.Name) ($sizeMB MB)..." -ForegroundColor Yellow
    Remove-Item $v.FullName -Recurse -Force
    $freed += $sizeMB
}

Write-Host "Done. Kept $Keep, freed $([math]::Round($freed / 1024, 2)) GB." -ForegroundColor Green
