import { describe, it, expect } from 'vitest';
import { FrameUtils, type Frame } from '../src/core/Frame.js';

describe('FrameUtils', () => {
  describe('encode', () => {
    it('should encode a payload with a 4-byte BE length header', () => {
      const payload = Buffer.from('hello');
      const encoded = FrameUtils.encode(payload);
      expect(encoded.length).toBe(4 + 5); // 4-byte header + 5-byte payload
      expect(encoded.readUInt32BE(0)).toBe(5);
      expect(encoded.subarray(4).toString()).toBe('hello');
    });

    it('should encode an empty payload', () => {
      const payload = Buffer.alloc(0);
      const encoded = FrameUtils.encode(payload);
      expect(encoded.length).toBe(4);
      expect(encoded.readUInt32BE(0)).toBe(0);
    });

    it('should encode a single-byte payload', () => {
      const payload = Buffer.from([0x42]);
      const encoded = FrameUtils.encode(payload);
      expect(encoded.length).toBe(5);
      expect(encoded.readUInt32BE(0)).toBe(1);
      expect(encoded[4]).toBe(0x42);
    });

    it('should encode a large payload (64KB)', () => {
      const payload = Buffer.alloc(65536, 0xAB);
      const encoded = FrameUtils.encode(payload);
      expect(encoded.length).toBe(4 + 65536);
      expect(encoded.readUInt32BE(0)).toBe(65536);
      expect(encoded[4]).toBe(0xAB);
      expect(encoded[encoded.length - 1]).toBe(0xAB);
    });

    it('should encode binary data correctly', () => {
      const payload = Buffer.from([0x00, 0xFF, 0x01, 0xFE]);
      const encoded = FrameUtils.encode(payload);
      expect(encoded.readUInt32BE(0)).toBe(4);
      expect(encoded[4]).toBe(0x00);
      expect(encoded[5]).toBe(0xFF);
      expect(encoded[6]).toBe(0x01);
      expect(encoded[7]).toBe(0xFE);
    });

    it('should encode JSON string payload', () => {
      const json = JSON.stringify({ name: 'test', value: 42 });
      const payload = Buffer.from(json);
      const encoded = FrameUtils.encode(payload);
      expect(encoded.readUInt32BE(0)).toBe(payload.length);
      expect(encoded.subarray(4).toString()).toBe(json);
    });
  });

  describe('decode', () => {
    it('should decode a valid frame', () => {
      const payload = Buffer.from('hello');
      const buffer = Buffer.alloc(4 + 5);
      buffer.writeUInt32BE(5, 0);
      payload.copy(buffer, 4);

      const frame = FrameUtils.decode(buffer);
      expect(frame).not.toBeNull();
      expect(frame!.payload.toString()).toBe('hello');
    });

    it('should return null for buffer shorter than header size', () => {
      const buffer = Buffer.alloc(3);
      expect(FrameUtils.decode(buffer)).toBeNull();
    });

    it('should return null for empty buffer', () => {
      const buffer = Buffer.alloc(0);
      expect(FrameUtils.decode(buffer)).toBeNull();
    });

    it('should return null for incomplete frame (header says more data than available)', () => {
      const buffer = Buffer.alloc(4 + 2);
      buffer.writeUInt32BE(10, 0); // claims 10 bytes but only 2 available
      expect(FrameUtils.decode(buffer)).toBeNull();
    });

    it('should decode a zero-length payload frame', () => {
      const buffer = Buffer.alloc(4);
      buffer.writeUInt32BE(0, 0);
      const frame = FrameUtils.decode(buffer);
      expect(frame).not.toBeNull();
      expect(frame!.payload.length).toBe(0);
    });

    it('should decode only the first frame when buffer has extra data', () => {
      const buffer = Buffer.alloc(4 + 3 + 10); // header + 3-byte payload + extra
      buffer.writeUInt32BE(3, 0);
      buffer.write('abc', 4);
      const frame = FrameUtils.decode(buffer);
      expect(frame).not.toBeNull();
      expect(frame!.payload.toString()).toBe('abc');
    });
  });

  describe('round-trip', () => {
    it('should round-trip a text payload', () => {
      const original = Buffer.from('hello world');
      const encoded = FrameUtils.encode(original);
      const decoded = FrameUtils.decode(encoded);
      expect(decoded).not.toBeNull();
      expect(decoded!.payload.toString()).toBe('hello world');
    });

    it('should round-trip an empty payload', () => {
      const original = Buffer.alloc(0);
      const encoded = FrameUtils.encode(original);
      const decoded = FrameUtils.decode(encoded);
      expect(decoded).not.toBeNull();
      expect(decoded!.payload.length).toBe(0);
    });

    it('should round-trip a JSON payload', () => {
      const obj = { key: 'value', nested: { a: 1 } };
      const original = Buffer.from(JSON.stringify(obj));
      const encoded = FrameUtils.encode(original);
      const decoded = FrameUtils.decode(encoded);
      expect(decoded).not.toBeNull();
      expect(JSON.parse(decoded!.payload.toString())).toEqual(obj);
    });

    it('should round-trip binary data with all byte values', () => {
      const original = Buffer.alloc(256);
      for (let i = 0; i < 256; i++) original[i] = i;
      const encoded = FrameUtils.encode(original);
      const decoded = FrameUtils.decode(encoded);
      expect(decoded).not.toBeNull();
      expect(Buffer.compare(decoded!.payload, original)).toBe(0);
    });

    it('should round-trip a large payload (1MB)', () => {
      const original = Buffer.alloc(1024 * 1024, 0x55);
      const encoded = FrameUtils.encode(original);
      const decoded = FrameUtils.decode(encoded);
      expect(decoded).not.toBeNull();
      expect(decoded!.payload.length).toBe(1024 * 1024);
      expect(decoded!.payload[0]).toBe(0x55);
    });
  });

  describe('HEADER_SIZE', () => {
    it('should be 4 bytes', () => {
      expect(FrameUtils.HEADER_SIZE).toBe(4);
    });
  });
});
