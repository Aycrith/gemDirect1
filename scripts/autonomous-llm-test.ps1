#!/usr/bin/env pwsh
<#
.SYNOPSIS
Autonomous Local LLM Integration Test - Runs WITHOUT user interaction.

.DESCRIPTION
Tests local LLM (LM Studio) story generation pipeline autonomously.
Captures detailed diagnostics, validates responses against schema requirements,
and outputs structured results for debugging.

NO BROWSER REQUIRED - Pure PowerShell + REST API testing.

.EXAMPLE
# Quick test with default Qwen2.5 model
pwsh scripts/autonomous-llm-test.ps1

# Test specific model
pwsh scripts/autonomous-llm-test.ps1 -Model "Qwen/Qwen2.5-32B-Instruct-GGUF"

# Full verbose output
pwsh scripts/autonomous-llm-test.ps1 -Verbose -KeepLogs
#>

param(
    [string]$ServerUrl = "http://192.168.50.192:1234",
    [string]$Model = "",  # Empty = auto-detect from LM Studio
    [string]$OutputDir = "",
    [int]$TimeoutSeconds = 180,
    [switch]$KeepLogs,
    [switch]$TestVision,
    [switch]$SkipValidation
)

$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"

# Create output directory
if (-not $OutputDir) {
    $timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
    $OutputDir = Join-Path $PSScriptRoot "..\logs\llm-test-$timestamp"
}
New-Item -ItemType Directory -Path $OutputDir -Force | Out-Null

# Logging function
function Write-Log {
    param([string]$Message, [string]$Level = "INFO", [string]$Color = "White")
    $timestamp = Get-Date -Format "HH:mm:ss"
    $logLine = "[$timestamp] [$Level] $Message"
    Write-Host $logLine -ForegroundColor $Color
    Add-Content -Path (Join-Path $OutputDir "test.log") -Value $logLine
}

# JSON sanitization (mirrors localStoryService.ts logic)
function Invoke-SanitizeLLMJson {
    param([string]$Content)
    
    # Strip <think>...</think> blocks (Qwen3 thinking mode)
    $cleaned = $Content -replace '<think>[\s\S]*?</think>', ''
    
    # Strip markdown fences
    if ($cleaned -match '```(?:json)?\r?\n([\s\S]*?)\r?\n```') {
        $cleaned = $Matches[1]
    }
    
    # Extract JSON object
    $firstBrace = $cleaned.IndexOf('{')
    $lastBrace = $cleaned.LastIndexOf('}')
    if ($firstBrace -ge 0 -and $lastBrace -gt $firstBrace) {
        return $cleaned.Substring($firstBrace, $lastBrace - $firstBrace + 1)
    }
    return $cleaned
}

# Validation functions (mirror storyBibleValidation.ts)
function Test-StoryBibleSchema {
    param([PSObject]$Bible)
    
    $issues = @()
    
    # Required fields
    $requiredFields = @('logline', 'characters', 'setting', 'plotOutline')
    foreach ($field in $requiredFields) {
        if (-not $Bible.$field -or $Bible.$field.Trim().Length -eq 0) {
            $issues += "MISSING_FIELD: '$field' is empty or missing"
        }
    }
    
    # Logline validation
    if ($Bible.logline) {
        $loglineWords = ($Bible.logline -split '\s+').Count
        if ($loglineWords -lt 10) {
            $issues += "LOGLINE_TOO_SHORT: $loglineWords words (minimum 10)"
        }
        if ($loglineWords -gt 100) {
            $issues += "LOGLINE_TOO_LONG: $loglineWords words (maximum 100)"
        }
    }
    
    # Setting validation
    if ($Bible.setting) {
        $settingWords = ($Bible.setting -split '\s+').Count
        if ($settingWords -lt 50) {
            $issues += "SETTING_TOO_SHORT: $settingWords words (minimum 50)"
        }
    }
    
    # HeroArcs validation
    if ($Bible.heroArcs) {
        if ($Bible.heroArcs.Count -ne 12) {
            $issues += "HERO_ARCS_COUNT: Got $($Bible.heroArcs.Count) arcs (expected exactly 12)"
        }
    } else {
        $issues += "MISSING_FIELD: 'heroArcs' array is missing"
    }
    
    return @{
        Valid = $issues.Count -eq 0
        Issues = $issues
        WordCounts = @{
            Logline = if ($Bible.logline) { ($Bible.logline -split '\s+').Count } else { 0 }
            Setting = if ($Bible.setting) { ($Bible.setting -split '\s+').Count } else { 0 }
            Characters = if ($Bible.characters) { ($Bible.characters -split '\s+').Count } else { 0 }
            PlotOutline = if ($Bible.plotOutline) { ($Bible.plotOutline -split '\s+').Count } else { 0 }
        }
    }
}

