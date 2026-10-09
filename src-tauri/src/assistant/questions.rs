use super::service::{AssistantService, Questions, analyze_transcript};
use crate::{
    events::{Event, EventSink},
    meetings::service::MeetingService,
    settings::SettingsStore,
};
use serde::Serialize;
use serde_json::{Value, json};
use std::{
    collections::HashSet,
    sync::{Arc, Mutex},
    time::{Duration, Instant},
};
use tokio_util::sync::CancellationToken;

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct QuestionSnapshot {
    pub questions: Vec<Value>,
    pub is_scanning: bool,
    pub scan_error: String,
    pub scan_notice: String,
    pub settings_enabled: bool,
    pub is_paused: bool,
    pub revision: u64,
}
impl Default for QuestionSnapshot {
    fn default() -> Self {
        Self {
            questions: vec![],
            is_scanning: false,
            scan_error: String::new(),
            scan_notice: String::new(),
            settings_enabled: true,
            is_paused: false,
            revision: 0,
        }
    }
}
struct ScanState {
    view: QuestionSnapshot,
    generation: u64,
    cancellation: CancellationToken,
    seen: HashSet<String>,
    last_transcript: String,
    last_attempt: Instant,
}
impl Default for ScanState {
    fn default() -> Self {
        Self {
            view: Default::default(),
            generation: 0,
            cancellation: CancellationToken::new(),
            seen: HashSet::new(),
            last_transcript: String::new(),
            last_attempt: Instant::now(),
        }
    }
}
impl ScanState {
    fn reset(&mut self) {
        self.cancellation.cancel();
        self.cancellation = CancellationToken::new();
        self.view.questions.clear();
        self.view.is_scanning = false;
        self.view.scan_error.clear();
        self.view.scan_notice.clear();
        self.last_transcript.clear();
        self.seen.clear();
        self.last_attempt = Instant::now();
    }
    fn finish(&mut self, result: Result<Questions, String>, transcript: String, manual: bool) {
        self.view.is_scanning = false;
        match result {
            Err(error) => {
                self.view.scan_error = if error.contains("No OpenRouter API key") {
                    "Add an OpenRouter API key in Settings → AI Providers to detect questions."
                        .into()
                } else {
                    format!("Question scan failed: {error}")
                }
            }
            Ok(result) => {
                self.last_transcript = transcript;
                if result.questions.is_empty() {
                    self.view.scan_notice = "Scan complete. No actionable questions found.".into();
                    return;
                }
                let mut added = vec![];
                for mut question in result.questions {
                    let Some(text) = question.get("text").and_then(Value::as_str) else {
                        continue;
                    };
                    if text.trim().is_empty() || !self.seen.insert(text.trim().to_lowercase()) {
                        continue;
                    }
                    question["id"] = json!(uuid::Uuid::new_v4().to_string());
                    question["timestamp"] = json!(
                        std::time::SystemTime::now()
                            .duration_since(std::time::UNIX_EPOCH)
                            .unwrap_or_default()
                            .as_millis() as u64
                    );
                    question["speaker"] = json!(if question["speaker"] == "Me" {
                        "Me"
                    } else {
                        "Them"
                    });
                    if !question["type"].is_string() {
                        question["type"] = json!("question");
                    }
                    for field in ["intent", "prompt", "priority"] {
                        if !question[field].is_string() {
                            question.as_object_mut().unwrap().remove(field);
                        }
                    }
                    added.push(question);
                }
                if manual {
                    self.view.scan_notice = if added.is_empty() {
                        "Scan complete. No new suggestions.".into()
                    } else {
                        format!("Scan complete. {} new suggestions.", added.len())
                    };
                }
                added.append(&mut self.view.questions);
                self.view.questions = added;
            }
        }
    }
}

