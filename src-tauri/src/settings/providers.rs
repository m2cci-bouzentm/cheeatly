use serde::Serialize;
use serde_json::json;
use tauri::{AppHandle, Emitter, State};

use crate::{command_response::Success, settings::StoredCredentials, state::AppState};

fn error(error: impl std::fmt::Display) -> String {
    error.to_string()
}

async fn credentials(state: &State<'_, AppState>) -> Result<StoredCredentials, String> {
    state.credentials.load_async().await.map_err(error)
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StoredCredentialStatus {
    has_open_router_key: bool,
    stt_provider: String,
}

#[tauri::command]
pub async fn get_current_llm_config(
    state: State<'_, AppState>,
) -> Result<serde_json::Value, String> {
    let values = credentials(&state).await?;
    Ok(json!({
        "provider": if values.open_router_api_key.is_some() { "openrouter" } else { "none" },
        "model": values.default_model.unwrap_or_else(|| "openai/gpt-oss-120b".into())
    }))
}

#[tauri::command]
pub async fn set_api_key(
    app: AppHandle,
    provider: String,
    api_key: String,
    state: State<'_, AppState>,
) -> Result<Success, String> {
    if provider != "openrouter" {
        return Err("Unsupported LLM provider".into());
    }
    let mut values = credentials(&state).await?;
    values.open_router_api_key = (!api_key.trim().is_empty()).then(|| api_key.trim().to_owned());
    state.credentials.save_async(values).await.map_err(error)?;
    app.emit("credentials-changed", ()).map_err(error)?;
    Ok(Success::new())
}

#[tauri::command]
pub async fn get_stored_credentials(
    state: State<'_, AppState>,
) -> Result<StoredCredentialStatus, String> {
    let values = credentials(&state).await?;
    Ok(StoredCredentialStatus {
        has_open_router_key: values
            .open_router_api_key
            .as_ref()
            .is_some_and(|key| !key.trim().is_empty()),
        stt_provider: values
            .stt_provider
            .unwrap_or_else(|| "local-parakeet".into()),
    })
}

#[tauri::command]
pub async fn get_default_model(state: State<'_, AppState>) -> Result<serde_json::Value, String> {
    Ok(
        json!({ "model": credentials(&state).await?.default_model.unwrap_or_else(|| "openai/gpt-oss-120b".into()) }),
    )
}

#[tauri::command]
pub async fn set_model(
    app: AppHandle,
    model_id: String,
    state: State<'_, AppState>,
) -> Result<Success, String> {
    let mut values = credentials(&state).await?;
    values.default_model = Some(model_id.clone());
    state.credentials.save_async(values).await.map_err(error)?;
    app.emit("model-changed", model_id).map_err(error)?;
    Ok(Success::new())
}

#[tauri::command]
pub async fn set_provider_preferred_model(
    provider: String,
    model_id: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    if provider != "openrouter" {
        return Err("Unsupported LLM provider".into());
    }
    let mut values = credentials(&state).await?;
    values.default_model = Some(model_id);
    state.credentials.save_async(values).await.map_err(error)
}

#[tauri::command]
pub async fn get_stt_provider(state: State<'_, AppState>) -> Result<String, String> {
    Ok(credentials(&state)
        .await?
        .stt_provider
        .unwrap_or_else(|| "local-parakeet".into()))
}

#[tauri::command]
pub async fn set_stt_provider(
    app: AppHandle,
    provider: String,
    state: State<'_, AppState>,
) -> Result<Success, String> {
    if !matches!(provider.as_str(), "none" | "local-parakeet") {
        return Err("Unsupported STT provider".into());
    }
    if state.meeting.lock().map_err(error)?.active {
        return Err("Stop the meeting before changing the STT provider".into());
    }
    let mut values = credentials(&state).await?;
    values.stt_provider = Some(provider.clone());
    state.credentials.save_async(values).await.map_err(error)?;
    app.emit(
        "stt-config-changed",
        json!({ "configured": provider != "none", "provider": provider }),
    )
    .map_err(error)?;
    Ok(Success::new())
}

#[tauri::command]
pub async fn get_stt_language(state: State<'_, AppState>) -> Result<String, String> {
    Ok(credentials(&state)
        .await?
        .stt_language
        .unwrap_or_else(|| "auto".into()))
}

#[tauri::command]
pub async fn set_recognition_language(
    key: String,
    state: State<'_, AppState>,
) -> Result<Success, String> {
    let mut values = credentials(&state).await?;
    values.stt_language = Some(key);
    state.credentials.save_async(values).await.map_err(error)?;
    Ok(Success::new())
}

#[tauri::command]
pub async fn test_llm_connection(
    provider: String,
    api_key: Option<String>,
    state: State<'_, AppState>,
) -> Result<Success, String> {
    if provider != "openrouter" {
        return Err("Unsupported LLM provider".into());
    }
    let key = match api_key.filter(|key| !key.trim().is_empty()) {
        Some(key) => key,
        None => credentials(&state)
            .await?
            .open_router_api_key
            .ok_or("No API key provided")?,
    };
    reqwest::Client::new()
        .get("https://openrouter.ai/api/v1/key")
        .timeout(std::time::Duration::from_secs(20))
        .bearer_auth(key)
        .send()
        .await
        .map_err(error)?
        .error_for_status()
        .map_err(error)?;
    Ok(Success::new())
}
