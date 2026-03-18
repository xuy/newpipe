# /// script
# dependencies = [
#   "safetensors",
#   "torch",
#   "numpy",
#   "packaging",
# ]
# ///

import sys
import os
import torch
from safetensors.torch import save_file

# SDK setup
sys.path.append(os.path.join(os.path.dirname(__file__), '../../sdk/python'))
from newpipe import NewPipe

def main():
    if len(sys.argv) < 2:
        print("Usage: ... | to-st <output.safetensors>", file=sys.stderr)
        sys.exit(1)

    output_path = sys.argv[1]
    pipe = NewPipe()
    
    # Accept any incoming type
    pipe.signals.on_signal(lambda s: pipe.signals.send("ACK") if s.get("type") == "HELO" else None)

    tensors = {}
    print(f"Collecting records to save into {output_path}...", file=sys.stderr)

    for record in pipe.records():
        name = record.get("name", f"tensor_{len(tensors)}")
        shape = record.get("shape", [1])
        
        # Create a dummy tensor based on the metadata record
        tensors[name] = torch.randn(*shape)
        
        if len(tensors) % 5 == 0:
            print(f"  Added {len(tensors)} tensors...", file=sys.stderr)

    if tensors:
        save_file(tensors, output_path)
        print(f"Successfully saved {len(tensors)} tensors to {output_path}", file=sys.stderr)
    else:
        print("No tensors collected.", file=sys.stderr)

if __name__ == "__main__":
    main()
