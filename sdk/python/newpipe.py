import os
import sys
import json
import struct
import threading
import time

class SignalPlane:
    def __init__(self, fd=3):
        self.fd = fd
        self.listeners = []
        try:
            self.read_pipe = os.fdopen(fd, 'r')
            self.write_pipe = os.fdopen(fd, 'w')
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
    def __init__(self, mime_type="application/json"):
        self.signals = SignalPlane()
        self.mime_type = mime_type
        self.paused = False
        self.stopped = False
        self._ready = threading.Event()

        self.signals.on_signal(self._handle_signal)
        
        # Initial Handshake
        self.signals.send("HELO", mime_type=self.mime_type)

    def _handle_signal(self, msg):
        t = msg.get("type")
        if t == "ACK":
            self._ready.set()
        elif t == "PAUSE":
            self.paused = True
        elif t == "RESUME":
            self.paused = False
        elif t == "STOP":
            self.stopped = True

    def wait_for_ready(self, timeout=1.0):
        return self._ready.wait(timeout)

    def emit(self, data):
        if self.stopped: return
        
        # Handle Backpressure
        while self.paused and not self.stopped:
            time.sleep(0.05)

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
