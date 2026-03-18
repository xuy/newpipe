#!/usr/bin/env node

import { fileURLToPath } from 'url';
import { SmartPipe } from '../../src/core/SmartPipe.js';
import { type Frame } from '../../src/core/Frame.js';
import { handleEpipe } from '../../src/utils/epipe.js';
import { SignalPlane } from '../../src/core/SignalPlane.js';
import { SignalType } from '../../src/core/Signal.js';

handleEpipe();

export function grep(pattern: string, field?: string) {
  const regex = new RegExp(pattern, 'i');
  const pipe = new SmartPipe();
  const signalPlane = new SignalPlane();
  let currentMimeType = 'text/plain';

  signalPlane.onSignal((signal) => {
    if (signal.type === SignalType.HELO) {
      currentMimeType = signal.mimeType || 'text/plain';
      // ACK to previous
      signalPlane.send({ type: SignalType.ACK });
      // HELO to next
      signalPlane.send({ type: SignalType.HELO, mimeType: currentMimeType });
    }
  });

  process.stdin.pipe(pipe).on('data', (frame: Frame) => {
    try {
      const data = JSON.parse(frame.payload.toString());
      const valueToTest = field ? data[field] : frame.payload.toString();
      if (regex.test(String(valueToTest))) {
        process.stdout.write(SmartPipe.wrap(data));
      }
    } catch (e) {
      if (regex.test(frame.payload.toString())) {
        process.stdout.write(SmartPipe.wrap(frame.payload.toString()));
      }
    }
  }).on('end', () => {
    process.exit(0);
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { handleHelp } = await import('../../src/utils/help.js');
  if (handleHelp({ name: 'grep', summary: 'filter records by regex', usage: 'grep <pattern> [field]', signals: ['HELO', 'ACK'] })) process.exit(0);
  const pattern = process.argv[2];
  const field = process.argv[3];
  if (!pattern) { process.exit(1); }
  grep(pattern, field);
}
