#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Persistent E2E Testing Framework - Reuses ComfyUI across multiple test runs
    
.DESCRIPTION
    - Starts ComfyUI once and keeps it running for the entire test session
    - Uses safe-terminal wrapper to prevent accidental termination
    - Cleans ComfyUI output between runs without restarting server
    - Dramatically reduces test execution time (eliminates 15-20s startup per run)
    
.PARAMETER Action
    'start' - Start persistent ComfyUI and testing session
    'run'   - Execute single E2E test (requires 'start' first)
    'stop'  - Stop persistent ComfyUI and clean up
    'status'- Check if ComfyUI is running
    
.EXAMPLE
    # Start persistent session
    .\persistent-e2e.ps1 -Action start
    
    # Run multiple tests (ComfyUI stays running)
    .\persistent-e2e.ps1 -Action run -MaxWaitSeconds 180
    .\persistent-e2e.ps1 -Action run -MaxWaitSeconds 180
    
    # Stop when done
    .\persistent-e2e.ps1 -Action stop
#>

param(
    [Parameter(Mandatory = $true)]
    [ValidateSet('start', 'run', 'stop', 'status')]
    [string] $Action,
    
    [int] $MaxWaitSeconds = 180,
    [int] $HistoryMaxAttempts = 1,
    [int] $HistoryPollInterval = 2,
    [int] $PostExecutionTimeout = 30
)

$ErrorActionPreference = 'Stop'
$ComfyStatusFile = "C:\Dev\gemDirect1\.comfyui-session.lock"
$ComfyLogFile = "C:\Dev\gemDirect1\logs\persistent-comfyui.log"

function Test-ComfyUIRunning {
    try {
        $null = Invoke-RestMethod -Uri "http://127.0.0.1:8188/system_stats" -TimeoutSec 2 -ErrorAction Stop
        return $true
    } catch {
        return $false
    }
}

function Start-PersistentSession {
    Write-Host "╔════════════════════════════════════════════════════╗" -ForegroundColor Cyan
    Write-Host "║      Starting Persistent E2E Test Session           ║" -ForegroundColor Cyan
    Write-Host "╚════════════════════════════════════════════════════╝" -ForegroundColor Cyan
    
    # Check if ComfyUI already running
    if (Test-ComfyUIRunning) {
        Write-Host "✓ ComfyUI already running - reusing instance" -ForegroundColor Green
        Set-Content -Path $ComfyStatusFile -Value "active:$(Get-Date -Format 'o')" -Force
        return
    }
    
    Write-Host "Starting ComfyUI server in background..." -ForegroundColor Yellow
    
    # Create log directory
    $logDir = Split-Path $ComfyLogFile
    if (-not (Test-Path $logDir)) {
        New-Item -ItemType Directory -Path $logDir -Force | Out-Null
    }
    
    # Start ComfyUI via VS Code task (which handles background execution properly)
    try {
        $taskName = "Start ComfyUI Server"
        Write-Host "  Triggering VS Code task: $taskName"
        
        # Use a separate PowerShell process to avoid interfering with current session
        $startScript = {
            cd "C:\Dev\gemDirect1"
            & pwsh -NoLogo -ExecutionPolicy Bypass -Command {
                cd 'C:\ComfyUI\ComfyUI_windows_portable'
                $env:PYTHONIOENCODING = 'utf-8'
                $env:PYTHONLEGACYWINDOWSSTDIO = '0'
                .\python_embeded\python.exe -s ComfyUI\main.py --windows-standalone-build --listen 0.0.0.0 --port 8188 --enable-cors-header '*' 2>&1 | Out-File -FilePath $using:ComfyLogFile -Append
            }
        }
        
        Start-Job -ScriptBlock $startScript -Name "ComfyUI-Persistent" | Out-Null
        
        # Wait for ComfyUI to be ready
        Write-Host "Waiting for ComfyUI to start..." -ForegroundColor Gray
        $maxWaitTime = 60
        $elapsed = 0
        
        while ($elapsed -lt $maxWaitTime) {
            if (Test-ComfyUIRunning) {
                Write-Host "✓ ComfyUI is ready!" -ForegroundColor Green
                Set-Content -Path $ComfyStatusFile -Value "active:$(Get-Date -Format 'o')" -Force
                Write-Host "  Instance will remain active for subsequent test runs" -ForegroundColor Cyan
                return
            }
            Write-Host "." -NoNewline
            Start-Sleep -Seconds 1
            $elapsed++
        }
        
        throw "ComfyUI failed to start within $maxWaitTime seconds"
    } catch {
        Write-Host "✗ Failed to start ComfyUI: $_" -ForegroundColor Red
        throw
    }
}

