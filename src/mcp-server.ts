import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';
import { Shell, type CaptureResult } from './core/Shell.js';

import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '../..');

// Set NEWPIPE_PATH so Shell can find smart commands
// After build, all commands (TS, Python, Rust) land in dist/bin/
if (!process.env.NEWPIPE_PATH) {
  process.env.NEWPIPE_PATH = path.resolve(__dirname, '../bin');
}

const shell = new Shell();

// --- Gap logging: track what falls back to bash and why ---
const LOG_PATH = path.join(projectRoot, 'newpipe-gaps.jsonl');

function logGap(entry: { timestamp: string; command: string; reason: string; engine: string; exitCode: number | null }) {
  try {
    fs.appendFileSync(LOG_PATH, JSON.stringify(entry) + '\n');
  } catch {}
}

// --- Bash fallback: plain shell execution with timeout ---
function execBash(command: string, timeoutMs: number, cwd?: string): Promise<CaptureResult> {
  return new Promise((resolve) => {
    const proc = spawn('bash', ['-c', command], {
      stdio: ['pipe', 'pipe', 'pipe'],
      ...(cwd ? { cwd } : {}),
    });

    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];

    proc.stdout.on('data', (chunk: Buffer) => stdoutChunks.push(chunk));
    proc.stderr.on('data', (chunk: Buffer) => stderrChunks.push(chunk));
    proc.stdin.end();

    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      try { proc.kill('SIGTERM'); } catch {}
      setTimeout(() => {
        try { proc.kill('SIGKILL'); } catch {}
      }, 2000);
    }, timeoutMs);

    proc.on('exit', (code) => {
      clearTimeout(timer);
      resolve({
        stdout: Buffer.concat(stdoutChunks).toString(),
        stderr: Buffer.concat(stderrChunks).toString(),
        signals: [],
        exitCode: code,
        timedOut,
        stages: [{ command, exitCode: code, signals: [] }],
      });
    });

    proc.on('error', (err) => {
      clearTimeout(timer);
      resolve({
        stdout: '',
        stderr: err.message,
        signals: [],
        exitCode: 1,
        timedOut: false,
        stages: [{ command, exitCode: 1, signals: [] }],
      });
    });
  });
}

const server = new McpServer({
  name: 'newpipe',
  version: '1.0.0',
});

server.tool(
  'newpipe',
  `Run a shell command. Uses NewPipe (structured pipes with hang detection) by default, with automatic bash fallback.

Use this tool INSTEAD of the built-in Bash tool for running shell commands. It provides:
- Hang detection: automatic timeout with per-stage diagnostics showing WHERE a pipeline stalled
- Control plane signals: backpressure (PAUSE/RESUME), type negotiation (HELO/ACK)
- Per-stage exit codes: see which stage in a multi-stage pipeline failed
- Automatic fallback: if NewPipe fails, transparently retries with plain bash

Works with ANY shell command — not just pipelines. Single commands like "npm install",
"git status", "python script.py" all work. Pipelines get the extra NewPipe diagnostics.

Examples:
  "git status"                    — single command (runs via NewPipe, falls back to bash)
  "ls -la src/"                   — directory listing
  "npm test"                      — run tests with hang detection
  "cat data.json | jq .name"     — pipeline with structured diagnostics
  "ls | grep src | head 5"       — multi-stage pipeline`,
  {
    command: z.string().describe('The shell command to execute'),
    timeout_ms: z.number().optional().default(30000).describe('Timeout in ms. Pipeline is killed if exceeded. Default: 30000'),
    cwd: z.string().optional().describe('Working directory. Defaults to server cwd.'),
  },
  async ({ command, timeout_ms, cwd }) => {
    const opts: { timeoutMs?: number; cwd?: string } = { timeoutMs: timeout_ms };
    if (cwd !== undefined) opts.cwd = cwd;

    let result: CaptureResult;
    let engine: 'newpipe' | 'bash' = 'newpipe';
    let fallbackReason: string | undefined;

    try {
      result = await shell.executeCapture(command, opts);

      // Decide if we should fall back to bash:
      // - spawn errors (exitCode null + not timed out = process failed to start)
      // - NewPipe-specific failures where bash might succeed
      const shouldFallback =
        (!result.timedOut && result.exitCode === null) ||  // process didn't start
        (result.stderr.includes('ENOENT') && result.exitCode !== 0);  // command not found by NewPipe

      if (shouldFallback) {
        fallbackReason = result.stderr.includes('ENOENT')
          ? 'command not found in NewPipe path'
          : 'process failed to start';
        engine = 'bash';
        logGap({ timestamp: new Date().toISOString(), command, reason: fallbackReason, engine: 'bash-fallback', exitCode: result.exitCode });
        result = await execBash(command, timeout_ms, cwd);
      } else {
        // Successful NewPipe execution — log it too for coverage tracking
        logGap({ timestamp: new Date().toISOString(), command, reason: 'ok', engine: 'newpipe', exitCode: result.exitCode });
      }
    } catch (err: any) {
      // NewPipe crashed entirely — fall back to bash
      fallbackReason = `NewPipe error: ${err.message}`;
      engine = 'bash';
      logGap({ timestamp: new Date().toISOString(), command, reason: fallbackReason, engine: 'bash-crash-fallback', exitCode: null });
      result = await execBash(command, timeout_ms, cwd);
    }

    // Build response
    const parts: string[] = [];

    // Engine header — always show which engine ran the command
    if (engine === 'bash') {
      parts.push(`[engine: bash fallback — ${fallbackReason}]`);
    } else {
      parts.push(`[engine: newpipe]`);
    }
    parts.push('');

    if (result.timedOut) {
      parts.push('PIPELINE TIMED OUT (possible hang detected)');
      parts.push(`Timeout: ${timeout_ms}ms`);
      parts.push('');
      if (result.stages.length > 1) {
        parts.push('Stage diagnostics:');
        for (const stage of result.stages) {
          const status = stage.exitCode === null ? 'KILLED (was still running)' : `exit ${stage.exitCode}`;
          parts.push(`  ${stage.command}: ${status}`);
          if (stage.signals.length > 0) {
            parts.push(`    signals: ${stage.signals.join(', ')}`);
          }
        }
        parts.push('');
      }
    }

    if (result.stdout) {
      parts.push(result.stdout);
    }

    if (result.stderr) {
      parts.push('--- stderr ---');
      parts.push(result.stderr);
    }

    if (result.signals.length > 0 && !result.timedOut) {
      parts.push('--- control plane signals ---');
      parts.push(result.signals.join('\n'));
    }

    const text = parts.join('\n') || '(no output)';

    return {
      content: [{ type: 'text' as const, text }],
      isError: result.exitCode !== 0 || result.timedOut,
    };
  }
);

