import { Socket } from 'net';
import readline from 'readline';
import { SignalType, type SignalMessage } from './Signal.js';

export class SignalPlane {
  private socket: Socket;
  private debug = process.env.DEBUG === 'newpipe';

  constructor() {
    const fd = 3;
    if (this.debug) console.error(`[SignalPlane] Connecting to FD ${fd}`);
    
    try {
      this.socket = new Socket({ fd, readable: true, writable: true });
      this.socket.unref();
      
      const rl = readline.createInterface({
        input: this.socket,
        terminal: false
      });

      rl.on('line', (line) => {
        if (this.debug) console.error(`[SignalPlane] Received signal: ${line}`);
        try {
          const signal: SignalMessage = JSON.parse(line);
          this.emitSignal(signal);
        } catch (e) {
          if (this.debug) console.error(`[SignalPlane] Failed to parse signal: ${line}`);
        }
      });

      rl.on('error', () => {});

      this.socket.on('error', (err) => {
        if (this.debug) console.error(`[SignalPlane] Socket error:`, err.message);
      });
    } catch (e: any) {
      if (this.debug) console.error(`[SignalPlane] Setup failed:`, e.message);
      this.socket = new Socket();
    }
  }

  private listeners: ((signal: SignalMessage) => void)[] = [];

  onSignal(callback: (signal: SignalMessage) => void) {
    this.listeners.push(callback);
  }

  private emitSignal(signal: SignalMessage) {
    for (const listener of this.listeners) listener(signal);
  }

  send(signal: SignalMessage) {
    this.socket.write(JSON.stringify(signal) + '\n');
  }
}
