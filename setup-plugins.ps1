# ============================================================================
# setup-plugins.ps1 - Install recommended DSH plugins into the web profile.
# These are third-party open-source plugins that enhance the DSH Web UI:
#   - @omdsh-dev/dsh-genui      interactive dsh-ui components
#   - dsh-at-file               @ path picker (widened index cap)
#   - dsh-better-sidebar        right-side workspace panel
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
    'github:omdsh-dev/dsh-genui',
    'github:omdsh-dev/dsh-at-file',
    'dsh-better-sidebar'
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

# 3. Optional: widen dsh-at-file index cap in the profile patch layer
$patchFile = Join-Path $env:DSH_HOME 'profiles\web\cordis.patch.yml'
if ($env:DSH_HOME -and (Test-Path $patchFile)) {
    $content = Get-Content $patchFile -Raw -Encoding UTF8
    if ($content -notmatch 'dsh-at-file') {
        $addition = @'

# dsh-at-file: widen the workspace @-picker index cap (default 5000).
- id: dsh-at-file
  config:
    maxIndexedFiles: 10000
'@
        Add-Content -Path $patchFile -Value $addition -Encoding UTF8
        Write-Host "`nPatched $patchFile (maxIndexedFiles: 10000)" -ForegroundColor Green
    } else {
        Write-Host "`n$patchFile already configured for dsh-at-file." -ForegroundColor Gray
    }
}

Write-Host "`n=== Done. Restart 'dsh web' (or the desktop shell) to load the plugins. ===" -ForegroundColor Cyan