server.tool(
  'newpipe-gaps',
  `Show NewPipe gap analysis — what commands fell back to bash and why.
Use this to identify what NewPipe needs to support next.`,
  {
    tail: z.number().optional().default(50).describe('Number of recent entries to show'),
    fallbacks_only: z.boolean().optional().default(false).describe('Only show bash fallbacks, not successful NewPipe executions'),
  },
  async ({ tail, fallbacks_only }) => {
    try {
      const raw = fs.readFileSync(LOG_PATH, 'utf-8').trim();
      if (!raw) return { content: [{ type: 'text' as const, text: 'No gap data yet.' }] };

      let entries = raw.split('\n').map(line => {
        try { return JSON.parse(line); } catch { return null; }
      }).filter(Boolean);

      if (fallbacks_only) {
        entries = entries.filter((e: any) => e.engine !== 'newpipe');
      }

      entries = entries.slice(-tail);

      if (entries.length === 0) {
        return { content: [{ type: 'text' as const, text: fallbacks_only ? 'No fallbacks recorded.' : 'No gap data yet.' }] };
      }

      // Summary
      const total = entries.length;
      const fallbacks = entries.filter((e: any) => e.engine !== 'newpipe').length;
      const reasons = new Map<string, number>();
      for (const e of entries) {
        if ((e as any).engine !== 'newpipe') {
          const r = (e as any).reason || 'unknown';
          reasons.set(r, (reasons.get(r) || 0) + 1);
        }
      }

      const parts: string[] = [];
      parts.push(`NewPipe gap analysis (last ${total} commands):`);
      parts.push(`  NewPipe: ${total - fallbacks} | Bash fallback: ${fallbacks}`);
      if (reasons.size > 0) {
        parts.push('\nFallback reasons:');
        for (const [reason, count] of [...reasons.entries()].sort((a, b) => b[1] - a[1])) {
          parts.push(`  ${count}x ${reason}`);
        }
      }
      parts.push('\nRecent entries:');
      for (const e of entries.slice(-20)) {
        const icon = (e as any).engine === 'newpipe' ? '✓' : '✗';
        parts.push(`  ${icon} [${(e as any).engine}] ${(e as any).command}`);
        if ((e as any).engine !== 'newpipe') {
          parts.push(`    reason: ${(e as any).reason}`);
        }
      }

      return { content: [{ type: 'text' as const, text: parts.join('\n') }] };
    } catch {
      return { content: [{ type: 'text' as const, text: 'No gap data yet (log file not found).' }] };
    }
  }
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error('MCP server error:', err);
  process.exit(1);
});
