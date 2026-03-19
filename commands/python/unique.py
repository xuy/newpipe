#!/usr/bin/env -S uv run

# /// script
# dependencies = [
#   "pyarrow",
# ]
# ///

"""Distinct values of a column. Polymorphic Arrow/JSON.

Usage: pcat data.parquet | unique city
"""

import sys
import signal

signal.signal(signal.SIGPIPE, signal.SIG_DFL)

from newpipe import NewPipe

ARROW_MIME = "application/vnd.apache.arrow.stream"

def main():
    if len(sys.argv) < 2:
        print("Usage: unique <column>", file=sys.stderr)
        sys.exit(1)

    column = sys.argv[1]

    pipe = NewPipe(defer_helo=True)
    upstream = pipe.wait_for_upstream(timeout=2.0)

    if upstream == ARROW_MIME:
        import pyarrow as pa
        import pyarrow.compute as pc

        pipe.signals.send("HELO", mime_type="application/json")

        seen = set()
        for batch in pipe.arrow_batches():
            if pipe.stopped: break
            if column not in batch.schema.names:
                continue
            col = batch.column(column)
            values = col.to_pylist()
            for v in values:
                if v not in seen:
                    seen.add(v)

        pipe.wait_for_ready(timeout=0.5)
        for v in sorted(seen, key=lambda x: (x is None, str(x))):
            if pipe.stopped: break
            pipe.emit({column: v})
    else:
        pipe.signals.send("HELO", mime_type="application/json")
        pipe.wait_for_ready(timeout=0.5)

        seen = set()
        for record in pipe.records():
            if pipe.stopped: break
            if isinstance(record, dict):
                v = record.get(column)
                if v not in seen:
                    seen.add(v)
                    pipe.emit({column: v})

if __name__ == "__main__":
    main()
