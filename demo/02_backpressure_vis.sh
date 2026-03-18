#!/bin/bash
# Demo 02: Backpressure Visualization
# This demo shows the bi-directional Signal Plane in action.
# gen.py (Python) -> slow (TypeScript)

echo -e "\033[1;34m=== Demo 02: Backpressure Visualization ===\033[0m"
echo -e "Running: \033[1;32mgen | slow\033[0m"
echo -e "Magic: Watch the consumer send 'PAUSE' backwards to the Python producer.\n"

./newpipe "gen | slow"
