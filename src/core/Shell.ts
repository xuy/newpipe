import { spawn, ChildProcess } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

interface CommandInfo {
  cmd: string;
  args: string[];
  fullPath: string;
  runner?: string[];
  isSmart: boolean;
}

export class Shell {
  private RUNNERS: Record<string, (p: string) => string[]> = {
    '.ts': (p) => ['node', '--no-warnings', '--loader', 'ts-node/esm', p],
    '.js': (p) => ['node', '--no-warnings', p],
    '.py': (p) => ['uv', 'run', p],
    '.rs': (p) => ['cargo', 'run', '--quiet', '--manifest-path', path.join(__dirname, '../../../sdk/rust/Cargo.toml'), '--example', path.basename(p, '.rs'), '--']
  };

  private builtins: Record<string, () => void> = {
    help: () => {
      console.log(`NewPipe - Orthogonal Agentic Shell\nArchitecture: FD 0/1 (Data), FD 2 (Diag), FD 3 (Signal)`);
    }
  };

  private getCommandInfo(part: string): CommandInfo {
    const [cmd, ...args] = part.split(' ');
    const searchPaths = [
      path.join(__dirname, '../commands'),
      path.join(__dirname, '../../../src/commands')
    ];

    for (const p of searchPaths) {
      for (const ext of Object.keys(this.RUNNERS)) {
        const fullPath = path.join(p, `${cmd}${ext}`);
        if (fs.existsSync(fullPath)) {
          return { cmd: cmd!, args, fullPath, runner: this.RUNNERS[ext]!(fullPath), isSmart: true };
        }
      }
    }

    return { cmd: cmd!, args, fullPath: cmd!, isSmart: false };
  }

  async execute(commandLine: string) {
    const pipeParts = commandLine.split('|').map(s => s.trim());
    if (pipeParts.length === 1 && this.builtins[pipeParts[0]!]) {
      this.builtins[pipeParts[0]!]!();
      return;
    }

    const commands = [...pipeParts];
    if (commands[commands.length - 1] && !commands[commands.length - 1]?.startsWith('view')) {
      commands.push('view');
    }

    let processes: ChildProcess[] = [];
    let prevProcess: ChildProcess | null = null;
    let prevIsSmart = false;

    for (let i = 0; i < commands.length; i++) {
      let info = this.getCommandInfo(commands[i]!);

      // Impedance Matching (Inject lower/lift if boundary crossed)
      if (prevProcess && prevIsSmart !== info.isSmart) {
        const bridgeCmd = prevIsSmart ? 'lower' : 'lift';
        const bridgeInfo = this.getCommandInfo(bridgeCmd);
        const bridgeProc = spawn(bridgeInfo.runner![0]!, [...bridgeInfo.runner!.slice(1)], { stdio: ['pipe', 'pipe', 'inherit', 'pipe'] });
        prevProcess.stdout!.pipe(bridgeProc.stdin!);
        prevProcess = bridgeProc;
        processes.push(bridgeProc);
      }

      const isRealLast = i === commands.length - 1;
      const isSmartAndNeedsView = info.isSmart && isRealLast && !commands[commands.length-1]?.startsWith('view');

      const stdio: any[] = [
        prevProcess ? 'pipe' : 'inherit',
        (isRealLast && !isSmartAndNeedsView) ? 'inherit' : 'pipe',
        'inherit',
        'pipe' // FD 3: Signal Plane
      ];

      const spawnArgs = info.runner ? [...info.runner.slice(1), ...info.args] : info.args;
      const spawnCmd = info.runner ? info.runner[0]! : info.fullPath;

      const currentProcess = spawn(spawnCmd, spawnArgs, { stdio });
      if (prevProcess && currentProcess.stdin) prevProcess.stdout!.pipe(currentProcess.stdin);

      processes.push(currentProcess);
      prevProcess = currentProcess;
      prevIsSmart = info.isSmart;
    }

    // Switchboard Routing
    for (let i = 0; i < processes.length; i++) {
      const p = processes[i]!;
      if (p.stdio[3]) {
        (p.stdio[3] as any).on('data', (chunk: Buffer) => {
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
