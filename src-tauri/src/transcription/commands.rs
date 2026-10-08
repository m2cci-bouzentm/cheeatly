use serde::Serialize;
use serde_json::{Value, json};
use tauri::{Manager, State};

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
pub fn set_channel_muted(
    channel: String,
    muted: bool,
    state: State<AppState>,
) -> Result<Success, String> {
    state
        .settings
        .lock()
        .map_err(error)?
        .update(|settings| match channel.as_str() {
            "mic" => settings.mic_muted = Some(muted),
            "system" => settings.system_muted = Some(muted),
            _ => {}
        })
        .map_err(error)?;
    Ok(Success::new())
}

#[tauri::command]
pub fn get_native_audio_status(state: State<AppState>) -> Value {
    json!({ "connected": state.transcription.active() })
}

#[tauri::command]
pub fn start_audio_test(
    app: tauri::AppHandle,
    device_id: Option<String>,
    state: State<AppState>,
) -> Result<Success, String> {
    state.audio_test.start(&app, device_id).map_err(error)?;
    Ok(Success::new())
}

#[tauri::command]
pub fn stop_audio_test(state: State<AppState>) -> Result<Success, String> {
    state.audio_test.stop().map_err(error)?;
    Ok(Success::new())
}

#[tauri::command]
pub fn local_parakeet_get_config(
    app: tauri::AppHandle,
    state: State<AppState>,
) -> Result<Value, String> {
    let settings = state.settings.lock().map_err(error)?;
    let binary = app
        .path()
        .resolve("speech-to-text", tauri::path::BaseDirectory::Executable)
        .map_err(error)?;
    let output = std::process::Command::new(binary)
        .arg("list-models")
        .output()
        .map_err(error)?;
    let models: Value = serde_json::from_slice(&output.stdout).map_err(error)?;
    Ok(json!({
        "modelId": settings.values().parakeet_model.clone().unwrap_or_else(|| "parakeet-tdt-0.6b-v3".into()),
        "language": settings.values().parakeet_language.clone().unwrap_or_else(|| "auto".into()),
        "models": models
    }))
}

#[tauri::command]
pub fn local_parakeet_set_config(config: Value, state: State<AppState>) -> Result<Success, String> {
    state
        .settings
        .lock()
        .map_err(error)?
        .update(|settings| {
            if let Some(model) = config.get("modelId").and_then(Value::as_str) {
                settings.parakeet_model = Some(model.to_owned());
            }
            if let Some(language) = config.get("language").and_then(Value::as_str) {
                settings.parakeet_language = Some(language.to_owned());
            }
        })
        .map_err(error)?;
    Ok(Success::new())
}

#[tauri::command]
pub fn local_parakeet_download_model(
    app: tauri::AppHandle,
    model_id: String,
) -> Result<Success, String> {
    let binary = app
        .path()
        .resolve("speech-to-text", tauri::path::BaseDirectory::Executable)
        .map_err(error)?;
    let status = std::process::Command::new(binary)
        .args(["download-model", "--model", &model_id])
        .status()
        .map_err(error)?;
    if !status.success() {
        return Err(format!("model download exited with {status}"));
    }
    Ok(Success::new())
}
