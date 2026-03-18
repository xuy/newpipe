#!/usr/bin/env node

import { fileURLToPath } from 'url';
import { SmartPipe } from '../core/SmartPipe.js';
import { type Frame } from '../core/Frame.js';
import { SignalPlane } from '../core/SignalPlane.js';
import { SignalType } from '../core/Signal.js';
import { handleEpipe } from '../utils/epipe.js';

handleEpipe();

export async function slow() {
  const pipe = new SmartPipe();
  const signalPlane = new SignalPlane();
  let processedCount = 0;

  console.error(`\x1b[32m[Slow Consumer] Ready. Waiting for upstream offer...\x1b[0m`);

  signalPlane.onSignal((signal) => {
    if (signal.type === SignalType.HELO) {
      console.error(`\x1b[35m[Slow Consumer] Handshake: Accepting type ${signal.mimeType}\x1b[0m`);
      signalPlane.send({ type: SignalType.ACK });
    }
  });

  process.stdin.pipe(pipe).on('data', async (frame: Frame) => {
    processedCount++;
    console.error(`\x1b[34m[Slow Consumer] Received Record #${processedCount}\x1b[0m`);

    if (processedCount % 3 === 0) {
      console.error(`\x1b[33m[Slow Consumer] Overwhelmed! Sending PAUSE...\x1b[0m`);
      signalPlane.send({ type: SignalType.PAUSE });
      await new Promise(r => setTimeout(r, 2000));
      console.error(`\x1b[32m[Slow Consumer] Ready again. Sending RESUME...\x1b[0m`);
      signalPlane.send({ type: SignalType.RESUME });
    }
  }).on('end', () => {
    console.error(`\x1b[32m[Slow Consumer] Finished.\x1b[0m`);
    process.exit(0);
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { handleHelp } = await import('../utils/help.js');
  if (handleHelp({ name: 'slow', summary: 'backpressure demo consumer', usage: 'slow', signals: ['HELO', 'ACK', 'PAUSE', 'RESUME'] })) process.exit(0);
  slow();
}
