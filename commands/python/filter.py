#!/usr/bin/env -S uv run

# /// script
# dependencies = [
#   "pyarrow",
# ]
# ///

"""Polymorphic filter — adapts to whatever the upstream sends.

Usage:
  filter <column> <pattern>          # regex match (default)
  filter <column> eq <value>         # equal
  filter <column> gt <value>         # greater than
  filter <column> lt <value>         # less than
  filter <column> gte <value>        # greater than or equal
  filter <column> lte <value>        # less than or equal
  filter <column> ne <value>         # not equal

Examples:
  pcat data.parquet | filter city Chicago           # regex
  pcat data.parquet | filter age gt 30              # comparison
  pcat data.parquet | filter age gte 18 | count
"""

import sys
import re
import signal
import json

signal.signal(signal.SIGPIPE, signal.SIG_DFL)

from newpipe import NewPipe

ARROW_MIME = "application/vnd.apache.arrow.stream"
COMPARISON_OPS = {'eq', 'ne', 'gt', 'lt', 'gte', 'lte'}

def parse_args():
    if len(sys.argv) < 3:
        print("Usage: filter <column> <op|pattern> [value]", file=sys.stderr)
        sys.exit(1)
    column = sys.argv[1]
    if len(sys.argv) >= 4 and sys.argv[2] in COMPARISON_OPS:
        return column, sys.argv[2], sys.argv[3]
    else:
        return column, 'regex', sys.argv[2]

def filter_arrow(pipe, column, op, value):
    import pyarrow as pa
    import pyarrow.compute as pc

    for batch in pipe.arrow_batches():
        if pipe.stopped: break
        if column not in batch.schema.names:
            continue

        col = batch.column(column)
        if op == 'regex':
            mask = pc.match_substring_regex(col.cast(pa.string()), value, ignore_case=True)
        else:
            # Try numeric comparison first, fall back to string
            try:
                cmp_val = int(value)
            except ValueError:
                try:
                    cmp_val = float(value)
                except ValueError:
                    cmp_val = value

            cmp_col = col
            if isinstance(cmp_val, (int, float)):
                try:
                    cmp_col = col.cast(pa.float64())
                except:
                    cmp_col = col.cast(pa.string())
                    cmp_val = str(cmp_val)

            ops = {
                'eq': pc.equal, 'ne': pc.not_equal,
                'gt': pc.greater, 'lt': pc.less,
                'gte': pc.greater_equal, 'lte': pc.less_equal,
            }
            mask = ops[op](cmp_col, cmp_val)

        filtered = batch.filter(mask)
        if filtered.num_rows > 0:
            pipe.emit_arrow(filtered)

def filter_json(pipe, column, op, value):
    pattern = re.compile(value, re.IGNORECASE) if op == 'regex' else None

    try:
        cmp_val = int(value)
    except ValueError:
        try:
            cmp_val = float(value)
        except ValueError:
            cmp_val = value

    def matches(record_value):
        if op == 'regex':
            return pattern.search(str(record_value))
        rv = record_value
        cv = cmp_val
        # Try numeric comparison if both can be numeric
        if isinstance(cv, (int, float)):
            try:
                rv = float(rv)
            except (ValueError, TypeError):
                return False
        ops = {
            'eq': lambda a, b: a == b, 'ne': lambda a, b: a != b,
            'gt': lambda a, b: a > b, 'lt': lambda a, b: a < b,
            'gte': lambda a, b: a >= b, 'lte': lambda a, b: a <= b,
        }
        return ops[op](rv, cv)

    for record in pipe.records():
        if pipe.stopped: break
        if isinstance(record, dict):
            val = record.get(column)
            if val is not None and matches(val):
                pipe.emit(record)

def main():
    column, op, value = parse_args()

    pipe = NewPipe(defer_helo=True)
    upstream = pipe.wait_for_upstream(timeout=2.0)

    if upstream == ARROW_MIME:
        pipe.mime_type = ARROW_MIME
        pipe.signals.send("HELO", mime_type=ARROW_MIME)
        pipe.wait_for_ready(timeout=0.5)
        filter_arrow(pipe, column, op, value)
    else:
        pipe.signals.send("HELO", mime_type="application/json")
        pipe.wait_for_ready(timeout=0.5)
        filter_json(pipe, column, op, value)

if __name__ == "__main__":
    main()
