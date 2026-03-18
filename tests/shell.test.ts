import { describe, it, expect } from 'vitest';
import { execSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SHELL_BIN = `NEWPIPE_PATH=${path.join(__dirname, '../dist/bin')} node --no-warnings --loader ts-node/esm ${path.join(__dirname, '../src/index.ts')}`;

function run(cmd: string): string {
  try {
    return execSync(`${SHELL_BIN} ${cmd}`, { timeout: 15000, stdio: ['pipe', 'pipe', 'pipe'] }).toString();
  } catch (e: any) {
    if (e.stdout) return e.stdout.toString();
    throw e;
  }
}

describe('Shell - Builtins', () => {
  it('should execute help builtin', () => {
    const output = run('help');
    expect(output).toContain('NewPipe');
    expect(output).toContain('Commands:');
    expect(output).toContain('ls');
  });

  it('should execute about builtin', () => {
    const output = run('about');
    expect(output).toContain('Rethinking Unix Pipes');
    expect(output).toContain('Control Flow Signaling');
  });

  it('should execute github builtin', () => {
    const output = run('github');
    expect(output).toContain('github.com');
  });

  it('should execute install builtin', () => {
    const output = run('install');
    expect(output).toContain('installed');
  });

  it('should execute agent builtin', () => {
    const output = run('agent');
    expect(output).toContain('Agent');
  });

  it('should show usage with no arguments', () => {
    const output = run('');
    expect(output).toContain('NewPipe Shell');
  });
});

describe('Shell - Pipeline Parsing', () => {
  it('should parse a single command', () => {
    const output = run('"ls"');
    expect(output.length).toBeGreaterThan(0);
  });

  it('should parse two piped commands', () => {
    const output = run('"ls | head 2"');
    expect(output).toContain('name');
  });

  it('should parse three piped commands', () => {
    const output = run('"ls | grep ts | head 3"');
    expect(output.length).toBeGreaterThan(0);
  });

  it('should handle whitespace around pipe symbols', () => {
    const output = run('"ls  |  head 2"');
    expect(output).toContain('name');
  });
});

describe('Shell - Smart/Legacy Detection & Adapter Injection', () => {
  it('should auto-inject lift for legacy-to-smart boundary (echo | grep)', () => {
    const output = run('"echo hello_world | grep hello"');
    expect(output).toContain('hello_world');
  });

  it('should auto-inject lower for smart-to-legacy boundary (ls | wc)', () => {
    // ls is smart, wc is legacy; shell should inject lower between them
    const output = run('"ls | wc -l"');
    const lineCount = parseInt(output.trim(), 10);
    expect(lineCount).toBeGreaterThan(0);
  });

  it('should handle legacy | legacy without adapters (echo | wc)', () => {
    const output = run('"echo hello | wc -c"');
    const charCount = parseInt(output.trim(), 10);
    expect(charCount).toBeGreaterThan(0);
  });
});

describe('Shell - Auto View Appending', () => {
  it('should auto-append view when last command is smart (ls)', () => {
    // ls is smart, terminal output should go through view
    const output = run('"ls | head 1"');
    expect(output).toContain('name');
  });

  it('should not double-view when view is explicitly piped', () => {
    const output = run('"ls | head 1 | view"');
    expect(output).toContain('name');
  });
});

describe('Shell - Command Resolution', () => {
  it('should resolve smart commands from NEWPIPE_PATH', () => {
    // ls, grep, head, cat, jq are all smart commands in NEWPIPE_PATH
    const output = run('"cat package.json | jq .name"');
    expect(output).toContain('newpipe');
  });

  it('should resolve legacy commands from system PATH', () => {
    const output = run('"echo system_path_test"');
    expect(output).toContain('system_path_test');
  });
});
