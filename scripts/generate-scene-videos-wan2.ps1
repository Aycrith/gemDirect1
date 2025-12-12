param(
  [string]$RunDir,
  [string]$ComfyUrl,
  [int]$MaxWaitSeconds = 0,
  [int]$PollIntervalSeconds = 0,
  [int]$MemoryCleanupInterval = 10,  # Clear ComfyUI memory every N scenes (0 = disable)
  [string]$SceneFilter = ""  # Optional: Only process this specific scene ID (e.g., "scene-001")
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

# Prefer npx.cmd to avoid PowerShell shim argument quirks (especially when splatting).
$npxCommand = (Get-Command 'npx.cmd' -ErrorAction SilentlyContinue).Path
if (-not $npxCommand) { $npxCommand = 'npx' }

        function Add-RunSummaryLine {
          param([string]$Message)
          try {
            $summaryPath = Join-Path $RunDir 'run-summary.txt'
            if (-not (Test-Path $summaryPath)) { return }
            $line = "[{0}] {1}" -f (Get-Date -Format 'HH:mm:ss'), $Message
            Add-Content -Path $summaryPath -Value $line -ErrorAction Stop
          } catch {
            # File write failed - log to console but don't crash
            Write-Warning "Failed to write to run-summary.txt: $($_.Exception.Message)"
          }
        }

        function Check-PromptStatus {
          <#
            .SYNOPSIS
              Check if a prompt has completed execution and detect errors.
            .DESCRIPTION
              Queries ComfyUI queue and history to determine prompt execution status.
              Returns status object with: status (pending/running/completed/error), error details if any.
              
              CRITICAL FIX: Check BOTH queue and history because of race condition during completion transition.
          #>
          param(
            [string]$ComfyUrl,
            [string]$PromptId,
            [int]$TimeoutSec = 5
          )
  
          $inQueue = $false
          $queueCheckFailed = $false
  
          # STEP 1: Check if prompt is in the queue (running or pending)
          try {
            $queueUrl = "$ComfyUrl/queue"
            $queue = Invoke-RestMethod -Uri $queueUrl -TimeoutSec $TimeoutSec -ErrorAction Stop
            
            # Check if prompt is currently executing
            if ($queue.queue_running) {
              foreach ($item in $queue.queue_running) {
                if ($item[1] -eq $PromptId) {
                  return @{
                    status = 'running'
                    message = 'Prompt currently executing'
                  }
                }
              }
            }
            
            # Check if prompt is in pending queue
            if ($queue.queue_pending) {
              foreach ($item in $queue.queue_pending) {
                if ($item[1] -eq $PromptId) {
                  return @{
                    status = 'queued'
                    message = 'Prompt waiting in queue'
                  }
                }
              }
            }
            # If we got here, prompt is NOT in queue
            $inQueue = $false
          } catch {
            # Queue check failed - can't determine if prompt is running
            $queueCheckFailed = $true
          }
  
          # STEP 2: Check history (contains completed/failed prompts)
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
      
              # Has history entry but no outputs or exception = unusual state
              return @{
                status = 'unknown'
                message = 'Prompt in history but no outputs or errors'
              }
            }
          } catch {
            # History check failed
            if ($queueCheckFailed) {
              # Both checks failed - can't determine status
              return @{
                status = 'unknown'
                error = 'Queue and history API both failed'
                message = 'Unable to determine prompt status'
              }
            }
            # History check failed but queue check succeeded and prompt not in queue
            # This could mean the prompt hasn't started yet
          }
  
          # Prompt is not in queue and not in history
          # If queue check succeeded, this means prompt hasn't started yet or is in transition
          if ($queueCheckFailed) {
            # Can't determine - queue check failed and history is empty
            return @{
              status = 'unknown'
              error = 'Queue check failed, no history available'
              message = 'Unable to determine if prompt has started'
            }
          }
  
          # Queue is accessible and prompt is not there, also not in history
          # Most likely: prompt hasn't been processed yet
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

        # Apply scene filter if specified
        if ($SceneFilter) {
          Write-Host "[wan2] Filtering for scene: $SceneFilter"
          $scenes = $scenes | Where-Object { $_.id -eq $SceneFilter }
          if (-not $scenes -or $scenes.Count -eq 0) {
            Write-Warning "[wan2] No scenes matched filter '$SceneFilter'"
            exit 0
          }
        }
        
        Write-Host "[wan2] Processing $($scenes.Count) scenes from story"
        
        # Memory cleanup counter
        $sceneIndex = 0

        foreach ($sceneData in $scenes) {
          $sceneId = $sceneData.id
          $sceneIndex++
          
          # Periodic memory cleanup to prevent leaks in long batches
          if ($MemoryCleanupInterval -gt 0 -and $sceneIndex % $MemoryCleanupInterval -eq 0) {
            Write-Host "[wan2] Triggering memory cleanup (scene $sceneIndex/$($scenes.Count))"
            Add-RunSummaryLine "[Memory] Cleanup triggered after scene $sceneIndex"
            
            try {
              # Call ComfyUI's free memory endpoint
              Invoke-RestMethod -Uri "$ComfyUrl/free" -Method POST -TimeoutSec 10 -ErrorAction Stop | Out-Null
              Write-Host "[wan2] Memory cleanup successful"
              Start-Sleep -Seconds 2  # Brief pause for cleanup to complete
            } catch {
              Write-Warning "[wan2] Memory cleanup failed: $_ (continuing anyway)"
            }
          }
          
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
            Add-RunSummaryLine "[Scene $sceneId] Wan2 prompt injection: positive prompt injected into node 6 ($($humanPrompt.Length) chars)"
          }
          if ($promptPayload.'7' -and $promptPayload.'7'.inputs) {
            $promptPayload.'7'.inputs.text = $negativePrompt
            Write-Host "[$sceneId] Injected negative prompt into node 7"
            Add-RunSummaryLine "[Scene $sceneId] Wan2 prompt injection: negative prompt injected into node 7 ($($negativePrompt.Length) chars)"
          }
          
          # Log CFG and seed values from KSampler node (typically node 3)
          if ($promptPayload.'3' -and $promptPayload.'3'.inputs) {
            $cfg = $promptPayload.'3'.inputs.cfg
            $seed = $promptPayload.'3'.inputs.seed
            $steps = $promptPayload.'3'.inputs.steps
            $samplerName = $promptPayload.'3'.inputs.sampler_name
            
            if ($null -ne $cfg) {
              Write-Host "[$sceneId] CFG value confirmed: $cfg"
              Add-RunSummaryLine "[Scene $sceneId] Wan2 CFG: $cfg (sampler: $samplerName, steps: $steps)"
            }
            if ($null -ne $seed) {
              Write-Host "[$sceneId] Seed value: $seed"
              Add-RunSummaryLine "[Scene $sceneId] Wan2 seed: $seed"
            }
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

          # EVENT-DRIVEN POLLING: Wait for execution completion, then retrieve file
          # This eliminates race conditions by using ComfyUI history API as source of truth
          $videoFound = $false
          $pollStart = Get-Date
          $statusCheckInterval = $PollIntervalSeconds  # Use configured poll interval
          $comfyOutputRoot = Get-ComfyUIOutputPath
          
          Write-Host "[$sceneId] Waiting for ComfyUI execution to complete (timeout=${MaxWaitSeconds}s, check every ${statusCheckInterval}s)"
          Add-RunSummaryLine "[Scene $sceneId] Wan2 polling started"
          
          # DIAGNOSTIC: Log initial state to help debug hangs
          Write-Host "[$sceneId] Polling state: promptId=$promptId, comfyUrl=$ComfyUrl, maxWait=${MaxWaitSeconds}s" -ForegroundColor Gray
          Add-RunSummaryLine "[Scene $sceneId] Wan2 polling state: promptId=$promptId maxWait=${MaxWaitSeconds}s interval=${statusCheckInterval}s"
          
          # Poll execution status until completed, error, or timeout
          $executionCompleted = $false
          $executionError = $false
          $errorMessage = ""
          
          while (((Get-Date) - $pollStart).TotalSeconds -lt $MaxWaitSeconds) {
            $elapsed = [math]::Round(((Get-Date) - $pollStart).TotalSeconds, 1)
            
            try {
              # Check status FIRST before any logging to avoid false "running" states
              $status = Check-PromptStatus -ComfyUrl $ComfyUrl -PromptId $promptId
              
              # Log to console only every 10 seconds to avoid overwhelming output buffer
              $shouldLogToConsole = ($elapsed -eq 0) -or ([math]::Floor($elapsed) % 10 -eq 0)
              if ($shouldLogToConsole) {
                Write-Host "[$sceneId] Status: $($status.status) (${elapsed}s)" -ForegroundColor Gray
              }
              
              # Log to file every 10 seconds to reduce I/O and prevent overwhelming the log
              if ($shouldLogToConsole) {
                try {
                  Add-RunSummaryLine "[Scene $sceneId] Wan2 status: $($status.status) (${elapsed}s)"
                } catch {
                  # If logging fails, don't crash - just continue
                  Write-Warning "[$sceneId] Failed to write to run summary: $_"
                }
              }
              
              # Handle different states
              if ($status.status -eq 'completed') {
                $executionCompleted = $true
                Write-Host "[$sceneId] ✓ ComfyUI execution completed (${elapsed}s)" -ForegroundColor Green
                Add-RunSummaryLine "[Scene $sceneId] Wan2 execution completed (${elapsed}s)"
                break
              } elseif ($status.status -eq 'error') {
                $executionError = $true
                $errorMessage = $status.exception
                Write-Warning "[$sceneId] ComfyUI execution error: $errorMessage"
                Add-RunSummaryLine "[Scene $sceneId] Wan2 execution error: $errorMessage"
                break
              } elseif ($status.status -eq 'unknown') {
                Write-Warning "[$sceneId] Status unknown: $($status.error) - continuing to poll"
                Add-RunSummaryLine "[Scene $sceneId] Wan2 status unknown: $($status.error)"
                # Continue polling - might be transient API issue
              }
              # Status is 'running', 'queued', or 'pending' - continue polling
              
            } catch {
              # Catch ANY exception in the status check or logging
              $errMsg = $_.Exception.Message
              Write-Warning "[$sceneId] Polling iteration error: $errMsg"
              try {
                Add-RunSummaryLine "[Scene $sceneId] Wan2 polling error: $errMsg"
              } catch {
                # Even logging the error failed - serious problem but don't crash
              }
              # Continue polling - might recover
            }
            
            # Progress update every 30 seconds
            if ($elapsed -gt 0 -and [math]::Floor($elapsed) % 30 -eq 0) {
              Write-Host "[$sceneId] Still generating... (${elapsed}s / ${MaxWaitSeconds}s)"
              Add-RunSummaryLine "[Scene $sceneId] Wan2 still generating (${elapsed}s / ${MaxWaitSeconds}s)"
            }
            
            Start-Sleep -Seconds $statusCheckInterval
          }
          
          # Check for timeout
          $finalElapsed = [math]::Round(((Get-Date) - $pollStart).TotalSeconds, 1)
          Add-RunSummaryLine "[Scene $sceneId] Wan2 polling loop exited: completed=$executionCompleted error=$executionError elapsed=${finalElapsed}s"
          
          # CRITICAL: If polling exited without detecting completion, do a final check
          # This handles cases where script was interrupted or status check failed
          if (-not $executionCompleted -and -not $executionError) {
            Write-Host "[$sceneId] Polling exited without completion - performing final status check..." -ForegroundColor Yellow
            try {
              $finalStatus = Check-PromptStatus -ComfyUrl $ComfyUrl -PromptId $promptId
              if ($finalStatus.status -eq 'completed') {
                Write-Host "[$sceneId] ✓ Final check: execution DID complete" -ForegroundColor Green
                Add-RunSummaryLine "[Scene $sceneId] Wan2 final check: execution completed (detected after loop exit)"
                $executionCompleted = $true
              } else {
                Write-Warning "[$sceneId] Timeout after ${finalElapsed}s - execution did not complete (final status: $($finalStatus.status))"
                Add-RunSummaryLine "[Scene $sceneId] Wan2 video generation failed: timeout after ${finalElapsed}s (final status: $($finalStatus.status))"
              }
            } catch {
              Write-Warning "[$sceneId] Final status check failed: $($_.Exception.Message)"
              Add-RunSummaryLine "[Scene $sceneId] Wan2 final status check failed: $($_.Exception.Message)"
            }
          }
          
          # If execution completed successfully, check for video file
          if ($executionCompleted) {
            Write-Host "[$sceneId] Checking for video file..." -ForegroundColor Cyan
            $videoPattern = Join-Path $comfyOutputRoot "video\${sceneId}_*.mp4"
            
            # Wait a moment for file system to sync
            Start-Sleep -Seconds 2
            
            $videos = @(Get-ChildItem -Path $videoPattern -ErrorAction SilentlyContinue)
            
            if ($videos -and $videos.Count -gt 0) {
              $sourceVideo = $videos[0]
              $targetPath = Join-Path $sceneVideoDir "$sceneId.mp4"
              
              try {
                Copy-Item -Path $sourceVideo.FullName -Destination $targetPath -Force -ErrorAction Stop
                
                if (Test-Path $targetPath) {
                  $size = (Get-Item $targetPath).Length
                  
                  if ($size -gt 10240) {  # 10KB minimum for valid video
                    $sizeMB = [math]::Round($size / 1MB, 2)
                    $totalElapsed = [math]::Round(((Get-Date) - $pollStart).TotalSeconds, 1)
                    Write-Host "[$sceneId] ✓ Video copied successfully: $($sourceVideo.Name) (${sizeMB} MB, ${totalElapsed}s total)" -ForegroundColor Green
                    Add-RunSummaryLine "[Scene $sceneId] Wan2 video generation succeeded: $targetPath (${totalElapsed}s, ${sizeMB} MB)"
                    $videoFound = $true
                    
                    # ================================================================
                    # MANIFEST WRITING: Persist generation manifest to disk
                    # ================================================================
                    try {
                      $manifestScript = Join-Path $PSScriptRoot 'write-manifest.ts'
                      if (Test-Path $manifestScript) {
                        # Extract seed from workflow (node 3 KSampler)
                        $manifestSeed = if ($promptPayload.'3' -and $promptPayload.'3'.inputs -and $promptPayload.'3'.inputs.seed) {
                          $promptPayload.'3'.inputs.seed
                        } else { 0 }
                        
                        Write-Host "[$sceneId] Writing generation manifest..." -ForegroundColor Cyan
                        $manifestArgs = @(
                          'tsx',
                          $manifestScript,
                          '--build',
                          '--type', 'video',
                          '--scene', $sceneId,
                          '--workflow-id', 'wan-i2v',
                          '--prompt', ($humanPrompt -replace '"', '\"'),
                          '--negative', ($negativePrompt -replace '"', '\"'),
                          '--seed', $manifestSeed,
                          '--output-dir', $sceneVideoDir,
                          '--video-file', "$sceneId.mp4",
                          '--prompt-id', $promptId,
                          '--comfyui-url', $ComfyUrl,
                          '--project-root', $projectRoot
                        )
                        
                        # Run manifest writer
                        $manifestResult = & $npxCommand @manifestArgs 2>&1
                        if ($LASTEXITCODE -eq 0) {
                          Write-Host "[$sceneId] ✓ Manifest written" -ForegroundColor Green
                          Add-RunSummaryLine "[Scene $sceneId] Manifest persisted to disk"
                        } else {
                          Write-Warning "[$sceneId] Manifest write failed (exit=$LASTEXITCODE): $manifestResult"
                          Add-RunSummaryLine "[Scene $sceneId] Manifest write failed: $manifestResult"
                        }
                      } else {
                        Write-Warning "[$sceneId] Manifest script not found at $manifestScript"
                      }
                    } catch {
                      Write-Warning "[$sceneId] Failed to write manifest: $_"
                      Add-RunSummaryLine "[Scene $sceneId] Manifest write exception: $_"
                    }
                    # ================================================================
                    
                  } else {
                    Write-Warning "[$sceneId] Video file too small ($size bytes) - generation may have failed"
                    Add-RunSummaryLine "[Scene $sceneId] Wan2 video generation failed: file too small ($size bytes)"
                  }
                }
              } catch {
                Write-Warning "[$sceneId] Failed to copy video: $_"
                Add-RunSummaryLine "[Scene $sceneId] Wan2 video generation failed: copy error ($_)"
              }
            } else {
              Write-Warning "[$sceneId] Execution completed but no video file found (likely cached/no-op)"
              Add-RunSummaryLine "[Scene $sceneId] Wan2 execution completed without video output (cached)"
            }
          }
        }