# Build prompt (mirrors localStoryService.ts)
function Build-StoryPrompt {
    param([string]$Idea, [string]$Genre, [string]$Feedback)
    
    $systemMessage = @"
You are the gemDirect1 narrative designer. Return strict JSON with keys logline, characters, setting, plotOutline, heroArcs, and an array of scenes. heroArcs must contain exactly twelve entries with id, name, summary, emotionalShift, and importance (1-10). Scenes should each reference a heroArcId and include heroArcName, heroArcSummary, heroArcOrder, shotPurpose, heroMoment, mood, prompt, and cameraMovement when available. Output JSON only with no surrounding prose or markdown fences.
"@

    $userMessage = "Idea: $($Idea.Trim())`nGenre: $($Genre.Trim())`nReturn JSON only. Limit logline & summaries to ~140 characters, titles to 48, summaries to 180, and hero arc summaries to 120. Use the canonical hero's-journey names and keep descriptions cinematic."
    
    if ($Feedback) {
        $userMessage += "`n`n**CRITICAL: Previous generation failed validation. You MUST fix these issues:**`n$Feedback"
    }
    
    return "$systemMessage`n`n$userMessage"
}

# ============================================================
# MAIN TEST EXECUTION
# ============================================================

Write-Host ""
Write-Host "╔══════════════════════════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║           AUTONOMOUS LOCAL LLM INTEGRATION TEST                  ║" -ForegroundColor Cyan
Write-Host "║                    No User Interaction Required                  ║" -ForegroundColor Cyan
Write-Host "╚══════════════════════════════════════════════════════════════════╝" -ForegroundColor Cyan
Write-Host ""
Write-Log "Output directory: $OutputDir"
Write-Log "Server URL: $ServerUrl"
Write-Log "Timeout: ${TimeoutSeconds}s"

# ============================================================
# PHASE 1: Server Health Check
# ============================================================
Write-Host ""
Write-Host "═══ PHASE 1: Server Health Check ═══" -ForegroundColor Yellow

try {
    Write-Log "Checking LM Studio server..." "INFO" "Gray"
    $modelsResponse = Invoke-RestMethod -Uri "$ServerUrl/v1/models" -Method GET -TimeoutSec 10
    $availableModels = $modelsResponse.data | ForEach-Object { $_.id }
    
    Write-Log "✓ Server online. Available models:" "SUCCESS" "Green"
    foreach ($m in $availableModels) {
        Write-Log "    - $m" "INFO" "Gray"
    }
    
    # Auto-detect model if not specified
    if (-not $Model) {
        # Prefer Qwen2.5 for text, then any available model
        $Model = $availableModels | Where-Object { $_ -like "*qwen*2.5*" -and $_ -notlike "*vl*" } | Select-Object -First 1
        if (-not $Model) {
            $Model = $availableModels | Select-Object -First 1
        }
        Write-Log "Auto-selected model: $Model" "INFO" "Cyan"
    }
    
    if ($Model -notin $availableModels) {
        Write-Log "⚠ Target model '$Model' not in available models" "WARN" "Yellow"
    }
    
    # Save server info
    $modelsResponse | ConvertTo-Json -Depth 5 | Out-File (Join-Path $OutputDir "server-models.json")
    
} catch {
    Write-Log "✗ FAILED: Cannot reach LM Studio server at $ServerUrl" "ERROR" "Red"
    Write-Log "  Error: $($_.Exception.Message)" "ERROR" "Red"
    Write-Log "" "INFO"
    Write-Log "TROUBLESHOOTING:" "INFO" "Yellow"
    Write-Log "  1. Ensure LM Studio is running" "INFO" "Gray"
    Write-Log "  2. Verify a model is loaded in LM Studio" "INFO" "Gray"
    Write-Log "  3. Check server URL (default: http://192.168.50.192:1234)" "INFO" "Gray"
    exit 1
}