function Invoke-SingleETest {
    Write-Host "`n╔════════════════════════════════════════════════════╗" -ForegroundColor Cyan
    Write-Host "║         Running Single E2E Test                      ║" -ForegroundColor Cyan
    Write-Host "╚════════════════════════════════════════════════════╝" -ForegroundColor Cyan
    
    # Verify ComfyUI is running
    if (-not (Test-ComfyUIRunning)) {
        Write-Host "✗ ComfyUI is not running. Start session first with: persistent-e2e.ps1 -Action start" -ForegroundColor Red
        exit 1
    }
    
    Write-Host "ComfyUI Status: ✓ Running" -ForegroundColor Green
    Write-Host "  Max Wait: $MaxWaitSeconds seconds" -ForegroundColor Gray
    Write-Host "  Polling Interval: $HistoryPollInterval seconds" -ForegroundColor Gray
    
    # Clean output directories between runs (but DON'T restart ComfyUI)
    Write-Host "Cleaning previous output files..." -ForegroundColor Yellow
    $outputDirs = @(
        'C:\ComfyUI\ComfyUI_windows_portable\ComfyUI\outputs',
        'C:\ComfyUI\ComfyUI_windows_portable\ComfyUI\output'
    )
    
    foreach ($dir in $outputDirs) {
        if (Test-Path $dir) {
            Get-ChildItem -Path $dir -Filter "*.png" -File -ErrorAction SilentlyContinue | Remove-Item -Force -ErrorAction SilentlyContinue
        }
    }
    
    # Run the actual E2E test
    Write-Host "`nExecuting test..." -ForegroundColor Cyan
    
    & .\scripts\run-comfyui-e2e.ps1 `
        -SceneMaxWaitSeconds $MaxWaitSeconds `
        -SceneHistoryMaxAttempts $HistoryMaxAttempts `
        -SceneHistoryPollIntervalSeconds $HistoryPollInterval `
        -ScenePostExecutionTimeoutSeconds $PostExecutionTimeout
    
    $exitCode = $LASTEXITCODE
    
    if ($exitCode -eq 0) {
        Write-Host "`n✓ Test completed successfully" -ForegroundColor Green
    } else {
        Write-Host "`n✗ Test failed with exit code: $exitCode" -ForegroundColor Red
    }
    
    return $exitCode
}

function Stop-PersistentSession {
    Write-Host "`n╔════════════════════════════════════════════════════╗" -ForegroundColor Cyan
    Write-Host "║      Stopping Persistent Test Session               ║" -ForegroundColor Cyan
    Write-Host "╚════════════════════════════════════════════════════╝" -ForegroundColor Cyan
    
    # Stop ComfyUI background jobs
    $comfyJobs = Get-Job -Name "ComfyUI-Persistent" -ErrorAction SilentlyContinue
    if ($comfyJobs) {
        Write-Host "Stopping ComfyUI background jobs..." -ForegroundColor Yellow
        $comfyJobs | Stop-Job -PassThru | Remove-Job
        Write-Host "✓ ComfyUI stopped" -ForegroundColor Green
    }
    
    # Clean up lock file
    if (Test-Path $ComfyStatusFile) {
        Remove-Item -Path $ComfyStatusFile -Force -ErrorAction SilentlyContinue
    }
    
    Write-Host "✓ Session cleanup complete" -ForegroundColor Green
}

function Get-SessionStatus {
    Write-Host "`nPersistent E2E Test Session Status:" -ForegroundColor Cyan
    Write-Host "────────────────────────────────────" -ForegroundColor Cyan
    
    if (Test-Path $ComfyStatusFile) {
        $status = Get-Content $ComfyStatusFile
        Write-Host "  Status File: ✓ Found" -ForegroundColor Green
        Write-Host "  Content: $status" -ForegroundColor Gray
    } else {
        Write-Host "  Status File: ✗ Not found (no active session)" -ForegroundColor Yellow
    }
    
    if (Test-ComfyUIRunning) {
        Write-Host "  ComfyUI Server: ✓ Running on port 8188" -ForegroundColor Green
        $stats = Invoke-RestMethod -Uri "http://127.0.0.1:8188/system_stats" -TimeoutSec 2
        Write-Host "    Version: $($stats.system.comfyui_version)" -ForegroundColor Gray
        Write-Host "    VRAM Free: $([math]::Round($stats.devices[0].vram_free / 1GB, 1)) GB" -ForegroundColor Gray
    } else {
        Write-Host "  ComfyUI Server: ✗ Not running" -ForegroundColor Red
    }
    
    $logFile = $ComfyLogFile
    if (Test-Path $logFile) {
        $lines = @(Get-Content $logFile -ErrorAction SilentlyContinue)
        Write-Host "  Log File: ✓ $($lines.Count) lines" -ForegroundColor Green
    }
}

# Execute requested action
switch ($Action) {
    'start' {
        Start-PersistentSession
    }
    'run' {
        Invoke-SingleETest
    }
    'stop' {
        Stop-PersistentSession
    }
    'status' {
        Get-SessionStatus
    }
}
