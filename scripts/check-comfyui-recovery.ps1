Param(
    [int]$Attempts = 12,
    [int]$DelaySeconds = 2
)

$baseUrl = 'http://127.0.0.1:8188'
$s = $null
for ($i = 1; $i -le $Attempts; $i++) {
    try {
        $s = Invoke-RestMethod -Uri "$baseUrl/system_stats" -UseBasicParsing -TimeoutSec 5 -ErrorAction Stop
        Write-Output "[$(Get-Date -Format 'HH:mm:ss')] COMFYUI_OK (attempt=$i)"
        $s | ConvertTo-Json -Depth 6
        break
    } catch {
        Write-Output "[$(Get-Date -Format 'HH:mm:ss')] COMFYUI_WAITING (attempt=$i): $($_.Exception.Message)"
        Start-Sleep -Seconds $DelaySeconds
    }
}

if (-not $s) {
    Write-Output "[$(Get-Date -Format 'HH:mm:ss')] COMFYUI_NOT_REACHABLE"
    exit 2
}

# Check SVD checkpoint directory
$svdPath = 'C:\ComfyUI\ComfyUI_windows_portable\ComfyUI\models\checkpoints\SVD'
if (Test-Path $svdPath) {
    Write-Output "[$(Get-Date -Format 'HH:mm:ss')] SVD_CHECKPOINTS_FOUND: $svdPath"
    try {
        Get-ChildItem -Path $svdPath -File -ErrorAction Stop | Select-Object Name, Length, LastWriteTime | ConvertTo-Json -Depth 2
    } catch {
        Write-Output "[$(Get-Date -Format 'HH:mm:ss')] SVD_LIST_ERROR: $($_.Exception.Message)"
    }
} else {
    Write-Output "[$(Get-Date -Format 'HH:mm:ss')] SVD_CHECKPOINTS_MISSING: $svdPath"
}

# Test input/output writability
$inputDir = 'C:\ComfyUI\ComfyUI_windows_portable\ComfyUI\input'
$outputDir = 'C:\ComfyUI\ComfyUI_windows_portable\ComfyUI\output'
foreach ($dir in @($inputDir, $outputDir)) {
    $exists = Test-Path $dir
    Write-Output "[$(Get-Date -Format 'HH:mm:ss')] DIR_CHECK: $dir Exists=$exists"
    if ($exists) {
        try {
            $timestamp = Get-Date -Format 'yyyyMMdd_HHmmss'
            $testFile = Join-Path $dir "gemdirect_test_$timestamp.txt"
            'gemdirect test' | Out-File -FilePath $testFile -Encoding UTF8 -Force
            if (Test-Path $testFile) {
                Write-Output "[$(Get-Date -Format 'HH:mm:ss')] DIR_WRITE_OK: $testFile"
                Remove-Item $testFile -Force -ErrorAction SilentlyContinue
            } else {
                Write-Output "[$(Get-Date -Format 'HH:mm:ss')] DIR_WRITE_FAIL: $testFile"
            }
        } catch {
            Write-Output "[$(Get-Date -Format 'HH:mm:ss')] DIR_WRITE_ERROR ($dir): $($_.Exception.Message)"
        }
    }
}

Write-Output "[$(Get-Date -Format 'HH:mm:ss')] CHECK_DONE"
exit 0
