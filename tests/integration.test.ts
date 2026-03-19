import { describe, it, expect } from 'vitest';
import { execSync } from 'child_process';
import path from 'path';
import fs from 'fs';

const projectRoot = process.cwd();
const SHELL_BIN = `NEWPIPE_PATH=${path.join(projectRoot, 'dist/bin')} node --no-warnings ${path.join(projectRoot, 'dist/src/index.js')}`;

function run(cmd: string, timeout = 15000): string {
  try {
    return execSync(`${SHELL_BIN} "${cmd}"`, { timeout, stdio: ['pipe', 'pipe', 'pipe'] }).toString();
  } catch (e: any) {
    if (e.stdout) return e.stdout.toString();
    throw e;
  }
}

function runRaw(cmd: string, timeout = 15000): { stdout: string; stderr: string } {
  try {
    const stdout = execSync(`${SHELL_BIN} "${cmd}"`, { timeout, stdio: ['pipe', 'pipe', 'pipe'] }).toString();
    return { stdout, stderr: '' };
  } catch (e: any) {
    return { stdout: e.stdout?.toString() || '', stderr: e.stderr?.toString() || '' };
  }
}

// --- Producer commands ---

describe('cat command', () => {
  it('should read a JSON file and extract fields', () => {
    const output = run('cat package.json | jq .name');
    expect(output).toContain('newpipe');
  });

  it('should read JSONL and emit each line as a record', () => {
    const tmpFile = path.join(projectRoot, 'tests/tmp_test.jsonl');
    fs.writeFileSync(tmpFile, '{"a":1}\n{"a":2}\n{"a":3}\n');
    try {
      const output = run(`cat ${tmpFile} | head 3`);
      expect(output).toContain('1');
      expect(output).toContain('2');
      expect(output).toContain('3');
    } finally {
      fs.unlinkSync(tmpFile);
    }
  });

  it('should read plain text as line records', () => {
    const output = run('cat tsconfig.json | grep esnext');
    expect(output).toContain('esnext');
  });
});

describe('ls command', () => {
  it('should emit records with expected fields', () => {
    const output = run('ls | head 1');
    expect(output).toContain('name:');
    expect(output).toContain('size:');
    expect(output).toContain('isDirectory:');
  });

  it('should list a specific directory', () => {
    const output = run('ls src | head 3');
    expect(output).toContain('name');
  });

  it('should show directories with isDirectory: true', () => {
    const output = run('ls | grep src');
    expect(output).toMatch(/isDirectory:.*true/);
  });
});

describe('tree command', () => {
  it('should include depth field', () => {
    const output = run('tree src | head 5');
    expect(output).toContain('depth:');
  });

  it('should be filterable by grep', () => {
    const output = run('tree . | grep tests');
    expect(output).toContain('tests');
  });
});

// --- Transform commands ---

describe('grep command', () => {
  it('should filter records matching a pattern', () => {
    const output = run('ls | grep package');
    expect(output).toContain('package');
  });

  it('should be case-insensitive', () => {
    const output = run('ls | grep PACKAGE');
    expect(output).toContain('package');
  });

  it('should return empty for non-matching pattern', () => {
    const output = run('echo unique_xyz_string | grep no_match_zzz');
    expect(output.trim()).toBe('');
  });

  it('should handle regex patterns', () => {
    const output = run('ls | grep "pack.*json"');
    expect(output).toContain('package.json');
  });
});

describe('head command', () => {
  it('should limit to N records', () => {
    const output = run('ls | head 2');
    const nameMatches = output.match(/name:/g);
    expect(nameMatches).not.toBeNull();
    expect(nameMatches!.length).toBe(2);
  });

  it('should work in a chain (ls | grep | head)', () => {
    const output = run('ls | grep ts | head 1');
    expect(output).toContain('ts');
    const nameMatches = output.match(/name:/g);
    expect(nameMatches!.length).toBe(1);
  });
});

describe('jq command', () => {
  it('should extract a top-level field', () => {
    const output = run('cat package.json | jq .name');
    expect(output).toContain('newpipe');
  });

  it('should extract version', () => {
    const output = run('cat package.json | jq .version');
    expect(output).toContain('1.0.0');
  });

  it('should return empty for missing field', () => {
    const output = run('cat package.json | jq .nonexistent');
    expect(output.trim()).toBe('');
  });

  it('should work chained with grep', () => {
    const output = run('cat package.json | jq .name | grep newpipe');
    expect(output).toContain('newpipe');
  });
});

// --- Multi-stage and edge cases ---

describe('Multi-stage pipelines', () => {
  it('should handle 3-stage smart pipeline (ls | grep | head)', () => {
    const output = run('ls | grep ts | head 2');
    expect(output).toContain('ts');
  });

  it('should handle cat | jq | grep chain', () => {
    const output = run('cat package.json | jq .scripts | grep build');
    expect(output).toContain('build');
  });

  it('should handle tree | grep | head chain', () => {
    const output = run('tree src | grep core | head 3');
    expect(output).toContain('core');
  });
});

describe('Data integrity', () => {
  it('should preserve all fields through a pipeline', () => {
    const output = run('ls | head 1');
    expect(output).toContain('name:');
    expect(output).toContain('path:');
    expect(output).toContain('size:');
    expect(output).toContain('isDirectory:');
    expect(output).toContain('mtime:');
  });

  it('should handle JSONL with multiple records', () => {
    const tmpFile = path.join(projectRoot, 'tests/tmp_integrity.jsonl');
    const records = Array.from({ length: 5 }, (_, i) => JSON.stringify({ id: i, value: `item_${i}` }));
    fs.writeFileSync(tmpFile, records.join('\n') + '\n');
    try {
      const output = run(`cat ${tmpFile} | head 5`);
      for (let i = 0; i < 5; i++) {
        expect(output).toContain(`item_${i}`);
      }
    } finally {
      fs.unlinkSync(tmpFile);
    }
  });
});

describe('Edge cases', () => {
  it('should handle empty grep result gracefully', () => {
    const output = run('echo abc | grep xyz_no_match');
    expect(output.trim()).toBe('');
  });

  it('should handle unicode text', () => {
    const output = run("echo 日本語テスト | grep テスト");
    expect(output).toContain('テスト');
  });

  it('should handle special characters in echo', () => {
    const output = run("echo 'hello & world' | grep hello");
    expect(output).toContain('hello');
  });
});

describe('Python SDK signal plane', () => {
  // Regression: SDK used `fd` parameter instead of `self.fd`, causing
  // SignalPlane to silently fail when fd was resolved from env var
  it('should route signals between Python commands (gen | filter)', () => {
    const output = run('gen | filter source python | head 1');
    expect(output).toContain('python-sdk');
  });

  it('should route signals through multi-stage Python pipeline (gen | filter | head)', () => {
    const output = run('gen | filter index 1 | head 1');
    expect(output).toContain('index');
  });
});

describe('Error handling', () => {
  it('should handle nonexistent command gracefully', () => {
    const result = runRaw('nonexistent_cmd_xyz');
    expect(result.stdout.trim() === '' || result.stderr.length > 0).toBe(true);
  });

  it('should handle cat with nonexistent file', () => {
    const result = runRaw('cat /tmp/definitely_does_not_exist_xyz.txt | head 1');
    expect(result.stderr.includes('error') || result.stderr.includes('Error') || result.stdout.trim() === '').toBe(true);
  });
});
