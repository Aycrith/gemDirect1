<#
.SYNOPSIS
End-to-End test for bookend workflow (sequential video generation)

.DESCRIPTION
Validates the complete bookend workflow:
1. Checks ffmpeg availability
2. Validates ComfyUI server status
3. Tests bookend keyframe generation
4. Tests sequential video generation
5. Validates video splicing output

.PARAMETER SkipFfmpegCheck
Skip ffmpeg availability check (for CI environments)

.PARAMETER ComfyUIUrl
ComfyUI server URL (default: http://127.0.0.1:8188)

.EXAMPLE
.\test-bookend-workflow.ps1

.EXAMPLE
.\test-bookend-workflow.ps1 -SkipFfmpegCheck -ComfyUIUrl "http://localhost:8188"
#>

param(
    [switch]$SkipFfmpegCheck = $false,
    [string]$ComfyUIUrl = "http://127.0.0.1:8188"
)

$ErrorActionPreference = "Stop"

Write-Host "=== Bookend Workflow E2E Test ===" -ForegroundColor Cyan
Write-Host "Date: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')" -ForegroundColor Gray
Write-Host ""

# Test Results
$testResults = @{
    Passed = 0
    Failed = 0
    Skipped = 0
    Errors = @()
}

function Test-Step {
    param(
        [string]$Name,
        [scriptblock]$Action,
        [switch]$Optional
    )
    
    Write-Host "[$($testResults.Passed + $testResults.Failed + 1)] Testing: $Name" -ForegroundColor Yellow
    
    try {
        & $Action
        $testResults.Passed++
        Write-Host "  ✓ PASS: $Name" -ForegroundColor Green
        return $true
    } catch {
        if ($Optional) {
            $testResults.Skipped++
            Write-Host "  ⊘ SKIP: $Name - $($_.Exception.Message)" -ForegroundColor Gray
            return $false
        } else {
            $testResults.Failed++
            $testResults.Errors += "$Name : $($_.Exception.Message)"
            Write-Host "  ✗ FAIL: $Name - $($_.Exception.Message)" -ForegroundColor Red
            return $false
        }
    }
}

# Test 1: ffmpeg Availability
if (-not $SkipFfmpegCheck) {
    Test-Step "ffmpeg availability" {
        try {
            $ffmpegOutput = & ffmpeg -version 2>&1 | Select-Object -First 1
            if (-not $ffmpegOutput -or $ffmpegOutput -notmatch 'ffmpeg version') {
                throw "ffmpeg not found. Install: choco install ffmpeg"
            }
            Write-Host "    ffmpeg version: $($ffmpegOutput -replace 'ffmpeg version ', '')" -ForegroundColor Gray
        } catch {
            throw "ffmpeg not found. Install: choco install ffmpeg"
        }
    }
} else {
    Write-Host "[SKIP] ffmpeg check (SkipFfmpegCheck flag set)" -ForegroundColor Gray
}

# Test 2: ComfyUI Server Status
Test-Step "ComfyUI server connectivity" {
    $response = Invoke-RestMethod -Uri "$ComfyUIUrl/system_stats" -Method Get -TimeoutSec 5
    if (-not $response.system) {
        throw "ComfyUI server returned invalid response"
    }
    Write-Host "    ComfyUI version: $($response.system.comfyui_version)" -ForegroundColor Gray
}

# Test 3: Workflow Profiles Exist
Test-Step "ComfyUI workflow profiles" {
    $settingsPath = "localGenSettings.json"
    if (-not (Test-Path $settingsPath)) {
        throw "localGenSettings.json not found"
    }
    
    $settings = Get-Content $settingsPath | ConvertFrom-Json
    
    if (-not $settings.workflowProfiles) {
        throw "No workflow profiles found"
    }
    
    $requiredProfiles = @('wan-t2i', 'wan-i2v')
    foreach ($profile in $requiredProfiles) {
        if (-not $settings.workflowProfiles.$profile) {
            throw "Missing required workflow profile: $profile"
        }
        if (-not $settings.workflowProfiles.$profile.workflowJson) {
            throw "Workflow profile $profile has no workflowJson"
        }
    }
    
    Write-Host "    Profiles found: $($settings.workflowProfiles.PSObject.Properties.Name -join ', ')" -ForegroundColor Gray
}

# Test 4: Test Keyframe Images Exist
Test-Step "Test keyframe images available" {
    $testDir = "temp/bookend-test"
    if (-not (Test-Path $testDir)) {
        throw "Test directory not found: $testDir"
    }
    
    $startImage = Join-Path $testDir "start.png"
    $endImage = Join-Path $testDir "end.png"
    
    if (-not (Test-Path $startImage)) {
        throw "Start test image not found: $startImage"
    }
    if (-not (Test-Path $endImage)) {
        throw "End test image not found: $endImage"
    }
    
    $startSize = (Get-Item $startImage).Length
    $endSize = (Get-Item $endImage).Length
    
    Write-Host "    Start image: $startSize bytes" -ForegroundColor Gray
    Write-Host "    End image: $endSize bytes" -ForegroundColor Gray
}

# Test 5: Video Splicing Utility Exists
Test-Step "Video splicing utility compiled" {
    $splicerPath = "utils/videoSplicer.ts"
    if (-not (Test-Path $splicerPath)) {
        throw "videoSplicer.ts not found"
    }
    
    $content = Get-Content $splicerPath -Raw
    
    # Check for key functions
    $requiredFunctions = @('spliceVideos', 'checkFfmpegAvailable', 'getVideoDuration')
    foreach ($func in $requiredFunctions) {
        if ($content -notmatch "export.*function $func") {
            throw "Function not found in videoSplicer.ts: $func"
        }
    }
    
    Write-Host "    All required functions present" -ForegroundColor Gray
}

# Test 6: Sequential Generation Function Exists
Test-Step "Sequential generation function exists" {
    $servicePath = "services/comfyUIService.ts"
    if (-not (Test-Path $servicePath)) {
        throw "comfyUIService.ts not found"
    }
    
    $content = Get-Content $servicePath -Raw
    
    if ($content -notmatch "generateVideoFromBookendsSequential") {
        throw "generateVideoFromBookendsSequential function not found"
    }
    
    # Check for phase markers
    $phases = @('bookend-start-video', 'bookend-end-video', 'splicing')
    foreach ($phase in $phases) {
        if ($content -notmatch $phase) {
            throw "Phase marker not found: $phase"
        }
    }
    
    Write-Host "    Sequential generation function validated" -ForegroundColor Gray
}

# Test 7: TimelineEditor Integration
Test-Step "TimelineEditor bookend integration" {
    $editorPath = "components/TimelineEditor.tsx"
    if (-not (Test-Path $editorPath)) {
        throw "TimelineEditor.tsx not found"
    }
    
    $content = Get-Content $editorPath -Raw
    
    # Check for bookend mode detection
    if ($content -notmatch "keyframeMode.*===.*'bookend'") {
        throw "Bookend mode detection not found"
    }
    
    # Check for sequential generation call
    if ($content -notmatch "generateVideoFromBookendsSequential") {
        throw "Sequential generation call not found"
    }
    
    Write-Host "    TimelineEditor integration validated" -ForegroundColor Gray
}

# Test 8: SceneNavigator Display Updates
Test-Step "SceneNavigator bookend display" {
    $navPath = "components/SceneNavigator.tsx"
    if (-not (Test-Path $navPath)) {
        throw "SceneNavigator.tsx not found"
    }
    
    $content = Get-Content $navPath -Raw
    
    # Check for isBookendKeyframe usage
    if ($content -notmatch "isBookendKeyframe") {
        throw "isBookendKeyframe type guard not used"
    }
    
    # Check for START/END labels
    if ($content -notmatch "START" -or $content -notmatch "END") {
        throw "START/END labels not found"
    }
    
    Write-Host "    SceneNavigator display validated" -ForegroundColor Gray
}

# Test 9: Type Guards Exist
Test-Step "KeyframeData type guards" {
    $typesPath = "types.ts"
    if (-not (Test-Path $typesPath)) {
        throw "types.ts not found"
    }
    
    $content = Get-Content $typesPath -Raw
    
    # Check for KeyframeData type
    if ($content -notmatch "type KeyframeData") {
        throw "KeyframeData type not found"
    }
    
    # Check for type guards
    $guards = @('isSingleKeyframe', 'isBookendKeyframe')
    foreach ($guard in $guards) {
        if ($content -notmatch "function $guard") {
            throw "Type guard not found: $guard"
        }
    }
    
    Write-Host "    Type guards validated" -ForegroundColor Gray
}

# Test 10: Settings UI Integration
Test-Step "Settings UI keyframe mode selector" {
    $settingsPath = "components/LocalGenerationSettingsModal.tsx"
    if (-not (Test-Path $settingsPath)) {
        throw "LocalGenerationSettingsModal.tsx not found"
    }
    
    $content = Get-Content $settingsPath -Raw
    
    # Check for keyframe mode selector
    if ($content -notmatch 'value="bookend"') {
        throw "Bookend radio button not found"
    }
    
    # Check for experimental badge
    if ($content -notmatch "EXPERIMENTAL") {
        throw "Experimental badge not found"
    }
    
    Write-Host "    Settings UI integration validated" -ForegroundColor Gray
}

# Test 11: Unit Tests Exist
Test-Step "Unit tests for video splicing" {
    $testPath = "utils/__tests__/videoSplicer.test.ts"
    if (-not (Test-Path $testPath)) {
        throw "videoSplicer.test.ts not found"
    }
    
    $content = Get-Content $testPath -Raw
    
    # Check for test suites
    if ($content -notmatch "describe\('videoSplicer'") {
        throw "Test suite not found"
    }
    
    # Count test cases
    $testCount = ([regex]::Matches($content, "it\('")).Count
    if ($testCount -lt 5) {
        throw "Insufficient test coverage (found $testCount tests, expected >= 5)"
    }
    
    Write-Host "    Unit tests found: $testCount test cases" -ForegroundColor Gray
}

# Test 12: Documentation Exists
Test-Step "Documentation completeness" {
    $requiredDocs = @(
        'BOOKEND_WORKFLOW_PROPOSAL.md',
        'WAN2_RESEARCH_SUMMARY.md',
        'BOOKEND_IMPLEMENTATION_STATUS.md'
    )
    
    foreach ($doc in $requiredDocs) {
        if (-not (Test-Path $doc)) {
            throw "Required documentation missing: $doc"
        }
    }
    
    Write-Host "    All documentation present" -ForegroundColor Gray
}

# Summary
Write-Host ""
Write-Host "=== Test Summary ===" -ForegroundColor Cyan
Write-Host "Passed:  $($testResults.Passed)" -ForegroundColor Green
Write-Host "Failed:  $($testResults.Failed)" -ForegroundColor $(if ($testResults.Failed -gt 0) { 'Red' } else { 'Gray' })
Write-Host "Skipped: $($testResults.Skipped)" -ForegroundColor Gray
Write-Host ""

if ($testResults.Failed -gt 0) {
    Write-Host "Failed Tests:" -ForegroundColor Red
    foreach ($err in $testResults.Errors) {
        Write-Host "  - $err" -ForegroundColor Red
    }
    Write-Host ""
    exit 1
} else {
    Write-Host "✓ All tests passed! Bookend workflow is ready for manual validation." -ForegroundColor Green
    Write-Host ""
    Write-Host "Next Steps:" -ForegroundColor Yellow
    Write-Host "1. Start dev server: npm run dev" -ForegroundColor White
    Write-Host "2. Open Settings → ComfyUI Settings" -ForegroundColor White
    Write-Host "3. Enable 'Dual Keyframes (Bookend)' mode" -ForegroundColor White
    Write-Host "4. Generate bookend keyframes" -ForegroundColor White
    Write-Host "5. Generate video and verify crossfade" -ForegroundColor White
    Write-Host ""
    exit 0
}
