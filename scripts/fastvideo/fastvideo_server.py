"""
FastVideo Local Video Generation Adapter
HTTP service wrapping FastVideo/FastWan2.2-TI2V-5B for gemDirect1 integration
"""
import os
import sys
import json
import base64
import time
import traceback
from pathlib import Path
from typing import Optional, Dict, Any
from io import BytesIO

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field
import uvicorn

# PIL for image handling
try:
    from PIL import Image
except ImportError:
    print("ERROR: PIL/Pillow not installed. Run: pip install pillow")
    sys.exit(1)

# FastVideo imports
try:
    from fastvideo import VideoGenerator, SamplingParam
    from fastvideo.fastvideo_args import FastVideoArgs
    from fastvideo.worker.multiproc_executor import MultiprocExecutor
except ImportError:
    print("ERROR: FastVideo not installed. Run: pip install fastvideo")
    sys.exit(1)

# --- Request/Response Models ---
class GenerateVideoRequest(BaseModel):
    prompt: str = Field(..., description="Human-readable text prompt for video generation")
    negativePrompt: Optional[str] = Field(None, description="Negative prompt to avoid certain features")
    keyframeBase64: Optional[str] = Field(None, description="Base64-encoded keyframe image (for TI2V mode)")
    fps: int = Field(16, ge=8, le=30, description="Frames per second")
    numFrames: int = Field(121, ge=8, le=300, description="Total number of frames to generate")
    width: int = Field(1280, ge=256, le=1920, description="Video width")
    height: int = Field(544, ge=256, le=1080, description="Video height")
    seed: Optional[int] = Field(None, description="Random seed for reproducibility")
    outputDir: str = Field("artifacts/fastvideo", description="Output directory for generated videos")

class GenerateVideoResponse(BaseModel):
    status: str
    outputVideoPath: Optional[str] = None
    frames: Optional[int] = None
    durationMs: Optional[int] = None
    seed: Optional[int] = None
    warnings: list[str] = []
    error: Optional[str] = None

# --- Application Setup ---
app = FastAPI(
    title="FastVideo Adapter for gemDirect1",
    description="HTTP adapter for local FastVideo (FastWan2.2-TI2V-5B) video generation",
    version="1.0.0"
)

# CORS for local dev (React on port 3000, adapter on 8055)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Global generator instance (lazy-loaded)
_generator: Optional[VideoGenerator] = None
_model_id: str = os.environ.get("FASTVIDEO_MODEL_ID", "hao-ai-lab/FastHunyuan-diffusers")

def get_generator() -> VideoGenerator:
    """Lazy-load the VideoGenerator (expensive operation)"""
    global _generator
    if _generator is None:
        print(f"Loading FastVideo model: {_model_id}")
        start = time.time()
        
        # Initialize FastVideoArgs with model_path and num_gpus
        # Note: attention_backend is configured in PipelineConfig (loaded from model)
        args = FastVideoArgs(
            model_path=_model_id,
            num_gpus=1,
            inference_mode=True,
            dit_cpu_offload=True,  # Offload to save VRAM
            vae_cpu_offload=True,
            output_type="pil"
        )
        _generator = VideoGenerator(args, MultiprocExecutor, log_stats=False)
        
        elapsed = time.time() - start
        print(f"Model loaded in {elapsed:.2f}s")
    return _generator

def decode_base64_image(base64_str: str) -> Image.Image:
    """Decode base64 string to PIL Image (strips data URL prefix if present)"""
    if base64_str.startswith("data:"):
        base64_str = base64_str.split(",", 1)[1]
    
    image_data = base64.b64decode(base64_str)
    return Image.open(BytesIO(image_data)).convert("RGB")

# --- Health Check ---
@app.get("/health")
async def health_check():
    """Quick health probe (doesn't load model)"""
    return {
        "status": "ok",
        "service": "fastvideo-adapter",
        "modelId": _model_id,
        "modelLoaded": _generator is not None,
        "attentionBackend": os.environ.get("FASTVIDEO_ATTENTION_BACKEND", "VIDEO_SPARSE_ATTN")
    }

