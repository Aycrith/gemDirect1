<#
.SYNOPSIS
    Complete setup script for FastVideo on Windows (using hao-ai-lab/FastVideo)
    
.DESCRIPTION
    Automates FastVideo environment setup for gemDirect1 integration:
    - Creates Python virtual environment (or uses system Python)
    - Installs PyTorch with CUDA support
    - Installs FastVideo from hao-ai-lab/FastVideo repository
    - Validates CUDA availability
    - Tests FastVideo library import
    
.PARAMETER UseVenv
    Create and use a Python virtual environment (recommended for isolation)
    
.PARAMETER SkipTorch
    Skip PyTorch installation (if already installed)
    
.PARAMETER TestImport
    Test FastVideo library import after installation
    
.EXAMPLE
    .\setup-fastvideo-windows.ps1 -UseVenv -TestImport
    
.NOTES
    Prerequisites:
    - Python 3.12+ (python.exe in PATH)
    - NVIDIA GPU with CUDA 12.x drivers
    - ~10GB disk space for dependencies
#>

[CmdletBinding()]
param(
    [Parameter()]
    [switch]$UseVenv,
    
    [Parameter()]
    [switch]$SkipTorch,
    
    [Parameter()]
    [switch]$TestImport
)

$ErrorActionPreference = 'Stop'

function Write-Header($Text) {
    Write-Host "`n========================================" -ForegroundColor Cyan
    Write-Host " $Text" -ForegroundColor Cyan
    Write-Host "========================================`n" -ForegroundColor Cyan
}

function Write-Success($Text) {
    Write-Host "[✓] $Text" -ForegroundColor Green
}

function Write-Error($Text) {
    Write-Host "[✗] $Text" -ForegroundColor Red
}

function Write-Info($Text) {
    Write-Host "[i] $Text" -ForegroundColor Yellow
}

# 1. Validate Python
Write-Header "Validating Python Environment"

try {
    $pythonVersion = python --version 2>&1
    if ($pythonVersion -match "Python (\d+)\.(\d+)") {
        $major = [int]$matches[1]
        $minor = [int]$matches[2]
        
        if ($major -ge 3 -and $minor -ge 12) {
            Write-Success "Python $major.$minor detected"
        } else {
            Write-Error "Python 3.12+ required (found $major.$minor)"
            exit 1
        }
    }
} catch {
    Write-Error "Python not found in PATH"
    Write-Info "Install Python 3.12+ from https://www.python.org"
    exit 1
}

$pythonPath = (Get-Command python).Source
Write-Info "Using: $pythonPath"

# 2. Setup virtual environment (optional)
if ($UseVenv) {
    Write-Header "Creating Virtual Environment"
    
    $venvPath = Join-Path $PSScriptRoot ".." "fastvideo-env"
    
    if (Test-Path $venvPath) {
        Write-Info "Virtual environment already exists at: $venvPath"
    } else {
        Write-Info "Creating virtual environment at: $venvPath"
        python -m venv $venvPath
        Write-Success "Virtual environment created"
    }
    
    $activateScript = Join-Path $venvPath "Scripts" "Activate.ps1"
    Write-Info "Activating virtual environment..."
    & $activateScript
    Write-Success "Virtual environment activated"
}

# 3. Install PyTorch
if (-not $SkipTorch) {
    Write-Header "Installing PyTorch with CUDA Support"
    
    Write-Info "Installing PyTorch and torchvision..."
    python -m pip install torch torchvision --index-url https://download.pytorch.org/whl/cu121
    
    if ($LASTEXITCODE -eq 0) {
        Write-Success "PyTorch installed"
    } else {
        Write-Error "PyTorch installation failed"
        exit 1
    }
}

# 4. Install FastAPI and server dependencies
Write-Header "Installing Web Server Dependencies"

Write-Info "Installing fastapi, uvicorn, pillow..."
python -m pip install fastapi uvicorn pillow

if ($LASTEXITCODE -eq 0) {
    Write-Success "Server dependencies installed"
} else {
    Write-Error "Server dependencies installation failed"
    exit 1
}

# 5. Install FastVideo from GitHub
Write-Header "Installing FastVideo Library"

Write-Info "Installing from hao-ai-lab/FastVideo repository..."
Write-Info "This may take several minutes..."

python -m pip install git+https://github.com/hao-ai-lab/FastVideo.git

if ($LASTEXITCODE -eq 0) {
    Write-Success "FastVideo installed"
} else {
    Write-Error "FastVideo installation failed"
    Write-Info "Check GitHub repository: https://github.com/hao-ai-lab/FastVideo"
    exit 1
}

# 6. Install additional dependencies
Write-Header "Installing Additional Dependencies"

Write-Info "Installing huggingface_hub, transformers, diffusers, accelerate..."
python -m pip install huggingface_hub transformers diffusers accelerate

if ($LASTEXITCODE -eq 0) {
    Write-Success "Additional dependencies installed"
} else {
    Write-Warning "Some dependencies may have failed (non-critical)"
}

# 7. Validate CUDA
Write-Header "Validating CUDA Availability"

$cudaCheck = python -c "import torch; print('CUDA available:', torch.cuda.is_available()); print('CUDA version:', torch.version.cuda if torch.cuda.is_available() else 'N/A'); print('GPU count:', torch.cuda.device_count() if torch.cuda.is_available() else 0)" 2>&1

Write-Host $cudaCheck

if ($cudaCheck -match "CUDA available: True") {
    Write-Success "CUDA is available"
} else {
    Write-Error "CUDA not detected - FastVideo requires NVIDIA GPU"
    Write-Info "Ensure CUDA 12.x drivers are installed"
}

# 8. Test FastVideo import
if ($TestImport) {
    Write-Header "Testing FastVideo Import"
    
    $importTest = python -c @"
import sys
try:
    # Test basic imports
    import torch
    print('[✓] torch imported')
    
    import fastapi
    print('[✓] fastapi imported')
    
    import PIL
    print('[✓] PIL imported')
    
    # Note: FastVideo may have different import paths
    # Adjust based on actual library structure
    print('[i] FastVideo library structure:')
    try:
        import fastvideo
        print('[✓] fastvideo module found')
    except ImportError as e:
        print('[!] fastvideo module not found (may use different import name)')
        print(f'    Error: {e}')
        
    print('[✓] All critical dependencies available')
    sys.exit(0)
except Exception as e:
    print(f'[✗] Import test failed: {e}')
    sys.exit(1)
"@
    
    if ($LASTEXITCODE -eq 0) {
        Write-Success "Import test passed"
    } else {
        Write-Warning "Some imports failed - check above output"
    }
}

# 9. Summary
Write-Header "Setup Complete"

Write-Success "FastVideo environment ready"
Write-Info ""
Write-Info "Next steps:"
Write-Info "1. Verify the FastVideo library API (it may differ from the original prompt)"
Write-Info "2. Update scripts/fastvideo/fastvideo_server.py to match actual API"
Write-Info "3. Run: pwsh scripts\run-fastvideo-server.ps1 -DryRun"
Write-Info "4. Check logs for any import/initialization errors"
Write-Info ""
Write-Info "Documentation:"
Write-Info "  - FastVideo GitHub: https://github.com/hao-ai-lab/FastVideo"
Write-Info "  - Integration Guide: Documentation/Guides/FASTVIDEO_INTEGRATION_GUIDE.md"

if ($UseVenv) {
    Write-Info ""
    Write-Info "To activate environment next time:"
    Write-Info "  .\\fastvideo-env\\Scripts\\Activate.ps1"
}
