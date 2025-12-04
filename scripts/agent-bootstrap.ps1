<#
.SYNOPSIS
    Bootstrap script for Project Guardian agent
.DESCRIPTION
    Sets up and validates the Guardian agent installation
.EXAMPLE
    .\agent-bootstrap.ps1
    .\agent-bootstrap.ps1 -Validate
    .\agent-bootstrap.ps1 -Start
#>

param(
    [switch]$Validate,
    [switch]$Start,
    [switch]$Force
)

$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path -Parent $PSScriptRoot

Write-Host "`n" -NoNewline
Write-Host "═" * 60 -ForegroundColor Cyan
Write-Host "  PROJECT GUARDIAN - BOOTSTRAP" -ForegroundColor Cyan
Write-Host "═" * 60 -ForegroundColor Cyan
Write-Host ""

# Check Node.js version
Write-Host "📦 Checking Node.js..." -ForegroundColor Yellow
$nodeVersion = node --version
$nodeVersionNum = [version]($nodeVersion -replace 'v', '' -replace '-.*', '')
$requiredVersion = [version]"22.19.0"

if ($nodeVersionNum -lt $requiredVersion) {
    Write-Error "Node.js $requiredVersion or higher required. Current: $nodeVersion"
    exit 1
}
Write-Host "   ✅ Node.js $nodeVersion" -ForegroundColor Green

# Check npm dependencies
Write-Host "📦 Checking dependencies..." -ForegroundColor Yellow
Push-Location $ProjectRoot

$packageJson = Get-Content "package.json" | ConvertFrom-Json
$hasChokidar = $packageJson.dependencies.PSObject.Properties.Name -contains "chokidar"
$hasCommander = $packageJson.dependencies.PSObject.Properties.Name -contains "commander"
$hasTsx = $packageJson.devDependencies.PSObject.Properties.Name -contains "tsx"

if (-not $hasChokidar -or -not $hasCommander -or -not $hasTsx) {
    Write-Host "   Installing missing dependencies..." -ForegroundColor Yellow
    npm install
}
Write-Host "   ✅ Dependencies installed" -ForegroundColor Green

# Verify agent directory structure
Write-Host "📁 Checking agent directories..." -ForegroundColor Yellow
$agentDirs = @(
    "agent/core",
    "agent/watchers",
    "agent/tasks",
    "agent/__tests__",
    "agent/reports",
    "agent/queue",
    "agent/logs",
    "agent/.state"
)

foreach ($dir in $agentDirs) {
    $fullPath = Join-Path $ProjectRoot $dir
    if (-not (Test-Path $fullPath)) {
        New-Item -ItemType Directory -Force -Path $fullPath | Out-Null
        Write-Host "   Created: $dir" -ForegroundColor Gray
    }
}
Write-Host "   ✅ Agent directories ready" -ForegroundColor Green

# Verify core files exist
Write-Host "📄 Checking agent source files..." -ForegroundColor Yellow
$coreFiles = @(
    "agent/index.ts",
    "agent/core/Guardian.ts",
    "agent/core/types.ts",
    "agent/core/Logger.ts",
    "agent/core/StateManager.ts",
    "agent/core/TaskRunner.ts",
    "agent/watchers/TypeScriptWatcher.ts",
    "agent/watchers/TestWatcher.ts",
    "agent/watchers/FileWatcher.ts",
    "agent/watchers/GapAnalyzer.ts",
    "agent/tasks/AutoFix.ts",
    "agent/tasks/CopilotQueue.ts",
    "agent/tasks/ReportGenerator.ts"
)

$missingFiles = @()
foreach ($file in $coreFiles) {
    $fullPath = Join-Path $ProjectRoot $file
    if (-not (Test-Path $fullPath)) {
        $missingFiles += $file
    }
}

if ($missingFiles.Count -gt 0) {
    Write-Host "   ❌ Missing files:" -ForegroundColor Red
    foreach ($file in $missingFiles) {
        Write-Host "      - $file" -ForegroundColor Red
    }
    if (-not $Force) {
        Write-Error "Agent source files missing. Run setup again or use -Force to continue."
        exit 1
    }
} else {
    Write-Host "   ✅ All source files present" -ForegroundColor Green
}

# Check GitHub CLI
Write-Host "🔧 Checking GitHub CLI..." -ForegroundColor Yellow
try {
    $ghVersion = gh --version 2>&1 | Select-Object -First 1
    Write-Host "   ✅ $ghVersion" -ForegroundColor Green
    
    # Check Copilot extension
    $copilotInstalled = gh extension list 2>&1 | Select-String "copilot"
    if ($copilotInstalled) {
        Write-Host "   ✅ GitHub Copilot CLI extension installed" -ForegroundColor Green
    } else {
        Write-Host "   ⚠️  GitHub Copilot CLI extension not installed" -ForegroundColor Yellow
        Write-Host "      Install with: gh extension install github/gh-copilot" -ForegroundColor Gray
    }
} catch {
    Write-Host "   ⚠️  GitHub CLI not found (optional)" -ForegroundColor Yellow
    Write-Host "      Install from: https://cli.github.com" -ForegroundColor Gray
}

# Validate TypeScript compilation
Write-Host "🔤 Validating TypeScript..." -ForegroundColor Yellow
try {
    $tscOutput = npx tsc --noEmit 2>&1
    if ($LASTEXITCODE -eq 0) {
        Write-Host "   ✅ TypeScript compilation OK" -ForegroundColor Green
    } else {
        Write-Host "   ⚠️  TypeScript has errors (agent will report these)" -ForegroundColor Yellow
    }
} catch {
    Write-Host "   ⚠️  Could not run TypeScript check" -ForegroundColor Yellow
}

Pop-Location

# Summary
Write-Host "`n" -NoNewline
Write-Host "═" * 60 -ForegroundColor Cyan
Write-Host "  BOOTSTRAP COMPLETE" -ForegroundColor Green
Write-Host "═" * 60 -ForegroundColor Cyan
Write-Host ""
Write-Host "  Available commands:" -ForegroundColor White
Write-Host "    npm run guardian          # Start guardian (foreground)" -ForegroundColor Gray
Write-Host "    npm run guardian:start    # Start as daemon" -ForegroundColor Gray
Write-Host "    npm run guardian:stop     # Stop daemon" -ForegroundColor Gray
Write-Host "    npm run guardian:status   # Show status" -ForegroundColor Gray
Write-Host "    npm run guardian:report   # View latest report" -ForegroundColor Gray
Write-Host "    npm run guardian:queue    # Process Copilot queue" -ForegroundColor Gray
Write-Host ""
Write-Host "  VS Code tasks:" -ForegroundColor White
Write-Host "    Guardian: Start           # Run guardian" -ForegroundColor Gray
Write-Host "    Guardian: Status          # Check status" -ForegroundColor Gray
Write-Host "    Guardian: Report          # View report" -ForegroundColor Gray
Write-Host ""

if ($Validate) {
    Write-Host "  Running validation scan..." -ForegroundColor Yellow
    Push-Location $ProjectRoot
    npm run guardian -- --scan
    Pop-Location
}

if ($Start) {
    Write-Host "  Starting guardian..." -ForegroundColor Yellow
    Push-Location $ProjectRoot
    npm run guardian
    Pop-Location
}

Write-Host ""
