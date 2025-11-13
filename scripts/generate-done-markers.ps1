param(
    [string[]] $OutputDirs = @(
        'C:\ComfyUI\ComfyUI_windows_portable\ComfyUI\outputs',
        'C:\ComfyUI\ComfyUI_windows_portable\ComfyUI\output',
        'C:\ComfyUI\ComfyUI_windows_portable\outputs',
        'C:\ComfyUI\outputs'
    ),
    [double] $ScanIntervalSeconds = 2,
    [int] $StableSeconds = 3,
    [int] $MinFrames = 1,
    [switch] $RunOnce,
    [switch] $Verbose
    ,[string] $ComfyUrl = 'http://127.0.0.1:8188'
)

function Write-SentinelLog {
    param([string] $Message)
    if ($Verbose) {
        Write-Host "[DoneSentinel] $Message"
    }
}

# Map key: "<dir>|<prefix>" -> @{ Count=int; Latest=datetime; StableSince=datetime/null }
$prefixState = @{}

# Helper to touch/create a marker atomically
function Create-DoneMarker {
    param(
        [string] $Dir,
        [string] $Prefix,
        [int] $FrameCount,
        [datetime] $Latest
    )
    try {
        $markerPath = Join-Path $Dir ("$Prefix.done")
        $tmpPath = "$markerPath.tmp"
        if (-not (Test-Path $markerPath)) {
            # Write to a temporary file first, then atomically rename. This avoids
            # consumers observing a partially-written JSON file while the producer
            # is still writing. Use Move-Item to perform the rename which on
            # Windows performs a rename operation that is effectively atomic for
            # typical filesystem semantics. See notes in docs/ for references.
            $payload = @{ Timestamp = (Get-Date).ToString('o'); FrameCount = $FrameCount; Latest = $Latest.ToString('o') }
            try {
                $payload | ConvertTo-Json -Depth 3 | Set-Content -Path $tmpPath -Encoding utf8 -Force
                # Attempt to replace the marker atomically by moving the temp file
                # into place. If Move-Item fails because the destination exists,
                # prefer the existing marker and remove the tmp file.
                Move-Item -Path $tmpPath -Destination $markerPath -Force -ErrorAction Stop
                Write-SentinelLog ("Created done marker (atomic): $markerPath (frames=$FrameCount)")
            } catch {
                # If the move failed but the final marker exists, assume another
                # process created it concurrently. Clean up tmp and continue.
                if (Test-Path $markerPath) {
                    Write-SentinelLog ("Marker already exists after tmp write: $markerPath")
                    try { Remove-Item -Path $tmpPath -Force -ErrorAction SilentlyContinue } catch { }
                } else {
                    # Best-effort fallback: try writing directly to the marker path
                    try {
                        $payload | ConvertTo-Json -Depth 3 | Set-Content -Path $markerPath -Encoding utf8 -Force
                        Write-SentinelLog ("Created done marker (fallback): $markerPath (frames=$FrameCount)")
                    } catch {
                        Write-SentinelLog ("Failed to create marker for {0}\\{1}: {2}" -f $Dir, $Prefix, $_.Exception.Message)
                    }
                }
            }
        } else {
            Write-SentinelLog ("Marker already exists: $markerPath")
        }
    } catch {
        Write-SentinelLog ("Failed to create marker for {0}\\{1}: {2}" -f $Dir, $Prefix, $_.Exception.Message)
    }
}

# Single scan iteration implementation so we can run once or loop
function Run-ScanIteration {
    foreach ($dir in $OutputDirs) {
        if (-not (Test-Path $dir)) { continue }
        try {
            $files = @(Get-ChildItem -Path $dir -Filter '*.png' -File -ErrorAction SilentlyContinue)
        } catch {
            $files = @()
        }
        if ($files.Count -eq 0) { continue }

        # Group by prefix: everything before the last underscore-digit sequence, e.g. prefix_00001.png -> prefix
        $groups = @{}
        foreach ($f in $files) {
            # Match common ComfyUI output naming variants. Examples observed:
            #  - prefix_00001.png
            #  - prefix_00001_.png  (extra underscore before extension)
            #  - prefix-00001_.png  (hyphen separator)
            # We capture everything before the trailing numeric sequence as the prefix.
            $m = [regex]::Match($f.Name, '^(.*?)(?:[_-](\d+))(?:_)*\\.png$')
            if ($m.Success) {
                $prefix = $m.Groups[1].Value
            } else {
                # fallback: take name without extension (best-effort)
                $prefix = [IO.Path]::GetFileNameWithoutExtension($f.Name)
            }
            if (-not $groups.ContainsKey($prefix)) { $groups[$prefix] = @() }
            $groups[$prefix] += $f
        }

        foreach ($prefix in $groups.Keys) {
            $matching = $groups[$prefix] | Sort-Object LastWriteTime
            $count = $matching.Count
            $latest = if ($count -gt 0) { ($matching | Select-Object -Last 1).LastWriteTime } else { [datetime]::MinValue }
            $key = "${dir}|${prefix}"
            if (-not $prefixState.ContainsKey($key)) {
                $prefixState[$key] = @{ Count = $count; Latest = $latest; StableSince = $null }
            }

            $entry = $prefixState[$key]
            if ($entry.Count -eq $count -and $entry.Latest -eq $latest) {
                if (-not $entry.StableSince) { $entry.StableSince = Get-Date }
            } else {
                $entry.Count = $count
                $entry.Latest = $latest
                $entry.StableSince = $null
            }

            # If sequence appears stable for the configured duration and meets min frames,
            # create (atomically) a done marker file so consumers can detect completion.
            if ($entry.Count -ge $MinFrames -and $entry.StableSince) {
                $stableElapsed = (New-TimeSpan -Start $entry.StableSince -End (Get-Date)).TotalSeconds
                if ($stableElapsed -ge $StableSeconds) {
                    $markerFile = Join-Path $dir ("$prefix.done")
                    if (-not (Test-Path $markerFile)) {
                        Create-DoneMarker -Dir $dir -Prefix $prefix -FrameCount $entry.Count -Latest $entry.Latest
                    }
                }
            }
        }
    }
}

