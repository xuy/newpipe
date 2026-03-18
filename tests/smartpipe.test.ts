import { describe, it, expect } from 'vitest';
import { SmartPipe } from '../src/core/SmartPipe.js';
import { FrameUtils, type Frame } from '../src/core/Frame.js';
import { Readable } from 'stream';

function collectFrames(pipe: SmartPipe): Promise<Frame[]> {
  return new Promise((resolve) => {
    const frames: Frame[] = [];
    pipe.on('data', (frame: Frame) => frames.push(frame));
    pipe.on('end', () => resolve(frames));
  });
}

describe('SmartPipe', () => {
  it('should decode a single frame from a stream', async () => {
    const pipe = new SmartPipe();
    const payload = Buffer.from('hello');
    const encoded = FrameUtils.encode(payload);

    const promise = collectFrames(pipe);
    pipe.write(encoded);
    pipe.end();

    const frames = await promise;
    expect(frames).toHaveLength(1);
    expect(frames[0]!.payload.toString()).toBe('hello');
  });

  it('should decode multiple frames from a single chunk', async () => {
    const pipe = new SmartPipe();
    const frame1 = FrameUtils.encode(Buffer.from('first'));
    const frame2 = FrameUtils.encode(Buffer.from('second'));
    const combined = Buffer.concat([frame1, frame2]);

    const promise = collectFrames(pipe);
    pipe.write(combined);
    pipe.end();

    const frames = await promise;
    expect(frames).toHaveLength(2);
    expect(frames[0]!.payload.toString()).toBe('first');
    expect(frames[1]!.payload.toString()).toBe('second');
  });

  it('should handle frames split across multiple chunks', async () => {
    const pipe = new SmartPipe();
    const payload = Buffer.from('split-test');
    const encoded = FrameUtils.encode(payload);

    // Split the encoded frame in the middle
    const mid = Math.floor(encoded.length / 2);
    const chunk1 = encoded.subarray(0, mid);
    const chunk2 = encoded.subarray(mid);

    const promise = collectFrames(pipe);
    pipe.write(chunk1);
    pipe.write(chunk2);
    pipe.end();

    const frames = await promise;
    expect(frames).toHaveLength(1);
    expect(frames[0]!.payload.toString()).toBe('split-test');
  });

  it('should handle byte-at-a-time delivery', async () => {
    const pipe = new SmartPipe();
    const payload = Buffer.from('hi');
    const encoded = FrameUtils.encode(payload);

    const promise = collectFrames(pipe);
    for (let i = 0; i < encoded.length; i++) {
      pipe.write(Buffer.from([encoded[i]!]));
    }
    pipe.end();

    const frames = await promise;
    expect(frames).toHaveLength(1);
    expect(frames[0]!.payload.toString()).toBe('hi');
  });

  it('wrap() should frame a JSON object', () => {
    const data = { key: 'value' };
    const wrapped = SmartPipe.wrap(data);

    const frame = FrameUtils.decode(wrapped);
    expect(frame).not.toBeNull();
    expect(JSON.parse(frame!.payload.toString())).toEqual(data);
  });

  it('wrap() should frame a string as-is when passed a Buffer', () => {
    const buf = Buffer.from('raw bytes');
    const wrapped = SmartPipe.wrap(buf);

    const frame = FrameUtils.decode(wrapped);
    expect(frame).not.toBeNull();
    expect(frame!.payload.toString()).toBe('raw bytes');
  });

  it('should pipe from a Readable stream', async () => {
    const pipe = new SmartPipe();
    const records = [
      { name: 'a', size: 1 },
      { name: 'b', size: 2 },
    ];

    const bufs = records.map(r => SmartPipe.wrap(r));
    const input = Readable.from(bufs);

    const promise = collectFrames(pipe);
    input.pipe(pipe);

    const frames = await promise;
    expect(frames).toHaveLength(2);
    expect(JSON.parse(frames[0]!.payload.toString())).toEqual({ name: 'a', size: 1 });
    expect(JSON.parse(frames[1]!.payload.toString())).toEqual({ name: 'b', size: 2 });
  });
});
