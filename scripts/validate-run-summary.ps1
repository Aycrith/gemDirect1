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
        if (-not $artifact.Story -or -not $artifact.Story.Id) {
            $errors += "Artifact metadata story id is missing."
        }
        if (-not ($artifact.Scenes -and $artifact.Scenes.Count -gt 0)) {
            $errors += "Artifact metadata does not list any scenes."
        }
        if (-not $artifact.VitestLogs -or -not $artifact.VitestLogs.ComfyUI -or -not $artifact.VitestLogs.E2E -or -not $artifact.VitestLogs.Scripts) {
            $errors += "Artifact metadata missing Vitest log paths."
        }
        if (-not $artifact.QueueConfig) {
            $errors += "Artifact metadata missing QueueConfig."
        } else {
            if (-not ($artifact.QueueConfig.PSObject.Properties.Name -contains 'SceneRetryBudget')) {
                $errors += "QueueConfig missing SceneRetryBudget."
            }
            $queueLinePattern = 'Queue policy:\s*sceneRetries=(\d+),\s*historyMaxWait=(\d+)s,\s*historyPollInterval=(\d+)s,\s*historyMaxAttempts=([\d]+|unbounded),\s*postExecutionTimeout=(\d+)s'
            $queueLineMatch = [System.Text.RegularExpressions.Regex]::Match($text, $queueLinePattern)
            if (-not $queueLineMatch.Success) {
                $errors += "Run summary missing Queue policy line."
            } else {
                $parsedSceneRetries = [int]$queueLineMatch.Groups[1].Value
                if ($artifact.QueueConfig.SceneRetryBudget -ne $parsedSceneRetries) {
                    $errors += "Queue policy sceneRetries (${parsedSceneRetries}) does not match QueueConfig ($($artifact.QueueConfig.SceneRetryBudget))."
                }
                $parsedHistoryWait = [int]$queueLineMatch.Groups[2].Value
                if ($artifact.QueueConfig.HistoryMaxWaitSeconds -ne $parsedHistoryWait) {
                    $errors += "Queue policy historyMaxWait (${parsedHistoryWait}) does not match QueueConfig ($($artifact.QueueConfig.HistoryMaxWaitSeconds))."
                }
                $parsedPollInterval = [int]$queueLineMatch.Groups[3].Value
                if ($artifact.QueueConfig.HistoryPollIntervalSeconds -ne $parsedPollInterval) {
                    $errors += "Queue policy historyPollInterval (${parsedPollInterval}) does not match QueueConfig ($($artifact.QueueConfig.HistoryPollIntervalSeconds))."
                }
                $parsedAttemptLimit = $queueLineMatch.Groups[4].Value
                if ($parsedAttemptLimit -eq 'unbounded') {
                    if ($artifact.QueueConfig.HistoryMaxAttempts -ne 0) {
                        $errors += "Queue policy historyMaxAttempts 'unbounded' does not match QueueConfig ($($artifact.QueueConfig.HistoryMaxAttempts))."
                    }
                } else {
                    if ([int]$parsedAttemptLimit -ne $artifact.QueueConfig.HistoryMaxAttempts) {
                        $errors += "Queue policy historyMaxAttempts (${parsedAttemptLimit}) does not match QueueConfig ($($artifact.QueueConfig.HistoryMaxAttempts))."
                    }
                }
                $parsedPostExec = [int]$queueLineMatch.Groups[5].Value
                if ($artifact.QueueConfig.PostExecutionTimeoutSeconds -ne $parsedPostExec) {
                    $errors += "Queue policy postExecutionTimeout (${parsedPostExec}) does not match QueueConfig ($($artifact.QueueConfig.PostExecutionTimeoutSeconds))."
                }
            }
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
                if (-not ($scene.PSObject.Properties.Name -contains 'SceneRetryBudget')) {
                    $errors += "Scene $sceneId metadata missing SceneRetryBudget."
                }
                if (-not $scene.Telemetry) {
                    $errors += "Scene $sceneId telemetry payload missing from artifact metadata."
                } else {
                    $telemetryPattern = "\[Scene\s+$([System.Text.RegularExpressions.Regex]::Escape($sceneId))\].*Telemetry:"
                    if ($text -notmatch $telemetryPattern) {
                        $errors += "Scene $sceneId telemetry missing from run-summary."
                    }
                    if ($null -eq $scene.Telemetry.DurationSeconds) {
                        $errors += "Scene $sceneId telemetry missing DurationSeconds."
                    }
                    if ($null -eq $scene.Telemetry.MaxWaitSeconds) {
                        $errors += "Scene $sceneId telemetry missing MaxWaitSeconds."
                    }
                    if ($null -eq $scene.Telemetry.PollIntervalSeconds) {
                        $errors += "Scene $sceneId telemetry missing PollIntervalSeconds."
                    }
                    if ($null -eq $scene.Telemetry.HistoryAttempts) {
                        $errors += "Scene $sceneId telemetry missing HistoryAttempts."
                    }
                    if ($null -eq $scene.Telemetry.HistoryAttemptLimit) {
                        $errors += "Scene $sceneId telemetry missing HistoryAttemptLimit."
                    }
                    if ($null -eq $scene.Telemetry.PostExecutionTimeoutSeconds) {
                        $errors += "Scene $sceneId telemetry missing PostExecutionTimeoutSeconds."
                    }
                    if ($null -eq $scene.Telemetry.HistoryExitReason) {
                        $errors += "Scene $sceneId telemetry missing HistoryExitReason."
                    } else {
                        # Validate exit reason is one of the expected values (per ComfyUI /history spec)
                        $validExitReasons = @('success', 'maxWait', 'attemptLimit', 'postExecution', 'unknown')
                        if ($scene.Telemetry.HistoryExitReason -notin $validExitReasons) {
                            $errors += "Scene $sceneId telemetry HistoryExitReason '$($scene.Telemetry.HistoryExitReason)' is not a recognized value (expected: success, maxWait, attemptLimit, postExecution, or unknown)."
                        }
                    }
                    if (-not ($scene.Telemetry.PSObject.Properties.Name -contains 'HistoryPostExecutionTimeoutReached')) {
                        $errors += "Scene $sceneId telemetry missing HistoryPostExecutionTimeoutReached."
                    }
                    if (-not ($scene.Telemetry.PSObject.Properties.Name -contains 'ExecutionSuccessDetected')) {
                        $errors += "Scene $sceneId telemetry missing ExecutionSuccessDetected."
                    }
                    if (-not ($scene.Telemetry.PSObject.Properties.Name -contains 'ExecutionSuccessAt')) {
                        $errors += "Scene $sceneId telemetry missing ExecutionSuccessAt."
                    }
                    if (-not ($scene.Telemetry.PSObject.Properties.Name -contains 'SceneRetryBudget')) {
                        $errors += "Scene $sceneId telemetry missing SceneRetryBudget."
                    }
                    if ($scene.Telemetry.ExecutionSuccessDetected -and -not $scene.Telemetry.ExecutionSuccessAt) {
                        $errors += "Scene $sceneId telemetry signals ExecutionSuccessDetected but lacks ExecutionSuccessAt."
                    }
                    $escapedSceneId = [System.Text.RegularExpressions.Regex]::Escape($sceneId)
                    $pollLimitPattern = "\[Scene\s+$escapedSceneId\].*Telemetry:.*pollLimit=([^|\s]+)"
                    $pollLimitMatch = [System.Text.RegularExpressions.Regex]::Match($text, $pollLimitPattern)
                    if (-not $pollLimitMatch.Success) {
                        $errors += "Scene $sceneId telemetry summary missing pollLimit entry."
                    } else {
                        $reportedPollLimit = $pollLimitMatch.Groups[1].Value
                        $expectedPollLimit = if ($scene.Telemetry.HistoryAttemptLimit -gt 0) { $scene.Telemetry.HistoryAttemptLimit.ToString() } else { 'unbounded' }
                        if ($reportedPollLimit -ne $expectedPollLimit) {
                            $errors += "Scene $sceneId telemetry pollLimit (${reportedPollLimit}) does not match metadata (${expectedPollLimit})."
                        }
                    }
                    $retryPattern = "\[Scene\s+$escapedSceneId\].*SceneRetryBudget=([^|\s]+)"
                    $retryMatch = [System.Text.RegularExpressions.Regex]::Match($text, $retryPattern)
                    if (-not $retryMatch.Success) {
                        $errors += "Scene $sceneId telemetry summary missing SceneRetryBudget entry."
                    } else {
                        $reportedRetryBudget = $retryMatch.Groups[1].Value
                        $expectedRetryBudget = if ($scene.Telemetry.SceneRetryBudget -gt 0) { $scene.Telemetry.SceneRetryBudget.ToString() } else { 'unbounded' }
                        if ($reportedRetryBudget -ne $expectedRetryBudget) {
                            $errors += "Scene $sceneId telemetry SceneRetryBudget (${reportedRetryBudget}) does not match metadata (${expectedRetryBudget})."
                        }
                    }
                    if (-not $scene.Telemetry.GPU -or [string]::IsNullOrWhiteSpace($scene.Telemetry.GPU.Name)) {
                        $errors += "Scene $sceneId telemetry missing GPU name."
                    } else {
                        # Check raw VRAM free values (source data before MB conversion)
                        if ($null -ne $scene.Telemetry.GPU.VramFreeBefore -or $null -ne $scene.Telemetry.GPU.VramFreeAfter) {
                            # Raw VRAM values present (optional, used for /system_stats backup)
                        }
                        # Check converted VRAM MB values (required for display)
                        if (-not ($scene.Telemetry.GPU.PSObject.Properties.Name -contains 'VramBeforeMB')) {
                            $errors += "Scene $sceneId telemetry GPU missing VramBeforeMB (converted MB value)."
                        }
                        if (-not ($scene.Telemetry.GPU.PSObject.Properties.Name -contains 'VramAfterMB')) {
                            $errors += "Scene $sceneId telemetry GPU missing VramAfterMB (converted MB value)."
                        }
                        if (-not ($scene.Telemetry.GPU.PSObject.Properties.Name -contains 'VramDeltaMB')) {
                            $errors += "Scene $sceneId telemetry GPU missing VramDeltaMB (delta in MB)."
                        }
                        # When both before and after MB values exist, delta should exist
                        if (($null -ne $scene.Telemetry.GPU.VramBeforeMB) -and ($null -ne $scene.Telemetry.GPU.VramAfterMB) -and ($null -eq $scene.Telemetry.GPU.VramDeltaMB)) {
                            $errors += "Scene $sceneId telemetry: VramBeforeMB and VramAfterMB present but VramDeltaMB is missing (should be computed diff)."
                        }
                    }
                    if (-not $scene.Telemetry.System) {
                        $errors += "Scene $sceneId telemetry missing System diagnostics."
                    } elseif (-not $scene.Telemetry.System.PSObject.Properties.Name -contains 'FallbackNotes') {
                        $errors += "Scene $sceneId telemetry System diagnostics missing FallbackNotes entry."
                    } else {
                        $fallbackNotes = $scene.Telemetry.System.FallbackNotes
                        if ($fallbackNotes -and $fallbackNotes.Count -gt 0) {
                            foreach ($note in $fallbackNotes) {
                                $escapedNote = [System.Text.RegularExpressions.Regex]::Escape($note)
                                $fallbackPattern = "\[Scene\s+$escapedSceneId\].*${escapedNote}"
                                if ($text -notmatch $fallbackPattern) {
                                    $errors += "Scene $sceneId telemetry fallback note '$note' missing from run-summary."
                                }
                            }
                        }
                    }
                    $vramBeforePattern = "\[Scene\s+$escapedSceneId\].*VRAMBeforeMB=([^|\s]+)MB"
                    if ($scene.Telemetry.GPU.VramBeforeMB -ne $null) {
                        $vramBeforeMatch = [System.Text.RegularExpressions.Regex]::Match($text, $vramBeforePattern)
                        if (-not $vramBeforeMatch.Success) {
                            $errors += "Scene $sceneId telemetry summary missing VRAMBeforeMB entry."
                        }
                    }
                    $vramAfterPattern = "\[Scene\s+$escapedSceneId\].*VRAMAfterMB=([^|\s]+)MB"
                    if ($scene.Telemetry.GPU.VramAfterMB -ne $null) {
                        $vramAfterMatch = [System.Text.RegularExpressions.Regex]::Match($text, $vramAfterPattern)
                        if (-not $vramAfterMatch.Success) {
                            $errors += "Scene $sceneId telemetry summary missing VRAMAfterMB entry."
                        }
                    }
                    $vramDeltaPattern = "\[Scene\s+$escapedSceneId\].*VRAMDeltaMB=([^|\s]+)MB"
                    if ($scene.Telemetry.GPU.VramDeltaMB -ne $null) {
                        $vramDeltaMatch = [System.Text.RegularExpressions.Regex]::Match($text, $vramDeltaPattern)
                        if (-not $vramDeltaMatch.Success) {
                            $errors += "Scene $sceneId telemetry summary missing VRAMDeltaMB entry."
                        }
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

if ($warnings.Count -gt 0) {
    foreach ($w in $warnings) { Write-Output "WARNING: $w" }
}

Write-Output "run-summary validation: PASS"
exit 0
