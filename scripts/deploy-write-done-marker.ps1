<#
.SYNOPSIS
Copies the in-repo `comfyui_nodes/write_done_marker.py` helper into a target ComfyUI `custom_nodes/` folder.

USAGE
  # Copy to the default ComfyUI installation used by this project
  pwsh -NoLogo -ExecutionPolicy Bypass -File .\scripts\deploy-write-done-marker.ps1

  # Copy to a custom installation path
  pwsh -NoLogo -ExecutionPolicy Bypass -File .\scripts\deploy-write-done-marker.ps1 -ComfyUIPath 'C:\ComfyUI\ComfyUI_windows_portable\ComfyUI'

NOTES
- This script only copies the file. It does not stop or restart ComfyUI.
- If ComfyUI is already running it may or may not hot-reload custom nodes; if not, restart the ComfyUI process using your normal workflow (do NOT use Stop-Process in automation scripts).
#>

[CmdletBinding()]
param(
    [Parameter(Position=0)]
    [string]
    $ComfyUIPath = 'C:\ComfyUI\ComfyUI_windows_portable\ComfyUI',

    [Parameter(Position=1)]
    [string]
    $SourcePath = (Join-Path (Split-Path -Parent $PSScriptRoot) 'comfyui_nodes\write_done_marker.py'),

    [switch]
    $Force
)

try {
    Write-Host "[DeployWriteDoneMarker] Repo source: $SourcePath"
    if (-not (Test-Path -Path $SourcePath)) {
        Write-Error "Source file not found: $SourcePath"
        exit 2
    }

    $destCustomNodes = Join-Path $ComfyUIPath 'custom_nodes'
    if (-not (Test-Path -Path $ComfyUIPath)) {
        Write-Warning "Target ComfyUI path does not exist: $ComfyUIPath"
        Write-Host "Please ensure ComfyUI is installed at that location or pass -ComfyUIPath with the correct location."
        exit 3
    }

    if (-not (Test-Path -Path $destCustomNodes)) {
        Write-Host "Creating custom_nodes folder: $destCustomNodes"
        New-Item -Path $destCustomNodes -ItemType Directory -Force | Out-Null
    }

    $destFile = Join-Path $destCustomNodes (Split-Path -Leaf $SourcePath)

    if ((Test-Path -Path $destFile) -and (-not $Force)) {
        $timestamp = Get-Date -Format 'yyyyMMddHHmmss'
        $backup = "$destFile.$timestamp.bak"
        Write-Host "Backing up existing file to: $backup"
        Copy-Item -Path $destFile -Destination $backup -Force
    }

    Copy-Item -Path $SourcePath -Destination $destFile -Force
    Write-Host "[DeployWriteDoneMarker] Deployed: $destFile"

    # Check whether ComfyUI appears to be reachable (optional) and print guidance
    $systemStatsUrl = 'http://127.0.0.1:8188/system_stats'
    try {
        $resp = Invoke-WebRequest -Uri $systemStatsUrl -UseBasicParsing -TimeoutSec 3 -ErrorAction Stop
        if ($resp.StatusCode -eq 200) {
            Write-Host "ComfyUI appears reachable at $systemStatsUrl. Note: You may need to restart ComfyUI for the new custom node to be recognized."
        }
    } catch {
        Write-Host "ComfyUI not reachable at $systemStatsUrl (this is informational). If ComfyUI is on a remote worker host, copy the file there and restart the service."
    }

    Write-Host "Done. If the workflow doesn't pick up the new node automatically, restart ComfyUI using your normal process (Start-ComfyUI Server VS Code task or run the start script)."
    exit 0

} catch {
    Write-Error "Deployment failed: $_"
    exit 1
}
