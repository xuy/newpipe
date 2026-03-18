# NewPipe — Future Directions
### The Wildest Dreams

This document captures where NewPipe could go. These are ordered roughly by leverage — what unlocks the most with the least.

---

## 1. The `llm` Command — AI as a Pipeline Stage

The killer app for the agentic era:

```bash
pcat invoices.parquet | llm "classify as legitimate or suspicious, add a risk field" | jq risk,amount | view
```

The `llm` command receives typed records, sends them (with schema context) to an LLM, and emits transformed records. Backpressure handles rate limiting naturally — when the LLM is slow, upstream PAUSEs.

**How to build it:** A smart command that takes a prompt argument, batches incoming records, calls the Anthropic API (or a local model), and emits transformed records. The SDK already handles framing and signaling.

---

## 2. MCP Bridge — Plug into the AI Tooling Ecosystem

Build a `newpipe-mcp` server that wraps any NewPipe command as an MCP tool. Every NewPipe command becomes callable from Claude, Cursor, or any MCP client. The control plane maps naturally to MCP's tool schemas.

This is probably the single highest-leverage move for adoption — it plugs NewPipe into the entire AI tooling ecosystem overnight.

---

## 3. More Data Commands

Expand the command vocabulary to make NewPipe immediately useful for real work:

- **`csv`** — Read/write CSV as typed records
- **`sql`** — Run SQLite queries as a pipeline stage
- **`plot`** — Render records as terminal charts
- **`http`** — Fetch URLs, emit responses as records
- **`sample`** — Random sampling from a record stream
- **`sort`** / **`uniq`** / **`count`** — Aggregation primitives

Each is a small, self-contained command that speaks the three-plane protocol.

---

## 4. Pipelines as Programs — Save, Run, Share

A pipeline *is* a program — a DAG of typed transformations with explicit contracts. Make them first-class artifacts:

```bash
newpipe save "top-madison" "pcat data.parquet | grep Madison | head 5"
newpipe run top-madison --input other.parquet
```

A `Pipefile` (like a Makefile) that declares named pipelines with parameters and dependencies. The protocol already captures type contracts via HELO/ACK — persist them alongside the pipeline definition.

---

## 5. Signal Extensions — A Richer Control Plane

The control plane currently carries simple signals. But it's already bidirectional NDJSON — extend it:

- **`SCHEMA`** — "here's the shape of my records" (JSON Schema, Arrow schema)
- **`HINT`** — "I have ~10M records, consider batching"
- **`SEEK`** — "skip to offset N" (random access)
- **`NEGOTIATE`** — "I can produce JSON or Arrow, which do you prefer?"
- **`EXPLAIN`** — "what did you do to this record?" (provenance/lineage)

Design: a signal extension registry. Core signals stay frozen. Commands advertise extended signal support via HELO metadata. Unknown signals are ignored — backward-compatible by default.

---

## 6. Wire Format Extensibility — Keep the Frame, Evolve the Semantics

The data plane wire format is `[4 bytes][payload]`. This should never change. But those 4 bytes are a 32-bit word — there are bits to spare.

Today all 32 bits encode payload length, giving a ~4GB max frame. In the future, the upper bits could carry frame metadata (chunked flag, frame type, compression hint) while the lower bits remain the length. The wire format stays the same `[4 bytes][payload]` — readers that don't understand the new bits just see slightly smaller max frames.

More importantly, the control plane (FD 3) is the real extensibility layer. If two stages need chunked transfer for giant payloads, they negotiate it:

```json
{"type": "NEGOTIATE", "chunked": true}
```

Then they reinterpret the same `[4 bytes][payload]` frames as chunks of a larger logical record. The data plane format doesn't change. Stages that didn't negotiate chunking see normal frames.

**Design principle:** semantics live on FD 3, not in the wire format. The 4-byte header is a stable transport primitive. The control plane gives it meaning. This keeps the protocol simple for basic use and infinitely extensible for advanced use — without breaking backward compatibility.

---

## 7. Visual Pipeline Builder

A pipeline of typed, contract-advertising stages is a node graph. Each command is a node with typed ports. The HELO handshake *is* the wiring validation.

A web UI or VS Code extension where you:
- Drag commands onto a canvas
- Connect them (the UI validates type compatibility)
- See live data flowing through each stage
- See backpressure visualized in real-time (PAUSE = red, RESUME = green)

**How to build it:** Add a `--json-diagnostics` mode that emits structured events (stage started, record count, signal received) on a websocket. A React frontend consumes this stream.

---

## 8. The Control Plane as Conversation

Push the control plane toward contextual intelligence. An agent orchestrating a pipeline could whisper metadata to tools:

```json
{"type": "CONTEXT", "intent": "find anomalies", "sensitivity": "high"}
```

A smart `grep` receiving this context could switch from literal matching to semantic filtering. The Signal Plane becomes a side-channel for agent reasoning — tools become context-aware without changing their data interface.

---

## 9. Runtime Healing and Hot-Swap

Because control flow is separated from data flow:

1. **PAUSE** the pipeline
2. **Replace** a stage (swap `grep` for `ai-filter`)
3. **RESUME** — no data loss, the buffer drains through the new stage

This is live-patching for data pipelines. Debug a running pipeline, identify the broken stage, hot-swap it, continue.

**How to build it:** The shell needs supervised process management (not just spawn-and-forget). Add `DETACH`/`ATTACH` signal pairs. The shell buffers in-flight data during the swap window.

---

## 10. Distributed Pipelines — NewPipe over the Network

If a pipe segment is just "something that speaks three planes on three FDs," the transport can change without changing the protocol:

- Data plane → TCP socket with the same framing
- Control plane → WebSocket carrying NDJSON
- Diagnostic plane → structured logs to a collector

```bash
pcat huge.parquet@gpu-box | transform | view   # heavy lifting runs remotely
```

**How to build it:** A `newpipe-relay` that tunnels three planes over SSH or WebSocket. Start with SSH (`ssh host newpipe-cmd` with FD forwarding), graduate to a proper daemon.

---

## 11. A Package Ecosystem

Smart commands are just executables that speak the protocol. That's a package:

```bash
newpipe install @newpipe/csv
newpipe install @newpipe/llm
newpipe install @newpipe/plot
```

Each package declares its HELO types (what it produces/consumes). The registry validates compatibility. `newpipe search "parquet"` finds commands that handle Parquet.

Commands are already discovered via `NEWPIPE_PATH`. A package manager just downloads executables into a path directory and registers their type contracts.

---

## Prioritized Roadmap

| Phase | What | Why First |
| :--- | :--- | :--- |
| **Now** | `llm` command + `csv`, `sql`, `plot` | Makes it immediately useful for real work |
| **Next** | MCP bridge | Plugs into the AI tooling ecosystem overnight |
| **Then** | Pipeline serialization (`save`/`run`) | Pipelines become artifacts, not ephemera |
| **Later** | Signal extensions, visual builder | Unlocks smart negotiation and accessibility |
| **Dream** | Distributed relay, healing, package registry | These follow naturally once the protocol has users |

---

*The throughline: NewPipe is a protocol first, a shell second. Every direction above reinforces that. The shell is the reference implementation and playground. The protocol is what scales.*
