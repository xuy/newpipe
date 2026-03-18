# NewPipe 🐚
### Rethinking Unix Pipes for the Agentic Era

**NewPipe is a protocol**, not just a shell. It replaces the 50-year-old "unstructured byte stream" pipe with **Three Orthogonal Planes** — giving processes typed records, bidirectional backpressure, and out-of-band control, in any language.

## The Problem

Unix pipes treat everything as an undifferentiated byte stream. This breaks in predictable ways:

```bash
# Binary data hits a text tool — silently corrupted
cat model.safetensors | grep "layer" | wc -l      # nonsense result

# No record boundaries — where does one record end and the next begin?
cat data.parquet | head -5                         # 5 lines of binary garbage

# Pipeline is slow — is it the producer? The consumer? No way to tell.
fast-producer | slow-consumer                      # just hangs. which one? good luck.

# A stage has a bug mid-stream — you have to kill the whole pipeline and start over
long-stream | buggy-transform | downstream         # can't swap the middle while it runs
```

- **No record boundaries.** Pipes see bytes, not records. A binary payload gets split at arbitrary points.
- **No type awareness.** A Parquet file piped through `grep` isn't filtering records — it's corrupting a binary format.
- **No observability.** A pipeline stalls and you can't tell which stage is slow — there's no signaling between stages.
- **No hot-swap.** A bug in the middle of a long-running pipeline means killing everything and restarting from scratch.

## The Three Planes

NewPipe decomposes process communication into three strictly separated physical channels:

```
             ┌────────────────┐              ┌────────────────┐
             │    Producer    │              │    Consumer    │
             │                │              │                │
 FD 0/1      │ ╔════════════╗ │   records    │ ╔════════════╗ │
 Data Plane  │ ║ [len][pay] ╠═╪═════════════►╪═╣ [len][pay] ║ │
             │ ╚════════════╝ │              │ ╚════════════╝ │
             │                │              │                │
 FD 3        │ ┌────────────┐ │    NDJSON    │ ┌────────────┐ │
 Control     │ │  HELO ACK  │◄╪════════════►╪►│PAUSE RESUME│ │
             │ └────────────┘ │              │ └────────────┘ │
             │                │              │                │
 FD 2        │ stderr ────────╪──────────────╪───────────     │
 Diagnostic  │ (human logs)   │              │                │
             └────────────────┘              └────────────────┘
```

1. **Data Plane (FD 0/1):** Framed binary records — `[PayloadLength(4)][PayloadBytes]`. No process ever has to guess where a record ends.
2. **Control Plane (FD 3):** Bidirectional NDJSON. Type negotiation (`HELO/ACK`), backpressure (`PAUSE/RESUME`), and lifecycle (`STOP/ERROR`).
3. **Diagnostic Plane (FD 2):** Human-readable logs. Never interferes with the data stream.

## Why It Matters

- **Bidirectional Backpressure.** A slow consumer sends `PAUSE` upstream — the producer halts at the source. No overflow. No data loss.
- **Polyglot Pipelines.** Mix Node.js, Python, Rust, and legacy Unix tools in one pipeline. NewPipe auto-injects `lift`/`lower` adapters at language boundaries.
- **Modern Data Native.** Parquet, Safetensors, and binary formats are first-class record streams — not text hacks.
- **Language-Blind Shell.** The kernel discovers commands via `NEWPIPE_PATH`, not file extensions. A command is "smart" if it speaks on FD 3, regardless of what language it's written in.

## Quick Start

```bash
# Install & build
npm install && npm run build

# Try it
./newpipe "ls | head 2"
./newpipe "pcat train.parquet | grep Madison | head 1"
./newpipe "gen | slow"   # watch backpressure in action
```

## Demos

| Demo | Command | What You'll See |
| :--- | :--- | :--- |
| **Polyglot** | `pcat data.parquet \| grep Madison` | Python reads Parquet, adapters bridge to TypeScript grep — seamlessly. |
| **Backpressure** | `gen \| slow` | The Signal Plane lights up: PAUSE/RESUME flow in real time. |
| **Tensor Forge** | `st-gen \| to-st demo.st` | Binary Safetensors weights synthesized from metadata records. |

## Write Your Own Command

Any executable that speaks the three-plane protocol is a NewPipe command. Here's one in Python using the SDK:

```python
#!/usr/bin/env python3
from newpipe import NewPipe

pipe = NewPipe(mime_type="application/json")
pipe.wait_for_ready()

for i in range(100):
    pipe.emit({"index": i, "msg": f"record #{i}"})
```

That's it. The SDK handles framing, handshake, and backpressure. Drop the file anywhere on `NEWPIPE_PATH` and it's composable with every other command:

```bash
./newpipe "my-command | grep record | head 5"
```

## SDKs

NewPipe is a protocol first. Join the ecosystem in any language:

| Language | Location | Status |
| :--- | :--- | :--- |
| **Node.js** | `src/core/` | Native integration |
| **Python** | `sdk/python/newpipe.py` | Full SDK — signals, framing, backpressure |
| **Rust** | `sdk/rust/` | Full SDK — thread-safe signals, serde integration |

## Architecture

```
newpipe "pcat data.parquet | grep Madison | head 1"

  Shell (Switchboard)
    │
    ├─ pcat (Python, Smart)     ← HELO "application/x-parquet" →
    │     │
    │     ├─ [auto: lower]      ← Smart-to-Legacy adapter
    │     │
    ├─ grep (Legacy Unix)       ← plain text stdin/stdout
    │     │
    │     ├─ [auto: lift]       ← Legacy-to-Smart adapter
    │     │
    ├─ head (TypeScript, Smart) ← HELO/ACK on FD 3
    │     │
    │     ├─ [auto: view]       ← pretty-prints to terminal
    │
    └─ Done.
```

The shell is a pure switchboard: it routes signals between adjacent smart stages, injects adapters at smart/legacy boundaries, and appends `view` when a smart pipeline ends at the terminal.

---

*NewPipe is a protocol. The shell is the reference implementation. The pipe is no longer a straw — it is a bridge.*

*Created by an Agent, for Agents.*
