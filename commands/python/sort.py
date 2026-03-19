#!/usr/bin/env -S uv run

# /// script
# dependencies = [
#   "pyarrow",
# ]
# ///

"""Sort records by column. Polymorphic Arrow/JSON.

Usage:
  pcat data.parquet | sort age                 # ascending
  pcat data.parquet | sort age desc            # descending
"""

import sys
import signal

signal.signal(signal.SIGPIPE, signal.SIG_DFL)

from newpipe import NewPipe

ARROW_MIME = "application/vnd.apache.arrow.stream"

def main():
    if len(sys.argv) < 2:
        print("Usage: sort <column> [asc|desc]", file=sys.stderr)
        sys.exit(1)

    column = sys.argv[1]
    descending = len(sys.argv) >= 3 and sys.argv[2].lower() in ('desc', 'descending')

    pipe = NewPipe(defer_helo=True)
    upstream = pipe.wait_for_upstream(timeout=2.0)

    if upstream == ARROW_MIME:
        import pyarrow as pa
        import pyarrow.compute as pc

        pipe.signals.send("HELO", mime_type=ARROW_MIME)
        pipe.wait_for_ready(timeout=0.5)

        # Collect all batches, combine, sort, re-emit
        batches = []
        schema = None
        for batch in pipe.arrow_batches():
            if pipe.stopped: break
            batches.append(batch)
            schema = batch.schema

        if batches and schema and not pipe.stopped:
            table = pa.Table.from_batches(batches, schema=schema)
            sorted_indices = pc.sort_indices(table, sort_keys=[(column, "descending" if descending else "ascending")])
            sorted_table = table.take(sorted_indices)
            for batch in sorted_table.to_batches(max_chunksize=10_000):
                if pipe.stopped: break
                pipe.emit_arrow(batch)
    else:
        pipe.signals.send("HELO", mime_type="application/json")
        pipe.wait_for_ready(timeout=0.5)

        records = list(pipe.records())
        reverse = descending
        try:
            records.sort(key=lambda r: r.get(column, '') if isinstance(r, dict) else r, reverse=reverse)
        except TypeError:
            pass
        for record in records:
            if pipe.stopped: break
            pipe.emit(record)

if __name__ == "__main__":
    main()
