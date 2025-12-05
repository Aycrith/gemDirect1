<#
.SYNOPSIS
    Validates the schema/contract of vision-qa-results.json.

.DESCRIPTION
    Checks that the structure of vision-qa-results.json matches what both
    the gating script (test-bookend-vision-regression.ps1) and UI component
    (BookendVisionQAPanel.tsx) expect.
    
    Fails fast (exit 1) if the structure is incorrect, helping catch drift
    between the analyze script output and downstream consumers.

.PARAMETER ResultsPath
    Path to vision-qa-results.json. If not provided, finds latest in temp\vision-qa-*.

.PARAMETER Strict
    When set, requires aggregatedMetrics to be present (for multi-run results).

.EXAMPLE
    pwsh -File scripts/check-vision-qa-schema.ps1
    
.EXAMPLE
    pwsh -File scripts/check-vision-qa-schema.ps1 -Strict
#>

param(
    [string]$ResultsPath,
    [switch]$Strict
)

$ErrorActionPreference = 'Stop'

Write-Host "`n=== Vision QA Schema Validation ===" -ForegroundColor Cyan

# Find latest results if not provided
if (-not $ResultsPath) {
    $visionDirs = Get-ChildItem -Path "temp" -Directory -Filter "vision-qa-*" | Sort-Object Name -Descending
    if ($visionDirs.Count -eq 0) {
        Write-Host "ERROR: No vision-qa-* directories found in temp/" -ForegroundColor Red
        Write-Host "Run 'npm run bookend:vision' first." -ForegroundColor Yellow
        exit 1
    }
    $latestDir = $visionDirs[0].FullName
    $ResultsPath = Join-Path $latestDir "vision-qa-results.json"
}

if (-not (Test-Path $ResultsPath)) {
    Write-Host "ERROR: Results file not found: $ResultsPath" -ForegroundColor Red
    exit 1
}

Write-Host "Checking: $ResultsPath" -ForegroundColor Gray

# Load JSON
try {
    $results = Get-Content $ResultsPath -Raw | ConvertFrom-Json
} catch {
    Write-Host "ERROR: Failed to parse JSON: $_" -ForegroundColor Red
    exit 1
}

# Validation state
$errors = @()
$warnings = @()
$sampleCount = 0

# Check each sample
foreach ($prop in $results.PSObject.Properties) {
    $sampleId = $prop.Name
    $sample = $prop.Value
    
    # Skip non-sample properties
    if (-not $sampleId.StartsWith("sample-")) {
        continue
    }
    
    $sampleCount++
    
    # Required: scores object exists
    if (-not $sample.scores) {
        $errors += "$sampleId`: missing 'scores' object"
        continue
    }
    
    # Required fields in scores
    $requiredScoreFields = @('overall', 'focusStability', 'artifactSeverity', 'objectConsistency')
    foreach ($field in $requiredScoreFields) {
        if ($null -eq $sample.scores.$field) {
            $errors += "$sampleId`: scores missing '$field'"
        }
    }
    
    # Check aggregatedMetrics structure (if present or strict mode)
    if ($sample.aggregatedMetrics) {
        $agg = $sample.aggregatedMetrics
        $aggMetrics = @('overall', 'focusStability', 'artifactSeverity', 'objectConsistency')
        
        foreach ($metric in $aggMetrics) {
            if ($agg.$metric) {
                $aggFields = @('median', 'stdDev', 'min', 'max')
                foreach ($af in $aggFields) {
                    if ($null -eq $agg.$metric.$af) {
                        $errors += "$sampleId`: aggregatedMetrics.$metric missing '$af'"
                    }
                }
            } elseif ($Strict) {
                $errors += "$sampleId`: aggregatedMetrics missing '$metric' (strict mode)"
            }
        }
    } elseif ($Strict) {
        $errors += "$sampleId`: missing 'aggregatedMetrics' (strict mode)"
    }
    
    # Check frameAnalysis structure (if present)
    if ($sample.frameAnalysis) {
        $fa = $sample.frameAnalysis
        if ($null -eq $fa.hasBlackFrames) {
            $warnings += "$sampleId`: frameAnalysis missing 'hasBlackFrames'"
        }
        if ($null -eq $fa.hasHardFlicker) {
            $warnings += "$sampleId`: frameAnalysis missing 'hasHardFlicker'"
        }
    }
    
    # Check status field
    if (-not $sample.status) {
        $warnings += "$sampleId`: missing 'status' field"
    }
}

# Output results
if ($sampleCount -eq 0) {
    Write-Host "ERROR: No sample-* entries found in results" -ForegroundColor Red
    exit 1
}

Write-Host "Samples validated: $sampleCount" -ForegroundColor Gray

if ($warnings.Count -gt 0) {
    Write-Host "`nWarnings ($($warnings.Count)):" -ForegroundColor Yellow
    foreach ($w in $warnings) {
        Write-Host "  ! $w" -ForegroundColor Yellow
    }
}

if ($errors.Count -gt 0) {
    Write-Host "`nErrors ($($errors.Count)):" -ForegroundColor Red
    foreach ($e in $errors) {
        Write-Host "  x $e" -ForegroundColor Red
    }
    Write-Host "`nSchema validation FAILED" -ForegroundColor Red
    exit 1
}

Write-Host "`nSchema OK ($sampleCount samples)" -ForegroundColor Green
exit 0
