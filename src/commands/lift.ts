import readline from 'readline';
import { SmartPipe } from '../core/SmartPipe.js';
import { handleEpipe } from '../utils/epipe.js';
import { SignalPlane } from '../core/SignalPlane.js';
import { SignalType } from '../core/Signal.js';

handleEpipe();

export function lift() {
  const signalPlane = new SignalPlane();
  
  // Lift is a producer for the NEXT command
  signalPlane.send({ type: SignalType.HELO, mimeType: 'text/plain' });

  const rl = readline.createInterface({
    input: process.stdin,
    terminal: false,
    crlfDelay: Infinity
  });

  rl.on('line', (line) => {
    try {
      const record = JSON.parse(line);
      process.stdout.write(SmartPipe.wrap(record));
    } catch (e) {
      process.stdout.write(SmartPipe.wrap(line));
    }
  });

  rl.on('error', (err) => {
    console.error(`Lift error: ${err.message}`);
    process.exit(1);
  });
}

if (import.meta.url.startsWith('file:') && process.argv[1] === (await import('url')).fileURLToPath(import.meta.url)) {
  lift();
}
