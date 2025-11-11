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
if ($text -notmatch '\[Scene\s+scene-') { $errors += "No '[Scene ...]' entries found in run-summary.txt" }
if ($text -notmatch 'Vitest comfyUI exitCode=') { $errors += "Missing 'Vitest comfyUI exitCode' entry in run-summary.txt" }
if ($text -notmatch 'Vitest e2e exitCode=') { $errors += "Missing 'Vitest e2e exitCode' entry in run-summary.txt" }
if ($text -notmatch '## Artifact Index') { $errors += "Missing '## Artifact Index' block in run-summary.txt" }

if ($text -match 'Total frames copied:\s*(\d+)') {
    $totalFrames = [int]$Matches[1]
    if ($totalFrames -eq 0) {
        $errors += "Total frames copied reported as 0. Expected > 0 for a successful run."
    }
} else {
    $errors += "Missing 'Total frames copied' entry in run-summary.txt"
}

if ($errors.Count -gt 0) {
    Write-Output "run-summary validation: FAIL"
    foreach ($e in $errors) { Write-Output "ERROR: $e" }
    exit 1
}

Write-Output "run-summary validation: PASS"
exit 0
