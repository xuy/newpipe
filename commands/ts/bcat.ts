#!/usr/bin/env node

import fs from 'fs';
import { fileURLToPath } from 'url';
import { SmartPipe } from '../../src/core/SmartPipe.js';
import { handleEpipe } from '../../src/utils/epipe.js';
import { SignalPlane } from '../../src/core/SignalPlane.js';
import { SignalType } from '../../src/core/Signal.js';

handleEpipe();

export async function bcat(filePath: string) {
  const signalPlane = new SignalPlane();
  let started = false;

  const startProducing = () => {
    if (started) return;
    started = true;
    try {
      const fileStream = fs.createReadStream(filePath);
      fileStream.on('data', (chunk) => {
        process.stdout.write(SmartPipe.wrap(chunk));
      });
      fileStream.on('error', (err) => {
        console.error(`bcat error: ${err.message}`);
        process.exit(1);
      });
      fileStream.on('end', () => {
        setTimeout(() => process.exit(0), 100);
      });
    } catch (error: any) {
      console.error(`bcat error: ${error.message}`);
      process.exit(1);
    }
  };

  signalPlane.onSignal((signal) => {
    if (signal.type === SignalType.ACK) {
      startProducing();
    }
  });

  signalPlane.send({ type: SignalType.HELO, mimeType: 'application/octet-stream' });
  
  // Fallback
  setTimeout(() => startProducing(), 1000);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { handleHelp } = await import('../../src/utils/help.js');
  if (handleHelp({ name: 'bcat', summary: 'read binary files as framed records', usage: 'bcat <file>', signals: ['HELO', 'ACK'] })) process.exit(0);
  const file = process.argv[2];
  if (!file) { process.exit(1); }
  bcat(file);
}
