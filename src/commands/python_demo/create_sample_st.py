# /// script
# dependencies = [
#   "safetensors",
#   "torch",
#   "numpy",
#   "packaging",
# ]
# ///

import torch
from safetensors.torch import save_file
import os

def main():
    tensors = {
        "weight_1": torch.randn(2, 2),
        "bias_1": torch.zeros(2),
        "model.layers.0.weight": torch.ones(3, 3),
        "model.layers.0.bias": torch.randn(3)
    }
    
    save_file(tensors, "sample.safetensors")
    print("Created sample.safetensors")

if __name__ == "__main__":
    main()
