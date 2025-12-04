<#
.SYNOPSIS
    Check if a server is already running on a specified port.
    Use this BEFORE attempting to start any server.

.DESCRIPTION
    This script checks if a TCP port is in use and reports:
    - Whether a server is running
    - The process using the port (if any)
    - A recommendation for what to do

    Agents MUST run this before starting servers to avoid:
    - Duplicate server instances
    - Port conflicts
    - Wasted resources

.PARAMETER Port
    The port number to check. Default is 3000 (dev server).

.PARAMETER ServerName
    Optional friendly name for the server (for display purposes).

.EXAMPLE
    pwsh -File scripts/check-server-running.ps1 -Port 3000
    
.EXAMPLE
    pwsh -File scripts/check-server-running.ps1 -Port 8188 -ServerName "ComfyUI"
    
.EXAMPLE
    pwsh -File scripts/check-server-running.ps1 -Port 8055 -ServerName "FastVideo"
#>

param(
    [int]$Port = 3000,
    [string]$ServerName = ""
)

# Map common ports to server names
$knownPorts = @{
    3000 = "Dev Server (Vite)"
    8188 = "ComfyUI"
    8055 = "FastVideo"
    1234 = "LM Studio"
}

if (-not $ServerName -and $knownPorts.ContainsKey($Port)) {
    $ServerName = $knownPorts[$Port]
}

if (-not $ServerName) {
    $ServerName = "Unknown Server"
}

Write-Host ""
Write-Host "Checking port $Port ($ServerName)..." -ForegroundColor Cyan

# Check if port is in use
$connection = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue

if ($connection) {
    $process = Get-Process -Id $connection.OwningProcess -ErrorAction SilentlyContinue
    
    Write-Host ""
    Write-Host "========================================" -ForegroundColor Green
    Write-Host "  SERVER IS RUNNING" -ForegroundColor Green
    Write-Host "========================================" -ForegroundColor Green
    Write-Host ""
    Write-Host "  Port: $Port" -ForegroundColor White
    Write-Host "  Server: $ServerName" -ForegroundColor White
    if ($process) {
        Write-Host "  Process: $($process.ProcessName) (PID: $($process.Id))" -ForegroundColor White
    }
    Write-Host ""
    Write-Host "  RECOMMENDATION: Do NOT start another instance." -ForegroundColor Yellow
    Write-Host "  The server is already available at http://localhost:$Port" -ForegroundColor Yellow
    Write-Host ""
    
    # Exit with code 0 to indicate server IS running
    exit 0
} else {
    Write-Host ""
    Write-Host "========================================" -ForegroundColor Yellow
    Write-Host "  SERVER NOT RUNNING" -ForegroundColor Yellow
    Write-Host "========================================" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "  Port: $Port" -ForegroundColor White
    Write-Host "  Server: $ServerName" -ForegroundColor White
    Write-Host ""
    Write-Host "  RECOMMENDATION: Start the server using a VS Code task." -ForegroundColor Cyan
    
    # Provide task recommendations
    switch ($Port) {
        3000 { Write-Host "  Task: 'Dev Server'" -ForegroundColor Cyan }
        8188 { Write-Host "  Task: 'Start ComfyUI Server (Patched - Recommended)'" -ForegroundColor Cyan }
        8055 { Write-Host "  Task: 'Start FastVideo Server'" -ForegroundColor Cyan }
        default { Write-Host "  Use the appropriate VS Code task for this server." -ForegroundColor Cyan }
    }
    Write-Host ""
    
    # Exit with code 1 to indicate server is NOT running
    exit 1
}
