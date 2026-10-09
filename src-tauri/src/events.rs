//! Application notifications. Tauri event names belong to the desktop adapter.
use crate::{meetings::models::TranscriptTurn, transcription::provider::TranscriptEvent};
use serde_json::Value;
use std::sync::Arc;

#[derive(Clone)]
pub enum Event {
    MeetingState(bool),
    MeetingsUpdated,
    SessionReset,
    DialogueDrained(Vec<TranscriptTurn>),
    Transcript(TranscriptEvent),
    CaptureActive {
        channel: &'static str,
        active: bool,
    },
    SpeechStatus {
        channel: &'static str,
        status: &'static str,
        error: Option<String>,
    },
    Chat(Value),
    Questions(Value),
}

#[derive(Clone)]
pub struct EventSink(Arc<dyn Fn(Event) + Send + Sync>);
impl EventSink {
    pub fn new(callback: impl Fn(Event) + Send + Sync + 'static) -> Self {
        Self(Arc::new(callback))
    }
    pub fn send(&self, event: Event) {
        (self.0)(event);
    }
}
