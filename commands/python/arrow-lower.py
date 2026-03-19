#!/usr/bin/env -S uv run

# /// script
# dependencies = [
#   "pyarrow",
# ]
# ///

import sys
import struct
import signal

# Gracefully handle EPIPE (downstream closed)
signal.signal(signal.SIGPIPE, signal.SIG_DFL)

# SDK setup
from newpipe import NewPipe

def main():
    pipe = NewPipe(mime_type="application/json")
    pipe.wait_for_ready(timeout=0.5)

    try:
        import pyarrow as pa

        # Read framed Arrow IPC batches from stdin
        while not pipe.stopped:
            header = sys.stdin.buffer.read(4)
            if not header or len(header) < 4:
                break
            length = struct.unpack('>I', header)[0]
            payload = sys.stdin.buffer.read(length)
            if len(payload) < length:
                break

            # Deserialize Arrow IPC stream → RecordBatch(es)
            reader = pa.ipc.open_stream(payload)
            for batch in reader:
                if pipe.stopped: break
                # Convert each row to a JSON record frame
                for row in batch.to_pylist():
                    if pipe.stopped: break
                    pipe.emit(row)

    except ImportError:
        pipe.signals.send("ERROR", payload="Missing pyarrow")
        sys.exit(1)
    except Exception as e:
        pipe.signals.send("ERROR", payload=str(e))
        sys.exit(1)

if __name__ == "__main__":
    main()
