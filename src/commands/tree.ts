#!/usr/bin/env node

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { SmartPipe } from '../core/SmartPipe.js';
import { handleEpipe } from '../utils/epipe.js';
import { SignalPlane } from '../core/SignalPlane.js';
import { SignalType } from '../core/Signal.js';

handleEpipe();

export async function tree(dirPath: string = '.', depth: number = 0, maxDepth: number = 2) {
  const signalPlane = new SignalPlane();
  let isPaused = false;
  let isStopped = false;
  let started = false;

  const startProducing = async () => {
    if (started) return;
    started = true;
    await emitTree(dirPath, depth);
    setTimeout(() => process.exit(0), 100);
  };

  const emitTree = async (currentPath: string, currentDepth: number) => {
    if (currentDepth > maxDepth || isStopped) return;
    try {
      const files = await fs.readdir(currentPath);
      for (const file of files) {
        if (isStopped) break;
        while (isPaused && !isStopped) {
          await new Promise(r => setTimeout(r, 50));
        }
        const fullPath = path.join(currentPath, file);
        const stats = await fs.stat(fullPath);
        process.stdout.write(SmartPipe.wrap({ name: file, path: fullPath, depth: currentDepth, isDirectory: stats.isDirectory() }));
        if (stats.isDirectory()) {
          await emitTree(fullPath, currentDepth + 1);
        }
      }
    } catch (e) {}
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

  signalPlane.send({ type: SignalType.HELO, mimeType: 'application/json' });
  setTimeout(() => startProducing(), 1000);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { handleHelp } = await import('../utils/help.js');
  if (handleHelp({ name: 'tree', summary: 'recursive directory listing as records', usage: 'tree [dir]', signals: ['HELO', 'ACK', 'PAUSE', 'RESUME', 'STOP'] })) process.exit(0);
  const dir = process.argv[2] || '.';
  tree(dir);
}
