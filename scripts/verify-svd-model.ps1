#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Validates and optionally downloads the SVD model required for video generation.

.DESCRIPTION
    This script checks if the SVD (Stable Video Diffusion) model is present and,
    if requested, downloads it from Hugging Face to the correct location.

.PARAMETER Download
    If $true, downloads the SVD model. Default: $false (just checks status).

.PARAMETER OutputPath
    Full path where the SVD model should be saved.
    Default: C:\ComfyUI\ComfyUI_windows_portable\ComfyUI\models\checkpoints\SVD\svd_xt.safetensors

.PARAMETER HuggingFaceUrl
    URL to download the SVD model from Hugging Face.
    Default: https://huggingface.co/stabilityai/stable-video-diffusion-img2vid-xt/resolve/main/svd_xt.safetensors

.EXAMPLE
    # Check SVD status
    .\scripts\verify-svd-model.ps1

    # Download SVD model
    .\scripts\verify-svd-model.ps1 -Download $true

.NOTES
    - SVD model size: ~2.5 GB
    - Download time: 10-30 minutes (varies by network speed)
    - ComfyUI must be running for the e2e tests to execute after download
#>

param(
    [bool] $Download = $false,
    [string] $OutputPath = "C:\ComfyUI\ComfyUI_windows_portable\ComfyUI\models\checkpoints\SVD\svd_xt.safetensors",
    [string] $HuggingFaceUrl = "https://huggingface.co/stabilityai/stable-video-diffusion-img2vid-xt/resolve/main/svd_xt.safetensors"
)

function Write-Status {
    param([string] $Message, [string] $Level = "INFO")
    $timestamp = Get-Date -Format "HH:mm:ss"
    $prefix = switch ($Level) {
        "ERROR" { "❌" }
        "WARNING" { "⚠️ " }
        "SUCCESS" { "✓" }
        default { "ℹ️ " }
    }
    Write-Host "[$timestamp] $prefix $Message"
}

Write-Status "SVD Model Verification Script"
Write-Status "==============================" "INFO"
Write-Status ""

# Step 1: Check current status
Write-Status "Step 1: Checking SVD model status..." "INFO"

$modelExists = Test-Path $OutputPath
$modelDir = Split-Path $OutputPath

if ($modelExists) {
    $sizeGB = (Get-Item $OutputPath).Length / 1GB
    Write-Status "SVD model already present: $OutputPath ($([Math]::Round($sizeGB, 2)) GB)" "SUCCESS"
    Write-Status ""
    Write-Status "No further action needed. Ready to run E2E tests." "SUCCESS"
    exit 0
} else {
    Write-Status "SVD model NOT found at: $OutputPath" "WARNING"
    Write-Status ""
}

# Step 2: Check if directory exists
if (Test-Path $modelDir) {
    Write-Status "SVD directory exists: $modelDir" "INFO"
} else {
    Write-Status "SVD directory does NOT exist: $modelDir" "WARNING"
}

# Step 3: Decision point
if ($Download -eq $false) {
    Write-Status ""
    Write-Status "Download flag is OFF. To download SVD model, run:" "WARNING"
    Write-Status ""
    Write-Host "  pwsh -NoLogo -ExecutionPolicy Bypass -File scripts/verify-svd-model.ps1 -Download `$true"
    Write-Status ""
    Write-Status "Model Details:" "INFO"
    Write-Status "  - Size: ~2.5 GB"
    Write-Status "  - Name: Stable Video Diffusion (SVD)"
    Write-Status "  - File: svd_xt.safetensors"
    Write-Status "  - Source: Hugging Face (stabilityai)"
    Write-Status ""
    Write-Status "BLOCKER: E2E tests will fail until this model is present." "ERROR"
    exit 1
}

# Step 4: Prepare directory
Write-Status ""
Write-Status "Step 2: Preparing download directory..." "INFO"
if (-not (Test-Path $modelDir)) {
    Write-Status "Creating directory: $modelDir"
    New-Item -ItemType Directory -Path $modelDir -Force | Out-Null
}
Write-Status "Directory ready: $modelDir" "SUCCESS"

# Step 5: Download model
Write-Status ""
Write-Status "Step 3: Downloading SVD model..." "INFO"
Write-Status "Source: $HuggingFaceUrl"
Write-Status ""
Write-Status "Note: Download may take 10-30 minutes depending on your network speed." "WARNING"
Write-Status ""

try {
    $ProgressPreference = 'Continue'  # Show progress bar
    Invoke-WebRequest -Uri $HuggingFaceUrl `
        -OutFile $OutputPath `
        -UseBasicParsing `
        -TimeoutSec 3600  # 1 hour timeout

    if (Test-Path $OutputPath) {
        $sizeGB = (Get-Item $OutputPath).Length / 1GB
        Write-Status ""
        Write-Status "SVD model downloaded successfully!" "SUCCESS"
        Write-Status "Location: $OutputPath"
        Write-Status "Size: $([Math]::Round($sizeGB, 2)) GB"
        Write-Status ""
        Write-Status "Ready to run E2E tests. Execute:" "SUCCESS"
        Write-Status ""
        Write-Host "  pwsh -NoLogo -ExecutionPolicy Bypass -File scripts/run-comfyui-e2e.ps1"
        Write-Status ""
        exit 0
    } else {
        Write-Status "Failed to download SVD model. File not found after download." "ERROR"
        exit 1
    }
} catch {
    Write-Status "Download failed: $($_.Exception.Message)" "ERROR"
    Write-Status ""
    Write-Status "Troubleshooting steps:" "WARNING"
    Write-Status "1. Check your internet connection"
    Write-Status "2. Ensure Hugging Face is accessible: curl https://huggingface.co/"
    Write-Status "3. Try downloading manually from:"
    Write-Status "   $HuggingFaceUrl"
    Write-Status "4. Place the file at: $OutputPath"
    Write-Status ""
    exit 1
}
