import { spawn, ChildProcess } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import { doctor } from './doctor.js';
import { UPSTREAM_SIGNALS, DOWNSTREAM_SIGNALS, type SignalMessage } from './Signal.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Split a command line on unquoted, single `|` characters.
 * Respects single quotes, double quotes, and backslash escapes.
 * Does NOT split on `||` (logical OR).
 */
export function splitPipeline(commandLine: string): string[] {
  const stages: string[] = [];
  let current = '';
  let i = 0;
  const len = commandLine.length;

  while (i < len) {
    const ch = commandLine[i]!;

    if (ch === '\\' && i + 1 < len) {
      // Escaped character — consume both
      current += ch + commandLine[i + 1];
      i += 2;
      continue;
    }

    if (ch === "'" || ch === '"') {
      // Consume entire quoted string
      const quote = ch;
      current += ch;
      i++;
      while (i < len && commandLine[i] !== quote) {
        if (commandLine[i] === '\\' && quote === '"' && i + 1 < len) {
          current += commandLine[i]! + commandLine[i + 1];
          i += 2;
        } else {
          current += commandLine[i];
          i++;
        }
      }
      if (i < len) {
        current += commandLine[i]; // closing quote
        i++;
      }
      continue;
    }

    if (ch === '|') {
      // Check for || (logical OR) — keep as part of current stage
      if (i + 1 < len && commandLine[i + 1] === '|') {
        current += '||';
        i += 2;
        continue;
      }
      // Single pipe — split here
      stages.push(current.trim());
      current = '';
      i++;
      continue;
    }

    current += ch;
    i++;
  }

  if (current.trim()) {
    stages.push(current.trim());
  }

  return stages;
}

export interface CaptureResult {
  stdout: string;
  stderr: string;
  signals: string[];
  exitCode: number | null;
  timedOut: boolean;
  stages: StageInfo[];
}

export interface StageInfo {
  command: string;
  exitCode: number | null;
  signals: string[];
}

interface CommandInfo {
  cmd: string;
  args: string[];
  fullPath: string;
  isNewPipe: boolean;
}

export function discoverCommands(searchDirs: string[]): { name: string; fullPath: string }[] {
  const commands: { name: string; fullPath: string }[] = [];
  const seen = new Set<string>();
  for (const dir of searchDirs) {
    if (!fs.existsSync(dir)) continue;
    for (const entry of fs.readdirSync(dir)) {
      if (entry.startsWith('.') || entry.endsWith('.map') || entry.endsWith('.d.ts')) continue;
      const fullPath = path.join(dir, entry);
      if (!fs.statSync(fullPath).isFile()) continue;
      const name = entry.replace(/\.(js|py|rs)$/, '');
      if (!seen.has(name)) {
        seen.add(name);
        commands.push({ name, fullPath });
      }
    }
  }
  return commands.sort((a, b) => a.name.localeCompare(b.name));
}

export class Shell {
  private builtins: Record<string, (args: string[]) => void | Promise<void>> = {
    help: () => {
      const cmds = this.discoverCommands();
      const cmdNames = cmds.map(c => c.name).join(', ');
      console.log(`
NewPipe - Rethinking Unix Pipes for Agents

Builtins:  help, about, doctor
Commands:  ${cmdNames}
Legacy:    anything else falls through to system PATH

Try: ls | head 2, cat data.json | grep pattern, doctor
      `);
    },
    about: () => {
      console.log(`
Rethinking Unix Pipes for Agents
--------------------------------
The Unix pipe is 50 years old. NewPipe revises it for the Agentic Era:
1. Control Flow Signaling
2. Record-based Framing (Orthogonal Planes)
      `);
    },
    doctor: () => doctor(this.getSearchDirs()),
    github: () => { console.log('GitHub: https://github.com/xuy/newpipe'); },
    agent: () => { console.log('Agent status: Connected, Sandbox ready.'); },
    install: () => { console.log('NewPipe is already installed and ready.'); }
  };

  private getAdapterPath(name: string): string {
    const adapterDir = path.join(__dirname, 'adapters');
    const jsPath = path.join(adapterDir, name + '.js');
    if (fs.existsSync(jsPath)) return jsPath;
    return path.join(adapterDir, name);
  }

  getSearchDirs(): string[] {
    const internalBin = path.join(__dirname, '../../bin');  // dist/bin after build
    const npPath = process.env.NEWPIPE_PATH || internalBin;
    return npPath.split(path.delimiter);
  }

