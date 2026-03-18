# NewPipe Protocol Analysis — A Pragmatic Assessment

*Written by Claude Code after thorough review of the protocol, implementation, SDKs, and mapping to real agent tool usage.*

---

## What NewPipe Is

A protocol replacing byte-stream Unix pipes with three orthogonal planes:
- **Data Plane (FD 0/1)**: Length-prefixed frames `[4-byte big-endian length][payload]`
- **Control Plane (FD 3)**: Bidirectional NDJSON signals (HELO/ACK/PAUSE/RESUME/STOP/ERROR)
- **Diagnostic Plane (FD 2)**: Human-readable stderr logs

Implemented in TypeScript (core + shell), with Python and Rust SDKs.

---

## What's Genuinely Good

### 1. Per-stage pipeline diagnostics — the single most useful thing for agents

When an agent runs `npm test | grep FAIL | head 5` and it hangs, traditional bash gives nothing. NewPipe's `CaptureResult` returns per-stage exit codes and signals via `StageInfo[]` (Shell.ts:370-374). It tells you *which stage* hung. This is real — agents hit hanging commands constantly and have to guess where the stall is.

### 2. Structured output from shell commands

`ls` returning `{"name":"foo.ts","size":1234,"type":"file"}` instead of `-rw-r--r-- 1 user user 1234 Mar 18 foo.ts` is the 80/20 win. Agents currently parse `git status`, `ls -la`, and `docker ps` output with fragile heuristics. Structured records eliminate this parsing tax.

### 3. The adapter pattern is pragmatically correct

`lift` and `lower` (src/core/adapters/) bridge smart and legacy commands automatically. The shell detects boundaries and injects adapters. You don't need to rewrite `grep` and `sed` — they just work with automatic framing translation. This is the right migration strategy: reward adoption without forcing it.

### 4. The MCP server is the right distribution channel

`mcp-server.ts` wraps NewPipe as an MCP tool with automatic bash fallback. An agent calls one tool, gets structured diagnostics when available, plain bash when not. The fallback design is correct — it doesn't force adoption.

### 5. The three-plane separation is architecturally clean

Data, control, and diagnostics on separate channels that evolve independently. The control plane is NDJSON so it's trivially extensible. Unknown signal types are ignored — good forward-compatibility design.

---

## What's Problematic

### 1. Agents don't use pipelines much — and that's by design

Claude Code's tools: `Read`, `Edit`, `Write`, `Glob`, `Grep`, `Bash`, `Agent`. Six of seven are *not* shell commands. The tool design actively avoids pipelines:
- `Grep` uses ripgrep in-process — faster than spawning grep
- `Glob` does file matching without spawning find
- `Read` reads files without cat
- `Agent` spawns sub-agents in-process with full context

When Bash is used, it's overwhelmingly single commands: `git status`, `npm test`, `cargo build`. NewPipe optimizes for multi-stage pipelines, but agents spend 90%+ of shell time on single commands where the protocol adds overhead with no benefit.

### 2. The HELO/ACK handshake adds latency for common cases

For `ls | head 2`:
1. `ls` spawns, opens FD 3, sends HELO, waits for ACK
2. `head` spawns, receives HELO, sends ACK, sends its own HELO
3. *Then* data flows

The handshake exists for type negotiation, but the current implementation doesn't do anything with the negotiated type — consumers accept everything regardless.

### 3. Signal routing is broadcast, not directed

Shell.ts:192-198 — when stage `i` emits a signal, it goes to both `i-1` and `i+1`. In `A | B | C | D`, if C sends PAUSE (meant for B, its upstream producer), D also gets it. There's no signal addressing or directionality.

### 4. Backpressure is polling-based, not event-driven

```python
# newpipe.py:74-75
while self.paused and not self.stopped:
    time.sleep(0.05)  # 50ms polling loop
```

Real backpressure systems use kernel-level signaling. NewPipe polls in a sleep loop, burning CPU and adding up to 50ms latency on resume.

### 5. Pipe parsing is fragile

`commandLine.split('|')` (Shell.ts:98,212) breaks on `echo "hello | world"`, `cmd1 || cmd2`, or any command with `|` in arguments. Agents construct commands dynamically and will hit this.

### 6. FD 3 semantics are underspecified

The Python SDK opens FD 3 for both reading and writing. This works with socketpairs but would fail with unidirectional pipes. The Rust SDK does the same with `from_raw_fd`. The protocol doesn't specify whether FD 3 must be bidirectional.

### 7. No schema, no validation, no content negotiation

HELO sends `"mimeType": "application/json"` but that says nothing about record shape. Consumers can't validate or reject. FUTURE.md lists SCHEMA and NEGOTIATE signals, but they're not implemented. The "type contract" is a label with no enforcement.

---

## Tool Mapping: Claude Code vs NewPipe

| Claude Code Tool | NewPipe Equivalent | Verdict |
|---|---|---|
| `Bash("git status")` | `newpipe("git status")` | **Worse.** Falls back to bash. Extra overhead. |
| `Bash("npm test")` | `newpipe("npm test")` | **Better.** Hang detection with per-stage diagnostics. |
| `Read("/path/file")` | `newpipe("cat file")` | **Much worse.** Read is in-process, instant. |
| `Grep("pattern")` | `newpipe("grep pattern")` | **Much worse.** Grep uses ripgrep, returns structured results. |
| `Glob("**/*.ts")` | `newpipe("tree . \| grep .ts")` | **Much worse.** Glob is in-process matching. |
| `Agent(sub-task)` | Nothing | **No equivalent.** Sub-agents carry full context + all tools. |
| `Bash("docker build .")` | `newpipe("docker build .")` | **Marginally better.** Timeout/hang detection helps. |

**Pattern**: NewPipe adds value where the agent has *only* a shell tool and runs multi-stage or long-running commands. For agents with purpose-built tools, it competes with faster alternatives.

---

## Where NewPipe Actually Matters for Agents

### 1. LLM as pipeline stage — this is the real play

```bash
pcat invoices.parquet | llm "classify risk" | jq risk,amount
```

Records in, LLM transform, records out. Backpressure handles rate limiting naturally. Typed records give the LLM schema context. No other tool does this well today. The `llm` command from FUTURE.md should be item zero, not item one.

### 2. Agents with only a shell tool

Some frameworks give the LLM a single `execute_command` tool. For those agents, structured `ls`/`grep`/`cat` returning JSON records instead of text blobs would be transformative.

### 3. Observable long-running pipelines

ETL workflows that take minutes. The control plane signals give agents real-time observability into pipeline state. Today agents launch `bash -c "long pipeline"` and see nothing until timeout.

### 4. Hot-swap and healing (if implemented)

An agent could PAUSE a pipeline, replace a broken stage, RESUME. Today if a stage hangs, you kill everything. Surgical replacement while preserving pipeline state would be new agent capability.

---

## Bottom Line

The protocol design is sound. The implementation is a solid prototype.

But the pitch is slightly misaligned. It's positioned as "pipes for the agentic era," but modern agents have moved *beyond* pipes. Claude Code doesn't shell out for file reads, searches, or edits — it has purpose-built tools that are faster.

The strongest use case isn't replacing existing agent tools. It's enabling workflows that pipes couldn't do before: **LLM-as-transform**, **observable ETL**, and **structured command output for agents that only have a shell**.

The `llm` command is where the protocol stops competing with existing tools and starts enabling something genuinely new.
