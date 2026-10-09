use std::fs;

use serde_json::json;
use tauri::{AppHandle, Manager, State};
use tauri_plugin_dialog::DialogExt;

use crate::{command_response::Success, state::AppState};

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
    Ok(Success::new())
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
    Ok(Success::new())
}

#[tauri::command]
pub async fn context_upload_file(
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<serde_json::Value, String> {
    let Some(file) = app
        .dialog()
        .file()
        .add_filter(
            "Documents",
            &["txt", "md", "json", "csv", "xml", "html", "pdf", "docx"],
        )
        .blocking_pick_file()
    else {
        return Ok(json!({ "success": false, "cancelled": true }));
    };
    let source = file.into_path().map_err(error)?;
    let filename = source
        .file_name()
        .and_then(|name| name.to_str())
        .ok_or_else(|| "Invalid filename".to_string())?;
    let content = super::documents::read(&source).map_err(error)?;
    let storage = app.path().app_data_dir().map_err(error)?.join("context");
    fs::create_dir_all(&storage).map_err(error)?;
    let destination = storage.join(format!("{}-{}", uuid::Uuid::new_v4(), filename));
    fs::write(&destination, content).map_err(error)?;
    let file = state
        .database
        .lock()
        .map_err(error)?
        .create_context_file(filename, destination.to_string_lossy().as_ref())
        .map_err(error)?;
    Ok(json!({ "success": true, "file": file }))
}
