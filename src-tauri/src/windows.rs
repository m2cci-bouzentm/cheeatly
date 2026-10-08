use serde::Deserialize;
use tauri::{AppHandle, Manager, WebviewWindow};

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
pub fn toggle_settings_window() {}
#[tauri::command]
pub fn close_settings_window() {}
#[tauri::command]
pub fn open_settings_tab() {}
#[tauri::command]
pub fn toggle_model_selector() {}
#[tauri::command]
pub fn model_selector_close_if_open() {}
