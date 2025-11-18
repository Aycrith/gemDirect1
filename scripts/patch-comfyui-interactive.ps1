<#
Interactive wrapper for safely applying the ComfyUI safetensors pagefile fallback patch.
- Discovers candidate ComfyUI installations
- Shows DryRun preview
- Prompts user for confirmation before applying
- Runs validation and optional syntax check
#>
param(
    [switch]$AutoApply = $false,
    [string]$ComfyPath = '',
    [switch]$DryRun = $true
)

function Find-ComfyInstalls {
    $candidates = @()
    $paths = @(
        "C:\ComfyUI\ComfyUI_windows_portable\ComfyUI",
        "$env:LOCALAPPDATA\Programs\@comfyorgcomfyui-electron\resources\ComfyUI",
        "C:\Program Files\ComfyUI\ComfyUI"
    )
    foreach ($p in $paths) {
        if (Test-Path $p) { $candidates += $p }
    }
    return $candidates
}

if ($ComfyPath -ne '') {
    $installs = @($ComfyPath)
} else {
    $installs = Find-ComfyInstalls
}

if (-not $installs -or $installs.Count -eq 0) {
    Write-Host "No ComfyUI installations detected. Provide -ComfyPath 'C:\Path\To\ComfyUI' or place ComfyUI in a supported path." -ForegroundColor Yellow
    exit 1
}

Write-Host "Found the following ComfyUI installations:" -ForegroundColor Cyan
$idx = 1
foreach ($i in $installs) {
    Write-Host "[$idx] $i" -ForegroundColor Gray
    $idx++
}

if ($installs.Count -gt 1) {
    $choice = Read-Host "Enter the number to patch (or 'a' to patch all). Press Enter to choose the first"
    if ($choice -eq 'a') {
        $toPatch = $installs
    } elseif ($choice -match '^[0-9]+$') {
        $n = [int]$choice
        if ($n -ge 1 -and $n -le $installs.Count) { $toPatch = @($installs[$n-1]) } else { Write-Host "Invalid choice" -ForegroundColor Red; exit 1 }
    } else {
        $toPatch = @($installs[0])
    }
} else {
    $toPatch = $installs
}

foreach ($targetRoot in $toPatch) {
    $file = Join-Path $targetRoot "comfy\utils.py"
    if (-not (Test-Path $file)) { Write-Host "Skipping missing utils.py at: $file" -ForegroundColor Yellow; continue }

    Write-Host "\n=== Previewing patch for: $file ===" -ForegroundColor Cyan
    & (Join-Path $PSScriptRoot "patch-comfyui-handle-pagefile.ps1") -customComfyPath $targetRoot -DryRun

    if (-not $AutoApply) {
        $apply = Read-Host "Apply patch to $file? (y/n)"
        if ($apply -ne 'y' -and $apply -ne 'Y') { Write-Host "Skipping" -ForegroundColor Yellow; continue }
    }

    Write-Host "Applying patch to: $file" -ForegroundColor Cyan
    & (Join-Path $PSScriptRoot "patch-comfyui-handle-pagefile.ps1") -customComfyPath $targetRoot -ForceApply

    Write-Host "Running validator..." -ForegroundColor Cyan
    & (Join-Path $PSScriptRoot "validate-comfyui-patch.ps1") -comfyPath $targetRoot

    Write-Host "Compiling patched file to verify Python syntax..." -ForegroundColor Cyan
    try {
        python -m py_compile $file
        Write-Host "✓ Python syntax check passed." -ForegroundColor Green
    } catch {
        Write-Host "✗ Python syntax check failed. Consider restoring the backup with scripts/revert-comfyui-patch.ps1" -ForegroundColor Red
    }
}

Write-Host "Interactive patch run complete." -ForegroundColor Green
