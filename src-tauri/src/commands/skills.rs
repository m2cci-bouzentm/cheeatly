use serde::Deserialize;
use tauri::{AppHandle, Emitter, State};

use crate::{repositories::SkillRow, state::AppState};

fn error(error: impl std::fmt::Display) -> String {
    error.to_string()
}

#[derive(Deserialize)]
pub struct SkillPatch {
    enabled: Option<bool>,
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
    if let Some(enabled) = patch.enabled {
        state
            .database
            .lock()
            .map_err(error)?
            .toggle_skill(&name, enabled)
            .map_err(error)?;
    }
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
pub fn skills_import() -> serde_json::Value {
    serde_json::json!({ "cancelled": true, "imported": [] })
}
