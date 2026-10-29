$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
foreach ($taskEnvName in [Environment]::GetEnvironmentVariables('Process').Keys) {
    if ($taskEnvName -match '^(CONTROL_PLANE_API_KEY|OPENAI_API_KEY|OPENAI_ADMIN_KEY|TUNNEL_HTTP_PROXY|HTTPS?_PROXY|ALL_PROXY|NO_PROXY)$') {
        [Environment]::SetEnvironmentVariable($taskEnvName, $null, 'Process')
    }
}
[Environment]::SetEnvironmentVariable('OBSIDIAN_MCP_PROJECT', $projectRoot, 'Process')
Push-Location -LiteralPath $projectRoot
try {
    & node (Join-Path $projectRoot 'scripts/start-mcp.mjs')
    exit $LASTEXITCODE
} finally {
    Pop-Location
}
