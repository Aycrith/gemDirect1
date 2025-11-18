# ComfyUI Installation Diagnostic and Fix Script
# This script identifies multiple ComfyUI installations and helps configure the correct one

Write-Host "`n=== ComfyUI Installation Diagnostic ===" -ForegroundColor Cyan
Write-Host ""

# Find all ComfyUI installations
$installations = @()

# Check ComfyUI Desktop
$desktopPath = "C:\Users\$env:USERNAME\AppData\Local\Programs\@comfyorgcomfyui-electron\resources\ComfyUI"
if (Test-Path $desktopPath) {
    $modelCount = 0
    $customNodeCount = 0
    if (Test-Path "$desktopPath\models") {
        $modelCount = (Get-ChildItem "$desktopPath\models" -Recurse -File -ErrorAction SilentlyContinue | Measure-Object).Count
    }
    if (Test-Path "$desktopPath\custom_nodes") {
        $customNodeCount = (Get-ChildItem "$desktopPath\custom_nodes" -Directory -ErrorAction SilentlyContinue | Measure-Object).Count
    }
    
    $installations += [PSCustomObject]@{
        Type = "ComfyUI Desktop"
        Path = $desktopPath
        ModelCount = $modelCount
        CustomNodes = $customNodeCount
        PythonPath = "C:\COMFYUI\.venv\Scripts\python.exe"
    }
}

# Check standalone ComfyUI
if (Test-Path "C:\COMFYUI") {
    $modelCount = 0
    $customNodeCount = 0
    if (Test-Path "C:\COMFYUI\models") {
        $modelCount = (Get-ChildItem "C:\COMFYUI\models" -Recurse -File -ErrorAction SilentlyContinue | Measure-Object).Count
    }
    if (Test-Path "C:\COMFYUI\custom_nodes") {
        $customNodeCount = (Get-ChildItem "C:\COMFYUI\custom_nodes" -Directory -ErrorAction SilentlyContinue | Measure-Object).Count
    }
    
    $pythonPath = "Not found"
    if (Test-Path "C:\COMFYUI\.venv\Scripts\python.exe") {
        $pythonPath = "C:\COMFYUI\.venv\Scripts\python.exe"
    }
    
    $installations += [PSCustomObject]@{
        Type = "Standalone ComfyUI"
        Path = "C:\COMFYUI"
        ModelCount = $modelCount
        CustomNodes = $customNodeCount
        PythonPath = $pythonPath
    }
}

# Display findings
Write-Host "Found $($installations.Count) ComfyUI installation(s):" -ForegroundColor Yellow
Write-Host ""

foreach ($install in $installations) {
    Write-Host "📦 $($install.Type)" -ForegroundColor Cyan
    Write-Host "   Path: $($install.Path)" -ForegroundColor Gray
    Write-Host "   Models: $($install.ModelCount) files" -ForegroundColor Gray
    Write-Host "   Custom Nodes: $($install.CustomNodes) packages" -ForegroundColor Gray
    Write-Host "   Python: $($install.PythonPath)" -ForegroundColor Gray
    Write-Host ""
}

# Check which one is currently running
Write-Host "`n=== Currently Running ComfyUI ===" -ForegroundColor Cyan
$runningProcess = Get-Process | Where-Object { $_.ProcessName -like '*python*' } | ForEach-Object {
    try {
        $proc = Get-CimInstance Win32_Process -Filter "ProcessId = $($_.Id)" -ErrorAction SilentlyContinue
        if ($proc.CommandLine -like '*main.py*' -and $proc.CommandLine -like '*8000*') {
            return $proc
        }
    } catch {}
}

if ($runningProcess) {
    Write-Host "✓ ComfyUI is running (PID: $($runningProcess.ProcessId))" -ForegroundColor Green
    Write-Host "  Command: $($runningProcess.CommandLine)" -ForegroundColor Gray
    
    # Try to determine working directory
    $cwd = $null
    try {
        $proc = Get-Process -Id $runningProcess.ProcessId
        # Check network connections to see which folder it's serving
        $netstat = netstat -ano | Select-String ":8000.*LISTENING"
        if ($netstat) {
            Write-Host "`n  Listening on port 8000" -ForegroundColor Green
        }
    } catch {}
} else {
    Write-Host "✗ ComfyUI is not currently running" -ForegroundColor Red
}

# Check which installation has more resources
Write-Host "`n=== Recommendation ===" -ForegroundColor Cyan
$primary = $installations | Sort-Object -Property @{Expression={$_.ModelCount + ($_.CustomNodes * 100)}} -Descending | Select-Object -First 1