# ============================================================
# PHASE 2: Story Bible Generation Tests
# ============================================================
Write-Host ""
Write-Host "═══ PHASE 2: Story Bible Generation Tests ═══" -ForegroundColor Yellow

$testCases = @(
    @{
        Name = "cyberpunk-hacker"
        Idea = "A cyberpunk hacker discovers a corporate surveillance AI that has developed consciousness"
        Genre = "sci-fi"
    },
    @{
        Name = "space-survival"  
        Idea = "An astronaut stranded on Mars must survive using only damaged equipment and her wits"
        Genre = "sci-fi"
    },
    @{
        Name = "noir-detective"
        Idea = "A jaded detective investigates mysterious disappearances in a rain-soaked coastal town"
        Genre = "thriller"
    }
)

$testResults = @()

foreach ($test in $testCases) {
    Write-Host ""
    Write-Log "─── Test: $($test.Name) ───" "INFO" "Cyan"
    Write-Log "Idea: $($test.Idea)" "INFO" "Gray"
    Write-Log "Genre: $($test.Genre)" "INFO" "Gray"
    
    $testResult = @{
        Name = $test.Name
        Idea = $test.Idea
        Genre = $test.Genre
        StartTime = Get-Date
        Success = $false
        Attempts = @()
    }
    
    $maxAttempts = 3
    $feedback = ""
    
    for ($attempt = 1; $attempt -le $maxAttempts; $attempt++) {
        Write-Log "Attempt $attempt/$maxAttempts..." "INFO" "Gray"
        
        $attemptResult = @{
            Attempt = $attempt
            Success = $false
            Error = $null
            ResponseTime = 0
            RawResponse = ""
            ParsedBible = $null
            ValidationResult = $null
        }
        
        try {
            $prompt = Build-StoryPrompt -Idea $test.Idea -Genre $test.Genre -Feedback $feedback
            
            # Build request body - Note: response_format NOT supported by LM Studio
            $requestBody = @{
                model = $Model
                temperature = 0.35
                max_tokens = 4096  # Increased to allow complete JSON responses
                stream = $false
                messages = @(
                    @{
                        role = "system"
                        content = "You are the gemDirect1 narrative designer. Always respond with valid JSON only, no markdown, no explanations."
                    },
                    @{
                        role = "user"
                        content = $prompt
                    }
                )
            }
            
            # Save request for debugging
            $requestPath = Join-Path $OutputDir "$($test.Name)-attempt$attempt-request.json"
            $requestBody | ConvertTo-Json -Depth 10 | Out-File $requestPath
            
            $stopwatch = [System.Diagnostics.Stopwatch]::StartNew()
            
            $response = Invoke-RestMethod `
                -Uri "$ServerUrl/v1/chat/completions" `
                -Method POST `
                -ContentType "application/json" `
                -Body ($requestBody | ConvertTo-Json -Depth 10) `
                -TimeoutSec $TimeoutSeconds
            
            $stopwatch.Stop()
            $attemptResult.ResponseTime = $stopwatch.ElapsedMilliseconds
            
            # Extract content
            $rawContent = $response.choices[0].message.content
            $attemptResult.RawResponse = $rawContent
            
            # Save raw response
            $responsePath = Join-Path $OutputDir "$($test.Name)-attempt$attempt-response.txt"
            $rawContent | Out-File $responsePath
            
            Write-Log "Response received in $($attemptResult.ResponseTime)ms ($($response.usage.completion_tokens) tokens)" "INFO" "Gray"
            
            # Sanitize and parse JSON
            $jsonText = Invoke-SanitizeLLMJson -Content $rawContent
            
            try {
                $parsed = $jsonText | ConvertFrom-Json
                $attemptResult.ParsedBible = $parsed
                
                # Save parsed JSON
                $parsedPath = Join-Path $OutputDir "$($test.Name)-attempt$attempt-parsed.json"
                $parsed | ConvertTo-Json -Depth 10 | Out-File $parsedPath
                
                # Validate
                if (-not $SkipValidation) {
                    $validation = Test-StoryBibleSchema -Bible $parsed
                    $attemptResult.ValidationResult = $validation
                    
                    if ($validation.Valid) {
                        Write-Log "✓ PASSED: Valid story bible generated" "SUCCESS" "Green"
                        Write-Log "  Word counts: Logline=$($validation.WordCounts.Logline), Setting=$($validation.WordCounts.Setting)" "INFO" "Gray"
                        $attemptResult.Success = $true
                        $testResult.Success = $true
                    } else {
                        Write-Log "✗ Validation failed:" "WARN" "Yellow"
                        foreach ($issue in $validation.Issues) {
                            Write-Log "    - $issue" "WARN" "Yellow"
                        }
                        $feedback = ($validation.Issues -join "`n")
                    }
                } else {
                    Write-Log "✓ JSON parsed successfully (validation skipped)" "SUCCESS" "Green"
                    $attemptResult.Success = $true
                    $testResult.Success = $true
                }
                
            } catch {
                $attemptResult.Error = "JSON_PARSE_ERROR: $($_.Exception.Message)"
                Write-Log "✗ JSON parse failed: $($_.Exception.Message)" "ERROR" "Red"
                Write-Log "  Raw content preview: $($rawContent.Substring(0, [Math]::Min(200, $rawContent.Length)))..." "ERROR" "Red"
                $feedback = "Your response was not valid JSON. Return ONLY a JSON object, no markdown fences, no explanations."
            }
            
        } catch {
            $attemptResult.Error = "REQUEST_ERROR: $($_.Exception.Message)"
            Write-Log "✗ Request failed: $($_.Exception.Message)" "ERROR" "Red"
            
            if ($_.Exception.Message -like "*timeout*" -or $_.Exception.Message -like "*timed out*") {
                $feedback = "Previous request timed out. Generate a more concise response."
            }
        }
        
        $testResult.Attempts += $attemptResult
        
        if ($attemptResult.Success) {
            break
        }
        
        if ($attempt -lt $maxAttempts) {
            Write-Log "Retrying with feedback..." "INFO" "Gray"
            Start-Sleep -Seconds 2
        }
    }
    
    $testResult.EndTime = Get-Date
    $testResult.TotalTime = ($testResult.EndTime - $testResult.StartTime).TotalSeconds
    $testResults += $testResult
}

