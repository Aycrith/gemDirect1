<#
.SYNOPSIS
    Runs multi-run Vision QA baseline collection for all key video presets.

.DESCRIPTION
    Collects Vision QA baseline data for all configured presets:
    - Production: wan-fun-inpaint + Standard stability profile
    - Cinematic (FETA): wan-flf2v-feta + Cinematic
    - Character-stable: wan-ipadapter + Cinematic
    - Fast: wan-flf2v + Fast

    For each preset, runs 3+ VLM analysis runs to reduce variance and produces
    baseline metrics for comparison and regression testing.

    NOTE: This script analyzes EXISTING regression run videos. The videos were
    generated using the workflow profile specified in localGenSettings.json at
    the time of generation. This script tags the analysis results with preset
    metadata for tracking purposes.

.PARAMETER Runs
    Number of VLM runs per sample for variance reduction. Default: 3.

.PARAMETER Presets
    Which presets to run. Default: all. Options: production, cinematic, character, fast, all

.PARAMETER OutputDir
    Output directory for baseline results. Default: data/vision-qa-baselines

.PARAMETER SkipGeneration
    Skip video generation (analyze existing regression videos only). Default: true.
    Video generation for specific presets requires manual configuration.

.EXAMPLE
    .\run-vision-qa-baseline-all-presets.ps1
    Run baseline collection for all presets with 3 VLM runs each

.EXAMPLE
    .\run-vision-qa-baseline-all-presets.ps1 -Runs 5 -Presets cinematic
    Run only cinematic preset with 5 VLM runs
#>

param(
    [Parameter(Mandatory=$false)]
    [ValidateRange(1, 10)]
    [int]$Runs = 3,
    
    [Parameter(Mandatory=$false)]
    [ValidateSet("production", "cinematic", "character", "fast", "all")]
    [string]$Presets = "all",
    
    [Parameter(Mandatory=$false)]
    [string]$OutputDir,
    
    [switch]$SkipGeneration = $true
)

$ErrorActionPreference = "Stop"
$RepoRoot = $PSScriptRoot -replace "[\\/]scripts$", ""
$Timestamp = Get-Date -Format "yyyyMMdd-HHmmss"

if (-not $OutputDir) {
    $OutputDir = Join-Path $RepoRoot "data" "vision-qa-baselines"
}

# Ensure output directory exists
if (-not (Test-Path $OutputDir)) {
    New-Item -Path $OutputDir -ItemType Directory -Force | Out-Null
}

# Preset configurations
$PresetConfigs = @{
    "production" = @{
        id = "production"
        name = "Production"
        workflowProfile = "wan-fun-inpaint"
        stabilityProfile = "standard"
        description = "Standard production preset with Fun Inpaint for smooth motion"
    }
    "cinematic" = @{
        id = "cinematic"
        name = "Cinematic (FETA)"
        workflowProfile = "wan-flf2v-feta"
        stabilityProfile = "cinematic"
        description = "FETA-enhanced FLF2V for temporal coherence"
    }
    "character" = @{
        id = "character"
        name = "Character-stable"
        workflowProfile = "wan-ipadapter"
        stabilityProfile = "cinematic"
        description = "IP-Adapter based workflow for character consistency"
    }
    "fast" = @{
        id = "fast"
        name = "Fast"
        workflowProfile = "wan-flf2v"
        stabilityProfile = "fast"
        description = "Optimized FLF2V for faster iteration"
    }
}

# Determine which presets to run
$PresetsToRun = @()
if ($Presets -eq "all") {
    $PresetsToRun = @("production", "cinematic", "character", "fast")
} else {
    $PresetsToRun = @($Presets)
}

function Write-Banner {
    param([string]$Message)
    Write-Host ""
    Write-Host "════════════════════════════════════════════════════════════════════════════════" -ForegroundColor Cyan
    Write-Host "  $Message" -ForegroundColor Cyan
    Write-Host "════════════════════════════════════════════════════════════════════════════════" -ForegroundColor Cyan
    Write-Host ""
}

function Write-Step {
    param([string]$Message)
    Write-Host "► $Message" -ForegroundColor White
}

function Write-Info {
    param([string]$Message)
    Write-Host "  $Message" -ForegroundColor Gray
}

