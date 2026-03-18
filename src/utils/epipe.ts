export function handleEpipe() {
  process.stdout.on('error', (err: any) => {
    if (err.code === 'EPIPE') {
      process.exit(0);
    }
  });

  process.on('uncaughtException', (err: any) => {
    if (err.code === 'EPIPE') {
      process.exit(0);
    }
    console.error(err);
    process.exit(1);
  });
}
