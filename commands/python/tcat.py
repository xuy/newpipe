#!/usr/bin/env -S uv run

# /// script
# dependencies = [
#   "safetensors",
#   "torch",
# ]
# ///

import sys
import os
import json

# SDK setup
from newpipe import NewPipe

def main():
    if len(sys.argv) < 2:
        print("Usage: tcat <file.safetensors>", file=sys.stderr)
        sys.exit(1)

    file_path = sys.argv[1]
    pipe = NewPipe(mime_type="application/x-safetensors")
    pipe.wait_for_ready(timeout=0.5)

    try:
        from safetensors import safe_open
        import torch
        
        with safe_open(file_path, framework="pt", device="cpu") as f:
            tensor_names = f.keys()
            
            for name in tensor_names:
                if pipe.stopped: break
                
                slice_obj = f.get_slice(name)
                
                record = {
                    "name": name,
                    "shape": slice_obj.get_shape(),
                    "dtype": "torch.float32", # simple assumption for demo
                    "size_bytes": os.path.getsize(file_path)
                }
                pipe.emit(record)
                
    except Exception as e:
        pipe.signals.send("ERROR", payload=str(e))
        sys.exit(1)

if __name__ == "__main__":
    main()
