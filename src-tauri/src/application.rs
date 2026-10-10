use std::fs;

use tauri::{AppHandle, Manager};
use tauri_plugin_autostart::ManagerExt;

use crate::command_response::Success;

fn error(error: impl std::fmt::Display) -> String {
    error.to_string()
}

#[tauri::command]
pub fn open_external(url: String) -> Result<(), String> {
    if !(url.starts_with("https://") || url.starts_with("x-apple.systempreferences:")) {
        return Err("URL scheme not allowed".into());
    }
    open::that(url).map_err(error)
}

#[tauri::command]
pub fn get_open_at_login(app: AppHandle) -> Result<bool, String> {
    app.autolaunch().is_enabled().map_err(error)
}

#[tauri::command]
pub fn set_open_at_login(app: AppHandle, open: bool) -> Result<Success, String> {
    if open {
        app.autolaunch().enable()
    } else {
        app.autolaunch().disable()
    }
    .map_err(error)?;
    Ok(Success::new())
}

#[tauri::command]
pub fn get_log_file_path(app: AppHandle) -> Result<String, String> {
    Ok(app
        .path()
        .app_log_dir()
        .map_err(error)?
        .join("cheatly.log")
        .to_string_lossy()
        .into_owned())
}

#[tauri::command]
pub fn open_log_file(app: AppHandle) -> Result<Success, String> {
    let path = app.path().app_log_dir().map_err(error)?.join("cheatly.log");
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(error)?;
    }
    if !path.exists() {
        fs::write(&path, "").map_err(error)?;
    }
    open::that(path).map_err(error)?;
    Ok(Success::new())
}

#[tauri::command]
pub fn quit_app(app: AppHandle) {
    app.exit(0);
}
