<#
.SYNOPSIS
    Safe Commit Script - Validates code before committing and pushing.

.DESCRIPTION
    Runs pre-commit validation checks (TypeScript, tests, issue state) and
    optionally commits and pushes changes if all checks pass.

.PARAMETER ValidateOnly
    Only run validation checks, do not commit or push.

.PARAMETER Message
    Custom commit message. If not provided, will generate from changed files.

.PARAMETER Scope
    Override auto-detected scope (e.g., "services", "components").

.PARAMETER Type
    Override auto-detected type (e.g., "fix", "feat", "docs").

.PARAMETER SkipTests
    Skip running unit tests (NOT RECOMMENDED for production commits).

.PARAMETER DryRun
    Show what would be committed without actually committing.

.EXAMPLE
    # Validate only
    .\safe-commit.ps1 -ValidateOnly

.EXAMPLE
    # Commit with auto-generated message
    .\safe-commit.ps1

.EXAMPLE
    # Commit with custom message
    .\safe-commit.ps1 -Message "fix(video): correct VAE version mismatch"

.EXAMPLE
    # Dry run to preview
    .\safe-commit.ps1 -DryRun
#>

[CmdletBinding()]
param(
    [switch]$ValidateOnly,
    [string]$Message,
    [string]$Scope,
    [string]$Type,
    [switch]$SkipTests,
    [switch]$DryRun
)

$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path -Parent $PSScriptRoot

# Colors for output
function Write-Status($msg) { Write-Host "  [*] $msg" -ForegroundColor Cyan }
function Write-Success($msg) { Write-Host "  [✓] $msg" -ForegroundColor Green }
function Write-Failure($msg) { Write-Host "  [✗] $msg" -ForegroundColor Red }
function Write-Warning($msg) { Write-Host "  [!] $msg" -ForegroundColor Yellow }
function Write-Info($msg) { Write-Host "      $msg" -ForegroundColor Gray }

# ═══════════════════════════════════════════════════════════════════════════
# BANNER
# ═══════════════════════════════════════════════════════════════════════════

Write-Host ""
Write-Host "═══════════════════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host "  SAFE COMMIT REVIEW" -ForegroundColor Cyan
Write-Host "═══════════════════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host ""

# ═══════════════════════════════════════════════════════════════════════════
# STEP 1: CHECK FOR CHANGES
# ═══════════════════════════════════════════════════════════════════════════

Write-Status "Checking for pending changes..."

Set-Location $ProjectRoot

$branch = git branch --show-current
$stagedFiles = git diff --cached --name-only
$unstagedFiles = git diff --name-only
$untrackedFiles = git ls-files --others --exclude-standard

$allChanges = @()
if ($stagedFiles) { $allChanges += $stagedFiles }
if ($unstagedFiles) { $allChanges += $unstagedFiles }
if ($untrackedFiles) { $allChanges += $untrackedFiles }
$allChanges = $allChanges | Select-Object -Unique

if ($allChanges.Count -eq 0) {
    Write-Success "No changes to commit."
    Write-Host ""
    exit 0
}

Write-Success "Found $($allChanges.Count) changed file(s) on branch: $branch"
Write-Info "Staged: $($stagedFiles.Count), Unstaged: $($unstagedFiles.Count), Untracked: $($untrackedFiles.Count)"
Write-Host ""

# ═══════════════════════════════════════════════════════════════════════════
# STEP 2: TYPESCRIPT CHECK
# ═══════════════════════════════════════════════════════════════════════════

Write-Status "Running TypeScript compilation check..."

$tscOutput = npx tsc --noEmit 2>&1
$tscExitCode = $LASTEXITCODE

if ($tscExitCode -ne 0) {
    Write-Failure "TypeScript compilation failed!"
    Write-Host ""
    Write-Host $tscOutput -ForegroundColor Red
    Write-Host ""
    Write-Host "  Fix TypeScript errors before committing." -ForegroundColor Yellow
    exit 1
}

Write-Success "TypeScript compilation passed (0 errors)"
Write-Host ""

# ═══════════════════════════════════════════════════════════════════════════
# STEP 3: UNIT TESTS
# ═══════════════════════════════════════════════════════════════════════════

