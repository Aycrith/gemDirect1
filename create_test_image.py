#!/usr/bin/env python3
"""Create a simple test image for ComfyUI workflow testing."""

from PIL import Image, ImageDraw
import os

# Create a simple test image (576x1024 to match SVD requirements)
img = Image.new('RGB', (576, 1024), color='white')
draw = ImageDraw.Draw(img)

# Draw some basic shapes to make it non-trivial
draw.rectangle([100, 100, 476, 400], fill='blue', outline='black', width=2)
draw.ellipse([200, 500, 376, 676], fill='red', outline='black', width=2)
draw.polygon([(288, 750), (100, 900), (476, 900)], fill='green', outline='black')

# Add text
draw.text((200, 920), "Test Image for ComfyUI", fill='black')

# Save to ComfyUI input folder
output_path = r"C:\ComfyUI\ComfyUI_windows_portable\ComfyUI\input\test_keyframe.jpg"
os.makedirs(os.path.dirname(output_path), exist_ok=True)
img.save(output_path, quality=95)

print(f"✅ Test image created: {output_path}")
print(f"✅ Size: {img.size}")
print(f"✅ Format: JPEG")
