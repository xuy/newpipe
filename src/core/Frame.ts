export interface Frame {
  payload: Buffer;
}

export class FrameUtils {
  static readonly HEADER_SIZE = 4; // 4 bytes for payload length

  static encode(payload: Buffer): Buffer {
    const buffer = Buffer.alloc(this.HEADER_SIZE + payload.length);
    buffer.writeUInt32BE(payload.length, 0);
    payload.copy(buffer, 4);
    return buffer;
  }

  static decode(buffer: Buffer): Frame | null {
    if (buffer.length < this.HEADER_SIZE) return null;
    const payloadLength = buffer.readUInt32BE(0);
    if (buffer.length < this.HEADER_SIZE + payloadLength) return null;
    const payload = buffer.subarray(4, 4 + payloadLength);
    return { payload };
  }
}
