param(
    [string] $ProjectRoot = $(Resolve-Path -Path (Join-Path $PSScriptRoot '..')).Path,
    [string] $RunDir = ''
)

# Helper: runs the two Vitest suites and captures logs/exit codes in the provided run directory.
$Timestamp = Get-Date -Format 'yyyyMMdd-HHmmss'
if ([string]::IsNullOrWhiteSpace($RunDir)) {
    $RunDir = Join-Path $ProjectRoot "logs\\$Timestamp"
    New-Item -ItemType Directory -Path $RunDir -Force | Out-Null
} else {
    # Ensure RunDir exists
    New-Item -ItemType Directory -Path $RunDir -Force | Out-Null
}

$SummaryPath = Join-Path $RunDir 'run-summary.txt'

function Add-RunSummary {
    param([string]$Message)
    $line = "[$(Get-Date -Format o)] $Message"
    Add-Content -Path $SummaryPath -Value $line
}

if (-not (Test-Path $SummaryPath)) {
    Set-Content -Path $SummaryPath -Value "Vitest run: $Timestamp"
} else {
    Add-RunSummary "Vitest run (appended): $Timestamp"
}

Add-RunSummary "Log directory initialized: $RunDir"

Push-Location $ProjectRoot
try {
    # Step A: comfyUIService tests
    $ComfyTestLog = Join-Path $RunDir 'vitest-comfyui.log'
    Add-RunSummary "Running: node ./node_modules/vitest/vitest.mjs run --pool=vmThreads services/comfyUIService.test.ts"
    & node .\node_modules\vitest\vitest.mjs run --pool=vmThreads services\comfyUIService.test.ts > $ComfyTestLog 2>&1
    $exit1 = $LASTEXITCODE
    Add-RunSummary "Vitest comfyUI exitCode=$exit1"
    Add-RunSummary "ComfyUI log: $ComfyTestLog"

    # Step B: e2e tests
    $E2eTestLog = Join-Path $RunDir 'vitest-e2e.log'
    Add-RunSummary "Running: node ./node_modules/vitest/vitest.mjs run --pool=vmThreads services/e2e.test.ts"
    & node .\node_modules\vitest\vitest.mjs run --pool=vmThreads services\e2e.test.ts > $E2eTestLog 2>&1
    $exit2 = $LASTEXITCODE
    Add-RunSummary "Vitest e2e exitCode=$exit2"
    Add-RunSummary "E2E log: $E2eTestLog"

    Add-RunSummary "Individual Vitest runs complete"
} finally {
    Pop-Location
}

# Exit with non-zero if either test failed
if ($exit1 -ne 0 -or $exit2 -ne 0) {
    Add-RunSummary "One or more Vitest suites failed (comfy:$exit1, e2e:$exit2)"
    exit 1
}

exit 0