# ============================================================
# PHASE 3: Results Summary
# ============================================================
Write-Host ""
Write-Host "═══ PHASE 3: Results Summary ═══" -ForegroundColor Yellow

$passed = ($testResults | Where-Object { $_.Success }).Count
$failed = ($testResults | Where-Object { -not $_.Success }).Count

Write-Host ""
if ($passed -eq $testResults.Count) {
    Write-Host "╔══════════════════════════════════════════════════════════════════╗" -ForegroundColor Green
    Write-Host "║                    ✓ ALL TESTS PASSED                            ║" -ForegroundColor Green
    Write-Host "╚══════════════════════════════════════════════════════════════════╝" -ForegroundColor Green
} elseif ($passed -gt 0) {
    Write-Host "╔══════════════════════════════════════════════════════════════════╗" -ForegroundColor Yellow
    Write-Host "║                    ⚠ PARTIAL SUCCESS                             ║" -ForegroundColor Yellow
    Write-Host "╚══════════════════════════════════════════════════════════════════╝" -ForegroundColor Yellow
} else {
    Write-Host "╔══════════════════════════════════════════════════════════════════╗" -ForegroundColor Red
    Write-Host "║                    ✗ ALL TESTS FAILED                            ║" -ForegroundColor Red
    Write-Host "╚══════════════════════════════════════════════════════════════════╝" -ForegroundColor Red
}

Write-Host ""
Write-Log "Results: $passed passed, $failed failed out of $($testResults.Count) tests" "INFO" "White"
Write-Host ""

