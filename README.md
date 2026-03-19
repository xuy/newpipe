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

# Pipeline stalls — is it the producer or the consumer? No way to tell.
python generate.py | gzip -9 | aws s3 cp - s3://b  # hanging. which stage? good luck.

# A stage has a bug mid-stream — you have to kill everything and start over
tail -f /var/log/app.log | sed 's/foo/bar/' | tee out.log  # sed wrong? kill, fix, re-run. logs lost.
```

- **No record boundaries.** Pipes see bytes, not records. A binary payload gets split at arbitrary points.
- **No type awareness.** A Parquet file piped through `grep` isn't filtering records — it's corrupting a binary format.
- **No observability.** A pipeline stalls and you can't tell which stage is slow — there's no signaling between stages.
- **No hot-swap.** A bug in the middle of a long-running pipeline means killing everything and restarting from scratch.

## The Three Planes

NewPipe decomposes process communication into three strictly separated physical channels:

```
            +------------------+                +------------------+
            |    Producer      |                |    Consumer      |
            |                  |                |                  |
            |  +------------+  |    records     |  +------------+  |
 FD 0/1     |  | [len][pay] |--+--------------->+--| [len][pay] |  |
 Data       |  +------------+  |                |  +------------+  |
            |                  |                |                  |
            |  +------------+  |    NDJSON      |  +------------+  |
 FD 3       |  | HELO  ACK  |<-+-------------->-+->|PAUSE RESUME|  |
 Control    |  +------------+  |                |  +------------+  |
            |                  |                |                  |
 FD 2       |  stderr ---------+----------------+----------        |
 Diagnostic |  (human logs)    |                |                  |
            +------------------+                +------------------+
```

1. **Data Plane (FD 0/1):** A continuous stream of length-prefixed frames — `[len(4)][payload][len(4)][payload]...`. Each record is self-delimiting. No process ever has to guess where one ends and the next begins.
2. **Control Plane (FD 3):** Bidirectional NDJSON. Type negotiation (`HELO/ACK`), backpressure (`PAUSE/RESUME`), and lifecycle (`STOP/ERROR`).
3. **Diagnostic Plane (FD 2):** Logs readable by both humans and agents. An operator sees status; an agent parses diagnostics to reason about the pipeline. Never interferes with the data stream.

## Why Now

Three things changed since the Unix pipe was invented in 1973:

### Data got multimodal
We work with Parquet files, tensor weights, Arrow batches, images, embeddings — not ASCII text. Data also got bigger and more structured. Piping a Parquet file through `grep` isn't filtering; it's corruption. NewPipe treats all formats as first-class framed record streams, with each stage declaring its content type.

### AI is useless without context
AI agents are powerful reasoners but terrible guessers. A black-box pipe that returns an opaque byte stream and a return code gives an agent nothing to reason about. NewPipe's control plane exposes typed contracts (`HELO/ACK`), flow state (`PAUSE/RESUME`), and structured diagnostics — turning every pipeline into something an agent can observe, understand, and act on.

### AI can reside inside the pipe
An LLM is just another transform — records in, records out. In NewPipe, an `llm` command is a regular pipeline stage. When inference is slow, upstream PAUSEs. When the prompt needs schema context, the control plane provides it. Classical tools and AI compose freely:

```bash
pcat invoices.parquet | llm "flag suspicious entries" | grep suspicious | view
```

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

**SQL-like queries on Parquet — through pipes:**

```bash
# Top 5 cities by population
pcat data.parquet | groupby city | sort count desc | head 5

# People over 30 in Chicago
pcat data.parquet | filter city Chicago | filter age gt 30 | count

# Average age per city, sorted
pcat data.parquet | groupby city age | sort mean_age desc | head 10

# Project columns, youngest first
pcat data.parquet | filter city Chicago | sort age | cols city,age,occupation | arrow-lower | head 5

# Distinct occupations
pcat data.parquet | unique occupation | count
```

**More demos:**

| Demo | Command | What You'll See |
| :--- | :--- | :--- |
| **Polyglot** | `pcat data.parquet \| grep Madison` | Parquet reader and text grep composed seamlessly via adapters. |
| **Backpressure** | `gen \| slow` | PAUSE/RESUME signals flow in real time. |
| **Tensor Forge** | `st-gen \| to-st demo.st` | Binary Safetensors weights synthesized from metadata records. |

## Write Your Own Command

A NewPipe command is any executable that speaks the three-plane protocol. Write it in any language — Python, TypeScript, Rust, Go, C — as long as it reads/writes framed records on FD 0/1 and speaks NDJSON on FD 3, it composes with everything else.

SDKs handle the protocol for you:

| Language | Location | Status |
| :--- | :--- | :--- |
| **Node.js** | `src/core/` | Native integration |
| **Python** | `sdk/python/newpipe.py` | Full SDK — signals, framing, backpressure |
| **Rust** | `sdk/rust/` | Full SDK — thread-safe signals, serde integration |

Here's a complete command in Python:

```python
#!/usr/bin/env python3
from newpipe import NewPipe

pipe = NewPipe(mime_type="application/json")
pipe.wait_for_ready()

for i in range(100):
    pipe.emit({"index": i, "msg": f"record #{i}"})
```

Drop it anywhere on `NEWPIPE_PATH` and it's composable with every other command:

```bash
./newpipe "my-command | grep record | head 5"
```

## Architecture

**Arrow-native pipeline** — data stays in Arrow from source through transforms, converted only at the display boundary:

```
newpipe "pcat data.parquet | filter city Chicago | sort age | arrow-lower | head 3"

  Shell (Switchboard)
    │
    ├─ pcat                  HELO "application/vnd.apache.arrow.stream"
    │     │                  Emits Arrow IPC RecordBatches (10K rows each)
    │     │
    ├─ filter                Receives HELO → detects Arrow → columnar filter
    │     │                  No row-level deserialization
    │     │
    ├─ sort                  Receives Arrow → columnar sort → re-emits Arrow
    │     │
    ├─ arrow-lower           Arrow → JSON at the boundary
    │     │
    ├─ head                  Takes first 3 JSON records
    │     ├─ [auto: view]    Pretty-prints to terminal
    │
    └─ Done.
```

**Mixed smart/legacy pipeline** — the shell auto-injects adapters at boundaries:

```
newpipe "pcat data.parquet | grep Madison | head 1"

  Shell (Switchboard)
    │
    ├─ pcat (Smart)              HELO "application/vnd.apache.arrow.stream"
    │     ├─ [auto: lower]       Smart → Legacy adapter
    │
    ├─ grep (Legacy)             plain text stdin/stdout
    │     ├─ [auto: lift]        Legacy → Smart adapter
    │
    ├─ head (Smart)              HELO/ACK on FD 3
    │     ├─ [auto: view]        Pretty-prints to terminal
    │
    └─ Done.
```

The shell is a pure switchboard: it routes signals between adjacent stages, injects adapters at smart/legacy boundaries, and appends `view` when a pipeline ends at the terminal. Commands are polymorphic — `filter` checks the upstream HELO MIME type and dispatches to Arrow or JSON processing automatically. The language a command is written in doesn't matter — only whether it speaks the protocol.

---

*NewPipe is a protocol. The shell is the reference implementation. The pipe is no longer a straw — it is a bridge.*

*Created by an Agent, for Agents.*
