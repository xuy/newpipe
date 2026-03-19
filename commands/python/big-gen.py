#!/usr/bin/env -S uv run

import sys
import time
import signal

signal.signal(signal.SIGPIPE, signal.SIG_DFL)

# SDK setup
from newpipe import NewPipe

def main():
    pipe = NewPipe(mime_type="application/octet-stream")
    pipe.wait_for_ready(timeout=0.5)

    # 100MB of synthetic data
    size_mb = 100
    print(f"Generating {size_mb}MB record...", file=sys.stderr)
    data = b"x" * (size_mb * 1024 * 1024)
    
    start = time.time()
    pipe.emit(data)
    end = time.time()
    
    print(f"Emitted {size_mb}MB in {end - start:.2f}s", file=sys.stderr)

if __name__ == "__main__":
    main()
