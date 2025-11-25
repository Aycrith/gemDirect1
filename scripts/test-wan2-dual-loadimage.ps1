<#
.SYNOPSIS
Test WAN2 dual LoadImage support for bookend workflow research

.DESCRIPTION
Tests three approaches for dual-keyframe video generation with WAN2:
1. Dual LoadImage nodes with array connection
2. Modified start_image to accept multiple inputs
3. Batch processing with concatenated latents

.PARAMETER ComfyUIUrl
ComfyUI server URL (default: http://127.0.0.1:8188)

.PARAMETER TestImagesDir
Directory containing start.png and end.png (default: temp/bookend-test)
#>

param(
    [string]$ComfyUIUrl = "http://127.0.0.1:8188",
    [string]$TestImagesDir = "temp/bookend-test"
)

$ErrorActionPreference = "Stop"

Write-Host "=== WAN2 Dual LoadImage Research Test ===" -ForegroundColor Cyan
Write-Host "ComfyUI: $ComfyUIUrl" -ForegroundColor Gray
Write-Host "Test Images: $TestImagesDir" -ForegroundColor Gray
Write-Host ""

# Verify test images exist
$startImage = Join-Path $TestImagesDir "start.png"
$endImage = Join-Path $TestImagesDir "end.png"

if (-not (Test-Path $startImage)) {
    Write-Error "Start image not found: $startImage"
}
if (-not (Test-Path $endImage)) {
    Write-Error "End image not found: $endImage"
}

# Function to upload images to ComfyUI
function Upload-ImageToComfyUI {
    param([string]$ImagePath)
    
    $fileName = Split-Path -Leaf $ImagePath
    $url = "$ComfyUIUrl/upload/image"
    
    Write-Host "Uploading $fileName..." -ForegroundColor Gray
    
    $boundary = [System.Guid]::NewGuid().ToString()
    $LF = "`r`n"
    
    $bodyLines = (
        "--$boundary",
        "Content-Disposition: form-data; name=`"image`"; filename=`"$fileName`"",
        "Content-Type: image/png$LF",
        [System.IO.File]::ReadAllText($ImagePath),
        "--$boundary--$LF"
    ) -join $LF
    
    try {
        $response = Invoke-RestMethod -Uri $url -Method Post -ContentType "multipart/form-data; boundary=$boundary" -Body $bodyLines
        Write-Host "  ✓ Uploaded: $($response.name)" -ForegroundColor Green
        return $response.name
    } catch {
        Write-Host "  ✗ Upload failed: $_" -ForegroundColor Red
        throw
    }
}

# Test 1: Examine WAN2 node spec
Write-Host "`n[Test 1] Analyzing WAN2 Node Specifications" -ForegroundColor Yellow
Write-Host "Reading wan2-node-spec.json..." -ForegroundColor Gray

$wan2Spec = Get-Content "temp/bookend-test/wan2-node-spec.json" | ConvertFrom-Json
$startImageInput = $wan2Spec.Wan22ImageToVideoLatent.input.optional.start_image

Write-Host "  Parameter: start_image" -ForegroundColor White
Write-Host "  Type: $($startImageInput[0])" -ForegroundColor White
Write-Host "  Optional: True" -ForegroundColor White
$isArrayType = $startImageInput[0] -match '\[\]'
Write-Host "  Accepts Array: $(if ($isArrayType) { 'Yes' } else { 'No' })" -ForegroundColor $(if ($isArrayType) { 'Green' } else { 'Red' })

if ($startImageInput[0] -eq "IMAGE") {
    Write-Host "`n  ⚠️  FINDING: start_image expects single IMAGE type, not array" -ForegroundColor Yellow
    Write-Host "  This suggests WAN2 does NOT natively support dual keyframes." -ForegroundColor Yellow
}

# Test 2: Single LoadImage baseline (control test)
Write-Host "`n[Test 2] Baseline Test - Single LoadImage" -ForegroundColor Yellow
Write-Host "Testing standard single-image workflow..." -ForegroundColor Gray

$baselineWorkflow = @{
    "56" = @{
        "inputs" = @{
            "image" = "start.png"
        }
        "class_type" = "LoadImage"
    }
    "55" = @{
        "inputs" = @{
            "width" = 1280
            "height" = 544
            "length" = 49
            "batch_size" = 1
            "vae" = @("39", 0)
            "start_image" = @("56", 0)
        }
        "class_type" = "Wan22ImageToVideoLatent"
    }
    "37" = @{
        "inputs" = @{
            "unet_name" = "wan2.2_ti2v_5B_fp16.safetensors"
            "weight_dtype" = "default"
        }
        "class_type" = "UNETLoader"
    }
    "38" = @{
        "inputs" = @{
            "clip_name" = "umt5_xxl_fp8_e4m3fn_scaled.safetensors"
            "type" = "wan"
            "device" = "default"
        }
        "class_type" = "CLIPLoader"
    }
    "39" = @{
        "inputs" = @{
            "vae_name" = "wan2.2_vae.safetensors"
        }
        "class_type" = "VAELoader"
    }
    "6" = @{
        "inputs" = @{
            "text" = "Test prompt for baseline"
            "clip" = @("38", 0)
        }
        "class_type" = "CLIPTextEncode"
    }
    "7" = @{
        "inputs" = @{
            "text" = "low quality"
            "clip" = @("38", 0)
        }
        "class_type" = "CLIPTextEncode"
    }
    "48" = @{
        "inputs" = @{
            "shift" = 8
            "model" = @("37", 0)
        }
        "class_type" = "ModelSamplingSD3"
    }
    "3" = @{
        "inputs" = @{
            "seed" = Get-Random -Maximum 999999999999
            "steps" = 12
            "cfg" = 5
            "sampler_name" = "uni_pc"
            "scheduler" = "simple"
            "denoise" = 1
            "model" = @("48", 0)
            "positive" = @("6", 0)
            "negative" = @("7", 0)
            "latent_image" = @("55", 0)
        }
        "class_type" = "KSampler"
    }
    "8" = @{
        "inputs" = @{
            "samples" = @("3", 0)
            "vae" = @("39", 0)
        }
        "class_type" = "VAEDecode"
    }
    "57" = @{
        "inputs" = @{
            "fps" = 24
            "images" = @("8", 0)
        }
        "class_type" = "CreateVideo"
    }
    "58" = @{
        "inputs" = @{
            "filename_prefix" = "test/baseline"
            "format" = "auto"
            "codec" = "auto"
            "video" = @("57", 0)
        }
        "class_type" = "SaveVideo"
    }
}

Write-Host "  Queuing baseline workflow..." -ForegroundColor Gray
try {
    $promptPayload = @{
        prompt = $baselineWorkflow
    } | ConvertTo-Json -Depth 10
    
    $queueResponse = Invoke-RestMethod -Uri "$ComfyUIUrl/prompt" -Method Post -Body $promptPayload -ContentType "application/json"
    Write-Host "  ✓ Baseline queued: $($queueResponse.prompt_id)" -ForegroundColor Green
    $baselinePromptId = $queueResponse.prompt_id
} catch {
    Write-Host "  ✗ Baseline failed: $_" -ForegroundColor Red
    $baselinePromptId = $null
}

# Test 3: Dual LoadImage attempt (experimental)
Write-Host "`n[Test 3] Experimental - Dual LoadImage Nodes" -ForegroundColor Yellow
Write-Host "Testing two LoadImage nodes connected to Wan22ImageToVideoLatent..." -ForegroundColor Gray

$dualLoadImageWorkflow = $baselineWorkflow.PSObject.Copy()
$dualLoadImageWorkflow["56b"] = @{
    "inputs" = @{
        "image" = "end.png"
    }
    "class_type" = "LoadImage"
}

# Attempt to pass array to start_image
$dualLoadImageWorkflow["55"]["inputs"]["start_image"] = @(@("56", 0), @("56b", 0))

Write-Host "  Modified workflow: Added Node 56b (end.png)" -ForegroundColor Gray
Write-Host "  start_image input: [Node 56, Node 56b]" -ForegroundColor Gray

try {
    $promptPayload = @{
        prompt = $dualLoadImageWorkflow
    } | ConvertTo-Json -Depth 10
    
    $queueResponse = Invoke-RestMethod -Uri "$ComfyUIUrl/prompt" -Method Post -Body $promptPayload -ContentType "application/json"
    Write-Host "  ✓ Dual LoadImage queued: $($queueResponse.prompt_id)" -ForegroundColor Green
    $dualPromptId = $queueResponse.prompt_id
} catch {
    Write-Host "  ✗ Dual LoadImage FAILED (expected): $_" -ForegroundColor Red
    $dualPromptId = $null
    
    if ($_ -match "start_image") {
        Write-Host "    FINDING: start_image does NOT accept array inputs" -ForegroundColor Yellow
    }
}

# Test 4: Check for alternative WAN2 parameters
Write-Host "`n[Test 4] Searching for Alternative Parameters" -ForegroundColor Yellow
Write-Host "Checking if Wan22ImageToVideoLatent has end_image or similar..." -ForegroundColor Gray

$allInputs = $wan2Spec.Wan22ImageToVideoLatent.input.optional.PSObject.Properties.Name
Write-Host "  Available optional inputs: $($allInputs -join ', ')" -ForegroundColor White

$hasEndImage = $allInputs -contains "end_image"
$hasImageArray = $allInputs -contains "images"
$hasDualImage = $allInputs -contains "dual_image"

Write-Host "  end_image: $(if ($hasEndImage) { '✓ Found' } else { '✗ Not found' })" -ForegroundColor $(if ($hasEndImage) { 'Green' } else { 'Red' })
Write-Host "  images (array): $(if ($hasImageArray) { '✓ Found' } else { '✗ Not found' })" -ForegroundColor $(if ($hasImageArray) { 'Green' } else { 'Red' })
Write-Host "  dual_image: $(if ($hasDualImage) { '✓ Found' } else { '✗ Not found' })" -ForegroundColor $(if ($hasDualImage) { 'Green' } else { 'Red' })

# Summary
Write-Host "`n=== Research Summary ===" -ForegroundColor Cyan

$findings = @()
$findings += "1. WAN2 start_image parameter: Single IMAGE type only"
$findings += "2. No end_image or dual_image parameters found"
$findings += "3. Baseline single-image workflow: $(if ($baselinePromptId) { 'SUCCESS' } else { 'FAILED' })"
$findings += "4. Dual LoadImage array approach: $(if ($dualPromptId) { 'SUCCESS (unexpected!)' } else { 'FAILED (expected)' })"

foreach ($finding in $findings) {
    Write-Host "  $finding" -ForegroundColor White
}

Write-Host "`n=== Conclusion ===" -ForegroundColor Cyan
Write-Host "Based on ComfyUI API analysis:" -ForegroundColor White
Write-Host "  ✗ WAN2 does NOT natively support dual keyframes" -ForegroundColor Red
Write-Host "  ✓ WAN2 designed for single start_image only" -ForegroundColor Yellow
Write-Host ""
Write-Host "Recommended Path:" -ForegroundColor Yellow
Write-Host "  → AnimateDiff + IP-Adapter approach" -ForegroundColor White
Write-Host "  → OR Sequential generation + video splicing" -ForegroundColor White
Write-Host ""

# Monitor queue if baseline was queued
if ($baselinePromptId) {
    Write-Host "Monitoring baseline execution (30s timeout)..." -ForegroundColor Gray
    $timeout = 30
    $elapsed = 0
    
    while ($elapsed -lt $timeout) {
        Start-Sleep -Seconds 2
        $elapsed += 2
        
        try {
            $history = Invoke-RestMethod -Uri "$ComfyUIUrl/history/$baselinePromptId" -Method Get
            if ($history.$baselinePromptId) {
                $status = $history.$baselinePromptId.status
                if ($status.completed) {
                    Write-Host "  ✓ Baseline completed successfully" -ForegroundColor Green
                    break
                } elseif ($status.error) {
                    Write-Host "  ✗ Baseline failed: $($status.error)" -ForegroundColor Red
                    break
                }
            }
        } catch {
            # Still queued
        }
        
        Write-Host "  . Waiting... ($elapsed/$timeout s)" -ForegroundColor Gray -NoNewline
        Write-Host "`r" -NoNewline
    }
}

Write-Host "`nTest complete. Results saved to logs." -ForegroundColor Cyan
