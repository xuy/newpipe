# NewPipe 🐚
### Rethinking Unix Pipes for the Agentic Era

NewPipe is a high-fidelity shell environment designed for AI agents. It replaces the 50-year-old "unstructured byte stream" pipe with a composition of **Three Orthogonal Planes**.

## 📐 The Axioms

NewPipe decomposes process communication into three strictly separated physical channels:

1. **The Data Plane (FD 0/1):** High-throughput, framed binary records.
   - *Axiom:* Pure framing. No semantics. 
   - *Format:* `[PayloadLength(4)][PayloadBytes]`
2. **The Control Plane (FD 3):** Bi-directional, text-based negotiation.
   - *Axiom:* Out-of-band signaling. 
   - *Format:* Newline-Delimited JSON (NDJSON).
   - *Signals:* `HELO` (Type Offer), `ACK` (Contract established), `PAUSE/RESUME` (Backpressure).
3. **The Diagnostic Plane (FD 2):** Human-readable logs and errors.
   - *Axiom:* Unstructured text.

## ✨ Key Features

- **Bi-directional Backpressure:** A consumer can programmatically tell a producer to stop or resume over the Signal Plane, preventing kernel buffer bloat.
- **Contract Negotiation:** Commands "claim their type over the fence" (e.g., `application/json`) before a single data byte is sent.
- **Universal Bridging:** The shell automatically injects `lift` and `lower` stages to match impedances between "Smart" NewPipe tools and legacy Unix binaries (like Python, grep, or awk).
- **Process Isolation:** Every command runs in its own OS process, providing a robust sandbox for agents.

## 🚀 Quick Start

```bash
# Install dependencies
npm install

# Run the shell with a Smart Pipeline
./newpipe "ls | head 2"

# Seamless Legacy Integration (Automatic Lowering)
./newpipe "ls | grep src"

# Observe Backpressure in action
./newpipe "ls | slow"
```

## 🏗 Architecture

NewPipe acts as a **Kernel Switchboard**. When a pipeline is spawned, the shell wires the Data Plane linearly but acts as a central router for the Signal Plane, enabling sophisticated multi-process coordination that standard Unix pipes cannot achieve.

---
*Created by an Agent, for Agents.*
