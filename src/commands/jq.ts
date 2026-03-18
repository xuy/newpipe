#!/usr/bin/env node

import { fileURLToPath } from 'url';
import { SmartPipe } from '../core/SmartPipe.js';
import { type Frame } from '../core/Frame.js';
import { handleEpipe } from '../utils/epipe.js';
import { SignalPlane } from '../core/SignalPlane.js';
import { SignalType } from '../core/Signal.js';

handleEpipe();

export function jq(selector: string) {
  const pipe = new SmartPipe();
  const signalPlane = new SignalPlane();
  const keys = selector.split('.').filter(k => k);

  signalPlane.onSignal((signal) => {
    if (signal.type === SignalType.HELO) {
      signalPlane.send({ type: SignalType.HELO, mimeType: 'application/json' });
      signalPlane.send({ type: SignalType.ACK });
    }
  });

  process.stdin.pipe(pipe).on('data', (frame: Frame) => {
    try {
      let data = JSON.parse(frame.payload.toString());
      for (const key of keys) {
        if (data && typeof data === 'object') { data = data[key]; }
        else { data = undefined; break; }
      }
      if (data !== undefined) {
        process.stdout.write(SmartPipe.wrap(data));
      }
    } catch (e) {}
  }).on('end', () => {
    process.exit(0);
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const selector = process.argv[2] || '.';
  jq(selector);
}
