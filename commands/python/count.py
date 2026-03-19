#!/usr/bin/env -S uv run

# /// script
# dependencies = [
#   "pyarrow",
# ]
# ///

"""Count records in a stream. Polymorphic: Arrow batches or JSON frames.

Usage: pcat data.parquet | filter city Chicago | count
"""

import sys
import struct
import signal
import json

signal.signal(signal.SIGPIPE, signal.SIG_DFL)

from newpipe import NewPipe

ARROW_MIME = "application/vnd.apache.arrow.stream"

def main():
    pipe = NewPipe(defer_helo=True)
    upstream = pipe.wait_for_upstream(timeout=5.0)
    total = 0

    if upstream == ARROW_MIME:
        import pyarrow as pa
        pipe.signals.send("HELO", mime_type="application/json")
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
                total += batch.num_rows
    else:
        pipe.signals.send("HELO", mime_type="application/json")
        while not pipe.stopped:
            header = sys.stdin.buffer.read(4)
            if not header or len(header) < 4:
                break
            length = struct.unpack('>I', header)[0]
            sys.stdin.buffer.read(length)  # consume but don't parse
            total += 1

    pipe.wait_for_ready(timeout=0.5)
    pipe.emit({"count": total})

if __name__ == "__main__":
    main()
