<#
.SYNOPSIS
    Undo the last git commit safely.

.DESCRIPTION
    Provides options to undo the last commit either locally (soft reset)
    or both locally and remotely (force push). Includes safety confirmations.

.PARAMETER Mode
    How to undo the commit:
    - "soft"  : Keep changes staged (default)
    - "hard"  : Discard all changes
    - "revert": Create a new commit that undoes the last commit

.PARAMETER Force
    Skip confirmation prompts.

.PARAMETER IncludeRemote
    Also undo on remote (requires force push for soft/hard modes).

.EXAMPLE
    # Undo last commit, keep changes staged
    .\undo-last-commit.ps1

.EXAMPLE
    # Undo and discard changes
    .\undo-last-commit.ps1 -Mode hard

.EXAMPLE
    # Create revert commit
    .\undo-last-commit.ps1 -Mode revert

.EXAMPLE
    # Undo locally and on remote
    .\undo-last-commit.ps1 -IncludeRemote
#>

[CmdletBinding()]
param(
    [ValidateSet("soft", "hard", "revert")]
    [string]$Mode = "soft",
    [switch]$Force,
    [switch]$IncludeRemote
)

$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path -Parent $PSScriptRoot

function Write-Status($msg) { Write-Host "  [*] $msg" -ForegroundColor Cyan }
function Write-Success($msg) { Write-Host "  [✓] $msg" -ForegroundColor Green }
function Write-Failure($msg) { Write-Host "  [✗] $msg" -ForegroundColor Red }
function Write-Warning($msg) { Write-Host "  [!] $msg" -ForegroundColor Yellow }

# ═══════════════════════════════════════════════════════════════════════════
# BANNER
# ═══════════════════════════════════════════════════════════════════════════

Write-Host ""
Write-Host "═══════════════════════════════════════════════════════════════" -ForegroundColor Yellow
Write-Host "  UNDO LAST COMMIT" -ForegroundColor Yellow
Write-Host "═══════════════════════════════════════════════════════════════" -ForegroundColor Yellow
Write-Host ""

Set-Location $ProjectRoot

# ═══════════════════════════════════════════════════════════════════════════
# GET LAST COMMIT INFO
# ═══════════════════════════════════════════════════════════════════════════

Write-Status "Getting last commit info..."

$branch = git branch --show-current
$lastCommitSha = git rev-parse --short HEAD
$lastCommitMessage = git log -1 --pretty=format:"%s"
$lastCommitAuthor = git log -1 --pretty=format:"%an"
$lastCommitDate = git log -1 --pretty=format:"%ar"

Write-Host ""
Write-Host "  Last commit on branch: $branch" -ForegroundColor Gray
Write-Host "  ─────────────────────────────────────────────────────" -ForegroundColor Gray
Write-Host "  SHA:     $lastCommitSha" -ForegroundColor Cyan
Write-Host "  Message: $lastCommitMessage" -ForegroundColor White
Write-Host "  Author:  $lastCommitAuthor" -ForegroundColor Gray
Write-Host "  Date:    $lastCommitDate" -ForegroundColor Gray
Write-Host ""

# ═══════════════════════════════════════════════════════════════════════════
# CONFIRMATION
# ═══════════════════════════════════════════════════════════════════════════

