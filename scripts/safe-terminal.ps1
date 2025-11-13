#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Safe terminal execution wrapper that prevents accidental termination of background processes
    
.DESCRIPTION
    This script provides isolated command execution to prevent interference with background tasks
    like the ComfyUI server. All commands run in separate PowerShell processes.
    
.PARAMETER Command
    The command to execute in an isolated session
    
.PARAMETER WorkingDirectory
    Optional working directory for the command
    
.EXAMPLE
    & .\scripts\safe-terminal.ps1 -Command 'Get-Process comfyui'
    & .\scripts\safe-terminal.ps1 -Command 'npm run test' -WorkingDirectory 'C:\Dev\gemDirect1'
#>

param(
    [Parameter(Mandatory = $true)]
    [string] $Command,
    
    [string] $WorkingDirectory = (Get-Location).Path
)

$ErrorActionPreference = 'Stop'

# Create isolated execution script (compatible with PS5.1 and PS7)
$tempScript = [System.IO.Path]::Combine([System.IO.Path]::GetTempPath(), "agent-safe-$([guid]::NewGuid()).ps1")
try {
    $scriptContent = @"
Set-Location '$WorkingDirectory'
`$ErrorActionPreference = 'Stop'
try {
    $Command
} catch {
    Write-Error `$_.Exception.Message
    exit 1
}
"@
    
    $scriptContent | Set-Content -Path $tempScript -Encoding UTF8 -Force
    
    # Execute in isolated process - this prevents interference with background tasks
    & pwsh -NoLogo -ExecutionPolicy Bypass -File $tempScript
    
    $exitCode = $LASTEXITCODE
    if ($exitCode -ne 0 -and $exitCode -ne $null) {
        exit $exitCode
    }
} finally {
    # Clean up temp file
    if (Test-Path $tempScript) {
        Remove-Item $tempScript -Force -ErrorAction SilentlyContinue
    }
}