  discoverCommands(): { name: string; fullPath: string }[] {
    return discoverCommands(this.getSearchDirs());
  }

  private getCommandInfo(part: string): CommandInfo {
    const [cmd, ...args] = part.split(' ');

    // Search NEWPIPE_PATH for NewPipe commands
    for (const dir of this.getSearchDirs()) {
      const fullPath = path.resolve(dir, cmd!);
      if (fs.existsSync(fullPath)) {
        return { cmd: cmd!, args, fullPath, isNewPipe: true };
      }
      const jsPath = fullPath + '.js';
      if (fs.existsSync(jsPath)) {
        return { cmd: cmd!, args, fullPath: jsPath, isNewPipe: true };
      }
    }

    // Fallback to system PATH (Legacy)
    return { cmd: cmd!, args, fullPath: cmd!, isNewPipe: false };
  }

  async execute(commandLine: string) {
    const pipeParts = splitPipeline(commandLine);
    
    // Builtins handling
    if (pipeParts.length === 1) {
      const parts = pipeParts[0]?.split(' ') ?? [];
      const cmd = parts[0];
      if (cmd && this.builtins[cmd]) {
        await this.builtins[cmd]!(parts.slice(1));
        return;
      }
    }

    const commands = [...pipeParts];
    const isViewPresent = commands[commands.length - 1]?.startsWith('view');
    
    let processes: ChildProcess[] = [];
    let prevProcess: ChildProcess | null = null;
    let prevIsNewPipe = false;

    const env = { ...process.env, NEWPIPE_SIGNAL_FD: '3' };

    for (let i = 0; i < commands.length; i++) {
      const info = this.getCommandInfo(commands[i]!);

      // Impedance Matching (Inject lower/lift if boundary crossed)
      // Bridge Gap (Smart/Legacy boundary)
      if (prevProcess && prevIsNewPipe !== info.isNewPipe) {
        const adapterName = prevIsNewPipe ? 'lower' : 'lift';
        const adapterPath = this.getAdapterPath(adapterName);
        const bridgeProc = spawn('node', [adapterPath], { stdio: ['pipe', 'pipe', 'inherit', 'pipe'], env });

        if (prevProcess.stdout && bridgeProc.stdin) {
          prevProcess.stdout.pipe(bridgeProc.stdin);
        }
        prevProcess = bridgeProc;
        processes.push(bridgeProc);
      }

      const isRealLast = i === commands.length - 1;
      const needsView = info.isNewPipe && isRealLast && !isViewPresent;

      const stdio: any[] = [
        prevProcess ? 'pipe' : 'inherit',
        (isRealLast && !needsView) ? 'inherit' : 'pipe',
        'inherit',
        'pipe' // FD 3: Signal Plane
      ];

      const proc = spawn(info.fullPath, info.args, { stdio, env });
      if (prevProcess) {
        prevProcess.stdout!.on('error', () => {});
        proc.stdin!.on('error', () => {});
        prevProcess.stdout!.pipe(proc.stdin!);
      }

      processes.push(proc);
      prevProcess = proc;
      prevIsNewPipe = info.isNewPipe;
    }

    // Auto-append VIEW if necessary
    if (prevIsNewPipe && !isViewPresent) {
      const view = this.getCommandInfo('view');
      const viewProc = spawn(view.fullPath, [], { stdio: ['pipe', 'inherit', 'inherit', 'pipe'], env });
      prevProcess!.stdout!.on('error', () => {});
      viewProc.stdin!.on('error', () => {});
      prevProcess!.stdout!.pipe(viewProc.stdin!);
      processes.push(viewProc);
    }

    // Switchboard: Route signals directionally between adjacent stages
    // PAUSE/RESUME/ACK/STOP flow upstream (consumer→producer, i→i-1)
    // HELO/ERROR flow downstream (producer→consumer, i→i+1)
    for (let i = 0; i < processes.length; i++) {
      const signalPipe = processes[i]!.stdio[3] as any;
      if (signalPipe) {
        signalPipe.on('error', () => {});
        signalPipe.on('data', (chunk: Buffer) => {
          for (const line of chunk.toString().split('\n')) {
            if (!line.trim()) continue;
            try {
              const signal: SignalMessage = JSON.parse(line);
              const msg = line + '\n';
              if (UPSTREAM_SIGNALS.has(signal.type as any)) {
                // Route upstream: toward producer (i-1)
                if (i > 0 && processes[i-1]!.stdio[3]) {
                  try { (processes[i-1]!.stdio[3] as any).write(msg); } catch {}
                }
              } else if (DOWNSTREAM_SIGNALS.has(signal.type as any)) {
                // Route downstream: toward consumer (i+1)
                if (i < processes.length - 1 && processes[i+1]!.stdio[3]) {
                  try { (processes[i+1]!.stdio[3] as any).write(msg); } catch {}
                }
              } else {
                // Unknown signal: route both directions (forward-compat)
                if (i > 0 && processes[i-1]!.stdio[3]) {
                  try { (processes[i-1]!.stdio[3] as any).write(msg); } catch {}
                }
                if (i < processes.length - 1 && processes[i+1]!.stdio[3]) {
                  try { (processes[i+1]!.stdio[3] as any).write(msg); } catch {}
                }
              }
            } catch {
              // Unparseable signal: broadcast (backward-compat)
              const msg = line + '\n';
              if (i > 0 && processes[i-1]!.stdio[3]) {
                try { (processes[i-1]!.stdio[3] as any).write(msg); } catch {}
              }
              if (i < processes.length - 1 && processes[i+1]!.stdio[3]) {
                try { (processes[i+1]!.stdio[3] as any).write(msg); } catch {}
              }
            }
          }
        });
      }
    }

    await new Promise((resolve) => {
      const last = processes[processes.length - 1];
      if (last) { last.on('exit', resolve); last.on('error', resolve); }
      else resolve(null);
    });
  }

