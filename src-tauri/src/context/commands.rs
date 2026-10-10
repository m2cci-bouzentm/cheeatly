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
    super::service::save_description(&state.database, &content).map_err(error)?;
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
    super::service::delete_file(&state.database, &id).map_err(error)?;
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
    let storage = app.path().app_data_dir().map_err(error)?.join("context");
    let database = state.database.clone();
    let file = tokio::task::spawn_blocking(move || {
        super::service::import_file(&database, &storage, &source)
    })
    .await
    .map_err(error)?
    .map_err(error)?;
    Ok(json!({ "success": true, "file": file }))
}
