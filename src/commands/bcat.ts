import fs from 'fs';
import { fileURLToPath } from 'url';
import { SmartPipe } from '../core/SmartPipe.js';
import { handleEpipe } from '../utils/epipe.js';
import { SignalPlane } from '../core/SignalPlane.js';
import { SignalType } from '../core/Signal.js';

handleEpipe();

export async function bcat(filePath: string) {
  const signalPlane = new SignalPlane();

  const startProducing = () => {
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
  const file = process.argv[2];
  if (!file) { process.exit(1); }
  bcat(file);
}
