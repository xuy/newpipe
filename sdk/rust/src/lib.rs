use std::io::{self, Write, BufRead, BufReader};
use std::os::unix::io::FromRawFd;
use std::fs::File;
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
        let read_socket = unsafe { File::from_raw_fd(fd) };
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
    pub signals: SignalPlane,
    ready: Arc<(Mutex<bool>, Condvar)>,
    paused: Arc<Mutex<bool>>,
    stopped: Arc<Mutex<bool>>,
}

impl NewPipe {
    pub fn new(mime_type: &str) -> Self {
        let signals = SignalPlane::new(3);
        let ready = Arc::new((Mutex::new(false), Condvar::new()));
        let paused = Arc::new(Mutex::new(false));
        let stopped = Arc::new(Mutex::new(false));

        let ready_clone = Arc::clone(&ready);
        let paused_clone = Arc::clone(&paused);
        let stopped_clone = Arc::clone(&stopped);

        signals.on_signal(move |sig| {
            match sig.signal_type.as_str() {
                "ACK" => {
                    let (lock, cvar) = &*ready_clone;
                    let mut ready = lock.lock().unwrap();
                    *ready = true;
                    cvar.notify_all();
                }
                "PAUSE" => {
                    *paused_clone.lock().unwrap() = true;
                }
                "RESUME" => {
                    *paused_clone.lock().unwrap() = false;
                }
                "STOP" => {
                    *stopped_clone.lock().unwrap() = true;
                }
                _ => {}
            }
        });

        let mut np = Self {
            signals,
            ready,
            paused,
            stopped,
        };

        np.signals.send(SignalMessage {
            signal_type: "HELO".to_string(),
            mime_type: Some(mime_type.to_string()),
            payload: None,
        }).ok();

        np
    }

    pub fn wait_for_ready(&self) {
        let (lock, cvar) = &*self.ready;
        let mut ready = lock.lock().unwrap();
        while !*ready {
            ready = cvar.wait(ready).unwrap();
        }
    }

    pub fn emit<T: Serialize>(&mut self, data: T) -> io::Result<()> {
        if *self.stopped.lock().unwrap() {
            return Ok(());
        }

        while *self.paused.lock().unwrap() && !*self.stopped.lock().unwrap() {
            thread::sleep(std::time::Duration::from_millis(50));
        }

        let payload = serde_json::to_vec(&data)?;
        let mut stdout = io::stdout();
        stdout.write_u32::<BigEndian>(payload.len() as u32)?;
        stdout.write_all(&payload)?;
        stdout.flush()?;
        Ok(())
    }
}
