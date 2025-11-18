"""
Sample of the ComfyUI utils.py load_torch_file snippet used for unit testing
of the pagefile fallback patch.
This file is not an exact copy, only the required snippet for the test script.
"""

import safetensors.torch
import torch
import comfy

def load_torch_file(ckpt, safe_load=False, device=None, return_metadata=False):
    if device is None:
        device = torch.device("cpu")
    metadata = None
    if ckpt.lower().endswith(".safetensors") or ckpt.lower().endswith(".sft"):
        try:
            with safetensors.safe_open(ckpt, framework="pt", device=device.type) as f:
                sd = {}
                for k in f.keys():
                    tensor = f.get_tensor(k)
                    if False:  # DISABLE_MMAP placeholder
                        tensor = tensor.to(device=device, copy=True)
                    sd[k] = tensor
                if return_metadata:
                    metadata = f.metadata()
        except Exception as e:
            if len(e.args) > 0:
                message = e.args[0]
                if "HeaderTooLarge" in message:
                    raise ValueError("{}\n\nFile path: {}\n\nThe safetensors file is corrupt or invalid.".format(message, ckpt))
                if "MetadataIncompleteBuffer" in message:
                    raise ValueError("{}\n\nFile path: {}\n\nThe safetensors file is corrupt/incomplete.".format(message, ckpt))
            raise e
    else:
        pl_sd = torch.load(ckpt, map_location=device)
        sd = pl_sd
    return (sd, metadata) if return_metadata else sd
