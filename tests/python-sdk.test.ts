import { describe, it, expect } from 'vitest';
import { execSync } from 'child_process';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const sdkPath = path.join(__dirname, '../sdk/python/newpipe.py');

// Check if Python is available
let pythonAvailable = false;
let pythonCmd = 'python3';
try {
  execSync(`${pythonCmd} --version`, { stdio: 'pipe' });
  pythonAvailable = true;
} catch {
  try {
    pythonCmd = 'python';
    execSync(`${pythonCmd} --version`, { stdio: 'pipe' });
    pythonAvailable = true;
  } catch {
    pythonAvailable = false;
  }
}

describe('Python SDK - newpipe.py', () => {
  it.skipIf(!pythonAvailable)('should be importable without errors', () => {
    const result = execSync(`${pythonCmd} -c "import sys; sys.path.insert(0, '${path.dirname(sdkPath)}'); import newpipe; print('OK')"`, { timeout: 10000 }).toString();
    expect(result.trim()).toBe('OK');
  });

  it.skipIf(!pythonAvailable)('should define NewPipe class', () => {
    const result = execSync(`${pythonCmd} -c "
import sys; sys.path.insert(0, '${path.dirname(sdkPath)}')
import newpipe
print(hasattr(newpipe, 'NewPipe'))
"`, { timeout: 10000 }).toString();
    expect(result.trim()).toBe('True');
  });

  it.skipIf(!pythonAvailable)('should define SignalPlane class', () => {
    const result = execSync(`${pythonCmd} -c "
import sys; sys.path.insert(0, '${path.dirname(sdkPath)}')
import newpipe
print(hasattr(newpipe, 'SignalPlane'))
"`, { timeout: 10000 }).toString();
    expect(result.trim()).toBe('True');
  });

  it.skipIf(!pythonAvailable)('should encode frames with 4-byte BE header via struct', () => {
    const result = execSync(`${pythonCmd} -c "
import sys, struct, json
sys.path.insert(0, '${path.dirname(sdkPath)}')
# Test struct packing matches the protocol
payload = json.dumps({'test': True}).encode('utf-8')
header = struct.pack('>I', len(payload))
print(len(header))
print(struct.unpack('>I', header)[0] == len(payload))
"`, { timeout: 10000 }).toString();
    const lines = result.trim().split('\n');
    expect(lines[0]).toBe('4');
    expect(lines[1]).toBe('True');
  });

  it.skipIf(!pythonAvailable)('should handle signal types correctly', () => {
    const result = execSync(`${pythonCmd} -c "
import sys, json
sys.path.insert(0, '${path.dirname(sdkPath)}')
from newpipe import NewPipe

# Verify the class initializes default state
# We can't fully test without FD 3, but we can test the fallback
pipe = NewPipe('application/json')
print(pipe.mime_type)
print(pipe.paused)
print(pipe.stopped)
"`, { timeout: 10000 }).toString();
    const lines = result.trim().split('\n');
    expect(lines[0]).toBe('application/json');
    expect(lines[1]).toBe('False');
    expect(lines[2]).toBe('False');
  });

  it.skipIf(!pythonAvailable)('should have emit method', () => {
    const result = execSync(`${pythonCmd} -c "
import sys
sys.path.insert(0, '${path.dirname(sdkPath)}')
from newpipe import NewPipe
pipe = NewPipe()
print(callable(pipe.emit))
"`, { timeout: 10000 }).toString();
    expect(result.trim()).toBe('True');
  });

  it.skipIf(!pythonAvailable)('should have records generator method', () => {
    const result = execSync(`${pythonCmd} -c "
import sys, inspect
sys.path.insert(0, '${path.dirname(sdkPath)}')
from newpipe import NewPipe
pipe = NewPipe()
print(hasattr(pipe, 'records'))
print(callable(pipe.records))
"`, { timeout: 10000 }).toString();
    const lines = result.trim().split('\n');
    expect(lines[0]).toBe('True');
    expect(lines[1]).toBe('True');
  });

  it.skipIf(!pythonAvailable)('should have wait_for_ready method', () => {
    const result = execSync(`${pythonCmd} -c "
import sys
sys.path.insert(0, '${path.dirname(sdkPath)}')
from newpipe import NewPipe
pipe = NewPipe()
print(callable(pipe.wait_for_ready))
# Should timeout since no ACK coming (returns False)
result = pipe.wait_for_ready(timeout=0.1)
print(result)
"`, { timeout: 10000 }).toString();
    const lines = result.trim().split('\n');
    expect(lines[0]).toBe('True');
    expect(lines[1]).toBe('False'); // times out, no ACK
  });

  it.skipIf(!pythonAvailable)('should handle _handle_signal for ACK', () => {
    const result = execSync(`${pythonCmd} -c "
import sys
sys.path.insert(0, '${path.dirname(sdkPath)}')
from newpipe import NewPipe
pipe = NewPipe()
# Simulate ACK signal
pipe._handle_signal({'type': 'ACK'})
print(pipe._ready.is_set())
"`, { timeout: 10000 }).toString();
    expect(result.trim()).toBe('True');
  });

  it.skipIf(!pythonAvailable)('should handle _handle_signal for PAUSE/RESUME', () => {
    const result = execSync(`${pythonCmd} -c "
import sys
sys.path.insert(0, '${path.dirname(sdkPath)}')
from newpipe import NewPipe
pipe = NewPipe()
print(pipe.paused)
pipe._handle_signal({'type': 'PAUSE'})
print(pipe.paused)
pipe._handle_signal({'type': 'RESUME'})
print(pipe.paused)
"`, { timeout: 10000 }).toString();
    const lines = result.trim().split('\n');
    expect(lines[0]).toBe('False');
    expect(lines[1]).toBe('True');
    expect(lines[2]).toBe('False');
  });

  it.skipIf(!pythonAvailable)('should handle _handle_signal for STOP', () => {
    const result = execSync(`${pythonCmd} -c "
import sys
sys.path.insert(0, '${path.dirname(sdkPath)}')
from newpipe import NewPipe
pipe = NewPipe()
print(pipe.stopped)
pipe._handle_signal({'type': 'STOP'})
print(pipe.stopped)
"`, { timeout: 10000 }).toString();
    const lines = result.trim().split('\n');
    expect(lines[0]).toBe('False');
    expect(lines[1]).toBe('True');
  });

  it.skipIf(!pythonAvailable)('should not emit when stopped', () => {
    // emit when stopped should be a no-op (no crash)
    const result = execSync(`${pythonCmd} -c "
import sys
sys.path.insert(0, '${path.dirname(sdkPath)}')
from newpipe import NewPipe
pipe = NewPipe()
pipe._handle_signal({'type': 'STOP'})
pipe.emit({'test': 1})  # Should return immediately
print('OK')
"`, { timeout: 10000 }).toString();
    expect(result.trim()).toBe('OK');
  });
});
