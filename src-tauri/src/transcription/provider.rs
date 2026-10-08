use serde::Serialize;
use tokio::sync::mpsc;

#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum AudioSource {
    Microphone,
    System,
}

#[derive(Clone, Debug)]
pub struct AudioChunk {
    pub source: AudioSource,
    pub pcm16: Vec<i16>,
    pub sample_rate: u32,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TranscriptEvent {
    pub source: AudioSource,
    pub text: String,
    pub final_result: bool,
}

#[derive(Clone, Debug)]
pub struct TranscriptionConfig {
    pub model: String,
    pub language: String,
}

pub trait TranscriptionProvider: Send {
    fn start(
        &mut self,
        config: TranscriptionConfig,
        events: mpsc::UnboundedSender<TranscriptEvent>,
    ) -> anyhow::Result<()>;
    fn send_audio(&mut self, chunk: AudioChunk) -> anyhow::Result<()>;
    fn stop(&mut self) -> anyhow::Result<()>;
}
