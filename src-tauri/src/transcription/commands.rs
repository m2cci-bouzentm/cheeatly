use serde::Serialize;
use serde_json::{Value, json};
use tauri::State;

use crate::{command_response::Success, state::AppState};

fn error(error: impl std::fmt::Display) -> String {
    error.to_string()
}

#[derive(Serialize)]
pub struct AudioDevice {
    id: String,
    name: String,
}

#[tauri::command]
pub fn get_input_devices() -> Result<Vec<AudioDevice>, String> {
    cheatly_audio::microphone::list_input_devices()
        .map(|devices| {
            devices
                .into_iter()
                .map(|(id, name)| AudioDevice { id, name })
                .collect()
        })
        .map_err(error)
}

#[tauri::command]
pub fn get_output_devices() -> Result<Vec<AudioDevice>, String> {
    cheatly_audio::speaker::list_output_devices()
        .map(|devices| {
            devices
                .into_iter()
                .map(|(id, name)| AudioDevice { id, name })
                .collect()
        })
        .map_err(error)
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
pub fn get_native_audio_status(state: State<AppState>) -> Value {
    json!({ "connected": state.transcription.active() })
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
