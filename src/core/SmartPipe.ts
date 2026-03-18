import { Transform, type TransformCallback } from 'stream';
import { type Frame, FrameUtils } from './Frame.js';

export class SmartPipe extends Transform {
  private buffer: Buffer = Buffer.alloc(0);

  constructor() {
    super({ objectMode: true });
  }

  _transform(chunk: any, encoding: string, callback: TransformCallback): void {
    this.buffer = Buffer.concat([this.buffer, Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)]);

    while (this.buffer.length >= FrameUtils.HEADER_SIZE) {
      const payloadLength = this.buffer.readUInt32BE(0);
      const totalLength = FrameUtils.HEADER_SIZE + payloadLength;
      
      if (this.buffer.length >= totalLength) {
        const frameBuffer = this.buffer.subarray(0, totalLength);
        const frame = FrameUtils.decode(frameBuffer);
        
        if (frame) {
          this.push(frame);
        }
        
        this.buffer = this.buffer.subarray(totalLength);
      } else {
        break;
      }
    }
    callback();
  }

  static wrap(data: any): Buffer {
    const payload = Buffer.isBuffer(data) ? data : Buffer.from(JSON.stringify(data));
    return FrameUtils.encode(payload);
  }
}
