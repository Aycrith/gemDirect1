"""
Sample of the ComfyUI utils.py load_torch_file snippet used for unit testing
of the pagefile fallback patch.
This file is not an exact copy, only the required snippet for the test script.
"""
import logging


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

                    try:
                        is_win_1455 = isinstance(e, OSError) and (getattr(e, "winerror", None) == 1455 or getattr(e, "errno", None) == 1455)
                    except Exception:
                        is_win_1455 = False
                    
                    if is_win_1455:
                        logging.warning("safetensors.safe_open failed due to OS error 1455 (paging file). Trying CPU fallback (safetensors.torch.load_file) and then torch.load as a last resort.")
                    
                        try:
                            sd_cpu = safetensors.torch.load_file(ckpt, device="cpu")
                            sd = {}
                            for k in sd_cpu.keys():
                                tensor = sd_cpu[k]
                                if device.type != "cpu":
                                    try:
                                        tensor = tensor.to(device=device, non_blocking=True)
                                    except Exception:
                                        pass
                                sd[k] = tensor
                            if return_metadata:
                                metadata = None
                            logging.info("safetensors CPU fallback succeeded.")
                            return (sd, metadata) if return_metadata else sd
                        except Exception as e2:
                            logging.warning(f"safetensors.load_file fallback failed: {e2!s}")
                    
                        try:
                            logging.info(f"Trying torch.load map_location='cpu' fallback for: {ckpt}")
                            torch_args = {}
                            if MMAP_TORCH_FILES:
                                torch_args["mmap"] = False
                            if safe_load or ALWAYS_SAFE_LOAD:
                                pl_sd = torch.load(ckpt, map_location=torch.device("cpu"), weights_only=True, **torch_args)
                            else:
                                pl_sd = torch.load(ckpt, map_location=torch.device("cpu"), pickle_module=comfy.checkpoint_pickle, **torch_args)
                    
                            if "state_dict" in pl_sd:
                                sd = pl_sd["state_dict"]
                            else:
                                if len(pl_sd) == 1:
                                    key = list(pl_sd.keys())[0]
                                    sd = pl_sd[key]
                                else:
                                    sd = pl_sd
                    
                            if device.type != "cpu":
                                for k in list(sd.keys()):
                                    try:
                                        sd[k] = sd[k].to(device=device, non_blocking=True)
                                    except Exception:
                                        pass
                    
                            if return_metadata:
                                metadata = None
                            logging.info("torch.load fallback succeeded.")
                            return (sd, metadata) if return_metadata else sd
                        except Exception as e3:
                            logging.error(f"Both safetensors and torch fallback paths failed: {e3!s}")

                    try:
                        is_win_1455 = isinstance(e, OSError) and (getattr(e, "winerror", None) == 1455 or getattr(e, "errno", None) == 1455)
                    except Exception:
                        is_win_1455 = False
                    
                    if is_win_1455:
                        logging.warning("safetensors.safe_open failed due to OS error 1455 (paging file). Trying CPU fallback (safetensors.torch.load_file) and then torch.load as a last resort.")
                    
                        try:
                            sd_cpu = safetensors.torch.load_file(ckpt, device="cpu")
                            sd = {}
                            for k in sd_cpu.keys():
                                tensor = sd_cpu[k]
                                if device.type != "cpu":
                                    try:
                                        tensor = tensor.to(device=device, non_blocking=True)
                                    except Exception:
                                        pass
                                sd[k] = tensor
                            if return_metadata:
                                metadata = None
                            logging.info("safetensors CPU fallback succeeded.")
                            return (sd, metadata) if return_metadata else sd
                        except Exception as e2:
                            logging.warning(f"safetensors.load_file fallback failed: {e2!s}")
                    
                        try:
                            logging.info(f"Trying torch.load map_location='cpu' fallback for: {ckpt}")
                            torch_args = {}
                            if MMAP_TORCH_FILES:
                                torch_args["mmap"] = False
                            if safe_load or ALWAYS_SAFE_LOAD:
                                pl_sd = torch.load(ckpt, map_location=torch.device("cpu"), weights_only=True, **torch_args)
                            else:
                                pl_sd = torch.load(ckpt, map_location=torch.device("cpu"), pickle_module=comfy.checkpoint_pickle, **torch_args)
                    
                            if "state_dict" in pl_sd:
                                sd = pl_sd["state_dict"]
                            else:
                                if len(pl_sd) == 1:
                                    key = list(pl_sd.keys())[0]
                                    sd = pl_sd[key]
                                else:
                                    sd = pl_sd
                    
                            if device.type != "cpu":
                                for k in list(sd.keys()):
                                    try:
                                        sd[k] = sd[k].to(device=device, non_blocking=True)
                                    except Exception:
                                        pass
                    
                            if return_metadata:
                                metadata = None
                            logging.info("torch.load fallback succeeded.")
                            return (sd, metadata) if return_metadata else sd
                        except Exception as e3:
                            logging.error(f"Both safetensors and torch fallback paths failed: {e3!s}")
                    raise ValueError("{}\n\nFile path: {}\n\nThe safetensors file is corrupt or invalid.".format(message, ckpt))
                if "MetadataIncompleteBuffer" in message:
                    raise ValueError("{}\n\nFile path: {}\n\nThe safetensors file is corrupt/incomplete.".format(message, ckpt))
            raise e
    else:
        pl_sd = torch.load(ckpt, map_location=device)
        sd = pl_sd
    return (sd, metadata) if return_metadata else sd


