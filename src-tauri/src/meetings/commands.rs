use serde::Deserialize;
use serde_json::{Value, json};
use tauri::{AppHandle, Emitter, Manager, State};
use uuid::Uuid;

use crate::{command_response::Success, state::AppState};

fn error(error: impl std::fmt::Display) -> String {
    error.to_string()
}

fn map_meeting(
    row: crate::database::MeetingRow,
    summary_status: super::summary::SummaryStatus,
) -> Value {
    let transcript = row
        .transcript
        .unwrap_or_default()
        .lines()
        .enumerate()
        .map(|(index, line)| {
            let (speaker, text) = line.split_once(':').unwrap_or(("Unknown", line));
            let speaker = match speaker.trim() {
                "Me" => "user",
                "Them" => "interviewer",
                value => value,
            };
            json!({ "speaker": speaker, "text": text.trim(), "timestamp": index })
        })
        .collect::<Vec<_>>();
    let summary = row.summary.unwrap_or_default();
    json!({
        "id": row.id,
        "title": row.title.unwrap_or_else(|| "Untitled Session".into()),
        "summaryStatus": summary_status,
        "date": row.created_at,
        "duration": "0:00",
        "summary": summary,
        "detailedSummary": { "overview": summary, "actionItems": [], "keyPoints": [] },
        "transcript": transcript
    })
}

#[derive(Deserialize)]
pub struct SummaryUpdates {
    pub summary: Option<String>,
    pub overview: Option<String>,
}

#[tauri::command]
pub fn get_meeting_active(state: State<AppState>) -> Result<bool, String> {
    Ok(state.meeting.lock().map_err(error)?.active)
}

#[tauri::command]
pub async fn start_meeting(
    app: AppHandle,
    state: State<'_, AppState>,
    metadata: Option<Value>,
) -> Result<Success, String> {
    let _lifecycle = state.meeting_lifecycle.lock().await;
    if state.meeting.lock().map_err(error)?.active {
        return Err("A meeting is already active".into());
    }
    let input_device = metadata
        .as_ref()
        .and_then(|value| value.pointer("/audio/inputDeviceId"))
        .and_then(Value::as_str)
        .map(ToOwned::to_owned);
    let output_device = metadata
        .as_ref()
        .and_then(|value| value.pointer("/audio/outputDeviceId"))
        .and_then(Value::as_str)
        .map(ToOwned::to_owned);
    let credentials_service = state.credentials.clone();
    let credentials = tauri::async_runtime::spawn_blocking(move || credentials_service.load())
        .await
        .map_err(error)?
        .map_err(error)?;
    let provider = credentials
        .stt_provider
        .as_deref()
        .unwrap_or("local-parakeet");
    if !matches!(provider, "none" | "local-parakeet") {
        return Err("Unsupported STT provider".into());
    }
    let (model, language) = {
        let settings = state.settings.lock().map_err(error)?;
        state
            .transcription
            .set_muted("mic", settings.values().mic_muted.unwrap_or(false))
            .map_err(error)?;
        state
            .transcription
            .set_muted("system", settings.values().system_muted.unwrap_or(false))
            .map_err(error)?;
        (
            settings
                .values()
                .parakeet_model
                .clone()
                .unwrap_or_else(|| "parakeet-tdt-0.6b-v3".into()),
            settings
                .values()
                .parakeet_language
                .clone()
                .unwrap_or_else(|| "auto".into()),
        )
    };
    state.intelligence.reset().map_err(error)?;
    state.meeting.lock().map_err(error)?.transcript.clear();
    if provider != "none" {
        // Let ScreenCaptureKit request consent itself. CoreGraphics preflight
        // can deny access before ScreenCaptureKit gets to show its native prompt.
        let transcription = state.transcription.clone();
        let meeting_state = state.meeting.clone();
        let transcription_app = app.clone();
        log::info!("Starting native transcription session");
        tauri::async_runtime::spawn_blocking(move || {
            transcription.start_local(
                &transcription_app,
                input_device,
                output_device,
                crate::transcription::provider::TranscriptionConfig {
                    model,
                    language,
                    source: crate::transcription::provider::AudioSource::Microphone,
                },
                meeting_state,
            )
        })
        .await
        .map_err(error)?
        .map_err(crate::permissions::capture_start_error)?;
        log::info!("Native transcription session started");
    }
    {
        let mut meeting = state.meeting.lock().map_err(error)?;
        meeting.active = true;
    }
    app.emit("meeting-state-changed", json!({ "isActive": true }))
        .map_err(error)?;
    Ok(Success::new())
}

