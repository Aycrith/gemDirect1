# Add VAE Tiling to WAN2 Workflow
# This improves memory management during video generation

param(
    [string]$WorkflowPath = "workflows\video_wan2_2_5B_ti2v.json",
    [int]$TileSize = 512
)

Write-Host "=== VAE Tiling Configuration ===" -ForegroundColor Cyan
Write-Host "Workflow: $WorkflowPath"
Write-Host "Tile Size: $TileSize"
Write-Host ""

if (-not (Test-Path $WorkflowPath)) {
    Write-Host "ERROR: Workflow file not found: $WorkflowPath" -ForegroundColor Red
    exit 1
}

# Backup original
$backupPath = "$WorkflowPath.backup-$(Get-Date -Format 'yyyyMMdd-HHmmss')"
Copy-Item $WorkflowPath $backupPath
Write-Host "✓ Backup created: $backupPath" -ForegroundColor Green

# Load workflow
$workflow = Get-Content $WorkflowPath -Raw | ConvertFrom-Json

# Find VAEDecode node
$vaeNodeId = $null
$vaeNode = $null

foreach ($prop in $workflow.PSObject.Properties) {
    if ($prop.Value.class_type -eq "VAEDecode") {
        $vaeNodeId = $prop.Name
        $vaeNode = $prop.Value
        break
    }
}

if (-not $vaeNode) {
    Write-Host "WARNING: No VAEDecode node found in workflow" -ForegroundColor Yellow
    Write-Host "Checking for VAEDecodeTiled..."
    
    foreach ($prop in $workflow.PSObject.Properties) {
        if ($prop.Value.class_type -eq "VAEDecodeTiled") {
            Write-Host "✓ VAEDecodeTiled already configured" -ForegroundColor Green
            exit 0
        }
    }
    
    Write-Host "ERROR: No VAE decode node found" -ForegroundColor Red
    exit 1
}

Write-Host "Found VAEDecode node: $vaeNodeId" -ForegroundColor Cyan

# Convert to VAEDecodeTiled
$vaeNode.class_type = "VAEDecodeTiled"
$vaeNode.inputs | Add-Member -NotePropertyName "tile_size" -NotePropertyValue $TileSize -Force

# Save workflow
$workflow | ConvertTo-Json -Depth 20 | Set-Content $WorkflowPath -Encoding UTF8

Write-Host ""
Write-Host "✓ VAE tiling enabled successfully" -ForegroundColor Green
Write-Host "  Node: $vaeNodeId"
Write-Host "  Type: VAEDecodeTiled"
Write-Host "  Tile Size: $TileSize"
Write-Host ""
Write-Host "=== Next Steps ===" -ForegroundColor Cyan
Write-Host "1. Restart ComfyUI server"
Write-Host "2. Run test generation: pwsh scripts\run-comfyui-e2e.ps1 -FastIteration"
Write-Host "3. Monitor VRAM usage during generation"
Write-Host ""
Write-Host "To revert: Copy-Item $backupPath $WorkflowPath -Force"
