use crate::{command_response::Success, state::AppState};
use serde::Deserialize;
use serde_json::Value;
use tauri::State;
fn error(error: impl std::fmt::Display) -> String {
    error.to_string()
}

#[derive(Deserialize)]
pub struct SummaryUpdates {
    pub summary: Option<String>,
    pub overview: Option<String>,
}

#[tauri::command]
pub fn get_meeting_active(state: State<AppState>) -> Result<bool, String> {
    Ok(state.meetings.snapshot().map_err(error)?.active)
}
// Start time of the active meeting (Unix ms) for the overlay's elapsed timer; None when no meeting runs.
#[tauri::command]
pub fn get_meeting_started_at(state: State<AppState>) -> Result<Option<i64>, String> {
    Ok(state.meetings.snapshot().map_err(error)?.started_at_ms)
}
#[tauri::command]
pub async fn start_meeting(
    state: State<'_, AppState>,
    metadata: Option<Value>,
) -> Result<Success, String> {
    state
        .meetings
        .start(metadata)
        .await
        .map_err(crate::permissions::capture_start_error)?;
    let _ = state.questions.snapshot();
    Ok(Success::new())
}
#[tauri::command]
pub async fn abort_meeting(state: State<'_, AppState>) -> Result<(), String> {
    state.meetings.discard().await.map_err(error)?;
    let _ = state.questions.snapshot();
    Ok(())
}
#[tauri::command]
pub async fn reset_meeting(state: State<'_, AppState>) -> Result<(), String> {
    state.meetings.reset().await.map_err(error)?;
    state.questions.reset()?;
    Ok(())
}
#[tauri::command]
pub async fn end_meeting(state: State<'_, AppState>) -> Result<Success, String> {
    state.meetings.end().await.map_err(error)?;
    let _ = state.questions.snapshot();
    Ok(Success::new())
}
#[tauri::command]
pub fn get_recent_meetings(state: State<AppState>) -> Result<Vec<Value>, String> {
    state.meetings.list().map_err(error)
}
#[tauri::command]
pub fn get_meeting_details(id: String, state: State<AppState>) -> Result<Value, String> {
    state.meetings.details(&id).map_err(error)
}
#[tauri::command]
pub fn update_meeting_title(
    id: String,
    title: String,
    state: State<AppState>,
) -> Result<bool, String> {
    state.meetings.update_title(&id, &title).map_err(error)?;
    Ok(true)
}
#[tauri::command]
pub fn update_meeting_summary(
    id: String,
    updates: SummaryUpdates,
    state: State<AppState>,
) -> Result<bool, String> {
    state
        .meetings
        .update_summary(
            &id,
            &updates.summary.or(updates.overview).unwrap_or_default(),
        )
        .map_err(error)?;
    Ok(true)
}
#[tauri::command]
pub fn delete_meeting(id: String, state: State<AppState>) -> Result<bool, String> {
    state.meetings.delete(&id).map_err(error)?;
    Ok(true)
}
#[tauri::command]
pub fn retry_meeting_summary(id: String, state: State<AppState>) -> Result<Success, String> {
    state.meetings.queue_summary(&id).map_err(error)?;
    Ok(Success::new())
}
#[tauri::command]
pub async fn flush_database(state: State<'_, AppState>) -> Result<Success, String> {
    let database = state.database.clone();
    tokio::task::spawn_blocking(move || {
        database.lock().map_err(error)?.checkpoint().map_err(error)
    })
    .await
    .map_err(error)??;
    Ok(Success::new())
}
