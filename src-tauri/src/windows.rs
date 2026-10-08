use serde::Deserialize;
use tauri::{AppHandle, Emitter, Manager, WebviewWindow};

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
pub fn set_window_mode(app: AppHandle, mode: String, inactive: Option<bool>) -> Result<(), String> {
    let window = main_window(&app)?;
    match mode.as_str() {
        "launcher" => {
            window
                .set_size(tauri::LogicalSize::new(900.0, 680.0))
                .map_err(error)?;
            window.set_resizable(true).map_err(error)?;
            window
                .eval("if (location.search !== '') location.search = ''")
                .map_err(error)?;
        }
        "overlay" => {
            window
                .set_size(tauri::LogicalSize::new(520.0, 240.0))
                .map_err(error)?;
            window.set_resizable(false).map_err(error)?;
            window
                .eval("if (location.search !== '?window=overlay') location.search = '?window=overlay'")
                .map_err(error)?;
        }
        _ => return Err("Unsupported window mode".into()),
    }
    window.show().map_err(error)?;
    if inactive != Some(true) {
        window.set_focus().map_err(error)?;
    }
    Ok(())
}
#[tauri::command]
pub fn move_window_left(app: AppHandle) -> Result<(), String> {
    move_window(&app, -40, 0)
}
#[tauri::command]
pub fn move_window_right(app: AppHandle) -> Result<(), String> {
    move_window(&app, 40, 0)
}
#[tauri::command]
pub fn move_window_up(app: AppHandle) -> Result<(), String> {
    move_window(&app, 0, -40)
}
#[tauri::command]
pub fn move_window_down(app: AppHandle) -> Result<(), String> {
    move_window(&app, 0, 40)
}
#[tauri::command]
pub fn set_overlay_opacity(app: AppHandle, opacity: f64) -> Result<(), String> {
    let opacity = opacity.clamp(0.35, 1.0);
    app.emit("overlay-opacity-changed", opacity).map_err(error)
}
#[tauri::command]
pub fn toggle_settings_window(app: AppHandle) -> Result<(), String> {
    app.emit("open-settings-tab", "general").map_err(error)
}
#[tauri::command]
pub fn close_settings_window(app: AppHandle) -> Result<(), String> {
    main_window(&app)?
        .eval("if (location.search === '?window=settings') location.search = ''")
        .map_err(error)
}
#[tauri::command]
pub fn open_settings_tab(app: AppHandle, tab: String) -> Result<(), String> {
    app.emit("open-settings-tab", tab).map_err(error)
}
#[tauri::command]
pub fn toggle_model_selector(app: AppHandle) -> Result<(), String> {
    main_window(&app)?.eval("location.search = location.search === '?window=model-selector' ? '?window=overlay' : '?window=model-selector'").map_err(error)
}
#[tauri::command]
pub fn model_selector_close_if_open(app: AppHandle) -> Result<(), String> {
    main_window(&app)?
        .eval(
            "if (location.search === '?window=model-selector') location.search = '?window=overlay'",
        )
        .map_err(error)
}

fn move_window(app: &AppHandle, x: i32, y: i32) -> Result<(), String> {
    let window = main_window(app)?;
    let position = window.outer_position().map_err(error)?;
    window
        .set_position(tauri::PhysicalPosition::new(position.x + x, position.y + y))
        .map_err(error)
}
