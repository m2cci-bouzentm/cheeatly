use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use tauri::{AppHandle, Manager, State, WebviewWindow};

use crate::{commands::Success, state::AppState};

fn error(error: impl std::fmt::Display) -> String {
    error.to_string()
}
fn main_window(app: &AppHandle) -> Result<WebviewWindow, String> {
    app.get_webview_window("main")
        .ok_or_else(|| "main window unavailable".into())
}

#[derive(Deserialize)]
pub struct Dimensions {
    width: f64,
    height: f64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Keybind {
    id: String,
    label: String,
    accelerator: String,
    is_global: bool,
    default_accelerator: String,
}

#[tauri::command]
pub fn update_content_dimensions(app: AppHandle, dimensions: Dimensions) -> Result<(), String> {
    main_window(&app)?
        .set_size(tauri::LogicalSize::new(dimensions.width, dimensions.height))
        .map_err(error)
}
#[tauri::command]
pub fn window_minimize(app: AppHandle) -> Result<(), String> {
    main_window(&app)?.minimize().map_err(error)
}
#[tauri::command]
pub fn window_maximize(app: AppHandle) -> Result<(), String> {
    let window = main_window(&app)?;
    if window.is_maximized().map_err(error)? {
        window.unmaximize().map_err(error)
    } else {
        window.maximize().map_err(error)
    }
}
#[tauri::command]
pub fn window_close(app: AppHandle) -> Result<(), String> {
    main_window(&app)?.hide().map_err(error)
}
#[tauri::command]
pub fn window_is_maximized(app: AppHandle) -> Result<bool, String> {
    main_window(&app)?.is_maximized().map_err(error)
}
#[tauri::command]
pub fn quit_app(app: AppHandle) {
    app.exit(0);
}
#[tauri::command]
pub fn show_window(app: AppHandle, _inactive: Option<bool>) -> Result<(), String> {
    let window = main_window(&app)?;
    window.show().map_err(error)?;
    window.set_focus().map_err(error)
}
#[tauri::command]
pub fn hide_window(app: AppHandle) -> Result<(), String> {
    main_window(&app)?.hide().map_err(error)
}
#[tauri::command]
pub fn toggle_window(app: AppHandle) -> Result<(), String> {
    let window = main_window(&app)?;
    if window.is_visible().map_err(error)? {
        window.hide().map_err(error)
    } else {
        window.show().map_err(error)?;
        window.set_focus().map_err(error)
    }
}
#[tauri::command]
pub fn show_overlay(app: AppHandle) -> Result<(), String> {
    show_window(app, Some(false))
}
#[tauri::command]
pub fn hide_overlay(app: AppHandle) -> Result<(), String> {
    hide_window(app)
}
#[tauri::command]
pub fn set_window_mode(_mode: String, _inactive: Option<bool>) {}
#[tauri::command]
pub fn move_window_left() {}
#[tauri::command]
pub fn move_window_right() {}
#[tauri::command]
pub fn move_window_up() {}
#[tauri::command]
pub fn move_window_down() {}
#[tauri::command]
pub fn set_overlay_opacity(_app: AppHandle, _opacity: f64) {}
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
    Success { success: true }
}
#[tauri::command]
pub fn check_permissions() -> Value {
    json!({ "microphone": "not-determined", "screen": "not-determined", "platform": std::env::consts::OS })
}
#[tauri::command]
pub fn repair_tcc_permissions() -> Value {
    json!({ "ok": false, "message": "Use macOS System Settings to reset permissions." })
}
#[tauri::command]
pub fn get_log_file_path() -> Option<String> {
    None
}
#[tauri::command]
pub fn open_log_file() -> Success {
    Success { success: true }
}
#[tauri::command]
pub fn take_screenshot() -> Result<Value, String> {
    Err("Screenshot capture is not enabled in this migration build".into())
}
#[tauri::command]
pub fn get_screenshots() -> Vec<Value> {
    vec![]
}
#[tauri::command]
pub fn delete_screenshot(_path: String) -> Value {
    json!({ "success": true })
}
#[tauri::command]
pub fn toggle_settings_window() {}
#[tauri::command]
pub fn close_settings_window() {}
#[tauri::command]
pub fn open_settings_tab() {}
#[tauri::command]
pub fn toggle_model_selector() {}
#[tauri::command]
pub fn model_selector_close_if_open() {}
#[tauri::command]
pub fn get_input_devices() -> Vec<Value> {
    vec![]
}
#[tauri::command]
pub fn get_output_devices() -> Vec<Value> {
    vec![]
}
#[tauri::command]
pub fn get_recognition_languages() -> Value {
    json!({ "auto": "Auto", "english": "English" })
}
#[tauri::command]
pub fn set_channel_muted() -> Success {
    Success { success: true }
}
#[tauri::command]
pub fn get_native_audio_status() -> Value {
    json!({ "connected": false })
}
#[tauri::command]
pub fn start_audio_test() -> Success {
    Success { success: true }
}
#[tauri::command]
pub fn stop_audio_test() -> Success {
    Success { success: true }
}
#[tauri::command]
pub fn stealth_tap_available() -> bool {
    false
}
#[tauri::command]
pub fn stealth_tap_start() -> bool {
    false
}
#[tauri::command]
pub fn stealth_tap_stop() {}
#[tauri::command]
pub fn stealth_tap_open_settings() {}
#[tauri::command]
pub fn analyze_transcript() -> Value {
    json!({ "questions": [] })
}
#[tauri::command]
pub fn get_keybinds() -> Vec<Keybind> {
    vec![]
}
#[tauri::command]
pub fn set_keybind() -> bool {
    true
}
#[tauri::command]
pub fn reset_keybinds() -> Vec<Keybind> {
    vec![]
}
#[tauri::command]
pub fn local_parakeet_get_config(state: State<AppState>) -> Result<Value, String> {
    let settings = state.settings.lock().map_err(error)?;
    Ok(
        json!({ "modelId": settings.values().parakeet_model.clone().unwrap_or_else(|| "parakeet-tdt-0.6b-v3".into()), "language": settings.values().parakeet_language.clone().unwrap_or_else(|| "auto".into()), "models": [] }),
    )
}
#[tauri::command]
pub fn local_parakeet_set_config() -> Success {
    Success { success: true }
}
#[tauri::command]
pub fn local_parakeet_download_model() -> Success {
    Success { success: true }
}
#[tauri::command]
pub fn chat_stream_start() -> Result<Success, String> {
    Err("Chat backend migration is not complete".into())
}
#[tauri::command]
pub fn chat_stream_abort() {}
#[tauri::command]
pub fn extract_emails_from_transcript() -> Vec<String> {
    vec![]
}
#[tauri::command]
pub fn open_mailto() -> Success {
    Success { success: true }
}
