import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

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

function discoverCommands(searchDirs: string[]): { name: string; fullPath: string }[] {
  const commands: { name: string; fullPath: string }[] = [];
  const seen = new Set<string>();

  for (const dir of searchDirs) {
    if (!fs.existsSync(dir)) continue;
    for (const entry of fs.readdirSync(dir)) {
      // Skip hidden files and source maps
      if (entry.startsWith('.') || entry.endsWith('.map') || entry.endsWith('.d.ts')) continue;
      const fullPath = path.join(dir, entry);
      const stat = fs.statSync(fullPath);
      if (!stat.isFile()) continue;
      // Derive command name: strip .js/.py/.rs extensions
      const name = entry.replace(/\.(js|py|rs)$/, '');
      if (!seen.has(name)) {
        seen.add(name);
        commands.push({ name, fullPath });
      }
    }
  }

  return commands.sort((a, b) => a.name.localeCompare(b.name));
}

function checkProtocol(cmdPath: string): CheckResult {
  const name = path.basename(cmdPath).replace(/\.(js|py|rs)$/, '');
  try {
    const source = fs.readFileSync(cmdPath, 'utf-8');
    // Check if the command uses the NewPipe signal plane
    const usesSignalPlane = source.includes('SignalPlane') || source.includes('NEWPIPE_SIGNAL_FD');
    if (usesSignalPlane) {
      return check(true, name, 'uses SignalPlane');
    }
    return check(false, name, 'no SignalPlane usage found');
  } catch (err: any) {
    return check(false, name, `cannot read: ${err.message}`);
  }
}

export function doctor(searchDirs: string[]) {
  let warnings = 0;

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

  // --- Protocol compliance ---
  console.log('\nChecking protocol compliance...');
  for (const cmd of allCommands) {
    const result = checkProtocol(cmd.fullPath);
    printResult(result);
    if (!result.ok) warnings++;
  }

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

  // --- Summary ---
  console.log('');
  if (warnings === 0) {
    console.log('\x1b[32mYour NewPipe installation looks good.\x1b[0m\n');
  } else {
    console.log(`\x1b[33mYour NewPipe installation has ${warnings} warning(s).\x1b[0m\n`);
  }
}
