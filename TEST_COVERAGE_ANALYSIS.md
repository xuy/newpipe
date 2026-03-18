# NewPipe Test Coverage Analysis

## Current State

The project has **1 test file** (`tests/north-star.test.ts`) with **7 integration tests**. All tests use `execSync` to invoke the CLI end-to-end. There are **zero unit tests**.

### What's Currently Covered

| Test | What it validates |
|------|-------------------|
| `help` command | Output contains "NewPipe" and "Commands:" |
| `about` command | Output contains "Rethinking Unix Pipes" |
| `ls \| head 2` | Basic pipe execution between two smart commands |
| `tree . \| grep tests` | Tree + grep filtering |
| `cat package.json \| jq .version` | File reading + JSON extraction |
| `echo ... \| grep world` | Legacy-to-smart lifting (auto `lift` injection) |
| `cat tsconfig.json \| grep esnext` | Plain text file reading + grep |

### What's NOT Covered

Essentially everything below the CLI surface: no unit tests for any core module, command, SDK, or utility.

---

## Proposed Improvements (Priority Order)

### 1. Core Protocol Unit Tests — HIGH PRIORITY

#### `Frame.ts` — Frame encoding/decoding
- Encode a payload and verify 4-byte BE length header + payload bytes
- Decode a valid buffer and extract the payload
- Decode a buffer that is too short (partial frame) — should return `null`
- Decode a zero-length payload
- Round-trip: `decode(encode(payload))` === original payload
- Large payload (>64KB) to verify UInt32BE handles multi-byte lengths

#### `SmartPipe.ts` — Stream framing transform
- Feed a single complete frame → emits one decoded object
- Feed two frames concatenated → emits two objects
- Feed a frame split across two chunks (partial frame buffering)
- Feed empty chunk → emits nothing
- `SmartPipe.wrap()` produces a correctly framed buffer
- Verify object mode output (emitted data is parsed, not raw Buffer)

#### `SignalPlane.ts` — Control channel
- `onSignal` callback fires when a NDJSON line arrives on FD 3
- `send()` writes valid NDJSON to the socket
- Multiple listeners all receive the same signal
- Malformed NDJSON line doesn't crash (error resilience)

#### `Signal.ts` — Signal types
- Verify `SignalType` enum contains HELO, ACK, PAUSE, RESUME, STOP, ERROR

### 2. Shell Orchestration Tests — HIGH PRIORITY

#### `Shell.ts` — Pipeline parsing & adapter injection
- Parse `"ls | head 5"` → two command segments
- Parse single command (no pipe) → one segment
- Detect smart command vs. legacy command correctly
- Auto-inject `lift` when legacy command feeds into smart command
- Auto-inject `lower` when smart command feeds into legacy command
- Auto-append `view` when last command is smart and output is TTY
- `getCommandInfo()` resolves built-in commands (help, about)
- `getCommandInfo()` resolves commands from `NEWPIPE_PATH`
- `getCommandInfo()` falls back to system PATH for legacy commands
- Error handling when command not found

### 3. Command Unit Tests — MEDIUM PRIORITY

These can be tested by importing the command logic directly (or by mocking stdin/stdout/FD3).

#### Transform commands (highest value — pure logic)

**`grep.ts`**
- Matches case-insensitively
- Filters on a specific JSON field when field argument provided
- No matches → no output
- Empty pattern → matches everything
- Regex special characters in pattern
- Non-JSON input falls back to text matching

**`head.ts`**
- Default limit is 10 records
- Custom limit (e.g., `head 3`) emits exactly 3 records
- Exits cleanly after limit reached
- `head 0` edge case

**`jq.ts`**
- Extracts top-level field (`.name`)
- Extracts nested field (`.foo.bar`)
- Returns nothing for missing path
- Handles non-JSON input gracefully

#### Producer commands

**`cat.ts`**
- Detects `.jsonl` → parses each line as JSON
- Detects `.json` → emits whole file as single record
- Falls back to text lines for other extensions
- Error on nonexistent file

