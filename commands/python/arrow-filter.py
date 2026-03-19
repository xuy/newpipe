#!/usr/bin/env -S uv run

# /// script
# dependencies = [
#   "pyarrow",
# ]
# ///

"""Filter rows within Arrow batches — stays in Arrow, no JSON round-trip.

Usage: arrow-filter <column> <pattern>
Example: pcat data.parquet | arrow-filter city Madison | arrow-lower | head 5
"""

import sys
import re
import struct
import signal

signal.signal(signal.SIGPIPE, signal.SIG_DFL)

from newpipe import NewPipe

def main():
    if len(sys.argv) < 3:
        print("Usage: arrow-filter <column> <pattern>", file=sys.stderr)
        sys.exit(1)

    column = sys.argv[1]
    pattern = re.compile(sys.argv[2], re.IGNORECASE)

    pipe = NewPipe(mime_type="application/vnd.apache.arrow.stream")
    pipe.wait_for_ready(timeout=0.5)

    try:
        import pyarrow as pa
        import pyarrow.compute as pc

        while not pipe.stopped:
            header = sys.stdin.buffer.read(4)
            if not header or len(header) < 4:
                break
            length = struct.unpack('>I', header)[0]
            payload = sys.stdin.buffer.read(length)
            if len(payload) < length:
                break

            reader = pa.ipc.open_stream(payload)
            for batch in reader:
                if pipe.stopped: break
                if column not in batch.schema.names:
                    continue

                # Use Arrow compute for filtering — no Python loop over rows
                col = batch.column(column)
                mask = pc.match_substring_regex(col.cast(pa.string()), sys.argv[2], ignore_case=True)
                filtered = batch.filter(mask)

                if filtered.num_rows == 0:
                    continue

                # Re-serialize as Arrow IPC
                sink = pa.BufferOutputStream()
                writer = pa.ipc.new_stream(sink, filtered.schema)
                writer.write_batch(filtered)
                writer.close()
                pipe.emit_raw(sink.getvalue().to_pybytes())

    except Exception as e:
        pipe.signals.send("ERROR", payload=str(e))
        sys.exit(1)

if __name__ == "__main__":
    main()
