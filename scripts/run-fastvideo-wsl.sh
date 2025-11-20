#!/bin/bash
# FastVideo WSL2 Server Launcher
# Runs FastVideo server in WSL2 with proper environment

set -e

# Configuration
VENV_PATH="/mnt/c/Dev/gemDirect1/fastvideo-env-wsl"
SERVER_SCRIPT="/mnt/c/Dev/gemDirect1/scripts/fastvideo/fastvideo_server.py"
MODEL_ID="hao-ai-lab/FastWan-5B"
HOST="0.0.0.0"  # Listen on all interfaces so Windows can access
PORT="${1:-8055}"  # Default port 8055, or pass as argument

echo "════════════════════════════════════════════════════════"
echo "  FastVideo Server (WSL2)"
echo "════════════════════════════════════════════════════════"
echo ""

# Check virtual environment exists
if [ ! -d "$VENV_PATH" ]; then
    echo "✗ Virtual environment not found at: $VENV_PATH"
    echo "  Run setup first: wsl bash /mnt/c/Dev/gemDirect1/scripts/setup-fastvideo-wsl.sh"
    exit 1
fi

# Activate virtual environment
echo "Activating virtual environment..."
source "$VENV_PATH/bin/activate"

# Check FastVideo is installed
if ! python3 -c "from fastvideo import VideoGenerator" 2>/dev/null; then
    echo "✗ FastVideo not installed in virtual environment"
    echo "  Run setup first: wsl bash /mnt/c/Dev/gemDirect1/scripts/setup-fastvideo-wsl.sh"
    exit 1
fi

echo "✓ FastVideo installed"

# Check CUDA availability
if python3 -c "import torch; exit(0 if torch.cuda.is_available() else 1)" 2>/dev/null; then
    GPU_NAME=$(python3 -c "import torch; print(torch.cuda.get_device_name(0))" 2>/dev/null)
    echo "✓ CUDA available: $GPU_NAME"
else
    echo "⚠ CUDA not available - using CPU (slow)"
fi

# Set environment variables
export FASTVIDEO_MODEL_ID="$MODEL_ID"
export FASTVIDEO_HOME="/mnt/c/Users/camer/fastvideo"
export FASTVIDEO_ATTENTION_BACKEND="sdpa"

# Create output directory
mkdir -p "$FASTVIDEO_HOME"

echo ""
echo "Configuration:"
echo "  Model: $MODEL_ID"
echo "  Host: $HOST"
echo "  Port: $PORT"
echo "  Cache: $FASTVIDEO_HOME"
echo ""
echo "════════════════════════════════════════════════════════"
echo "  Starting Server"
echo "════════════════════════════════════════════════════════"
echo ""
echo "Access from Windows:"
echo "  http://localhost:$PORT"
echo "  http://127.0.0.1:$PORT"
echo ""
echo "Press Ctrl+C to stop"
echo ""

# Run server
cd /mnt/c/Dev/gemDirect1
export FASTVIDEO_HOST="$HOST"
export FASTVIDEO_PORT="$PORT"
python3 "$SERVER_SCRIPT"
