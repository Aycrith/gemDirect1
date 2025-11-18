param(
    [Parameter(Mandatory = $true)]
    [string] $RunDir,

    [string] $VideoSubDir = 'video',

    [int] $FrameRate = 24,

    [string] $FfmpegPath = 'ffmpeg',

    [switch] $VerboseOutput,

    [switch] $Force
)

<#
.SYNOPSIS
Assembles per-scene MP4 videos from generated PNG frames for a given run.

.DESCRIPTION
This script is designed to be called after a successful ComfyUI run where
artifact-metadata.json has been written with per-scene frame information.

For each scene in artifact-metadata.json:
  - Resolves the frames directory using SceneOutputDir + GeneratedFramesDir.
  - Scans for *.png frames in that directory.
  - Generates a concat input list for ffmpeg.
  - Invokes ffmpeg to build an MP4 under RunDir\<VideoSubDir>\scene-XXX.mp4.

It does NOT modify artifact-metadata.json; the companion script
update-scene-video-metadata.ps1 wires the "Video" blocks for the React UI.
#>

function Write-Log {
    param(
        [string] $Message
    )
    if ($VerboseOutput) {
        Write-Host "[assemble-scene-videos] $Message"
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
    Write-Log "No Scenes array found in artifact-metadata.json; nothing to assemble."
    return
}

$videoDir = Join-Path $RunDir $VideoSubDir
if (-not (Test-Path $videoDir)) {
    New-Item -ItemType Directory -Path $videoDir -Force | Out-Null
    Write-Log "Created video output directory '$videoDir'"
}

function Resolve-FramesDir {
    param(
        [object] $Scene
    )

    if (-not $Scene.GeneratedFramesDir) {
        return $null
    }

    $framesDir = [string]$Scene.GeneratedFramesDir

    # If GeneratedFramesDir is already an absolute path, use it as-is.
    if ([System.IO.Path]::IsPathRooted($framesDir)) {
        return $framesDir
    }

    # Prefer SceneOutputDir when present; fall back to RunDir.
    $baseDir = if ($Scene.SceneOutputDir) { [string]$Scene.SceneOutputDir } else { $RunDir }
    return (Join-Path $baseDir $framesDir)
}

function Build-VideoForScene {
    param(
        [string] $SceneId,
        [string] $FramesDir,
        [string] $OutputPath
    )

    Write-Log "Assembling video for scene '$SceneId' from '$FramesDir' -> '$OutputPath'"

    if (-not (Test-Path $FramesDir)) {
        Write-Log "Frames directory not found for scene '$SceneId': $FramesDir"
        return $false
    }

    $frames = Get-ChildItem -Path $FramesDir -Filter '*.png' -File -ErrorAction SilentlyContinue | Sort-Object Name
    if (-not $frames -or $frames.Count -eq 0) {
        Write-Log "No PNG frames found for scene '$SceneId' in '$FramesDir'; skipping."
        return $false
    }

    $listPath = Join-Path $FramesDir "ffmpeg-frames-$SceneId.txt"
    $lines = $frames | ForEach-Object {
        $escaped = $_.FullName.Replace("'", "''")
        "file '$escaped'"
    }
    $lines | Set-Content -Path $listPath -Encoding utf8

    $args = @(
        '-y',
        '-r', $FrameRate.ToString(),
        '-f', 'concat',
        '-safe', '0',
        '-i', $listPath,
        '-c:v', 'libx264',
        '-pix_fmt', 'yuv420p',
        $OutputPath
    )

    Write-Log "Running ffmpeg for scene '$SceneId' with $($frames.Count) frame(s)..."

    $ffmpegOutput = & $FfmpegPath @args 2>&1
    $exitCode = $LASTEXITCODE

    if ($exitCode -ne 0) {
        Write-Warning "[assemble-scene-videos] ffmpeg failed for scene '$SceneId' (exitCode=$exitCode)."
        if ($VerboseOutput) {
            $preview = $ffmpegOutput | Select-Object -First 10
            Write-Host "[assemble-scene-videos] ffmpeg output preview:"
            $preview | ForEach-Object { Write-Host "  $_" }
        }
        return $false
    }

    Write-Log "Successfully wrote video for scene '$SceneId' to '$OutputPath'"
    return $true
}

$builtCount = 0
foreach ($scene in $artifact.Scenes) {
    if (-not $scene.SceneId) {
        continue
    }

    $sceneId = [string]$scene.SceneId
    $framesDir = Resolve-FramesDir -Scene $scene
    if (-not $framesDir) {
        Write-Log "Scene '$sceneId' has no GeneratedFramesDir; skipping."
        continue
    }

    $outputPath = Join-Path $videoDir ("$sceneId.mp4")

    if ((-not $Force) -and (Test-Path $outputPath)) {
        Write-Log "Video already exists for scene '$sceneId' at '$outputPath'; skipping (use -Force to rebuild)."
        continue
    }

    $success = Build-VideoForScene -SceneId $sceneId -FramesDir $framesDir -OutputPath $outputPath
    if ($success) {
        $builtCount++
    }
}

Write-Log "Scene video assembly complete; built $builtCount video(s)."

