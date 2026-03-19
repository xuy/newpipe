#!/usr/bin/env -S uv run

# /// script
# dependencies = [
#   "pyarrow",
# ]
# ///

"""Polymorphic filter — adapts to whatever the upstream sends.

Arrow in → Arrow out (columnar filter, no JSON round-trip)
JSON in  → JSON out  (regex match on field or whole record)

Usage: filter <column> <pattern>
"""

import sys
import re
import struct
import signal
import json

signal.signal(signal.SIGPIPE, signal.SIG_DFL)

from newpipe import NewPipe

ARROW_MIME = "application/vnd.apache.arrow.stream"

def filter_arrow(pipe, column, pattern_str):
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
            col = batch.column(column)
            mask = pc.match_substring_regex(col.cast(pa.string()), pattern_str, ignore_case=True)
            filtered = batch.filter(mask)
            if filtered.num_rows == 0:
                continue
            sink = pa.BufferOutputStream()
            writer = pa.ipc.new_stream(sink, filtered.schema)
            writer.write_batch(filtered)
            writer.close()
            pipe.emit_raw(sink.getvalue().to_pybytes())

def filter_json(pipe, column, pattern):
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
            value = data.get(column, payload.decode('utf-8')) if isinstance(data, dict) else payload.decode('utf-8')
            if pattern.search(str(value)):
                pipe.emit(data)
        except (json.JSONDecodeError, UnicodeDecodeError):
            if pattern.search(payload.decode('utf-8', errors='replace')):
                pipe.emit(payload.decode('utf-8', errors='replace'))

def main():
    if len(sys.argv) < 3:
        print("Usage: filter <column> <pattern>", file=sys.stderr)
        sys.exit(1)

    column = sys.argv[1]
    pattern_str = sys.argv[2]
    pattern = re.compile(pattern_str, re.IGNORECASE)

    # Wait to see what upstream sends, then adapt
    pipe = NewPipe(mime_type="application/json")
    upstream = pipe.wait_for_upstream(timeout=2.0)

    if upstream == ARROW_MIME:
        # Switch our output MIME to match
        pipe.mime_type = ARROW_MIME
        pipe.signals.send("HELO", mime_type=ARROW_MIME)
        pipe.wait_for_ready(timeout=0.5)
        filter_arrow(pipe, column, pattern_str)
    else:
        pipe.wait_for_ready(timeout=0.5)
        filter_json(pipe, column, pattern)

if __name__ == "__main__":
    main()