if ($primary) {
    Write-Host "Based on installed resources, you should use:" -ForegroundColor Yellow
    Write-Host "  $($primary.Type)" -ForegroundColor Green
    Write-Host "  Path: $($primary.Path)" -ForegroundColor Gray
    Write-Host "  (Has $($primary.ModelCount) models and $($primary.CustomNodes) custom nodes)" -ForegroundColor Gray
    
    # Generate the correct task command
    # Note: --disable-mmap flag disables memory-mapped file I/O for safetensors.
    # This prevents Windows pagefile mmap crashes when loading large models (>4GB)
    # that can occur due to Windows pagefile limitations with memory-mapped files.
    Write-Host "`n=== Recommended Task Configuration ===" -ForegroundColor Cyan
    $taskCommand = @"
cd "$($primary.Path)"; & "$($primary.PythonPath)" main.py --listen 127.0.0.1 --port 8000 --enable-cors-header "*" --disable-mmap
"@
    
    Write-Host "Update your VS Code task 'Start ComfyUI Server' to:" -ForegroundColor Yellow
    Write-Host $taskCommand -ForegroundColor Gray
    Write-Host ""
    Write-Host "Note: The --disable-mmap flag prevents Windows pagefile crashes when loading large models." -ForegroundColor DarkGray
    
    # Offer to update the task automatically
    Write-Host "`n"
    $update = Read-Host "Would you like me to update the task automatically? (y/n)"
    
    if ($update -eq 'y' -or $update -eq 'Y') {
        try {
            $tasksFile = ".vscode\tasks.json"
            if (Test-Path $tasksFile) {
                $tasks = Get-Content $tasksFile -Raw | ConvertFrom-Json
                
                # Find and update the Start ComfyUI Server task
                foreach ($task in $tasks.tasks) {
                    if ($task.label -eq "Start ComfyUI Server") {
                        $task.command = $taskCommand
                        Write-Host "✓ Task updated successfully!" -ForegroundColor Green
                        break
                    }
                }
                
                # Save the updated tasks
                $tasks | ConvertTo-Json -Depth 10 | Set-Content $tasksFile
                
                Write-Host "`nPlease restart the 'Start ComfyUI Server' task in VS Code." -ForegroundColor Yellow
            } else {
                Write-Host "✗ Tasks file not found. Please update manually." -ForegroundColor Red
            }
        } catch {
            Write-Host "✗ Error updating tasks: $_" -ForegroundColor Red
            Write-Host "Please update manually using the command above." -ForegroundColor Yellow
        }
    }

    # Offer to patch ComfyUI to avoid pagefile mmap crash
    $patchChoice = Read-Host "Would you like me to apply a safetensors pagefile fallback patch to ComfyUI at $($primary.Path)? (y/n)"
    if ($patchChoice -eq 'y' -or $patchChoice -eq 'Y') {
        $patchScript = Join-Path (Split-Path -Parent $MyInvocation.MyCommand.Definition) "patch-comfyui-handle-pagefile.ps1"
        if (Test-Path $patchScript) {
            & $patchScript -customComfyPath $primary.Path
            Write-Host "✓ Patch applied (if possible). Run scripts\validate-comfyui-patch.ps1 to verify." -ForegroundColor Green
        } else {
            Write-Host "✗ Could not find patch script: $patchScript" -ForegroundColor Yellow
        }
    }
}

# Check for model/node consolidation opportunity
if ($installations.Count -gt 1) {
    Write-Host "`n=== Optional: Consolidate Installations ===" -ForegroundColor Cyan
    Write-Host "You have multiple ComfyUI installations. Consider:" -ForegroundColor Yellow
    Write-Host "1. Use symlinks to share models between installations" -ForegroundColor Gray
    Write-Host "2. Move all models to the installation with more custom nodes" -ForegroundColor Gray
    Write-Host "3. Uninstall the installation you're not using" -ForegroundColor Gray
    Write-Host ""
    Write-Host "This script does NOT automatically uninstall anything for safety." -ForegroundColor Green
}

Write-Host "`n=== Next Steps ===" -ForegroundColor Cyan
Write-Host "1. Stop the current ComfyUI server (if running)" -ForegroundColor White
Write-Host "2. Restart using the correct installation path" -ForegroundColor White
Write-Host "3. In the gemDirect1 app, click 'Auto-Discover Server'" -ForegroundColor White
Write-Host "4. Test the connection" -ForegroundColor White
Write-Host ""
