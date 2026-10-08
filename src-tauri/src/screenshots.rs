use std::fs;

use base64::{Engine, engine::general_purpose::STANDARD};
use screenshots::Screen;
use serde_json::{Value, json};
use tauri::{AppHandle, Manager};

#[tauri::command]
pub fn take_screenshot(app: AppHandle) -> Result<Value, String> {
    let screen = Screen::from_point(0, 0).map_err(|error| error.to_string())?;
    let image = screen.capture().map_err(|error| error.to_string())?;
    let directory = app
        .path()
        .temp_dir()
        .map_err(|error| error.to_string())?
        .join("cheatly-screenshots");
    fs::create_dir_all(&directory).map_err(|error| error.to_string())?;
    let path = directory.join(format!("screenshot-{}.png", uuid::Uuid::new_v4()));
    image.save(&path).map_err(|error| error.to_string())?;
    let bytes = fs::read(&path).map_err(|error| error.to_string())?;
    Ok(
        json!({ "path": path, "preview": format!("data:image/png;base64,{}", STANDARD.encode(bytes)) }),
    )
}
