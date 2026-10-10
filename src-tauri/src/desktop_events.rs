use crate::events::{Event, EventSink};
use serde_json::json;
use tauri::{AppHandle, Emitter};

pub fn sink(app: AppHandle) -> EventSink {
    EventSink::new(move |event| {
        let result = match event {
            Event::MeetingState(active) => {
                app.emit("meeting-state-changed", json!({"isActive":active}))
            }
            Event::MeetingsUpdated => app.emit("meetings-updated", ()),
            Event::SessionReset => app.emit("session-reset", ()),
            Event::DialogueDrained(turns) => app.emit("dialogue-drained", turns),
            Event::Transcript(event) => app.emit("native-audio-transcript", event),
            Event::CaptureActive { channel, active } => app.emit(
                "audio-capture-active",
                json!({"channel":channel,"active":active}),
            ),
            Event::SpeechStatus {
                channel,
                status,
                error,
            } => app.emit(
                "stt-status",
                json!({"channel":channel,"status":status,"error":error}),
            ),
            Event::Chat(value) => app.emit("chat-stream-event", value),
            Event::Questions(value) => app.emit("questions-changed", value),
        };
        if let Err(error) = result {
            log::warn!("Desktop notification: {error}");
        }
    })
}
