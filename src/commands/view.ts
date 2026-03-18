#!/usr/bin/env node

import { fileURLToPath } from 'url';
import { SmartPipe } from '../core/SmartPipe.js';
import { type Frame } from '../core/Frame.js';
import { handleEpipe } from '../utils/epipe.js';
import { SignalPlane } from '../core/SignalPlane.js';
import { SignalType } from '../core/Signal.js';

handleEpipe();

export function view() {
  const pipe = new SmartPipe();
  const signalPlane = new SignalPlane();
  let currentMimeType = 'text/plain';

  signalPlane.onSignal((signal) => {
    if (signal.type === SignalType.HELO) {
      currentMimeType = signal.mimeType || 'text/plain';
      console.error(`\x1b[35m[Contract]\x1b[0m Established: ${currentMimeType}`);
      signalPlane.send({ type: SignalType.ACK });
    }
  });

  process.stdin.pipe(pipe).on('data', (frame: Frame) => {
    if (currentMimeType.includes('json') || currentMimeType.includes('demo')) {
      try {
        const data = JSON.parse(frame.payload.toString());
        console.dir(data, { depth: null, colors: true });
      } catch (e) {
        console.log('\x1b[33m[Invalid JSON]\x1b[0m', frame.payload.toString());
      }
    } else if (currentMimeType === 'application/octet-stream') {
      console.log(`\x1b[36m[Binary Record]\x1b[0m Size: ${frame.payload.length} bytes`);
    } else {
      process.stdout.write(frame.payload);
      process.stdout.write('\n');
    }
  }).on('end', () => {
    process.exit(0);
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { handleHelp } = await import('../utils/help.js');
  if (handleHelp({ name: 'view', summary: 'pretty-print records for terminal', usage: 'view', signals: ['HELO', 'ACK'] })) process.exit(0);
  view();
}
