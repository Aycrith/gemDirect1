param(
    [string]$customComfyPath = '',
    [switch]$ForceApply = $false,
    [switch]$DryRun = $false
)

function Test-AndApplyPatch {
    param(
        [Parameter(Mandatory=$true)][string]$filePath
    )

    if (-not (Test-Path $filePath)) {
        Write-Host "File not found: $filePath" -ForegroundColor Yellow
        return $false
    }

    $content = Get-Content -Path $filePath -Raw -ErrorAction Stop

    # Ensure logging is imported, otherwise the fallback logging.* calls will raise NameError at runtime
    if ($content -notmatch "(^|\n)\s*import\s+logging\b") {
        Write-Host "Adding 'import logging' to $filePath" -ForegroundColor Cyan
        # Try to insert after a file docstring if present, else after initial imports, else at top
        $docStart1 = $content.IndexOf('"""')
        $docStart2 = $content.IndexOf("'''")
        $docStart = -1
        if ($docStart1 -ge 0 -and ($docStart2 -lt 0 -or $docStart1 -lt $docStart2)) { $docStart = $docStart1 } elseif ($docStart2 -ge 0) { $docStart = $docStart2 }
        if ($docStart -ge 0) {
            $docEnd = $content.IndexOf('"""', $docStart + 3)
            if ($docEnd -lt 0) { $docEnd = $content.IndexOf("'''", $docStart + 3) }
            if ($docEnd -ge 0) {
                $insertPos = $docEnd + 3
                $content = $content.Substring(0, $insertPos) + [Environment]::NewLine + "import logging" + [Environment]::NewLine + $content.Substring($insertPos)
            } else {
                # If docstring isn't closed properly, fall back to top of file insert
                $content = "import logging" + [Environment]::NewLine + $content
            }
        } else {
            # Insert after first import line if available
            $firstImportIdx = $content.IndexOf('import ')
            if ($firstImportIdx -ge 0) {
                $content = $content.Substring(0, $firstImportIdx) + "import logging" + [Environment]::NewLine + $content.Substring($firstImportIdx)
            } else {
                # If there are no import lines, just add at top
                $content = "import logging" + [Environment]::NewLine + $content
            }
        }
    }

    # Locate the safetensors safe_open call (we'll need this for contextual replacement)
    $safeOpenIdx = $content.IndexOf('safetensors.safe_open(')
    if ($safeOpenIdx -lt 0) {
        $safeOpenIdx = $content.IndexOf('with safe_open(')
        if ($safeOpenIdx -lt 0) { $safeOpenIdx = $content.IndexOf('safe_open(') }
    }

    # If the patch strings are already present, skip applying unless explicitly forced
    if ($content -match "safetensors.torch.load_file\(|is_win_1455 =|Both safetensors and torch fallback paths failed") {
        Write-Host "Patch markers already present in $filePath" -ForegroundColor Yellow
        if (-not $ForceApply) { return $true }
        Write-Host "Reapplying due to -ForceApply — removing existing fallback first" -ForegroundColor Cyan

        # Attempt to remove existing fallback block before reapplying to avoid duplicates
        $existingStart = $null
        if ($safeOpenIdx -ge 0) { $existingStart = $content.IndexOf('is_win_1455', $safeOpenIdx) } else { $existingStart = $content.IndexOf('is_win_1455') }
        if ($existingStart -ge 0) {
            $existingEnd = $content.IndexOf($fallbackIndicator, $existingStart)
            if ($existingEnd -ge 0) {
                $content = $content.Substring(0, $existingStart) + $content.Substring($existingEnd)
            }
        }
    }

    $safeOpenIdx = $content.IndexOf('safetensors.safe_open(')
    if ($safeOpenIdx -lt 0) {
        # Many versions of ComfyUI import the function directly: from safetensors.torch import safe_open
        # Look for a local 'safe_open(' call used within a with-block
        $safeOpenIdx = $content.IndexOf('with safe_open(')
        if ($safeOpenIdx -lt 0) {
            # Fallback: any safe_open( call (less strict). We'll ensure it's the correct context later.
            $safeOpenIdx = $content.IndexOf('safe_open(')
        }
    }
    if ($safeOpenIdx -lt 0) {
        Write-Host "✗ safetensors.safe_open(...) not found in $filePath" -ForegroundColor Yellow
        return $false
    }

    # Try to find standard 'except Exception as e:' pattern; fall back to a more permissive search
    $exceptIdx = $content.IndexOf("except Exception as e:", $safeOpenIdx, [System.StringComparison]::OrdinalIgnoreCase)
    if ($exceptIdx -lt 0) {
        $exceptIdx = $content.IndexOf("except Exception:", $safeOpenIdx, [System.StringComparison]::OrdinalIgnoreCase)
    }
    if ($exceptIdx -lt 0) {
        Write-Host "✗ Could not locate 'except Exception as e:' block after the safetensors.safe_open call" -ForegroundColor Yellow
        return $false
    }

    # Find the first 'raise' inside the except block
    $raiseIdx = $content.IndexOf('raise', $exceptIdx)
    if ($raiseIdx -lt 0) {
        Write-Host "✗ Could not locate 'raise e' inside the safetensors except block" -ForegroundColor Yellow
        return $false
    }

    # Determine indentation level from the `raise e` line
    $lineStart = $content.LastIndexOf([Environment]::NewLine, $raiseIdx)
    if ($lineStart -lt 0) { $lineStart = 0 } else { $lineStart += [Environment]::NewLine.Length }
    $raiseLineText = $content.Substring($lineStart, $raiseIdx - $lineStart)
    $null = ($raiseLineText -match '^([\s]*)')
    $indent = if ($Matches[1]) { $Matches[1] } else { '            ' }

    # Build the Python fallback block as a literal here-string (single-quoted for safety)
    $fallback = @'
try:
    is_win_1455 = isinstance(e, OSError) and (getattr(e, "winerror", None) == 1455 or getattr(e, "errno", None) == 1455)
except Exception:
    is_win_1455 = False

if is_win_1455:
    logging.warning("safetensors.safe_open failed due to OS error 1455 (paging file). Trying CPU fallback (safetensors.torch.load_file) and then torch.load as a last resort.")

    try:
        sd_cpu = safetensors.torch.load_file(ckpt, device="cpu")
        sd = {}
        for k in sd_cpu.keys():
            tensor = sd_cpu[k]
            if device.type != "cpu":
                try:
                    tensor = tensor.to(device=device, non_blocking=True)
                except Exception:
                    pass
            sd[k] = tensor
        if return_metadata:
            metadata = None
        logging.info("safetensors CPU fallback succeeded.")
        return (sd, metadata) if return_metadata else sd
    except Exception as e2:
        logging.warning(f"safetensors.load_file fallback failed: {e2!s}")

    try:
        logging.info(f"Trying torch.load map_location='cpu' fallback for: {ckpt}")
        torch_args = {}
        if MMAP_TORCH_FILES:
            torch_args["mmap"] = False
        if safe_load or ALWAYS_SAFE_LOAD:
            pl_sd = torch.load(ckpt, map_location=torch.device("cpu"), weights_only=True, **torch_args)
        else:
            pl_sd = torch.load(ckpt, map_location=torch.device("cpu"), pickle_module=comfy.checkpoint_pickle, **torch_args)

        if "state_dict" in pl_sd:
            sd = pl_sd["state_dict"]
        else:
            if len(pl_sd) == 1:
                key = list(pl_sd.keys())[0]
                sd = pl_sd[key]
            else:
                sd = pl_sd

        if device.type != "cpu":
            for k in list(sd.keys()):
                try:
                    sd[k] = sd[k].to(device=device, non_blocking=True)
                except Exception:
                    pass

        if return_metadata:
            metadata = None
        logging.info("torch.load fallback succeeded.")
        return (sd, metadata) if return_metadata else sd
    except Exception as e3:
        logging.error(f"Both safetensors and torch fallback paths failed: {e3!s}")
'@

    # Make a local backup of the original file so we can restore if needed
    $backupPath = "${filePath}.gemDirect1.bak"
    if (-not $DryRun) {
        if (-not (Test-Path $backupPath)) {
            Copy-Item -Path $filePath -Destination $backupPath -Force
            Write-Host "Backup created at: $backupPath" -ForegroundColor Cyan
        }
    } else {
        Write-Host "[DryRun] Would create backup: $backupPath" -ForegroundColor Cyan
    }

    # Indent and insert the fallback block
    $fallbackLines = $fallback -split "\r?\n"
    $indented = ($fallbackLines | ForEach-Object { $indent + $_ }) -join [Environment]::NewLine

    # Insert before the start of the line that contains the 'raise e' to preserve indentation
    $pref = $content.Substring(0, $lineStart)
    # Keep the entire line (including indentation) so 'raise e' remains properly indented
    $suf = $content.Substring($lineStart)
    $patched = $pref + [Environment]::NewLine + $indented + [Environment]::NewLine + $suf

    if ($DryRun) {
        Write-Host "[DryRun] Preview of changes for: $filePath" -ForegroundColor Cyan
        Write-Host "--- BEGIN PATCH PREVIEW ---" -ForegroundColor Gray
        Write-Host $patched -ForegroundColor Gray
        Write-Host "--- END PATCH PREVIEW ---" -ForegroundColor Gray
        return $true
    }

    Set-Content -Path $filePath -Value $patched -Encoding UTF8
    Write-Host "✓ Patched: $filePath" -ForegroundColor Green
    return $true
}

# Known locations to check
$paths = @()
if ($customComfyPath) {
    $paths += Join-Path $customComfyPath "comfy\utils.py"
} else {
    $paths += @("C:\ComfyUI\ComfyUI_windows_portable\ComfyUI\comfy\utils.py",
                "$env:LOCALAPPDATA\Programs\@comfyorgcomfyui-electron\resources\ComfyUI\comfy\utils.py",
                "C:\Program Files\ComfyUI\ComfyUI\comfy\utils.py")
}

$found = $false
foreach ($p in $paths | Select-Object -Unique) {
    if (Test-Path $p) {
        Write-Host "Found ComfyUI utils at: $p" -ForegroundColor Cyan
        $ok = Test-AndApplyPatch -filePath $p
        if ($ok) { $found = $true }
    }
}

if (-not $found) {
    Write-Host "No ComfyUI installation patched. Please run this script with a custom path if your ComfyUI is not in the default locations." -ForegroundColor Yellow
    Write-Host "Example: .\patch-comfyui-handle-pagefile.ps1 -customComfyPath 'D:\ComfyUI\ComfyUI_windows_portable\ComfyUI'" -ForegroundColor Yellow
}

Write-Host "Done." -ForegroundColor Green