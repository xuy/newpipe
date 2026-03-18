#!/bin/bash
# Demo 01: The Polyglot Pipeline
# This demo shows a single pipeline mixing 3 languages and legacy tools.
# pcat (Python) -> grep (Legacy C) -> head (TypeScript) -> view (TypeScript)

echo -e "\033[1;34m=== Demo 01: The Polyglot Pipeline ===\033[0m"
echo -e "Running: \033[1;32mpcat data.parquet | grep Madison | head 1\033[0m"
echo -e "Magic: NewPipe automatically 'lowers' Python records to text for grep, then 'lifts' them back for head.\n"

./newpipe "pcat train-00000-of-00011.parquet | grep Madison | head 1"
