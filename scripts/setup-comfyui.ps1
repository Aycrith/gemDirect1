# ComfyUI Clean Installation Script
# This script completely sets up ComfyUI with proper CORS configuration

Write-Host "=== ComfyUI Clean Installation ===" -ForegroundColor Cyan
Write-Host ""

$comfyPath = "C:\ComfyUI"
$downloadUrl = "https://github.com/comfyanonymous/ComfyUI/releases/latest/download/ComfyUI_windows_portable_nvidia.7z"
$archivePath = "$comfyPath\ComfyUI_portable.7z"

# Step 1: Stop any running ComfyUI processes
Write-Host "1. Stopping any running ComfyUI processes..." -ForegroundColor Yellow
Get-Process | Where-Object { $_.Path -like '*comfyui*' -or $_.Path -like '*ComfyUI*' } | Stop-Process -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 2

# Step 2: Clean up old installations
Write-Host "2. Removing old installations..." -ForegroundColor Yellow
if (Test-Path $comfyPath) {
    Remove-Item -Path $comfyPath -Recurse -Force -ErrorAction SilentlyContinue
}
Remove-Item -Path "C:\Users\$env:USERNAME\AppData\Local\Programs\@comfyorgcomfyui-electron" -Recurse -Force -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Path $comfyPath -Force | Out-Null

# Step 3: Download ComfyUI portable
Write-Host "3. Downloading ComfyUI portable (this may take several minutes)..." -ForegroundColor Yellow
try {
    Invoke-WebRequest -Uri $downloadUrl -OutFile $archivePath -UseBasicParsing
    Write-Host "   Download complete!" -ForegroundColor Green
} catch {
    Write-Host "   Error downloading: $_" -ForegroundColor Red
    exit 1
}

# Step 4: Extract the archive
Write-Host "4. Extracting ComfyUI..." -ForegroundColor Yellow

# Try using 7-Zip if available
if (Test-Path "C:\Program Files\7-Zip\7z.exe") {
    & "C:\Program Files\7-Zip\7z.exe" x $archivePath -o"$comfyPath" -y
} elseif (Test-Path "C:\Program Files (x86)\7-Zip\7z.exe") {
    & "C:\Program Files (x86)\7-Zip\7z.exe" x $archivePath -o"$comfyPath" -y
} else {
    # Try using Expand-Archive (Windows built-in, but doesn't support .7z)
    Write-Host "   7-Zip not found. Please install 7-Zip from https://www.7-zip.org/" -ForegroundColor Red
    Write-Host "   Or extract manually to C:\ComfyUI" -ForegroundColor Yellow
    exit 1
}

# Clean up archive
Remove-Item $archivePath -Force -ErrorAction SilentlyContinue

# Step 5: Configure CORS properly
Write-Host "5. Configuring CORS settings..." -ForegroundColor Yellow

# Create server configuration file
$serverConfigPath = "$comfyPath\ComfyUI\user\default\comfy.settings.json"
$serverConfigDir = Split-Path $serverConfigPath -Parent
if (-not (Test-Path $serverConfigDir)) {
    New-Item -ItemType Directory -Path $serverConfigDir -Force | Out-Null
}

$serverConfig = @{
    "Comfy-Org.ComfyUI_frontend" = @{
        "ConfirmClear" = $true
        "DisableSliders" = $false
    }
} | ConvertTo-Json -Depth 10

Set-Content -Path $serverConfigPath -Value $serverConfig -Force

# Step 6: Create startup script with CORS enabled
Write-Host "6. Creating startup script..." -ForegroundColor Yellow
$startupScript = @'
@echo off
cd /d "%~dp0ComfyUI"
echo Starting ComfyUI with CORS enabled...
python_embeded\python.exe -s ComfyUI\main.py --windows-standalone-build --listen 127.0.0.1 --port 8188 --enable-cors-header "*"
pause
'@

Set-Content -Path "$comfyPath\start-comfyui.bat" -Value $startupScript -Force

# Step 7: Create Python startup script (alternative)
Write-Host "7. Creating Python startup script..." -ForegroundColor Yellow
$pythonStartup = @"
import subprocess
import sys
import os

comfy_path = r'$comfyPath\ComfyUI'
python_path = r'$comfyPath\python_embeded\python.exe'

os.chdir(comfy_path)
subprocess.run([
    python_path, 
    'main.py',
    '--listen', '127.0.0.1',
    '--port', '8188',
    '--enable-cors-header', '*'
])
"@

Set-Content -Path "$comfyPath\start-comfyui.py" -Value $pythonStartup -Force

Write-Host ""
Write-Host "=== Installation Complete! ===" -ForegroundColor Green
Write-Host ""
Write-Host "ComfyUI is installed at: $comfyPath" -ForegroundColor Cyan
Write-Host "To start ComfyUI, run: $comfyPath\start-comfyui.bat" -ForegroundColor Cyan
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Yellow
Write-Host "1. Start ComfyUI using the batch file or VS Code task"
Write-Host "2. Access the UI at http://127.0.0.1:8188"
Write-Host "3. Generate a test workflow in ComfyUI to populate the history"
Write-Host "4. Test the integration with your gemDirect1 app"
Write-Host ""
