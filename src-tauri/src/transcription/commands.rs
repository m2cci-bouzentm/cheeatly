use serde::Serialize;
use serde_json::{Value, json};
use tauri::{Emitter, State};

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
pub async fn get_input_devices() -> Result<Vec<AudioDevice>, String> {
    tauri::async_runtime::spawn_blocking(cheatly_audio::microphone::list_input_devices)
        .await
        .map_err(error)?
        .map(|devices| {
            devices
                .into_iter()
                .map(|(id, name)| AudioDevice { id, name })
                .collect()
        })
        .map_err(error)
}

#[tauri::command]
pub async fn get_output_devices() -> Result<Vec<AudioDevice>, String> {
    tauri::async_runtime::spawn_blocking(cheatly_audio::speaker::list_output_devices)
        .await
        .map_err(error)?
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
    if !matches!(channel.as_str(), "mic" | "system") {
        return Err("Unknown audio channel".into());
    }
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
    state
        .transcription
        .set_muted(&channel, muted)
        .map_err(error)?;
    Ok(Success::new())
}

#[tauri::command]
pub async fn get_native_audio_status(state: State<'_, AppState>) -> Result<Value, String> {
    let session = state.transcription.clone();
    let active = tauri::async_runtime::spawn_blocking(move || session.active())
        .await
        .map_err(error)?;
    let transcript = state
        .meeting
        .lock()
        .map(|m| m.transcript.clone())
        .unwrap_or_default();
    let settings = state.settings.lock().ok();
    Ok(
        json!({ "connected": active, "transcript": transcript, "micMuted": settings.as_ref().and_then(|s| s.values().mic_muted).unwrap_or(false), "systemMuted": settings.as_ref().and_then(|s| s.values().system_muted).unwrap_or(false) }),
    )
}

#[tauri::command]
pub async fn start_audio_test(
    app: tauri::AppHandle,
    device_id: Option<String>,
    state: State<'_, AppState>,
) -> Result<Success, String> {
    let session = state.audio_test.clone();
    tauri::async_runtime::spawn_blocking(move || session.start(&app, device_id))
        .await
        .map_err(error)?
        .map_err(error)?;
    Ok(Success::new())
}

#[tauri::command]
pub async fn stop_audio_test(state: State<'_, AppState>) -> Result<Success, String> {
    let session = state.audio_test.clone();
    tauri::async_runtime::spawn_blocking(move || session.stop())
        .await
        .map_err(error)?
        .map_err(error)?;
    Ok(Success::new())
}

#[tauri::command]
pub async fn local_parakeet_get_config(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
) -> Result<Value, String> {
    let settings = state.settings.lock().map_err(error)?.values().clone();
    let binary = super::local_coreml::sidecar_path(&app).map_err(error)?;
    let output = tauri::async_runtime::spawn_blocking(move || {
        std::process::Command::new(binary)
            .arg("list-models")
            .output()
    })
    .await
    .map_err(error)?
    .map_err(error)?;
    if !output.status.success() {
        return Err("Unable to list local models".into());
    }
    let models: Value = serde_json::from_slice(&output.stdout).map_err(error)?;
    Ok(json!({
        "modelId": settings.parakeet_model.clone().unwrap_or_else(|| "parakeet-tdt-0.6b-v3".into()),
        "language": settings.parakeet_language.clone().unwrap_or_else(|| "auto".into()),
        "models": models
    }))
}

#[tauri::command]
pub fn local_parakeet_set_config(config: Value, state: State<AppState>) -> Result<Success, String> {
    if let Some(model) = config.get("modelId").and_then(Value::as_str) {
        validate_model(model)?;
    }
    if let Some(language) = config.get("language").and_then(Value::as_str)
        && !matches!(language, "auto" | "english")
    {
        return Err("Unknown recognition language".into());
    }
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
pub async fn local_parakeet_download_model(
    app: tauri::AppHandle,
    model_id: String,
) -> Result<Success, String> {
    validate_model(&model_id)?;
    let event_app = app.clone();
    let event_model = model_id.clone();
    let result = tauri::async_runtime::spawn_blocking(move || -> Result<(), String> {
        use std::io::{BufRead, BufReader};
        use std::process::{Command, Stdio};
        let binary = super::local_coreml::sidecar_path(&app).map_err(error)?;
        let mut child = Command::new(binary)
            .args(["download-model", "--model", &model_id])
            .stdout(Stdio::piped())
            .spawn()
            .map_err(error)?;
        let stdout = child
            .stdout
            .take()
            .ok_or("Model download output unavailable")?;
        for line in BufReader::new(stdout).lines() {
            let line = line.map_err(error)?;
            if let Ok(value) = serde_json::from_str::<Value>(&line)
                && let Some(message) = value.get("message").and_then(Value::as_str)
            {
                let _ = app.emit(
                    "local-parakeet-download-status",
                    json!({"modelId":model_id,"message":message}),
                );
            }
        }
        let status = child.wait().map_err(error)?;
        if !status.success() {
            return Err(format!("Model download exited with {status}"));
        }
        Ok(())
    })
    .await
    .map_err(error)?;
    match result {
        Ok(()) => {
            event_app
                .emit(
                    "local-parakeet-download-complete",
                    json!({"modelId":event_model}),
                )
                .map_err(error)?;
            Ok(Success::new())
        }
        Err(message) => {
            let _ = event_app.emit(
                "local-parakeet-download-error",
                json!({"modelId":event_model,"error":message}),
            );
            Err(message)
        }
    }
}

fn validate_model(model: &str) -> Result<(), String> {
    if matches!(model, "parakeet-tdt-0.6b-v2" | "parakeet-tdt-0.6b-v3") {
        Ok(())
    } else {
        Err("Unknown local model".into())
    }
}
