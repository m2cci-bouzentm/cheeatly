use std::{
    io::{BufRead, BufReader, Write},
    process::{Child, ChildStdin, Command, Stdio},
    thread,
};

use base64::{Engine, engine::general_purpose::STANDARD};
use serde_json::json;
use tauri::{AppHandle, Manager};
use tokio::sync::mpsc;

use super::provider::{
    AudioChunk, AudioSource, TranscriptEvent, TranscriptionConfig, TranscriptionProvider,
};

pub struct LocalCoreMlProvider {
    binary: std::path::PathBuf,
    child: Option<Child>,
    stdin: Option<ChildStdin>,
}

impl LocalCoreMlProvider {
    pub fn bundled(app: &AppHandle) -> anyhow::Result<Self> {
        let binary = app
            .path()
            .resolve("speech-to-text", tauri::path::BaseDirectory::Resource)
            .or_else(|_| {
                app.path()
                    .resolve("speech-to-text", tauri::path::BaseDirectory::Executable)
            })?;
        Ok(Self {
            binary,
            child: None,
            stdin: None,
        })
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
        thread::spawn(move || {
            for line in BufReader::new(stdout).lines().map_while(Result::ok) {
                let Ok(value) = serde_json::from_str::<serde_json::Value>(&line) else {
                    continue;
                };
                let Some(kind) = value.get("type").and_then(|value| value.as_str()) else {
                    continue;
                };
                if !matches!(kind, "partial" | "committed" | "final") {
                    continue;
                }
                let source = match value.get("source").and_then(|value| value.as_str()) {
                    Some("system") => AudioSource::System,
                    _ => AudioSource::Microphone,
                };
                let text = super::provider::filter_transcript(
                    value
                        .get("text")
                        .and_then(|value| value.as_str())
                        .unwrap_or_default(),
                );
                if text.is_empty() {
                    continue;
                }
                let _ = events.send(TranscriptEvent {
                    source,
                    text,
                    final_result: kind == "final",
                });
            }
        });
        self.child = Some(child);
        let source = if config.source == AudioSource::System {
            "system"
        } else {
            "mic"
        };
        self.write(json!({ "type": "start", "model": config.model, "language": config.language, "source": source }))
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
        self.write(json!({ "type": "stop" }))?;
        self.stdin.take();
        if let Some(mut child) = self.child.take() {
            let _ = child.wait();
        }
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
    }
}
