#!/usr/bin/env -S uv run

# /// script
# dependencies = [
#   "pyarrow",
# ]
# ///

"""Project columns from records. Polymorphic Arrow/JSON.

Usage: pcat data.parquet | cols city,age,occupation | head 5
"""

import sys
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
        pipe.signals.send("HELO", mime_type=ARROW_MIME)
        pipe.wait_for_ready(timeout=0.5)
        for batch in pipe.arrow_batches():
            if pipe.stopped: break
            available = [c for c in columns if c in batch.schema.names]
            if available:
                pipe.emit_arrow(batch.select(available))
    else:
        pipe.signals.send("HELO", mime_type="application/json")
        pipe.wait_for_ready(timeout=0.5)
        for record in pipe.records():
            if pipe.stopped: break
            if isinstance(record, dict):
                pipe.emit({k: record[k] for k in columns if k in record})

if __name__ == "__main__":
    main()
