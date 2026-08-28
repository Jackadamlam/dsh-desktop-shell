# ============================================================================
# setup-plugins.ps1 - Install the DSH plugins currently in use into the web profile.
# These are the plugins this desktop shell is paired with:
#   - dsh-better-sidebar          right-side workspace panel
#   - dsh-usage-stats             persistent usage status bar (per-provider)
# Usage: .\setup-plugins.ps1
# Restart `dsh web` after installing for the plugins to take effect.
# ============================================================================

$ErrorActionPreference = 'Stop'

Write-Host '=== DSH plugin setup ===' -ForegroundColor Cyan

# 1. dsh CLI available?
if (-not (Get-Command dsh -ErrorAction SilentlyContinue)) {
    Write-Host 'dsh CLI not found on PATH.' -ForegroundColor Red
    Write-Host 'Install it first:  npm install -g @deepseek-ai/dsh' -ForegroundColor Yellow
    exit 1
}

Write-Host "dsh version: $(dsh --version)" -ForegroundColor Gray

# 2. Install plugins (idempotent - re-running is safe)
$plugins = @(
    'github:Jackadamlam/DSH-better-sidebar',
    'github:Jackadamlam/dsh-usage-stats'
)

foreach ($p in $plugins) {
    Write-Host "`nInstalling $p ..." -ForegroundColor Yellow
    dsh plugin --profile web add $p
    if ($LASTEXITCODE -ne 0) {
        Write-Host "Failed to install $p (exit $LASTEXITCODE)." -ForegroundColor Red
        Write-Host 'If pnpm blocked build scripts, run:  pnpm approve-builds --all  (in the profile dir)' -ForegroundColor Yellow
        exit 1
    }
    Write-Host "OK: $p" -ForegroundColor Green
}

# 3. Done message
Write-Host "`n=== Done. Restart 'dsh web' (or the desktop shell) to load the plugins. ===" -ForegroundColor Cyan
