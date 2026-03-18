#!/usr/bin/env node

import { SmartPipe } from '../core/SmartPipe.js';
import { type Frame } from '../core/Frame.js';
import { handleEpipe } from '../utils/epipe.js';
import { SignalPlane } from '../core/SignalPlane.js';
import { SignalType } from '../core/Signal.js';

handleEpipe();

export function lower() {
  const pipe = new SmartPipe();
  const signalPlane = new SignalPlane();

  signalPlane.onSignal((signal) => {
    if (signal.type === SignalType.HELO) {
      signalPlane.send({ type: SignalType.ACK });
    }
  });

  process.stdin.pipe(pipe).on('data', (frame: Frame) => {
    try {
      const data = JSON.parse(frame.payload.toString());
      process.stdout.write(JSON.stringify(data) + '\n');
    } catch (e) {
      process.stdout.write(frame.payload.toString() + '\n');
    }
  }).on('end', () => {
    process.exit(0);
  });
}

if (import.meta.url.startsWith('file:') && process.argv[1] === (await import('url')).fileURLToPath(import.meta.url)) {
  lower();
}
