#!/usr/bin/env node

import { fileURLToPath } from 'url';
import { SmartPipe } from '../../src/core/SmartPipe.js';
import { type Frame } from '../../src/core/Frame.js';
import { handleEpipe } from '../../src/utils/epipe.js';
import { SignalPlane } from '../../src/core/SignalPlane.js';
import { SignalType } from '../../src/core/Signal.js';

handleEpipe();

export function view() {
  const pipe = new SmartPipe();
  const signalPlane = new SignalPlane();
  let currentMimeType = 'text/plain';

  signalPlane.onSignal((signal) => {
    if (signal.type === SignalType.HELO) {
      currentMimeType = signal.mimeType || 'text/plain';
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
  const { handleHelp } = await import('../../src/utils/help.js');
  if (handleHelp({ name: 'view', summary: 'pretty-print records for terminal', usage: 'view', signals: ['HELO', 'ACK'] })) process.exit(0);
  view();
}
