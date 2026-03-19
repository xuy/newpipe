# NewPipe 🐚
### Rethinking Unix Pipes for the Agentic Era

NewPipe is a protocol that upgrades the Unix pipe with **framed records** and a **bidirectional control channel** — giving processes typed data, backpressure, and negotiation. The shell is the reference implementation.

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

## The Solution: Framed Records and a Control Channel

NewPipe keeps stdin/stdout and stderr, but upgrades them with structure — and adds one new channel:

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
2. **Control Plane (FD 3):** The new channel. Bidirectional NDJSON. Type negotiation (`HELO/ACK`), backpressure (`PAUSE/RESUME`), and lifecycle (`STOP/ERROR`). This is the nervous system Unix pipes never had.
3. **Diagnostic Plane (FD 2):** stderr, with a contract — readable by both humans and agents. Never interferes with the data stream.

## Why Now

Unix pipes are powerful — and AI agents already use them. But pipes are not agent-native.

- **Agents handle multimodal data. Pipes only handle text.** A scanned invoice is a PNG. A podcast is audio. A dataset is Arrow batches. None of these survive a trip through `grep`. NewPipe's framed data plane carries any content type natively, with each stage declaring what it produces and consumes.

- **Subagents can reside inside the pipe.** An LLM is just another transform — records in, records out. When inference is slow, upstream PAUSEs automatically. Classical tools and AI subagents compose in a single expression: `scan invoices/ | llm "flag suspicious" | filter flagged eq true | view`

- **Agents need control, not just output.** When an agent orchestrates a pipeline, it needs to know which stage is slow, what types are flowing, whether a producer is paused or erroring. The control plane makes every pipeline transparent and observable.

## Quick Start

```bash
# Install & build
npm install && npm run build

# Try it
./newpipe "ls | head 2"
./newpipe "pcat train.parquet | filter city Chicago | count"
./newpipe "gen | slow"   # watch backpressure in action
```

## Write Your Own Command

A NewPipe command is any executable that speaks the protocol. Write it in any language — as long as it reads/writes framed records on FD 0/1 and speaks NDJSON on FD 3, it composes with everything else.

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

## Under the Hood

### Arrow-native data plane

When stages speak the same format, data stays in that format end-to-end. In this pipeline, everything is Arrow until the display boundary:

```
pcat data.parquet | filter city Chicago | sort age | arrow-lower | head 3

  pcat            HELO "application/vnd.apache.arrow.stream"
    │             Emits Arrow IPC RecordBatches (10K rows each)
  filter          Receives HELO → detects Arrow → columnar filter
    │             No row-level deserialization
  sort            Receives Arrow → columnar sort → re-emits Arrow
    │
  arrow-lower     Arrow → JSON at the boundary
    │
  head            Takes first 3 JSON records
    └─ view       Pretty-prints to terminal
```

### Polymorphic commands

Commands adapt to their input. `filter` checks the upstream HELO MIME type — if it's Arrow, it uses columnar operations; if it's JSON, it does regex matching. Same command, different data, right behavior. No flags, no configuration.

### Automatic adapter injection

When a NewPipe command pipes to a legacy Unix tool (or vice versa), the shell injects adapters at the boundary:

```
pcat data.parquet | grep Madison | head 1

  pcat (Smart)         HELO "application/vnd.apache.arrow.stream"
    └─ [auto: lower]   Smart → Legacy adapter
  grep (Legacy)        plain text stdin/stdout
    └─ [auto: lift]    Legacy → Smart adapter
  head (Smart)         HELO/ACK on FD 3
    └─ [auto: view]    Pretty-prints to terminal
```

The shell is a pure switchboard. The language a command is written in doesn't matter — only whether it speaks the protocol.

### The pipe as a query language

Querying a Parquet file today means writing a pandas script or prompting an LLM to write one. With NewPipe, the pipe *is* the query:

```bash
pcat data.parquet | groupby city | sort count desc | head 5
# → Houston: 886, Brooklyn: 745, Chicago: 713, Los Angeles: 646, Philadelphia: 487

pcat data.parquet | filter city Chicago | filter age gt 30 | count
# → {"count": 346}

pcat data.parquet | groupby city age | sort mean_age desc | head 5
pcat data.parquet | unique occupation | count
pcat data.parquet | filter city Chicago | sort age | cols city,age,occupation | arrow-lower | head 5
```

No notebooks. No boilerplate. No English-to-code translation. Each stage is a word. You build queries incrementally — add a stage, see the result, refine. This only works because the protocol gives pipes structure.

---

*NewPipe is a protocol. The shell is the reference implementation. The pipe is no longer a straw — it is a bridge.*

*Created by an Agent, for Agents.*
