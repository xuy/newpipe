#!/usr/bin/env -S uv run

# /// script
# dependencies = [
#   "pyarrow",
# ]
# ///

"""Group by column and aggregate. Polymorphic Arrow/JSON.

Usage:
  pcat data.parquet | groupby city                        # count per group
  pcat data.parquet | groupby city age                    # count per city, avg age
  pcat data.parquet | groupby occupation | sort count desc | head 10

Aggregation: emits {<group_col>: value, "count": n} for each group.
If extra columns are given, computes their mean.
"""

import sys
import signal
from collections import defaultdict

signal.signal(signal.SIGPIPE, signal.SIG_DFL)

from newpipe import NewPipe

ARROW_MIME = "application/vnd.apache.arrow.stream"

def main():
    if len(sys.argv) < 2:
        print("Usage: groupby <column> [agg_col1 agg_col2 ...]", file=sys.stderr)
        sys.exit(1)

    group_col = sys.argv[1]
    agg_cols = sys.argv[2:]

    pipe = NewPipe(defer_helo=True)
    upstream = pipe.wait_for_upstream(timeout=2.0)

    if upstream == ARROW_MIME:
        import pyarrow as pa
        import pyarrow.compute as pc

        pipe.signals.send("HELO", mime_type="application/json")

        # Collect all batches, combine, group
        batches = []
        schema = None
        for batch in pipe.arrow_batches():
            if pipe.stopped: break
            batches.append(batch)
            schema = batch.schema

        pipe.wait_for_ready(timeout=0.5)

        if batches and schema and not pipe.stopped:
            table = pa.Table.from_batches(batches, schema=schema)
            if group_col not in table.schema.names:
                pipe.emit({"error": f"column '{group_col}' not found"})
                return

            group_values = table.column(group_col)
            unique_vals = pc.unique(group_values).to_pylist()

            for val in sorted(unique_vals, key=lambda x: (x is None, str(x))):
                if pipe.stopped: break
                if val is None:
                    mask = pc.is_null(group_values)
                else:
                    mask = pc.equal(group_values, val)
                group_table = table.filter(mask)
                result = {group_col: val, "count": group_table.num_rows}

                for ac in agg_cols:
                    if ac in table.schema.names:
                        try:
                            col = group_table.column(ac).cast(pa.float64())
                            result[f"mean_{ac}"] = round(pc.mean(col).as_py(), 2)
                        except:
                            pass
                pipe.emit(result)
    else:
        pipe.signals.send("HELO", mime_type="application/json")

        groups = defaultdict(lambda: {"count": 0, "agg_sums": defaultdict(float), "agg_counts": defaultdict(int)})
        for record in pipe.records():
            if pipe.stopped: break
            if isinstance(record, dict):
                val = record.get(group_col)
                g = groups[val]
                g["count"] += 1
                for ac in agg_cols:
                    if ac in record:
                        try:
                            g["agg_sums"][ac] += float(record[ac])
                            g["agg_counts"][ac] += 1
                        except (ValueError, TypeError):
                            pass

        pipe.wait_for_ready(timeout=0.5)
        for val in sorted(groups.keys(), key=lambda x: (x is None, str(x))):
            if pipe.stopped: break
            g = groups[val]
            result = {group_col: val, "count": g["count"]}
            for ac in agg_cols:
                if g["agg_counts"][ac] > 0:
                    result[f"mean_{ac}"] = round(g["agg_sums"][ac] / g["agg_counts"][ac], 2)
            pipe.emit(result)

if __name__ == "__main__":
    main()
