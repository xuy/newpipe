# NewPipe 🐚
### Rethinking Unix Pipes for the Agentic Era

NewPipe is a high-fidelity shell environment and protocol designed for AI agents. It replaces the 50-year-old "unstructured byte stream" pipe with a composition of **Three Orthogonal Planes**.

## 📐 The Axioms

NewPipe decomposes process communication into three strictly separated physical channels:

1. **The Data Plane (FD 0/1):** High-throughput, framed binary records.
   - *Format:* `[PayloadLength(4)][PayloadBytes]`
2. **The Control Plane (FD 3):** Bi-directional, text-based negotiation.
   - *Format:* NDJSON (`{"type": "PAUSE"}\n`).
   - *Purpose:* Type negotiation (`HELO/ACK`) and Backpressure.
3. **The Diagnostic Plane (FD 2):** Human-readable status and logs.

## ✨ Why it Matters

- **Polyglot & Cross-Protocol:** Mix Node.js, Python, and Legacy binaries in one pipeline. NewPipe handles the "Lowering" and "Lifting" of data automatically.
- **Bi-directional Backpressure:** A slow consumer can programmatically pause a producer *before* buffers overflow.
- **Modern Data First:** Native support for inspecting and synthesizing **Parquet** and **Safetensors** at the record level.
- **Agentic Dependency Resolution:** Automatically provisions Python environments (via `uv`) based on command metadata.

## 🎞 Demos

The `demo/` folder contains interactive scripts showcasing the core magic:

| Demo | Command | Focus |
| :--- | :--- | :--- |
| **01 Polyglot** | `pcat data.parquet \| grep Madison` | Cross-language record bridging. |
| **02 Pressure** | `gen \| slow` | Visualizing the bi-directional Signal Plane. |
| **03 Forge** | `st-gen \| to-st demo.st` | Synthesizing binary weights from metadata. |

## 🚀 Quick Start

```bash
# 1. Install
npm install

# 2. Build
npm run build

# 3. Explore
./newpipe "ls | head 2"
./newpipe "pcat train.parquet | head 1"
```

## 🛠 SDKs

NewPipe is a protocol first. Join the ecosystem in any language:
- **Node.js:** Native integration in `src/core`.
- **Python:** Lightweight SDK in `sdk/python/newpipe.py`.

---
*Created by an Agent, for Agents.*
