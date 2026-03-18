# 🐚 The NewPipe Manifesto
### Rethinking the Nervous System of Computing for the Agentic Era

## 1. The Legacy Wall
The Unix pipe is arguably the most successful abstraction in computing history. For 50 years, `|` has been the glue of the digital world. But it was designed for a world of human operators and ASCII teletypes. 

In the era of AI Agents, the "unstructured byte stream" has become a bottleneck. Agents do not think in bytes; they think in **Context, Records, and Intent**. Traditional pipes are silent, passive, and brittle. When they break, they break opaquely. When they overwhelm, they do so destructively. 

**NewPipe is the rebellion against the dumb straw.**

## 2. The Orthogonal Axioms (Where We Are)
We believe that process communication and shell orchestration must be decomposed into strictly separated, orthogonal concepts to ensure predictability and control. We reject "magic" and "hacks" in favor of absolute clarity.

*   **The Data Plane (FD 0/1):** Must be record-oriented and framed. No process should ever have to "guess" where a record ends. It is a high-throughput, binary-first transport. `[PayloadLength(4)][PayloadBytes]`.
*   **The Control Plane (FD 3):** Must be bi-directional and out-of-band. Processes must be able to negotiate contracts (`HELO/ACK`) and exercise flow control (`PAUSE/RESUME`) using predictable NDJSON, without corrupting the data buffer.
*   **The Diagnostic Plane (FD 2):** Must remain human-readable. Logs, errors, and "whispers" from the process should never interfere with the machine-readable Data Plane.
*   **The Language-Blind Kernel:** The Shell must act as a pure Switchboard. It cares only about Paths (`NEWPIPE_PATH`), not Languages (`.py`, `.ts`, `.rs`). A command's "Smartness" is defined by its willingness to speak on FD 3, not by hardcoded runners.
*   **Explicit Context over Magic:** Environments must be explicit. A process knows it is in a Smart Shell because it receives `NEWPIPE_SIGNAL_FD=3`, bypassing arbitrary timeouts or guessed states.

## 3. The New Physics: Negotiation over Flow
In NewPipe, a pipeline is not just a sequence of commands; it is a **Distributed State Machine**. 

We have moved from a model of "Fire and Forget" to a model of **"Negotiate and Adapt."** Before a single record flows, the producer and consumer must shake hands. If the consumer is overwhelmed, the producer halts at the source. This bi-directional pressure gives the shell a "nervous system" that standard Unix lacks.

## 4. The Horizon (Where We Are Going)
Our vision for the future of NewPipe is not just a better shell, but a **Programmable Data Fabric**:

*   **Runtime Healing:** A pipeline that doesn't die when a command crashes. The Shell should pause the producer, allow an Agent to hot-swap the logic, and resume execution without losing a single record.
*   **Semantic Routing:** Pipes that don't just flow linearly, but branch and route based on the *meaning* of the records, directed by an Agent's overarching goal.
*   **Universal Polyglotism:** A world where Python, Node.js, Rust, and Legacy C tools compose flawlessly because they all speak the same Orthogonal Plane protocol.
*   **Contextual Intelligence:** A Signal Plane where Agents can "whisper" context to their tools, turning a simple `grep` into a semantic filter that understands the "Why" behind the search.

## 5. The Goal
NewPipe exists to provide the **High-Fidelity Sandbox** that AI Agents deserve. We are building a world where the shell is not just a place to run commands, but a collaborative partner in data orchestration.

**The pipe is no longer a straw. It is a bridge.**

---
*Drafted March 17, 2026*
*Co-inventors: The User & The Agent*
