use std::io::{self, Write, BufRead, BufReader};
use std::os::unix::io::FromRawFd;
use std::fs::File;
use libc;
use serde::{Serialize, Deserialize};
use byteorder::{BigEndian, WriteBytesExt};
use std::sync::{Arc, Mutex, Condvar};
use std::thread;

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct SignalMessage {
    #[serde(rename = "type")]
    pub signal_type: String,
    #[serde(rename = "mimeType", skip_serializing_if = "Option::is_none")]
    pub mime_type: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub payload: Option<serde_json::Value>,
}

type SignalListener = Box<dyn Fn(SignalMessage) + Send + Sync>;

pub struct SignalPlane {
    write_socket: File,
    listeners: Arc<Mutex<Vec<SignalListener>>>,
}

impl SignalPlane {
    pub fn new(fd: i32) -> Self {
        // FD must be a bidirectional channel (socketpair from the shell).
        // dup() so read and write have independent file descriptors —
        // closing one won't invalidate the other.
        let read_fd = unsafe { libc::dup(fd) };
        assert!(read_fd >= 0, "Failed to dup signal FD");
        let read_socket = unsafe { File::from_raw_fd(read_fd) };
        let write_socket = unsafe { File::from_raw_fd(fd) };
        let listeners: Arc<Mutex<Vec<SignalListener>>> = Arc::new(Mutex::new(Vec::new()));
        
        let listeners_clone = Arc::clone(&listeners);
        thread::spawn(move || {
            let reader = BufReader::new(read_socket);
            for line in reader.lines() {
                if let Ok(l) = line {
                    if let Ok(sig) = serde_json::from_str::<SignalMessage>(&l) {
                        let guards = listeners_clone.lock().unwrap();
                        for listener in guards.iter() {
                            listener(sig.clone());
                        }
                    }
                }
            }
        });

        Self {
            write_socket,
            listeners,
        }
    }

    pub fn on_signal<F>(&self, callback: F) 
    where F: Fn(SignalMessage) + Send + Sync + 'static 
    {
        self.listeners.lock().unwrap().push(Box::new(callback));
    }

    pub fn send(&mut self, msg: SignalMessage) -> io::Result<()> {
        let json = serde_json::to_string(&msg)?;
        writeln!(self.write_socket, "{}", json)?;
        self.write_socket.flush()?;
        Ok(())
    }
}

pub struct NewPipe {
    pub signals: Option<SignalPlane>,
    ready: Arc<(Mutex<bool>, Condvar)>,
    flow: Arc<(Mutex<bool>, Condvar)>,  // (paused, condvar) — wait instead of poll
    stopped: Arc<Mutex<bool>>,
    is_smart: bool,
}

impl NewPipe {
    pub fn new(mime_type: &str) -> Self {
        let ready = Arc::new((Mutex::new(false), Condvar::new()));
        let flow = Arc::new((Mutex::new(false), Condvar::new())); // (paused, cvar)
        let stopped = Arc::new(Mutex::new(false));

        // Explicitly check for the signal FD via environment variable
        let signals = if let Ok(fd_str) = std::env::var("NEWPIPE_SIGNAL_FD") {
            if let Ok(fd) = fd_str.parse::<i32>() {
                Some(SignalPlane::new(fd))
            } else { None }
        } else { None };

        if let Some(ref sigs) = signals {
            let ready_clone = Arc::clone(&ready);
            let flow_clone = Arc::clone(&flow);
            let stopped_clone = Arc::clone(&stopped);

            sigs.on_signal(move |sig| {
                match sig.signal_type.as_str() {
                    "ACK" => {
                        let (lock, cvar) = &*ready_clone;
                        let mut ready = lock.lock().unwrap();
                        *ready = true;
                        cvar.notify_all();
                    }
                    "PAUSE" => {
                        let (lock, _) = &*flow_clone;
                        *lock.lock().unwrap() = true;
                    }
                    "RESUME" => {
                        let (lock, cvar) = &*flow_clone;
                        *lock.lock().unwrap() = false;
                        cvar.notify_all(); // Wake blocked emitters immediately
                    }
                    "STOP" => {
                        *stopped_clone.lock().unwrap() = true;
                        // Also unblock flow so emitters can exit
                        let (lock, cvar) = &*flow_clone;
                        *lock.lock().unwrap() = false;
                        cvar.notify_all();
                    }
                    _ => {}
                }
            });
        }

        let mut np = Self {
            signals,
            ready,
            flow,
            stopped,
            is_smart: false,
        };

        if let Some(ref mut sigs) = np.signals {
            sigs.send(SignalMessage {
                signal_type: "HELO".to_string(),
                mime_type: Some(mime_type.to_string()),
                payload: None,
            }).ok();
            
            // Wait for ACK (Wait indefinitely because we KNOW we are in a smart env)
            let (lock, cvar) = &*np.ready;
            let mut ready = lock.lock().unwrap();
            while !*ready {
                ready = cvar.wait(ready).unwrap();
            }
            np.is_smart = true;
        }

        np
    }

    pub fn wait_for_ready(&self) {
        if !self.is_smart && self.signals.is_none() {
            return;
        }
        let (lock, cvar) = &*self.ready;
        let mut ready = lock.lock().unwrap();
        while !*ready {
            // We wait with a timeout just in case
            let result = cvar.wait_timeout(ready, std::time::Duration::from_millis(200)).unwrap();
            if result.1.timed_out() {
                break;
            }
            ready = result.0;
        }
    }

    pub fn emit<T: Serialize>(&mut self, data: T) -> io::Result<()> {
        if *self.stopped.lock().unwrap() { return Ok(()); }

        // Block until not paused — no polling, wakes immediately on RESUME/STOP
        {
            let (lock, cvar) = &*self.flow;
            let mut paused = lock.lock().unwrap();
            while *paused && !*self.stopped.lock().unwrap() {
                paused = cvar.wait(paused).unwrap();
            }
        }

        if self.is_smart {
            let payload = serde_json::to_vec(&data)?;
            let mut stdout = io::stdout();
            stdout.write_u32::<BigEndian>(payload.len() as u32)?;
            stdout.write_all(&payload)?;
            stdout.flush()?;
        } else {
            // Standard Unix Fallback: Newline-delimited JSON
            let json = serde_json::to_string(&data)?;
            println!("{}", json);
        }
        Ok(())
    }
}
