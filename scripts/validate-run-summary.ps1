param(
    [string] $RunDir
)

if ([string]::IsNullOrWhiteSpace($RunDir)) {
    Write-Error "RunDir is required. Example: -RunDir C:\Dev\gemDirect1\logs\20251111-122115"
    exit 2
}

$SummaryPath = Join-Path $RunDir 'run-summary.txt'
if (-not (Test-Path $SummaryPath)) {
    Write-Output "ERROR: run-summary.txt not found at $SummaryPath"
    exit 2
}

$text = Get-Content -Path $SummaryPath -Raw
$errors = @()
$warnings = @()

if ($text -notmatch 'Story ready:') { $errors += "Missing 'Story ready:' line in run-summary.txt" }
if ($text -notmatch 'Story logline:') { $errors += "Missing 'Story logline:' line in run-summary.txt" }
if ($text -notmatch '\[Scene\s+scene-') { $errors += "No '[Scene ...]' entries found in run-summary.txt" }
if ($text -notmatch 'Vitest comfyUI exitCode=') { $errors += "Missing 'Vitest comfyUI exitCode' entry in run-summary.txt" }
if ($text -notmatch 'Vitest e2e exitCode=') { $errors += "Missing 'Vitest e2e exitCode' entry in run-summary.txt" }
if ($text -notmatch 'Vitest scripts exitCode=') { $errors += "Missing 'Vitest scripts exitCode' entry in run-summary.txt" }
if ($text -notmatch '## Artifact Index') { $errors += "Missing '## Artifact Index' block in run-summary.txt" }

if ($text -match 'Total frames copied:\s*(\d+)') {
    $totalFrames = [int]$Matches[1]
    if ($totalFrames -eq 0) {
        $errors += "Total frames copied reported as 0. Expected > 0 for a successful run."
    }
} else {
    $errors += "Missing 'Total frames copied' entry in run-summary.txt"
}

$artifactJson = Join-Path $RunDir 'artifact-metadata.json'
if (-not (Test-Path $artifactJson)) {
    $errors += "Missing artifact-metadata.json in run directory."
} else {
    try {
        $artifact = Get-Content -Path $artifactJson -Raw | ConvertFrom-Json
        if (-not $artifact.Story?.Id) {
            $errors += "Artifact metadata story id is missing."
        }
        if (-not ($artifact.Scenes -and $artifact.Scenes.Count -gt 0)) {
            $errors += "Artifact metadata does not list any scenes."
        }
        if (-not $artifact.VitestLogs?.ComfyUI -or -not $artifact.VitestLogs?.E2E -or -not $artifact.VitestLogs?.Scripts) {
            $errors += "Artifact metadata missing Vitest log paths."
        }
        if ($artifact.Scenes) {
            foreach ($scene in $artifact.Scenes) {
                $sceneId = $scene.SceneId
                if (-not $sceneId) { continue }
                $scenePattern = "\[Scene\s+$([System.Text.RegularExpressions.Regex]::Escape($sceneId))"
                if ($text -notmatch $scenePattern) {
                    $warnings += "Summary missing main line for $sceneId"
                }
                if ($scene.MeetsFrameFloor -eq $false) {
                    $frameWarnPattern = "\[Scene\s+$([System.Text.RegularExpressions.Regex]::Escape($sceneId))\].*WARNING: Frame count below floor"
                    if ($text -notmatch $frameWarnPattern) {
                        $errors += "Scene $sceneId fell below frame floor but summary lacks WARNING line."
                    }
                }
                $historyNeedsLine = ($scene.HistoryRetrieved -eq $false) -or ($scene.HistoryErrors -and $scene.HistoryErrors.Count -gt 0)
                if ($historyNeedsLine) {
                    $historyPattern = "\[Scene\s+$([System.Text.RegularExpressions.Regex]::Escape($sceneId))\].*HISTORY"
                    if ($text -notmatch $historyPattern) {
                        $errors += "Scene $sceneId had history issues but no HISTORY WARNING/ERROR entry."
                    }
                }
                if ($scene.Success -eq $false) {
                    $errorPattern = "\[Scene\s+$([System.Text.RegularExpressions.Regex]::Escape($sceneId))\].*ERROR"
                    if ($text -notmatch $errorPattern) {
                        $errors += "Scene $sceneId failed but summary lacks ERROR line."
                    }
                }
                if ($scene.Telemetry) {
                    $telemetryPattern = "\[Scene\s+$([System.Text.RegularExpressions.Regex]::Escape($sceneId))\].*Telemetry:"
                    if ($text -notmatch $telemetryPattern) {
                        $warnings += "Scene $sceneId telemetry missing from run-summary."
                    }
                }
            }
        }
    } catch {
        $errors += "Failed to parse artifact metadata: $($_.Exception.Message)"
    }
}

if ($errors.Count -gt 0) {
    Write-Output "run-summary validation: FAIL"
    foreach ($e in $errors) { Write-Output "ERROR: $e" }
    exit 1
}

Write-Output "run-summary validation: PASS"
exit 0
