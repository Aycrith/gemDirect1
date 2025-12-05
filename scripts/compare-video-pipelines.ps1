<#
.SYNOPSIS
    Pipeline Comparison Harness for Vision QA - Phase 9

.DESCRIPTION
    Provides a repeatable way to compare video generation pipelines using the 
    existing Vision QA stack. This is a diagnostic helper that documents the
    steps needed to compare baseline vs advanced pipelines.

    Pipeline Configurations:
    
    CONFIG A - Production Default
    - Workflow: wan-fun-inpaint (WAN 2.2 Fun Inpaint)
    - Stability: Standard (deflicker ON, IP-Adapter OFF, scheduling OFF)
    - VRAM: ~8GB (medium)
    - Expected QA: 7 PASS, 1 WARN (baseline established Dec 2025)

    CONFIG B - Advanced/Cinematic
    - Workflow: wan-flf2v-feta (First-Last-Frame + FETA)
    - Stability: Cinematic (deflicker ON, IP-Adapter ON, scheduling ON)
    - VRAM: ~12GB (high)
    - Expected QA: Higher temporal coherence, slower generation

    This script does NOT automatically reconfigure settings or submit jobs.
    It documents the manual steps and provides utilities to run Vision QA
    and compare results between configurations.

.PARAMETER Config
    Which configuration to show instructions for: 'A', 'B', or 'both' (default).

.PARAMETER RunVisionQA
    After showing instructions, automatically run Vision QA analysis.

.PARAMETER ShowTrend
    Display trend report comparing historical runs.

.EXAMPLE
    .\compare-video-pipelines.ps1
    Show instructions for both configurations

.EXAMPLE
    .\compare-video-pipelines.ps1 -Config A -RunVisionQA
    Show Config A instructions and run Vision QA

.EXAMPLE
    .\compare-video-pipelines.ps1 -ShowTrend
    Display historical trend comparison

.NOTES
    Phase 9: Exercise and Expose the Production Video Pipeline
    Dependencies: run-bookend-vision-qa.ps1, vision-qa-trend-report.ps1
#>

param(
    [Parameter(Mandatory=$false)]
    [ValidateSet('A', 'B', 'both')]
    [string]$Config = 'both',
    
    [switch]$RunVisionQA,
    
    [switch]$ShowTrend
)

$ErrorActionPreference = "Stop"
$RepoRoot = $PSScriptRoot -replace "[\\/]scripts$", ""

# ANSI colors
$Cyan = "`e[36m"
$Green = "`e[32m"
$Yellow = "`e[33m"
$Magenta = "`e[35m"
$White = "`e[37m"
$Gray = "`e[90m"
$Bold = "`e[1m"
$Reset = "`e[0m"

function Write-Banner {
    param([string]$Title, [string]$Color = $Cyan)
    Write-Host ""
    Write-Host "$Color╔══════════════════════════════════════════════════════════════════╗$Reset"
    Write-Host "$Color║ $Bold$Title$Reset$Color$((' ' * (66 - $Title.Length)))║$Reset"
    Write-Host "$Color╚══════════════════════════════════════════════════════════════════╝$Reset"
    Write-Host ""
}

function Write-Section {
    param([string]$Title)
    Write-Host ""
    Write-Host "$Yellow▸ $Title$Reset"
    Write-Host "$Gray$(('─' * 68))$Reset"
}

function Write-Step {
    param([int]$Number, [string]$Text)
    Write-Host "  $Green$Number.$Reset $Text"
}

function Write-Note {
    param([string]$Text)
    Write-Host "     $Gray↳ $Text$Reset"
}

# ============================================================================
# CONFIGURATION DEFINITIONS
# ============================================================================

$ConfigA = @{
    Name = "CONFIG A - Production Default"
    Workflow = "wan-fun-inpaint"
    StabilityProfile = "Standard"
    DeflickerEnabled = $true
    IPAdapterEnabled = $false
    SchedulingEnabled = $false
    VRAMUsage = "~8GB (Medium)"
    Description = "Balanced quality with deflicker. Production baseline with Vision QA: 7 PASS, 1 WARN."
    OutputDir = "test-results\comparison\configA"
}

$ConfigB = @{
    Name = "CONFIG B - Advanced/Cinematic"
    Workflow = "wan-flf2v-feta"
    StabilityProfile = "Cinematic"
    DeflickerEnabled = $true
    IPAdapterEnabled = $true
    SchedulingEnabled = $true
    VRAMUsage = "~12GB (High)"
    Description = "Full temporal coherence stack. Maximum quality for final output."
    OutputDir = "test-results\comparison\configB"
}

