import { describe, it, expect } from 'vitest';
import { execSync } from 'child_process';
import path from 'path';

const projectRoot = process.cwd();
const SHELL_BIN = `NEWPIPE_PATH=${path.join(projectRoot, 'dist/bin')} node --no-warnings ${path.join(projectRoot, 'dist/src/index.js')}`;

function run(cmd: string, timeout = 15000): string {
  try {
    return execSync(`${SHELL_BIN} ${cmd}`, { timeout, stdio: ['pipe', 'pipe', 'pipe'] }).toString();
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
  });

  it('should execute about builtin', () => {
    const output = run('about');
    expect(output).toContain('Rethinking Unix Pipes');
  });

  it('should execute github builtin', () => {
    const output = run('github');
    expect(output).toContain('github.com');
  });
});

describe('Shell - Adapter Injection', () => {
  it('should auto-inject lift for legacy-to-smart boundary (echo | grep)', () => {
    const output = run('"echo hello_world | grep hello"');
    expect(output).toContain('hello_world');
  });

  it('should auto-inject lower for smart-to-legacy boundary (ls | wc)', () => {
    const output = run('"ls | wc -l"');
    const lineCount = parseInt(output.trim(), 10);
    expect(lineCount).toBeGreaterThan(0);
  });

  it('should handle legacy-only pipeline without adapters (echo | tr)', () => {
    const output = run("\"echo HELLO | tr 'A-Z' 'a-z'\"");
    expect(output.trim()).toBe('hello');
  });

  it('should lift multi-word echo', () => {
    const output = run("\"echo 'foo bar baz' | grep bar\"");
    expect(output).toContain('foo bar baz');
  });

  it('should lift and filter (no match produces empty)', () => {
    const output = run('"echo test_data | grep no_match_xyz"');
    expect(output.trim()).toBe('');
  });

  it('should lower smart output and pipe to legacy (ls | rev)', () => {
    const output = run('"ls | rev"');
    expect(output.length).toBeGreaterThan(0);
  });
});

describe('Shell - Auto View', () => {
  it('should auto-append view when last command is smart', () => {
    const output = run('"ls | head 1"');
    expect(output).toContain('name:');
  });

  it('should not double-view when view is explicit', () => {
    const output = run('"ls | head 1 | view"');
    expect(output).toContain('name:');
  });
});

describe('Shell - Command Resolution', () => {
  it('should resolve smart commands from NEWPIPE_PATH', () => {
    const output = run('"cat package.json | jq .name"');
    expect(output).toContain('newpipe');
  });

  it('should resolve legacy commands from system PATH', () => {
    const output = run('"echo system_path_test"');
    expect(output).toContain('system_path_test');
  });
});
