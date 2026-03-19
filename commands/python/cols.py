#!/usr/bin/env -S uv run

# /// script
# dependencies = [
#   "pyarrow",
# ]
# ///

"""Project columns from records. Polymorphic: Arrow batches or JSON frames.

Usage: pcat data.parquet | cols city,age,occupation | head 5
"""

import sys
import struct
import signal
import json

signal.signal(signal.SIGPIPE, signal.SIG_DFL)

from newpipe import NewPipe

ARROW_MIME = "application/vnd.apache.arrow.stream"

def main():
    if len(sys.argv) < 2:
        print("Usage: cols <col1,col2,...>", file=sys.stderr)
        sys.exit(1)

    columns = [c.strip() for c in sys.argv[1].split(',')]

    pipe = NewPipe(defer_helo=True)
    upstream = pipe.wait_for_upstream(timeout=2.0)

    if upstream == ARROW_MIME:
        import pyarrow as pa

        pipe.mime_type = ARROW_MIME
        pipe.signals.send("HELO", mime_type=ARROW_MIME)
        pipe.wait_for_ready(timeout=0.5)

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
                # Select only requested columns that exist
                available = [c for c in columns if c in batch.schema.names]
                if not available:
                    continue
                projected = batch.select(available)
                sink = pa.BufferOutputStream()
                writer = pa.ipc.new_stream(sink, projected.schema)
                writer.write_batch(projected)
                writer.close()
                pipe.emit_raw(sink.getvalue().to_pybytes())
    else:
        pipe.signals.send("HELO", mime_type="application/json")
        pipe.wait_for_ready(timeout=0.5)
        while not pipe.stopped:
            header = sys.stdin.buffer.read(4)
            if not header or len(header) < 4:
                break
            length = struct.unpack('>I', header)[0]
            payload = sys.stdin.buffer.read(length)
            if len(payload) < length:
                break
            try:
                data = json.loads(payload.decode('utf-8'))
                if isinstance(data, dict):
                    projected = {k: data[k] for k in columns if k in data}
                    pipe.emit(projected)
            except (json.JSONDecodeError, UnicodeDecodeError):
                pass

if __name__ == "__main__":
    main()
