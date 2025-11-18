# Start dev server as a background job
Write-Host "Starting dev server as background job..."
$devServerJob = Start-Job -ScriptBlock {
    Set-Location 'C:\Dev\gemDirect1'
    npm run dev
} -Name "DevServer"

# Wait for dev server to be ready
Write-Host "Waiting for dev server to start..."
Start-Sleep -Seconds 3

# Verify port is listening
$attempts = 0
while ($attempts -lt 10) {
    try {
        $sock = New-Object System.Net.Sockets.TcpClient
        $sock.Connect('127.0.0.1', 3000)
        $sock.Close()
        Write-Host "Dev server is ready on port 3000"
        break
    }
    catch {
        $attempts++
        Write-Host "Attempt $($attempts): Dev server not ready yet, waiting..."
        Start-Sleep -Seconds 1
    }
}

if ($attempts -eq 10) {
    Write-Host "Dev server failed to start after 10 attempts"
    Stop-Job -Job $devServerJob
    exit 1
}

# Run svd-basic test
Write-Host "`nRunning svd-basic Playwright test..."
Set-Location 'C:\Dev\gemDirect1'
$env:E2E_APP_URL='http://localhost:3000'
npx playwright test tests/e2e/svd-basic.spec.ts

$svdResult = $LASTEXITCODE
Write-Host "SVD test exit code: $svdResult"

# Run wan-basic test  
Write-Host "`nRunning wan-basic Playwright test..."
npx playwright test tests/e2e/wan-basic.spec.ts

$wanResult = $LASTEXITCODE
Write-Host "WAN test exit code: $wanResult"

# Clean up dev server job
Write-Host "`nStopping dev server..."
Stop-Job -Job $devServerJob
Remove-Job -Job $devServerJob

Write-Host "Testing complete!"
Write-Host "SVD Result: $svdResult"
Write-Host "WAN Result: $wanResult"
