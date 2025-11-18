<#
Validate ComfyUI safetensors Pagefile patch.

Checks whether a local ComfyUI installation contains the OSError 1455
fallback patch (safetensors->load_file -> torch.load fallback) and reports
what to do next.
#>

param(
    [string]$comfyPath = "C:\ComfyUI\ComfyUI_windows_portable\ComfyUI"
)

$target = Join-Path $comfyPath "comfy\utils.py"
if (-not (Test-Path $target)) {
    Write-Host "ComfyUI utils.py not found: $target" -ForegroundColor Red
    exit 1
}

$body = Get-Content -Path $target -Raw

$checks = @(
    @{k='safetensors.torch.load_file'; m='safetensors\.torch\.load_file\('},
    @{k='import logging'; m='(^|\n)\s*import\s+logging\b'},
    # Match the is_win_1455 check regardless of single/double quoting style
    @{k='is_win_1455 check'; m='is_win_1455\s*=\s*isinstance\(e,\s*OSError\)'},
    # Match torch.load with map_location to cpu using either single or double quotes
    @{k='torch.load fallback'; m='torch\.load\([^\)]*map_location\s*=\s*torch\.device\([^\)]*cpu[^\)]*\)'}
)

$ok = $true
foreach ($c in $checks) {
    if ($body -notmatch $c.m) {
        Write-Host "✗ Missing: $($c.k)" -ForegroundColor Yellow
        $ok = $false
    } else {
        Write-Host "✓ Found: $($c.k)" -ForegroundColor Green
    }
}

if ($ok) {
    Write-Host "The patch appears to be applied successfully." -ForegroundColor Green
} else {
    Write-Host "The patch is not fully applied. Run scripts/patch-comfyui-handle-pagefile.ps1 to apply." -ForegroundColor Yellow
}
