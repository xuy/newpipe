#!/usr/bin/env node

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { SmartPipe } from '../core/SmartPipe.js';
import { handleEpipe } from '../utils/epipe.js';
import { SignalPlane } from '../core/SignalPlane.js';
import { SignalType } from '../core/Signal.js';

handleEpipe();

export async function ls(dirPath: string = '.') {
  const signalPlane = new SignalPlane();
  let isPaused = false;
  let isStopped = false;

  const startProducing = async () => {
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
        await new Promise(r => setTimeout(r, 10));
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
  setTimeout(() => {
    if (!isPaused && !isStopped) startProducing();
  }, 1000);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const dir = process.argv[2] || '.';
  ls(dir);
}
