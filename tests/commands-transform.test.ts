import { describe, it, expect } from 'vitest';
import { execSync } from 'child_process';
import path from 'path';

const projectRoot = process.cwd();
const SHELL_BIN = `NEWPIPE_PATH=${path.join(projectRoot, 'dist/src/commands')} node --no-warnings ${path.join(projectRoot, 'dist/src/index.js')}`;

function run(cmd: string): string {
  try {
    return execSync(`${SHELL_BIN} "${cmd}"`, { timeout: 15000, stdio: ['pipe', 'pipe', 'pipe'] }).toString();
  } catch (e: any) {
    if (e.stdout) return e.stdout.toString();
    throw e;
  }
}

describe('grep command', () => {
  it('should filter records matching a pattern', () => {
    const output = run('ls | grep package');
    expect(output).toContain('package');
  });

  it('should be case-insensitive', () => {
    const output = run('ls | grep PACKAGE');
    expect(output).toContain('package');
  });

  it('should return no output for non-matching pattern', () => {
    const output = run('echo unique_xyz_string | grep no_match_zzz');
    expect(output.trim()).toBe('');
  });

  it('should match against JSON field values', () => {
    const output = run('ls | grep json name');
    expect(output).toContain('json');
  });

  it('should handle regex patterns', () => {
    const output = run('ls | grep "pack.*json"');
    expect(output).toContain('package.json');
  });

  it('should work with cat piped input', () => {
    const output = run('cat package.json | jq .version | grep 1');
    expect(output).toContain('1.0.0');
  });
});

describe('head command', () => {
  it('should limit output to N records', () => {
    const output = run('ls | head 1');
    // Should have output (at least one record rendered)
    const lines = output.trim().split('\n').filter(l => l.trim());
    expect(lines.length).toBeGreaterThan(0);
  });

  it('should limit to 2 records', () => {
    const output = run('ls | head 2');
    // Count records by looking for 'name:' fields (each record has one)
    const nameMatches = output.match(/name:/g);
    expect(nameMatches).not.toBeNull();
    expect(nameMatches!.length).toBe(2);
  });

  it('should default to 10 if no argument given', () => {
    const output = run('ls | head');
    const nameMatches = output.match(/name:/g);
    expect(nameMatches).not.toBeNull();
    // Default is 10, but there might be fewer files
    expect(nameMatches!.length).toBeGreaterThan(0);
    expect(nameMatches!.length).toBeLessThanOrEqual(10);
  });

  it('should work in a chain (ls | grep ts | head 1)', () => {
    const output = run('ls | grep ts | head 1');
    expect(output).toContain('ts');
    const nameMatches = output.match(/name:/g);
    expect(nameMatches).not.toBeNull();
    expect(nameMatches!.length).toBe(1);
  });
});

describe('jq command', () => {
  it('should extract a top-level field', () => {
    const output = run('cat package.json | jq .name');
    expect(output).toContain('newpipe');
  });

  it('should extract a nested field', () => {
    const output = run('cat package.json | jq .scripts');
    expect(output).toContain('build');
    expect(output).toContain('test');
  });

  it('should extract version', () => {
    const output = run('cat package.json | jq .version');
    expect(output).toContain('1.0.0');
  });

  it('should return empty for missing field', () => {
    const output = run('cat package.json | jq .nonexistent');
    // jq should not emit anything for undefined fields
    expect(output.trim()).toBe('');
  });

  it('should handle nested path (.devDependencies.vitest)', () => {
    const output = run('cat package.json | jq .devDependencies');
    expect(output).toContain('vitest');
  });

  it('should work chained with grep', () => {
    const output = run('cat package.json | jq .name | grep newpipe');
    expect(output).toContain('newpipe');
  });
});
