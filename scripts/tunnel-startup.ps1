[CmdletBinding()]
param(
    [ValidateSet('Install', 'Status', 'Uninstall', 'Run', 'Shortcut')]
    [string]$Mode = 'Status',
    [string]$NodePath
)

$ErrorActionPreference = 'Stop'
$taskName = 'Obsidian Context MCP Tunnel'
$description = 'Obsidian Context MCP current-user login startup.'
$ownedDescriptions = @($description, 'Obsidian Context MCP dedicated Tunnel supervisor.')
$projectPath = Split-Path -Parent $PSScriptRoot
$tunnelScript = Join-Path $PSScriptRoot 'tunnel.mjs'

if ($Mode -eq 'Run') {
    if (-not $NodePath) {
        $cmd = Get-Command node.exe -ErrorAction SilentlyContinue
        $NodePath = if ($cmd) { $cmd.Source } else { Join-Path $env:USERPROFILE 'scoop\apps\nodejs-lts\current\node.exe' }
    }
    if (-not $NodePath -or -not (Test-Path -LiteralPath $NodePath -PathType Leaf)) {
        throw 'The configured project Node executable is unavailable.'
    }
    $startInfo = [Diagnostics.ProcessStartInfo]::new()
    $startInfo.FileName = $NodePath
    $startInfo.Arguments = '"{0}" start' -f $tunnelScript
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
if ($existing -and $existing.Description -notin $ownedDescriptions) {
    throw 'A task with this name exists and is not owned by this project.'
}

if ($Mode -eq 'Uninstall') {
    if ($existing) {
        Unregister-ScheduledTask -TaskName $taskName -TaskPath '\' -Confirm:$false
    }
    Write-Output 'Login startup removed; runtime, pairing and desktop shortcut retained.'
    exit 0
}

if ($Mode -in @('Install', 'Shortcut')) {
    if (-not (Test-Path -LiteralPath (Join-Path $projectPath '.local\tunnel.json'))) {
        throw 'Configure the host-local dedicated Tunnel before installing automatic startup.'
    }
    if (-not $NodePath) { $NodePath = (Get-Command node.exe -ErrorAction Stop).Source }
    $NodePath = (Resolve-Path -LiteralPath $NodePath).Path
    if ($NodePath.Contains('"') -or $PSCommandPath.Contains('"')) { throw 'Invalid executable or script path.' }
    $account = [Security.Principal.WindowsIdentity]::GetCurrent().Name
    $powerShellPath = Join-Path $env:WINDIR 'System32\WindowsPowerShell\v1.0\powershell.exe'
    $arguments = '-NoProfile -NonInteractive -WindowStyle Hidden -File "{0}" -Mode Run -NodePath "{1}"' -f $PSCommandPath, $NodePath
}

if ($Mode -eq 'Shortcut') {
    $desktopPath = [Environment]::GetFolderPath('Desktop')
    $shortcutPath = Join-Path $desktopPath 'Obsidian MCP.lnk'
    $shell = New-Object -ComObject WScript.Shell
    $shortcut = $shell.CreateShortcut($shortcutPath)
    if ((Test-Path -LiteralPath $shortcutPath) -and ($shortcut.TargetPath -ne $powerShellPath -or -not $shortcut.Arguments.Contains($PSCommandPath))) {
        throw 'An unrelated desktop shortcut already uses this name.'
    }
    $shortcut.TargetPath = $powerShellPath
    $shortcut.Arguments = $arguments
    $shortcut.WorkingDirectory = $projectPath
    $shortcut.Description = 'Start the Windows Obsidian MCP Tunnel.'
    $shortcut.WindowStyle = 7
    $obsidian = Get-Process -Name Obsidian -ErrorAction SilentlyContinue | Select-Object -First 1
    $shortcut.IconLocation = if ($obsidian -and $obsidian.Path) { $obsidian.Path + ',0' } else { $powerShellPath + ',0' }
    $shortcut.Save()
    Write-Output ('Desktop shortcut created: {0}' -f $shortcutPath)
    exit 0
}

if ($Mode -eq 'Install') {
    $action = New-ScheduledTaskAction -Execute $powerShellPath -Argument $arguments -WorkingDirectory $projectPath
    $login = New-ScheduledTaskTrigger -AtLogOn -User $account
    $settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -Hidden -MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Minutes 2)
    $principal = New-ScheduledTaskPrincipal -UserId $account -LogonType Interactive -RunLevel Limited
    Register-ScheduledTask -TaskName $taskName -TaskPath '\' -Description $description -Action $action -Trigger $login -Settings $settings -Principal $principal -Force | Out-Null
    Start-ScheduledTask -TaskName $taskName -TaskPath '\'
    Write-Output 'Installed current-user login startup only; no periodic checks.'
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
    TriggerCount = @($task.Triggers).Count
    PeriodicChecks = @($task.Triggers | Where-Object { $_.Repetition.Interval }).Count -gt 0
} | ConvertTo-Json
