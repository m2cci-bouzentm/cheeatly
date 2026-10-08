use serde_json::{Value, json};
use tauri::State;

use crate::{command_response::Success, state::AppState};

fn error(error: impl std::fmt::Display) -> String {
    error.to_string()
}

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
    Success::new()
}

#[tauri::command]
pub fn get_native_audio_status() -> Value {
    json!({ "connected": false })
}

#[tauri::command]
pub fn start_audio_test() -> Success {
    Success::new()
}

#[tauri::command]
pub fn stop_audio_test() -> Success {
    Success::new()
}

#[tauri::command]
pub fn local_parakeet_get_config(state: State<AppState>) -> Result<Value, String> {
    let settings = state.settings.lock().map_err(error)?;
    Ok(json!({
        "modelId": settings.values().parakeet_model.clone().unwrap_or_else(|| "parakeet-tdt-0.6b-v3".into()),
        "language": settings.values().parakeet_language.clone().unwrap_or_else(|| "auto".into()),
        "models": []
    }))
}

#[tauri::command]
pub fn local_parakeet_set_config() -> Success {
    Success::new()
}

#[tauri::command]
pub fn local_parakeet_download_model() -> Success {
    Success::new()
}
