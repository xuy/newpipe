import { describe, it, expect } from 'vitest';
import { SmartPipe } from '../src/core/SmartPipe.js';
import { FrameUtils } from '../src/core/Frame.js';
import { Writable } from 'stream';

function collectFrames(pipe: SmartPipe): Promise<any[]> {
  return new Promise((resolve) => {
    const frames: any[] = [];
    pipe.on('data', (frame: any) => frames.push(frame));
    pipe.on('end', () => resolve(frames));
  });
}

describe('SmartPipe', () => {
  describe('_transform (frame decoding)', () => {
    it('should decode a single complete frame', async () => {
      const pipe = new SmartPipe();
      const collecting = collectFrames(pipe);

      const payload = Buffer.from('hello');
      pipe.write(FrameUtils.encode(payload));
      pipe.end();

      const frames = await collecting;
      expect(frames).toHaveLength(1);
      expect(frames[0].payload.toString()).toBe('hello');
    });

    it('should decode two concatenated frames', async () => {
      const pipe = new SmartPipe();
      const collecting = collectFrames(pipe);

      const frame1 = FrameUtils.encode(Buffer.from('first'));
      const frame2 = FrameUtils.encode(Buffer.from('second'));
      pipe.write(Buffer.concat([frame1, frame2]));
      pipe.end();

      const frames = await collecting;
      expect(frames).toHaveLength(2);
      expect(frames[0].payload.toString()).toBe('first');
      expect(frames[1].payload.toString()).toBe('second');
    });

    it('should handle a frame split across two chunks', async () => {
      const pipe = new SmartPipe();
      const collecting = collectFrames(pipe);

      const encoded = FrameUtils.encode(Buffer.from('split-me'));
      const mid = Math.floor(encoded.length / 2);
      pipe.write(encoded.subarray(0, mid));
      pipe.write(encoded.subarray(mid));
      pipe.end();

      const frames = await collecting;
      expect(frames).toHaveLength(1);
      expect(frames[0].payload.toString()).toBe('split-me');
    });

    it('should handle header split across chunks', async () => {
      const pipe = new SmartPipe();
      const collecting = collectFrames(pipe);

      const encoded = FrameUtils.encode(Buffer.from('test'));
      // Split in the middle of the 4-byte header
      pipe.write(encoded.subarray(0, 2));
      pipe.write(encoded.subarray(2));
      pipe.end();

      const frames = await collecting;
      expect(frames).toHaveLength(1);
      expect(frames[0].payload.toString()).toBe('test');
    });

    it('should emit nothing for empty input', async () => {
      const pipe = new SmartPipe();
      const collecting = collectFrames(pipe);
      pipe.end();
      const frames = await collecting;
      expect(frames).toHaveLength(0);
    });

    it('should decode a zero-length payload frame', async () => {
      const pipe = new SmartPipe();
      const collecting = collectFrames(pipe);

      pipe.write(FrameUtils.encode(Buffer.alloc(0)));
      pipe.end();

      const frames = await collecting;
      expect(frames).toHaveLength(1);
      expect(frames[0].payload.length).toBe(0);
    });

    it('should decode many frames sent one byte at a time', async () => {
      const pipe = new SmartPipe();
      const collecting = collectFrames(pipe);

      const frame1 = FrameUtils.encode(Buffer.from('a'));
      const frame2 = FrameUtils.encode(Buffer.from('b'));
      const combined = Buffer.concat([frame1, frame2]);

      for (let i = 0; i < combined.length; i++) {
        pipe.write(Buffer.from([combined[i]!]));
      }
      pipe.end();

      const frames = await collecting;
      expect(frames).toHaveLength(2);
      expect(frames[0].payload.toString()).toBe('a');
      expect(frames[1].payload.toString()).toBe('b');
    });

    it('should handle string input (non-Buffer)', async () => {
      const pipe = new SmartPipe();
      const collecting = collectFrames(pipe);

      const encoded = FrameUtils.encode(Buffer.from('text'));
      // Write as a hex string which Buffer.from can handle
      pipe.write(encoded);
      pipe.end();

      const frames = await collecting;
      expect(frames).toHaveLength(1);
      expect(frames[0].payload.toString()).toBe('text');
    });

    it('should decode frames with JSON payloads', async () => {
      const pipe = new SmartPipe();
      const collecting = collectFrames(pipe);

      const obj = { name: 'test', value: 42 };
      pipe.write(FrameUtils.encode(Buffer.from(JSON.stringify(obj))));
      pipe.end();

      const frames = await collecting;
      expect(frames).toHaveLength(1);
      expect(JSON.parse(frames[0].payload.toString())).toEqual(obj);
    });
  });

  describe('wrap (static method)', () => {
    it('should wrap an object as a framed JSON buffer', () => {
      const data = { key: 'value' };
      const wrapped = SmartPipe.wrap(data);
      expect(Buffer.isBuffer(wrapped)).toBe(true);

      const payloadLength = wrapped.readUInt32BE(0);
      const payload = wrapped.subarray(4, 4 + payloadLength);
      expect(JSON.parse(payload.toString())).toEqual(data);
    });

    it('should wrap a string as a framed buffer', () => {
      const data = 'hello';
      const wrapped = SmartPipe.wrap(data);

      const payloadLength = wrapped.readUInt32BE(0);
      const payload = wrapped.subarray(4, 4 + payloadLength);
      // wrap stringifies non-Buffer data
      expect(JSON.parse(payload.toString())).toBe('hello');
    });

    it('should wrap a Buffer directly', () => {
      const buf = Buffer.from('raw bytes');
      const wrapped = SmartPipe.wrap(buf);

      const payloadLength = wrapped.readUInt32BE(0);
      const payload = wrapped.subarray(4, 4 + payloadLength);
      expect(payload.toString()).toBe('raw bytes');
    });

    it('should wrap a number', () => {
      const wrapped = SmartPipe.wrap(42);
      const payloadLength = wrapped.readUInt32BE(0);
      const payload = wrapped.subarray(4, 4 + payloadLength);
      expect(JSON.parse(payload.toString())).toBe(42);
    });

    it('should wrap an array', () => {
      const data = [1, 2, 3];
      const wrapped = SmartPipe.wrap(data);
      const payloadLength = wrapped.readUInt32BE(0);
      const payload = wrapped.subarray(4, 4 + payloadLength);
      expect(JSON.parse(payload.toString())).toEqual([1, 2, 3]);
    });

    it('should wrap null', () => {
      const wrapped = SmartPipe.wrap(null);
      const payloadLength = wrapped.readUInt32BE(0);
      const payload = wrapped.subarray(4, 4 + payloadLength);
      expect(JSON.parse(payload.toString())).toBeNull();
    });

    it('should produce output decodable by SmartPipe transform', async () => {
      const pipe = new SmartPipe();
      const collecting = collectFrames(pipe);

      const data = { test: true };
      pipe.write(SmartPipe.wrap(data));
      pipe.end();

      const frames = await collecting;
      expect(frames).toHaveLength(1);
      expect(JSON.parse(frames[0].payload.toString())).toEqual({ test: true });
    });
  });

  describe('object mode', () => {
    it('should operate in object mode (emit objects, not buffers)', async () => {
      const pipe = new SmartPipe();
      const collecting = collectFrames(pipe);

      pipe.write(FrameUtils.encode(Buffer.from('test')));
      pipe.end();

      const frames = await collecting;
      expect(frames[0]).toHaveProperty('payload');
    });
  });
});