# ============================================================================
# DISPLAY FUNCTIONS
# ============================================================================

function Show-ConfigInfo {
    param([hashtable]$Cfg)
    
    Write-Host "  $Bold$($Cfg.Name)$Reset"
    Write-Host ""
    Write-Host "  ┌────────────────────┬─────────────────────────────────────────┐"
    Write-Host "  │ Workflow           │ $Cyan$($Cfg.Workflow)$Reset$(' ' * (40 - $Cfg.Workflow.Length))│"
    Write-Host "  │ Stability Profile  │ $Cyan$($Cfg.StabilityProfile)$Reset$(' ' * (40 - $Cfg.StabilityProfile.Length))│"
    Write-Host "  │ Deflicker          │ $(if($Cfg.DeflickerEnabled){"$Green ON$Reset "} else {"$Gray OFF$Reset"})$(' ' * 36)│"
    Write-Host "  │ IP-Adapter         │ $(if($Cfg.IPAdapterEnabled){"$Green ON$Reset "} else {"$Gray OFF$Reset"})$(' ' * 36)│"
    Write-Host "  │ Prompt Scheduling  │ $(if($Cfg.SchedulingEnabled){"$Green ON$Reset "} else {"$Gray OFF$Reset"})$(' ' * 36)│"
    Write-Host "  │ VRAM               │ $Yellow$($Cfg.VRAMUsage)$Reset$(' ' * (40 - $Cfg.VRAMUsage.Length))│"
    Write-Host "  └────────────────────┴─────────────────────────────────────────┘"
    Write-Host ""
    Write-Host "  $Gray$($Cfg.Description)$Reset"
    Write-Host ""
}

function Show-GenerationSteps {
    param([hashtable]$Cfg)
    
    Write-Section "Steps to Generate Videos for $($Cfg.Name)"
    
    Write-Step 1 "Open Settings (gear icon) → Temporal Coherence section"
    Write-Step 2 "Select Stability Profile: $Bold$($Cfg.StabilityProfile)$Reset"
    Write-Step 3 "Verify Workflow Profile is set to: $Bold$($Cfg.Workflow)$Reset"
    Write-Note "Check ComfyUI Settings tab → Video Workflow Profile dropdown"
    Write-Step 4 "Navigate to Timeline Editor with your scene"
    Write-Step 5 "Generate bookend videos for test scenes"
    Write-Note "Use golden samples from: data/bookend-golden-samples/"
    Write-Step 6 "Save outputs to: $Bold$($Cfg.OutputDir)$Reset"
    Write-Host ""
    
    Write-Host "  $Yellow⚠ IMPORTANT:$Reset Create output directory before generation:"
    Write-Host "     $Cyan mkdir -p $($Cfg.OutputDir)$Reset"
    Write-Host ""
}

function Show-VisionQASteps {
    Write-Section "Steps to Run Vision QA Analysis"
    
    Write-Step 1 "Run Vision QA pipeline (3-run aggregation for stable metrics):"
    Write-Host "     $Cyan npm run bookend:vision-qa$Reset"
    Write-Note "Or for quick 1-run: npm run bookend:vision-qa:quick"
    
    Write-Step 2 "Append results to historical baseline:"
    Write-Host "     $Cyan npm run bookend:vision-qa:publish$Reset"
    
    Write-Step 3 "Generate trend report:"
    Write-Host "     $Cyan npm run bookend:vision-qa:trend$Reset"
    Write-Note "Outputs to: reports/vision-qa-trend-report.md"
    
    Write-Step 4 "Review results in UI:"
    Write-Host "     Open Usage Dashboard → Bookend Vision QA Panel"
    Write-Host ""
}

function Show-ComparisonSummary {
    Write-Section "Comparison Summary"
    
    $historyPath = Join-Path $RepoRoot "data\bookend-golden-samples\vision-qa-history.json"
    
    if (Test-Path $historyPath) {
        try {
            $history = Get-Content $historyPath -Raw | ConvertFrom-Json
            $entries = @($history.entries)
            
            if ($entries.Count -gt 0) {
                $latest = $entries[-1]
                
                Write-Host "  $Bold Latest Vision QA Entry:$Reset"
                Write-Host "  ┌─────────────────────────────────────────────────────────────────┐"
                Write-Host "  │ Timestamp: $($latest.timestamp)"
                Write-Host "  │ Runs:      $($latest.runs)"
                Write-Host "  │ Samples:   $($latest.samplesAnalyzed)"
                Write-Host "  │ Threshold: v$($latest.thresholdVersion)"
                Write-Host "  │"
                Write-Host "  │ Results:   $Green$($latest.passCount) PASS$Reset / $Yellow$($latest.warnCount) WARN$Reset / $($latest.failCount) FAIL"
                Write-Host "  │ Avg Score: $($latest.avgOverall)%"
                Write-Host "  └─────────────────────────────────────────────────────────────────┘"
                Write-Host ""
                
                if ($entries.Count -gt 1) {
                    Write-Host "  $Gray(History contains $($entries.Count) entries. Run -ShowTrend for full report.)$Reset"
                    Write-Host ""
                }
            }
        } catch {
            Write-Host "  $Yellow⚠ Could not parse vision-qa-history.json$Reset"
        }
    } else {
        Write-Host "  $Gray(No vision QA history found. Run npm run bookend:vision-qa:publish first.)$Reset"
    }
}

