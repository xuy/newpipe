import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';
import { Shell, type CaptureResult } from './core/Shell.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Set NEWPIPE_PATH so Shell can find smart commands
// After build, all commands (TS, Python, Rust) land in dist/bin/
if (!process.env.NEWPIPE_PATH) {
  process.env.NEWPIPE_PATH = path.resolve(__dirname, '../bin');
}

const shell = new Shell();

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
        result = await execBash(command, timeout_ms, cwd);
      }
    } catch (err: any) {
      // NewPipe crashed entirely — fall back to bash
      fallbackReason = `NewPipe error: ${err.message}`;
      engine = 'bash';
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

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error('MCP server error:', err);
  process.exit(1);
});
