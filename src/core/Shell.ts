import { spawn, ChildProcess } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

interface CommandInfo {
  cmd: string;
  args: string[];
  fullPath: string;
  isSmart: boolean;
}

export class Shell {
  private builtins: Record<string, () => void> = {
    help: () => {
      console.log(`
NewPipe - Rethinking Unix Pipes for Agents

Commands: about, install, github, agent, help
Built-ins: ls, cat, grep, head, tree, bcat, pcat, tcat, st-gen, to-st

Try: ls | head, pcat data.parquet | grep pattern
      `);
    },
    about: () => {
      console.log(`
Rethinking Unix Pipes for Agents
--------------------------------
The Unix pipe is 50 years old. NewPipe revisions it for the Agentic Era:
1. Control Flow Signaling
2. Record-based Framing (Orthogonal Planes)
      `);
    },
    github: () => { console.log('GitHub: https://github.com/xuy/newpipe'); },
    agent: () => { console.log('Agent status: Connected, Sandbox ready.'); },
    install: () => { console.log('NewPipe is already installed and ready.'); }
  };

  private getCommandInfo(part: string): CommandInfo {
    const [cmd, ...args] = part.split(' ');
    
    // 1. Get NEWPIPE_PATH from env, defaulting to the internal bin
    const internalBin = path.join(__dirname, '../../bin');
    const npPath = process.env.NEWPIPE_PATH || internalBin;
    const searchDirs = npPath.split(path.delimiter);

    // 2. Search NEWPIPE_PATH for Smart Commands
    for (const dir of searchDirs) {
      const fullPath = path.resolve(dir, cmd!);
      if (fs.existsSync(fullPath)) {
        return { cmd: cmd!, args, fullPath, isSmart: true };
      }
    }

    // 3. Fallback to system PATH (Legacy)
    return { cmd: cmd!, args, fullPath: cmd!, isSmart: false };
  }

  async execute(commandLine: string) {
    const pipeParts = commandLine.split('|').map(s => s.trim());
    
    // Builtins handling
    if (pipeParts.length === 1) {
      const parts = pipeParts[0]?.split(' ') ?? [];
      const cmd = parts[0];
      if (cmd && this.builtins[cmd]) {
        this.builtins[cmd]!();
        return;
      }
    }

    const commands = [...pipeParts];
    const isViewPresent = commands[commands.length - 1]?.startsWith('view');
    
    let processes: ChildProcess[] = [];
    let prevProcess: ChildProcess | null = null;
    let prevIsSmart = false;

    const env = { ...process.env, NEWPIPE_SIGNAL_FD: '3' };

    for (let i = 0; i < commands.length; i++) {
      const info = this.getCommandInfo(commands[i]!);

      // Impedance Matching (Inject lower/lift if boundary crossed)
      // Bridge Gap (Smart/Legacy boundary)
      if (prevProcess && prevIsSmart !== info.isSmart) {
        const bridgeCmd = prevIsSmart ? 'lower' : 'lift';
        const bridgeInfo = this.getCommandInfo(bridgeCmd);
        const bridgeProc = spawn(bridgeInfo.fullPath, [], { stdio: ['pipe', 'pipe', 'inherit', 'pipe'], env });

        if (prevProcess.stdout && bridgeProc.stdin) {
          prevProcess.stdout.pipe(bridgeProc.stdin);
        }
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

    // Auto-append VIEW if necessary
    if (prevIsSmart && !isViewPresent) {
      const view = this.getCommandInfo('view');
      const viewProc = spawn(view.fullPath, [], { stdio: ['pipe', 'inherit', 'inherit', 'pipe'], env });
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
