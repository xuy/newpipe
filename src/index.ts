import { fileURLToPath } from 'url';
import path from 'path';
import { Shell } from './core/Shell.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function main() {
  const args = process.argv.slice(2);
  const commandLine = args.join(' ');
  
  if (!commandLine) {
    console.log('NewPipe Shell - Rethinking Unix Pipes for Agents');
    console.log('Usage: newpipe "ls | grep src"');
    process.exit(0);
  }

  const shell = new Shell();
  await shell.execute(commandLine);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch(err => {
    console.error(err);
    process.exit(1);
  });
}
