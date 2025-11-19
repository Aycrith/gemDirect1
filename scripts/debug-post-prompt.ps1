param(
  [string]$SceneId = 'scene-001',
  [string]$Uploaded = 'gemdirect1_scene-001_00351_.png',
  [string]$ComfyUrl = 'http://127.0.0.1:8188'
)
$projectRoot = Split-Path -Parent $PSScriptRoot
$localSettingsPath = Join-Path $projectRoot 'localGenSettings.json'
if (-not (Test-Path $localSettingsPath)) { Write-Error "localGenSettings.json not found"; exit 2 }
$settings = Get-Content -Path $localSettingsPath -Raw | ConvertFrom-Json
$workflow = $settings.workflowProfiles.'wan-i2v'.workflowJson | ConvertFrom-Json

# Inject keyframe
foreach ($prop in $workflow.PSObject.Properties) {
  $node = $prop.Value
  if ($node.class_type -eq 'LoadImage' -and $node.inputs -and $node.inputs.image) {
    $node.inputs.image = $Uploaded
    break
  }
}
# Update SaveVideo
foreach ($prop in $workflow.PSObject.Properties) {
  $node = $prop.Value
  if ($node.class_type -eq 'SaveVideo') {
    if (-not $node.inputs.format) { $node.inputs.format = 'mp4' }
    if (-not $node.inputs.codec) { $node.inputs.codec = 'libx264' }
    $sceneVideoDir = Join-Path (Join-Path $projectRoot 'logs') 'debug-video'
    if (-not (Test-Path $sceneVideoDir)) { New-Item -ItemType Directory -Path $sceneVideoDir -Force | Out-Null }
    $node.inputs.filename_prefix = Join-Path $sceneVideoDir $SceneId
    break
  }
}

$json = @{ prompt = $workflow } | ConvertTo-Json -Depth 20
Write-Host "Prepared JSON length: $($json.Length)"
try {
  $resp = Invoke-RestMethod -Uri "$ComfyUrl/prompt" -Method Post -ContentType 'application/json' -Body $json -ErrorAction Stop
  Write-Host "Response: $($resp | ConvertTo-Json -Depth 6)"
} catch {
  Write-Host "CATCH: $($_)"
  if ($_.Exception) { Write-Host "EX: $($_.Exception.ToString())" }
  if ($_.InvocationInfo) { Write-Host "InvocationInfo: $($_.InvocationInfo.Line)" }
}
