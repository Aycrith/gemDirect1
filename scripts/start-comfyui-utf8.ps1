#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Start ComfyUI with UTF-8 encoding enabled to prevent Windows console encoding errors.

.DESCRIPTION
    This script ensures ComfyUI starts with proper UTF-8 console encoding on Windows.
    Without this, tqdm progress bars in KSampler will fail with UnicodeEncodeError.

.PARAMETER Port
    TCP port for ComfyUI server. Default: 8188

.PARAMETER ListenAddress
    IP address to listen on. Default: 0.0.0.0

.PARAMETER EnableCors
    Enable CORS headers for all origins. Default: true

.EXAMPLE
    # Start ComfyUI with UTF-8 encoding
    .\scripts\start-comfyui-utf8.ps1

    # Start on custom port
    .\scripts\start-comfyui-utf8.ps1 -Port 9999

.NOTES
    CRITICAL: This script applies Windows-specific encoding fixes that are essential
    for proper ComfyUI operation on Windows systems.
    
    Environment Variables Set:
    - PYTHONIOENCODING=utf-8 (forces UTF-8 for stdin/stdout/stderr)
    - PYTHONLEGACYWINDOWSSTDIO=0 (enables native Windows UTF-8 support)
#>

param(
    [int] $Port = 8188,
    [string] $ListenAddress = '0.0.0.0',
    [switch] $EnableCors = $true,
    [switch] $WindowsStandalone = $true
)

# ============================================================================
# CRITICAL: UTF-8 Encoding Fix for Windows
# ============================================================================
# On Windows, Python defaults to cp1252 encoding which cannot render Unicode
# characters used by tqdm progress bars. This causes KSampler to fail with:
#   UnicodeEncodeError: 'charmap' codec can't encode character '\u258e'
# 
# Setting these variables forces UTF-8 encoding at the Python I/O level,
# allowing tqdm to render progress correctly.
# ============================================================================

Write-Host ""
Write-Host "╔════════════════════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║  ComfyUI Server Startup (UTF-8 Encoding Enabled)          ║" -ForegroundColor Cyan
Write-Host "╚════════════════════════════════════════════════════════════╝" -ForegroundColor Cyan
Write-Host ""

# Detect platform
if ($PSVersionTable.Platform -eq 'Unix') {
    Write-Host "ℹ️  Unix/Linux detected - UTF-8 is native, no special configuration needed"
    Write-Host ""
} else {
    Write-Host "🪟 Windows detected - Applying UTF-8 encoding fix..."
    Write-Host ""
    
    # Set UTF-8 encoding globally
    $env:PYTHONIOENCODING = 'utf-8'
    $env:PYTHONLEGACYWINDOWSSTDIO = '0'
    
    Write-Host "  ✓ PYTHONIOENCODING = $env:PYTHONIOENCODING"
    Write-Host "  ✓ PYTHONLEGACYWINDOWSSTDIO = $env:PYTHONLEGACYWINDOWSSTDIO"
    Write-Host ""
}

# Verify environment
$ComfyBase = 'C:\ComfyUI\ComfyUI_windows_portable'
$ComfyPython = Join-Path $ComfyBase 'python_embeded\python.exe'
$ComfyMain = Join-Path $ComfyBase 'ComfyUI\main.py'

if (-not (Test-Path $ComfyPython)) {
    Write-Error "ComfyUI Python not found at $ComfyPython"
    exit 1
}

if (-not (Test-Path $ComfyMain)) {
    Write-Error "ComfyUI main script not found at $ComfyMain"
    exit 1
}

Write-Host "Configuration:" -ForegroundColor Cyan
Write-Host "  Port: $Port"
Write-Host "  Listen: $ListenAddress"
Write-Host "  CORS: $(if ($EnableCors) { 'Enabled' } else { 'Disabled' })"
Write-Host "  Standalone: $(if ($WindowsStandalone) { 'Yes' } else { 'No' })"
Write-Host ""
Write-Host "Starting ComfyUI..." -ForegroundColor Green
Write-Host ""

# Build arguments
$Arguments = @('-s', $ComfyMain)

if ($WindowsStandalone) {
    $Arguments += '--windows-standalone-build'
}

$Arguments += @(
    '--listen', $ListenAddress,
    '--port', $Port.ToString()
)

if ($EnableCors) {
    $Arguments += @('--enable-cors-header', '*')
}

# Start ComfyUI
try {
    & $ComfyPython $Arguments
} catch {
    Write-Error "Failed to start ComfyUI: $_"
    exit 1
}
