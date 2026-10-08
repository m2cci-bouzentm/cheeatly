use serde::Deserialize;
use serde_json::{Value, json};
use tauri::{AppHandle, Emitter, State};
use uuid::Uuid;

use crate::{command_response::Success, database::Database, state::AppState};

fn error(error: impl std::fmt::Display) -> String {
    error.to_string()
}

fn map_meeting(row: crate::database::MeetingRow) -> Value {
    let transcript = row
        .transcript
        .unwrap_or_default()
        .lines()
        .enumerate()
        .map(|(index, line)| {
            let (speaker, text) = line.split_once(':').unwrap_or(("Unknown", line));
            let speaker = match speaker.trim() {
                "Me" => "user",
                "Them" => "interviewer",
                value => value,
            };
            json!({ "speaker": speaker, "text": text.trim(), "timestamp": index })
        })
        .collect::<Vec<_>>();
    let summary = row.summary.unwrap_or_default();
    json!({
        "id": row.id,
        "title": row.title.unwrap_or_else(|| "Untitled Session".into()),
        "summaryStatus": if summary.is_empty() { "pending" } else { "complete" },
        "date": row.created_at,
        "duration": "0:00",
        "summary": summary,
        "detailedSummary": { "overview": summary, "actionItems": [], "keyPoints": [] },
        "transcript": transcript
    })
}

#[derive(Deserialize)]
pub struct SummaryUpdates {
    pub summary: Option<String>,
    pub overview: Option<String>,
}

#[tauri::command]
pub fn get_meeting_active(state: State<AppState>) -> Result<bool, String> {
    Ok(state.meeting.lock().map_err(error)?.active)
}

#[tauri::command]
pub async fn start_meeting(
    app: AppHandle,
    state: State<'_, AppState>,
    metadata: Option<Value>,
) -> Result<Success, String> {
    if state.meeting.lock().map_err(error)?.active {
        return Err("A meeting is already active".into());
    }
    let input_device = metadata
        .as_ref()
        .and_then(|value| value.pointer("/audio/inputDeviceId"))
        .and_then(Value::as_str)
        .map(ToOwned::to_owned);
    let output_device = metadata
        .as_ref()
        .and_then(|value| value.pointer("/audio/outputDeviceId"))
        .and_then(Value::as_str)
        .map(ToOwned::to_owned);
    let credentials = state.credentials.load().map_err(error)?;
    let (model, language) = {
        let settings = state.settings.lock().map_err(error)?;
        (
            settings
                .values()
                .parakeet_model
                .clone()
                .unwrap_or_else(|| "parakeet-tdt-0.6b-v3".into()),
            credentials.stt_language.unwrap_or_else(|| "auto".into()),
        )
    };
    let transcription = state.transcription.clone();
    let meeting_state = state.meeting.clone();
    let transcription_app = app.clone();
    tauri::async_runtime::spawn_blocking(move || {
        transcription.start_local(
            &transcription_app,
            input_device,
            output_device,
            crate::transcription::provider::TranscriptionConfig {
                model,
                language,
                source: crate::transcription::provider::AudioSource::Microphone,
            },
            meeting_state,
        )
    })
    .await
    .map_err(error)?
    .map_err(error)?;
    {
        let mut meeting = state.meeting.lock().map_err(error)?;
        meeting.active = true;
        meeting.transcript.clear();
    }
    app.emit("meeting-state-changed", json!({ "isActive": true }))
        .map_err(error)?;
    Ok(Success::new())
}

#[tauri::command]
pub fn abort_meeting(app: AppHandle, state: State<AppState>) -> Result<(), String> {
    state.transcription.stop().map_err(error)?;
    let mut meeting = state.meeting.lock().map_err(error)?;
    meeting.active = false;
    meeting.transcript.clear();
    app.emit("meeting-state-changed", json!({ "isActive": false }))
        .map_err(error)
}

#[tauri::command]
pub fn end_meeting(app: AppHandle, state: State<AppState>) -> Result<Success, String> {
    state.transcription.stop().map_err(error)?;
    let transcript = {
        let mut meeting = state.meeting.lock().map_err(error)?;
        meeting.active = false;
        let transcript = meeting
            .transcript
            .iter()
            .map(|turn| format!("{}: {}", turn.speaker, turn.text))
            .collect::<Vec<_>>()
            .join("\n");
        meeting.transcript.clear();
        transcript
    };
    if !transcript.is_empty() {
        state
            .database
            .lock()
            .map_err(error)?
            .create_meeting(&Uuid::new_v4().to_string(), &transcript)
            .map_err(error)?;
        app.emit("meetings-updated", ()).map_err(error)?;
    }
    app.emit("meeting-state-changed", json!({ "isActive": false }))
        .map_err(error)?;
    Ok(Success::new())
}

#[tauri::command]
pub fn get_recent_meetings(state: State<AppState>) -> Result<Vec<Value>, String> {
    Ok(state
        .database
        .lock()
        .map_err(error)?
        .list_meetings()
        .map_err(error)?
        .into_iter()
        .map(map_meeting)
        .collect())
}

#[tauri::command]
pub fn get_meeting_details(id: String, state: State<AppState>) -> Result<Value, String> {
    Ok(map_meeting(
        state
            .database
            .lock()
            .map_err(error)?
            .get_meeting(&id)
            .map_err(error)?,
    ))
}

#[tauri::command]
pub fn update_meeting_title(
    app: AppHandle,
    id: String,
    title: String,
    state: State<AppState>,
) -> Result<bool, String> {
    state
        .database
        .lock()
        .map_err(error)?
        .update_meeting_title(&id, &title)
        .map_err(error)?;
    app.emit("meetings-updated", ()).map_err(error)?;
    Ok(true)
}

#[tauri::command]
pub fn update_meeting_summary(
    app: AppHandle,
    id: String,
    updates: SummaryUpdates,
    state: State<AppState>,
) -> Result<bool, String> {
    let summary = updates.summary.or(updates.overview).unwrap_or_default();
    state
        .database
        .lock()
        .map_err(error)?
        .update_meeting_summary(&id, &summary)
        .map_err(error)?;
    app.emit("meetings-updated", ()).map_err(error)?;
    Ok(true)
}

#[tauri::command]
pub fn delete_meeting(app: AppHandle, id: String, state: State<AppState>) -> Result<bool, String> {
    state
        .database
        .lock()
        .map_err(error)?
        .delete_meeting(&id)
        .map_err(error)?;
    app.emit("meetings-updated", ()).map_err(error)?;
    Ok(true)
}

#[tauri::command]
pub fn retry_meeting_summary(_id: String) -> Success {
    Success::new()
}

#[tauri::command]
pub fn flush_database() -> Success {
    Success::new()
}

#[allow(dead_code)]
fn _assert_send(_: &Database) {}
