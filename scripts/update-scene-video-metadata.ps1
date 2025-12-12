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

function Get-VideoFps([string]$file) {
  $ffprobe = Get-FfprobePath
  if (-not $ffprobe) { return $null }
  try {
    $args = @('-v','error','-select_streams','v:0','-show_entries','stream=r_frame_rate','-of','default=noprint_wrappers=1:nokey=1',"$file")
    $p = Start-Process -FilePath $ffprobe -ArgumentList $args -NoNewWindow -RedirectStandardOutput -PassThru -Wait
    $out = $p.StandardOutput.ReadToEnd().Trim()
    if ($out) {
      if ($out -match '^(\d+)(?:/(\d+))?$') {
        $num = [double]$Matches[1]
        $den = if ($Matches[2]) { [double]$Matches[2] } else { 1.0 }
        if ($den -gt 0) {
          $fps = $num / $den
          return [math]::Round($fps)
        }
      }
      $parsed = [double]::Parse($out, [System.Globalization.CultureInfo]::InvariantCulture)
      return [math]::Round($parsed)
    }
  } catch {}
  return $null
}

function Get-VideoResolution([string]$file) {
  $ffprobe = Get-FfprobePath
  if (-not $ffprobe) { return $null }
  try {
    $args = @('-v','error','-select_streams','v:0','-show_entries','stream=width,height','-of','csv=s=x:p=0',"$file")
    $p = Start-Process -FilePath $ffprobe -ArgumentList $args -NoNewWindow -RedirectStandardOutput -PassThru -Wait
    $out = $p.StandardOutput.ReadToEnd().Trim()
    if ($out -match '^\d+x\d+$') {
      return $out
    }
  } catch {}
  return $null
}

$sceneDirs = @()
$sceneDirs += Get-ChildItem -Directory -Path $RunDir -Filter 'scene_*' -ErrorAction SilentlyContinue
$sceneDirs += Get-ChildItem -Directory -Path $RunDir -Filter 'scene-*' -ErrorAction SilentlyContinue
$sceneDirs = $sceneDirs | Sort-Object FullName -Unique

# Prefer using the metadata's declared scenes; fall back to scene directories if metadata is sparse.
$sceneIds = @()
if ($meta.Scenes -and $meta.Scenes -is [array]) {
  $sceneIds = @(
    $meta.Scenes |
      ForEach-Object { $_.SceneId } |
      Where-Object { -not [string]::IsNullOrWhiteSpace($_) } |
      Sort-Object -Unique
  )
}
if (-not $sceneIds -or $sceneIds.Count -eq 0) {
  $sceneIds = @($sceneDirs | ForEach-Object { $_.Name } | Sort-Object -Unique)
}

foreach ($sceneId in $sceneIds) {
  $sceneDir = $sceneDirs | Where-Object { $_.Name -eq $sceneId } | Select-Object -First 1

  # Prefer new convention: RunDir/video/<sceneId>/*.mp4
  $preferredDir = Join-Path (Join-Path $RunDir $VideoSubDir) $sceneId
  $fallbackDir = Join-Path $RunDir $VideoSubDir
  $searchDir = if (Test-Path $preferredDir) { $preferredDir } elseif ($sceneDir) { $sceneDir.FullName } else { $fallbackDir }
  $video = Get-ChildItem -Path $searchDir -Recurse -Include *.mp4 -ErrorAction SilentlyContinue | Sort-Object LastWriteTime -Descending | Select-Object -First 1

  $now = (Get-Date).ToString('o')
  $status = 'missing'
  $errorMsg = 'MP4 missing'
  $videoPathNormalized = $null
  $durationSeconds = $null
  $finalFps = $null
  $finalResolution = $null

  if ($video) {
    $status = 'complete'
    $errorMsg = $null
    $durationSeconds = Get-VideoDurationSeconds -file $video.FullName
    $finalFps = Get-VideoFps -file $video.FullName
    $finalResolution = Get-VideoResolution -file $video.FullName
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

        # Patch FinalFPS/FinalResolution into Telemetry when available.
        if ($video -and $sceneObj.PSObject.Properties.Name -contains 'Telemetry') {
          $telemetry = $sceneObj.Telemetry
          if (-not $telemetry) {
            $telemetry = [ordered]@{}
          }
          if ($finalFps -ne $null -and ($telemetry.PSObject.Properties.Name -notcontains 'FinalFPS' -or $telemetry.FinalFPS -eq $null)) {
            $telemetry | Add-Member -NotePropertyName 'FinalFPS' -NotePropertyValue $finalFps -Force
          }
          if ($finalResolution -and ($telemetry.PSObject.Properties.Name -notcontains 'FinalResolution' -or [string]::IsNullOrWhiteSpace($telemetry.FinalResolution))) {
            $telemetry | Add-Member -NotePropertyName 'FinalResolution' -NotePropertyValue $finalResolution -Force
          }
          $sceneObj.Telemetry = $telemetry
        }

        break
      }
    }
  }
}

$meta | ConvertTo-Json -Depth 6 | Set-Content -Path $metaPath -Encoding UTF8
Write-Host "Updated scene video metadata in $metaPath"
