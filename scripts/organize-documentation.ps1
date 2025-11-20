#!/usr/bin/env pwsh
# Organization script for gemDirect1 documentation
# Systematically categorizes and relocates all scattered .md files into hierarchical structure

param(
    [switch]$DryRun = $false,
    [switch]$Force = $false
)

$ErrorActionPreference = "Stop"
$rootDir = "C:\Dev\gemDirect1"

# Define directory structure
$directories = @{
    "Documentation" = @{
        "Guides" = @()
        "API" = @()
        "Architecture" = @()
        "References" = @()
    }
    "Development_History" = @{
        "Phases" = @()
        "Sessions" = @()
        "Milestones" = @()
        "Changelogs" = @()
    }
    "Agents" = @{
        "Handoffs" = @()
        "Instructions" = @()
    }
    "Testing" = @{
        "E2E" = @()
        "Unit" = @()
        "Reports" = @()
        "Strategies" = @()
    }
    "Workflows" = @{
        "ComfyUI" = @()
        "Guides" = @()
    }
}

# File categorization rules (patterns → destination)
$categorization = @(
    # Handoff documents
    @{ Pattern = "HANDOFF|NEXT_AGENT|COMPREHENSIVE_AGENT|MASTER_HANDOFF|AGENT_HANDOFF"; Destination = "Agents/Handoffs" }
    
    # Phase documents
    @{ Pattern = "^PHASE_|^00_PHASE_"; Destination = "Development_History/Phases" }
    @{ Pattern = "^WAVE_\d+"; Destination = "Development_History/Phases" }
    @{ Pattern = "MILESTONE"; Destination = "Development_History/Milestones" }
    
    # Session documents
    @{ Pattern = "SESSION_|CONTINUATION_SESSION"; Destination = "Development_History/Sessions" }
    @{ Pattern = "DEVELOPMENT_SESSION"; Destination = "Development_History/Sessions" }
    
    # Testing documents
    @{ Pattern = "^E2E_|TEST_|TESTING_"; Destination = "Testing/E2E" }
    @{ Pattern = "VALIDATION_|VERIFICATION_"; Destination = "Testing/Reports" }
    @{ Pattern = "TESTING_STRATEGY|TEST_COVERAGE"; Destination = "Testing/Strategies" }
    
    # ComfyUI documents
    @{ Pattern = "COMFYUI_|WORKFLOW_"; Destination = "Workflows/ComfyUI" }
    
    # Documentation indexes
    @{ Pattern = "DOCUMENTATION_INDEX|INDEX.*20\d{6}|MASTER_INDEX"; Destination = "Documentation/References" }
    @{ Pattern = "REFERENCE|QUICK_REFERENCE"; Destination = "Documentation/References" }
    
    # Guides and Quick Starts
    @{ Pattern = "GUIDE|QUICK_START|START_HERE|QUICK_FIX"; Destination = "Documentation/Guides" }
    @{ Pattern = "RUNBOOK|SETUP"; Destination = "Documentation/Guides" }
    
    # Architecture
    @{ Pattern = "ARCHITECTURE|WORKFLOW_ARCHITECTURE"; Destination = "Documentation/Architecture" }
    @{ Pattern = "DATA_FLOW|TELEMETRY_CONTRACT"; Destination = "Documentation/Architecture" }
    
    # Status and reports
    @{ Pattern = "STATUS|REPORT|EXECUTIVE_SUMMARY"; Destination = "Development_History/Sessions" }
    @{ Pattern = "COMPLETION_CHECKLIST|DELIVERABLES"; Destination = "Development_History/Sessions" }
    @{ Pattern = "DEPLOYMENT_READY|FINAL_DELIVERY"; Destination = "Development_History/Milestones" }
)

function New-DirectoryStructure {
    Write-Host "`n=== Creating Directory Structure ===" -ForegroundColor Cyan
    
    foreach ($category in $directories.Keys) {
        $categoryPath = Join-Path $rootDir $category
        
        if (-not (Test-Path $categoryPath)) {
            if (-not $DryRun) {
                New-Item -ItemType Directory -Path $categoryPath -Force | Out-Null
            }
            Write-Host "Created: $category/" -ForegroundColor Green
        }
        
        foreach ($subcategory in $directories[$category].Keys) {
            $subcategoryPath = Join-Path $categoryPath $subcategory
            
            if (-not (Test-Path $subcategoryPath)) {
                if (-not $DryRun) {
                    New-Item -ItemType Directory -Path $subcategoryPath -Force | Out-Null
                }
                Write-Host "Created: $category/$subcategory/" -ForegroundColor Green
            }
        }
    }
}

