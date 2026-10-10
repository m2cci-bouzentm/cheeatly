use std::{
    sync::{
        Arc,
        atomic::{AtomicBool, Ordering},
        mpsc,
    },
    thread,
};

use crate::events::{Event, EventSink};
use std::path::PathBuf;
use tokio::sync::mpsc as tokio_mpsc;

pub type TranscriptHandler = Arc<dyn Fn(TranscriptEvent) + Send + Sync>;

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
        binary: PathBuf,
        notifications: EventSink,
        input_device_id: Option<String>,
        output_device_id: Option<String>,
        config: TranscriptionConfig,
        transcript: TranscriptHandler,
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
    notifications: EventSink,
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
        binary: PathBuf,
        notifications: EventSink,
        input_device_id: Option<String>,
        output_device_id: Option<String>,
        config: TranscriptionConfig,
        transcript: TranscriptHandler,
    ) -> anyhow::Result<()> {
        let (response_tx, response_rx) = mpsc::channel();
        self.commands.send(SessionCommand::Start {
            binary,
            notifications,
            input_device_id,
            output_device_id,
            config,
            transcript,
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
                binary,
                notifications,
                input_device_id,
                output_device_id,
                config,
                transcript,
                response,
            } => {
                let result = start(
                    binary,
                    notifications,
                    (input_device_id, output_device_id),
                    config,
                    transcript,
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
    binary: PathBuf,
    notifications: EventSink,
    (input_device_id, output_device_id): (Option<String>, Option<String>),
    config: TranscriptionConfig,
    transcript: TranscriptHandler,
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
    let mut microphone_provider = LocalCoreMlProvider::new(binary.clone(), notifications.clone());
    let mut microphone_config = config.clone();
    microphone_config.source = super::provider::AudioSource::Microphone;
    microphone_provider.start(microphone_config, event_tx.clone())?;
    log::info!("Starting system Core ML provider");
    let mut system_provider = LocalCoreMlProvider::new(binary.clone(), notifications.clone());
    let mut system_config = config;
    system_config.source = super::provider::AudioSource::System;
    system_provider.start(system_config, event_tx)?;
    let events = thread::spawn(move || {
        while let Some(event) = event_rx.blocking_recv() {
            transcript(event);
        }
    });
    log::info!("Starting Rust microphone capture");
    let microphone = MicrophoneCapture::start(input_device_id, microphone_tx, muted.clone())?;
    log::info!("Starting Rust system audio capture");
    let system_audio = SystemAudioCapture::start(output_device_id, system_tx, muted.clone())?;
    *running = Some(RunningSession {
        events: Some(events),
        notifications: notifications.clone(),
        microphone,
        system_audio,
        microphone_provider,
        system_provider,
        microphone_audio: microphone_rx,
        system_audio_chunks: system_rx,
    });
    for channel in ["mic", "system"] {
        notifications.send(Event::CaptureActive {
            channel,
            active: true,
        });
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
            session.notifications.send(Event::CaptureActive {
                channel,
                active: false,
            });
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
