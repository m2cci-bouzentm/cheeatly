use tauri::AppHandle;

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
pub fn get_open_at_login() -> bool {
    false
}

#[tauri::command]
pub fn set_open_at_login(_open: bool) -> Success {
    Success::new()
}

#[tauri::command]
pub fn get_log_file_path() -> Option<String> {
    None
}

#[tauri::command]
pub fn open_log_file() -> Success {
    Success::new()
}

#[tauri::command]
pub fn quit_app(app: AppHandle) {
    app.exit(0);
}
