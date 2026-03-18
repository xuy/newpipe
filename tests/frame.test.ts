import { describe, it, expect } from 'vitest';
import { FrameUtils } from '../src/core/Frame.js';

describe('FrameUtils', () => {
  it('should encode a payload with 4-byte big-endian length prefix', () => {
    const payload = Buffer.from('hello');
    const encoded = FrameUtils.encode(payload);

    expect(encoded.length).toBe(4 + 5); // 4 header + 5 payload
    expect(encoded.readUInt32BE(0)).toBe(5);
    expect(encoded.subarray(4).toString()).toBe('hello');
  });

  it('should decode a valid frame', () => {
    const payload = Buffer.from('test data');
    const encoded = FrameUtils.encode(payload);
    const frame = FrameUtils.decode(encoded);

    expect(frame).not.toBeNull();
    expect(frame!.payload.toString()).toBe('test data');
  });

  it('should return null for buffer shorter than header', () => {
    const buf = Buffer.alloc(2);
    expect(FrameUtils.decode(buf)).toBeNull();
  });

  it('should return null for incomplete frame (header says more data than available)', () => {
    const buf = Buffer.alloc(4);
    buf.writeUInt32BE(100, 0); // claims 100 bytes of payload
    expect(FrameUtils.decode(buf)).toBeNull();
  });

  it('should handle empty payload', () => {
    const payload = Buffer.alloc(0);
    const encoded = FrameUtils.encode(payload);

    expect(encoded.length).toBe(4);
    expect(encoded.readUInt32BE(0)).toBe(0);

    const frame = FrameUtils.decode(encoded);
    expect(frame).not.toBeNull();
    expect(frame!.payload.length).toBe(0);
  });

  it('should roundtrip JSON data', () => {
    const data = { name: 'test', value: 42 };
    const payload = Buffer.from(JSON.stringify(data));
    const encoded = FrameUtils.encode(payload);
    const frame = FrameUtils.decode(encoded);

    expect(JSON.parse(frame!.payload.toString())).toEqual(data);
  });
});