if (-not $SkipTests) {
    Write-Status "Running unit tests..."
    
    # npm test already has --run, so just run it directly
    $testOutput = npm test 2>&1
    $testExitCode = $LASTEXITCODE
    
    if ($testExitCode -ne 0) {
        Write-Failure "Unit tests failed!"
        Write-Host ""
        # Show last 20 lines of output
        $testOutput | Select-Object -Last 20 | ForEach-Object { Write-Host $_ -ForegroundColor Red }
        Write-Host ""
        Write-Host "  Fix failing tests before committing." -ForegroundColor Yellow
        exit 1
    }
    
    # Extract pass count from output
    $passLine = $testOutput | Select-String -Pattern "(\d+) passed" | Select-Object -Last 1
    if ($passLine) {
        Write-Success "Unit tests passed ($($passLine.Matches.Groups[1].Value) tests)"
    } else {
        Write-Success "Unit tests passed"
    }
    Write-Host ""
} else {
    Write-Warning "Skipping unit tests (--SkipTests flag)"
    Write-Host ""
}

# ═══════════════════════════════════════════════════════════════════════════
# STEP 4: CHECK GUARDIAN ISSUES
# ═══════════════════════════════════════════════════════════════════════════

Write-Status "Checking Guardian issue state..."

$issuesPath = Join-Path $ProjectRoot "agent\.state\issues.json"

if (Test-Path $issuesPath) {
    try {
        $issues = Get-Content $issuesPath -Raw | ConvertFrom-Json
        
        $criticalCount = ($issues | Where-Object { $_.severity -eq "critical" -and $_.status -ne "resolved" }).Count
        $highCount = ($issues | Where-Object { $_.severity -eq "high" -and $_.status -ne "resolved" }).Count
        
        if ($criticalCount -gt 0) {
            Write-Failure "Found $criticalCount critical issue(s)!"
            Write-Host ""
            Write-Host "  Critical issues must be resolved before committing." -ForegroundColor Yellow
            Write-Host "  Run: npm run guardian:status" -ForegroundColor Yellow
            exit 1
        }
        
        if ($highCount -gt 0) {
            Write-Warning "Found $highCount high-priority issue(s) (proceeding with caution)"
        } else {
            Write-Success "No critical issues found"
        }
    } catch {
        Write-Warning "Could not parse issues.json (continuing)"
    }
} else {
    Write-Info "No issues.json found (Guardian not active)"
}
Write-Host ""

# ═══════════════════════════════════════════════════════════════════════════
# STEP 5: CHECK FOR MERGE CONFLICTS
# ═══════════════════════════════════════════════════════════════════════════

Write-Status "Checking for merge conflicts..."

$conflictMarkers = git diff --check 2>&1
if ($conflictMarkers -match "conflict") {
    Write-Failure "Merge conflicts detected!"
    Write-Host ""
    Write-Host $conflictMarkers -ForegroundColor Red
    exit 1
}

Write-Success "No merge conflicts"
Write-Host ""

# ═══════════════════════════════════════════════════════════════════════════
# VALIDATION COMPLETE
# ═══════════════════════════════════════════════════════════════════════════

if ($ValidateOnly) {
    Write-Host "═══════════════════════════════════════════════════════════════" -ForegroundColor Green
    Write-Host "  ✓ ALL VALIDATION CHECKS PASSED" -ForegroundColor Green
    Write-Host "═══════════════════════════════════════════════════════════════" -ForegroundColor Green
    Write-Host ""
    Write-Host "  Ready to commit. Run without -ValidateOnly to commit and push."
    Write-Host ""
    exit 0
}

# ═══════════════════════════════════════════════════════════════════════════
# STEP 6: AUTO-DETECT SCOPE AND TYPE
# ═══════════════════════════════════════════════════════════════════════════

