param(
  [Parameter(Mandatory=$true)][string]$RunDir,
  [string]$VideoSubDir = 'video'
)

$metaPath = Join-Path $RunDir 'artifact-metadata.json'
if (-not (Test-Path $metaPath)) {
  Write-Warning "artifact-metadata.json not found at $metaPath; skipping metadata update"
  exit 0
}

try {
  $meta = Get-Content $metaPath -Raw | ConvertFrom-Json
} catch {
  Write-Error "Failed to parse artifact-metadata.json: $_"
  exit 2
}

function Get-FfprobePath {
  $candidates = @('ffprobe', 'ffprobe.exe')
  foreach ($c in $candidates) {
    $found = (Get-Command $c -ErrorAction SilentlyContinue)
    if ($found) { return $found.Source }
  }
  return $null
}

function Get-VideoDurationSeconds([string]$file) {
  $ffprobe = Get-FfprobePath
  if (-not $ffprobe) { return $null }
  try {
    $args = @('-v','error','-show_entries','format=duration','-of','default=noprint_wrappers=1:nokey=1',"$file")
    $p = Start-Process -FilePath $ffprobe -ArgumentList $args -NoNewWindow -RedirectStandardOutput -PassThru -Wait
    $out = $p.StandardOutput.ReadToEnd().Trim()
    if ($out) {
      $d = [double]::Parse($out, [System.Globalization.CultureInfo]::InvariantCulture)
      return [math]::Round($d, 3)
    }
  } catch {}
  return $null
}

$sceneDirs = @()
$sceneDirs += Get-ChildItem -Directory -Path $RunDir -Filter 'scene_*' -ErrorAction SilentlyContinue
$sceneDirs += Get-ChildItem -Directory -Path $RunDir -Filter 'scene-*' -ErrorAction SilentlyContinue
$sceneDirs = $sceneDirs | Sort-Object FullName -Unique

# Scenes is an array of scene objects, not a hashtable
# We need to find each scene by SceneId and add the Video property
foreach ($scene in $sceneDirs) {
  $sceneId = $scene.Name
  # Prefer new convention: RunDir/video/<sceneId>/*.mp4
  $preferredDir = Join-Path (Join-Path $RunDir $VideoSubDir) $sceneId
  $searchDir = (Test-Path $preferredDir) ? $preferredDir : $scene.FullName
  $video = Get-ChildItem -Path $searchDir -Recurse -Include *.mp4 -ErrorAction SilentlyContinue | Sort-Object LastWriteTime -Descending | Select-Object -First 1

  $now = (Get-Date).ToString('o')
  $status = 'missing'
  $errorMsg = 'MP4 missing'
  $videoPathNormalized = $null
  $durationSeconds = $null

  if ($video) {
    $status = 'complete'
    $errorMsg = $null
    $durationSeconds = Get-VideoDurationSeconds -file $video.FullName
    $videoPathNormalized = $video.FullName -replace '\\', '/'
  }

  # Find the scene in the array by SceneId and update it
  if ($meta.Scenes -and $meta.Scenes -is [array]) {
    foreach ($sceneObj in $meta.Scenes) {
      if ($sceneObj.SceneId -eq $sceneId) {
        # Add or update the Video property
        if ($sceneObj.PSObject.Properties.Name -contains 'Video') {
          # Update existing
          $sceneObj.Video = [ordered]@{
            Path = $videoPathNormalized
            DurationSeconds = $durationSeconds
            Status = $status
            UpdatedAt = $now
            Error = $errorMsg
          }
        } else {
          # Add new property
          $sceneObj | Add-Member -NotePropertyName 'Video' -NotePropertyValue ([ordered]@{
            Path = $videoPathNormalized
            DurationSeconds = $durationSeconds
            Status = $status
            UpdatedAt = $now
            Error = $errorMsg
          })
        }
        break
      }
    }
  }
}

$meta | ConvertTo-Json -Depth 6 | Set-Content -Path $metaPath -Encoding UTF8
Write-Host "Updated scene video metadata in $metaPath"