# --- Generate Video Endpoint ---
@app.post("/generate", response_model=GenerateVideoResponse)
async def generate_video(request: GenerateVideoRequest):
    """
    Generate video from text prompt (and optional keyframe image)
    Returns MP4 path and metadata
    """
    start_time = time.time()
    warnings = []
    
    try:
        # Ensure output directory exists
        output_dir = Path(request.outputDir)
        output_dir.mkdir(parents=True, exist_ok=True)
        
        # Load generator (lazy)
        try:
            generator = get_generator()
        except Exception as e:
            raise HTTPException(
                status_code=500,
                detail=f"Failed to load FastVideo model: {str(e)}"
            )
        
        # Handle keyframe image if provided (TI2V mode)
        start_image = None
        if request.keyframeBase64:
            try:
                start_image = decode_base64_image(request.keyframeBase64)
                # Resize if needed to match target resolution
                if start_image.size != (request.width, request.height):
                    warnings.append(f"Keyframe resized from {start_image.size} to ({request.width}, {request.height})")
                    start_image = start_image.resize((request.width, request.height), Image.Resampling.LANCZOS)
            except Exception as e:
                raise HTTPException(
                    status_code=400,
                    detail=f"Failed to decode keyframe image: {str(e)}"
                )
        
        # Build full prompt (combine positive + negative)
        full_prompt = request.prompt
        if request.negativePrompt:
            full_prompt += f"\n\nNegative: {request.negativePrompt}"
        
        # Generate video
        print(f"Generating video: {request.numFrames} frames @ {request.fps} FPS, {request.width}x{request.height}")
        print(f"Prompt: {full_prompt[:100]}...")
        
        try:
            # Build sampling parameters
            sampling_param = SamplingParam(
                prompt=full_prompt,
                num_frames=request.numFrames,
                fps=request.fps,
                width=request.width,
                height=request.height,
                seed=request.seed if request.seed is not None else -1,
                negative_prompt=request.negativePrompt if request.negativePrompt else "",
                image=start_image  # For I2V mode
            )
            
            # Generate video (returns dict or list)
            result = generator.generate_video(sampling_param=sampling_param)
            
            if not result:
                raise Exception("Generator returned empty results")
        except Exception as e:
            error_msg = str(e)
            if "CUDA out of memory" in error_msg or "OutOfMemoryError" in error_msg:
                raise HTTPException(
                    status_code=507,  # Insufficient Storage (closest HTTP code)
                    detail="CUDA OOM: Try reducing numFrames, resolution, or closing other GPU processes"
                )
            elif "No such file" in error_msg or "model" in error_msg.lower():
                raise HTTPException(
                    status_code=500,
                    detail=f"Model not found or corrupted: {error_msg}"
                )
            else:
                raise HTTPException(status_code=500, detail=f"Generation failed: {error_msg}")
        
        duration_ms = int((time.time() - start_time) * 1000)
        
        # FastVideo result is a dict with 'save_path' or video data
        output_path = None
        
        if isinstance(result, dict):
            # Result dict should contain save_path or output_video_path
            output_path = result.get('save_path') or result.get('output_video_path')
            
            if not output_path:
                # Video data returned, need to save manually
                timestamp = int(time.time() * 1000)
                output_filename = f"fastvideo_{timestamp}.mp4"
                output_path = str(output_dir / output_filename)
                
                if 'video' in result:
                    # Save video frames
                    import imageio
                    video_frames = result['video']
                    imageio.mimsave(output_path, video_frames, fps=request.fps)
                else:
                    raise Exception(f"Result dict missing save_path and video data: {result.keys()}")
        
        elif isinstance(result, list):
            # List of video frames
            timestamp = int(time.time() * 1000)
            output_filename = f"fastvideo_{timestamp}.mp4"
            output_path = str(output_dir / output_filename)
            
            import imageio
            imageio.mimsave(output_path, result, fps=request.fps)
        
        else:
            raise Exception(f"Unexpected result type: {type(result)}")
        
        if not Path(output_path).exists():
            raise HTTPException(
                status_code=500,
                detail=f"Video generation succeeded but output file not created: {output_path}"
            )
        
        print(f"Video generated: {output_path} ({duration_ms}ms)")
        
        return GenerateVideoResponse(
            status="complete",
            outputVideoPath=str(output_path),
            frames=request.numFrames,
            durationMs=duration_ms,
            seed=request.seed,
            warnings=warnings
        )
        
    except HTTPException:
        raise
    except Exception as e:
        print(f"ERROR: {traceback.format_exc()}")
        return GenerateVideoResponse(
            status="error",
            error=str(e),
            warnings=warnings
        )

# --- Server Entry Point ---
if __name__ == "__main__":
    port = int(os.environ.get("FASTVIDEO_PORT", "8055"))
    host = os.environ.get("FASTVIDEO_HOST", "127.0.0.1")
    
    print(f"""
╔══════════════════════════════════════════════════════════════╗
║  FastVideo Adapter Server for gemDirect1                     ║
║  Model: {_model_id[:50].ljust(50)} ║
║  Endpoint: http://{host}:{port}{' ' * 37} ║
║  Attention Backend: {os.environ.get('FASTVIDEO_ATTENTION_BACKEND', 'VIDEO_SPARSE_ATTN')[:35].ljust(35)} ║
╚══════════════════════════════════════════════════════════════╝
""")
    
    uvicorn.run(
        app,
        host=host,
        port=port,
        log_level="info"
    )
