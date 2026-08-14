# ============================================================================
# run-latest.ps1 —— 启动最新版本的 DSH Desktop Shell
# 用法：右键"使用 PowerShell 运行"，或命令行执行。
# 它会自动找到 dist 下版本号最高的打包产物并启动。
# ============================================================================

$dist = Join-Path $PSScriptRoot 'dist'

if (-not (Test-Path $dist)) {
    Write-Host '未找到 dist 目录，请先运行 npm run dist 打包。' -ForegroundColor Red
    exit 1
}

# 按版本号（v0.1.0 / 0.1.0）从高到低找最新产物
$versions = Get-ChildItem $dist -Directory -ErrorAction SilentlyContinue |
    Where-Object { $_.Name -match '^v?\d+\.\d+\.\d+' } |
    Sort-Object { [version]($_.Name -replace '^v', '') } -Descending

foreach ($v in $versions) {
    $exe = Join-Path $v.FullName 'win-unpacked\DSH Desktop Shell.exe'
    if (Test-Path $exe) {
        Start-Process $exe
        Write-Host "已启动 $($v.Name) 版本: $exe" -ForegroundColor Green
        exit 0
    }
}

Write-Host '没有找到可运行的打包产物，请先 npm run dist。' -ForegroundColor Red
exit 1