#[tauri::command]
pub async fn abort_meeting(app: AppHandle, state: State<'_, AppState>) -> Result<(), String> {
    let _lifecycle = state.meeting_lifecycle.lock().await;
    let transcription = state.transcription.clone();
    let stopped = tauri::async_runtime::spawn_blocking(move || transcription.stop())
        .await
        .map_err(error)?;
    state.intelligence.reset().map_err(error)?;
    if let Err(error) = stopped {
        log::warn!("Transcription abort: {error}");
    }
    state
        .settings
        .lock()
        .map_err(error)?
        .update(|s| {
            s.mic_muted = Some(false);
            s.system_muted = Some(false);
        })
        .map_err(error)?;
    let mut meeting = state.meeting.lock().map_err(error)?;
    meeting.active = false;
    meeting.transcript.clear();
    app.emit("meeting-state-changed", json!({ "isActive": false }))
        .map_err(error)
}

#[tauri::command]
pub async fn end_meeting(app: AppHandle, state: State<'_, AppState>) -> Result<Success, String> {
    let _lifecycle = state.meeting_lifecycle.lock().await;
    if !state.meeting.lock().map_err(error)?.active {
        return Ok(Success::new());
    }
    let transcription = state.transcription.clone();
    let stopped = tauri::async_runtime::spawn_blocking(move || transcription.stop())
        .await
        .map_err(error)?;
    if let Err(error) = stopped {
        log::warn!("Transcription drain: {error}");
    }
    let transcript = {
        let meeting = state.meeting.lock().map_err(error)?;
        let transcript = meeting
            .transcript
            .iter()
            .map(|turn| format!("{}: {}", turn.speaker, turn.text))
            .collect::<Vec<_>>()
            .join("\n");
        app.emit("dialogue-drained", &meeting.transcript)
            .map_err(error)?;
        transcript
    };
    if !transcript.is_empty() {
        let id = Uuid::new_v4().to_string();
        state
            .database
            .lock()
            .map_err(error)?
            .create_meeting(&id, &transcript)
            .map_err(error)?;
        if let Err(error) = queue_summary(&app, &state, &id) {
            log::warn!("Summary queue: {error}");
        }
        state.meeting.lock().map_err(error)?.transcript.clear();
    }
    state.meeting.lock().map_err(error)?.active = false;
    app.emit("meeting-state-changed", json!({ "isActive": false }))
        .map_err(error)?;
    state
        .settings
        .lock()
        .map_err(error)?
        .update(|settings| {
            settings.mic_muted = Some(false);
            settings.system_muted = Some(false);
        })
        .map_err(error)?;
    app.emit("session-reset", ()).map_err(error)?;
    Ok(Success::new())
}

#[tauri::command]
pub fn get_recent_meetings(state: State<AppState>) -> Result<Vec<Value>, String> {
    let meetings = state
        .database
        .lock()
        .map_err(error)?
        .list_meetings()
        .map_err(error)?;
    meetings
        .into_iter()
        .map(|meeting| {
            let status = state.summaries.status(&meeting).map_err(error)?;
            Ok(map_meeting(meeting, status))
        })
        .collect()
}

#[tauri::command]
pub fn get_meeting_details(id: String, state: State<AppState>) -> Result<Value, String> {
    let meeting = state
        .database
        .lock()
        .map_err(error)?
        .get_meeting(&id)
        .map_err(error)?;
    let status = state.summaries.status(&meeting).map_err(error)?;
    Ok(map_meeting(meeting, status))
}

