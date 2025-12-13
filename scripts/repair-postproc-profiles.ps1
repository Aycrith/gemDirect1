<#
.SYNOPSIS
  Repairs ComfyUI post-processing workflow profiles in localGenSettings.json.

.DESCRIPTION
  ComfyUI node schemas drift over time (e.g. LoadVideo now expects `file` instead of `video`,
  ImagesToVideo replaced by CreateVideo, RIFE VFI expects `frames` input).

  This script:
  - Loads `localGenSettings.json`
  - Patches known post-processing profiles to match the current ComfyUI node schema (via /object_info)
  - Optionally writes changes back (or runs as dry-run)

.PARAMETER SettingsPath
  Path to localGenSettings.json.

.PARAMETER ComfyUIUrl
  ComfyUI base URL (defaults to settings.comfyUIUrl, falling back to http://127.0.0.1:8188).

.PARAMETER Profiles
  Profile IDs to repair (default: video-upscaler, rife-interpolation).

.PARAMETER DryRun
  If set, prints intended changes but does not write SettingsPath.

.EXAMPLE
  pwsh -NoLogo -ExecutionPolicy Bypass -File scripts/repair-postproc-profiles.ps1 -DryRun

.EXAMPLE
  pwsh -NoLogo -ExecutionPolicy Bypass -File scripts/repair-postproc-profiles.ps1
#>

param(
    [string] $SettingsPath = (Join-Path (Get-Location) 'localGenSettings.json'),
    [string] $ComfyUIUrl = '',
    [string[]] $Profiles = @('video-upscaler', 'rife-interpolation'),
    [switch] $DryRun
)

$ErrorActionPreference = 'Stop'

function Write-Info([string]$msg) { Write-Host $msg -ForegroundColor Cyan }
function Write-Warn([string]$msg) { Write-Host $msg -ForegroundColor Yellow }
function Write-Ok([string]$msg) { Write-Host $msg -ForegroundColor Green }

function Ensure-Object([object]$value, [string]$name) {
    if (-not $value) { throw "$name is missing." }
}

function Get-ComfyBase([string]$url) {
    if ([string]::IsNullOrWhiteSpace($url)) { return 'http://127.0.0.1:8188' }
    return $url.TrimEnd('/')
}

function Get-ObjectInfo([string]$baseUrl, [string]$nodeName) {
    $escaped = [uri]::EscapeDataString($nodeName)
    $uri = "$baseUrl/object_info/$escaped"
    try {
        return Invoke-RestMethod -Uri $uri -TimeoutSec 5 -ErrorAction Stop
    } catch {
        return $null
    }
}

function Get-RequiredInputs([string]$baseUrl, [string]$nodeName) {
    $info = Get-ObjectInfo $baseUrl $nodeName
    if (-not $info) { return @() }
    $node = $info.$nodeName
    if (-not $node -or -not $node.input -or -not $node.input.required) { return @() }
    return @($node.input.required.PSObject.Properties.Name)
}

function Get-WorkflowNodes([object]$workflow) {
    if ($workflow -and ($workflow.PSObject.Properties.Name -contains 'nodes') -and $workflow.nodes) {
        return $workflow.nodes
    }
    return $workflow
}

function Get-NodeIdByClass([object]$nodes, [string]$classType) {
    foreach ($prop in $nodes.PSObject.Properties) {
        if ($prop.Value -and $prop.Value.class_type -eq $classType) {
            return [string]$prop.Name
        }
    }
    return $null
}

function Ensure-Inputs([object]$node) {
    if (-not ($node.PSObject.Properties.Name -contains 'inputs') -or -not $node.inputs) {
        $node | Add-Member -MemberType NoteProperty -Name inputs -Value ([pscustomobject]@{})
    }
    return $node.inputs
}

function Set-Input([object]$inputs, [string]$name, [object]$value) {
    if ($inputs.PSObject.Properties.Name -contains $name) {
        $inputs.$name = $value
    } else {
        $inputs | Add-Member -MemberType NoteProperty -Name $name -Value $value
    }
}

function Remove-Input([object]$inputs, [string]$name) {
    if ($inputs.PSObject.Properties.Name -contains $name) {
        $inputs.PSObject.Properties.Remove($name) | Out-Null
    }
}

function Get-NextNumericNodeId([object]$nodes) {
    $max = 0
    foreach ($prop in $nodes.PSObject.Properties) {
        $n = 0
        if ([int]::TryParse([string]$prop.Name, [ref]$n)) {
            if ($n -gt $max) { $max = $n }
        }
    }
    return [string]($max + 1)
}

function Patch-LoadVideoFile([object]$nodes, [string]$baseUrl, [ref]$changes) {
    $loadId = Get-NodeIdByClass $nodes 'LoadVideo'
    if (-not $loadId) { return }
    $required = Get-RequiredInputs $baseUrl 'LoadVideo'
    if (-not ($required -contains 'file')) { return }

    $node = $nodes.$loadId
    $inputs = Ensure-Inputs $node
    if (($inputs.PSObject.Properties.Name -contains 'video') -and -not ($inputs.PSObject.Properties.Name -contains 'file')) {
        Set-Input $inputs 'file' $inputs.video
        Remove-Input $inputs 'video'
        $changes.Value += "LoadVideo($loadId): video -> file"
    }
}

function Patch-MappingVideoToFile([object]$profile, [ref]$changes) {
    if (-not $profile.mapping) { return }
    $mapping = $profile.mapping
    $toAdd = @{}
    $toRemove = @()
    foreach ($p in $mapping.PSObject.Properties) {
        $key = [string]$p.Name
        if ($key -match '^\d+:video$') {
            $newKey = $key -replace ':video$', ':file'
            $toAdd[$newKey] = $p.Value
            $toRemove += $key
        }
    }
    foreach ($k in $toRemove) {
        $mapping.PSObject.Properties.Remove($k) | Out-Null
    }
    foreach ($kv in $toAdd.GetEnumerator()) {
        $mapping | Add-Member -MemberType NoteProperty -Name $kv.Key -Value $kv.Value
        $changes.Value += "mapping: $($kv.Key) (from legacy :video)"
    }
}

function Patch-ImagesToVideoToCreateVideo([object]$nodes, [string]$baseUrl, [ref]$changes) {
    $createInfo = Get-ObjectInfo $baseUrl 'CreateVideo'
    if (-not $createInfo) { return }

    $imagesToVideoId = Get-NodeIdByClass $nodes 'ImagesToVideo'
    if (-not $imagesToVideoId) { return }

    $node = $nodes.$imagesToVideoId
    $inputs = Ensure-Inputs $node
    $fps = if ($inputs.PSObject.Properties.Name -contains 'fps') { $inputs.fps } else { 24 }
    $images = if ($inputs.PSObject.Properties.Name -contains 'images') { $inputs.images } else { @('5', 0) }

    $node.class_type = 'CreateVideo'
    $node.inputs = [pscustomobject]@{ images = $images; fps = $fps }
    $changes.Value += "Node($imagesToVideoId): ImagesToVideo -> CreateVideo"
}

function Patch-SaveVideoRequiredInputs([object]$nodes, [string]$baseUrl, [ref]$changes) {
    $saveId = Get-NodeIdByClass $nodes 'SaveVideo'
    if (-not $saveId) { return }
    $required = Get-RequiredInputs $baseUrl 'SaveVideo'
    if ($required.Count -eq 0) { return }

    $node = $nodes.$saveId
    $inputs = Ensure-Inputs $node
    if (($required -contains 'format') -and -not ($inputs.PSObject.Properties.Name -contains 'format')) {
        Set-Input $inputs 'format' 'auto'
        $changes.Value += "SaveVideo($saveId): add format=auto"
    }
    if (($required -contains 'codec') -and -not ($inputs.PSObject.Properties.Name -contains 'codec')) {
        Set-Input $inputs 'codec' 'auto'
        $changes.Value += "SaveVideo($saveId): add codec=auto"
    }
}

function Patch-RifeProfile([object]$profile, [object]$nodes, [string]$baseUrl, [ref]$changes) {
    $rifeId = Get-NodeIdByClass $nodes 'RIFE VFI'
    if (-not $rifeId) { return }

    # Ensure GetVideoComponents exists and feeds RIFE frames
    $getId = Get-NodeIdByClass $nodes 'GetVideoComponents'
    if (-not $getId) {
        $getId = Get-NextNumericNodeId $nodes
        $nodes | Add-Member -MemberType NoteProperty -Name $getId -Value ([pscustomobject]@{
            inputs = [pscustomobject]@{ video = @('1', 0) }
            class_type = 'GetVideoComponents'
            _meta = [pscustomobject]@{ title = 'Get Video Components' }
        })
        $changes.Value += "Added GetVideoComponents node ($getId)"
    }

    $rifeNode = $nodes.$rifeId
    $rifeInputs = Ensure-Inputs $rifeNode
    if (-not ($rifeInputs.PSObject.Properties.Name -contains 'frames')) {
        Set-Input $rifeInputs 'frames' @($getId, 0)
        $changes.Value += "RIFE VFI($rifeId): add frames <- GetVideoComponents($getId)"
    }

    # Ensure CreateVideo exists and SaveVideo consumes VIDEO
    $createId = Get-NodeIdByClass $nodes 'CreateVideo'
    if (-not $createId) {
        $createId = Get-NextNumericNodeId $nodes
        $nodes | Add-Member -MemberType NoteProperty -Name $createId -Value ([pscustomobject]@{
            inputs = [pscustomobject]@{ images = @($rifeId, 0); fps = 48 }
            class_type = 'CreateVideo'
            _meta = [pscustomobject]@{ title = 'Create Video' }
        })
        $changes.Value += "Added CreateVideo node ($createId)"
    }

    $saveId = Get-NodeIdByClass $nodes 'SaveVideo'
    if ($saveId) {
        $saveNode = $nodes.$saveId
        $saveInputs = Ensure-Inputs $saveNode
        if (-not ($saveInputs.PSObject.Properties.Name -contains 'video')) {
            Set-Input $saveInputs 'video' @($createId, 0)
            $changes.Value += "SaveVideo($saveId): wire video <- CreateVideo($createId)"
        }
        if ($saveInputs.PSObject.Properties.Name -contains 'images') {
            Remove-Input $saveInputs 'images'
            $changes.Value += "SaveVideo($saveId): remove legacy images input"
        }
    }
}

Ensure-Object (Test-Path $SettingsPath) "SettingsPath '$SettingsPath' not found"
$settings = Get-Content -Path $SettingsPath -Raw | ConvertFrom-Json
Ensure-Object $settings "Failed to parse settings"

$baseUrl = Get-ComfyBase $(if (-not [string]::IsNullOrWhiteSpace($ComfyUIUrl)) { $ComfyUIUrl } else { $settings.comfyUIUrl })
Write-Info "ComfyUI: $baseUrl"
Write-Info "Settings: $SettingsPath"
Write-Info "Profiles: $($Profiles -join ', ')"
Write-Info "Mode: $([string]::Join('', @('apply', $(if ($DryRun) { ' (dry-run)' } else { '' }))))"

$totalChanges = 0
foreach ($profileId in $Profiles) {
    $profile = $settings.workflowProfiles.$profileId
    if (-not $profile) {
        Write-Warn "SKIP: Profile '$profileId' not found"
        continue
    }
    if (-not $profile.workflowJson -or [string]::IsNullOrWhiteSpace([string]$profile.workflowJson)) {
        Write-Warn "SKIP: Profile '$profileId' has no workflowJson"
        continue
    }

    $changes = @()
    $workflow = $profile.workflowJson | ConvertFrom-Json
    $nodes = Get-WorkflowNodes $workflow

    Patch-LoadVideoFile $nodes $baseUrl ([ref]$changes)
    Patch-MappingVideoToFile $profile ([ref]$changes)
    Patch-ImagesToVideoToCreateVideo $nodes $baseUrl ([ref]$changes)
    Patch-SaveVideoRequiredInputs $nodes $baseUrl ([ref]$changes)

    if ($profileId -eq 'rife-interpolation') {
        Patch-RifeProfile $profile $nodes $baseUrl ([ref]$changes)
    }

    if ($changes.Count -gt 0) {
        $totalChanges += $changes.Count
        Write-Info "Profile '$profileId' changes:"
        $changes | ForEach-Object { Write-Host "  - $_" }
        $profile.workflowJson = ($workflow | ConvertTo-Json -Depth 100 -Compress)
    } else {
        Write-Ok "Profile '$profileId': no changes needed"
    }
}

if ($totalChanges -eq 0) {
    Write-Ok "No changes required."
    exit 0
}

if ($DryRun) {
    Write-Ok "Dry-run complete. No files written."
    exit 0
}

Write-Info "Writing settings: $SettingsPath"
$settings | ConvertTo-Json -Depth 100 | Set-Content -Path $SettingsPath -Encoding UTF8
Write-Ok "Done."
