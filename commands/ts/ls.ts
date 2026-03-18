#!/usr/bin/env node

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { SmartPipe } from '../../src/core/SmartPipe.js';
import { handleEpipe } from '../../src/utils/epipe.js';
import { SignalPlane } from '../../src/core/SignalPlane.js';
import { SignalType } from '../../src/core/Signal.js';

handleEpipe();

export async function ls(dirPath: string = '.') {
  const signalPlane = new SignalPlane();
  let isPaused = false;
  let isStopped = false;
  let started = false;

  const startProducing = async () => {
    if (started) return;
    started = true;
    try {
      const files = await fs.readdir(dirPath);
      for (const file of files) {
        if (isStopped) break;
        while (isPaused && !isStopped) {
          await new Promise(r => setTimeout(r, 50));
        }

        const fullPath = path.join(dirPath, file);
        const stats = await fs.stat(fullPath);
        const fileRecord = {
          name: file,
          path: fullPath,
          size: stats.size,
          isDirectory: stats.isDirectory(),
          mtime: stats.mtime
        };
        process.stdout.write(SmartPipe.wrap(fileRecord));
      }
    } catch (error: any) {
      console.error(`Error in ls: ${error.message}`);
    } finally {
      setTimeout(() => process.exit(0), 100);
    }
  };

  signalPlane.onSignal((signal) => {
    if (signal.type === SignalType.ACK) {
      startProducing();
    } else if (signal.type === SignalType.PAUSE) {
      isPaused = true;
    } else if (signal.type === SignalType.RESUME) {
      isPaused = false;
    } else if (signal.type === SignalType.STOP) {
      isStopped = true;
    }
  });

  // Offer the type and wait for ACK
  signalPlane.send({ type: SignalType.HELO, mimeType: 'application/json' });

  // Safety fallback
  setTimeout(() => startProducing(), 1000);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { handleHelp } = await import('../../src/utils/help.js');
  if (handleHelp({ name: 'ls', summary: 'list directory as typed records', usage: 'ls [dir]', signals: ['HELO', 'ACK', 'PAUSE', 'RESUME', 'STOP'] })) process.exit(0);
  const dir = process.argv[2] || '.';
  ls(dir);
}
