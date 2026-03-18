/**
 * Shared --help handler for NewPipe commands.
 *
 * When NEWPIPE_SIGNAL_FD is set (spawned by the shell), includes
 * protocol metadata that `doctor --probe` can verify.
 * When not set, prints human-friendly help only.
 */
export function printHelp(meta: {
  name: string;
  summary: string;
  usage: string;
  signals: string[];
}): void {
  console.log(`${meta.name} - ${meta.summary}`);
  console.log(`\nUsage: ${meta.usage}`);

  if (process.env.NEWPIPE_SIGNAL_FD) {
    console.log(`\nProtocol: newpipe/1`);
    console.log(`Signals:  ${meta.signals.join(', ')}`);
  }
}

/**
 * Check if --help was passed and handle it.
 * Returns true if --help was handled (caller should exit).
 */
export function handleHelp(meta: {
  name: string;
  summary: string;
  usage: string;
  signals: string[];
}): boolean {
  if (process.argv.includes('--help')) {
    printHelp(meta);
    return true;
  }
  return false;
}
