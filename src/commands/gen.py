#!/usr/bin/env -S uv run

import sys
import os
import time

# Add SDK path
sys.path.append(os.path.join(os.path.dirname(__file__), '../../sdk/python'))
from newpipe import NewPipe

def main():
    pipe = NewPipe(mime_type="application/x-python-demo")
    
    # Optional: wait for ACK from downstream
    pipe.wait_for_ready(timeout=0.5)

    for i in range(1, 11):
        if pipe.stopped: break
        
        record = {
            "index": i,
            "timestamp": time.time(),
            "source": "python-sdk",
            "message": f"Hello from Python record #{i}"
        }
        
        pipe.emit(record)
        
        # Tiny delay to allow for backpressure demonstration
        time.sleep(0.1)

if __name__ == "__main__":
    main()