function Get-FileDestination {
    param([string]$FileName)
    
    foreach ($rule in $categorization) {
        if ($FileName -match $rule.Pattern) {
            return $rule.Destination
        }
    }
    
    return "Documentation/References"  # Default destination
}

function Move-DocumentationFiles {
    Write-Host "`n=== Organizing Documentation Files ===" -ForegroundColor Cyan
    
    $mdFiles = Get-ChildItem (Join-Path $rootDir "*.md") -File
    $movedCount = 0
    $skippedFiles = @()
    
    # Files to keep in root
    $keepInRoot = @("README.md", "TODO.md", "START_HERE.md", "AGENT_HANDOFF_CORRECTION_20251120.md")
    
    foreach ($file in $mdFiles) {
        if ($keepInRoot -contains $file.Name) {
            Write-Host "Keeping in root: $($file.Name)" -ForegroundColor Yellow
            continue
        }
        
        $destination = Get-FileDestination $file.Name
        $destPath = Join-Path $rootDir $destination
        $destFile = Join-Path $destPath $file.Name
        
        if (Test-Path $destFile) {
            if (-not $Force) {
                Write-Host "Skipping (exists): $($file.Name) -> $destination" -ForegroundColor DarkYellow
                $skippedFiles += $file.Name
                continue
            }
        }
        
        Write-Host "Moving: $($file.Name) -> $destination" -ForegroundColor Cyan
        
        if (-not $DryRun) {
            Move-Item -Path $file.FullName -Destination $destPath -Force
        }
        
        $movedCount++
    }
    
    Write-Host "`nMoved: $movedCount files" -ForegroundColor Green
    
    if ($skippedFiles.Count -gt 0) {
        Write-Host "Skipped: $($skippedFiles.Count) files (use -Force to overwrite)" -ForegroundColor DarkYellow
    }
}

