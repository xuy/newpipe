#!/usr/bin/env node

import fs from 'fs';
import readline from 'readline';
import { fileURLToPath } from 'url';
import { SmartPipe } from '../../src/core/SmartPipe.js';
import { handleEpipe } from '../../src/utils/epipe.js';
import { SignalPlane } from '../../src/core/SignalPlane.js';
import { SignalType } from '../../src/core/Signal.js';

handleEpipe();

export async function cat(filePath: string) {
  const signalPlane = new SignalPlane();
  const mimeType = filePath.endsWith('.json') || filePath.endsWith('.jsonl') ? 'application/json' : 'text/plain';
  let started = false;

  const startProducing = async () => {
    if (started) return;
    started = true;
    try {
      if (filePath.endsWith('.jsonl')) {
        const fileStream = fs.createReadStream(filePath);
        const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });
        for await (const line of rl) {
          try {
            process.stdout.write(SmartPipe.wrap(JSON.parse(line)));
          } catch (e) {
            process.stdout.write(SmartPipe.wrap(line));
          }
        }
      } else if (filePath.endsWith('.json')) {
        const content = await fs.promises.readFile(filePath, 'utf8');
        try {
          process.stdout.write(SmartPipe.wrap(JSON.parse(content)));
        } catch (e) {
          process.stdout.write(SmartPipe.wrap(content));
        }
      } else {
        const fileStream = fs.createReadStream(filePath);
        const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });
        for await (const line of rl) {
          process.stdout.write(SmartPipe.wrap(line));
        }
      }
    } catch (error: any) {
      console.error(`Cat error: ${error.message}`);
    } finally {
      setTimeout(() => process.exit(0), 100);
    }
  };

  signalPlane.onSignal((signal) => {
    if (signal.type === SignalType.ACK) {
      startProducing();
    }
  });

  signalPlane.send({ type: SignalType.HELO, mimeType });
  
  // Safety fallback
  setTimeout(() => startProducing(), 1000);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { handleHelp } = await import('../../src/utils/help.js');
  if (handleHelp({ name: 'cat', summary: 'read files as typed records', usage: 'cat <file>', signals: ['HELO', 'ACK'] })) process.exit(0);
  const file = process.argv[2];
  if (!file) { process.exit(1); }
  cat(file);
}
