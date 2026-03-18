import { execSync } from 'child_process';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { discoverCommands } from './Shell.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

interface CheckResult {
  ok: boolean;
  label: string;
  detail?: string | undefined;
}

function check(ok: boolean, label: string, detail?: string): CheckResult {
  return { ok, label, detail };
}

function printResult(r: CheckResult) {
  const icon = r.ok ? '\x1b[32m✓\x1b[0m' : '\x1b[31m✗\x1b[0m';
  const line = r.detail ? `${icon} ${r.label}  ${r.detail}` : `${icon} ${r.label}`;
  console.log(`  ${line}`);
}

function probeCommand(cmdPath: string): CheckResult {
  const name = path.basename(cmdPath).replace(/\.(js|py|rs)$/, '');
  try {
    const output = execSync(`NEWPIPE_SIGNAL_FD=3 node "${cmdPath}" --help 2>/dev/null`, {
      timeout: 5000,
      encoding: 'utf-8',
    });
    if (output.includes('Protocol: newpipe')) {
      const protoMatch = output.match(/Protocol:\s*(\S+)/);
      const sigMatch = output.match(/Signals:\s*(.+)/);
      const proto = protoMatch?.[1] ?? 'newpipe';
      const sigs = sigMatch?.[1]?.trim() ?? '';
      return check(true, name, `${proto} [${sigs}]`);
    }
    return check(false, name, 'no Protocol: line in --help output');
  } catch (err: any) {
    return check(false, name, `probe failed: ${err.message?.split('\n')[0]}`);
  }
}

export function doctor(searchDirs: string[], opts?: { probe?: boolean | undefined }) {
  let warnings = 0;
  const probe = opts?.probe ?? false;

  // --- NEWPIPE_PATH ---
  console.log('\nChecking NEWPIPE_PATH...');
  const npPath = process.env.NEWPIPE_PATH;
  if (npPath) {
    printResult(check(true, 'NEWPIPE_PATH is set', npPath));
  } else {
    printResult(check(false, 'NEWPIPE_PATH not set', 'using internal commands'));
    warnings++;
  }

  for (const dir of searchDirs) {
    if (fs.existsSync(dir)) {
      const cmds = discoverCommands([dir]);
      printResult(check(true, dir, `(${cmds.length} commands)`));
    } else {
      printResult(check(false, dir, 'directory not found'));
      warnings++;
    }
  }

  // --- Commands ---
  const allCommands = discoverCommands(searchDirs);
  console.log(`\nFound ${allCommands.length} commands:`);
  console.log(`  ${allCommands.map(c => c.name).join(', ')}`);

  // --- Adapters ---
  console.log('\nChecking adapters...');
  const adapterDir = path.join(__dirname, 'adapters');
  for (const adapter of ['lift', 'lower']) {
    const jsPath = path.join(adapterDir, adapter + '.js');
    const rawPath = path.join(adapterDir, adapter);
    if (fs.existsSync(jsPath) || fs.existsSync(rawPath)) {
      printResult(check(true, adapter, 'OK'));
    } else {
      printResult(check(false, adapter, `not found in ${adapterDir}`));
      warnings++;
    }
  }

  // --- Shadow check ---
  console.log('\nChecking for system PATH shadows...');
  let shadows = 0;
  for (const cmd of allCommands) {
    const systemPaths = (process.env.PATH || '').split(path.delimiter);
    for (const dir of systemPaths) {
      const systemCmd = path.join(dir, cmd.name);
      if (fs.existsSync(systemCmd)) {
        printResult(check(true, cmd.name, `shadows ${systemCmd} (intentional)`));
        shadows++;
        break;
      }
    }
  }
  if (shadows === 0) {
    printResult(check(true, 'No shadows', 'no NewPipe commands shadow system commands'));
  }

  // --- Protocol probe (only with --probe) ---
  if (probe) {
    console.log('\nProbing protocol compliance...');
    for (const cmd of allCommands) {
      const result = probeCommand(cmd.fullPath);
      printResult(result);
      if (!result.ok) warnings++;
    }
  }

  // --- Summary ---
  console.log('');
  if (warnings === 0) {
    console.log('\x1b[32mYour NewPipe installation looks good.\x1b[0m\n');
  } else {
    console.log(`\x1b[33mYour NewPipe installation has ${warnings} warning(s).\x1b[0m\n`);
  }

  if (!probe) {
    console.log('Run `doctor --probe` for deep protocol compliance checks.\n');
  }
}
