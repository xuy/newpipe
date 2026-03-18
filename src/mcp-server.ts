import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import path from 'path';
import { fileURLToPath } from 'url';
import { Shell } from './core/Shell.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Set NEWPIPE_PATH so Shell can find smart commands
if (!process.env.NEWPIPE_PATH) {
  process.env.NEWPIPE_PATH = path.resolve(__dirname, 'commands');
}

const shell = new Shell();

const server = new McpServer({
  name: 'newpipe',
  version: '1.0.0',
});

server.tool(
  'newpipe',
  `Execute a command pipeline using NewPipe — a structured shell with hang detection and diagnostics.

Unlike plain bash, NewPipe provides:
- Hang detection: automatic timeout with per-stage diagnostics showing WHERE a pipeline stalled
- Control plane signals: backpressure (PAUSE/RESUME), type negotiation (HELO/ACK), error signaling
- Structured output: framed, record-oriented data (auto-lowered to text for you)
- Per-stage exit codes: see which stage in a multi-stage pipeline failed

Supports both NewPipe smart commands (ls, cat, grep, head, jq, tree) and legacy system commands (awk, sed, curl, etc.) with automatic bridging between them.

Examples:
  "ls | grep src"          — list files, filter by pattern
  "cat data.json | jq .name | head 5" — extract fields from JSON
  "ls | head 3"            — first 3 directory entries as structured records`,
  {
    command: z.string().describe('The pipeline command to execute (e.g. "ls | grep src | head 5")'),
    timeout_ms: z.number().optional().default(30000).describe('Timeout in milliseconds. If the pipeline takes longer, it is killed and timedOut=true is returned. Default: 30000'),
    cwd: z.string().optional().describe('Working directory for the pipeline. Defaults to the server process cwd.'),
  },
  async ({ command, timeout_ms, cwd }) => {
    const opts: { timeoutMs?: number; cwd?: string } = { timeoutMs: timeout_ms };
    if (cwd !== undefined) opts.cwd = cwd;
    const result = await shell.executeCapture(command, opts);

    // Build a structured text response
    const parts: string[] = [];

    if (result.timedOut) {
      parts.push('⚠ PIPELINE TIMED OUT (possible hang detected)');
      parts.push(`Timeout: ${timeout_ms}ms`);
      parts.push('');
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
