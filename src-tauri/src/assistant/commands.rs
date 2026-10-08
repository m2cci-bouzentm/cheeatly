use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use tauri::{AppHandle, Emitter, State};

use crate::{command_response::Success, state::AppState};

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChatOptions {
    system: Option<String>,
}

#[derive(Deserialize)]
struct OpenRouterResponse {
    choices: Vec<Choice>,
}
#[derive(Deserialize)]
struct Choice {
    message: AssistantMessage,
}
#[derive(Deserialize)]
struct AssistantMessage {
    content: String,
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
    let response = complete(
        &state,
        vec![
            json!({"role":"system","content":prompt}),
            json!({"role":"user","content":transcript}),
        ],
    )
    .await?;
    let cleaned = response
        .trim()
        .trim_start_matches("```json")
        .trim_end_matches("```")
        .trim();
    serde_json::from_str(cleaned).map_err(error)
}

#[tauri::command]
pub async fn chat_stream_start(
    app: AppHandle,
    stream_id: String,
    messages: Vec<Value>,
    options: Option<ChatOptions>,
    state: State<'_, AppState>,
) -> Result<Success, String> {
    let mut request_messages = Vec::new();
    let system = options
        .and_then(|options| options.system)
        .unwrap_or_else(|| include_str!("../../resources/prompts/system.md").into());
    request_messages.push(json!({"role":"system","content":system}));
    request_messages.extend(messages.into_iter().filter_map(normalize_message));
    match complete(&state, request_messages).await {
        Ok(text) => {
            let id = uuid::Uuid::new_v4().to_string();
            for chunk in [
                json!({"streamId":stream_id,"type":"chunk","chunk":{"type":"start"}}),
                json!({"streamId":stream_id,"type":"chunk","chunk":{"type":"text-start","id":id}}),
                json!({"streamId":stream_id,"type":"chunk","chunk":{"type":"text-delta","id":id,"delta":text}}),
                json!({"streamId":stream_id,"type":"chunk","chunk":{"type":"text-end","id":id}}),
                json!({"streamId":stream_id,"type":"chunk","chunk":{"type":"finish"}}),
                json!({"streamId":stream_id,"type":"end"}),
            ] {
                app.emit("chat-stream-event", chunk).map_err(error)?;
            }
            Ok(Success::new())
        }
        Err(message) => {
            app.emit(
                "chat-stream-event",
                json!({"streamId":stream_id,"type":"error","error":message}),
            )
            .map_err(error)?;
            Err(message)
        }
    }
}

#[tauri::command]
pub fn chat_stream_abort() {}

async fn complete(state: &State<'_, AppState>, messages: Vec<Value>) -> Result<String, String> {
    let credentials = state.credentials.load().map_err(error)?;
    let key = credentials
        .open_router_api_key
        .ok_or_else(|| "No OpenRouter API key configured".to_string())?;
    let model = credentials
        .default_model
        .unwrap_or_else(|| "openai/gpt-oss-120b".into());
    let response = reqwest::Client::new()
        .post("https://openrouter.ai/api/v1/chat/completions")
        .bearer_auth(key)
        .json(&json!({"model":model,"messages":messages}))
        .send()
        .await
        .map_err(error)?
        .error_for_status()
        .map_err(error)?
        .json::<OpenRouterResponse>()
        .await
        .map_err(error)?;
    response
        .choices
        .into_iter()
        .next()
        .map(|choice| choice.message.content)
        .ok_or_else(|| "OpenRouter returned no response".into())
}

fn normalize_message(message: Value) -> Option<Value> {
    let role = message.get("role")?.as_str()?;
    let text = message
        .get("parts")
        .and_then(Value::as_array)
        .map(|parts| {
            parts
                .iter()
                .filter_map(|part| part.get("text").and_then(Value::as_str))
                .collect::<Vec<_>>()
                .join("\n")
        })
        .or_else(|| {
            message
                .get("content")
                .and_then(Value::as_str)
                .map(ToOwned::to_owned)
        })?;
    Some(json!({"role":role,"content":text}))
}
