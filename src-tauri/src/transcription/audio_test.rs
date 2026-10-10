use std::{
    sync::{
        Arc,
        atomic::{AtomicBool, Ordering},
        mpsc,
    },
    thread,
    time::Duration,
};

use cheatly_audio::microphone::MicrophoneStream;
use ringbuf::traits::Consumer;
use tauri::{AppHandle, Emitter};

#[derive(Clone)]
pub struct AudioTestSession {
    commands: mpsc::Sender<Command>,
}

enum Command {
    Start {
        app: Box<AppHandle>,
        device_id: Option<String>,
        response: mpsc::Sender<anyhow::Result<()>>,
    },
    Stop {
        response: mpsc::Sender<anyhow::Result<()>>,
    },
}

struct Running {
    stream: MicrophoneStream,
    running: Arc<AtomicBool>,
    worker: Option<thread::JoinHandle<()>>,
}

impl AudioTestSession {
    pub fn new() -> Self {
        let (commands, receiver) = mpsc::channel();
        thread::spawn(move || run(receiver));
        Self { commands }
    }
    pub fn start(&self, app: &AppHandle, device_id: Option<String>) -> anyhow::Result<()> {
        let (tx, rx) = mpsc::channel();
        self.commands.send(Command::Start {
            app: Box::new(app.clone()),
            device_id,
            response: tx,
        })?;
        rx.recv()?
    }
    pub fn stop(&self) -> anyhow::Result<()> {
        let (tx, rx) = mpsc::channel();
        self.commands.send(Command::Stop { response: tx })?;
        rx.recv()?
    }
}

impl Default for AudioTestSession {
    fn default() -> Self {
        Self::new()
    }
}

fn run(receiver: mpsc::Receiver<Command>) {
    let mut running: Option<Running> = None;
    while let Ok(command) = receiver.recv() {
        match command {
            Command::Start {
                app,
                device_id,
                response,
            } => {
                let _ = response.send(start(&app, device_id, &mut running));
            }
            Command::Stop { response } => {
                let _ = response.send(stop(&mut running));
            }
        }
    }
    let _ = stop(&mut running);
}

fn start(
    app: &AppHandle,
    device_id: Option<String>,
    running: &mut Option<Running>,
) -> anyhow::Result<()> {
    stop(running)?;
    let mut stream = MicrophoneStream::new(device_id)?;
    let mut consumer = stream
        .take_consumer()
        .ok_or_else(|| anyhow::anyhow!("audio test consumer unavailable"))?;
    let active = Arc::new(AtomicBool::new(true));
    let worker_active = active.clone();
    let event_app = app.clone();
    stream.play()?;
    let worker = thread::spawn(move || {
        let mut samples = Vec::with_capacity(1600);
        while worker_active.load(Ordering::Acquire) {
            while let Some(sample) = consumer.try_pop() {
                samples.push(sample);
                if samples.len() >= 1600 {
                    let rms = (samples.iter().map(|value| value * value).sum::<f32>()
                        / samples.len() as f32)
                        .sqrt();
                    let _ = event_app.emit("audio-test-level", rms.min(1.0));
                    samples.clear();
                }
            }
            thread::sleep(Duration::from_millis(5));
        }
    });
    *running = Some(Running {
        stream,
        running: active,
        worker: Some(worker),
    });
    Ok(())
}

fn stop(running: &mut Option<Running>) -> anyhow::Result<()> {
    if let Some(mut test) = running.take() {
        test.running.store(false, Ordering::Release);
        test.stream.pause()?;
        if let Some(worker) = test.worker.take() {
            let _ = worker.join();
        }
    }
    Ok(())
}