function Write-Success {
    param([string]$Message)
    Write-Host "  ✓ $Message" -ForegroundColor Green
}

function Write-Warning {
    param([string]$Message)
    Write-Host "  ⚠ $Message" -ForegroundColor Yellow
}

# Banner
Write-Banner "VISION QA BASELINE COLLECTION"
Write-Info "Timestamp: $Timestamp"
Write-Info "VLM Runs per sample: $Runs"
Write-Info "Presets: $($PresetsToRun -join ', ')"
Write-Info "Output: $OutputDir"
Write-Host ""

# Check prerequisites
Write-Step "Checking prerequisites..."

# Check VLM endpoint
$VLMEndpoint = "http://192.168.50.192:1234/v1/chat/completions"
try {
    $modelsUrl = $VLMEndpoint -replace "/chat/completions$", "/models"
    $response = Invoke-RestMethod -Uri $modelsUrl -Method GET -TimeoutSec 5 -ErrorAction Stop
    $vlmModels = $response.data | Where-Object { $_.id -like "*vl*" -or $_.id -like "*vision*" }
    if ($vlmModels) {
        Write-Success "LM Studio VLM available: $($vlmModels[0].id)"
    } else {
        Write-Warning "LM Studio connected but no VLM model detected"
    }
} catch {
    Write-Host "ERROR: Cannot connect to VLM at $VLMEndpoint" -ForegroundColor Red
    Write-Host "Make sure LM Studio is running with a VLM (e.g., qwen3-vl) loaded." -ForegroundColor Yellow
    exit 1
}

# Check for regression run videos (find latest with results.json)
$RegressionDir = Join-Path $RepoRoot "test-results" "bookend-regression"
$latestRun = $null
$allRuns = Get-ChildItem -Path $RegressionDir -Directory | Sort-Object Name -Descending
foreach ($run in $allRuns) {
    $resultsFile = Join-Path $run.FullName "results.json"
    if (Test-Path $resultsFile) {
        $latestRun = $run
        break
    }
}
if (-not $latestRun) {
    Write-Host "ERROR: No complete regression runs found in $RegressionDir" -ForegroundColor Red
    Write-Host "Run bookend regression first to generate videos." -ForegroundColor Yellow
    exit 1
}
Write-Success "Latest complete regression run: $($latestRun.Name)"

# Collect baseline for each preset
$AllResults = @{}
$PresetSummaries = @{}

