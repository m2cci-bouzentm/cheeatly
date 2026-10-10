use serde::Deserialize;

use tauri::{AppHandle, Emitter, State};
use tauri_plugin_dialog::DialogExt;

use crate::{database::SkillRow, state::AppState};

fn error(error: impl std::fmt::Display) -> String {
    error.to_string()
}

#[derive(Deserialize)]
pub struct SkillPatch {
    enabled: Option<bool>,
    content: Option<String>,
    description: Option<String>,
}

#[tauri::command]
pub fn skills_list(state: State<AppState>) -> Result<Vec<SkillRow>, String> {
    state
        .database
        .lock()
        .map_err(error)?
        .list_skills()
        .map_err(error)
}

#[tauri::command]
pub fn skills_get(name: String, state: State<AppState>) -> Result<Option<String>, String> {
    state
        .database
        .lock()
        .map_err(error)?
        .get_skill_content(&name)
        .map_err(error)
}

#[tauri::command]
pub fn skills_toggle(
    app: AppHandle,
    name: String,
    enabled: bool,
    state: State<AppState>,
) -> Result<(), String> {
    state
        .database
        .lock()
        .map_err(error)?
        .toggle_skill(&name, enabled)
        .map_err(error)?;
    app.emit("skills-changed", ()).map_err(error)
}

#[tauri::command]
pub fn skills_update(
    app: AppHandle,
    name: String,
    patch: SkillPatch,
    state: State<AppState>,
) -> Result<(), String> {
    state
        .database
        .lock()
        .map_err(error)?
        .update_skill(
            &name,
            patch.description.as_deref(),
            patch.content.as_deref(),
            patch.enabled,
        )
        .map_err(error)?;
    app.emit("skills-changed", ()).map_err(error)
}

#[tauri::command]
pub fn skills_remove(app: AppHandle, name: String, state: State<AppState>) -> Result<(), String> {
    state
        .database
        .lock()
        .map_err(error)?
        .remove_skill(&name)
        .map_err(error)?;
    app.emit("skills-changed", ()).map_err(error)
}

#[tauri::command]
pub async fn skills_import(
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<serde_json::Value, String> {
    let Some(files) = app
        .dialog()
        .file()
        .add_filter("Skill files", &["md"])
        .blocking_pick_files()
    else {
        return Ok(serde_json::json!({ "cancelled": true, "imported": [] }));
    };
    let paths = files
        .into_iter()
        .map(|file| file.into_path().map_err(error))
        .collect::<Result<Vec<_>, _>>()?;
    let database = state.database.clone();
    let imported =
        tokio::task::spawn_blocking(move || super::service::import_files(&database, paths))
            .await
            .map_err(error)?
            .map_err(error)?;
    app.emit("skills-changed", ()).map_err(error)?;
    Ok(serde_json::json!({ "cancelled": false, "imported": imported }))
}
