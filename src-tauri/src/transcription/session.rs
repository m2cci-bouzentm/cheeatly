use std::{sync::mpsc, thread};

use tauri::{AppHandle, Emitter};
use tokio::sync::mpsc as tokio_mpsc;

use super::{
    audio_capture::MicrophoneCapture,
    local_coreml::LocalCoreMlProvider,
    provider::{AudioChunk, TranscriptEvent, TranscriptionConfig, TranscriptionProvider},
};

#[derive(Clone)]
pub struct TranscriptionSession {
    commands: mpsc::Sender<SessionCommand>,
}

enum SessionCommand {
    Start {
        app: Box<AppHandle>,
        device_id: Option<String>,
        config: TranscriptionConfig,
        response: mpsc::Sender<anyhow::Result<()>>,
    },
    Stop {
        response: mpsc::Sender<anyhow::Result<()>>,
    },
    Active {
        response: mpsc::Sender<bool>,
    },
}

struct RunningSession {
    capture: MicrophoneCapture,
    provider: LocalCoreMlProvider,
    audio: mpsc::Receiver<AudioChunk>,
}

impl TranscriptionSession {
    pub fn new() -> Self {
        let (commands, receiver) = mpsc::channel();
        thread::spawn(move || run(receiver));
        Self { commands }
    }

    pub fn start_local(
        &self,
        app: &AppHandle,
        device_id: Option<String>,
        config: TranscriptionConfig,
    ) -> anyhow::Result<()> {
        let (response_tx, response_rx) = mpsc::channel();
        self.commands.send(SessionCommand::Start {
            app: Box::new(app.clone()),
            device_id,
            config,
            response: response_tx,
        })?;
        response_rx.recv()?
    }

    pub fn stop(&self) -> anyhow::Result<()> {
        let (response_tx, response_rx) = mpsc::channel();
        self.commands.send(SessionCommand::Stop {
            response: response_tx,
        })?;
        response_rx.recv()?
    }

    pub fn active(&self) -> bool {
        let (response_tx, response_rx) = mpsc::channel();
        self.commands
            .send(SessionCommand::Active {
                response: response_tx,
            })
            .is_ok()
            && response_rx.recv().unwrap_or(false)
    }
}

impl Default for TranscriptionSession {
    fn default() -> Self {
        Self::new()
    }
}

fn run(receiver: mpsc::Receiver<SessionCommand>) {
    let mut running: Option<RunningSession> = None;
    loop {
        if let Some(session) = running.as_mut() {
            while let Ok(chunk) = session.audio.try_recv() {
                let _ = session.provider.send_audio(chunk);
            }
        }
        let Ok(command) = receiver.recv_timeout(std::time::Duration::from_millis(5)) else {
            continue;
        };
        match command {
            SessionCommand::Start {
                app,
                device_id,
                config,
                response,
            } => {
                let result = start(&app, device_id, config, &mut running);
                let _ = response.send(result);
            }
            SessionCommand::Stop { response } => {
                let _ = response.send(stop(&mut running));
            }
            SessionCommand::Active { response } => {
                let _ = response.send(running.is_some());
            }
        }
    }
}

fn start(
    app: &AppHandle,
    device_id: Option<String>,
    config: TranscriptionConfig,
    running: &mut Option<RunningSession>,
) -> anyhow::Result<()> {
    if running.is_some() {
        return Err(anyhow::anyhow!("transcription session already active"));
    }
    let (audio_tx, audio_rx) = mpsc::channel::<AudioChunk>();
    let (event_tx, mut event_rx) = tokio_mpsc::unbounded_channel::<TranscriptEvent>();
    let mut provider = LocalCoreMlProvider::bundled(app)?;
    provider.start(config, event_tx)?;
    let event_app = app.clone();
    tauri::async_runtime::spawn(async move {
        while let Some(event) = event_rx.recv().await {
            let _ = event_app.emit("native-audio-transcript", event);
        }
    });
    let capture = MicrophoneCapture::start(device_id, audio_tx)?;
    *running = Some(RunningSession {
        capture,
        provider,
        audio: audio_rx,
    });
    Ok(())
}

fn stop(running: &mut Option<RunningSession>) -> anyhow::Result<()> {
    if let Some(mut session) = running.take() {
        session.capture.stop()?;
        session.provider.stop()?;
    }
    Ok(())
}
