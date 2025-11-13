#!/usr/bin/env pwsh
# Check what ComfyUI history actually returns for a completed workflow

$ComfyUrl = "http://127.0.0.1:8188"
$promptId = "010dc573-3577-4d09-aa74-29b843e6355a"  # From the test output

Write-Host "[$(Get-Date -Format 'HH:mm:ss')] Fetching history for prompt: $promptId"

try {
    $history = Invoke-RestMethod -Uri "$ComfyUrl/history/$promptId" -TimeoutSec 5
    
    if ($history -and $history.$promptId) {
        Write-Host "`n=== Full History Entry ===" 
        $history.$promptId | ConvertTo-Json -Depth 10 | Write-Host
        
        Write-Host "`n=== Status Field ===" 
        if ($history.$promptId.status) {
            $history.$promptId.status | ConvertTo-Json -Depth 10 | Write-Host
        } else {
            Write-Host "No status field"
        }
        
        Write-Host "`n=== Messages Field ===" 
        if ($history.$promptId.status -and $history.$promptId.status.messages) {
            $history.$promptId.status.messages | ConvertTo-Json -Depth 10 | Write-Host
        } else {
            Write-Host "No status.messages field"
        }
        
        Write-Host "`n=== Outputs Field ===" 
        if ($history.$promptId.outputs) {
            $history.$promptId.outputs | ConvertTo-Json -Depth 10 | Write-Host
        } else {
            Write-Host "No outputs field"
        }
    } else {
        Write-Host "No history for prompt: $promptId"
    }
} catch {
    Write-Host "Error: $_"
}
