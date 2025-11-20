<#
.SYNOPSIS
    Start FastVideo adapter server for gemDirect1

.DESCRIPTION
    Activates the fastvideo virtual environment, sets required environment variables,
    and starts the Uvicorn server on port 8055 (configurable).

.PARAMETER Port
    Port to run the server on (default: 8055)

.PARAMETER Host
    Host to bind to (default: 127.0.0.1)

.PARAMETER DryRun
    Validate model availability without starting the server

.PARAMETER ModelId
    HuggingFace model ID (default: hao-ai-lab/FastHunyuan-diffusers)

.PARAMETER FastVideoHome
    Cache directory for models/datasets (default: $env:USERPROFILE\fastvideo)

.PARAMETER VenvPath
    Path to FastVideo virtual environment (default: C:\Dev\gemDirect1\fastvideo-env)

.EXAMPLE
    .\run-fastvideo-server.ps1
    Start server with defaults (port 8055, localhost)

.EXAMPLE
    .\run-fastvideo-server.ps1 -DryRun
    Validate model exists without starting server

.EXAMPLE
    .\run-fastvideo-server.ps1 -Port 8056 -Host 0.0.0.0
    Start on custom port, accessible from network
#>

param(
    [int]$Port = 8055,
    [string]$HostName = "127.0.0.1",
    [switch]$DryRun,
    [string]$ModelId = "hao-ai-lab/FastHunyuan-diffusers",
    [string]$FastVideoHome = "$env:USERPROFILE\fastvideo",
    [string]$VenvPath = "C:\Dev\gemDirect1\fastvideo-env"
)

$ErrorActionPreference = "Stop"

# --- Helper Functions ---
function Write-Header {
    param([string]$Text)
    Write-Host ""
    Write-Host "═══════════════════════════════════════════════════════" -ForegroundColor Cyan
    Write-Host "  $Text" -ForegroundColor Yellow
    Write-Host "═══════════════════════════════════════════════════════" -ForegroundColor Cyan
}

function Test-Venv {
    param([string]$VenvPath)
    
    $activateScript = Join-Path $VenvPath "Scripts\Activate.ps1"
    if (Test-Path $activateScript) {
        Write-Host "✓ Virtual environment found: $VenvPath" -ForegroundColor Green
        return $true
    } else {
        Write-Host "✗ Virtual environment not found: $VenvPath" -ForegroundColor Red
        Write-Host "  Run: python -m venv $VenvPath" -ForegroundColor Yellow
        return $false
    }
}

