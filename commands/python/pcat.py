#!/usr/bin/env -S uv run

# /// script
# dependencies = [
#   "pandas",
#   "pyarrow",
# ]
# ///

import sys
import json

# SDK setup
from newpipe import NewPipe

def main():
    if len(sys.argv) < 2:
        print("Usage: pcat <file.parquet>", file=sys.stderr)
        sys.exit(1)

    file_path = sys.argv[1]
    
    # We use a deferred import for pandas/pyarrow to allow the NewPipe HELO to go out first
    # and so we can fail gracefully if deps are missing
    pipe = NewPipe(mime_type="application/x-parquet")
    pipe.wait_for_ready(timeout=0.5)

    try:
        import pandas as pd
        df = pd.read_parquet(file_path)
        
        # Convert to records
        records = df.to_dict('records')
        
        for record in records:
            if pipe.stopped: break
            pipe.emit(record)
            
    except ImportError:
        pipe.signals.send("ERROR", payload="Missing pandas or pyarrow. Please install them or run with 'uv run --with pandas --with pyarrow'")
        sys.exit(1)
    except Exception as e:
        pipe.signals.send("ERROR", payload=str(e))
        sys.exit(1)

if __name__ == "__main__":
    main()