function New-CategoryReadmes {
    Write-Host "`n=== Creating README.md files ===" -ForegroundColor Cyan
    
    $readmes = @{
        "Documentation/README.md" = @"
# Documentation

Project documentation including guides, references, and architecture specifications.

## Structure

- **Guides/** - User guides, quick starts, setup instructions
- **API/** - API documentation and integration guides
- **Architecture/** - System architecture, data flow diagrams
- **References/** - Quick references, indexes, documentation indexes

## Navigation

- For quick start: See `Guides/`
- For architecture: See `Architecture/WORKFLOW_ARCHITECTURE_REFERENCE.md`
- For testing: See `../Testing/`
- For development history: See `../Development_History/`
"@
        "Development_History/README.md" = @"
# Development History

Historical records of project development, organized chronologically.

## Structure

- **Phases/** - Phase completion reports (Phase 1-7, Waves 1-3)
- **Sessions/** - Session summaries, status reports, completion notes
- **Milestones/** - Major milestone achievements and deployment reports
- **Changelogs/** - Version histories and change logs

## Timeline

Development organized by phases:
- **Phase 1**: LLM Foundation (Complete)
- **Phase 2**: Story Generation (Complete)
- **Phase 3**: ComfyUI Integration (Complete)
- **Phase 4**: Production Hardening (Complete)

## Latest Status

See `../START_HERE.md` for current project status.
"@
        "Agents/README.md" = @"
# Agent Documentation

Documentation for AI coding agents working on this project.

## Structure

- **Handoffs/** - Agent handoff documents and session transitions
- **Instructions/** - Agent-specific instructions and guidelines

## Quick Links

- **Current Instructions**: `../.github/copilot-instructions.md`
- **Latest Status**: `../START_HERE.md`
- **Latest Correction**: `../AGENT_HANDOFF_CORRECTION_20251120.md`

## Agent Onboarding

1. Read `../START_HERE.md` (5 minutes)
2. Read `../README.md` (10 minutes)
3. Read `.github/copilot-instructions.md` (15 minutes)
4. Review `../AGENT_HANDOFF_CORRECTION_20251120.md` for latest context
"@
        "Testing/README.md" = @"
# Testing Documentation

Comprehensive testing documentation including E2E tests, unit tests, and validation reports.

## Structure

- **E2E/** - End-to-end test reports and execution summaries
- **Unit/** - Unit test documentation
- **Reports/** - Validation and verification reports
- **Strategies/** - Testing strategies and coverage plans

## Running Tests

\`\`\`powershell
# Unit tests
npm test

# E2E tests (Playwright)
npx playwright test

# E2E pipeline test
pwsh scripts/run-comfyui-e2e.ps1 -FastIteration
\`\`\`

## Test Coverage

- Playwright: ~44/50 tests passing (88%)
- Unit tests: Full coverage
- E2E pipeline: 3/3 scenes validated
"@
        "Workflows/README.md" = @"
# Workflow Documentation

ComfyUI workflow documentation and integration guides.

## Structure

- **ComfyUI/** - ComfyUI-specific documentation
- **Guides/** - Workflow setup and troubleshooting guides

## Active Workflows

- **WAN T2I**: `workflows/image_netayume_lumina_t2i.json` (keyframe generation)
- **WAN I2V**: `workflows/video_wan2_2_5B_ti2v.json` (video generation)

## Quick Reference

See `ComfyUI/COMFYUI_WORKFLOW_INDEX.md` for complete workflow documentation.
"@
    }
    
    foreach ($path in $readmes.Keys) {
        $fullPath = Join-Path $rootDir $path
        
        if (-not $DryRun) {
            Set-Content -Path $fullPath -Value $readmes[$path] -Force
        }
        
        Write-Host "Created: $path" -ForegroundColor Green
    }
}

function Show-Summary {
    Write-Host "`n=== Organization Complete ===" -ForegroundColor Green
    
    if ($DryRun) {
        Write-Host "DRY RUN - No files were actually moved" -ForegroundColor Yellow
        Write-Host "Run without -DryRun to apply changes" -ForegroundColor Yellow
    }
    
    Write-Host "`nNew Structure:" -ForegroundColor Cyan
    Write-Host "  Documentation/" -ForegroundColor White
    Write-Host "    ├─ Guides/" -ForegroundColor DarkGray
    Write-Host "    ├─ API/" -ForegroundColor DarkGray
    Write-Host "    ├─ Architecture/" -ForegroundColor DarkGray
    Write-Host "    └─ References/" -ForegroundColor DarkGray
    Write-Host "  Development_History/" -ForegroundColor White
    Write-Host "    ├─ Phases/" -ForegroundColor DarkGray
    Write-Host "    ├─ Sessions/" -ForegroundColor DarkGray
    Write-Host "    ├─ Milestones/" -ForegroundColor DarkGray
    Write-Host "    └─ Changelogs/" -ForegroundColor DarkGray
    Write-Host "  Agents/" -ForegroundColor White
    Write-Host "    ├─ Handoffs/" -ForegroundColor DarkGray
    Write-Host "    └─ Instructions/" -ForegroundColor DarkGray
    Write-Host "  Testing/" -ForegroundColor White
    Write-Host "    ├─ E2E/" -ForegroundColor DarkGray
    Write-Host "    ├─ Unit/" -ForegroundColor DarkGray
    Write-Host "    ├─ Reports/" -ForegroundColor DarkGray
    Write-Host "    └─ Strategies/" -ForegroundColor DarkGray
    Write-Host "  Workflows/" -ForegroundColor White
    Write-Host "    ├─ ComfyUI/" -ForegroundColor DarkGray
    Write-Host "    └─ Guides/" -ForegroundColor DarkGray
    
    Write-Host "`nFiles kept in root:" -ForegroundColor Cyan
    Write-Host "  - README.md"
    Write-Host "  - START_HERE.md"
    Write-Host "  - TODO.md"
    Write-Host "  - AGENT_HANDOFF_CORRECTION_20251120.md"
}

# Main execution
Write-Host "gemDirect1 Documentation Organization Script" -ForegroundColor Magenta
Write-Host "============================================" -ForegroundColor Magenta

if ($DryRun) {
    Write-Host "`nDRY RUN MODE - No changes will be made" -ForegroundColor Yellow
}

New-DirectoryStructure
Move-DocumentationFiles
New-CategoryReadmes
Show-Summary

Write-Host "`nNext steps:" -ForegroundColor Yellow
Write-Host "1. Review organized structure"
Write-Host "2. Update copilot-instructions.md with new paths"
Write-Host "3. Remove duplicate files"
Write-Host "4. Merge related content where logical"