  async executeCapture(commandLine: string, options?: { timeoutMs?: number; cwd?: string }): Promise<CaptureResult> {
    const timeoutMs = options?.timeoutMs ?? 30000;
    const pipeParts = splitPipeline(commandLine);

    // Builtins handling — capture console.log output
    if (pipeParts.length === 1) {
      const parts = pipeParts[0]?.split(' ') ?? [];
      const cmd = parts[0];
      if (cmd && this.builtins[cmd]) {
        const chunks: string[] = [];
        const origLog = console.log;
        console.log = (...args: any[]) => { chunks.push(args.join(' ')); };
        await this.builtins[cmd]!(parts.slice(1));
        console.log = origLog;
        return {
          stdout: chunks.join('\n'),
          stderr: '',
          signals: [],
          exitCode: 0,
          timedOut: false,
          stages: [{ command: cmd, exitCode: 0, signals: [] }],
        };
      }
    }

    const commands = [...pipeParts];
    // In capture mode, never auto-append view — we want raw data
    let processes: ChildProcess[] = [];
    let commandNames: string[] = [];
    let prevProcess: ChildProcess | null = null;
    let prevIsNewPipe = false;

    const env = {
      ...process.env,
      NEWPIPE_SIGNAL_FD: '3',
      ...(options?.cwd ? { PWD: options.cwd } : {}),
    };
    const spawnOpts = options?.cwd ? { cwd: options.cwd } : {};

    for (let i = 0; i < commands.length; i++) {
      const info = this.getCommandInfo(commands[i]!);

      // Impedance Matching
      if (prevProcess && prevIsNewPipe !== info.isNewPipe) {
        const adapterName = prevIsNewPipe ? 'lower' : 'lift';
        const adapterPath = this.getAdapterPath(adapterName);
        const bridgeProc = spawn('node', [adapterPath], {
          stdio: ['pipe', 'pipe', 'pipe', 'pipe'],
          env,
          ...spawnOpts,
        });
        if (prevProcess.stdout && bridgeProc.stdin) {
          prevProcess.stdout.pipe(bridgeProc.stdin);
        }
        prevProcess = bridgeProc;
        processes.push(bridgeProc);
        commandNames.push(`[${adapterName}]`);
      }

      const isRealLast = i === commands.length - 1;

      const stdio: any[] = [
        prevProcess ? 'pipe' : 'pipe',
        'pipe',
        'pipe',
        'pipe',
      ];

      const proc = spawn(info.fullPath, info.args, { stdio, env, ...spawnOpts });
      if (prevProcess) prevProcess.stdout!.pipe(proc.stdin!);

      processes.push(proc);
      commandNames.push(commands[i]!);
      prevProcess = proc;
      prevIsNewPipe = info.isNewPipe;
    }

    // If the pipeline is smart, append lower to get text output
    if (prevIsNewPipe) {
      const lowerPath = this.getAdapterPath('lower');
      const lowerProc = spawn('node', [lowerPath], {
        stdio: ['pipe', 'pipe', 'pipe', 'pipe'],
        env,
        ...spawnOpts,
      });
      prevProcess!.stdout!.pipe(lowerProc.stdin!);
      processes.push(lowerProc);
      commandNames.push('[lower]');
    }

    // Collect per-stage signals
    const stageSignals: string[][] = processes.map(() => []);

    // Switchboard: Route signals directionally between adjacent stages
    for (let i = 0; i < processes.length; i++) {
      const signalPipe = processes[i]!.stdio[3] as any;
      if (signalPipe) {
        signalPipe.on('error', () => {});
        signalPipe.on('data', (chunk: Buffer) => {
          for (const line of chunk.toString().split('\n')) {
            if (!line.trim()) continue;
            stageSignals[i]!.push(line.trim());
            try {
              const signal: SignalMessage = JSON.parse(line);
              const msg = line + '\n';
              if (UPSTREAM_SIGNALS.has(signal.type as any)) {
                if (i > 0 && processes[i-1]!.stdio[3]) {
                  try { (processes[i-1]!.stdio[3] as any).write(msg); } catch {}
                }
              } else if (DOWNSTREAM_SIGNALS.has(signal.type as any)) {
                if (i < processes.length - 1 && processes[i+1]!.stdio[3]) {
                  try { (processes[i+1]!.stdio[3] as any).write(msg); } catch {}
                }
              } else {
                if (i > 0 && processes[i-1]!.stdio[3]) {
                  try { (processes[i-1]!.stdio[3] as any).write(msg); } catch {}
                }
                if (i < processes.length - 1 && processes[i+1]!.stdio[3]) {
                  try { (processes[i+1]!.stdio[3] as any).write(msg); } catch {}
                }
              }
            } catch {
              const msg = line + '\n';
              if (i > 0 && processes[i-1]!.stdio[3]) {
                try { (processes[i-1]!.stdio[3] as any).write(msg); } catch {}
              }
              if (i < processes.length - 1 && processes[i+1]!.stdio[3]) {
                try { (processes[i+1]!.stdio[3] as any).write(msg); } catch {}
              }
            }
          }
        });
      }
    }

    // Collect stdout and stderr from the last process
    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];

