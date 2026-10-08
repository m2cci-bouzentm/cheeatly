use serde::Deserialize;
use std::fs;

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
pub fn skills_import(app: AppHandle, state: State<AppState>) -> Result<serde_json::Value, String> {
    let Some(files) = app
        .dialog()
        .file()
        .add_filter("Skill files", &["md"])
        .blocking_pick_files()
    else {
        return Ok(serde_json::json!({ "cancelled": true, "imported": [] }));
    };
    let mut imported = Vec::new();
    for file in files {
        let path = file.into_path().map_err(error)?;
        let content = fs::read_to_string(&path).map_err(error)?;
        let fallback = path
            .file_stem()
            .and_then(|name| name.to_str())
            .unwrap_or("skill");
        let name = frontmatter_value(&content, "name").unwrap_or(fallback);
        let description = frontmatter_value(&content, "description").unwrap_or("");
        state
            .database
            .lock()
            .map_err(error)?
            .create_skill(name, description, &content)
            .map_err(error)?;
        imported.push(name.to_owned());
    }
    app.emit("skills-changed", ()).map_err(error)?;
    Ok(serde_json::json!({ "cancelled": false, "imported": imported }))
}

fn frontmatter_value<'a>(content: &'a str, key: &str) -> Option<&'a str> {
    let frontmatter = content.strip_prefix("---\n")?.split_once("\n---")?.0;
    frontmatter.lines().find_map(|line| {
        let (name, value) = line.split_once(':')?;
        (name.trim() == key).then(|| value.trim())
    })
}
