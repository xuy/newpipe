import { spawn, ChildProcess } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export class Shell {
  private builtins: Record<string, () => void> = {
    help: () => {
      console.log(`
NewPipe - Orthogonal Agentic Shell

Commands: about, install, github, agent, help
Built-ins: ls, cat, grep, head, tree, bcat

Architecture:
  FD 0/1: Data Plane (4-byte length framed)
  FD 2:   Diagnostic Plane (Text)
  FD 3:   Signal Plane (NDJSON)
      `);
    },
    about: () => {
      console.log(`
NewPipe: A Composition of Orthogonal Planes.
Refactored for maximum simplicity and agentic predictability.
      `);
    },
    github: () => { console.log('https://github.com/newpipe/newpipe'); },
    agent: () => { console.log('Status: Sandbox Orthogonality Verified.'); },
    install: () => { console.log('Ready.'); }
  };

  async execute(commandLine: string) {
    const pipeParts = commandLine.split('|').map(s => s.trim());
    
    if (pipeParts.length === 1) {
      const parts = pipeParts[0]?.split(' ') ?? [];
      const cmd = parts[0];
      if (cmd && this.builtins[cmd]) {
        this.builtins[cmd]!();
        return;
      }
    }

    const commands = [...pipeParts];
    const isViewAlreadyPresent = commands[commands.length - 1]?.startsWith('view');
    
    let processes: ChildProcess[] = [];
    let prevProcess: ChildProcess | null = null;
    let prevIsSmart = false;

    const getCommandInfo = (part: string) => {
      const parts = part.split(' ');
      const cmd = parts[0]!;
      const args = parts.slice(1);
      
      const searchPaths = [
        path.join(__dirname, '../commands'), // relative to dist/src/core -> dist/src/commands
        path.join(__dirname, '../../../src/commands') // relative to dist/src/core -> src/commands
      ];

      if (process.env.DEBUG === 'newpipe') {
        console.error(`[Shell] Searching for ${cmd} in:`, searchPaths);
      }

      let cmdPath = "";
      let isTs = false;
      let isPy = false;
      let isSmart = false;

      for (const p of searchPaths) {
        const tsPath = path.join(p, `${cmd}.ts`);
        const jsPath = path.join(p, `${cmd}.js`);
        const pyPath = path.join(p, `${cmd}.py`);

        if (fs.existsSync(tsPath)) {
          cmdPath = tsPath;
          isTs = true;
          isSmart = true;
          if (process.env.DEBUG === 'newpipe') console.error(`[Shell] Found ${cmd} as TS: ${tsPath}`);
          break;
        }
        if (fs.existsSync(jsPath)) {
          cmdPath = jsPath;
          isSmart = true;
          if (process.env.DEBUG === 'newpipe') console.error(`[Shell] Found ${cmd} as JS: ${jsPath}`);
          break;
        }
        if (fs.existsSync(pyPath)) {
          cmdPath = pyPath;
          isPy = true;
          isSmart = true;
          if (process.env.DEBUG === 'newpipe') console.error(`[Shell] Found ${cmd} as PY: ${pyPath}`);
          break;
        }
      }

      if (!isSmart) {
        cmdPath = cmd;
        if (process.env.DEBUG === 'newpipe') console.error(`[Shell] ${cmd} not found in search paths, assuming legacy.`);
      }
      
      return { cmd, args, cmdPath, isTs, isPy, isSmart };
    };

    const spawnProcess = (info: any, stdio: any[]) => {
      if (info.isSmart) {
        if (info.isPy) {
          // If uv is available, use it to ensure a robust environment
          try {
            // Check if uv is in path
            return spawn('uv', ['run', info.cmdPath, ...info.args], { stdio });
          } catch (e) {
            return spawn('python3', [info.cmdPath, ...info.args], { stdio });
          }
        }
        const nodeArgs = ['--no-warnings'];
        if (info.isTs) nodeArgs.push('--loader', 'ts-node/esm');
        return spawn('node', [...nodeArgs, info.cmdPath, ...info.args], { stdio });
      } else {
        return spawn(info.cmdPath, info.args, { stdio });
      }
    };

    for (let i = 0; i < commands.length; i++) {
      const info = getCommandInfo(commands[i]!);

      // Impedance Matching
      if (prevProcess && prevIsSmart && !info.isSmart) {
        const lowerInfo = getCommandInfo('lower');
        const lowerer = spawnProcess(lowerInfo, ['pipe', 'pipe', 'inherit', 'pipe']);
        prevProcess.stdout!.pipe(lowerer.stdin!);
        prevProcess = lowerer;
        processes.push(lowerer);
      } else if (prevProcess && !prevIsSmart && info.isSmart) {
        const liftInfo = getCommandInfo('lift');
        const lifter = spawnProcess(liftInfo, ['pipe', 'pipe', 'inherit', 'pipe']);
        prevProcess.stdout!.pipe(lifter.stdin!);
        prevProcess = lifter;
        processes.push(lifter);
      }

      const isRealLast = i === commands.length - 1;
      const isSmartAndNeedsView = info.isSmart && isRealLast && !isViewAlreadyPresent && info.cmd !== 'view';

      const stdio: any[] = [
        prevProcess ? 'pipe' : 'inherit',
        (isRealLast && !isSmartAndNeedsView) ? 'inherit' : 'pipe',
        'inherit',
        'pipe', // FD 3: Signal Plane
      ];

      const currentProcess = spawnProcess(info, stdio);
      if (prevProcess && currentProcess.stdin) {
        prevProcess.stdout!.pipe(currentProcess.stdin);
      }

      processes.push(currentProcess);
      prevProcess = currentProcess;
      prevIsSmart = info.isSmart;
    }

    if (prevIsSmart && !isViewAlreadyPresent) {
      const viewInfo = getCommandInfo('view');
      const viewProcess = spawnProcess(viewInfo, ['pipe', 'inherit', 'inherit', 'pipe']);
      prevProcess!.stdout!.pipe(viewProcess.stdin!);
      processes.push(viewProcess);
    }

    // Switchboard Routing
    const debug = process.env.DEBUG === 'newpipe';
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
      const lastProcess = processes[processes.length - 1];
      if (lastProcess) {
        lastProcess.on('exit', resolve);
        lastProcess.on('error', (err) => {
          console.error(`Process error: ${err.message}`);
          resolve(null);
        });
      } else {
        resolve(null);
      }
    });
  }
}
