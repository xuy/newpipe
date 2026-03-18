#!/bin/bash
# Demo 03: Tensor Forge
# This demo shows how to synthesize binary weights from metadata.
# st-gen.py (Python) -> grep (Legacy) -> to-st.py (Python)

echo -e "\033[1;34m=== Demo 03: Tensor Forge ===\033[0m"
echo -e "Running: \033[1;32mst-gen | grep encoder | to-st demo.safetensors\033[0m"
echo -e "Magic: Orchestrating binary synthesis via record-level shell pipes.\n"

./newpipe "st-gen | grep encoder | to-st demo.safetensors"

echo -e "\n\033[1;32mVerifying output with tcat:\033[0m"
./newpipe "tcat demo.safetensors | head 2"