function Test-ModelCache {
    param([string]$ModelPath)
    
    $modelDir = Join-Path $FastVideoHome "models" $ModelId.Replace("/", "\")
    
    if (Test-Path $modelDir) {
        $files = Get-ChildItem -Path $modelDir -Recurse -File
        $totalSize = ($files | Measure-Object -Property Length -Sum).Sum / 1GB
        Write-Host "✓ Model cache found: $modelDir" -ForegroundColor Green
        Write-Host "  Size: $([math]::Round($totalSize, 2)) GB, Files: $($files.Count)" -ForegroundColor Gray
        return $true
    } else {
        Write-Host "✗ Model cache not found: $modelDir" -ForegroundColor Red
        Write-Host "  Run setup: huggingface-cli download $ModelId --local-dir <path>" -ForegroundColor Yellow
        return $false
    }
}

# --- Main Script ---
Write-Header "FastVideo Server Launcher"

# Check Node.js version (same req as main project)
$nodeVersion = node --version 2>$null
if ($nodeVersion) {
    $nodeMajor = [int]($nodeVersion -replace 'v(\d+)\..*', '$1')
    if ($nodeMajor -lt 22) {
        Write-Host "⚠ Warning: Node.js $nodeVersion detected. Project requires >=22.19.0" -ForegroundColor Yellow
    } else {
        Write-Host "✓ Node.js $nodeVersion" -ForegroundColor Green
    }
}

# Check virtual environment and activate it
Write-Host ""
Write-Host "Checking FastVideo virtual environment..." -ForegroundColor Cyan

if (-not (Test-Venv $VenvPath)) {
    Write-Host "✗ Virtual environment not found at: $VenvPath" -ForegroundColor Red
    Write-Host "  Run: python -m venv $VenvPath" -ForegroundColor Yellow
    exit 1
}

# Activate virtual environment
$activateScript = Join-Path $VenvPath "Scripts\Activate.ps1"
Write-Host "Activating virtual environment..." -ForegroundColor Cyan
& $activateScript

# Check Python and FastVideo installation (now in venv)
Write-Host ""
Write-Host "Checking Python environment (venv)..." -ForegroundColor Cyan

$pythonCmd = Get-Command python -ErrorAction SilentlyContinue
if ($pythonCmd) {
    $pythonVer = python --version 2>&1
    Write-Host "✓ $pythonVer" -ForegroundColor Green
    
    # Test FastVideo import (warnings are OK, just check exit code)
    $testOutput = python -c "import fastvideo; import torch; print('OK')" 2>&1
    if ($testOutput -match "OK" -and $LASTEXITCODE -eq 0) {
        Write-Host "✓ FastVideo library available" -ForegroundColor Green
        
        # Check CUDA separately
        $cudaTest = python -c "import torch; print(torch.cuda.is_available())" 2>&1 | Select-Object -Last 1
        if ($cudaTest -match "True") {
            Write-Host "✓ CUDA available" -ForegroundColor Green
        } else {
            Write-Host "⚠ CUDA not available - video generation will be slow" -ForegroundColor Yellow
        }
    } else {
        Write-Host "✗ FastVideo not installed in venv" -ForegroundColor Red
        Write-Host "  Run: pip install fastvideo" -ForegroundColor Yellow
        exit 1
    }
} else {
    Write-Host "✗ Python not found in venv" -ForegroundColor Red
    exit 1
}

Write-Host ""
# Original conda check removed - now using venv
<# Removed - using venv instead of conda
Write-Host ""
Write-Host "Checking conda environment 'fastvideo'..." -ForegroundColor Cyan
if (-not (Test-CondaEnv "fastvideo")) {
    Write-Host "✗ Conda environment 'fastvideo' not found" -ForegroundColor Red
    Write-Host ""
    Write-Host "Create environment with:" -ForegroundColor Yellow
    Write-Host "  conda create -n fastvideo python=3.12 -y" -ForegroundColor Gray
    Write-Host "  conda activate fastvideo" -ForegroundColor Gray
    Write-Host "  pip install torch==2.3.1 torchvision==0.18.1 --index-url https://download.pytorch.org/whl/cu121" -ForegroundColor Gray
    Write-Host "  pip install fastvideo fastapi uvicorn[standard] huggingface_hub pillow" -ForegroundColor Gray
    exit 1
}
Write-Host "✓ Conda environment 'fastvideo' exists" -ForegroundColor Green
#>

# Validate model cache
Write-Host ""
Write-Host "Checking model cache..." -ForegroundColor Cyan
$modelExists = Test-ModelCache
if (-not $modelExists -and -not $DryRun) {
    Write-Host ""
    Write-Host "⚠ Model not cached - will download from HuggingFace on first use (~8GB)" -ForegroundColor Yellow
    Write-Host "  This is normal for first-time setup. Download takes 5-10 minutes." -ForegroundColor Gray
    Write-Host "  Continuing automatically..." -ForegroundColor Green
}

# Set environment variables
Write-Host ""
Write-Host "Setting environment variables..." -ForegroundColor Cyan
$env:FASTVIDEO_MODEL_ID = $ModelId
$env:FASTVIDEO_HOME = $FastVideoHome
$env:FASTVIDEO_ATTENTION_BACKEND = "sdpa"
$env:FASTVIDEO_PORT = $Port
$env:FASTVIDEO_HOST = $HostName

Write-Host "  FASTVIDEO_MODEL_ID: $ModelId" -ForegroundColor Gray
Write-Host "  FASTVIDEO_HOME: $FastVideoHome" -ForegroundColor Gray
Write-Host "  FASTVIDEO_ATTENTION_BACKEND: sdpa" -ForegroundColor Gray
Write-Host "  FASTVIDEO_PORT: $Port" -ForegroundColor Gray
Write-Host "  FASTVIDEO_HOST: $HostName" -ForegroundColor Gray

# Dry run mode
if ($DryRun) {
    Write-Header "Dry Run Complete"
    Write-Host "Environment: ✓" -ForegroundColor Green
    Write-Host "Model Cache: $(if ($modelExists) { '✓' } else { '✗' })" -ForegroundColor $(if ($modelExists) { 'Green' } else { 'Red' })
    Write-Host "Config: ✓" -ForegroundColor Green
    Write-Host ""
    Write-Host "Run without -DryRun to start server" -ForegroundColor Yellow
    exit 0
}

# Start server
Write-Header "Starting FastVideo Server"
Write-Host "Endpoint: http://${HostName}:${Port}" -ForegroundColor Green
Write-Host "Health: http://${HostName}:${Port}/health" -ForegroundColor Green
Write-Host "Docs: http://${HostName}:${Port}/docs" -ForegroundColor Green
Write-Host ""
Write-Host "Press Ctrl+C to stop" -ForegroundColor Yellow
Write-Host ""

$serverScript = Join-Path $PSScriptRoot "fastvideo" "fastvideo_server.py"

if (-not (Test-Path $serverScript)) {
    Write-Host "✗ Server script not found: $serverScript" -ForegroundColor Red
    exit 1
}

try {
    # Virtual environment already activated earlier, just run server
    & python $serverScript
} catch {
    Write-Host ""
    Write-Host "✗ Server crashed: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host $_.ScriptStackTrace -ForegroundColor Gray
    exit 1
}
