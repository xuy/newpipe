import { describe, it, expect } from 'vitest';
import { execSync } from 'child_process';
import path from 'path';
import fs from 'fs';

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

describe('cat command', () => {
  it('should read a JSON file and emit as single record', () => {
    const output = run('cat package.json | jq .name');
    expect(output).toContain('newpipe');
  });

  it('should read a JSONL file and emit each line', () => {
    // Create a temp jsonl file
    const tmpFile = path.join(__dirname, 'tmp_test.jsonl');
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

  it('should read a plain text file as line records', () => {
    const output = run('cat tsconfig.json | grep esnext');
    expect(output).toContain('esnext');
  });

  it('should handle text files piped through head', () => {
    const output = run('cat tsconfig.json | head 3');
    const lines = output.trim().split('\n').filter(l => l.trim());
    expect(lines.length).toBeGreaterThan(0);
  });

  it('should detect .json extension and set correct mime type', () => {
    const output = run('cat package.json | jq .version');
    expect(output).toContain('1.0.0');
  });
});

describe('ls command', () => {
  it('should list files in current directory', () => {
    const output = run('ls | head 3');
    expect(output).toContain('name');
  });

  it('should emit records with expected fields', () => {
    const output = run('ls | head 1');
    expect(output).toContain('name:');
    expect(output).toContain('path:');
    expect(output).toContain('size:');
    expect(output).toContain('isDirectory:');
  });

  it('should list a specific directory', () => {
    const output = run('ls src | head 3');
    expect(output).toContain('name');
  });

  it('should list files filterable by grep', () => {
    const output = run('ls | grep package | head 1');
    expect(output).toContain('package');
  });

  it('should show directories with isDirectory: true', () => {
    const output = run('ls | grep src');
    // view.ts uses console.dir which adds ANSI color codes
    expect(output).toContain('isDirectory:');
    expect(output).toMatch(/isDirectory:.*true/);
  });
});

describe('tree command', () => {
  it('should recurse into directories', () => {
    const output = run('tree src | head 10');
    expect(output).toContain('name');
    expect(output).toContain('depth');
  });

  it('should include depth field in output', () => {
    const output = run('tree src | head 5');
    expect(output).toContain('depth:');
  });

  it('should include isDirectory field', () => {
    const output = run('tree src | head 5');
    expect(output).toContain('isDirectory:');
  });

  it('should be filterable by grep', () => {
    const output = run('tree . | grep tests');
    expect(output).toContain('tests');
  });

  it('should handle the tests directory', () => {
    const output = run('tree tests | head 5');
    expect(output).toContain('test');
  });
});

describe('bcat command', () => {
  it('should stream a binary file', () => {
    // Create a small binary file for testing
    const tmpFile = path.join(__dirname, 'tmp_binary.bin');
    fs.writeFileSync(tmpFile, Buffer.from([0x00, 0x01, 0x02, 0xFF]));
    try {
      const output = run(`bcat ${tmpFile}`);
      // bcat outputs via view which shows binary record info
      expect(output).toContain('Binary Record');
    } finally {
      fs.unlinkSync(tmpFile);
    }
  });
});