foreach ($result in $testResults) {
    $status = if ($result.Success) { "✓ PASS" } else { "✗ FAIL" }
    $color = if ($result.Success) { "Green" } else { "Red" }
    $attempts = $result.Attempts.Count
    $time = [math]::Round($result.TotalTime, 1)
    
    Write-Host "  $status  $($result.Name) (${attempts} attempts, ${time}s)" -ForegroundColor $color
    
    if (-not $result.Success) {
        $lastAttempt = $result.Attempts | Select-Object -Last 1
        if ($lastAttempt.Error) {
            Write-Host "         Error: $($lastAttempt.Error)" -ForegroundColor Gray
        }
        if ($lastAttempt.ValidationResult -and $lastAttempt.ValidationResult.Issues) {
            foreach ($issue in $lastAttempt.ValidationResult.Issues | Select-Object -First 3) {
                Write-Host "         - $issue" -ForegroundColor Gray
            }
        }
    }
}

# Save full results
$summaryPath = Join-Path $OutputDir "test-summary.json"
$testResults | ConvertTo-Json -Depth 10 | Out-File $summaryPath
Write-Host ""
Write-Log "Full results saved to: $OutputDir" "INFO" "Cyan"

# ============================================================
# PHASE 4: Diagnostic Recommendations
# ============================================================
if ($failed -gt 0) {
    Write-Host ""
    Write-Host "═══ DIAGNOSTIC RECOMMENDATIONS ═══" -ForegroundColor Yellow
    Write-Host ""
    
    $hasJsonErrors = $testResults | Where-Object { 
        $_.Attempts | Where-Object { $_.Error -like "*JSON*" }
    }
    
    $hasTimeouts = $testResults | Where-Object {
        $_.Attempts | Where-Object { $_.Error -like "*timeout*" }
    }
    
    $hasValidationErrors = $testResults | Where-Object {
        $_.Attempts | Where-Object { $_.ValidationResult -and -not $_.ValidationResult.Valid }
    }
    
    if ($hasJsonErrors) {
        Write-Host "  → JSON PARSING ISSUES DETECTED" -ForegroundColor Yellow
        Write-Host "    The model is not returning valid JSON." -ForegroundColor Gray
        Write-Host "    Recommendations:" -ForegroundColor Gray
        Write-Host "    1. In LM Studio, check if the model has 'JSON Mode' or 'Structured Output'" -ForegroundColor Gray
        Write-Host "    2. Try a different model (Qwen2.5-32B-Instruct works well)" -ForegroundColor Gray
        Write-Host "    3. Check raw responses in: $OutputDir\*-response.txt" -ForegroundColor Gray
        Write-Host ""
    }
    
    if ($hasTimeouts) {
        Write-Host "  → TIMEOUT ISSUES DETECTED" -ForegroundColor Yellow
        Write-Host "    The model is too slow to respond within ${TimeoutSeconds}s." -ForegroundColor Gray
        Write-Host "    Recommendations:" -ForegroundColor Gray
        Write-Host "    1. Try a smaller/faster quantization (Q4_K_S instead of Q4_K_M)" -ForegroundColor Gray
        Write-Host "    2. Reduce context length in LM Studio settings" -ForegroundColor Gray
        Write-Host "    3. Re-run with -TimeoutSeconds 300" -ForegroundColor Gray
        Write-Host ""
    }
    
    if ($hasValidationErrors) {
        Write-Host "  → VALIDATION ISSUES DETECTED" -ForegroundColor Yellow
        Write-Host "    The model returns JSON but content doesn't meet requirements." -ForegroundColor Gray
        Write-Host "    Recommendations:" -ForegroundColor Gray
        Write-Host "    1. Check parsed JSON in: $OutputDir\*-parsed.json" -ForegroundColor Gray
        Write-Host "    2. The model may need prompt tuning for this specific schema" -ForegroundColor Gray
        Write-Host "    3. Try increasing temperature slightly (0.5-0.7)" -ForegroundColor Gray
        Write-Host ""
    }
}

# Cleanup if not keeping logs and all passed
if (-not $KeepLogs -and $passed -eq $testResults.Count) {
    Write-Log "All tests passed. Logs kept at: $OutputDir" "INFO" "Gray"
}

Write-Host ""
Write-Host "═══ TEST COMPLETE ═══" -ForegroundColor Cyan
Write-Host ""

exit $(if ($passed -eq $testResults.Count) { 0 } else { 1 })
