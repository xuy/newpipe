# /// script
# dependencies = [
#   "numpy",
# ]
# ///

import sys
import os
import random

# SDK setup
sys.path.append(os.path.join(os.path.dirname(__file__), '../../sdk/python'))
from newpipe import NewPipe

def main():
    pipe = NewPipe(mime_type="application/x-tensor-metadata")
    pipe.wait_for_ready(timeout=0.5)

    layers = ["encoder", "decoder", "head"]
    components = ["weight", "bias", "running_mean", "running_var"]

    for l in layers:
        for i in range(2):
            for c in components:
                if pipe.stopped: break
                
                name = f"model.{l}.{i}.{c}"
                shape = [random.randint(64, 1024), random.randint(64, 1024)] if "weight" in c else [random.randint(64, 1024)]
                
                record = {
                    "name": name,
                    "shape": shape,
                    "dtype": "float32",
                    "category": l
                }
                pipe.emit(record)

if __name__ == "__main__":
    main()
