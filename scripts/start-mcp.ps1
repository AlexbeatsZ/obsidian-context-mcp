$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
[Environment]::SetEnvironmentVariable('CONTROL_PLANE_API_KEY', $null, 'Process')
[Environment]::SetEnvironmentVariable('OPENAI_API_KEY', $null, 'Process')
[Environment]::SetEnvironmentVariable('HTTPS_PROXY', $null, 'Process')
[Environment]::SetEnvironmentVariable('OBSIDIAN_MCP_PROJECT', $projectRoot, 'Process')
Push-Location -LiteralPath $projectRoot
try {
    & node (Join-Path $projectRoot 'dist/mcp.cjs')
    exit $LASTEXITCODE
} finally {
    Pop-Location
}