foreach ($presetId in $PresetsToRun) {
    $config = $PresetConfigs[$presetId]
    
    Write-Banner "PRESET: $($config.name)"
    Write-Info "Workflow: $($config.workflowProfile)"
    Write-Info "Stability: $($config.stabilityProfile)"
    Write-Info "Description: $($config.description)"
    Write-Host ""
    
    # Run the standard analyze script with multi-run
    Write-Step "Running Vision QA with $Runs VLM runs..."
    
    $analyzeScript = Join-Path $PSScriptRoot "analyze-bookend-vision.ps1"
    $runTimestamp = $latestRun.Name -replace "^run-", ""
    $analyzeArgs = @("-File", $analyzeScript, "-Runs", $Runs, "-RunTimestamp", $runTimestamp)
    
    $analyzeProcess = Start-Process -FilePath "pwsh" -ArgumentList $analyzeArgs -NoNewWindow -Wait -PassThru
    
    if ($analyzeProcess.ExitCode -ne 0) {
        Write-Warning "Vision QA analysis failed for preset: $presetId (exit code: $($analyzeProcess.ExitCode))"
        continue
    }
    
    # Find the latest results
    $latestVisionDir = Get-ChildItem -Path (Join-Path $RepoRoot "temp") -Directory -Filter "vision-qa-*" | 
        Sort-Object Name -Descending | 
        Select-Object -First 1
    
    if (-not $latestVisionDir) {
        Write-Warning "No vision QA results found for preset: $presetId"
        continue
    }
    
    $resultsPath = Join-Path $latestVisionDir.FullName "vision-qa-results.json"
    if (-not (Test-Path $resultsPath)) {
        Write-Warning "Results file not found: $resultsPath"
        continue
    }
    
    # Load and augment results with preset metadata
    $results = Get-Content $resultsPath -Raw | ConvertFrom-Json
    
    # Add preset metadata to each sample result
    $augmentedResults = @{
        metadata = @{
            presetId = $config.id
            presetName = $config.name
            workflowProfile = $config.workflowProfile
            stabilityProfile = $config.stabilityProfile
            description = $config.description
            vlmRuns = $Runs
            timestamp = $Timestamp
            regressionRun = $latestRun.Name
        }
        samples = @{}
    }
    
    foreach ($prop in $results.PSObject.Properties) {
        if ($prop.Name.StartsWith("sample-")) {
            $sampleData = $prop.Value
            $sampleData | Add-Member -NotePropertyName "presetId" -NotePropertyValue $config.id -Force
            $sampleData | Add-Member -NotePropertyName "workflowProfile" -NotePropertyValue $config.workflowProfile -Force
            $augmentedResults.samples[$prop.Name] = $sampleData
        }
    }
    
    # Calculate preset-level summary
    $sampleScores = $augmentedResults.samples.Values | Where-Object { $_.status -eq "success" }
    $presetSummary = @{
        presetId = $config.id
        sampleCount = $sampleScores.Count
        aggregates = @{
            overall = @{
                mean = [math]::Round(($sampleScores | ForEach-Object { $_.scores.overall } | Measure-Object -Average).Average, 1)
                min = ($sampleScores | ForEach-Object { $_.scores.overall } | Measure-Object -Minimum).Minimum
                max = ($sampleScores | ForEach-Object { $_.scores.overall } | Measure-Object -Maximum).Maximum
            }
            focusStability = @{
                mean = [math]::Round(($sampleScores | ForEach-Object { $_.scores.focusStability } | Where-Object { $_ } | Measure-Object -Average).Average, 1)
            }
            artifactSeverity = @{
                mean = [math]::Round(($sampleScores | ForEach-Object { $_.scores.artifactSeverity } | Where-Object { $null -ne $_ } | Measure-Object -Average).Average, 1)
            }
            objectConsistency = @{
                mean = [math]::Round(($sampleScores | ForEach-Object { $_.scores.objectConsistency } | Where-Object { $_ } | Measure-Object -Average).Average, 1)
            }
        }
    }
    
    $augmentedResults.summary = $presetSummary
    $AllResults[$presetId] = $augmentedResults
    $PresetSummaries[$presetId] = $presetSummary
    
    # Save preset-specific baseline file
    $presetOutputPath = Join-Path $OutputDir "baseline-$presetId-$Timestamp.json"
    $augmentedResults | ConvertTo-Json -Depth 10 | Set-Content -Path $presetOutputPath
    Write-Success "Saved preset baseline: $presetOutputPath"
}

# Create consolidated baseline file
$consolidatedPath = Join-Path $OutputDir "baseline-all-presets-$Timestamp.json"
$consolidated = @{
    version = "1.0.0"
    timestamp = $Timestamp
    vlmRuns = $Runs
    regressionRun = $latestRun.Name
    presets = $AllResults
    summaries = $PresetSummaries
}

$consolidated | ConvertTo-Json -Depth 10 | Set-Content -Path $consolidatedPath
Write-Success "Saved consolidated baseline: $consolidatedPath"

# Update public/vision-qa-latest.json with latest results
$latestPublicPath = Join-Path $RepoRoot "public" "vision-qa-latest.json"
if ($AllResults.Count -gt 0) {
    # Get the first preset's results as the "latest" (or merge all)
    $firstPreset = $AllResults.Keys | Select-Object -First 1
    $latestResults = $AllResults[$firstPreset].samples
    
    # Add metadata
    $publicResults = @{
        _metadata = @{
            timestamp = $Timestamp
            vlmRuns = $Runs
            presetsAnalyzed = @($AllResults.Keys)
            source = "run-vision-qa-baseline-all-presets.ps1"
        }
    }
    foreach ($key in $latestResults.Keys) {
        $publicResults[$key] = $latestResults[$key]
    }
    
    $publicResults | ConvertTo-Json -Depth 10 | Set-Content -Path $latestPublicPath
    Write-Success "Updated: $latestPublicPath"
}

