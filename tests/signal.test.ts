import { describe, it, expect } from 'vitest';
import { SignalType, type SignalMessage } from '../src/core/Signal.js';

describe('SignalType', () => {
  it('should define HELO signal', () => {
    expect(SignalType.HELO).toBe('HELO');
  });

  it('should define ACK signal', () => {
    expect(SignalType.ACK).toBe('ACK');
  });

  it('should define PAUSE signal', () => {
    expect(SignalType.PAUSE).toBe('PAUSE');
  });

  it('should define RESUME signal', () => {
    expect(SignalType.RESUME).toBe('RESUME');
  });

  it('should define STOP signal', () => {
    expect(SignalType.STOP).toBe('STOP');
  });

  it('should define ERROR signal', () => {
    expect(SignalType.ERROR).toBe('ERROR');
  });

  it('should have exactly 6 signal types', () => {
    const values = Object.values(SignalType);
    expect(values).toHaveLength(6);
  });
});

describe('SignalMessage', () => {
  it('should allow creating a minimal signal message', () => {
    const msg: SignalMessage = { type: SignalType.HELO };
    expect(msg.type).toBe('HELO');
    expect(msg.mimeType).toBeUndefined();
    expect(msg.payload).toBeUndefined();
  });

  it('should allow creating a HELO with mimeType', () => {
    const msg: SignalMessage = { type: SignalType.HELO, mimeType: 'application/json' };
    expect(msg.mimeType).toBe('application/json');
  });

  it('should allow creating an ERROR with payload', () => {
    const msg: SignalMessage = { type: SignalType.ERROR, payload: { message: 'something failed' } };
    expect(msg.payload.message).toBe('something failed');
  });

  it('should serialize to valid JSON', () => {
    const msg: SignalMessage = { type: SignalType.HELO, mimeType: 'text/plain' };
    const json = JSON.stringify(msg);
    const parsed = JSON.parse(json);
    expect(parsed.type).toBe('HELO');
    expect(parsed.mimeType).toBe('text/plain');
  });
});
