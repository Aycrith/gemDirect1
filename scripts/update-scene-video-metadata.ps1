param(
    [Parameter(Mandatory = $true)]
    [string] $RunDir,

    [string] $VideoSubDir = 'video',

    [switch] $VerboseOutput
)

<#
.SYNOPSIS
Adds or updates the per-scene `Video` block in artifact-metadata.json so the
React UI (ScenePlayer/SceneVideoManager) can surface scene-level MP4s.

.DESCRIPTION
This script is intentionally small and UI-focused. It assumes that:
  - `artifact-metadata.json` already exists in the specified RunDir.
  - One or more scene video files have been generated under RunDir\<VideoSubDir>.
  - Each video file is named in a way that can be matched to SceneId
    (e.g., `scene-001.mp4` for SceneId = `scene-001`).

For each scene in artifact-metadata.json, the script:
  - Attempts to locate a matching MP4 in RunDir\<VideoSubDir>.
  - Writes or updates the `Video` property:
        {
          "Path": "video/scene-001.mp4",
          "Status": "ready",
          "DurationSeconds": null,
          "UpdatedAt": "2025-11-14T15:32:23.123Z"
        }

The React ScenePlayer uses this metadata via SceneVideoManager to render the
per-scene video player. The actual video generation is handled elsewhere
(ComfyUI / ffmpeg); this script simply wires the metadata.
#>

function Write-Log {
    param(
        [string] $Message
    )
    if ($VerboseOutput) {
        Write-Host "[update-scene-video-metadata] $Message"
    }
}

if (-not (Test-Path $RunDir)) {
    throw "RunDir '$RunDir' does not exist."
}

$artifactPath = Join-Path $RunDir 'artifact-metadata.json'
if (-not (Test-Path $artifactPath)) {
    throw "artifact-metadata.json not found in RunDir '$RunDir'."
}

Write-Log "Loading artifact metadata from $artifactPath"

try {
    $artifact = Get-Content -Path $artifactPath -Raw | ConvertFrom-Json
} catch {
    throw "Failed to parse artifact-metadata.json: $($_.Exception.Message)"
}

if (-not $artifact.Scenes) {
    Write-Log "No Scenes array found in artifact-metadata.json; nothing to update."
    return
}

$videoDir = Join-Path $RunDir $VideoSubDir
if (-not (Test-Path $videoDir)) {
    Write-Log "Video directory '$videoDir' does not exist; no videos will be wired."
    return
}

Write-Log "Scanning video directory '$videoDir' for scene MP4s..."

$videoFiles = Get-ChildItem -Path $videoDir -Filter '*.mp4' -File -ErrorAction SilentlyContinue
if (-not $videoFiles -or $videoFiles.Count -eq 0) {
    Write-Log "No .mp4 files found under '$videoDir'."
}

# Helper: attempt to find a video file for a given scene id
function Find-SceneVideoFile {
    param(
        [string] $SceneId,
        [System.IO.FileInfo[]] $Files
    )

    if (-not $Files -or $Files.Count -eq 0) {
        return $null
    }

    # Try strict match first: scene-001.mp4
    $strict = $Files | Where-Object { $_.BaseName -eq $SceneId }
    if ($strict -and $strict.Count -gt 0) {
        return $strict[0]
    }

    # Fallback: any file whose name contains the SceneId
    $loose = $Files | Where-Object { $_.BaseName -like "*$SceneId*" }
    if ($loose -and $loose.Count -gt 0) {
        return $loose[0]
    }

    return $null
}

function Get-VideoDurationSeconds {
    param(
        [System.IO.FileInfo] $File
    )

    if (-not $File) {
        return $null
    }

    # Prefer ffprobe from the FFmpeg toolchain to get an accurate duration.
    # If ffprobe is not available or fails, fall back to $null and let the UI
    # infer or ignore duration.
    $ffprobeCmd = 'ffprobe'
    $args = @(
        '-v', 'error',
        '-select_streams', 'v:0',
        '-show_entries', 'stream=duration',
        '-of', 'default=noprint_wrappers=1:nokey=1',
        $File.FullName
    )

    try {
        $output = & $ffprobeCmd @args 2>$null
        if (-not $output) {
            return $null
        }
        $line = ($output -split "`r?`n" | Where-Object { $_ -and ($_ -match '^[0-9\.]+$') } | Select-Object -First 1)
        if (-not $line) {
            return $null
        }
        [double]$seconds = [double]::Parse($line, [System.Globalization.CultureInfo]::InvariantCulture)
        # Round to a single decimal place for display in the UI
        return [Math]::Round($seconds, 1)
    } catch {
        Write-Log ("ffprobe duration probe failed for '{0}': {1}" -f $File.FullName, $_.Exception.Message)
        return $null
    }
}

$now = Get-Date
$updatedScenes = 0

for ($i = 0; $i -lt $artifact.Scenes.Count; $i++) {
    $scene = $artifact.Scenes[$i]
    if (-not $scene.SceneId) {
        Write-Log "Scene index $i has no SceneId; skipping."
        continue
    }

    $sceneId = [string]$scene.SceneId
    $videoFile = Find-SceneVideoFile -SceneId $sceneId -Files $videoFiles
    if (-not $videoFile) {
        Write-Log "No video file found for SceneId '$sceneId'; leaving Video metadata unchanged."
        continue
    }

    $relativePath = Join-Path $VideoSubDir $videoFile.Name
    $timestampIso = $now.ToString('o')
    $durationSeconds = Get-VideoDurationSeconds -File $videoFile

    Write-Log "Wiring video for SceneId '$sceneId' -> $relativePath"

    if (-not $scene.Video) {
        $scene | Add-Member -MemberType NoteProperty -Name 'Video' -Value (New-Object PSObject) -Force
    }

    $nextVersion = 1
    if ($scene.Video.Version -is [int]) {
        $nextVersion = [int]$scene.Video.Version + 1
    }

    $scene.Video | Add-Member -MemberType NoteProperty -Name 'Path' -Value $relativePath -Force
    $scene.Video | Add-Member -MemberType NoteProperty -Name 'Status' -Value 'ready' -Force
    $scene.Video | Add-Member -MemberType NoteProperty -Name 'DurationSeconds' -Value $durationSeconds -Force
    $scene.Video | Add-Member -MemberType NoteProperty -Name 'UpdatedAt' -Value $timestampIso -Force
    $scene.Video | Add-Member -MemberType NoteProperty -Name 'Version' -Value $nextVersion -Force
    # Do not overwrite Error here; leave that to the video generation layer

    $updatedScenes++
}

if ($updatedScenes -eq 0) {
    Write-Log "No scenes were updated with Video metadata."
} else {
    Write-Log "Updated Video metadata for $updatedScenes scene(s); writing artifact-metadata.json."
    $artifact | ConvertTo-Json -Depth 10 | Set-Content -Path $artifactPath -Encoding utf8
}
