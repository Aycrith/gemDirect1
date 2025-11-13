<#
.SYNOPSIS
Guidance / scaffold for installing the done-marker sentinel as a Windows Service.

NOTES
- Converting the sentinel to a Windows Service requires elevated privileges and should be done with care.
- The preferred lightweight approach is the existing Scheduled Task helper (`scripts/install-sentinel-scheduledtask.ps1`).
- This scaffold prints safe, copy-paste commands using NSSM (Non-Sucking Service Manager) which is a common, supported way to wrap scripts/binaries as Windows services.

USAGE (example)
  # Print recommended steps (no changes made)
  pwsh -NoLogo -ExecutionPolicy Bypass -File .\scripts\install-sentinel-service.ps1

  # If you want to proceed and have NSSM installed, run the NSSM command shown as Administrator.
#>

[CmdletBinding()]
param(
    [switch] $VerboseOutput
)

function Is-Admin { 
    $current = [Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = New-Object Security.Principal.WindowsPrincipal($current)
    return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

if (-not (Is-Admin)) {
    Write-Warning "This script only prints guidance. To actually install a Service you'll need to run the specific installer commands as Administrator."
}

$repoRoot = Split-Path -Parent $PSScriptRoot
$sentinelScript = Join-Path $repoRoot 'scripts\generate-done-markers.ps1'
$serviceName = 'gemDirect1-Sentinel'

Write-Host "Windows Service scaffold for sentinel"
Write-Host "Repository sentinel script: $sentinelScript"
Write-Host "Recommended service name: $serviceName"

Write-Host "`nOption A — Use NSSM (recommended):"
Write-Host "  1) Download NSSM from https://nssm.cc/download and place nssm.exe on PATH or in a known folder."
Write-Host "  2) As Administrator, run a command similar to the following (adjust paths):"
Write-Host ""
Write-Host "    nssm install $serviceName C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe -NoExit -NoLogo -ExecutionPolicy Bypass -File \"$sentinelScript\""
Write-Host ""
Write-Host "  3) Configure the 'Application' and 'I/O' tabs in NSSM if you want different working directories or logging. Then start the service:"
Write-Host ""
Write-Host "    nssm start $serviceName"

Write-Host "`nOption B — Use sc.exe to create a service (less flexible for scripts):"
Write-Host "  sc create $serviceName binPath= \"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe -NoLogo -ExecutionPolicy Bypass -File '$sentinelScript'\" start= auto"
Write-Host "  sc start $serviceName"

Write-Host "`nNotes:
- NSSM is resilient and lets you capture stdout/stderr to files, control restart behavior, and set working dir.
- sc.exe can be used for simple wrappers but doesn't provide stdout capture or restart policies out of the box for scripts.
- Installing a system-level service requires Administrator privileges; consider using the existing scheduled task helper if you do not have admin rights."

if ($VerboseOutput) {
    Write-Host "`nVerbose: environment info"
    Write-Host "User: $([Environment]::UserName)"
    Write-Host "Machine: $([Environment]::MachineName)"
}
