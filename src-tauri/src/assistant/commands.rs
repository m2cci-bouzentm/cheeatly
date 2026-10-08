use serde_json::{Value, json};

use crate::command_response::Success;

#[tauri::command]
pub fn analyze_transcript() -> Value {
    json!({ "questions": [] })
}
#[tauri::command]
pub fn chat_stream_start() -> Result<Success, String> {
    Err("Chat backend migration is not complete".into())
}
#[tauri::command]
pub fn chat_stream_abort() {}
