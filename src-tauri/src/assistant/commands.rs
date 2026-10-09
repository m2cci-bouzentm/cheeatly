use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use tauri::{AppHandle, Emitter, State};

use crate::{command_response::Success, state::AppState};

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChatOptions {
    system: Option<String>,
}

#[derive(Serialize, Deserialize)]
pub struct Questions {
    questions: Vec<Value>,
}

fn error(error: impl std::fmt::Display) -> String {
    error.to_string()
}

#[tauri::command]
pub async fn analyze_transcript(
    transcript: String,
    state: State<'_, AppState>,
) -> Result<Questions, String> {
    if transcript.trim().is_empty() {
        return Ok(Questions { questions: vec![] });
    }
    let prompt = include_str!("../../resources/prompts/question-detection.md");
    let prompt = format!("{}\n\n{prompt}", compose_context(&state, None)?);
    let response = complete(
        &state,
        vec![
            json!({"role":"system","content":prompt}),
            json!({"role":"user","content":transcript}),
        ],
    )
    .await.map_err(|error| {
        log::warn!("Question detection failed: {error}");
        error
    })?;
    let cleaned = response
        .trim()
        .trim_start_matches("```json")
        .trim_end_matches("```")
        .trim();
    let questions: Questions = serde_json::from_str(cleaned).map_err(|error| {
        log::warn!("Question detection returned invalid JSON: {error}");
        format!("Question detection returned invalid JSON: {error}")
    })?;
    log::info!("Question detection completed: {} suggestions", questions.questions.len());
    Ok(questions)
}

#[tauri::command]
pub async fn chat_stream_start(
    app: AppHandle,
    stream_id: String,
    messages: Vec<Value>,
    options: Option<ChatOptions>,
    state: State<'_, AppState>,
) -> Result<Success, String> {
    let skills = state
        .database
        .lock()
        .map_err(error)?
        .list_skills()
        .map_err(error)?
        .into_iter()
        .filter(|skill| skill.enabled)
        .collect::<Vec<_>>();
    let system = compose_context(&state, options.and_then(|options| options.system))?;
    let mut request_messages = vec![json!({"role":"system","content":system})];
    request_messages.extend(messages.into_iter().filter_map(normalize_message));
    let (generation, cancellation) = state
        .intelligence
        .begin(&stream_id, system)
        .map_err(error)?;
    let id = uuid::Uuid::new_v4().to_string();
    let emit = |chunk: Value| {
        app.emit(
            "chat-stream-event",
            json!({"streamId":stream_id,"type":"chunk","chunk":chunk}),
        )
        .map_err(error)
    };
    let credentials_service = state.credentials.clone();
    let result: Result<String, String> = tokio::select! {
        biased;
        _ = cancellation.cancelled() => Err("aborted".into()),
        result = async {
            let credentials = tauri::async_runtime::spawn_blocking(move || credentials_service.load()).await.map_err(error)?.map_err(error)?;
            emit(json!({"type":"start"}))?;
            emit(json!({"type":"text-start","id":id}))?;
            state.llm.stream(&credentials, request_messages, &skills, |text| {
                if cancellation.is_cancelled() { anyhow::bail!("aborted"); }
                emit(json!({"type":"text-delta","id":id,"delta":text})).map_err(anyhow::Error::msg)
            }).await.map_err(error)
        } => result,
    };
    state
        .intelligence
        .finish(&stream_id, generation, result.as_ref().ok().cloned())
        .map_err(error)?;
    match result {
        Ok(_) => {
            emit(json!({"type":"text-end","id":id}))?;
            emit(json!({"type":"finish"}))?;
            app.emit(
                "chat-stream-event",
                json!({"streamId":stream_id,"type":"end"}),
            )
            .map_err(error)?;
            Ok(Success::new())
        }
        Err(message) => {
            let event = if cancellation.is_cancelled() {
                json!({"streamId":stream_id,"type":"end"})
            } else {
                json!({"streamId":stream_id,"type":"error","error":message})
            };
            app.emit("chat-stream-event", event).map_err(error)?;
            Err(message)
        }
    }
}

#[tauri::command]
pub fn chat_stream_abort(stream_id: String, state: State<AppState>) -> Result<(), String> {
    state.intelligence.abort(&stream_id).map_err(error)
}

