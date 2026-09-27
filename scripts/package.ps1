$ErrorActionPreference = 'Stop'
$taskProject = Split-Path -Parent $PSScriptRoot
$taskManifest = Get-Content -Raw (Join-Path $taskProject 'manifest.json') | ConvertFrom-Json
$taskArchive = Join-Path $taskProject ("dist/obsidian-context-mcp-" + $taskManifest.version + ".zip")
$taskFiles = @('main.js', 'manifest.json', 'styles.css') | ForEach-Object { Join-Path $taskProject $_ }
Compress-Archive -LiteralPath $taskFiles -DestinationPath $taskArchive -Force
Write-Output $taskArchive
