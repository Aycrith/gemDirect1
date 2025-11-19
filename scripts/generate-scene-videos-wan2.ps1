param(
  [string]$RunDir,
  [string]$ComfyUrl,
  [int]$MaxWaitSeconds = 0,
  [int]$PollIntervalSeconds = 0
)

# Use environment variables if parameters not provided
if (-not $RunDir) { $RunDir = $env:WAN2_RUN_DIR }
if (-not $ComfyUrl) { $ComfyUrl = $env:WAN2_COMFY_URL }
if ($MaxWaitSeconds -eq 0) { 
  $MaxWaitSeconds = if ($env:WAN2_MAX_WAIT) { [int]$env:WAN2_MAX_WAIT } else { 600 }
}
if ($PollIntervalSeconds -eq 0) { 
  $PollIntervalSeconds = if ($env:WAN2_POLL_INTERVAL) { [int]$env:WAN2_POLL_INTERVAL } else { 5 }
}

if (-not $ComfyUrl) {
  $ComfyUrl = "http://127.0.0.1:8188"
}
Try {
  $ComfyUrl = $ComfyUrl.TrimEnd('/')
} Catch {}

        function Add-RunSummaryLine {
          param([string]$Message)
          $summaryPath = Join-Path $RunDir 'run-summary.txt'
          if (-not (Test-Path $summaryPath)) { return }
          $line = "[{0}] {1}" -f (Get-Date -Format 'HH:mm:ss'), $Message
          Add-Content -Path $summaryPath -Value $line
        }

        function Check-PromptStatus {
          <#
            .SYNOPSIS
              Check if a prompt has completed execution and detect errors.
            .DESCRIPTION
              Queries ComfyUI history endpoint to determine prompt execution status.
              Returns status object with: status (pending/running/completed/error), error details if any.
          #>
          param(
            [string]$ComfyUrl,
            [string]$PromptId,
            [int]$TimeoutSec = 5
          )
  
          $historyUrl = "$ComfyUrl/history/$PromptId"
          try {
            $history = Invoke-RestMethod -Uri $historyUrl -TimeoutSec $TimeoutSec -ErrorAction Stop
            if ($history -and $history.PSObject.Properties.Name -contains $PromptId) {
              $promptHistory = $history.$PromptId
      
              # Check for exceptions (indicates execution failure)
              if ($promptHistory.exception_details) {
                return @{
                  status = 'error'
                  exception = $promptHistory.exception_details
                  message = 'Prompt execution failed'
                }
              }
      
              # Check for outputs (indicates completion)
              if ($promptHistory.outputs) {
                return @{
                  status = 'completed'
                  outputs = $promptHistory.outputs
                  message = 'Prompt execution completed'
                }
              }
      
              # Has history entry but no outputs or exception = still running or pending
              return @{
                status = 'running'
                message = 'Prompt execution in progress'
              }
            }
          } catch {
            Write-Warning "Failed to check prompt status at $historyUrl : $_"
            return @{
              status = 'unknown'
              error = $_.Exception.Message
              message = 'Unable to determine prompt status'
            }
          }
  
          return @{
            status = 'pending'
            message = 'Prompt not yet started'
          }
        }

        function Get-ComfyUIOutputPath {
          <#
            .SYNOPSIS
              Get the actual ComfyUI output directory where files are saved.
          #>
          # Standard ComfyUI output directory
          return "C:\ComfyUI\ComfyUI_windows_portable\ComfyUI\output"
        }

        function Copy-VideoFromComfyUI {
          <#
            .SYNOPSIS
              Safely copy video from ComfyUI output folder to target location.
          #>
          param(
            [string]$SceneId,
            [string]$TargetDirectory,
            [int]$TimeoutSeconds = 30
          )
  
          $comfyOutputRoot = Get-ComfyUIOutputPath
          $sceneVideoSourcePattern = Join-Path $comfyOutputRoot (Join-Path 'video' $sceneId) '*.mp4'
  
          $elapsed = 0
          $foundVideo = $false
  
          while ($elapsed -lt $TimeoutSeconds) {
            try {
              $videos = @(Get-ChildItem -Path $sceneVideoSourcePattern -ErrorAction SilentlyContinue)
              if ($videos.Count -gt 0) {
                $sourceVideo = $videos[0]
                $targetPath = Join-Path $TargetDirectory "$SceneId.mp4"
                Copy-Item -Path $sourceVideo.FullName -Destination $targetPath -Force -ErrorAction Stop
                Write-Host "[$SceneId] Video copied: $sourceVideo -> $targetPath"
                return @{ success = $true; path = $targetPath }
              }
            } catch {
              Write-Warning "[$SceneId] Error copying video: $_"
            }
    
            Start-Sleep -Seconds 1
            $elapsed += 1
          }
  
          return @{ success = $false; error = "No video found in ComfyUI output after ${TimeoutSeconds}s" }
        }

        function Test-ComfyUIHealth {
          <#
            .SYNOPSIS
              Lightweight health probe for ComfyUI (detect crashed server early).
            .DESCRIPTION
              Attempts to GET /system_stats with a short timeout. Returns $true if successful, otherwise $false.
          #>
          param([string]$BaseUrl)
          $healthUrl = "$BaseUrl/system_stats"
          try {
            Invoke-RestMethod -Uri $healthUrl -TimeoutSec 5 -ErrorAction Stop | Out-Null
            return $true
          } catch {
            return $false
          }
        }

        Write-Host "[wan2] RunDir=$RunDir ComfyUrl=$ComfyUrl"
        Write-Host "[wan2] PollIntervalSeconds=${PollIntervalSeconds}s MaxWaitSeconds=${MaxWaitSeconds}s"
        Add-RunSummaryLine "[Video] Wan2 queue knobs: PollIntervalSeconds=${PollIntervalSeconds}s MaxWaitSeconds=${MaxWaitSeconds}s"

        # Read story.json to get scene list
        $storyJsonPath = Join-Path $RunDir 'story\story.json'
        if (-not (Test-Path $storyJsonPath)) {
          Write-Warning "No story.json found at $storyJsonPath"
          exit 0
        }

        $story = Get-Content $storyJsonPath -Raw | ConvertFrom-Json
        $scenes = $story.scenes
        if (-not $scenes -or $scenes.Count -eq 0) {
          Write-Warning "No scenes found in story.json"
          exit 0
        }

        Write-Host "[wan2] Processing $($scenes.Count) scenes from story"

        foreach ($sceneData in $scenes) {
          $sceneId = $sceneData.id
          
          # Early server health check per scene
          if (-not (Test-ComfyUIHealth $ComfyUrl)) {
            Write-Warning "[${sceneId}] ComfyUI health probe failed before queuing; server appears down."
            Add-RunSummaryLine "[Scene $sceneId] Wan2 aborted: ComfyUI server unreachable (pre-queue)."
            Add-RunSummaryLine "[Video] Wan2 overall aborted due to ComfyUI outage (exit=99)"
            exit 99
          }
          
          # Get keyframe from story structure
          $keyframePath = $sceneData.keyframePath
          if (-not $keyframePath -or -not (Test-Path $keyframePath)) {
            Write-Warning "[$sceneId] Keyframe not found at $keyframePath; skipping scene"
            Add-RunSummaryLine "[Scene $sceneId] Wan2 skipped: keyframe missing"
            continue
          }
          
          $keyframe = Get-Item $keyframePath
          Add-RunSummaryLine "[Scene $sceneId] Wan2 keyframe: $($keyframe.Name)"

          # Get prompts from scene data
          $humanPrompt = if ($sceneData.prompt) { $sceneData.prompt } else { "" }
          $negativePrompt = if ($sceneData.negativePrompt) { $sceneData.negativePrompt } else { "" }
          Write-Host "[$sceneId] Using prompts from story.json"

          # Load a candidate workflow. Prefer a full workflow present in localGenSettings (wan-i2v) if available,
          # otherwise fall back to the simplified file under workflows/.
          $projectRoot = Split-Path -Parent $PSScriptRoot
          $workflowPath = Join-Path (Join-Path $projectRoot "workflows") "video_wan2_2_5B_ti2v.json"
          $localSettingsPath = Join-Path $projectRoot 'localGenSettings.json'

          $workflow = $null
          if (Test-Path $localSettingsPath) {
            try {
              $settings = Get-Content -Path $localSettingsPath -Raw | ConvertFrom-Json
              # Prefer the wan-i2v workflow profile if present
              if ($settings.workflowProfiles -and $settings.workflowProfiles.'wan-i2v' -and $settings.workflowProfiles.'wan-i2v'.workflowJson) {
                $workflow = $settings.workflowProfiles.'wan-i2v'.workflowJson | ConvertFrom-Json
                Write-Host "Using wan-i2v workflow from localGenSettings.json"
              } elseif ($settings.workflowJson) {
                $workflow = $settings.workflowJson | ConvertFrom-Json
                Write-Host "Using workflowJson from localGenSettings.json"
              }
            } catch {
              Write-Warning "Failed to parse localGenSettings.json: $_ (falling back to workflows file)"
              $workflow = $null
            }
          }

          if (-not $workflow) {
            if (-not (Test-Path $workflowPath)) {
              Write-Error "WAN 5B workflow missing at $workflowPath"
              exit 2
            }
            $workflow = Get-Content -Path $workflowPath -Raw | ConvertFrom-Json
          }

          $promptPayload = if ($workflow.prompt) { $workflow.prompt } else { $workflow }
          Write-Host "[$sceneId] Loaded workflow with $($promptPayload.PSObject.Properties.Count) nodes"
  
          # Inject scene prompts into the workflow nodes (nodes 6 and 7 for text conditioning)
          # Node 6 is CLIPTextEncode for positive prompt, Node 7 is for negative prompt
          if ($promptPayload.'6' -and $promptPayload.'6'.inputs) {
            $promptPayload.'6'.inputs.text = $humanPrompt
            Write-Host "[$sceneId] Injected human prompt into node 6"
          }
          if ($promptPayload.'7' -and $promptPayload.'7'.inputs) {
            $promptPayload.'7'.inputs.text = $negativePrompt
            Write-Host "[$sceneId] Injected negative prompt into node 7"
          }
  
          $loadImageNode = $null
          foreach ($prop in $promptPayload.PSObject.Properties) {
            $node = $prop.Value
            if ($node.class_type -eq 'LoadImage' -and $node.inputs -and $node.inputs.image) {
              $loadImageNode = $node
              break
            }
          }

          $uploadedFilename = $null
          try {
            Add-Type -AssemblyName System.Net.Http
          } catch {}

          $handler = [System.Net.Http.HttpClientHandler]::new()
          $client = [System.Net.Http.HttpClient]::new($handler)
          $stream = $null
          $content = $null
          $multipart = $null
          $overwriteContent = $null

          try {
            $stream = [System.IO.File]::OpenRead($keyframe.FullName)
            $content = [System.Net.Http.StreamContent]::new($stream)
            $ext = $keyframe.Extension.ToLowerInvariant()
            $mimeType = if ($ext -in '.jpg', '.jpeg') { 'image/jpeg' } else { 'image/png' }
            $content.Headers.ContentType = [System.Net.Http.Headers.MediaTypeHeaderValue]::Parse($mimeType)
            $multipart = [System.Net.Http.MultipartFormDataContent]::new()
            $multipart.Add($content, 'image', $keyframe.Name)
            $overwriteContent = [System.Net.Http.StringContent]::new('true')
            $multipart.Add($overwriteContent, 'overwrite')

            $uploadUrl = "$ComfyUrl/upload/image"
            $uploadResponse = $client.PostAsync($uploadUrl, $multipart).GetAwaiter().GetResult()
            if (-not $uploadResponse.IsSuccessStatusCode) {
              throw "Upload failed with status $($uploadResponse.StatusCode)"
            }
            $uploadBody = $uploadResponse.Content.ReadAsStringAsync().GetAwaiter().GetResult()
            $uploadInfo = $uploadBody | ConvertFrom-Json
            $uploadedFilename = if ($uploadInfo.name) { $uploadInfo.name } else { $keyframe.Name }
            Write-Host "[$sceneId] Uploaded keyframe as $uploadedFilename"
            Add-RunSummaryLine "[Scene $sceneId] Wan2 keyframe uploaded: $uploadedFilename"
          } catch {
            Write-Warning "[$sceneId] Failed to upload keyframe: $_"
            Add-RunSummaryLine "[Scene $sceneId] Wan2 upload failed: $_"
            continue
          } finally {
            if ($overwriteContent -ne $null) { $overwriteContent.Dispose() }
            if ($content -ne $null) { $content.Dispose() }
            if ($stream -ne $null) { $stream.Dispose() }
            if ($multipart -ne $null) { $multipart.Dispose() }
            if ($client -ne $null) { $client.Dispose() }
            if ($handler -ne $null) { $handler.Dispose() }
          }

          if ($loadImageNode) {
            $loadImageNode.inputs.image = $uploadedFilename
          } else {
            Write-Warning "[$sceneId] No LoadImage node found to inject the keyframe."
            Add-RunSummaryLine "[Scene $sceneId] Wan2 workflow missing LoadImage node; keyframe may not be used"
          }

          # CRITICAL FIX: Use relative path within ComfyUI's allowed output folder
          # ComfyUI has a security policy that prevents saving outside its output directory.
          # Solution: Use relative subfolder path (e.g., "video/scene-001")
          # ComfyUI will save to: C:\ComfyUI\ComfyUI_windows_portable\ComfyUI\output\video\scene-001\
          # We'll copy the file to the run directory after generation completes.
  
          $sceneVideoDir = Join-Path $RunDir (Join-Path 'video' $sceneId)
          if (-not (Test-Path $sceneVideoDir)) { New-Item -ItemType Directory -Path $sceneVideoDir -Force | Out-Null }
  
          # Use RELATIVE path instead of absolute path (this is the critical fix)
          # ComfyUI sees this as: video/scene-001 (relative to its output folder)
          # Use forward slashes for ComfyUI's cross-platform filename_prefix handling
          $relativePrefix = "video/$sceneId"

          # Find SaveVideo node (if any) and set desired defaults to encourage MP4 output
          $saveVideoNode = $null
          foreach ($prop in $promptPayload.PSObject.Properties) {
            $node = $prop.Value
            if ($node.class_type -eq 'SaveVideo') { $saveVideoNode = $node; break }
          }

          if ($saveVideoNode) {
            # Use MP4/h264 defaults if not present
            if (-not $saveVideoNode.inputs.format) { $saveVideoNode.inputs.format = 'auto' }
            if (-not $saveVideoNode.inputs.codec) { $saveVideoNode.inputs.codec = 'auto' }
            # Set filename_prefix to RELATIVE path (ComfyUI will save relative to its output folder)
            $saveVideoNode.inputs.filename_prefix = $relativePrefix
            Write-Host "[$sceneId] Updated SaveVideo node: format=$($saveVideoNode.inputs.format) codec=$($saveVideoNode.inputs.codec) prefix=$relativePrefix (relative)"
            Add-RunSummaryLine "[Scene $sceneId] Wan2 SaveVideo configured: filename_prefix=$relativePrefix"
          } else {
            Write-Warning "[$sceneId] No SaveVideo node found in workflow; video may not be produced by ComfyUI directly."
          }

          $promptPayloadString = @{ prompt = $promptPayload } | ConvertTo-Json -Depth 20
          $start = Get-Date
          $promptId = $null
          $tempJsonFile = $null
          try {
            # Write payload to temporary file WITHOUT BOM (ComfyUI requires UTF-8 without BOM)
            $tempJsonFile = [System.IO.Path]::GetTempFileName()
            $utf8NoBom = New-Object System.Text.UTF8Encoding $false
            [System.IO.File]::WriteAllText($tempJsonFile, $promptPayloadString, $utf8NoBom)
    
            # Debug: Check payload size and first 500 chars
            $payloadSize = (Get-Item $tempJsonFile).Length
            Write-Host "[$sceneId] Payload file size: $payloadSize bytes"
            $firstChars = $promptPayloadString.Substring(0, [Math]::Min(500, $promptPayloadString.Length))
            Write-Host "[$sceneId] Payload preview: $firstChars..."
    
            Write-Host "[$sceneId] Attempting to queue Wan2 prompt (Invoke-RestMethod)..."
    
            try {
              # Prefer Invoke-RestMethod to get parsed JSON response when possible
              $response = Invoke-RestMethod -Uri "$ComfyUrl/prompt" -Method Post -ContentType "application/json" -InFile $tempJsonFile -TimeoutSec 120 -ErrorAction Stop
              $promptId = $response.prompt_id
              $duration = [math]::Round(((Get-Date) - $start).TotalSeconds, 1)
              Write-Host "[$sceneId] Prompt queued successfully (ID: $promptId) in ${duration}s"
              Add-RunSummaryLine "[Scene $sceneId] Wan2 prompt queued: prompt_id=$promptId duration=${duration}s"
            } catch {
              # If Invoke-RestMethod fails, capture raw response (status & body) via Invoke-WebRequest
              $statusCode = 'unknown'
              $rawBody = ''
              try {
                $webResp = Invoke-WebRequest -Uri "$ComfyUrl/prompt" -Method Post -ContentType "application/json" -InFile $tempJsonFile -TimeoutSec 120 -ErrorAction SilentlyContinue
                if ($webResp -ne $null) {
                  $statusCode = $webResp.StatusCode
                  $rawBody = $webResp.Content
                }
              } catch {
                # Best-effort capture: fall back to exception message
                $statusCode = $_.Exception.Response -ne $null ? $_.Exception.Response.StatusCode.Value__ : 'unknown'
                $rawBody = $_.Exception.Message
              }

              # Treat HTTP 200 with a parseable prompt_id in body as success even if Invoke-RestMethod threw
              $bodyPromptId = $null
              try {
                if ($rawBody) {
                  $parsed = $rawBody | ConvertFrom-Json -ErrorAction Stop
                  if ($parsed -and $parsed.prompt_id) { $bodyPromptId = $parsed.prompt_id }
                }
              } catch { $bodyPromptId = $null }

              if ($statusCode -eq 200 -and $bodyPromptId) {
                $promptId = $bodyPromptId
                $duration = [math]::Round(((Get-Date) - $start).TotalSeconds, 1)
                Write-Host "[$sceneId] Prompt queued (fallback parse) ID: $promptId in ${duration}s"
                Add-RunSummaryLine "[Scene $sceneId] Wan2 prompt queued (fallback): prompt_id=$promptId duration=${duration}s"
              } else {
                $errMsg = "Failed to queue prompt (status=$statusCode): $rawBody"
                Write-Warning "[$sceneId] $errMsg"
                Add-RunSummaryLine "[Scene $sceneId] Wan2 prompt queue failed: $errMsg"
                continue
              }
            }
          } finally {
            if ($tempJsonFile -and (Test-Path $tempJsonFile)) {
              Remove-Item $tempJsonFile -Force -ErrorAction SilentlyContinue
            }
          }

          # NEW: Intelligent polling with error detection and retry logic
          $maxRetries = 3
          $retryCount = 0
          $videoFound = $false
          $totalPollTime = 0
  
          while ($retryCount -lt $maxRetries -and -not $videoFound) {
            $elapsed = 0
            $pollInterval = $PollIntervalSeconds
            $pollStart = Get-Date
    
            Write-Host "[$sceneId] Polling for video (attempt $($retryCount + 1)/$maxRetries, timeout=${MaxWaitSeconds}s)"
            Add-RunSummaryLine "[Scene $sceneId] Wan2 polling started (attempt $($retryCount + 1)/$maxRetries)"
    
            while ($elapsed -lt $MaxWaitSeconds -and -not $videoFound) {
              # Check ComfyUI output folder for generated video
              # ComfyUI saves with flat filename_prefix pattern: video/scene-001_*.mp4 (not nested folders)
              $comfyOutputRoot = Get-ComfyUIOutputPath
              $sceneVideoSourcePattern = Join-Path $comfyOutputRoot "video\${sceneId}_*.mp4"
      
              try {
                $generatedVideos = @(Get-ChildItem -Path $sceneVideoSourcePattern -ErrorAction SilentlyContinue)
                if ($generatedVideos.Count -gt 0) {
                  # Video found in ComfyUI output - copy it to target location
                  $sourceVideo = $generatedVideos[0]
                  $targetMp4 = Join-Path $sceneVideoDir "$sceneId.mp4"
          
                  try {
                    Copy-Item -Path $sourceVideo.FullName -Destination $targetMp4 -Force -ErrorAction Stop
                    $videoFound = $true
                    Write-Host "[$sceneId] Video copied from ComfyUI output: $($sourceVideo.Name) -> $targetMp4"
                    Add-RunSummaryLine "[Scene $sceneId] Wan2 video copied: $($sourceVideo.FullName) -> $targetMp4"
                    break
                  } catch {
                    Write-Warning "[$sceneId] Failed to copy video: $_"
                    Add-RunSummaryLine "[Scene $sceneId] Wan2 copy failed: $_"
                  }
                }
              } catch {
                Write-Warning "[$sceneId] Error checking for video file: $_"
              }
      
              # Check prompt execution status (detect errors early)
              $status = Check-PromptStatus -ComfyUrl $ComfyUrl -PromptId $promptId
              if ($status.status -eq 'error') {
                Write-Warning "[$sceneId] ComfyUI execution error detected: $($status.exception)"
                Add-RunSummaryLine "[Scene $sceneId] Wan2 execution error: $($status.exception)"
                break  # Don't retry on permanent errors
              }
      
              if ($status.status -eq 'completed' -and -not $videoFound) {
                Write-Warning "[$sceneId] Prompt marked as completed but no video file found. ComfyUI may not have produced output."
                Add-RunSummaryLine "[Scene $sceneId] Wan2 execution completed without video output"
                break  # Don't retry if completed without output
              }

              # Detect hard crash: status unknown + health probe fails
              if ($status.status -eq 'unknown' -and -not (Test-ComfyUIHealth $ComfyUrl)) {
                Write-Warning "[$sceneId] ComfyUI server appears to have crashed during polling (status=unknown, health probe failed)."
                Add-RunSummaryLine "[Scene $sceneId] Wan2 aborted mid-poll: ComfyUI crash detected (exit=99)"
                Add-RunSummaryLine "[Video] Wan2 overall aborted mid-run due to ComfyUI outage (exit=99)"
                exit 99
              }
      
              Start-Sleep -Seconds $pollInterval
              $elapsed += $pollInterval
            }
    
            $pollDuration = [math]::Round(((Get-Date) - $pollStart).TotalSeconds, 1)
            $totalPollTime += $pollDuration
    
            if (-not $videoFound) {
              $retryCount++
      
              if ($retryCount -lt $maxRetries) {
                # Exponential backoff: 2s, 4s, 8s between retries
                $backoffSeconds = [math]::Pow(2, $retryCount)
                Write-Host "[$sceneId] Video not found after ${pollDuration}s. Retrying in ${backoffSeconds}s (attempt $($retryCount + 1)/$maxRetries)"
                Add-RunSummaryLine "[Scene $sceneId] Wan2 retry scheduled: backoff=${backoffSeconds}s attempt=$($retryCount + 1)/$maxRetries"
                Start-Sleep -Seconds $backoffSeconds
              } else {
                Write-Warning "[$sceneId] Max retries ($maxRetries) exhausted. No video generated."
                Add-RunSummaryLine "[Scene $sceneId] Wan2 video generation failed after $maxRetries attempts (total time: ${totalPollTime}s)"
              }
            }
          }
  
          if ($videoFound) {
            Add-RunSummaryLine "[Scene $sceneId] Wan2 video generation succeeded: $targetMp4 (total time: ${totalPollTime}s)"
          } else {
            Add-RunSummaryLine "[Scene $sceneId] Wan2 video generation failed: No video after ${totalPollTime}s and $maxRetries attempts. Check ComfyUI logs."
          }
        }
