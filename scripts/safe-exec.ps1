#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Process-safe command runner for AI agents
    
.DESCRIPTION
    Ensures commands cannot accidentally kill background processes (ComfyUI, Dev Server, etc)
    by enforcing isolated execution and blocking dangerous patterns.
    
.PARAMETER ScriptBlock
    PowerShell code to execute safely
    
.PARAMETER AllowedDangerousOps
    Set to $true only if you explicitly need Stop-Process (very rare)
#>

param(
    [Parameter(Mandatory = $true)]
    [scriptblock] $ScriptBlock,
    
    [bool] $AllowedDangerousOps = $false
)

$ErrorActionPreference = 'Stop'

# Detect dangerous patterns in the script
$scriptText = $ScriptBlock.ToString()
$dangerousPatterns = @(
    'Stop-Process',
    'Kill.*Process',
    'terminate',
    'Remove-Process'
)

foreach ($pattern in $dangerousPatterns) {
    if ($scriptText -imatch $pattern) {
        if (-not $AllowedDangerousOps) {
            throw @"
⚠️  BLOCKED: Script contains dangerous operation: '$pattern'
   This could terminate background processes like ComfyUI!
   
   If you absolutely need this, use:
   & 'C:\Dev\gemDirect1\scripts\safe-terminal.ps1' -Command 'your command' -AllowedDangerousOps `$true
   
   Script text:
   $scriptText
"@
        }
    }
}

# Execute in isolated session via temp file (PS5.1+ compatible)
$tempScript = [System.IO.Path]::Combine([System.IO.Path]::GetTempPath(), "agent-safe-$([guid]::NewGuid()).ps1")
try {
    # Convert script block to string and write to temp file
    $scriptText | Set-Content -Path $tempScript -Encoding UTF8 -Force
    
    # Run in completely isolated PowerShell process
    $result = & pwsh -NoLogo -ExecutionPolicy Bypass -File $tempScript 2>&1
    
    $exitCode = $LASTEXITCODE
    if ($result) {
        $result
    }
    
    return $exitCode
} finally {
    if (Test-Path $tempScript) {
        Remove-Item $tempScript -Force -ErrorAction SilentlyContinue
    }
}