#[tauri::command]
pub fn get_intelligence_context(
    state: State<AppState>,
) -> Result<super::intelligence::IntelligenceSnapshot, String> {
    state.intelligence.snapshot().map_err(error)
}

#[tauri::command]
pub fn reset_intelligence(state: State<AppState>) -> Result<Success, String> {
    state.intelligence.reset().map_err(error)?;
    Ok(Success::new())
}

async fn complete(state: &State<'_, AppState>, messages: Vec<Value>) -> Result<String, String> {
    let credentials_service = state.credentials.clone();
    let mut credentials = tauri::async_runtime::spawn_blocking(move || credentials_service.load())
        .await
        .map_err(error)?
        .map_err(error)?;
    if let Some(model) = state
        .settings
        .lock()
        .map_err(error)?
        .values()
        .question_analysis_model
        .clone()
        .filter(|s| !s.trim().is_empty())
    {
        credentials.default_model = Some(model);
    }
    if let Some(key) = credentials
        .question_analysis_api_key
        .clone()
        .filter(|s| !s.trim().is_empty())
    {
        credentials.open_router_api_key = Some(key);
    }
    let skills = state
        .database
        .lock()
        .map_err(error)?
        .list_skills()
        .map_err(error)?
        .into_iter()
        .filter(|s| s.enabled)
        .collect::<Vec<_>>();
    state
        .llm
        .stream(&credentials, messages, &skills, |_| Ok(()))
        .await
        .map_err(error)
}

fn compose_context(state: &AppState, extra: Option<String>) -> Result<String, String> {
    let mut parts = vec![
        include_str!("../../resources/prompts/system.md")
            .trim()
            .to_owned(),
    ];
    if let Some(extra) = extra.filter(|text| !text.trim().is_empty()) {
        parts.push(extra);
    }
    let transcript = state
        .meeting
        .lock()
        .map_err(error)?
        .transcript
        .iter()
        .map(|turn| format!("{}: {}", turn.speaker, turn.text))
        .collect::<Vec<_>>()
        .join("\n");
    if !transcript.is_empty() {
        parts.push(format!("LIVE MEETING TRANSCRIPT:\n{transcript}"));
    }
    let (description, files) = {
        let database = state.database.lock().map_err(error)?;
        (
            database.context_description().map_err(error)?,
            database.list_context_files().map_err(error)?,
        )
    };
    if !description.is_empty() {
        parts.push(format!("USER CONTEXT:\n{description}"));
    }
    for file in files {
        let content = std::fs::read_to_string(&file.storage_path).map_err(error)?;
        parts.push(format!("CONTEXT FILE: {}\n{}", file.filename, content));
    }
    let skills = state
        .database
        .lock()
        .map_err(error)?
        .list_skills()
        .map_err(error)?;
    for skill in skills.into_iter().filter(|skill| skill.enabled) {
        parts.push(format!(
            "Available skill (use retrieveSkill to load): {} — {}",
            skill.name, skill.description
        ));
    }
    Ok(parts.join("\n\n"))
}

fn normalize_message(message: Value) -> Option<Value> {
    let role = message.get("role")?.as_str()?;
    if !matches!(role, "user" | "assistant" | "system") {
        return None;
    }
    if let Some(parts) = message.get("parts").and_then(Value::as_array) {
        let content = parts
            .iter()
            .filter_map(|part| match part.get("type")?.as_str()? {
                "text" => Some(json!({"type":"text","text":part.get("text")?.as_str()?})),
                "file" if role == "user" => {
                    let url = part.get("url")?.as_str()?;
                    if !url.starts_with("data:image/") {
                        return None;
                    }
                    Some(json!({"type":"image_url","image_url":{"url":url}}))
                }
                _ => None,
            })
            .collect::<Vec<_>>();
        if content.is_empty() {
            return None;
        }
        Some(json!({"role":role,"content":content}))
    } else {
        Some(json!({"role":role,"content":message.get("content")?.as_str()?}))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn screenshots_survive_message_conversion() {
        let message = normalize_message(json!({"role":"user","parts":[{"type":"text","text":"Describe this"},{"type":"file","url":"data:image/png;base64,YQ=="}]})).unwrap();
        assert_eq!(message["content"][1]["type"], "image_url");
        assert!(
            normalize_message(
                json!({"role":"user","parts":[{"type":"file","url":"file:///secret"}]})
            )
            .is_none()
        );
    }
}
