[CmdletBinding()]
param(
    [ValidateSet('Connect', 'Start', 'Restart', 'Stop', 'Status')]
    [string]$Action = 'Start',
    [string]$NodeExe,
    [string]$EndpointFile,
    [switch]$LaunchApp,
    [switch]$Pause
)
$ErrorActionPreference = 'Stop'
$project = Split-Path -Parent $PSScriptRoot
if (-not $NodeExe) { $NodeExe = (Get-Command node.exe -ErrorAction Stop).Source }
if (-not (Test-Path -LiteralPath $NodeExe -PathType Leaf)) { throw "Node executable not found: $NodeExe" }
$launcherFile = Join-Path $project '.local\mcp-launcher.json'
if (-not $EndpointFile -and (Test-Path -LiteralPath $launcherFile)) {
    $launcher = Get-Content -LiteralPath $launcherFile -Raw -Encoding UTF8 | ConvertFrom-Json
    $EndpointFile = $launcher.env.WEBOBSIDIAN_ENDPOINT_FILE
}
function Test-Endpoint {
    if (-not $EndpointFile) { return $true }
    try {
        $endpoint = Get-Content -LiteralPath $EndpointFile -Raw -Encoding UTF8 | ConvertFrom-Json
        $url = [uri]$endpoint.url
        if ($endpoint.protocol -ne 1 -or -not $url.IsAbsoluteUri -or $url.Scheme -ne 'http' -or
            $url.Host -notin @('localhost', '127.0.0.1', '[::1]', '::1') -or $url.UserInfo -or
            $url.AbsolutePath -ne '/' -or $url.Query -or $url.Fragment) { throw 'Invalid local endpoint.' }
        $health = Invoke-RestMethod -Uri ($url.AbsoluteUri.TrimEnd('/') + '/healthz') -TimeoutSec 3
        if (-not $health.ok) { throw 'Health check failed.' }
        Write-Host ('[MCP] Local application ready: {0}' -f $url.AbsoluteUri)
        return $true
    } catch {
        Write-Host ('[MCP] Local application unavailable: {0}' -f $_.Exception.Message)
        return $false
    }
}
$ready = $true
if ($Action -ne 'Stop') { $ready = Test-Endpoint }
if (-not $ready -and $LaunchApp -and $Action -in @('Connect', 'Start', 'Restart')) {
    $app = Join-Path $env:LOCALAPPDATA 'Programs\WebObsidian\WebObsidian.exe'
    if (-not (Test-Path -LiteralPath $app -PathType Leaf)) { throw "Application not found: $app" }
    Start-Process -FilePath $app -WindowStyle Hidden | Out-Null
    for ($attempt = 0; $attempt -lt 20 -and -not $ready; $attempt++) {
        Start-Sleep -Milliseconds 500
        $ready = Test-Endpoint
    }
}
$exitCode = 1
if ($ready -or $Action -in @('Stop', 'Status')) {
    & $NodeExe (Join-Path $PSScriptRoot 'tunnel.mjs') $Action.ToLowerInvariant()
    $exitCode = $LASTEXITCODE
    if (-not $ready -and $exitCode -eq 0) { $exitCode = 1 }
} else { Write-Host '[MCP] Open WebObsidian, then run this script again. Tunnel was not restarted.' }
if ($Pause) { [void](Read-Host 'Press Enter to close') }
exit $exitCode
