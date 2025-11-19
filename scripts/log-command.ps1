param(
    [Parameter(Mandatory=$true)]
    [string]$Command,

    [Parameter(Mandatory=$true)]
    [string]$Reason,

    [string]$Timestamp
)

$repoRoot = Split-Path -Parent $PSScriptRoot
$logsDir = Join-Path $repoRoot 'logs'
if (-not (Test-Path $logsDir)) {
    New-Item -ItemType Directory -Path $logsDir | Out-Null
}

if (-not $Timestamp) {
    $Timestamp = Get-Date -Format 'yyyyMMdd-HHmmss'
}

$logPath = Join-Path $logsDir "command-log-testing-$Timestamp.log"
$entry = "$(Get-Date -Format o), testing-agent, $(Get-Location), $Command, $Reason"
Add-Content -Path $logPath -Value $entry

Write-Output $Timestamp
