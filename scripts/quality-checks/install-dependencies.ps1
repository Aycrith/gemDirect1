#!/usr/bin/env pwsh
<#
.SYNOPSIS
Install Python dependencies for quality check validators.

.DESCRIPTION
Installs spaCy, sentence-transformers, scipy, and numpy required by:
- coherence-check.py (spaCy)
- diversity-check.py (scipy)
- similarity-check.py (sentence-transformers)

Also downloads the English spaCy model.

.EXAMPLE
pwsh scripts/quality-checks/install-dependencies.ps1
# Install all dependencies

.EXAMPLE
pwsh scripts/quality-checks/install-dependencies.ps1 -SkipModelDownload
# Install packages but skip spaCy model (useful for CI where models are cached)
#>

param(
    [switch]$SkipModelDownload = $false
)

Write-Host "[Setup] Installing quality check dependencies..." -ForegroundColor Cyan

# Get path to requirements.txt
$requirementsPath = Join-Path (Split-Path $MyInvocation.MyCommand.Definition) 'requirements.txt'

if (-not (Test-Path $requirementsPath)) {
    Write-Host "❌ ERROR: requirements.txt not found at $requirementsPath" -ForegroundColor Red
    exit 1
}

Write-Host "Installing packages from $requirementsPath..." -ForegroundColor Gray

# Install requirements
try {
    & python -m pip install --upgrade pip -q
    & python -m pip install -r $requirementsPath
    Write-Host "✅ Packages installed successfully" -ForegroundColor Green
} catch {
    Write-Host "❌ Failed to install packages: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

# Download spaCy English model
if (-not $SkipModelDownload) {
    Write-Host "`n[Setup] Downloading spaCy English model..." -ForegroundColor Cyan
    try {
        & python -m spacy download en_core_web_sm -q
        Write-Host "✅ spaCy model downloaded" -ForegroundColor Green
    } catch {
        Write-Host "❌ Failed to download spaCy model: $($_.Exception.Message)" -ForegroundColor Red
        Write-Host "   You can download manually with: python -m spacy download en_core_web_sm" -ForegroundColor Yellow
        exit 1
    }
}

Write-Host "`n[Setup] All dependencies ready!" -ForegroundColor Green
Write-Host ""
Write-Host "Installed packages:" -ForegroundColor Gray
Write-Host "  • spacy (entity/pronoun analysis)" -ForegroundColor Gray
Write-Host "  • sentence-transformers (semantic similarity)" -ForegroundColor Gray
Write-Host "  • scipy (entropy calculations)" -ForegroundColor Gray
Write-Host "  • numpy (numerical operations)" -ForegroundColor Gray

exit 0
