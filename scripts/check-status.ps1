# ComfyUI Status Check Script
# Quick diagnostic to verify everything is working

Write-Host ""
Write-Host "═══════════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host "           ComfyUI Status Check" -ForegroundColor Cyan
Write-Host "═══════════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host ""

# Check 1: Installation exists
Write-Host "1. Checking installation..." -ForegroundColor Yellow
$installPath = "C:\ComfyUI\ComfyUI_windows_portable"
if (Test-Path $installPath) {
    Write-Host "   ✓ ComfyUI installed at: $installPath" -ForegroundColor Green
} else {
    Write-Host "   ✗ ComfyUI not found!" -ForegroundColor Red
    Write-Host "   Run: .\scripts\setup-comfyui.ps1" -ForegroundColor Yellow
    exit 1
}

# Check 2: Manager installed
Write-Host ""
Write-Host "2. Checking ComfyUI Manager..." -ForegroundColor Yellow
$managerPath = "$installPath\ComfyUI\custom_nodes\ComfyUI-Manager"
if (Test-Path $managerPath) {
    Write-Host "   ✓ ComfyUI Manager installed" -ForegroundColor Green
} else {
    Write-Host "   ✗ ComfyUI Manager not found!" -ForegroundColor Red
    Write-Host "   Install: cd '$installPath\ComfyUI\custom_nodes'; git clone https://github.com/ltdrdata/ComfyUI-Manager.git" -ForegroundColor Yellow
}

# Check 3: Custom nodes
Write-Host ""
Write-Host "3. Checking custom nodes..." -ForegroundColor Yellow
$customNodesPath = "$installPath\ComfyUI\custom_nodes"
$nodes = Get-ChildItem $customNodesPath -Directory -ErrorAction SilentlyContinue
if ($nodes) {
    Write-Host "   ✓ Found $($nodes.Count) custom node(s):" -ForegroundColor Green
    foreach ($node in $nodes) {
        Write-Host "     - $($node.Name)" -ForegroundColor Cyan
    }
} else {
    Write-Host "   ⚠ No custom nodes found" -ForegroundColor Yellow
}

# Check 4: Models
Write-Host ""
Write-Host "4. Checking models..." -ForegroundColor Yellow
$checkpointsPath = "$installPath\ComfyUI\models\checkpoints"
$checkpoints = Get-ChildItem $checkpointsPath -File -ErrorAction SilentlyContinue | Where-Object { $_.Extension -eq ".safetensors" -or $_.Extension -eq ".ckpt" }
if ($checkpoints) {
    Write-Host "   ✓ Found $($checkpoints.Count) checkpoint(s):" -ForegroundColor Green
    foreach ($cp in $checkpoints) {
        $sizeMB = [math]::Round($cp.Length / 1MB, 2)
        Write-Host "     - $($cp.Name) ($sizeMB MB)" -ForegroundColor Cyan
    }
} else {
    Write-Host "   ⚠ No checkpoint models found!" -ForegroundColor Yellow
    Write-Host "   Install models via Manager at http://127.0.0.1:8188" -ForegroundColor Yellow
    Write-Host "   Or see: COMFYUI_MODEL_DOWNLOAD_GUIDE.md" -ForegroundColor Cyan
}

