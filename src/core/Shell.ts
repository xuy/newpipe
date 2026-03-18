import { spawn, ChildProcess } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export class Shell {
  private getCommandInfo(part: string) {
    const [cmd, ...args] = part.split(' ');
    const binPath = path.join(__dirname, '../../bin', cmd!);
    const isSmart = fs.existsSync(binPath);
    return { fullPath: isSmart ? binPath : cmd!, args, isSmart };
  }

  async execute(commandLine: string) {
    const pipeParts = commandLine.split('|').map(s => s.trim());
    const commands = [...pipeParts];
    const isViewPresent = commands[commands.length - 1]?.startsWith('view');
    
    let processes: ChildProcess[] = [];
    let prevProcess: ChildProcess | null = null;
    let prevIsSmart = false;

    const env = { ...process.env, NEWPIPE_SIGNAL_FD: '3' };

    for (let i = 0; i < commands.length; i++) {
      const info = this.getCommandInfo(commands[i]!);

      // Bridge Gap (Smart/Legacy boundary)
      if (prevProcess && prevIsSmart !== info.isSmart) {
        const bridge = this.getCommandInfo(prevIsSmart ? 'lower' : 'lift');
        const bridgeProc = spawn(bridge.fullPath, [], { stdio: ['pipe', 'pipe', 'inherit', 'pipe'], env });
        prevProcess.stdout!.pipe(bridgeProc.stdin!);
        prevProcess = bridgeProc;
        processes.push(bridgeProc);
      }

      const isRealLast = i === commands.length - 1;
      const needsView = info.isSmart && isRealLast && !isViewPresent;

      const stdio: any[] = [
        prevProcess ? 'pipe' : 'inherit',
        (isRealLast && !needsView) ? 'inherit' : 'pipe',
        'inherit',
        'pipe' // FD 3: Signal Plane
      ];

      const proc = spawn(info.fullPath, info.args, { stdio, env });
      if (prevProcess) prevProcess.stdout!.pipe(proc.stdin!);

      processes.push(proc);
      prevProcess = proc;
      prevIsSmart = info.isSmart;
    }

    // Auto-append VIEW
    if (prevIsSmart && !isViewPresent) {
      const view = this.getCommandInfo('view');
      const viewProc = spawn(view.fullPath, [], { stdio: ['pipe', 'inherit', 'inherit', 'pipe'] });
      prevProcess!.stdout!.pipe(viewProc.stdin!);
      processes.push(viewProc);
    }

    // Switchboard: Route signals between adjacent FD 3 pipes
    for (let i = 0; i < processes.length; i++) {
      const signalPipe = processes[i]!.stdio[3] as any;
      if (signalPipe) {
        signalPipe.on('data', (chunk: Buffer) => {
          if (i > 0 && processes[i-1]!.stdio[3]) (processes[i-1]!.stdio[3] as any).write(chunk);
          if (i < processes.length - 1 && processes[i+1]!.stdio[3]) (processes[i+1]!.stdio[3] as any).write(chunk);
        });
      }
    }

    await new Promise((resolve) => {
      const last = processes[processes.length - 1];
      if (last) { last.on('exit', resolve); last.on('error', resolve); }
      else resolve(null);
    });
  }
}
