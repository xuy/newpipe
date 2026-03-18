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

describe('NewPipe North Star', () => {
  it('should show help information', () => {
    const output = run('help');
    expect(output).toContain('NewPipe');
    expect(output).toContain('Commands:');
  });

  it('should show about information', () => {
    const output = run('about');
    expect(output).toContain('Rethinking Unix Pipes');
  });

  it('should execute ls | head 2', () => {
    const output = run('"ls | head 2"');
    // Each record might be multiple lines if pretty-printed, but view.ts uses console.dir
    // Let's just check it contains some output
    expect(output).toContain('name:');
  });

  it('should execute tree . | grep tests', () => {
    const output = run('"tree . | grep tests"');
    expect(output).toContain('tests');
  });

  it('should execute cat package.json | jq .version', () => {
    const output = run('"cat package.json | jq .version"');
    expect(output).toContain('1.0.0');
  });

  it('should lift legacy commands (echo)', () => {
    const output = run('"echo \'hello newpipe world\' | grep world"');
    expect(output).toContain('hello newpipe world');
  });

  it('should read plain text file with cat as line records', () => {
    const output = run('"cat tsconfig.json | grep esnext"');
    expect(output).toContain('esnext');
  });
});
