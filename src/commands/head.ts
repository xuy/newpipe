#!/usr/bin/env node

import { fileURLToPath } from 'url';
import { SmartPipe } from '../core/SmartPipe.js';
import { type Frame } from '../core/Frame.js';
import { handleEpipe } from '../utils/epipe.js';
import { SignalPlane } from '../core/SignalPlane.js';
import { SignalType } from '../core/Signal.js';

handleEpipe();

export function head(n: number = 10) {
  const pipe = new SmartPipe();
  const signalPlane = new SignalPlane();
  let count = 0;

  signalPlane.onSignal((signal) => {
    if (signal.type === SignalType.HELO) {
      signalPlane.send({ type: SignalType.ACK });
      signalPlane.send({ type: SignalType.HELO, mimeType: signal.mimeType || 'text/plain' });
    }
  });

  process.stdin.pipe(pipe).on('data', (frame: Frame) => {
    if (count < n) {
      process.stdout.write(SmartPipe.wrap(frame.payload));
      count++;
    } else {
      process.exit(0);
    }
  }).on('end', () => {
    process.exit(0);
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { handleHelp } = await import('../utils/help.js');
  if (handleHelp({ name: 'head', summary: 'limit stream to first N records', usage: 'head [n]', signals: ['HELO', 'ACK'] })) process.exit(0);
  const n = parseInt(process.argv[2] ?? '10', 10);
  head(n);
}
