import fs from 'fs';
import readline from 'readline';
import { fileURLToPath } from 'url';
import { SmartPipe } from '../core/SmartPipe.js';
import { handleEpipe } from '../utils/epipe.js';
import { SignalPlane } from '../core/SignalPlane.js';
import { SignalType } from '../core/Signal.js';

handleEpipe();

export async function cat(filePath: string) {
  const signalPlane = new SignalPlane();
  const mimeType = filePath.endsWith('.json') || filePath.endsWith('.jsonl') ? 'application/json' : 'text/plain';

  const startProducing = async () => {
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
  const file = process.argv[2];
  if (!file) { process.exit(1); }
  cat(file);
}
