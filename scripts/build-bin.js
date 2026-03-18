import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const BIN_DIR = path.join(ROOT, 'dist/bin');

if (fs.existsSync(BIN_DIR)) fs.rmSync(BIN_DIR, { recursive: true });
fs.mkdirSync(BIN_DIR, { recursive: true });

console.log('--- Building NewPipe bin/ ---');

// 1. Compile TS -> JS
console.log('Compiling TypeScript...');
execSync('npx tsc', { cwd: ROOT });

// 2. Compile Rust -> Binaries
console.log('Building Rust examples...');
execSync('cargo build --examples', { cwd: path.join(ROOT, 'sdk/rust') });

// 3. Create JS Bash Shims
const jsDir = path.join(ROOT, 'dist/src/commands');
fs.readdirSync(jsDir).filter(f => f.endsWith('.js')).forEach(f => {
  const name = path.basename(f, '.js');
  const target = path.join(jsDir, f);
  const shim = `#!/usr/bin/env bash\nnode --no-warnings "${target}" "$@"\n`;
  fs.writeFileSync(path.join(BIN_DIR, name), shim);
  fs.chmodSync(path.join(BIN_DIR, name), '755');
  console.log(`  [Smart] JS   -> ${name}`);
});

// 4. Create Python Bash Shims
const pyDir = path.join(ROOT, 'src/commands');
const pySdkPath = path.join(ROOT, 'sdk/python');
fs.readdirSync(pyDir).filter(f => f.endsWith('.py')).forEach(f => {
  const name = path.basename(f, '.py');
  const target = path.join(pyDir, f);
  const shim = `#!/usr/bin/env bash\nexport PYTHONPATH="${pySdkPath}:$PYTHONPATH"\nuv run "${target}" "$@"\n`;
  fs.writeFileSync(path.join(BIN_DIR, name), shim);
  fs.chmodSync(path.join(BIN_DIR, name), '755');
  console.log(`  [Smart] PY   -> ${name}`);
});

// 5. Copy Rust Binaries
const rustDir = path.join(ROOT, 'sdk/rust/target/debug/examples');
if (fs.existsSync(rustDir)) {
  fs.readdirSync(rustDir).filter(f => !f.includes('.') && !f.endsWith('.d')).forEach(f => {
    fs.copyFileSync(path.join(rustDir, f), path.join(BIN_DIR, f));
    fs.chmodSync(path.join(BIN_DIR, f), '755');
    console.log(`  [Smart] RS   -> ${f}`);
  });
}
console.log('Build Complete.');
