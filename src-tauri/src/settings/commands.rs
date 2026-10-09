use serde::{Deserialize, Serialize};
use serde_json::json;
use tauri::{AppHandle, Emitter, State};

use crate::{command_response::Success, state::AppState};

fn error(error: impl std::fmt::Display) -> String {
    error.to_string()
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct QuestionAnalysisConfig {
    enabled: bool,
    interval: u32,
    model: String,
    open_router_api_key: String,
    window: u32,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct QuestionAnalysisUpdate {
    enabled: Option<bool>,
    interval: Option<u32>,
    model: Option<String>,
    open_router_api_key: Option<String>,
    window: Option<u32>,
}

#[tauri::command]
pub fn get_undetectable(state: State<AppState>) -> Result<bool, String> {
    Ok(state
        .settings
        .lock()
        .map_err(error)?
        .values()
        .is_undetectable
        .unwrap_or(false))
}

#[tauri::command]
pub fn set_undetectable(
    app: AppHandle,
    state: State<AppState>,
    value: bool,
) -> Result<serde_json::Value, String> {
    crate::windows::apply_protection(&app, value)?;
    state
        .settings
        .lock()
        .map_err(error)?
        .update(|settings| settings.is_undetectable = Some(value))
        .map_err(error)?;
    let mode = state
        .settings
        .lock()
        .map_err(error)?
        .values()
        .disguise_mode
        .clone()
        .unwrap_or_else(|| "none".into());
    crate::windows::apply_disguise(&app, if value { &mode } else { "none" })?;
    app.emit("undetectable-changed", value).map_err(error)?;
    Ok(json!({ "success": true, "state": value }))
}

#[tauri::command]
pub fn get_disguise(state: State<AppState>) -> Result<String, String> {
    Ok(state
        .settings
        .lock()
        .map_err(error)?
        .values()
        .disguise_mode
        .clone()
        .unwrap_or_else(|| "none".into()))
}

#[tauri::command]
pub fn set_disguise(
    app: AppHandle,
    state: State<AppState>,
    mode: String,
) -> Result<Success, String> {
    if !matches!(mode.as_str(), "none" | "terminal" | "settings" | "activity") {
        return Err("Unknown disguise".into());
    }
    state
        .settings
        .lock()
        .map_err(error)?
        .update(|settings| settings.disguise_mode = Some(mode.clone()))
        .map_err(error)?;
    if get_undetectable(state)? {
        crate::windows::apply_disguise(&app, &mode)?;
    }
    app.emit("disguise-changed", mode).map_err(error)?;
    Ok(Success::new())
}

#[tauri::command]
pub fn get_verbose_logging(state: State<AppState>) -> Result<bool, String> {
    Ok(state
        .settings
        .lock()
        .map_err(error)?
        .values()
        .verbose_logging
        .unwrap_or(false))
}

#[tauri::command]
pub fn set_verbose_logging(state: State<AppState>, enabled: bool) -> Result<Success, String> {
    state
        .settings
        .lock()
        .map_err(error)?
        .update(|settings| settings.verbose_logging = Some(enabled))
        .map_err(error)?;
    Ok(Success::new())
}

#[tauri::command]
pub async fn get_question_analysis_config(
    state: State<'_, AppState>,
) -> Result<QuestionAnalysisConfig, String> {
    let credentials = state.credentials.load_async().await.map_err(error)?;
    let settings = state.settings.lock().map_err(error)?;
    let values = settings.values();
    Ok(QuestionAnalysisConfig {
        enabled: values.question_analysis_enabled.unwrap_or(true),
        interval: values.question_analysis_interval.unwrap_or(20),
        model: values.question_analysis_model.clone().unwrap_or_default(),
        open_router_api_key: if credentials.question_analysis_api_key.is_some() {
            "stored".into()
        } else {
            String::new()
        },
        window: values.question_analysis_window.unwrap_or(20),
    })
}

#[tauri::command]
pub async fn set_question_analysis_config(
    app: AppHandle,
    state: State<'_, AppState>,
    config: QuestionAnalysisUpdate,
) -> Result<Success, String> {
    if let Some(key) = &config.open_router_api_key {
        let mut credentials = state.credentials.load_async().await.map_err(error)?;
        credentials.question_analysis_api_key =
            (!key.trim().is_empty()).then(|| key.trim().to_owned());
        state
            .credentials
            .save_async(credentials)
            .await
            .map_err(error)?;
    }
    state
        .settings
        .lock()
        .map_err(error)?
        .update(|settings| {
            if let Some(value) = config.enabled {
                settings.question_analysis_enabled = Some(value);
            }
            if let Some(value) = config.interval.filter(|value| (5..=120).contains(value)) {
                settings.question_analysis_interval = Some(value);
            }
            if let Some(value) = config.model {
                settings.question_analysis_model = Some(value);
            }
            if let Some(value) = config.window.filter(|value| (5..=100).contains(value)) {
                settings.question_analysis_window = Some(value);
            }
        })
        .map_err(error)?;
    let current = get_question_analysis_config(state).await?;
    app.emit(
        "question-analysis-config-changed",
        json!({ "enabled": current.enabled, "interval": current.interval, "window": current.window }),
    )
    .map_err(error)?;
    Ok(Success::new())
}

#[tauri::command]
pub fn get_arch() -> String {
    std::env::consts::ARCH.into()
}

#[tauri::command]
pub fn get_os_version() -> String {
    #[cfg(target_os = "macos")]
    if let Ok(output) = std::process::Command::new("/usr/bin/sw_vers")
        .arg("-productVersion")
        .output()
    {
        return String::from_utf8_lossy(&output.stdout).trim().to_owned();
    }
    std::env::consts::OS.into()
}
