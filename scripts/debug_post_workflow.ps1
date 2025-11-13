$WorkflowPath = 'C:\Dev\gemDirect1\workflows\text-to-video.json'
$keyframeName = 'scene-001_keyframe.png'
$scenePrefix = 'gemdirect1_scene-001'
$comfyUrl = 'http://127.0.0.1:8188'

$w = Get-Content $WorkflowPath -Raw | ConvertFrom-Json
$w.'2'.inputs.image = $keyframeName
$w.'2'.widgets_values[0] = $keyframeName
$w.'7'.inputs.filename_prefix = $scenePrefix
$payload = @{ prompt = $w; client_id = 'debug-client' }
$b = $payload | ConvertTo-Json -Depth 30
try {
    $r = Invoke-RestMethod -Uri "$comfyUrl/prompt" -Method POST -ContentType 'application/json' -Body $b -TimeoutSec 15 -ErrorAction Stop
    Write-Host 'OK'
    $r | ConvertTo-Json -Depth 10 | Write-Host
} catch {
    Write-Host 'ERROR POST'
    Write-Host $_.Exception.Message
    if ($_.Exception.Response) {
        try {
            $stream = $_.Exception.Response.GetResponseStream()
            $reader = New-Object System.IO.StreamReader($stream)
            $body = $reader.ReadToEnd()
            Write-Host 'RESPONSE BODY:'
            Write-Host $body
        } catch {
            Write-Host 'No response body available'
        }
    }
}
