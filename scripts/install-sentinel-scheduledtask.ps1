param(
    [ValidateSet('install','uninstall')]
    [string] $Action = 'install',
    [string] $ScriptPath = "$PSScriptRoot\generate-done-markers.ps1",
    [string] $TaskName = 'GemDirect-DoneSentinel',
    [string] $RunAsUser = "$env:USERNAME"
)

<#
This helper registers/unregisters a Windows Scheduled Task that runs the
done-marker sentinel at logon (or on demand). It does NOT run the task as a
service — using Scheduled Tasks is a pragmatic way to ensure the sentinel
starts after reboot/login without requiring a Windows Service wrapper.

Usage examples:
  # Install (register) scheduled task for current user
  pwsh ./scripts/install-sentinel-scheduledtask.ps1 -Action install -ScriptPath 'C:\Dev\gemDirect1\scripts\generate-done-markers.ps1'

  # Uninstall
  pwsh ./scripts/install-sentinel-scheduledtask.ps1 -Action uninstall

Notes:
- Registering a system-level task may require elevated privileges. The
  default registers a per-user task at logon which does not require admin
  rights but will only run when the user logs in.
#>

function Install-Task {
    param($Name, $Script)

    if (-not (Test-Path $Script)) {
        Write-Host "Script not found: $Script" -ForegroundColor Yellow
        return 1
    }

    $action = New-ScheduledTaskAction -Execute 'pwsh.exe' -Argument "-NoLogo -ExecutionPolicy Bypass -File `"$Script`" -RunContinuous"
    $trigger = New-ScheduledTaskTrigger -AtLogOn
    $principal = New-ScheduledTaskPrincipal -UserId $RunAsUser -LogonType Interactive
    try {
        Register-ScheduledTask -TaskName $Name -Action $action -Trigger $trigger -Principal $principal -Force
        Write-Host "Registered scheduled task '$Name' for script: $Script"
        return 0
    } catch {
        Write-Host "Failed to register scheduled task: $($_.Exception.Message)" -ForegroundColor Red
        return 2
    }
}

function Uninstall-Task {
    param($Name)
    try {
        Unregister-ScheduledTask -TaskName $Name -Confirm:
        Write-Host "Unregistered scheduled task '$Name'"
        return 0
    } catch {
        Write-Host "Failed to unregister scheduled task: $($_.Exception.Message)" -ForegroundColor Yellow
        return 1
    }
}

if ($Action -eq 'install') {
    exit (Install-Task -Name $TaskName -Script $ScriptPath)
} else {
    exit (Uninstall-Task -Name $TaskName)
}