    const lastProc = processes[processes.length - 1]!;
    lastProc.stdout?.on('data', (chunk: Buffer) => stdoutChunks.push(chunk));

    // Collect stderr from ALL stages
    for (const proc of processes) {
      proc.stderr?.on('data', (chunk: Buffer) => stderrChunks.push(chunk));
    }

    // Close stdin of the first process (no interactive input in capture mode)
    const firstProc = processes[0];
    if (firstProc?.stdin && !firstProc.stdin.destroyed) {
      firstProc.stdin.end();
    }

    // Track exit codes per stage
    const exitCodes: (number | null)[] = processes.map(() => null);
    for (let i = 0; i < processes.length; i++) {
      processes[i]!.on('exit', (code) => { exitCodes[i] = code; });
    }

    // Wait for completion with timeout
    let timedOut = false;
    await new Promise<void>((resolve) => {
      const timer = setTimeout(() => {
        timedOut = true;
        for (const proc of processes) {
          try { proc.kill('SIGTERM'); } catch {}
        }
        // Force kill after 2s grace period
        setTimeout(() => {
          for (const proc of processes) {
            try { proc.kill('SIGKILL'); } catch {}
          }
          resolve();
        }, 2000);
      }, timeoutMs);

      lastProc.on('exit', () => { clearTimeout(timer); resolve(); });
      lastProc.on('error', () => { clearTimeout(timer); resolve(); });
    });

    const stdout = Buffer.concat(stdoutChunks).toString();
    const stderr = Buffer.concat(stderrChunks).toString();
    const allSignals = stageSignals.flat();

    const stages: StageInfo[] = commandNames.map((name, i) => ({
      command: name,
      exitCode: exitCodes[i] ?? null,
      signals: stageSignals[i] ?? [],
    }));

    return {
      stdout,
      stderr,
      signals: allSignals,
      exitCode: exitCodes[exitCodes.length - 1] ?? null,
      timedOut,
      stages,
    };
  }
}
