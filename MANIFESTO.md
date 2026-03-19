# 🐚 The NewPipe Manifesto

## The pipe is 50 years old. AI agents deserve better.

The Unix pipe is the most successful abstraction in computing history. For 50 years, `|` has been the glue of the digital world.

But it was designed for human operators and ASCII teletypes. Agents don't think in bytes. They think in records, types, and intent. They work with images, audio, structured data, and binary formats — not lines of text. When a pipe breaks, it breaks silently. When it overwhelms, it drops data. When an agent asks "what went wrong?", the pipe has nothing to say.

**NewPipe makes pipes agent-native.**

## Three Planes, Not One

The Unix pipe is a single undifferentiated byte stream. NewPipe decomposes it into three:

- **Data Plane** — Framed, typed records. A stream of `[length][payload]` frames, not raw bytes. No process ever has to guess where a record ends. Binary, images, Arrow batches — any content type, declared up front.

- **Control Plane** — Bidirectional negotiation, out of band. Before data flows, producer and consumer shake hands (`HELO/ACK`). If the consumer is overwhelmed, the producer halts (`PAUSE/RESUME`). If something breaks, the error travels separately (`ERROR`). The pipeline has a nervous system.

- **Diagnostic Plane** — Observable by humans and agents. Logs and status that never corrupt the data stream. An operator sees what's happening; an agent parses it to reason about the pipeline.

## Negotiation, Not Fire-and-Forget

A traditional pipe is passive — data flows and you hope for the best. NewPipe pipelines are **distributed state machines**. Every stage negotiates before producing. Every consumer can push back. Every failure is signaled, not silent.

This means an agent orchestrating a pipeline can see what types are flowing, which stage is slow, and whether a producer is paused or erroring — in real time, through the protocol.

## Where This Goes

NewPipe is not just a better shell. It's a foundation for **agent-native data orchestration**:

- **Subagents as pipeline stages.** An LLM is just another transform — records in, records out. Classical tools and AI subagents compose in a single expression.

- **Runtime healing.** A pipeline that doesn't die when a stage crashes. Pause the producer, hot-swap the broken stage, resume — without losing a record.

- **Semantic routing.** Pipes that branch and route based on the meaning of the records, directed by an agent's goal.

- **Contextual intelligence.** A control plane where agents whisper context to their tools — turning a simple filter into a semantic operation that understands the *why* behind the query.

## The Goal

The shell has been a place to run commands. We're making it a place where agents orchestrate work.

**The pipe is no longer a straw. It is a bridge.**

---
*Drafted March 17, 2026*
*Co-inventors: The User & The Agent*
