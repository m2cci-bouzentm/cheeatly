use std::{sync::mpsc, thread};

use tauri::{AppHandle, Emitter};
use tokio::sync::mpsc as tokio_mpsc;

use crate::state::MeetingState;

use super::{
    audio_capture::{MicrophoneCapture, SystemAudioCapture},
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
        input_device_id: Option<String>,
        output_device_id: Option<String>,
        config: TranscriptionConfig,
        meeting: std::sync::Arc<std::sync::Mutex<MeetingState>>,
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
    microphone: MicrophoneCapture,
    system_audio: SystemAudioCapture,
    microphone_provider: LocalCoreMlProvider,
    system_provider: LocalCoreMlProvider,
    microphone_audio: mpsc::Receiver<AudioChunk>,
    system_audio_chunks: mpsc::Receiver<AudioChunk>,
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
        input_device_id: Option<String>,
        output_device_id: Option<String>,
        config: TranscriptionConfig,
        meeting: std::sync::Arc<std::sync::Mutex<MeetingState>>,
    ) -> anyhow::Result<()> {
        let (response_tx, response_rx) = mpsc::channel();
        self.commands.send(SessionCommand::Start {
            app: Box::new(app.clone()),
            input_device_id,
            output_device_id,
            config,
            meeting,
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
            while let Ok(chunk) = session.microphone_audio.try_recv() {
                let _ = session.microphone_provider.send_audio(chunk);
            }
            while let Ok(chunk) = session.system_audio_chunks.try_recv() {
                let _ = session.system_provider.send_audio(chunk);
            }
        }
        let Ok(command) = receiver.recv_timeout(std::time::Duration::from_millis(5)) else {
            continue;
        };
        match command {
            SessionCommand::Start {
                app,
                input_device_id,
                output_device_id,
                config,
                meeting,
                response,
            } => {
                let result = start(
                    &app,
                    input_device_id,
                    output_device_id,
                    config,
                    meeting,
                    &mut running,
                );
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
    input_device_id: Option<String>,
    output_device_id: Option<String>,
    config: TranscriptionConfig,
    meeting: std::sync::Arc<std::sync::Mutex<MeetingState>>,
    running: &mut Option<RunningSession>,
) -> anyhow::Result<()> {
    if running.is_some() {
        return Err(anyhow::anyhow!("transcription session already active"));
    }
    let (microphone_tx, microphone_rx) = mpsc::channel::<AudioChunk>();
    let (system_tx, system_rx) = mpsc::channel::<AudioChunk>();
    let (event_tx, mut event_rx) = tokio_mpsc::unbounded_channel::<TranscriptEvent>();
    let mut microphone_provider = LocalCoreMlProvider::bundled(app)?;
    let mut microphone_config = config.clone();
    microphone_config.source = super::provider::AudioSource::Microphone;
    microphone_provider.start(microphone_config, event_tx.clone())?;
    let mut system_provider = LocalCoreMlProvider::bundled(app)?;
    let mut system_config = config;
    system_config.source = super::provider::AudioSource::System;
    system_provider.start(system_config, event_tx)?;
    let event_app = app.clone();
    tauri::async_runtime::spawn(async move {
        while let Some(event) = event_rx.recv().await {
            if event.final_result {
                if let Ok(mut meeting) = meeting.lock() {
                    meeting.transcript.push(crate::state::TranscriptTurn {
                        speaker: if event.speaker == "user" {
                            "Me".into()
                        } else {
                            "Them".into()
                        },
                        text: event.text.clone(),
                    });
                }
            }
            let _ = event_app.emit("native-audio-transcript", event);
        }
    });
    let microphone = MicrophoneCapture::start(input_device_id, microphone_tx)?;
    let system_audio = SystemAudioCapture::start(output_device_id, system_tx)?;
    *running = Some(RunningSession {
        microphone,
        system_audio,
        microphone_provider,
        system_provider,
        microphone_audio: microphone_rx,
        system_audio_chunks: system_rx,
    });
    Ok(())
}

fn stop(running: &mut Option<RunningSession>) -> anyhow::Result<()> {
    if let Some(mut session) = running.take() {
        session.microphone.stop()?;
        session.system_audio.stop();
        session.microphone_provider.stop()?;
        session.system_provider.stop()?;
    }
    Ok(())
}