**`ls.ts`**
- Lists directory contents as JSON records with correct fields (name, path, size, isDirectory, mtime)
- Respects PAUSE signal (pauses emission)
- Respects RESUME signal (resumes emission)
- Respects STOP signal (terminates)
- Error on nonexistent directory

**`tree.ts`**
- Recurses into subdirectories
- Respects `maxDepth` parameter
- Default depth is 2
- Empty directory produces no child records

#### Adapter commands

**`lower.ts`**
- Converts framed JSON records to newline-delimited JSON strings
- Falls back to plain text for non-JSON payloads

**`lift.ts`**
- Converts newline-delimited input to framed Smart output
- Attempts JSON parse on each line, falls back to text
- Sends HELO with `text/plain` MIME type

### 4. SDK Tests — MEDIUM PRIORITY

#### Python SDK (`sdk/python/newpipe.py`)
- `NewPipe` constructor sets MIME type
- `wait_for_ready()` completes after receiving ACK
- `emit(data)` writes a correctly framed record
- `records()` generator yields decoded records
- Backpressure: `emit()` blocks while `paused` flag is set
- `stopped` flag is set on STOP signal

#### Rust SDK (`sdk/rust/src/lib.rs`)
- `NewPipe::new()` detects smart environment via `NEWPIPE_SIGNAL_FD`
- `wait_for_ready()` blocks until ACK received
- `emit<T: Serialize>()` writes framed JSON
- Fallback to newline-delimited JSON when not in smart env
- Thread safety of signal handling (concurrent emit + signal)

### 5. Integration Test Gaps — LOWER PRIORITY

These extend the existing `north-star.test.ts` style:

- **Error paths**: nonexistent command, nonexistent file, permission denied
- **Empty pipeline output**: `ls nonexistent-dir` should error gracefully
- **Multi-stage pipelines**: `ls | grep ts | head 3 | jq .name` (3+ pipes)
- **Binary pipeline**: `bcat <file>` → verify binary output
- **Backpressure end-to-end**: `ls | slow` (verify PAUSE/RESUME signals fire)
- **Cross-language pipeline**: `gen.py | grep index` (Python producer → TS consumer)
- **Large data**: Stream a large file and verify no data loss
- **Concurrent pipelines**: Run multiple pipelines simultaneously

### 6. Edge Cases & Robustness — LOWER PRIORITY

- EPIPE handling: downstream closes early, upstream exits cleanly (code 0)
- Signal timeout: HELO sent but no ACK received within timeout
- Malformed frame data (corrupted length header)
- Very large single record (>100MB)
- Unicode/binary content in records
- Empty pipeline string
- Whitespace-only pipeline string

---

## Recommended Implementation Order

| Phase | Scope | Estimated Tests | Impact |
|-------|-------|-----------------|--------|
| **Phase 1** | `Frame.ts` + `SmartPipe.ts` unit tests | ~12 tests | Validates the data plane foundation |
| **Phase 2** | `Shell.ts` parsing & adapter injection | ~10 tests | Validates orchestration logic |
| **Phase 3** | Transform commands (`grep`, `head`, `jq`) | ~15 tests | Validates core data processing |
| **Phase 4** | Producer commands (`cat`, `ls`, `tree`) | ~12 tests | Validates data sources |
| **Phase 5** | Adapter commands (`lift`, `lower`) | ~6 tests | Validates smart/legacy bridging |
| **Phase 6** | Extended integration tests | ~8 tests | Validates end-to-end pipelines |
| **Phase 7** | SDK tests (Python + Rust) | ~12 tests | Validates polyglot support |

**Total: ~75 new tests** to bring the project from minimal smoke-test coverage to comprehensive coverage.

---

## Quick Wins (Can Be Done Immediately)

1. **`Frame.ts` tests** — Pure functions, no I/O, trivial to test
2. **`SmartPipe.wrap()` tests** — Static method, no dependencies
3. **`Shell.ts` command parsing** — Extract parsing logic into testable function
4. **`grep.ts` pattern matching** — Core regex logic can be tested in isolation
5. **`jq.ts` path extraction** — Pure JSON traversal logic
