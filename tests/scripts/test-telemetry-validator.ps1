
$ErrorActionPreference = 'Stop'

function New-MockRunDir {
    param($Path)
    New-Item -ItemType Directory -Path $Path -Force | Out-Null
    
    # Create valid run-summary.txt
    $summaryContent = @"
Story ready: True
Story logline: A test story
[Scene scene-001] Generated
[Scene scene-001] Telemetry: DurationSeconds=10 MaxWaitSeconds=300 PollIntervalSeconds=5 HistoryAttempts=1 HistoryAttemptLimit=0 PostExecutionTimeoutSeconds=600 HistoryExitReason=success HistoryPostExecutionTimeoutReached=false ExecutionSuccessDetected=true ExecutionSuccessAt=2025-12-11T12:00:00Z DoneMarkerWaitSeconds=0s DoneMarkerDetected=true ForcedCopyTriggered=false ForcedCopyDebugPath= pollLimit=unbounded SceneRetryBudget=3 FLF2VEnabled=true FLF2VSource=last-frame FLF2VFallback=false InterpolationElapsed=1234 UpscaleMethod=RIFE FinalFPS=48 FinalResolution=1920x1080
[Scene scene-001] VRAMBeforeMB=1000MB
[Scene scene-001] VRAMAfterMB=1000MB
[Scene scene-001] VRAMDeltaMB=0MB
Vitest comfyUI exitCode=0
Vitest e2e exitCode=0
Vitest scripts exitCode=0
## Artifact Index
Total frames copied: 10
Queue policy: sceneRetries=3, historyMaxWait=300s, historyPollInterval=5s, historyMaxAttempts=unbounded, postExecutionTimeout=600s
"@
    Set-Content -Path (Join-Path $Path 'run-summary.txt') -Value $summaryContent

    # Create valid artifact-metadata.json
    $metadataContent = @"
{
    "Story": { "Id": "story-123" },
    "Scenes": [ 
        { 
            "SceneId": "scene-001",
            "MeetsFrameFloor": true,
            "HistoryRetrieved": true,
            "Success": true,
            "SceneRetryBudget": 3,
            "Telemetry": {
                "DurationSeconds": 10,
                "MaxWaitSeconds": 300,
                "PollIntervalSeconds": 5,
                "HistoryAttempts": 1,
                "HistoryAttemptLimit": 0,
                "PostExecutionTimeoutSeconds": 600,
                "HistoryExitReason": "success",
                "HistoryPostExecutionTimeoutReached": false,
                "ExecutionSuccessDetected": true,
                "ExecutionSuccessAt": "2025-12-11T12:00:00Z",
                "DoneMarkerWaitSeconds": 0,
                "DoneMarkerDetected": true,
                "ForcedCopyTriggered": false,
                "ForcedCopyDebugPath": "",
                "SceneRetryBudget": 3,
                "FLF2VEnabled": true,
                "FLF2VSource": "last-frame",
                "FLF2VFallback": false,
                "InterpolationElapsed": 1234,
                "UpscaleMethod": "RIFE",
                "FinalFPS": 48,
                "FinalResolution": "1920x1080",
                "GPU": {
                    "Name": "NVIDIA GeForce RTX 3090",
                    "VramBeforeMB": 1000,
                    "VramAfterMB": 1000,
                    "VramDeltaMB": 0
                },
                "System": {
                    "FreeMemBeforeMB": 16000,
                    "FreeMemAfterMB": 16000,
                    "FallbackNotes": []
                }
            },
            "Video": {
                "Path": "output/scene-001.mp4",
                "DurationSeconds": 5,
                "Status": "complete",
                "UpdatedAt": "2025-12-11T12:00:00Z",
                "Error": null
            }
        } 
    ],
    "VitestLogs": {
        "ComfyUI": "logs/comfyui.log",
        "E2E": "logs/e2e.log",
        "Scripts": "logs/scripts.log"
    },
    "QueueConfig": {
        "SceneRetryBudget": 3,
        "HistoryMaxWaitSeconds": 300,
        "HistoryPollIntervalSeconds": 5,
        "HistoryMaxAttempts": 0,
        "PostExecutionTimeoutSeconds": 600
    },
    "HelperSummaries": {
        "MappingPreflight": { "Summary": "logs/mapping.txt", "Log": "logs/mapping.log" },
        "ComfyUIStatus": { "Summary": "logs/status.txt", "Log": "logs/status.log" }
    }
}
"@
    Set-Content -Path (Join-Path $Path 'artifact-metadata.json') -Value $metadataContent
    
    # Create dummy mapping summary
    $LogsDir = Join-Path $Path 'logs'
    New-Item -ItemType Directory -Path $LogsDir -Force | Out-Null
    New-Item -ItemType File -Path (Join-Path $LogsDir 'mapping.txt') -Force | Out-Null
    New-Item -ItemType File -Path (Join-Path $LogsDir 'mapping.log') -Force | Out-Null
    New-Item -ItemType File -Path (Join-Path $LogsDir 'status.txt') -Force | Out-Null
    New-Item -ItemType File -Path (Join-Path $LogsDir 'status.log') -Force | Out-Null
}

$TestDir = Join-Path $PSScriptRoot "temp-telemetry-test"
if (Test-Path $TestDir) { Remove-Item $TestDir -Recurse -Force }

try {
    Write-Host "Setting up mock run directory at $TestDir..."
    New-MockRunDir -Path $TestDir
    
    Write-Host "Running validator against mock directory..."
    & "$PSScriptRoot/../../scripts/validate-run-summary.ps1" -RunDir $TestDir
    
    if ($LASTEXITCODE -eq 0) {
        Write-Host "✅ Validator passed on valid data."
    } else {
        Write-Error "❌ Validator failed on valid data. Exit code: $LASTEXITCODE"
    }
}
catch {
    Write-Error "❌ Test failed: $_"
}
finally {
    if (Test-Path $TestDir) { Remove-Item $TestDir -Recurse -Force }
}