pub struct QuestionService {
    state: Mutex<ScanState>,
    assistant: Arc<AssistantService>,
    meetings: Arc<MeetingService>,
    settings: Arc<Mutex<SettingsStore>>,
    events: EventSink,
    shutdown: CancellationToken,
}
impl QuestionService {
    pub fn new(
        assistant: Arc<AssistantService>,
        meetings: Arc<MeetingService>,
        settings: Arc<Mutex<SettingsStore>>,
        events: EventSink,
    ) -> Arc<Self> {
        Arc::new(Self {
            state: Mutex::new(ScanState::default()),
            assistant,
            meetings,
            settings,
            events,
            shutdown: CancellationToken::new(),
        })
    }
    fn publish(&self, state: &mut ScanState) -> QuestionSnapshot {
        state.view.revision += 1;
        self.events.send(Event::Questions(json!(state.view)));
        state.view.clone()
    }
    pub fn snapshot(&self) -> Result<QuestionSnapshot, String> {
        let meeting = self.meetings.snapshot().map_err(|e| e.to_string())?;
        let enabled = self
            .settings
            .lock()
            .map_err(|e| e.to_string())?
            .values()
            .question_analysis_enabled
            .unwrap_or(true);
        let mut state = self.state.lock().map_err(|e| e.to_string())?;
        if state.generation != meeting.generation || state.view.settings_enabled != enabled {
            if state.generation != meeting.generation {
                state.view.is_paused = false;
            }
            state.reset();
            state.generation = meeting.generation;
            state.view.settings_enabled = enabled;
            self.publish(&mut state);
        }
        Ok(state.view.clone())
    }
    pub fn reset(&self) -> Result<QuestionSnapshot, String> {
        let mut state = self.state.lock().map_err(|e| e.to_string())?;
        state.reset();
        Ok(self.publish(&mut state))
    }
    pub fn set_paused(&self, paused: bool) -> Result<QuestionSnapshot, String> {
        let mut state = self.state.lock().map_err(|e| e.to_string())?;
        if state.view.is_paused != paused {
            state.reset();
            state.view.is_paused = paused;
        }
        Ok(self.publish(&mut state))
    }
    pub fn dismiss(&self, id: &str) -> Result<QuestionSnapshot, String> {
        let mut state = self.state.lock().map_err(|e| e.to_string())?;
        state.view.questions.retain(|q| q["id"] != id);
        Ok(self.publish(&mut state))
    }
    pub fn stop(&self) {
        self.shutdown.cancel();
        if let Ok(mut state) = self.state.lock() {
            state.reset();
        }
    }
    pub fn run(this: &Arc<Self>) {
        let weak = Arc::downgrade(this);
        // The desktop runtime starts this task; the service itself has no Tauri dependency.
        tokio::spawn(async move {
            loop {
                tokio::time::sleep(Duration::from_secs(1)).await;
                let Some(service) = weak.upgrade() else {
                    break;
                };
                if service.shutdown.is_cancelled() {
                    break;
                }
                if let Err(error) = service.snapshot() {
                    log::warn!("Question state: {error}");
                    continue;
                }
                let service = service.clone();
                tokio::spawn(async move {
                    if let Err(error) = service.scan(false).await {
                        log::warn!("Question scan: {error}");
                    }
                });
            }
        });
    }
    pub async fn scan(&self, manual: bool) -> Result<QuestionSnapshot, String> {
        self.scan_with(manual, |text| analyze_transcript(text, &self.assistant))
            .await
    }
    async fn scan_with<F, Fut>(&self, manual: bool, analyze: F) -> Result<QuestionSnapshot, String>
    where
        F: FnOnce(String) -> Fut,
        Fut: std::future::Future<Output = Result<Questions, String>>,
    {
        self.snapshot()?;
        let meeting = self.meetings.snapshot().map_err(|e| e.to_string())?;
        let settings = self
            .settings
            .lock()
            .map_err(|e| e.to_string())?
            .values()
            .clone();
        let transcript =
            meeting.scan_text(settings.question_analysis_window.unwrap_or(20).max(1) as usize);
        let cancellation = {
            let mut state = self.state.lock().map_err(|e| e.to_string())?;
            if state.view.is_scanning || self.shutdown.is_cancelled() {
                return Ok(state.view.clone());
            }
            if !manual
                && (!state.view.settings_enabled
                    || state.view.is_paused
                    || !meeting.active
                    || state.last_attempt.elapsed()
                        < Duration::from_secs(
                            settings.question_analysis_interval.unwrap_or(20).max(1) as u64,
                        )
                    || state.last_transcript == transcript)
            {
                return Ok(state.view.clone());
            }
            if transcript.trim().is_empty() {
                if manual {
                    state.view.scan_notice =
                        "Waiting for speech. Record a question, then scan again.".into();
                    self.publish(&mut state);
                }
                return Ok(state.view.clone());
            }
            state.last_attempt = Instant::now();
            state.view.is_scanning = true;
            state.view.scan_error.clear();
            state.view.scan_notice.clear();
            self.publish(&mut state);
            state.cancellation.clone()
        };
        let result = tokio::select! {
            biased;
            _ = cancellation.cancelled() => return self.snapshot(),
            _ = self.shutdown.cancelled() => return self.snapshot(),
            result = analyze(transcript.clone()) => result,
        };
        self.snapshot()?; // Invalidate a response if the meeting/settings changed during the request.
        let mut state = self.state.lock().map_err(|e| e.to_string())?;
        if !cancellation.is_cancelled() {
            state.finish(result, transcript, manual);
            self.publish(&mut state);
        }
        Ok(state.view.clone())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn scan_results_deduplicate_validate_retry_and_reset() {
        let mut state = ScanState::default();
        state.finish(Err("offline".into()), "Them: question".into(), true);
        assert!(state.last_transcript.is_empty());
        assert!(state.view.scan_error.contains("offline"));
        state.finish(
            Ok(Questions {
                questions: vec![
                    json!({"text":"What now?"}),
                    json!({"text":" WHAT NOW? "}),
                    json!({"text":" "}),
                    json!({"text":4}),
                ],
            }),
            "Them: question".into(),
            true,
        );
        assert_eq!(state.view.questions.len(), 1);
        assert_eq!(state.view.questions[0]["speaker"], "Them");
        assert_eq!(state.last_transcript, "Them: question");
        let token = state.cancellation.clone();
        state.reset();
        assert!(token.is_cancelled());
        assert!(state.view.questions.is_empty());
        assert!(!state.view.is_scanning);
        assert!(state.seen.is_empty());
    }
    fn service(h: &crate::meetings::service::tests::Harness) -> Arc<QuestionService> {
        let assistant = AssistantService::new(
            h.database.clone(),
            h.settings.clone(),
            h.credentials.clone(),
            h.meeting.clone(),
            h.intelligence.clone(),
            h.events.clone(),
        );
        QuestionService::new(
            assistant,
            h.meeting.clone(),
            h.settings.clone(),
            h.events.clone(),
        )
    }
    #[tokio::test]
    async fn empty_partial_window_retry_and_automatic_interval() {
        let h = crate::meetings::service::tests::Harness::new();
        let service = service(&h);
        let view = service
            .scan_with(true, |_| async { panic!("empty input called provider") })
            .await
            .unwrap();
        assert!(view.scan_notice.contains("Waiting for speech"));
        h.meeting.start(None).await.unwrap();
        h.settings
            .lock()
            .unwrap()
            .update(|s| {
                s.question_analysis_window = Some(2);
                s.question_analysis_interval = Some(2);
            })
            .unwrap();
        h.capture.speech("Old turn", true, "user");
        h.capture.speech("Recent question?", true, "interviewer");
        h.capture.speech("Partial reply", false, "user");
        service.snapshot().unwrap();
        service
            .scan_with(false, |_| async { panic!("scanned before interval") })
            .await
            .unwrap();
        service.state.lock().unwrap().last_attempt = Instant::now() - Duration::from_secs(3);
        let view = service
            .scan_with(false, |text| async move {
                assert_eq!(text, "Them: Recent question?\nMe: Partial reply");
                Err("No OpenRouter API key".into())
            })
            .await
            .unwrap();
        assert!(view.scan_error.starts_with("Add an OpenRouter"));
        service
            .scan_with(false, |_| async {
                panic!("failure retried before interval")
            })
            .await
            .unwrap();
        service.state.lock().unwrap().last_attempt = Instant::now() - Duration::from_secs(3);
        service
            .scan_with(false, |_| async { Ok(Questions { questions: vec![] }) })
            .await
            .unwrap();
        service.state.lock().unwrap().last_attempt = Instant::now() - Duration::from_secs(3);
        service
            .scan_with(false, |_| async {
                panic!("unchanged transcript scanned automatically")
            })
            .await
            .unwrap();
        service
            .scan_with(true, |_| async {
                Ok(Questions {
                    questions: vec![json!({"text":"Question?"})],
                })
            })
            .await
            .unwrap();
        assert_eq!(service.snapshot().unwrap().questions.len(), 1);
        h.meeting.discard().await.unwrap();
        service.snapshot().unwrap();
        assert!(service.snapshot().unwrap().questions.is_empty());
    }
    #[tokio::test]
    async fn pending_scan_single_flight_pause_cancellation_and_settings_reset() {
        let h = crate::meetings::service::tests::Harness::new();
        let service = service(&h);
        h.meeting.start(None).await.unwrap();
        h.capture.speech("Question?", true, "user");
        let worker = service.clone();
        let (entered, started) = tokio::sync::oneshot::channel();
        let task = tokio::spawn(async move {
            worker
                .scan_with(true, |_| async {
                    entered.send(()).unwrap();
                    std::future::pending::<Result<Questions, String>>().await
                })
                .await
                .unwrap()
        });
        started.await.unwrap();
        assert!(
            service
                .scan_with(true, |_| async { panic!("duplicate request") })
                .await
                .unwrap()
                .is_scanning
        );
        service.set_paused(true).unwrap();
        assert!(
            tokio::time::timeout(Duration::from_secs(1), task)
                .await
                .unwrap()
                .unwrap()
                .is_paused
        );
        service
            .scan_with(false, |_| async {
                panic!("paused automatic scan called provider")
            })
            .await
            .unwrap();
        service.set_paused(false).unwrap();
        service
            .scan_with(true, |_| async {
                Ok(Questions {
                    questions: vec![json!({"text":"Fresh"})],
                })
            })
            .await
            .unwrap();
        assert_eq!(service.snapshot().unwrap().questions.len(), 1);
        h.settings
            .lock()
            .unwrap()
            .update(|s| s.question_analysis_enabled = Some(false))
            .unwrap();
        let view = service.snapshot().unwrap();
        assert!(!view.settings_enabled);
        assert!(view.questions.is_empty());
        let manual = service
            .scan_with(true, |_| async {
                Ok(Questions {
                    questions: vec![json!({"text":"Manual override"})],
                })
            })
            .await
            .unwrap();
        assert_eq!(manual.questions.len(), 1);

        service
            .scan_with(false, |_| async {
                panic!("disabled automatic scan called provider")
            })
            .await
            .unwrap();
    }
    #[tokio::test]
    async fn generation_change_discards_response_even_without_polling_task() {
        let h = crate::meetings::service::tests::Harness::new();
        let service = service(&h);
        h.meeting.start(None).await.unwrap();
        h.capture.speech("Question?", true, "user");
        let view = service
            .scan_with(true, |_| async {
                h.meeting.discard().await.unwrap();
                h.meeting.start(None).await.unwrap();
                Ok(Questions {
                    questions: vec![json!({"text":"Stale"})],
                })
            })
            .await
            .unwrap();
        assert!(view.questions.is_empty());
        assert!(!view.is_scanning);
    }
    #[tokio::test]
    async fn background_worker_scans_without_any_frontend_listener() {
        let h = crate::meetings::service::tests::Harness::new();
        h.settings
            .lock()
            .unwrap()
            .update(|s| s.question_analysis_interval = Some(1))
            .unwrap();
        h.meeting.start(None).await.unwrap();
        h.capture.speech("Which database?", true, "user");
        let service = service(&h);
        service.snapshot().unwrap();
        QuestionService::run(&service);
        tokio::time::timeout(Duration::from_secs(5), async {
            loop {
                if !service.snapshot().unwrap().scan_error.is_empty() {
                    break;
                }
                tokio::time::sleep(Duration::from_millis(20)).await;
            }
        })
        .await
        .unwrap();
        assert!(
            service
                .snapshot()
                .unwrap()
                .scan_error
                .starts_with("Add an OpenRouter")
        );
        service.stop();
    }
}
