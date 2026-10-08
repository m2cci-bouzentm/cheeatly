use std::fs;

use serde_json::json;
use tauri::State;

use crate::{commands::Success, state::AppState};

fn error(error: impl std::fmt::Display) -> String {
    error.to_string()
}

#[tauri::command]
pub fn context_get_description(state: State<AppState>) -> serde_json::Value {
    match state.database.lock() {
        Ok(database) => match database.context_description() {
            Ok(content) => json!({ "success": true, "content": content }),
            Err(error) => json!({ "success": false, "content": "", "error": error.to_string() }),
        },
        Err(error) => json!({ "success": false, "content": "", "error": error.to_string() }),
    }
}

#[tauri::command]
pub fn context_save_description(
    content: String,
    state: State<AppState>,
) -> Result<Success, String> {
    let content: String = content.chars().take(4000).collect();
    state
        .database
        .lock()
        .map_err(error)?
        .save_context_description(&content)
        .map_err(error)?;
    Ok(Success { success: true })
}

#[tauri::command]
pub fn context_get_files(state: State<AppState>) -> serde_json::Value {
    match state.database.lock() {
        Ok(database) => match database.list_context_files() {
            Ok(files) => json!({ "success": true, "files": files }),
            Err(error) => json!({ "success": false, "files": [], "error": error.to_string() }),
        },
        Err(error) => json!({ "success": false, "files": [], "error": error.to_string() }),
    }
}

#[tauri::command]
pub fn context_delete_file(id: String, state: State<AppState>) -> Result<Success, String> {
    if let Some(path) = state
        .database
        .lock()
        .map_err(error)?
        .delete_context_file(&id)
        .map_err(error)?
    {
        let _ = fs::remove_file(path);
    }
    Ok(Success { success: true })
}

#[tauri::command]
pub fn context_upload_file() -> serde_json::Value {
    json!({ "success": false, "cancelled": true })
}

#[tauri::command]
pub fn get_intelligence_context() -> serde_json::Value {
    json!({ "context": "", "lastAssistantMessage": null, "activeMode": "default" })
}

#[tauri::command]
pub fn reset_intelligence() -> Success {
    Success { success: true }
}