if (-not $Force) {
    Write-Warning "This will undo the commit above."
    Write-Host ""
    
    switch ($Mode) {
        "soft" {
            Write-Host "  Mode: SOFT RESET" -ForegroundColor Yellow
            Write-Host "  • Commit will be removed" -ForegroundColor Gray
            Write-Host "  • Changes will remain STAGED" -ForegroundColor Gray
        }
        "hard" {
            Write-Host "  Mode: HARD RESET" -ForegroundColor Red
            Write-Host "  • Commit will be removed" -ForegroundColor Gray
            Write-Host "  • ALL CHANGES WILL BE LOST" -ForegroundColor Red
        }
        "revert" {
            Write-Host "  Mode: REVERT" -ForegroundColor Green
            Write-Host "  • A new commit will be created that undoes the changes" -ForegroundColor Gray
            Write-Host "  • History is preserved" -ForegroundColor Gray
        }
    }
    
    if ($IncludeRemote -and $Mode -ne "revert") {
        Write-Host ""
        Write-Host "  ⚠️  REMOTE WILL BE FORCE-PUSHED" -ForegroundColor Red
        Write-Host "  This can cause issues for other collaborators!" -ForegroundColor Red
    }
    
    Write-Host ""
    $confirm = Read-Host "  Continue? (y/N)"
    
    if ($confirm -ne "y" -and $confirm -ne "Y") {
        Write-Host ""
        Write-Host "  Aborted." -ForegroundColor Gray
        Write-Host ""
        exit 0
    }
    Write-Host ""
}

# ═══════════════════════════════════════════════════════════════════════════
# EXECUTE UNDO
# ═══════════════════════════════════════════════════════════════════════════

switch ($Mode) {
    "soft" {
        Write-Status "Performing soft reset..."
        git reset --soft HEAD~1
        if ($LASTEXITCODE -ne 0) {
            Write-Failure "Soft reset failed!"
            exit 1
        }
        Write-Success "Commit removed, changes are staged"
    }
    "hard" {
        Write-Status "Performing hard reset..."
        git reset --hard HEAD~1
        if ($LASTEXITCODE -ne 0) {
            Write-Failure "Hard reset failed!"
            exit 1
        }
        Write-Success "Commit removed, changes discarded"
    }
    "revert" {
        Write-Status "Creating revert commit..."
        git revert HEAD --no-edit
        if ($LASTEXITCODE -ne 0) {
            Write-Failure "Revert failed!"
            exit 1
        }
        $revertSha = git rev-parse --short HEAD
        Write-Success "Revert commit created: $revertSha"
    }
}

Write-Host ""

# ═══════════════════════════════════════════════════════════════════════════
# PUSH TO REMOTE (IF REQUESTED)
# ═══════════════════════════════════════════════════════════════════════════

if ($IncludeRemote) {
    Write-Status "Pushing to remote..."
    
    if ($Mode -eq "revert") {
        # Revert creates a new commit, normal push
        git push origin $branch
    } else {
        # Soft/hard reset requires force push
        git push --force-with-lease origin $branch
    }
    
    if ($LASTEXITCODE -ne 0) {
        Write-Failure "Push failed!"
        Write-Host ""
        Write-Host "  Local undo was successful, but remote push failed." -ForegroundColor Yellow
        Write-Host "  You may need to push manually:" -ForegroundColor Yellow
        if ($Mode -eq "revert") {
            Write-Host "    git push origin $branch" -ForegroundColor Cyan
        } else {
            Write-Host "    git push --force-with-lease origin $branch" -ForegroundColor Cyan
        }
        exit 1
    }
    
    Write-Success "Remote updated"
    Write-Host ""
}

# ═══════════════════════════════════════════════════════════════════════════
# SUCCESS
# ═══════════════════════════════════════════════════════════════════════════

Write-Host "═══════════════════════════════════════════════════════════════" -ForegroundColor Green
Write-Host "  ✓ UNDO COMPLETE" -ForegroundColor Green
Write-Host "═══════════════════════════════════════════════════════════════" -ForegroundColor Green
Write-Host ""
Write-Host "  Undone commit: $lastCommitSha - $lastCommitMessage" -ForegroundColor Gray
Write-Host "  Current HEAD:  $(git rev-parse --short HEAD)" -ForegroundColor Cyan
Write-Host ""

if ($Mode -eq "soft") {
    Write-Host "  Your changes are staged. To see them:" -ForegroundColor Gray
    Write-Host "    git diff --cached" -ForegroundColor Cyan
    Write-Host ""
}

exit 0