if (-not $Message) {
    Write-Status "Auto-detecting commit scope and type..."
    
    # Detect scope from changed files
    $scopeMap = @{
        "services/" = "services"
        "components/" = "components"
        "agent/" = "agent"
        "scripts/" = "scripts"
        "workflows/" = "workflows"
        "tests/" = "tests"
        ".github/" = "ci"
        "Documentation/" = "docs"
        "utils/" = "utils"
        "hooks/" = "utils"
        "contexts/" = "contexts"
        "store/" = "store"
    }
    
    $detectedScopes = @{}
    foreach ($file in $allChanges) {
        foreach ($pattern in $scopeMap.Keys) {
            if ($file -like "$pattern*") {
                $scopeVal = $scopeMap[$pattern]
                if (-not $detectedScopes.ContainsKey($scopeVal)) {
                    $detectedScopes[$scopeVal] = 0
                }
                $detectedScopes[$scopeVal]++
                break
            }
        }
    }
    
    # Pick the most common scope
    if (-not $Scope -and $detectedScopes.Count -gt 0) {
        $Scope = ($detectedScopes.GetEnumerator() | Sort-Object Value -Descending | Select-Object -First 1).Key
    }
    
    # Detect type from file extensions and patterns
    if (-not $Type) {
        $hasTestChanges = $allChanges | Where-Object { $_ -match "\.test\.ts$|\.spec\.ts$|tests/" }
        $hasDocChanges = $allChanges | Where-Object { $_ -match "\.md$|Documentation/" }
        $hasConfigChanges = $allChanges | Where-Object { $_ -match "\.json$|\.config\.|tsconfig|vite\.config|vitest\.config" }
        
        if ($hasDocChanges -and -not ($allChanges | Where-Object { $_ -match "\.(ts|tsx|js|jsx)$" })) {
            $Type = "docs"
        } elseif ($hasTestChanges -and $hasTestChanges.Count -eq $allChanges.Count) {
            $Type = "test"
        } elseif ($hasConfigChanges -and $hasConfigChanges.Count -eq $allChanges.Count) {
            $Type = "chore"
        } else {
            # Default to fix for now - agent can override
            $Type = "fix"
        }
    }
    
    Write-Info "Detected scope: $Scope"
    Write-Info "Detected type: $Type"
    Write-Host ""
    
    # Generate commit message prompt
    Write-Warning "No commit message provided."
    Write-Host ""
    Write-Host "  Provide a message with: -Message `"$Type($Scope): <description>`"" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "  Changed files:" -ForegroundColor Gray
    $allChanges | Select-Object -First 10 | ForEach-Object { Write-Host "    - $_" -ForegroundColor Gray }
    if ($allChanges.Count -gt 10) {
        Write-Host "    ... and $($allChanges.Count - 10) more" -ForegroundColor Gray
    }
    Write-Host ""
    exit 0
}

# ═══════════════════════════════════════════════════════════════════════════
# STEP 7: DRY RUN CHECK
# ═══════════════════════════════════════════════════════════════════════════

if ($DryRun) {
    Write-Host "═══════════════════════════════════════════════════════════════" -ForegroundColor Yellow
    Write-Host "  DRY RUN - Would commit with:" -ForegroundColor Yellow
    Write-Host "═══════════════════════════════════════════════════════════════" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "  Message: $Message" -ForegroundColor Cyan
    Write-Host "  Branch:  $branch" -ForegroundColor Cyan
    Write-Host "  Files:   $($allChanges.Count)" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "  Files to commit:"
    $allChanges | ForEach-Object { Write-Host "    - $_" -ForegroundColor Gray }
    Write-Host ""
    exit 0
}

# ═══════════════════════════════════════════════════════════════════════════
# STEP 8: STAGE AND COMMIT
# ═══════════════════════════════════════════════════════════════════════════

Write-Status "Staging all changes..."
git add -A
Write-Success "All changes staged"
Write-Host ""

Write-Status "Committing with message: $Message"
$commitOutput = git commit -m $Message 2>&1
$commitExitCode = $LASTEXITCODE

if ($commitExitCode -ne 0) {
    Write-Failure "Commit failed!"
    Write-Host $commitOutput -ForegroundColor Red
    exit 1
}

$commitSha = git rev-parse --short HEAD
Write-Success "Committed: $commitSha"
Write-Host ""

# ═══════════════════════════════════════════════════════════════════════════
# STEP 9: PUSH TO REMOTE
# ═══════════════════════════════════════════════════════════════════════════

Write-Status "Pushing to origin/$branch..."
$pushOutput = git push origin $branch 2>&1
$pushExitCode = $LASTEXITCODE

if ($pushExitCode -ne 0) {
    Write-Failure "Push failed!"
    Write-Host $pushOutput -ForegroundColor Red
    Write-Host ""
    Write-Host "  Commit was made locally. You may need to push manually." -ForegroundColor Yellow
    Write-Host "  git push origin $branch" -ForegroundColor Yellow
    exit 1
}

Write-Success "Pushed to origin/$branch"
Write-Host ""

# ═══════════════════════════════════════════════════════════════════════════
# SUCCESS
# ═══════════════════════════════════════════════════════════════════════════

Write-Host "═══════════════════════════════════════════════════════════════" -ForegroundColor Green
Write-Host "  ✓ COMMIT AND PUSH SUCCESSFUL" -ForegroundColor Green
Write-Host "═══════════════════════════════════════════════════════════════" -ForegroundColor Green
Write-Host ""
Write-Host "  Commit: $commitSha" -ForegroundColor Cyan
Write-Host "  Branch: $branch" -ForegroundColor Cyan
Write-Host "  Remote: origin/$branch" -ForegroundColor Cyan
Write-Host "  Files:  $($allChanges.Count) changed" -ForegroundColor Cyan
Write-Host ""
Write-Host "  Message: $Message" -ForegroundColor Gray
Write-Host ""

exit 0
