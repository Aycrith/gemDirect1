# gemDirect1 Diagnostic Script
# Run this to check your development environment

Write-Host "`n=== gemDirect1 Environment Diagnostics ===" -ForegroundColor Cyan
Write-Host ""

# 1. Check Node.js
Write-Host "1. Checking Node.js..." -ForegroundColor Yellow
try {
    $nodeVersion = node --version
    Write-Host "   ✓ Node.js installed: $nodeVersion" -ForegroundColor Green
} catch {
    Write-Host "   ✗ Node.js not found. Please install Node.js." -ForegroundColor Red
}

# 2. Check npm
Write-Host "`n2. Checking npm..." -ForegroundColor Yellow
try {
    $npmVersion = npm --version
    Write-Host "   ✓ npm installed: v$npmVersion" -ForegroundColor Green
} catch {
    Write-Host "   ✗ npm not found." -ForegroundColor Red
}

# 3. Check if node_modules exists
Write-Host "`n3. Checking dependencies..." -ForegroundColor Yellow
if (Test-Path "node_modules") {
    Write-Host "   ✓ node_modules folder exists" -ForegroundColor Green
    $packageCount = (Get-ChildItem node_modules -Directory).Count
    Write-Host "   ✓ $packageCount packages installed" -ForegroundColor Green
} else {
    Write-Host "   ✗ node_modules not found. Run 'npm install'" -ForegroundColor Red
}

# 4. Check .env.local
Write-Host "`n4. Checking environment variables..." -ForegroundColor Yellow
if (Test-Path ".env.local") {
    $envContent = Get-Content ".env.local" -Raw
    if ($envContent -match "GEMINI_API_KEY\s*=\s*\w+") {
        Write-Host "   ✓ .env.local exists with GEMINI_API_KEY set" -ForegroundColor Green
    } else {
        Write-Host "   ✗ GEMINI_API_KEY not set in .env.local" -ForegroundColor Red
        Write-Host "   Add this line to .env.local:" -ForegroundColor Yellow
        Write-Host "   GEMINI_API_KEY=your_api_key_here" -ForegroundColor Gray
    }
} else {
    Write-Host "   ✗ .env.local file not found" -ForegroundColor Red
    Write-Host "   Create .env.local with:" -ForegroundColor Yellow
    Write-Host "   GEMINI_API_KEY=your_api_key_here" -ForegroundColor Gray
}

# 5. Check ComfyUI Server
Write-Host "`n5. Checking ComfyUI server..." -ForegroundColor Yellow
$comfyPorts = @(8000, 8188)
$foundComfy = $false

foreach ($port in $comfyPorts) {
    try {
        $response = Invoke-WebRequest -Uri "http://127.0.0.1:$port/system_stats" -Method GET -TimeoutSec 2 -ErrorAction Stop
        if ($response.StatusCode -eq 200) {
            Write-Host "   ✓ ComfyUI server running on port $port" -ForegroundColor Green
            $stats = $response.Content | ConvertFrom-Json
            Write-Host "   ✓ ComfyUI version: $($stats.system.comfyui_version)" -ForegroundColor Green
            
            # Check GPU
            if ($stats.devices -and $stats.devices.Count -gt 0) {
                $gpu = $stats.devices[0]
                $vramGB = [math]::Round($gpu.vram_total / 1GB, 2)
                $vramFreeGB = [math]::Round($gpu.vram_free / 1GB, 2)
                Write-Host "   ✓ GPU: $($gpu.name)" -ForegroundColor Green
                Write-Host "   ✓ VRAM: $vramFreeGB GB free / $vramGB GB total" -ForegroundColor Green
            }
            $foundComfy = $true
            break
        }
    } catch {
        # Port not responding, continue to next
    }
}

if (-not $foundComfy) {
    Write-Host "   ✗ ComfyUI server not found on ports 8000 or 8188" -ForegroundColor Red
    Write-Host "   Start it with: Run Task -> 'Start ComfyUI Server'" -ForegroundColor Yellow
    
    # Check if ComfyUI process is running
    $comfyProcess = Get-Process | Where-Object { $_.Path -like '*COMFYUI*python.exe' }
    if ($comfyProcess) {
        Write-Host "   ⚠ ComfyUI process found but not responding on standard ports" -ForegroundColor Yellow
        Write-Host "   Check ComfyUI logs for the actual port number" -ForegroundColor Yellow
    }
}

# 6. Check for ComfyUI installation
Write-Host "`n6. Checking ComfyUI installation..." -ForegroundColor Yellow
$comfyPath = "C:\Users\$env:USERNAME\AppData\Local\Programs\@comfyorgcomfyui-electron"
if (Test-Path $comfyPath) {
    Write-Host "   ✓ ComfyUI Desktop found at: $comfyPath" -ForegroundColor Green
    
    # Check for multiple installations
    $comfyDirs = Get-ChildItem -Path "C:\Users\$env:USERNAME\AppData\Local\Programs" -Directory -Filter "*comfy*" -ErrorAction SilentlyContinue
    if ($comfyDirs.Count -gt 1) {
        Write-Host "   ⚠ Multiple ComfyUI installations detected:" -ForegroundColor Yellow
        foreach ($dir in $comfyDirs) {
            Write-Host "     - $($dir.FullName)" -ForegroundColor Gray
        }
    }
} else {
    Write-Host "   ✗ ComfyUI Desktop not found at standard location" -ForegroundColor Red
    Write-Host "   Expected: $comfyPath" -ForegroundColor Gray
}

# 7. Check Python (for ComfyUI)
Write-Host "`n7. Checking Python for ComfyUI..." -ForegroundColor Yellow
$pythonPath = "C:\COMFYUI\.venv\Scripts\python.exe"
if (Test-Path $pythonPath) {
    try {
        $pythonVersion = & $pythonPath --version 2>&1
        Write-Host "   ✓ Python found: $pythonVersion" -ForegroundColor Green
    } catch {
        Write-Host "   ⚠ Python path exists but not executable" -ForegroundColor Yellow
    }
} else {
    Write-Host "   ⚠ Python not found at: $pythonPath" -ForegroundColor Yellow
    Write-Host "   ComfyUI may use a different Python path" -ForegroundColor Gray
}

# Summary
Write-Host "`n=== Summary ===" -ForegroundColor Cyan
Write-Host "Run 'npm run dev' to start the development server" -ForegroundColor White
Write-Host "Access the app at: http://localhost:3000" -ForegroundColor White
Write-Host ""
Write-Host "For ComfyUI integration:" -ForegroundColor White
Write-Host "1. Start ComfyUI server (Run Task -> 'Start ComfyUI Server')" -ForegroundColor Gray
Write-Host "2. In the app, click Settings -> Auto-Discover Server" -ForegroundColor Gray
Write-Host "3. Use AI Configurator to sync and map your workflow" -ForegroundColor Gray
Write-Host ""
