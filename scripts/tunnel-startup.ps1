[CmdletBinding()]
param(
    [ValidateSet('Install', 'Status', 'Uninstall', 'Run')]
    [string]$Mode = 'Status',
    [string]$NodePath
)

$ErrorActionPreference = 'Stop'
$taskName = 'Obsidian Context MCP Tunnel'
$description = 'Obsidian Context MCP dedicated Tunnel supervisor.'
$projectPath = Split-Path -Parent $PSScriptRoot
$tunnelScript = Join-Path $PSScriptRoot 'tunnel.mjs'

if ($Mode -eq 'Run') {
    if (-not $NodePath -or -not (Test-Path -LiteralPath $NodePath -PathType Leaf)) {
        throw 'The configured project Node executable is unavailable.'
    }
    $startInfo = [Diagnostics.ProcessStartInfo]::new()
    $startInfo.FileName = $NodePath
    $startInfo.Arguments = '"{0}" ensure' -f $tunnelScript
    $startInfo.WorkingDirectory = $projectPath
    $startInfo.UseShellExecute = $false
    $startInfo.CreateNoWindow = $true
    $process = [Diagnostics.Process]::Start($startInfo)
    try {
        $process.WaitForExit()
        exit $process.ExitCode
    }
    finally {
        $process.Dispose()
    }
}

$existing = Get-ScheduledTask -TaskName $taskName -TaskPath '\' -ErrorAction SilentlyContinue
if ($existing -and $existing.Description -ne $description) {
    throw 'A task with this name exists and is not owned by this project.'
}

if ($Mode -eq 'Uninstall') {
    if ($existing) {
        Unregister-ScheduledTask -TaskName $taskName -TaskPath '\' -Confirm:$false
    }
    Write-Output 'Automatic Tunnel startup and recovery removed; runtime and pairing retained.'
    exit 0
}

if ($Mode -eq 'Install') {
    if (-not (Test-Path -LiteralPath (Join-Path $projectPath '.local\tunnel.json'))) {
        throw 'Configure the host-local dedicated Tunnel before installing automatic startup.'
    }
    if (-not $NodePath) { $NodePath = (Get-Command node.exe -ErrorAction Stop).Source }
    $NodePath = (Resolve-Path -LiteralPath $NodePath).Path
    if ($NodePath.Contains('"') -or $PSCommandPath.Contains('"')) { throw 'Invalid executable or script path.' }
    $account = [Security.Principal.WindowsIdentity]::GetCurrent().Name
    $powerShellPath = Join-Path $env:WINDIR 'System32\WindowsPowerShell\v1.0\powershell.exe'
    $arguments = '-NoProfile -NonInteractive -WindowStyle Hidden -File "{0}" -Mode Run -NodePath "{1}"' -f $PSCommandPath, $NodePath
    $action = New-ScheduledTaskAction -Execute $powerShellPath -Argument $arguments -WorkingDirectory $projectPath
    $login = New-ScheduledTaskTrigger -AtLogOn -User $account
    # Omitting Duration creates an indefinite repetition pattern, including after reboot.
    $repeat = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) -RepetitionInterval (New-TimeSpan -Minutes 1)
    $settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -Hidden -MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Minutes 2)
    $principal = New-ScheduledTaskPrincipal -UserId $account -LogonType Interactive -RunLevel Limited
    Register-ScheduledTask -TaskName $taskName -TaskPath '\' -Description $description -Action $action -Trigger @($login, $repeat) -Settings $settings -Principal $principal -Force | Out-Null
    Start-ScheduledTask -TaskName $taskName -TaskPath '\'
    Write-Output 'Installed current-user login startup and a one-minute recovery check.'
}

$task = Get-ScheduledTask -TaskName $taskName -TaskPath '\' -ErrorAction SilentlyContinue
if (-not $task) {
    Write-Output 'Automatic Tunnel startup is not installed.'
    exit 0
}
$info = Get-ScheduledTaskInfo -InputObject $task
[pscustomobject]@{
    TaskName = $task.TaskName
    State = [string]$task.State
    User = $task.Principal.UserId
    LogonType = [string]$task.Principal.LogonType
    LastRunTime = $info.LastRunTime
    LastTaskResult = $info.LastTaskResult
    NextRunTime = $info.NextRunTime
    Paused = Test-Path -LiteralPath (Join-Path $projectPath '.local\tunnel-auto-paused')
} | ConvertTo-Json