# Helper: inspect ComfyUI history to proactively create done markers when
# ComfyUI reports execution_success and lists output image filenames. This
# provides a near-producer-side marker without modifying ComfyUI itself.
function Inspect-ComfyHistoryAndCreateMarkers {
    param(
        [string] $BaseUrl,
        [string[]] $OutputDirs
    )
    if ([string]::IsNullOrWhiteSpace($BaseUrl)) { return }
    try {
        $hist = Invoke-RestMethod -Uri "$BaseUrl/history" -UseBasicParsing -TimeoutSec 5 -ErrorAction Stop
    } catch {
        return
    }

    foreach ($k in $hist.PSObject.Properties.Name) {
        $entry = $hist.$k
        if (-not $entry) { continue }
        # Only consider successful executions
        $status = $entry.status
        if (-not $status) { continue }
        if ($status.completed -ne $true -and ($status.status_str -ne 'success')) { continue }

        if ($entry.outputs) {
            foreach ($nodeKey in $entry.outputs.PSObject.Properties.Name) {
                $nodeOut = $entry.outputs.$nodeKey
                if ($nodeOut.images) {
                    # Group by prefix names and synthesize markers
                    $images = $nodeOut.images
                    $groups = @{}
                    foreach ($img in $images) {
                        $fname = $img.filename
                        if (-not $fname) { continue }
                        $m = [regex]::Match($fname, '^(.*?)(?:[_-](\d+))(?:_)*\\.png$')
                        if ($m.Success) { $prefix = $m.Groups[1].Value } else { $prefix = [IO.Path]::GetFileNameWithoutExtension($fname) }
                        if (-not $groups.ContainsKey($prefix)) { $groups[$prefix] = @() }
                        $groups[$prefix] += $fname
                    }

                    foreach ($prefix in $groups.Keys) {
                        $files = $groups[$prefix]
                        # Find the real directory where these files live
                        foreach ($dir in $OutputDirs) {
                            foreach ($f in $files) {
                                $candidatePath = Join-Path $dir $f
                                if (Test-Path $candidatePath) {
                                    # Determine latest write-time among the matched files
                                    $matchingFiles = @()
                                    foreach ($ff in $files) {
                                        $p = Join-Path $dir $ff
                                        if (Test-Path $p) { $matchingFiles += Get-Item -Path $p }
                                    }
                                    if ($matchingFiles.Count -gt 0) {
                                        $count = $matchingFiles.Count
                                        $latest = ($matchingFiles | Sort-Object LastWriteTime | Select-Object -Last 1).LastWriteTime
                                        Create-DoneMarker -Dir $dir -Prefix $prefix -FrameCount $count -Latest $latest
                                    }
                                    break
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}

# Main loop
if ($RunOnce) {
    Run-ScanIteration
    exit 0
}

while ($true) {
    try {
        Run-ScanIteration
        # Also inspect ComfyUI history to create markers promptly when ComfyUI
        # signals execution success; this short-circuits the consumer wait.
        Inspect-ComfyHistoryAndCreateMarkers -BaseUrl $ComfyUrl -OutputDirs $OutputDirs
    } catch {
        Write-SentinelLog ("Scan error: $($_.Exception.Message)")
    }
    # Support fractional scan intervals (milliseconds) for fast-development mode
    $ms = [math]::Round($ScanIntervalSeconds * 1000)
    if ($ms -lt 1) { $ms = 1 }
    Start-Sleep -Milliseconds $ms
}