# ============================================================================
# MAIN EXECUTION
# ============================================================================

Write-Banner "Pipeline Comparison Harness (Phase 9)"

Write-Host "  This script documents the steps to compare video pipelines using Vision QA."
Write-Host "  It does NOT automatically reconfigure settings or submit ComfyUI jobs."
Write-Host ""

# Show configuration info
if ($Config -eq 'A' -or $Config -eq 'both') {
    Write-Section "Configuration A: Production Default"
    Show-ConfigInfo $ConfigA
    
    if ($Config -eq 'A') {
        Show-GenerationSteps $ConfigA
    }
}

if ($Config -eq 'B' -or $Config -eq 'both') {
    Write-Section "Configuration B: Advanced/Cinematic"
    Show-ConfigInfo $ConfigB
    
    if ($Config -eq 'B') {
        Show-GenerationSteps $ConfigB
    }
}

if ($Config -eq 'both') {
    Write-Section "Comparison Workflow"
    
    Write-Host "  $Bold STEP 1: Generate videos with Config A$Reset"
    Write-Step 1 "Apply $($ConfigA.StabilityProfile) stability profile in Settings"
    Write-Step 2 "Set workflow to $($ConfigA.Workflow)"
    Write-Step 3 "Generate videos → save to $($ConfigA.OutputDir)"
    Write-Step 4 "Run: npm run bookend:vision-qa && npm run bookend:vision-qa:publish"
    Write-Host ""
    
    Write-Host "  $Bold STEP 2: Generate videos with Config B$Reset"
    Write-Step 1 "Apply $($ConfigB.StabilityProfile) stability profile in Settings"
    Write-Step 2 "Set workflow to $($ConfigB.Workflow)"
    Write-Step 3 "Generate videos → save to $($ConfigB.OutputDir)"
    Write-Step 4 "Run: npm run bookend:vision-qa && npm run bookend:vision-qa:publish"
    Write-Host ""
    
    Write-Host "  $Bold STEP 3: Compare results$Reset"
    Write-Step 1 "Run: npm run bookend:vision-qa:trend"
    Write-Step 2 "Review trend report in reports/vision-qa-trend-report.md"
    Write-Step 3 "Open Usage Dashboard → Vision QA Panel for visual comparison"
    Write-Host ""
}

# Show Vision QA steps
Show-VisionQASteps

# Show current summary
Show-ComparisonSummary

# Optional: Run Vision QA
if ($RunVisionQA) {
    Write-Section "Running Vision QA Analysis..."
    
    $qaScript = Join-Path $PSScriptRoot "run-bookend-vision-qa.ps1"
    if (Test-Path $qaScript) {
        & $qaScript
    } else {
        Write-Host "  $Yellow⚠ run-bookend-vision-qa.ps1 not found$Reset"
        Write-Host "  Run manually: npm run bookend:vision-qa"
    }
}

# Optional: Show trend report
if ($ShowTrend) {
    Write-Section "Vision QA Trend Report"
    
    $trendScript = Join-Path $PSScriptRoot "vision-qa-trend-report.ps1"
    if (Test-Path $trendScript) {
        & $trendScript
    } else {
        Write-Host "  $Yellow⚠ vision-qa-trend-report.ps1 not found$Reset"
        Write-Host "  Run manually: npm run bookend:vision-qa:trend"
    }
}

Write-Host ""
Write-Host "$Gray════════════════════════════════════════════════════════════════════$Reset"
Write-Host "  $Bold Pipeline Comparison Complete$Reset"
Write-Host "  For detailed docs: AGENT_HANDOFF_CURRENT.md → 'Pipeline Comparison Harness'"
Write-Host "$Gray════════════════════════════════════════════════════════════════════$Reset"
Write-Host ""