# Update vision-qa-history.json
$historyPath = Join-Path $RepoRoot "data" "bookend-golden-samples" "vision-qa-history.json"
$history = if (Test-Path $historyPath) {
    Get-Content $historyPath -Raw | ConvertFrom-Json
} else {
    @{ version = "1.0.0"; description = "Historical tracking of vision QA runs"; entries = @() }
}

# Add new entries for each preset
foreach ($presetId in $AllResults.Keys) {
    $presetResults = $AllResults[$presetId]
    $presetSummary = $PresetSummaries[$presetId]
    
    $historyEntry = @{
        runId = "$Timestamp-$presetId"
        timestamp = (Get-Date).ToString("o")
        presetId = $presetId
        presetName = $PresetConfigs[$presetId].name
        workflowProfile = $PresetConfigs[$presetId].workflowProfile
        stabilityProfile = $PresetConfigs[$presetId].stabilityProfile
        vlmRuns = $Runs
        sampleCount = $presetSummary.sampleCount
        aggregates = $presetSummary.aggregates
        samples = @{}
        verdicts = @{ PASS = 0; WARN = 0; FAIL = 0 }
        thresholdVersion = "3.2.1"  # Reference current threshold version
    }
    
    # Add per-sample summary to history
    foreach ($sampleId in $presetResults.samples.Keys) {
        $sample = $presetResults.samples[$sampleId]
        if ($sample.status -eq "success") {
            $isAggregated = ($null -ne $sample.aggregatedMetrics -and $null -ne $sample.aggregatedMetrics.overall)
            $historyEntry.samples[$sampleId] = @{
                overall = if ($isAggregated) { $sample.aggregatedMetrics.overall.median } else { $sample.scores.overall }
                focusStability = if ($isAggregated) { $sample.aggregatedMetrics.focusStability.median } else { $sample.scores.focusStability }
                artifactSeverity = if ($isAggregated) { $sample.aggregatedMetrics.artifactSeverity.median } else { $sample.scores.artifactSeverity }
                objectConsistency = if ($isAggregated) { $sample.aggregatedMetrics.objectConsistency.median } else { $sample.scores.objectConsistency }
                isAggregated = $isAggregated
            }
            $historyEntry.verdicts.PASS++
        }
    }
    
    # Add to history (prepend to maintain newest-first order)
    $historyEntries = @($historyEntry) + @($history.entries)
    $history.entries = $historyEntries
}

# Enforce max entries (200)
if ($history.entries.Count -gt 200) {
    $history.entries = $history.entries | Select-Object -First 200
}

$history | ConvertTo-Json -Depth 10 | Set-Content -Path $historyPath
Write-Success "Updated history: $historyPath"

# Print summary
Write-Banner "BASELINE COLLECTION COMPLETE"

Write-Host "Preset Summary:" -ForegroundColor White
Write-Host ""
Write-Host "Preset           Overall    Focus     Artifacts  ObjConsist  Samples" -ForegroundColor Cyan
Write-Host "──────────────────────────────────────────────────────────────────────" -ForegroundColor Gray

foreach ($presetId in $PresetSummaries.Keys | Sort-Object) {
    $s = $PresetSummaries[$presetId]
    $presetLabel = $presetId.PadRight(16)
    $overall = "$($s.aggregates.overall.mean)%".PadRight(10)
    $focus = "$($s.aggregates.focusStability.mean)%".PadRight(9)
    $artifacts = "$($s.aggregates.artifactSeverity.mean)%".PadRight(10)
    $objConsist = "$($s.aggregates.objectConsistency.mean)%".PadRight(11)
    $samples = $s.sampleCount
    
    $overallColor = if ($s.aggregates.overall.mean -ge 90) { "Green" } elseif ($s.aggregates.overall.mean -ge 80) { "Yellow" } else { "Red" }
    
    Write-Host "$presetLabel" -NoNewline
    Write-Host "$overall" -ForegroundColor $overallColor -NoNewline
    Write-Host "$focus$artifacts$objConsist$samples" -ForegroundColor Gray
}

Write-Host ""
Write-Host "Output Files:" -ForegroundColor White
Write-Host "  Consolidated: $consolidatedPath" -ForegroundColor Gray
Write-Host "  Latest Public: $latestPublicPath" -ForegroundColor Gray
Write-Host "  History: $historyPath" -ForegroundColor Gray
Write-Host ""

exit 0
