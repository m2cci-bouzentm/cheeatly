use std::{
    sync::{
        Arc,
        atomic::{AtomicBool, Ordering},
        mpsc,
    },
    thread,
};

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
    muted: Arc<[AtomicBool; 2]>,
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
    events: Option<thread::JoinHandle<()>>,
    app: AppHandle,
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
        let muted = Arc::new([AtomicBool::new(false), AtomicBool::new(false)]);
        let worker_muted = muted.clone();
        thread::spawn(move || run(receiver, worker_muted));
        Self { commands, muted }
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

    pub fn set_muted(&self, channel: &str, muted: bool) -> anyhow::Result<()> {
        let index = match channel {
            "mic" => 0,
            "system" => 1,
            _ => anyhow::bail!("Unknown audio channel"),
        };
        self.muted[index].store(muted, Ordering::Release);
        Ok(())
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

fn run(receiver: mpsc::Receiver<SessionCommand>, muted: Arc<[AtomicBool; 2]>) {
    let mut running: Option<RunningSession> = None;
    loop {
        if let Some(session) = running.as_mut() {
            while let Ok(mut chunk) = session.microphone_audio.try_recv() {
                if muted[0].load(Ordering::Acquire) {
                    chunk.pcm16.fill(0);
                }
                let _ = session.microphone_provider.send_audio(chunk);
            }
            while let Ok(mut chunk) = session.system_audio_chunks.try_recv() {
                if muted[1].load(Ordering::Acquire) {
                    chunk.pcm16.fill(0);
                }
                let _ = session.system_provider.send_audio(chunk);
            }
        }
        let command = match receiver.recv_timeout(std::time::Duration::from_millis(5)) {
            Ok(command) => command,
            Err(mpsc::RecvTimeoutError::Timeout) => continue,
            Err(mpsc::RecvTimeoutError::Disconnected) => {
                let _ = stop(&mut running, &muted);
                break;
            }
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
                    &muted,
                );
                let _ = response.send(result);
            }
            SessionCommand::Stop { response } => {
                let _ = response.send(stop(&mut running, &muted));
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
    muted: &Arc<[AtomicBool; 2]>,
) -> anyhow::Result<()> {
    if running.is_some() {
        return Err(anyhow::anyhow!("transcription session already active"));
    }
    let (microphone_tx, microphone_rx) = mpsc::sync_channel::<AudioChunk>(20);
    let (system_tx, system_rx) = mpsc::sync_channel::<AudioChunk>(20);
    let (event_tx, mut event_rx) = tokio_mpsc::unbounded_channel::<TranscriptEvent>();
    log::info!("Starting microphone Core ML provider");
    let mut microphone_provider = LocalCoreMlProvider::bundled(app)?;
    let mut microphone_config = config.clone();
    microphone_config.source = super::provider::AudioSource::Microphone;
    microphone_provider.start(microphone_config, event_tx.clone())?;
    log::info!("Starting system Core ML provider");
    let mut system_provider = LocalCoreMlProvider::bundled(app)?;
    let mut system_config = config;
    system_config.source = super::provider::AudioSource::System;
    system_provider.start(system_config, event_tx)?;
    let event_app = app.clone();
    let events = thread::spawn(move || {
        while let Some(event) = event_rx.blocking_recv() {
            if event.final_result
                && let Ok(mut meeting) = meeting.lock()
            {
                let speaker = if event.speaker == "user" {
                    "Me"
                } else {
                    "Them"
                };
                if let Some(last) = meeting
                    .transcript
                    .last_mut()
                    .filter(|last| last.speaker == speaker)
                {
                    if last.text != event.text {
                        last.text.push(' ');
                        last.text.push_str(&event.text);
                    }
                } else {
                    meeting.transcript.push(crate::state::TranscriptTurn {
                        speaker: speaker.into(),
                        text: event.text.clone(),
                    });
                }
            }
            let _ = event_app.emit("native-audio-transcript", event);
        }
    });
    log::info!("Starting Rust microphone capture");
    let microphone = MicrophoneCapture::start(input_device_id, microphone_tx, muted.clone())?;
    log::info!("Starting Rust system audio capture");
    let system_audio = SystemAudioCapture::start(output_device_id, system_tx, muted.clone())?;
    *running = Some(RunningSession {
        events: Some(events),
        app: app.clone(),
        microphone,
        system_audio,
        microphone_provider,
        system_provider,
        microphone_audio: microphone_rx,
        system_audio_chunks: system_rx,
    });
    for channel in ["mic", "system"] {
        let _ = app.emit(
            "audio-capture-active",
            serde_json::json!({"channel":channel,"active":true}),
        );
    }
    Ok(())
}

fn stop(running: &mut Option<RunningSession>, muted: &[AtomicBool; 2]) -> anyhow::Result<()> {
    if let Some(mut session) = running.take() {
        let microphone_result = session.microphone.stop();
        session.system_audio.stop();
        while let Ok(mut chunk) = session.system_audio_chunks.try_recv() {
            if muted[1].load(Ordering::Acquire) {
                chunk.pcm16.fill(0);
            }
            if let Err(error) = session.system_provider.send_audio(chunk) {
                log::warn!("System audio drain: {error}");
                break;
            }
        }
        while let Ok(mut chunk) = session.microphone_audio.try_recv() {
            if muted[0].load(Ordering::Acquire) {
                chunk.pcm16.fill(0);
            }
            if let Err(error) = session.microphone_provider.send_audio(chunk) {
                log::warn!("Microphone drain: {error}");
                break;
            }
        }
        // Stop both providers and join event delivery before persistence reads the transcript.
        let system_result = session.system_provider.stop();
        let provider_result = session.microphone_provider.stop();
        if let Some(events) = session.events.take() {
            let _ = events.join();
        }
        for channel in ["mic", "system"] {
            let _ = session.app.emit(
                "audio-capture-active",
                serde_json::json!({"channel":channel,"active":false}),
            );
        }
        microphone_result?;
        system_result?;
        provider_result?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::TranscriptionSession;

    #[test]
    fn stop_is_awaitable_and_idempotent_without_active_session() {
        let session = TranscriptionSession::new();
        session.stop().unwrap();
        session.stop().unwrap();
        assert!(!session.active());
        assert!(session.set_muted("invalid", true).is_err());
        session.set_muted("mic", true).unwrap();
        assert!(session.muted[0].load(std::sync::atomic::Ordering::Acquire));
    }
}
