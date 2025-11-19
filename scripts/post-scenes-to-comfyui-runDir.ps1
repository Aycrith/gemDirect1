param(
  [Parameter(Mandatory=$true)][string]$RunDir,
  [string]$ComfyUrl = $env:LOCAL_COMFY_URL,
  [int]$MaxWaitSeconds = 120
)
if (-not $ComfyUrl) { $ComfyUrl = 'http://127.0.0.1:8188' }
$projectRoot = Split-Path -Parent $PSScriptRoot
$localSettingsPath = Join-Path $projectRoot 'localGenSettings.json'
if (-not (Test-Path $localSettingsPath)) { Write-Error "localGenSettings.json not found at $localSettingsPath"; exit 2 }
$settings = Get-Content -Path $localSettingsPath -Raw | ConvertFrom-Json
$baseWorkflow = $settings.workflowProfiles.'wan-i2v'.workflowJson | ConvertFrom-Json

# Find candidate keyframes: prefer story/keyframes, else scene folder images
$storyKeyframesDir = Join-Path $RunDir 'story\keyframes'
$sceneDirs = @()
$sceneDirs += Get-ChildItem -Directory -Path $RunDir -Filter 'scene_*' -ErrorAction SilentlyContinue
$sceneDirs += Get-ChildItem -Directory -Path $RunDir -Filter 'scene-*' -ErrorAction SilentlyContinue
$sceneDirs = $sceneDirs | Sort-Object FullName -Unique
if (-not $sceneDirs) { Write-Warning "No scene_* directories found under $RunDir"; exit 0 }

foreach ($scene in $sceneDirs) {
  $sceneId = $scene.Name
  # locate a sensible keyframe
  $keyframe = $null
  if (Test-Path $storyKeyframesDir) {
    $kf = Get-ChildItem -Path $storyKeyframesDir -Filter "$sceneId*.png" -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($kf) { $keyframe = $kf }
  }
  if (-not $keyframe) {
    $kf = Get-ChildItem -Path $scene.FullName -Recurse -Include *.png,*.jpg -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($kf) { $keyframe = $kf }
  }
  if (-not $keyframe) { Write-Warning "[$sceneId] No keyframe image found; skipping"; continue }

  Write-Host "[$sceneId] Uploading keyframe: $($keyframe.FullName)"
  try {
    $form = @{ overwrite = 'true'; image = Get-Item -Path $keyframe.FullName }
    $uploadResp = Invoke-RestMethod -Uri "$ComfyUrl/upload/image" -Method Post -Form $form -ErrorAction Stop
    $uploadedFilename = $uploadResp.name
    Write-Host "[$sceneId] Uploaded keyframe as $uploadedFilename"
  } catch {
    Write-Warning "[$sceneId] Upload failed: $_"; continue
  }

  # clone workflow and inject keyframe + savevideo prefix
  $workflow = $baseWorkflow | ConvertTo-Json -Depth 50 | ConvertFrom-Json
  foreach ($prop in $workflow.PSObject.Properties) {
    $node = $prop.Value
    if ($node.class_type -eq 'LoadImage' -and $node.inputs -and $node.inputs.image) {
      $node.inputs.image = $uploadedFilename
      break
    }
  }
  $sceneVideoDir = Join-Path $RunDir (Join-Path 'video' $sceneId)
  if (-not (Test-Path $sceneVideoDir)) { New-Item -ItemType Directory -Path $sceneVideoDir -Force | Out-Null }
  $absPrefix = Join-Path $sceneVideoDir $sceneId
  $saveVideoNode = $null
  foreach ($prop in $workflow.PSObject.Properties) {
    $node = $prop.Value
    if ($node.class_type -eq 'SaveVideo') { $saveVideoNode = $node; break }
  }
  if ($saveVideoNode) {
    if (-not $saveVideoNode.inputs.format) { $saveVideoNode.inputs.format = 'mp4' }
    if (-not $saveVideoNode.inputs.codec) { $saveVideoNode.inputs.codec = 'libx264' }
    $saveVideoNode.inputs.filename_prefix = $absPrefix
    Write-Host "[$sceneId] SaveVideo configured prefix=$absPrefix format=$($saveVideoNode.inputs.format) codec=$($saveVideoNode.inputs.codec)"
  } else {
    Write-Warning "[$sceneId] No SaveVideo node found in workflow; falling back to local assembly"
  }

  $json = @{ prompt = $workflow } | ConvertTo-Json -Depth 50
  try {
    $resp = Invoke-RestMethod -Uri "$ComfyUrl/prompt" -Method Post -ContentType 'application/json' -Body $json -ErrorAction Stop
    Write-Host "[$sceneId] Prompt queued (id=$($resp.prompt_id))"
  } catch {
    Write-Warning "[$sceneId] Failed to queue prompt: $_"
    continue
  }

  # Optionally poll for mp4 (short wait)
  $targetMp4 = "$absPrefix.mp4"
  $elapsed = 0; $interval = 5
  while ($elapsed -lt $MaxWaitSeconds) {
    if (Test-Path $targetMp4) { Write-Host "[$sceneId] MP4 created: $targetMp4"; break }
    Start-Sleep -Seconds $interval; $elapsed += $interval
  }
  if (-not (Test-Path $targetMp4)) { Write-Warning "[$sceneId] No MP4 detected after $MaxWaitSeconds seconds; it may be created later by ComfyUI." }
}
