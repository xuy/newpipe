import os
import sys
import json
import struct
import threading
import time

class SignalPlane:
    def __init__(self, fd=None):
        # Respect NEWPIPE_SIGNAL_FD env var, default to 3
        self.fd = fd if fd is not None else int(os.environ.get('NEWPIPE_SIGNAL_FD', '3'))
        self.listeners = []
        try:
            # FD 3 must be a bidirectional channel (socketpair).
            # The shell creates this as a socketpair, so a single FD supports
            # both reading and writing. We dup() to get separate file objects
            # so closing one doesn't invalidate the other.
            read_fd = os.dup(self.fd)
            self.read_pipe = os.fdopen(read_fd, 'r')
            self.write_pipe = os.fdopen(self.fd, 'w')
            self.thread = threading.Thread(target=self._listen, daemon=True)
            self.thread.start()
        except Exception as e:
            # Fallback for local testing where FD 3 might not exist
            self.read_pipe = None
            self.write_pipe = None

    def _listen(self):
        if not self.read_pipe: return
        for line in self.read_pipe:
            try:
                signal = json.loads(line)
                for listener in self.listeners:
                    listener(signal)
            except:
                pass

    def on_signal(self, callback):
        self.listeners.append(callback)

    def send(self, signal_type, mime_type=None, payload=None):
        if not self.write_pipe: return
        msg = {"type": signal_type}
        if mime_type: msg["mimeType"] = mime_type
        if payload: msg["payload"] = payload
        self.write_pipe.write(json.dumps(msg) + "\n")
        self.write_pipe.flush()

class NewPipe:
    def __init__(self, mime_type="application/json", defer_helo=False):
        self.signals = SignalPlane()
        self.mime_type = mime_type
        self.upstream_mime = None  # Set when we receive an upstream HELO
        self.stopped = False
        self._ready = threading.Event()
        self._flow = threading.Event()
        self._flow.set()  # Start unpaused (event is "set" = flowing)
        self._upstream_helo = threading.Event()

        self.signals.on_signal(self._handle_signal)

        # Initial Handshake — skip if caller will decide MIME type later
        if not defer_helo:
            self.signals.send("HELO", mime_type=self.mime_type)

    def _handle_signal(self, msg):
        t = msg.get("type")
        if t == "ACK":
            self._ready.set()
        elif t == "HELO":
            self.upstream_mime = msg.get("mimeType")
            self._upstream_helo.set()
            # ACK back to upstream
            self.signals.send("ACK")
        elif t == "PAUSE":
            self._flow.clear()  # Block emitters until RESUME
        elif t == "RESUME":
            self._flow.set()    # Unblock emitters immediately
        elif t == "STOP":
            self.stopped = True
            self._flow.set()    # Unblock so emitters can exit

    def wait_for_upstream(self, timeout=1.0):
        """Wait for the upstream HELO and return its MIME type."""
        self._upstream_helo.wait(timeout)
        return self.upstream_mime

    @property
    def paused(self):
        return not self._flow.is_set()

    def wait_for_ready(self, timeout=1.0):
        return self._ready.wait(timeout)

    def emit(self, data):
        if self.stopped: return

        # Handle Backpressure — blocks until RESUME, no polling
        self._flow.wait()

        if isinstance(data, (dict, list)):
            payload = json.dumps(data).encode('utf-8')
        elif isinstance(data, str):
            payload = data.encode('utf-8')
        else:
            payload = bytes(data)

        # 4-byte framing: Write header then payload to avoid duplication in memory
        header = struct.pack('>I', len(payload))
        sys.stdout.buffer.write(header)
        sys.stdout.buffer.write(payload)
        sys.stdout.buffer.flush()

    def emit_raw(self, payload: bytes):
        """Emit raw bytes as a frame — no JSON serialization.
        Use for binary payloads like Arrow IPC batches."""
        if self.stopped: return
        self._flow.wait()
        header = struct.pack('>I', len(payload))
        sys.stdout.buffer.write(header)
        sys.stdout.buffer.write(payload)
        sys.stdout.buffer.flush()

    def records(self):
        """Generator for incoming records from stdin"""
        while not self.stopped:
            header = sys.stdin.buffer.read(4)
            if not header: break
            length = struct.unpack('>I', header)[0]
            payload = sys.stdin.buffer.read(length)
            
            try:
                yield json.loads(payload.decode('utf-8'))
            except:
                yield payload
