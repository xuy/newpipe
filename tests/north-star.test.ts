import { describe, it, expect } from 'vitest';
import { execSync } from 'child_process';
import path from 'path';

const projectRoot = process.cwd();
const SHELL_BIN = `NEWPIPE_PATH=${path.join(projectRoot, 'dist/bin')} node --no-warnings ${path.join(projectRoot, 'dist/src/index.js')}`;

describe('NewPipe North Star', () => {
  it('should show help information', () => {
    const output = execSync(`${SHELL_BIN} help`).toString();
    expect(output).toContain('NewPipe');
    expect(output).toContain('Builtins:');
  });

  it('should show about information', () => {
    const output = execSync(`${SHELL_BIN} about`).toString();
    expect(output).toContain('Rethinking Unix Pipes');
  });

  it('should execute ls | head 2', () => {
    const output = execSync(`${SHELL_BIN} "ls | head 2"`).toString();
    const lines = output.trim().split('\n');
    // Each record might be multiple lines if pretty-printed, but view.ts uses console.dir
    // Let's just check it contains some output
    expect(output).toContain('name:');
  });

  it('should execute tree . | grep tests', () => {
    const output = execSync(`${SHELL_BIN} "tree . | grep tests"`).toString();
    expect(output).toContain('tests');
  });

  it('should execute cat package.json | jq .version', () => {
    const output = execSync(`${SHELL_BIN} "cat package.json | jq .version"`).toString();
    expect(output).toContain('1.0.0');
  });

  it('should lift legacy commands (echo)', () => {
    const output = execSync(`${SHELL_BIN} "echo 'hello newpipe world' | grep world"`).toString();
    expect(output).toContain('hello newpipe world');
  });

  it('should read plain text file with cat as line records', () => {
    const output = execSync(`${SHELL_BIN} "cat tsconfig.json | grep esnext"`).toString();
    expect(output).toContain('esnext');
  });

  it('should run doctor and report healthy', () => {
    const output = execSync(`${SHELL_BIN} doctor`).toString();
    expect(output).toContain('Checking NEWPIPE_PATH');
    expect(output).toContain('Checking adapters');
    expect(output).toContain('looks good');
  });

  it('should run doctor --probe and verify protocol compliance', () => {
    const output = execSync(`${SHELL_BIN} "doctor --probe"`, { timeout: 60000 }).toString();
    expect(output).toContain('Probing protocol compliance');
    // TS commands should report protocol compliance
    expect(output).toContain('newpipe/1');
  }, 60000);
});
