import { describe, it, expect } from 'vitest';
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

const projectRoot = process.cwd();
const binDir = path.join(projectRoot, 'dist/bin');
const SHELL_BIN = `NEWPIPE_PATH=${binDir} node --no-warnings ${path.join(projectRoot, 'dist/src/index.js')}`;

describe('Command shims', () => {
  const shims = fs.readdirSync(binDir).filter(f => {
    const full = path.join(binDir, f);
    return fs.statSync(full).isFile() && fs.statSync(full).size > 0 && !f.startsWith('.');
  });

  it('should have no empty or junk files in dist/bin', () => {
    const junk = fs.readdirSync(binDir).filter(f => {
      const full = path.join(binDir, f);
      return f.startsWith('.') || fs.statSync(full).size === 0;
    });
    expect(junk).toEqual([]);
  });

  it('should have no orphaned signal command', () => {
    expect(shims).not.toContain('signal');
  });

  describe('Python shims point to existing files', () => {
    const pythonShims = shims.filter(name => {
      const content = fs.readFileSync(path.join(binDir, name), 'utf-8');
      return content.includes('uv run');
    });

    for (const name of pythonShims) {
      it(`${name} shim target exists`, () => {
        const content = fs.readFileSync(path.join(binDir, name), 'utf-8');
        const match = content.match(/uv run "([^"]+)"/);
        expect(match).not.toBeNull();
        const target = match![1]!;
        expect(fs.existsSync(target)).toBe(true);
      });
    }
  });

  describe('TypeScript shims point to existing files', () => {
    const tsShims = shims.filter(name => {
      const content = fs.readFileSync(path.join(binDir, name), 'utf-8');
      return content.includes('node --no-warnings') && !content.includes('uv run');
    });

    for (const name of tsShims) {
      it(`${name} shim target exists`, () => {
        const content = fs.readFileSync(path.join(binDir, name), 'utf-8');
        const match = content.match(/node --no-warnings "([^"]+)"/);
        expect(match).not.toBeNull();
        const target = match![1]!;
        expect(fs.existsSync(target)).toBe(true);
      });
    }
  });
});

describe('Adapter injection', () => {
  it('should inject lift when legacy pipes to smart (echo | grep)', () => {
    const output = execSync(`${SHELL_BIN} "echo hello | grep hello"`, { timeout: 10000 }).toString();
    expect(output).toContain('hello');
  });

  it('should inject lower when smart pipes to legacy (ls | wc)', () => {
    const output = execSync(`${SHELL_BIN} "ls | wc -l"`, { timeout: 10000 }).toString();
    const count = parseInt(output.trim());
    expect(count).toBeGreaterThan(0);
  });
});

describe('Pipeline execution', () => {
  it('should handle smart-only pipeline (ls | head 1)', () => {
    const output = execSync(`${SHELL_BIN} "ls | head 1"`, { timeout: 10000 }).toString();
    expect(output).toContain('name:');
  });

  it('should handle multi-stage smart pipeline (ls | grep ts | head 2)', () => {
    const output = execSync(`${SHELL_BIN} "ls | grep ts | head 2"`, { timeout: 10000 }).toString();
    expect(output).toContain('ts');
  });

  it('should handle cat on JSON file (cat package.json | jq .name)', () => {
    const output = execSync(`${SHELL_BIN} "cat package.json | jq .name"`, { timeout: 10000 }).toString();
    expect(output).toContain('newpipe');
  });
});
