param(
    [string] $ProjectRoot = $(Resolve-Path -Path (Join-Path $PSScriptRoot '..')).Path,
    [string] $RunDir = ''
)

$MinimumNodeVersion = '22.19.0'

function Assert-NodeVersion {
    param(
        [string] $MinimumVersion = '22.19.0'
    )

    $nodeVersionOutput = & node -v 2>$null
    if ([string]::IsNullOrWhiteSpace($nodeVersionOutput)) {
        throw "Node.js not found in PATH. Minimum required version is v$MinimumVersion."
    }

    try {
        $parsedVersion = [version]($nodeVersionOutput.TrimStart('v'))
        $requiredVersion = [version]$MinimumVersion
    } catch {
        throw "Unable to parse Node.js version output '$nodeVersionOutput'."
    }

    if ($parsedVersion -lt $requiredVersion) {
        throw "Node.js v$MinimumVersion or newer is required. Current version: $nodeVersionOutput."
    }
}

Assert-NodeVersion -MinimumVersion $MinimumNodeVersion

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

function Get-VitestCliPath {
    param([string] $Root)
    $cli = Join-Path $Root 'node_modules\vitest\vitest.mjs'
    if (-not (Test-Path $cli)) {
        throw "Vitest CLI not found at $cli. Run npm ci before executing tests."
    }
    return (Resolve-Path $cli).Path
}

$VitestCli = Get-VitestCliPath -Root $ProjectRoot
$script:VitestSuiteTelemetry = @()

function Invoke-VitestSuite {
    param(
        [Parameter(Mandatory = $true)]
        [string] $Label,
        [Parameter(Mandatory = $true)]
        [string[]] $Args,
        [Parameter(Mandatory = $true)]
        [string] $LogPath
    )

    Add-RunSummary ("Running: vitest CLI -- {0}" -f ($Args -join ' '))
    $suiteStart = Get-Date
    & node $VitestCli @Args 2>&1 | Tee-Object -FilePath $LogPath | Out-Null
    $exitCode = $LASTEXITCODE
    $suiteDuration = (Get-Date) - $suiteStart
    $script:VitestSuiteTelemetry += [pscustomobject]@{
        Suite = $Label
        ExitCode = $exitCode
        DurationMs = [math]::Round($suiteDuration.TotalMilliseconds, 0)
        LogPath = $LogPath
        StartedAt = $suiteStart.ToString('o')
    }
    Add-RunSummary ("Vitest {0} exitCode={1}" -f $Label, $exitCode)
    Add-RunSummary ("Vitest {0} duration={1}ms" -f $Label, [math]::Round($suiteDuration.TotalMilliseconds, 0))
    Add-RunSummary ("{0} log: {1}" -f $Label, $LogPath)
    return $exitCode
}

if (-not (Test-Path $SummaryPath)) {
    Set-Content -Path $SummaryPath -Value "Vitest run: $Timestamp"
} else {
    Add-RunSummary "Vitest run (appended): $Timestamp"
}

Add-RunSummary "Log directory initialized: $RunDir"

Push-Location $ProjectRoot
try {
    $ComfyTestLog = Join-Path $RunDir 'vitest-comfyui.log'
    $exit1 = Invoke-VitestSuite -Label 'comfyUI' -Args @('run', '--pool=vmThreads', 'services/comfyUIService.test.ts') -LogPath $ComfyTestLog

    $E2eTestLog = Join-Path $RunDir 'vitest-e2e.log'
    $exit2 = Invoke-VitestSuite -Label 'e2e' -Args @('run', '--pool=vmThreads', 'services/e2e.test.ts') -LogPath $E2eTestLog

    $ScriptsTestLog = Join-Path $RunDir 'vitest-scripts.log'
    $exit3 = Invoke-VitestSuite -Label 'scripts' -Args @('run', 'scripts/__tests__') -LogPath $ScriptsTestLog

    Add-RunSummary "Individual Vitest runs complete"
} finally {
    Pop-Location
}

# Write a machine-readable JSON result so callers can parse exit codes and log paths
$ResultPath = Join-Path $RunDir 'vitest-results.json'
$resultObj = @{ 
    comfyExit = $exit1; 
    e2eExit = $exit2; 
    scriptsExit = $exit3;
    comfyLog = (Resolve-Path -Path $ComfyTestLog -ErrorAction SilentlyContinue).Path;
    e2eLog = (Resolve-Path -Path $E2eTestLog -ErrorAction SilentlyContinue).Path;
    scriptsLog = (Resolve-Path -Path $ScriptsTestLog -ErrorAction SilentlyContinue).Path;
    runDir = (Resolve-Path -Path $RunDir).Path;
    timestamp = $Timestamp;
    suites = $script:VitestSuiteTelemetry
}
$resultJson = $resultObj | ConvertTo-Json -Depth 6
Set-Content -Path $ResultPath -Value $resultJson -Encoding UTF8
Add-RunSummary "Wrote vitest results JSON: $ResultPath"

# Exit with non-zero if any test failed
if ($exit1 -ne 0 -or $exit2 -ne 0 -or $exit3 -ne 0) {
    Add-RunSummary "One or more Vitest suites failed (comfy:$exit1, e2e:$exit2, scripts:$exit3)"
    exit 1
}

exit 0
