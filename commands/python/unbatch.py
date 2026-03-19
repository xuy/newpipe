#!/usr/bin/env -S uv run

# /// script
# dependencies = [
#   "pyarrow",
# ]
# ///

"""Convert Arrow batches into individual JSON record frames.

Arrow batches contain many rows packed into one frame. unbatch explodes
them into one frame per row, so downstream commands like head and view
work at the record level.

Usage:
  pcat data.parquet | unbatch | head 5
  pcat data.parquet | filter city Chicago | unbatch | head 3
"""

import sys
import signal

signal.signal(signal.SIGPIPE, signal.SIG_DFL)

from newpipe import NewPipe

ARROW_MIME = "application/vnd.apache.arrow.stream"

def main():
    pipe = NewPipe(defer_helo=True)
    upstream = pipe.wait_for_upstream(timeout=2.0)

    if upstream == ARROW_MIME:
        pipe.signals.send("HELO", mime_type="application/json")
        pipe.wait_for_ready(timeout=0.5)

        for batch in pipe.arrow_batches():
            if pipe.stopped: break
            for row in batch.to_pylist():
                if pipe.stopped: break
                pipe.emit(row)
    else:
        # Not Arrow — pass through as-is
        pipe.signals.send("HELO", mime_type=upstream or "application/json")
        pipe.wait_for_ready(timeout=0.5)
        for payload in pipe.frames():
            if pipe.stopped: break
            pipe.emit_raw(payload)

if __name__ == "__main__":
    main()
