import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const BIN_DIR = path.join(ROOT, 'dist/bin');
const COMMANDS_DIR = path.join(ROOT, 'commands');

if (fs.existsSync(BIN_DIR)) fs.rmSync(BIN_DIR, { recursive: true });
fs.mkdirSync(BIN_DIR, { recursive: true });

console.log('--- Building NewPipe bin/ ---\n');

// ─── Language Builders ───────────────────────────────────────────────
// Each builder knows how to compile and shim commands for one language.
// To add a new language: add a builder here and create commands/<lang>/.

const builders = {
  ts(langDir) {
    // TS is compiled project-wide (tsconfig includes commands/ts/).
    // We just create bash shims pointing at the compiled JS.
    const compiledDir = path.join(ROOT, 'dist/commands/ts');
    if (!fs.existsSync(compiledDir)) {
      console.log('  [ts] No compiled output found — run `npx tsc` first');
      return;
    }
    for (const f of fs.readdirSync(compiledDir)) {
      if (!f.endsWith('.js') || f.endsWith('.d.js')) continue;
      const name = path.basename(f, '.js');
      const target = path.join(compiledDir, f);
      const shim = `#!/usr/bin/env bash\nnode --no-warnings "${target}" "$@"\n`;
      fs.writeFileSync(path.join(BIN_DIR, name), shim);
      fs.chmodSync(path.join(BIN_DIR, name), '755');
      console.log(`  [ts]     ${name}`);
    }
  },

  python(langDir) {
    const pySdkPath = path.join(ROOT, 'sdk/python');
    for (const f of fs.readdirSync(langDir)) {
      if (!f.endsWith('.py')) continue;
      // Skip __init__.py or helper modules
      if (f.startsWith('_')) continue;
      const name = path.basename(f, '.py');
      const target = path.join(langDir, f);
      const shim = `#!/usr/bin/env bash\nexport PYTHONPATH="${pySdkPath}:\${PYTHONPATH:-}"\nuv run "${target}" "$@"\n`;
      fs.writeFileSync(path.join(BIN_DIR, name), shim);
      fs.chmodSync(path.join(BIN_DIR, name), '755');
      console.log(`  [python] ${name}`);
    }
  },

  rust(langDir) {
    const cargoToml = path.join(langDir, 'Cargo.toml');
    if (!fs.existsSync(cargoToml)) {
      console.log('  [rust] No Cargo.toml found, skipping');
      return;
    }
    console.log('  [rust] Building...');
    try {
      execSync('cargo build --release', { cwd: langDir, stdio: 'inherit' });
    } catch (e) {
      console.error('  [rust] Build failed, skipping Rust commands');
      return;
    }
    const releaseDir = path.join(langDir, 'target/release');
    if (!fs.existsSync(releaseDir)) return;
    // Copy binaries — exclude files with extensions (*.d, *.dylib, etc.)
    for (const f of fs.readdirSync(releaseDir)) {
      const fullPath = path.join(releaseDir, f);
      if (!fs.statSync(fullPath).isFile()) continue;
      if (f.includes('.') || f.startsWith('.')) continue;
      fs.copyFileSync(fullPath, path.join(BIN_DIR, f));
      fs.chmodSync(path.join(BIN_DIR, f), '755');
      console.log(`  [rust]   ${f}`);
    }
  },

  // ─── Add new languages here ──────────────────────────────────────
  // go(langDir) { ... }
  // zig(langDir) { ... }
};

// ─── Step 1: Compile TypeScript (project-wide, once) ─────────────────
console.log('Compiling TypeScript...');
execSync('npx tsc', { cwd: ROOT, stdio: 'inherit' });

// ─── Step 2: Also build the Rust SDK (commands/rust depends on it) ───
const rustSdkDir = path.join(ROOT, 'sdk/rust');
if (fs.existsSync(path.join(rustSdkDir, 'Cargo.toml'))) {
  console.log('Building Rust SDK...');
  try {
    execSync('cargo build --release', { cwd: rustSdkDir, stdio: 'inherit' });
  } catch {
    console.log('  Rust SDK build failed (optional — Rust commands will be skipped)');
  }
}

// ─── Step 3: Walk commands/* and invoke per-language builders ────────
console.log('\nBuilding commands:');
if (fs.existsSync(COMMANDS_DIR)) {
  for (const lang of fs.readdirSync(COMMANDS_DIR).sort()) {
    const langDir = path.join(COMMANDS_DIR, lang);
    if (!fs.statSync(langDir).isDirectory()) continue;
    const builder = builders[lang];
    if (builder) {
      builder(langDir);
    } else {
      console.log(`  [${lang}] No builder registered — skipping`);
    }
  }
}

// ─── Step 4: Create adapter shims (lift, lower) ─────────────────────
console.log('\nBuilding adapters:');
const adapterDir = path.join(ROOT, 'dist/src/core/adapters');
if (fs.existsSync(adapterDir)) {
  for (const f of fs.readdirSync(adapterDir)) {
    if (!f.endsWith('.js') || f.endsWith('.d.js')) continue;
    const name = path.basename(f, '.js');
    const target = path.join(adapterDir, f);
    const shim = `#!/usr/bin/env bash\nnode --no-warnings "${target}" "$@"\n`;
    fs.writeFileSync(path.join(BIN_DIR, name), shim);
    fs.chmodSync(path.join(BIN_DIR, name), '755');
    console.log(`  [adapter] ${name}`);
  }
}

// ─── Summary ─────────────────────────────────────────────────────────
const binCount = fs.readdirSync(BIN_DIR).length;
console.log(`\nBuild complete: ${binCount} commands in dist/bin/`);
