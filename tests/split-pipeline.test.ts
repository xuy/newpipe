import { describe, it, expect } from 'vitest';
import { splitPipeline } from '../src/core/Shell.js';

describe('splitPipeline', () => {
  it('splits simple pipes', () => {
    expect(splitPipeline('ls | head 2')).toEqual(['ls', 'head 2']);
  });

  it('splits three-stage pipeline', () => {
    expect(splitPipeline('cat file | grep foo | head 5')).toEqual(['cat file', 'grep foo', 'head 5']);
  });

  it('preserves pipes inside double quotes', () => {
    expect(splitPipeline('echo "hello | world" | grep hello')).toEqual(['echo "hello | world"', 'grep hello']);
  });

  it('preserves pipes inside single quotes', () => {
    expect(splitPipeline("echo 'a | b' | grep a")).toEqual(["echo 'a | b'", 'grep a']);
  });

  it('does not split on ||', () => {
    expect(splitPipeline('cmd1 || cmd2')).toEqual(['cmd1 || cmd2']);
  });

  it('handles || mixed with |', () => {
    expect(splitPipeline('cmd1 || cmd2 | cmd3')).toEqual(['cmd1 || cmd2', 'cmd3']);
  });

  it('handles single command', () => {
    expect(splitPipeline('git status')).toEqual(['git status']);
  });

  it('handles escaped pipe', () => {
    expect(splitPipeline('echo hello\\|world | grep hello')).toEqual(['echo hello\\|world', 'grep hello']);
  });
});
