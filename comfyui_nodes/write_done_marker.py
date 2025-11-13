"""Write-done-marker helper for ComfyUI workflows

This file provides a small, dependency-free helper that writes a
producer-style done marker using the atomic tmp->rename semantic used by
the repo ("<prefix>.done.tmp" -> "<prefix>.done").

Usage options:
- Copy this file into your ComfyUI installation under `custom_nodes/`
  and call `write_done_marker(output_dir, prefix, frame_count)` from a
  Script node, or
- Run it as a standalone script from the host with the CLI shown below
  (useful for invoking via a shell node or scheduler):

    python write_done_marker.py --output-dir "C:/ComfyUI/ComfyUI_windows_portable/ComfyUI/output" --prefix gemdirect1_scene-001 --frames 25

Notes:
- The implementation uses os.replace() which is atomic when the tmp and
  final file are on the same filesystem. If the rename fails we fall back
  to a safe write of the final file and attempt to clean up the tmp file.
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import time
from typing import Optional


def iso_now() -> str:
    # Always use UTC / Z suffix to match telemetry ISO8601 expectations
    return time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())


def write_done_marker(output_dir: str, prefix: str, frame_count: Optional[int] = None, tmp_ext: str = '.tmp') -> bool:
    os.makedirs(output_dir, exist_ok=True)
    final_name = f"{prefix}.done"
    tmp_name = f"{prefix}.done{tmp_ext}"
    final_path = os.path.join(output_dir, final_name)
    tmp_path = os.path.join(output_dir, tmp_name)

    payload = {"Timestamp": iso_now()}
    if frame_count is not None:
        payload["FrameCount"] = frame_count

    # Write to a tmp file first and fsync to reduce the chance of partial
    # observers. Then atomically replace the final path with os.replace.
    try:
        with open(tmp_path, 'w', encoding='utf-8') as f:
            json.dump(payload, f)
            f.flush()
            try:
                os.fsync(f.fileno())
            except Exception:
                # os.fsync may not be available on some platforms; ignore
                pass

        # os.replace is atomic on most platforms when src/dst are on same
        # filesystem and will atomically overwrite the destination.
        os.replace(tmp_path, final_path)
        print(f"[WriteDoneMarker] Created done marker atomically: {final_path}")
        return True
    except Exception as exc:
        print(f"[WriteDoneMarker] Atomic rename failed: {exc}; falling back to direct write.")
        try:
            with open(final_path, 'w', encoding='utf-8') as f:
                json.dump(payload, f)
            # Try to remove tmp file if it still exists
            try:
                if os.path.exists(tmp_path):
                    os.remove(tmp_path)
            except Exception:
                pass
            print(f"[WriteDoneMarker] Created done marker with fallback write: {final_path}")
            return True
        except Exception as exc2:
            print(f"[WriteDoneMarker] Failed to write final marker: {exc2}")
            return False


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description='Write a producer-style done marker (atomic tmp->done)')
    parser.add_argument('--output-dir', required=True, help='Directory where the output frames and marker should be written')
    parser.add_argument('--prefix', required=True, help='Filename prefix to use for the marker (e.g. gemdirect1_scene-001)')
    parser.add_argument('--frames', type=int, default=None, help='Optional frame count to include in the marker payload')
    parser.add_argument('--tmp-ext', default='.tmp', help='Temporary extension used during atomic write (default: .tmp)')
    args = parser.parse_args(argv)

    ok = write_done_marker(args.output_dir, args.prefix, args.frames, args.tmp_ext)
    return 0 if ok else 2


if __name__ == '__main__':
    raise SystemExit(main())