# Check 5: Server status
Write-Host ""
Write-Host "5. Checking server status..." -ForegroundColor Yellow
$process = Get-Process python* -ErrorAction SilentlyContinue | Where-Object { $_.Path -like '*ComfyUI*' }
if ($process) {
    Write-Host "   ✓ ComfyUI process running (PID: $($process.Id))" -ForegroundColor Green
    
    # Try to connect
    try {
        $response = Invoke-RestMethod -Uri "http://127.0.0.1:8188/system_stats" -Method Get -TimeoutSec 5 -ErrorAction Stop
        Write-Host "   ✓ Server responding at http://127.0.0.1:8188" -ForegroundColor Green
        Write-Host "   ✓ Version: $($response.system.comfyui_version)" -ForegroundColor Green
        
        $ramFreeMB = [math]::Round($response.system.ram_free / 1MB, 2)
        Write-Host "   ✓ RAM Free: $ramFreeMB MB" -ForegroundColor Green
        
        if ($response.system.device) {
            Write-Host "   ✓ GPU: $($response.system.device.name)" -ForegroundColor Green
            if ($response.system.device.vram_free) {
                $vramFreeMB = [math]::Round($response.system.device.vram_free / 1MB, 2)
                Write-Host "   ✓ VRAM Free: $vramFreeMB MB" -ForegroundColor Green
            }
        }
    } catch {
        Write-Host "   ⚠ Server process found but not responding" -ForegroundColor Yellow
        Write-Host "   May still be starting up..." -ForegroundColor Yellow
    }

        # Check log for pagefile errors
        $logPath1 = Join-Path "$installPath" "comfyui.log"
        if (Test-Path $logPath1) {
            $logText = Get-Content $logPath1 -Raw -ErrorAction SilentlyContinue
            if ($logText -match "page.*file.*too small|os error 1455|页面文件太小") {
                Write-Host "⚠ ComfyUI logs show pagefile / OOM (os error 1455)." -ForegroundColor Yellow
                Write-Host "   → Increase Windows pagefile or run: .\scripts\patch-comfyui-handle-pagefile.ps1 or use scripts\start-comfyui-disable-mmap.ps1 to restart with --disable-mmap" -ForegroundColor Cyan
            }
        }
} else {
    Write-Host "   ⚠ ComfyUI not running" -ForegroundColor Yellow
    Write-Host "   Start with: C:\ComfyUI\start-comfyui.bat" -ForegroundColor Yellow
    Write-Host "   Or VS Code Task: Start ComfyUI Server" -ForegroundColor Cyan
}

# Check 6: gemDirect1
Write-Host ""
Write-Host "6. Checking gemDirect1..." -ForegroundColor Yellow
if (Test-Path "package.json") {
    Write-Host "   ✓ gemDirect1 project found" -ForegroundColor Green
    
    # Check if dev server is running
    try {
        $devResponse = Invoke-WebRequest -Uri "http://localhost:3000" -Method Get -TimeoutSec 2 -ErrorAction Stop
        Write-Host "   ✓ Dev server running at http://localhost:3000" -ForegroundColor Green
    } catch {
        Write-Host "   ⚠ Dev server not running" -ForegroundColor Yellow
        Write-Host "   Start with: npm run dev" -ForegroundColor Yellow
    }
} else {
    Write-Host "   ⚠ Not in gemDirect1 directory" -ForegroundColor Yellow
}

# Summary
Write-Host ""
Write-Host "═══════════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host "           Status Summary" -ForegroundColor Cyan
Write-Host "═══════════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host ""

if ($process -and $response -and $checkpoints) {
    Write-Host "✓ All systems ready!" -ForegroundColor Green
    Write-Host ""
    Write-Host "Next steps:" -ForegroundColor Cyan
    Write-Host "  - Open ComfyUI: http://127.0.0.1:8188" -ForegroundColor White
    Write-Host "  - Start gemDirect1: npm run dev" -ForegroundColor White
    Write-Host "  - Access app: http://localhost:3000" -ForegroundColor White
} elseif ($process -and $response -and -not $checkpoints) {
    Write-Host "⚠ ComfyUI ready but no models installed" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "Install models:" -ForegroundColor Cyan
    Write-Host "  1. Open: http://127.0.0.1:8188" -ForegroundColor White
    Write-Host "  2. Click 'Manager' button" -ForegroundColor White
    Write-Host "  3. Install Models → Search 'SD 1.5'" -ForegroundColor White
} elseif (-not $process) {
    Write-Host "⚠ ComfyUI not running" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "Start ComfyUI:" -ForegroundColor Cyan
    Write-Host "  C:\ComfyUI\start-comfyui.bat" -ForegroundColor White
    Write-Host "  Or: Ctrl+Shift+P → Start ComfyUI Server" -ForegroundColor White
} else {
    Write-Host "⚠ Some components need attention" -ForegroundColor Yellow
    Write-Host "Review the checks above for details" -ForegroundColor White
}

Write-Host ""
Write-Host "═══════════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host ""

# Quick actions
Write-Host "Quick commands:" -ForegroundColor Yellow
Write-Host "  Start ComfyUI:     C:\ComfyUI\start-comfyui.bat" -ForegroundColor White
Write-Host "  Stop ComfyUI:      Get-Process python* | Where { `$_.Path -like '*ComfyUI*' } | Stop-Process -Force" -ForegroundColor White
Write-Host "  Start gemDirect1:  npm run dev" -ForegroundColor White
Write-Host "  Reinstall:         .\scripts\setup-comfyui.ps1" -ForegroundColor White
Write-Host ""
