use std::{
    io::{BufRead, BufReader, Write},
    process::{Child, ChildStdin, Command, Stdio},
    thread,
};

use crate::events::{Event, EventSink};
use base64::{Engine, engine::general_purpose::STANDARD};
use serde_json::json;
use tokio::sync::mpsc;

use super::provider::{
    AudioChunk, AudioSource, TranscriptEvent, TranscriptionConfig, TranscriptionProvider,
};

pub struct LocalCoreMlProvider {
    binary: std::path::PathBuf,
    events: EventSink,
    child: Option<Child>,
    stdin: Option<ChildStdin>,
    reader: Option<thread::JoinHandle<()>>,
}

impl LocalCoreMlProvider {
    pub fn new(binary: std::path::PathBuf, events: EventSink) -> Self {
        Self {
            binary,
            events,
            child: None,
            stdin: None,
            reader: None,
        }
    }

    fn write(&mut self, value: serde_json::Value) -> anyhow::Result<()> {
        let stdin = self
            .stdin
            .as_mut()
            .ok_or_else(|| anyhow::anyhow!("STT provider is not running"))?;
        serde_json::to_writer(&mut *stdin, &value)?;
        stdin.write_all(b"\n")?;
        stdin.flush()?;
        Ok(())
    }
}

impl TranscriptionProvider for LocalCoreMlProvider {
    fn start(
        &mut self,
        config: TranscriptionConfig,
        events: mpsc::UnboundedSender<TranscriptEvent>,
    ) -> anyhow::Result<()> {
        if self.child.is_some() {
            return Err(anyhow::anyhow!("STT provider already running"));
        }
        let mut child = Command::new(&self.binary)
            .arg("stdio")
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::inherit())
            .spawn()?;
        self.stdin = child.stdin.take();
        let stdout = child
            .stdout
            .take()
            .ok_or_else(|| anyhow::anyhow!("STT stdout unavailable"))?;
        let (ready_tx, ready_rx) = std::sync::mpsc::sync_channel(1);
        let notifications = self.events.clone();
        let channel = if config.source == AudioSource::System {
            "interviewer"
        } else {
            "user"
        };
        self.events.send(Event::SpeechStatus {
            channel,
            status: "awaiting-audio",
            error: None,
        });
        self.reader = Some(thread::spawn(move || {
            let mut ready_tx = Some(ready_tx);
            let mut reconciler = super::provider::TranscriptReconciler::default();
            for line in BufReader::new(stdout).lines().map_while(Result::ok) {
                let Ok(value) = serde_json::from_str::<serde_json::Value>(&line) else {
                    continue;
                };
                let Some(kind) = value.get("type").and_then(|value| value.as_str()) else {
                    continue;
                };
                if kind == "session_started" {
                    notifications.send(Event::SpeechStatus {
                        channel,
                        status: "connected",
                        error: None,
                    });
                    if let Some(tx) = ready_tx.take() {
                        let _ = tx.send(Ok(()));
                    }
                }
                if kind == "error" {
                    let message = value
                        .get("message")
                        .and_then(|v| v.as_str())
                        .unwrap_or("Local STT failed")
                        .to_owned();
                    notifications.send(Event::SpeechStatus {
                        channel,
                        status: "failed",
                        error: Some(message.clone()),
                    });
                    if let Some(tx) = ready_tx.take() {
                        let _ = tx.send(Err(message));
                    }
                }
                if !matches!(kind, "partial" | "committed" | "final") {
                    continue;
                }
                let source = match value.get("source").and_then(|value| value.as_str()) {
                    Some("system") => AudioSource::System,
                    _ => AudioSource::Microphone,
                };
                let Some((text, final_result)) = reconciler.accept(
                    kind,
                    value
                        .get("text")
                        .and_then(|v| v.as_str())
                        .unwrap_or_default(),
                ) else {
                    continue;
                };
                let _ = events.send(TranscriptEvent {
                    speaker: if source == AudioSource::System {
                        "interviewer"
                    } else {
                        "user"
                    },
                    text,
                    final_result,
                });
            }
        }));
        self.child = Some(child);
        let source = if config.source == AudioSource::System {
            "system"
        } else {
            "mic"
        };
        self.write(json!({ "type": "start", "model": config.model, "language": config.language, "source": source }))?;
        match ready_rx.recv_timeout(std::time::Duration::from_secs(90)) {
            Ok(Ok(())) => Ok(()),
            Ok(Err(message)) => anyhow::bail!("{message}"),
            Err(error) => anyhow::bail!("Local STT did not start: {error}"),
        }
    }

    fn send_audio(&mut self, chunk: AudioChunk) -> anyhow::Result<()> {
        if chunk.sample_rate != cheatly_audio::TRANSCRIPTION_SAMPLE_RATE {
            return Err(anyhow::anyhow!("audio must be 16 kHz PCM16"));
        }
        let source = if chunk.source == AudioSource::System {
            "system"
        } else {
            "mic"
        };
        let bytes = chunk
            .pcm16
            .iter()
            .flat_map(|sample| sample.to_le_bytes())
            .collect::<Vec<_>>();
        self.write(json!({ "type": "audio", "source": source, "pcm16": STANDARD.encode(bytes) }))
    }

    fn stop(&mut self) -> anyhow::Result<()> {
        if self.child.is_none() {
            return Ok(());
        }
        let result = self.write(json!({ "type": "stop" }));
        self.stdin.take();
        if let Some(mut child) = self.child.take() {
            let deadline = std::time::Instant::now() + std::time::Duration::from_secs(30);
            loop {
                if child.try_wait()?.is_some() {
                    break;
                }
                if std::time::Instant::now() >= deadline {
                    let _ = child.kill();
                    let _ = child.wait();
                    if let Some(reader) = self.reader.take() {
                        let _ = reader.join();
                    }
                    anyhow::bail!("STT stop timed out after 30 seconds");
                }
                thread::sleep(std::time::Duration::from_millis(20));
            }
        }
        if let Some(reader) = self.reader.take() {
            let _ = reader.join();
        }
        result?;
        Ok(())
    }
}

impl Drop for LocalCoreMlProvider {
    fn drop(&mut self) {
        self.stdin.take();
        if let Some(mut child) = self.child.take() {
            let _ = child.kill();
            let _ = child.wait();
        }
        if let Some(reader) = self.reader.take() {
            let _ = reader.join();
        }
    }
}