#[tauri::command]
pub fn update_meeting_title(
    app: AppHandle,
    id: String,
    title: String,
    state: State<AppState>,
) -> Result<bool, String> {
    state
        .database
        .lock()
        .map_err(error)?
        .update_meeting_title(&id, &title)
        .map_err(error)?;
    app.emit("meetings-updated", ()).map_err(error)?;
    Ok(true)
}

#[tauri::command]
pub fn update_meeting_summary(
    app: AppHandle,
    id: String,
    updates: SummaryUpdates,
    state: State<AppState>,
) -> Result<bool, String> {
    let summary = updates.summary.or(updates.overview).unwrap_or_default();
    state
        .database
        .lock()
        .map_err(error)?
        .update_meeting_summary(&id, &summary)
        .map_err(error)?;
    app.emit("meetings-updated", ()).map_err(error)?;
    Ok(true)
}

#[tauri::command]
pub fn delete_meeting(app: AppHandle, id: String, state: State<AppState>) -> Result<bool, String> {
    state
        .database
        .lock()
        .map_err(error)?
        .delete_meeting(&id)
        .map_err(error)?;
    app.emit("meetings-updated", ()).map_err(error)?;
    Ok(true)
}

#[tauri::command]
pub fn retry_meeting_summary(
    app: AppHandle,
    id: String,
    state: State<AppState>,
) -> Result<Success, String> {
    queue_summary(&app, &state, &id)?;
    Ok(Success::new())
}

fn queue_summary(app: &AppHandle, state: &AppState, id: &str) -> Result<(), String> {
    let row = state
        .database
        .lock()
        .map_err(error)?
        .get_meeting(id)
        .map_err(error)?;
    let job = state.summaries.prepare(row).map_err(error)?;
    app.emit("meetings-updated", ()).map_err(error)?;
    let (database, llm, credentials, app) = (
        state.database.clone(),
        state.llm.clone(),
        state.credentials.clone(),
        app.clone(),
    );
    tauri::async_runtime::spawn(async move {
        if let Err(error) = job.generate(llm, credentials, database).await {
            log::warn!("Meeting summary generation failed: {error}");
        }
        if let Err(error) = app.emit("meetings-updated", ()) {
            log::warn!("Summary notification failed: {error}");
        }
    });
    Ok(())
}

#[tauri::command]
pub async fn flush_database(app: AppHandle) -> Result<Success, String> {
    tauri::async_runtime::spawn_blocking(move || {
        app.state::<AppState>()
            .database
            .lock()
            .map_err(error)?
            .checkpoint()
            .map_err(error)
    })
    .await
    .map_err(error)??;
    Ok(Success::new())
}

#[cfg(test)]
mod contract_tests {
    use super::*;

    #[test]
    fn saved_meetings_keep_the_frontend_response_shape_and_speaker_mapping() {
        let directory = tempfile::tempdir().unwrap();
        let db = crate::database::Database::open(&directory.path().join("contract.db")).unwrap();
        db.create_meeting(
            "one",
            "Me: Budget: €50\nThem: Tomorrow?\nGuest: Yes\nUnlabeled line",
        )
        .unwrap();
        let mapped = map_meeting(
            db.get_meeting("one").unwrap(),
            crate::meetings::summary::SummaryStatus::Failed,
        );
        assert_eq!(mapped["id"], "one");
        assert_eq!(mapped["title"], "Untitled Session");
        assert_eq!(mapped["summaryStatus"], "failed");
        assert_eq!(mapped["summary"], "");
        assert_eq!(
            mapped["detailedSummary"],
            json!({"overview":"","actionItems":[],"keyPoints":[]})
        );
        assert_eq!(
            mapped["transcript"],
            json!([
                {"speaker":"user","text":"Budget: €50","timestamp":0},
                {"speaker":"interviewer","text":"Tomorrow?","timestamp":1},
                {"speaker":"Guest","text":"Yes","timestamp":2},
                {"speaker":"Unknown","text":"Unlabeled line","timestamp":3}
            ])
        );
    }
}
