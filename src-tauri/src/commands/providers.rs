use serde::Serialize;
use serde_json::json;
use tauri::{AppHandle, Emitter};

use crate::{
    commands::Success,
    services::{CredentialService, StoredCredentials},
};

fn error(error: impl std::fmt::Display) -> String {
    error.to_string()
}

fn credentials() -> Result<StoredCredentials, String> {
    CredentialService::load().map_err(error)
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StoredCredentialStatus {
    has_open_router_key: bool,
    stt_provider: String,
}

#[tauri::command]
pub fn get_current_llm_config() -> Result<serde_json::Value, String> {
    let values = credentials()?;
    Ok(json!({
        "provider": if values.open_router_api_key.is_some() { "openrouter" } else { "none" },
        "model": values.default_model.unwrap_or_else(|| "openai/gpt-oss-120b".into())
    }))
}

#[tauri::command]
pub fn set_api_key(app: AppHandle, _provider: String, api_key: String) -> Result<Success, String> {
    let mut values = credentials()?;
    values.open_router_api_key = (!api_key.trim().is_empty()).then(|| api_key.trim().to_owned());
    CredentialService::save(&values).map_err(error)?;
    app.emit("credentials-changed", ()).map_err(error)?;
    Ok(Success { success: true })
}

#[tauri::command]
pub fn get_stored_credentials() -> Result<StoredCredentialStatus, String> {
    let values = credentials()?;
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
pub fn get_default_model() -> Result<serde_json::Value, String> {
    Ok(
        json!({ "model": credentials()?.default_model.unwrap_or_else(|| "openai/gpt-oss-120b".into()) }),
    )
}

#[tauri::command]
pub fn set_model(app: AppHandle, model_id: String) -> Result<Success, String> {
    let mut values = credentials()?;
    values.default_model = Some(model_id.clone());
    CredentialService::save(&values).map_err(error)?;
    app.emit("model-changed", model_id).map_err(error)?;
    Ok(Success { success: true })
}

#[tauri::command]
pub fn set_provider_preferred_model(provider: String, model_id: String) -> Result<(), String> {
    let _ = provider;
    let mut values = credentials()?;
    values.default_model = Some(model_id);
    CredentialService::save(&values).map_err(error)
}

#[tauri::command]
pub fn get_stt_provider() -> Result<String, String> {
    Ok(credentials()?
        .stt_provider
        .unwrap_or_else(|| "local-parakeet".into()))
}

#[tauri::command]
pub fn set_stt_provider(app: AppHandle, provider: String) -> Result<Success, String> {
    let mut values = credentials()?;
    values.stt_provider = Some(provider.clone());
    CredentialService::save(&values).map_err(error)?;
    app.emit(
        "stt-config-changed",
        json!({ "configured": provider != "none", "provider": provider }),
    )
    .map_err(error)?;
    Ok(Success { success: true })
}

#[tauri::command]
pub fn get_stt_language() -> Result<String, String> {
    Ok(credentials()?.stt_language.unwrap_or_else(|| "auto".into()))
}

#[tauri::command]
pub fn set_recognition_language(key: String) -> Result<Success, String> {
    let mut values = credentials()?;
    values.stt_language = Some(key);
    CredentialService::save(&values).map_err(error)?;
    Ok(Success { success: true })
}

#[tauri::command]
pub async fn test_llm_connection(
    _provider: String,
    api_key: Option<String>,
) -> Result<Success, String> {
    let key = match api_key.filter(|key| !key.trim().is_empty()) {
        Some(key) => key,
        None => credentials()?
            .open_router_api_key
            .ok_or("No API key provided")?,
    };
    reqwest::Client::new()
        .get("https://openrouter.ai/api/v1/models")
        .bearer_auth(key)
        .send()
        .await
        .map_err(error)?
        .error_for_status()
        .map_err(error)?;
    Ok(Success { success: true })
}
