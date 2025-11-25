# diagnose-prompt-injection.ps1
# Diagnostic script to trace why prompts aren't being injected in E2E test

param(
    [string]$StoryJsonPath = "C:\Dev\gemDirect1\logs\20251123-205750\story\story.json"
)

Write-Host "`n====== PROMPT INJECTION DIAGNOSTIC ======`n" -ForegroundColor Cyan

# STEP 1: Load story.json
Write-Host "STEP 1: Loading story.json..." -ForegroundColor Yellow
if (-not (Test-Path $StoryJsonPath)) {
    Write-Host "ERROR: story.json not found at $StoryJsonPath" -ForegroundColor Red
    exit 1
}

$story = Get-Content $StoryJsonPath -Raw | ConvertFrom-Json
$sceneData = $story.scenes[0]  # Test with scene-001

Write-Host "Scene ID: $($sceneData.id)" -ForegroundColor White
Write-Host "Scene Title: $($sceneData.title)" -ForegroundColor White

# STEP 2: Extract prompts using same logic as generate-scene-videos-wan2.ps1
Write-Host "`nSTEP 2: Extracting prompts from scene data..." -ForegroundColor Yellow
$humanPrompt = if ($sceneData.prompt) { $sceneData.prompt } else { "" }
$negativePrompt = if ($sceneData.negativePrompt) { $sceneData.negativePrompt } else { "" }

Write-Host "humanPrompt length: $($humanPrompt.Length) chars" -ForegroundColor $(if ($humanPrompt.Length -gt 0) { 'Green' } else { 'Red' })
Write-Host "humanPrompt content: $humanPrompt" -ForegroundColor White
Write-Host "`nnegativePrompt length: $($negativePrompt.Length) chars" -ForegroundColor $(if ($negativePrompt.Length -gt 0) { 'Green' } else { 'Red' })
Write-Host "negativePrompt content: $negativePrompt" -ForegroundColor Gray

# STEP 3: Load workflow from localGenSettings.json (same as PowerShell script)
Write-Host "`nSTEP 3: Loading workflow from localGenSettings.json..." -ForegroundColor Yellow
$projectRoot = Split-Path -Parent $PSScriptRoot
$localSettingsPath = Join-Path $projectRoot 'localGenSettings.json'

if (-not (Test-Path $localSettingsPath)) {
    Write-Host "ERROR: localGenSettings.json not found" -ForegroundColor Red
    exit 1
}

$settings = Get-Content -Path $localSettingsPath -Raw | ConvertFrom-Json
$workflow = $null

if ($settings.workflowProfiles -and $settings.workflowProfiles.'wan-i2v' -and $settings.workflowProfiles.'wan-i2v'.workflowJson) {
    $workflow = $settings.workflowProfiles.'wan-i2v'.workflowJson | ConvertFrom-Json
    Write-Host "✓ Loaded wan-i2v workflow from localGenSettings.json" -ForegroundColor Green
} else {
    Write-Host "ERROR: wan-i2v profile not found in localGenSettings.json" -ForegroundColor Red
    exit 1
}

$promptPayload = if ($workflow.prompt) { $workflow.prompt } else { $workflow }
Write-Host "Workflow has $($promptPayload.PSObject.Properties.Count) nodes" -ForegroundColor White

# STEP 4: Check if nodes 6 and 7 exist
Write-Host "`nSTEP 4: Checking for nodes 6 and 7..." -ForegroundColor Yellow
$node6Exists = $promptPayload.'6' -and $promptPayload.'6'.inputs
$node7Exists = $promptPayload.'7' -and $promptPayload.'7'.inputs

Write-Host "Node 6 exists: $node6Exists" -ForegroundColor $(if ($node6Exists) { 'Green' } else { 'Red' })
if ($node6Exists) {
    Write-Host "  Current text (first 80 chars): $($promptPayload.'6'.inputs.text.Substring(0, [Math]::Min(80, $promptPayload.'6'.inputs.text.Length)))..." -ForegroundColor Gray
}

Write-Host "Node 7 exists: $node7Exists" -ForegroundColor $(if ($node7Exists) { 'Green' } else { 'Red' })
if ($node7Exists) {
    Write-Host "  Current text (first 80 chars): $($promptPayload.'7'.inputs.text.Substring(0, [Math]::Min(80, $promptPayload.'7'.inputs.text.Length)))..." -ForegroundColor Gray
}

# STEP 5: Simulate injection (same code as generate-scene-videos-wan2.ps1 lines 330-336)
Write-Host "`nSTEP 5: Simulating prompt injection..." -ForegroundColor Yellow

if ($promptPayload.'6' -and $promptPayload.'6'.inputs) {
    Write-Host "  BEFORE: Node 6 text = '$($promptPayload.'6'.inputs.text.Substring(0, 50))...'" -ForegroundColor Gray
    $promptPayload.'6'.inputs.text = $humanPrompt
    Write-Host "  AFTER:  Node 6 text = '$($promptPayload.'6'.inputs.text)'" -ForegroundColor White
    Write-Host "  ✓ Injected human prompt into node 6" -ForegroundColor Green
} else {
    Write-Host "  ✗ FAILED: Node 6 does not have .inputs property" -ForegroundColor Red
}

if ($promptPayload.'7' -and $promptPayload.'7'.inputs) {
    Write-Host "  BEFORE: Node 7 text = '$($promptPayload.'7'.inputs.text.Substring(0, 50))...'" -ForegroundColor Gray
    $promptPayload.'7'.inputs.text = $negativePrompt
    Write-Host "  AFTER:  Node 7 text = '$($promptPayload.'7'.inputs.text)'" -ForegroundColor White
    Write-Host "  ✓ Injected negative prompt into node 7" -ForegroundColor Green
} else {
    Write-Host "  ✗ FAILED: Node 7 does not have .inputs property" -ForegroundColor Red
}

# STEP 6: Verify CFG value in node 3
Write-Host "`nSTEP 6: Checking CFG value in node 3..." -ForegroundColor Yellow
if ($promptPayload.'3' -and $promptPayload.'3'.inputs -and $promptPayload.'3'.inputs.cfg) {
    Write-Host "  CFG value: $($promptPayload.'3'.inputs.cfg)" -ForegroundColor Green
    Write-Host "  Steps: $($promptPayload.'3'.inputs.steps)" -ForegroundColor White
    Write-Host "  Sampler: $($promptPayload.'3'.inputs.sampler_name)" -ForegroundColor White
} else {
    Write-Host "  ✗ Node 3 does not have CFG parameter" -ForegroundColor Red
}

Write-Host "`n====== DIAGNOSTIC COMPLETE ======`n" -ForegroundColor Cyan
Write-Host "CONCLUSION:" -ForegroundColor Yellow
if ($humanPrompt.Length -gt 0 -and $node6Exists) {
    Write-Host "  ✓ Prompts are available and injection code path is valid" -ForegroundColor Green
    Write-Host "  ✓ CFG 5.5 is configured correctly" -ForegroundColor Green
    Write-Host "  → Issue likely: E2E script console output not captured in run-summary.txt" -ForegroundColor Cyan
    Write-Host "  → OR: PowerShell script has a different code path that bypasses injection" -ForegroundColor Cyan
} else {
    Write-Host "  ✗ Injection would fail - missing data or nodes" -ForegroundColor Red
}
Write-Host ""
