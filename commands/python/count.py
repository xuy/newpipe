#!/usr/bin/env -S uv run

# /// script
# dependencies = [
#   "pyarrow",
# ]
# ///

"""Count records in a stream. Polymorphic Arrow/JSON.

Usage: pcat data.parquet | filter city Chicago | count
"""

import sys
import signal

signal.signal(signal.SIGPIPE, signal.SIG_DFL)

from newpipe import NewPipe

ARROW_MIME = "application/vnd.apache.arrow.stream"

def main():
    pipe = NewPipe(defer_helo=True)
    upstream = pipe.wait_for_upstream(timeout=5.0)
    total = 0

    if upstream == ARROW_MIME:
        pipe.signals.send("HELO", mime_type="application/json")
        for batch in pipe.arrow_batches():
            total += batch.num_rows
    else:
        pipe.signals.send("HELO", mime_type="application/json")
        for _ in pipe.frames():
            total += 1

    pipe.wait_for_ready(timeout=0.5)
    pipe.emit({"count": total})

if __name__ == "__main__":
    main()
