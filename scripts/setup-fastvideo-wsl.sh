#!/bin/bash
# FastVideo WSL2 Setup Script
# Installs FastVideo in WSL2 Ubuntu environment

set -e

echo "════════════════════════════════════════════════════════"
echo "  FastVideo WSL2 Setup"
echo "════════════════════════════════════════════════════════"
echo ""

# Check Python version
echo "Checking Python version..."
if ! command -v python3 &> /dev/null; then
    echo "✗ Python3 not found. Installing..."
    sudo apt update
    sudo apt install -y python3 python3-pip python3-venv
fi

PYTHON_VERSION=$(python3 --version | cut -d' ' -f2 | cut -d'.' -f1,2)
echo "✓ Python $PYTHON_VERSION"

# Check for CUDA (optional but recommended)
if command -v nvidia-smi &> /dev/null; then
    echo "✓ NVIDIA GPU detected:"
    nvidia-smi --query-gpu=name --format=csv,noheader
else
    echo "⚠ NVIDIA GPU not detected - will use CPU (slow)"
fi

# Create virtual environment in WSL
VENV_PATH="/mnt/c/Dev/gemDirect1/fastvideo-env-wsl"
echo ""
echo "Creating virtual environment at: $VENV_PATH"

if [ -d "$VENV_PATH" ]; then
    echo "⚠ Virtual environment exists, removing..."
    rm -rf "$VENV_PATH"
fi

python3 -m venv "$VENV_PATH"
source "$VENV_PATH/bin/activate"

echo "✓ Virtual environment created"
echo ""

# Upgrade pip
echo "Upgrading pip..."
pip install --upgrade pip

# Install PyTorch with CUDA support (if available)
echo ""
echo "Installing PyTorch..."
if command -v nvidia-smi &> /dev/null; then
    echo "Installing PyTorch with CUDA 11.8..."
    pip install torch torchvision --index-url https://download.pytorch.org/whl/cu118
else
    echo "Installing PyTorch CPU version..."
    pip install torch torchvision
fi

# Install FastVideo and dependencies
echo ""
echo "Installing FastVideo..."
pip install sentencepiece  # Pre-install to avoid build issues
pip install --no-deps fastvideo
pip install fastapi uvicorn pillow accelerate diffusers einops imageio imageio-ffmpeg \
    moviepy peft huggingface_hub transformers datasets scipy h5py requests tokenizers \
    cloudpickle opencv-python protobuf loguru torchdata gradio wandb wheel pytest \
    remote-pdb timm gpustat flask-restful av

echo ""
echo "Testing FastVideo import..."
python3 -c "from fastvideo import VideoGenerator, SamplingParam; print('✓ FastVideo imported successfully')"

# Verify CUDA (if available)
if command -v nvidia-smi &> /dev/null; then
    python3 -c "import torch; print('✓ CUDA available:', torch.cuda.is_available())"
fi

echo ""
echo "════════════════════════════════════════════════════════"
echo "  Setup Complete"
echo "════════════════════════════════════════════════════════"
echo ""
echo "Virtual environment: $VENV_PATH"
echo "Activate with: source $VENV_PATH/bin/activate"
echo ""
echo "Start server with:"
echo "  wsl bash /mnt/c/Dev/gemDirect1/scripts/run-fastvideo-wsl.sh"
echo ""
