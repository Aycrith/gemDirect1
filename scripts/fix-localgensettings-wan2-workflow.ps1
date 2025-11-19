# Fix localGenSettings.json WAN2 workflow - Replace 14B model references with 5B model
# This script updates the wan-i2v workflow profile to use the correct 5B model

$ErrorActionPreference = 'Stop'

$localGenSettingsPath = Join-Path $PSScriptRoot '..\localGenSettings.json'
$correctWorkflowPath = Join-Path $PSScriptRoot '..\workflows\video_wan2_2_5B_ti2v.json'

Write-Host "=== FIX LOCALGENSETTINGS WAN2 WORKFLOW ==="
Write-Host "Reading localGenSettings: $localGenSettingsPath"
Write-Host "Reading correct workflow: $correctWorkflowPath"

# Read files
$settings = Get-Content $localGenSettingsPath -Raw | ConvertFrom-Json
$correctWorkflow = Get-Content $correctWorkflowPath -Raw | ConvertFrom-Json

# Convert the correct workflow to escaped JSON string
$correctWorkflowString = ($correctWorkflow | ConvertTo-Json -Depth 20 -Compress)

Write-Host ""
Write-Host "Updating wan-i2v workflowProfiles..."

# Update the wan-i2v profile
if ($settings.workflowProfiles.'wan-i2v') {
  # Replace the workflowJson with the correct 5B version
  $settings.workflowProfiles.'wan-i2v'.workflowJson = $correctWorkflowString
  
  # Update the mapping to match the new workflow node IDs
  $settings.workflowProfiles.'wan-i2v'.mapping = @{
    '6:text' = 'human_readable_prompt'
    '7:text' = 'negative_prompt'
    '56:image' = 'keyframe_image'
  }
  
  # Update metadata
  $settings.workflowProfiles.'wan-i2v'.metadata.lastSyncedAt = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
  $settings.workflowProfiles.'wan-i2v'.metadata.highlightMappings = @(
    @{
      type = 'human_readable_prompt'
      nodeId = '6'
      inputName = 'text'
      nodeTitle = 'CLIP Text Encode (Positive Prompt)'
    },
    @{
      type = 'keyframe_image'
      nodeId = '56'
      inputName = 'image'
      nodeTitle = 'Load Image'
    }
  )
  $settings.workflowProfiles.'wan-i2v'.metadata.warnings = @()
  
  Write-Host "✓ Updated wan-i2v workflow profile with 5B model"
} else {
  Write-Error "wan-i2v profile not found in localGenSettings!"
}

# Also update the top-level workflowJson (legacy)
$settings.workflowJson = $correctWorkflowString
Write-Host "✓ Updated top-level workflowJson"

# Save the updated settings
$outputJson = $settings | ConvertTo-Json -Depth 20
Set-Content -Path $localGenSettingsPath -Value $outputJson -Encoding UTF8

Write-Host ""
Write-Host "=== FIX COMPLETE ==="
Write-Host "localGenSettings.json updated with correct 5B WAN2 workflow"
Write-Host ""
Write-Host "Key changes:"
Write-Host "  - Replaced 14B model references with wan2.2_ti2v_5B_fp16.safetensors"
Write-Host "  - Updated node mappings (56:image for keyframe_image)"
Write-Host "  - Updated metadata timestamps"
Write-Host ""
Write-Host "Next steps:"
Write-Host "  1. Run a test: pwsh scripts/generate-scene-videos-wan2.ps1 -SceneId test-001"
Write-Host "  2. Check ComfyUI history and output directory"
Write-Host "  3. If successful, run full e2e: pwsh scripts/run-comfyui-e2e.ps1 -FastIteration"
