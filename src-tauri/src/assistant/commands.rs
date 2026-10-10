use super::{
    intelligence::IntelligenceSnapshot,
    service::{self, ChatOptions, Questions},
};
use crate::{command_response::Success, state::AppState};
use serde_json::Value;
use tauri::State;

#[tauri::command]
pub async fn analyze_transcript(
    transcript: String,
    state: State<'_, AppState>,
) -> Result<Questions, String> {
    service::analyze_transcript(transcript, &state.assistant).await
}
#[tauri::command]
pub async fn chat_stream_start(
    stream_id: String,
    messages: Vec<Value>,
    options: Option<ChatOptions>,
    state: State<'_, AppState>,
) -> Result<Success, String> {
    service::chat_stream_start(stream_id, messages, options, &state.assistant).await
}
#[tauri::command]
pub fn chat_stream_abort(stream_id: String, state: State<AppState>) -> Result<(), String> {
    service::chat_stream_abort(stream_id, &state.assistant)
}
#[tauri::command]
pub fn get_intelligence_context(state: State<AppState>) -> Result<IntelligenceSnapshot, String> {
    service::get_intelligence_context(&state.assistant)
}
#[tauri::command]
pub fn reset_intelligence(state: State<AppState>) -> Result<Success, String> {
    service::reset_intelligence(&state.assistant)
}

#[tauri::command]
pub fn get_question_state(
    state: State<'_, AppState>,
) -> Result<super::questions::QuestionSnapshot, String> {
    state.questions.snapshot()
}
#[tauri::command]
pub async fn scan_questions(
    state: State<'_, AppState>,
) -> Result<super::questions::QuestionSnapshot, String> {
    state.questions.scan(true).await
}
#[tauri::command]
pub fn set_questions_paused(
    paused: bool,
    state: State<'_, AppState>,
) -> Result<super::questions::QuestionSnapshot, String> {
    state.questions.set_paused(paused)
}
#[tauri::command]
pub fn dismiss_question(
    id: String,
    state: State<'_, AppState>,
) -> Result<super::questions::QuestionSnapshot, String> {
    state.questions.dismiss(&id)
}
#[tauri::command]
pub fn reset_questions(
    state: State<'_, AppState>,
) -> Result<super::questions::QuestionSnapshot, String> {
    state.questions.reset()
}
