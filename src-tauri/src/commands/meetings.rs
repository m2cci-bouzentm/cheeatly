use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use tauri::{AppHandle, Emitter, State};
use uuid::Uuid;

use crate::{repositories::Database, state::AppState};

fn error(error: impl std::fmt::Display) -> String {
    error.to_string()
}

fn map_meeting(row: crate::repositories::MeetingRow) -> Value {
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

#[derive(Serialize)]
pub struct Success {
    pub success: bool,
}

#[tauri::command]
pub fn get_meeting_active(state: State<AppState>) -> Result<bool, String> {
    Ok(state.meeting.lock().map_err(error)?.active)
}

#[tauri::command]
pub fn start_meeting(
    app: AppHandle,
    state: State<AppState>,
    _metadata: Option<Value>,
) -> Result<Success, String> {
    let mut meeting = state.meeting.lock().map_err(error)?;
    if meeting.active {
        return Err("A meeting is already active".into());
    }
    meeting.active = true;
    meeting.transcript.clear();
    app.emit("meeting-state-changed", json!({ "isActive": true }))
        .map_err(error)?;
    Ok(Success { success: true })
}

#[tauri::command]
pub fn abort_meeting(app: AppHandle, state: State<AppState>) -> Result<(), String> {
    let mut meeting = state.meeting.lock().map_err(error)?;
    meeting.active = false;
    meeting.transcript.clear();
    app.emit("meeting-state-changed", json!({ "isActive": false }))
        .map_err(error)
}

#[tauri::command]
pub fn end_meeting(app: AppHandle, state: State<AppState>) -> Result<Success, String> {
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
    Ok(Success { success: true })
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
    Success { success: true }
}

#[tauri::command]
pub fn flush_database() -> Success {
    Success { success: true }
}

#[allow(dead_code)]
fn _assert_send(_: &Database) {}
