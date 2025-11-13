# Monitor ComfyUI output directory for scene gemdirect1_scene-001
$monitorLog = 'C:\Dev\gemDirect1\logs\monitor_scene-001.txt'
if (Test-Path $monitorLog) { Remove-Item $monitorLog -Force -ErrorAction SilentlyContinue }

Start-Job -Name 'monitor_scene001' -ScriptBlock {
    $out='C:\Dev\gemDirect1\logs\monitor_scene-001.txt'
    while ($true) {
        $now=(Get-Date).ToString('o')
        $items = @(Get-ChildItem -Path 'C:\ComfyUI\ComfyUI_windows_portable\ComfyUI\output' -Filter 'gemdirect1_scene-001*' -File -ErrorAction SilentlyContinue | Sort-Object LastWriteTime)
        if ($items.Count -eq 0) {
            "$now NO_FILES" | Out-File -FilePath $out -Append
        } else {
            foreach ($it in $items) {
                "$now $($it.Name) $($it.LastWriteTime.ToString('o'))" | Out-File -FilePath $out -Append
            }
        }
        Start-Sleep -Milliseconds 500
    }
} | Out-Null

Write-Host "Started monitor job 'monitor_scene001'. Logging to $monitorLog"