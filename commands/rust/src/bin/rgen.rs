use newpipe::NewPipe;
use serde::Serialize;
use std::thread;
use std::time::Duration;

#[derive(Serialize)]
struct DemoRecord {
    index: u32,
    message: String,
    source: String,
}

fn main() {
    let mut pipe = NewPipe::new("application/x-rust-demo");
    pipe.wait_for_ready();

    for i in 1..=5 {
        let record = DemoRecord {
            index: i,
            message: format!("Hello from Rust record #{}", i),
            source: "rust-sdk".to_string(),
        };
        
        pipe.emit(record).expect("Failed to emit record");
        
        // Small delay
        thread::sleep(Duration::from_millis(200));
    }
}
