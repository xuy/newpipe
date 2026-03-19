#!/usr/bin/env -S uv run

# /// script
# dependencies = [
#   "pyarrow",
# ]
# ///

import sys
import signal

# Gracefully handle EPIPE (downstream closed)
signal.signal(signal.SIGPIPE, signal.SIG_DFL)

# SDK setup
from newpipe import NewPipe

def main():
    if len(sys.argv) < 2:
        print("Usage: pcat <file.parquet>", file=sys.stderr)
        sys.exit(1)

    file_path = sys.argv[1]

    pipe = NewPipe(mime_type="application/vnd.apache.arrow.stream")
    pipe.wait_for_ready(timeout=0.5)

    try:
        import pyarrow.parquet as pq
        import pyarrow as pa

        parquet_file = pq.ParquetFile(file_path)
        for batch in parquet_file.iter_batches(batch_size=10_000):
            if pipe.stopped: break
            # Serialize the RecordBatch as an Arrow IPC stream message
            sink = pa.BufferOutputStream()
            writer = pa.ipc.new_stream(sink, batch.schema)
            writer.write_batch(batch)
            writer.close()
            pipe.emit_raw(sink.getvalue().to_pybytes())

    except ImportError:
        pipe.signals.send("ERROR", payload="Missing pyarrow. Please install it or run with 'uv run --with pyarrow'")
        sys.exit(1)
    except Exception as e:
        pipe.signals.send("ERROR", payload=str(e))
        sys.exit(1)

if __name__ == "__main__":
    main()
