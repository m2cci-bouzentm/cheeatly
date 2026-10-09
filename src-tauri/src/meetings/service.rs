use super::{
    models::{MeetingSnapshot, TranscriptTurn},
    summary::SummaryService,
};
use crate::{
    assistant::{intelligence::Intelligence, openrouter::OpenRouter},
    database::Database,
    events::{Event, EventSink},
    settings::{CredentialService, SettingsStore},
    transcription::{
        provider::{AudioSource, TranscriptEvent, TranscriptionConfig},
        service::Capture,
    },
};
use anyhow::{Result, anyhow, ensure};
use serde_json::Value;
use std::sync::{Arc, Mutex};

pub struct MeetingService {
    session: Mutex<MeetingSnapshot>,
    lifecycle: tokio::sync::Mutex<()>,
    capture: Arc<dyn Capture>,
    database: Arc<Mutex<Database>>,
    settings: Arc<Mutex<SettingsStore>>,
    credentials: CredentialService,
    intelligence: Arc<Intelligence>,
    summaries: SummaryService,
    llm: OpenRouter,
    events: EventSink,
}
impl MeetingService {
    pub fn new(
        database: Arc<Mutex<Database>>,
        settings: Arc<Mutex<SettingsStore>>,
        credentials: CredentialService,
        capture: Arc<dyn Capture>,
        intelligence: Arc<Intelligence>,
        events: EventSink,
    ) -> Arc<Self> {
        Arc::new(Self {
            session: Mutex::new(MeetingSnapshot::default()),
            lifecycle: tokio::sync::Mutex::new(()),
            capture,
            database,
            settings,
            credentials,
            intelligence,
            summaries: Default::default(),
            llm: OpenRouter::new(),
            events,
        })
    }
    pub fn snapshot(&self) -> Result<MeetingSnapshot> {
        Ok(self
            .session
            .lock()
            .map_err(|_| anyhow!("Meeting lock poisoned"))?
            .clone())
    }
    pub async fn start(self: &Arc<Self>, metadata: Option<Value>) -> Result<()> {
        let _guard = self.lifecycle.lock().await;
        ensure!(!self.snapshot()?.active, "A meeting is already active");
        let credentials = self.credentials.load_async().await?;
        let provider = credentials
            .stt_provider
            .as_deref()
            .unwrap_or("local-parakeet");
        ensure!(
            matches!(provider, "none" | "local-parakeet"),
            "Unsupported STT provider"
        );
        let settings = self
            .settings
            .lock()
            .map_err(|_| anyhow!("Settings lock poisoned"))?
            .values()
            .clone();
        self.capture
            .set_muted("mic", settings.mic_muted.unwrap_or(false))?;
        self.capture
            .set_muted("system", settings.system_muted.unwrap_or(false))?;
        self.intelligence.reset()?;
        let generation = {
            let mut session = self
                .session
                .lock()
                .map_err(|_| anyhow!("Meeting lock poisoned"))?;
            let generation = session.generation.wrapping_add(1);
            *session = MeetingSnapshot {
                generation,
                ..Default::default()
            };
            generation
        };
        if provider != "none" {
            let input = metadata
                .as_ref()
                .and_then(|m| m.pointer("/audio/inputDeviceId"))
                .and_then(Value::as_str)
                .map(str::to_owned);
            let output = metadata
                .as_ref()
                .and_then(|m| m.pointer("/audio/outputDeviceId"))
                .and_then(Value::as_str)
                .map(str::to_owned);
            let config = TranscriptionConfig {
                model: settings
                    .parakeet_model
                    .unwrap_or_else(|| "parakeet-tdt-0.6b-v3".into()),
                language: settings.parakeet_language.unwrap_or_else(|| "auto".into()),
                source: AudioSource::Microphone,
            };
            let weak = Arc::downgrade(self);
            let handler = Arc::new(move |event| {
                if let Some(service) = weak.upgrade() {
                    service.record(generation, event);
                }
            });
            let capture = self.capture.clone();
            let result =
                tokio::task::spawn_blocking(move || capture.start(input, output, config, handler))
                    .await?;
            if let Err(error) = result {
                let capture = self.capture.clone();
                let _ = tokio::task::spawn_blocking(move || capture.stop()).await;
                self.clear()?;
                return Err(error);
            }
        }
        self.session
            .lock()
            .map_err(|_| anyhow!("Meeting lock poisoned"))?
            .active = true;
        self.events.send(Event::MeetingState(true));
        Ok(())
    }
    fn record(&self, generation: u64, event: TranscriptEvent) {
        let Ok(mut session) = self.session.lock() else {
            return;
        };
        if session.generation != generation {
            return;
        }
        let (speaker, index) = if event.speaker == "user" {
            ("Me", 0)
        } else {
            ("Them", 1)
        };
        if event.final_result {
            session.partials[index] = None;
            if let Some(last) = session
                .transcript
                .last_mut()
                .filter(|turn| turn.speaker == speaker)
            {
                if last.text != event.text {
                    last.text.push(' ');
                    last.text.push_str(&event.text);
                }
            } else {
                session.transcript.push(TranscriptTurn {
                    speaker: speaker.into(),
                    text: event.text.clone(),
                });
            }
        } else {
            session.partials[index] = Some(event.text.clone());
        }
        drop(session);
        self.events.send(Event::Transcript(event));
    }
    fn clear(&self) -> Result<()> {
        let mut session = self
            .session
            .lock()
            .map_err(|_| anyhow!("Meeting lock poisoned"))?;
        let generation = session.generation.wrapping_add(1);
        *session = MeetingSnapshot {
            generation,
            ..Default::default()
        };
        Ok(())
    }
    async fn drain(&self) -> Result<()> {
        let capture = self.capture.clone();
        if let Err(error) = tokio::task::spawn_blocking(move || capture.stop()).await? {
            log::warn!("Transcription drain: {error}");
        }
        Ok(())
    }
    fn reset_mutes(&self) -> Result<()> {
        self.settings
            .lock()
            .map_err(|_| anyhow!("Settings lock poisoned"))?
            .update(|s| {
                s.mic_muted = Some(false);
                s.system_muted = Some(false);
            })?;
        self.capture.set_muted("mic", false)?;
        self.capture.set_muted("system", false)?;
        Ok(())
    }
    pub async fn discard(&self) -> Result<()> {
        let _guard = self.lifecycle.lock().await;
        self.drain().await?;
        self.intelligence.reset()?;
        self.reset_mutes()?;
        self.clear()?;
        self.events.send(Event::MeetingState(false));
        self.events.send(Event::SessionReset);
        Ok(())
    }
    pub async fn end(&self) -> Result<()> {
        let _guard = self.lifecycle.lock().await;
        if !self.snapshot()?.active {
            return Ok(());
        }
        self.drain().await?;
        let snapshot = self.snapshot()?;
        self.events
            .send(Event::DialogueDrained(snapshot.transcript.clone()));
        let transcript = snapshot
            .transcript
            .iter()
            .map(|turn| format!("{}: {}", turn.speaker, turn.text))
            .collect::<Vec<_>>()
            .join("\n");
        if !transcript.is_empty() {
            let id = uuid::Uuid::new_v4().to_string();
            // Retain active state and transcript until persistence succeeds, allowing retry.
            self.database
                .lock()
                .map_err(|_| anyhow!("Database lock poisoned"))?
                .create_meeting(&id, &transcript)?;
            if let Err(error) = self.queue_summary(&id) {
                log::warn!("Summary queue: {error}");
            }
        }
        self.clear()?;
        self.intelligence.reset()?;
        self.events.send(Event::MeetingState(false));
        self.reset_mutes()?;
        self.events.send(Event::SessionReset);
        Ok(())
    }
    pub fn list(&self) -> Result<Vec<Value>> {
        self.database
            .lock()
            .map_err(|_| anyhow!("Database lock poisoned"))?
            .list_meetings()?
            .into_iter()
            .map(|row| {
                let status = self.summaries.status(&row)?;
                Ok(super::models::map_meeting(row, status))
            })
            .collect()
    }
    pub fn details(&self, id: &str) -> Result<Value> {
        let row = self
            .database
            .lock()
            .map_err(|_| anyhow!("Database lock poisoned"))?
            .get_meeting(id)?;
        let status = self.summaries.status(&row)?;
        Ok(super::models::map_meeting(row, status))
    }
    pub fn update_title(&self, id: &str, title: &str) -> Result<()> {
        self.database
            .lock()
            .map_err(|_| anyhow!("Database lock poisoned"))?
            .update_meeting_title(id, title)?;
        self.events.send(Event::MeetingsUpdated);
        Ok(())
    }
    pub fn update_summary(&self, id: &str, summary: &str) -> Result<()> {
        self.database
            .lock()
            .map_err(|_| anyhow!("Database lock poisoned"))?
            .update_meeting_summary(id, summary)?;
        self.events.send(Event::MeetingsUpdated);
        Ok(())
    }
    pub fn delete(&self, id: &str) -> Result<()> {
        self.database
            .lock()
            .map_err(|_| anyhow!("Database lock poisoned"))?
            .delete_meeting(id)?;
        self.events.send(Event::MeetingsUpdated);
        Ok(())
    }
    pub fn queue_summary(&self, id: &str) -> Result<()> {
        let row = self
            .database
            .lock()
            .map_err(|_| anyhow!("Database lock poisoned"))?
            .get_meeting(id)?;
        let job = self.summaries.prepare(row)?;
        self.events.send(Event::MeetingsUpdated);
        let (database, llm, credentials, events) = (
            self.database.clone(),
            self.llm.clone(),
            self.credentials.clone(),
            self.events.clone(),
        );
        tokio::spawn(async move {
            if let Err(error) = job.generate(llm, credentials, database).await {
                log::warn!("Meeting summary generation failed: {error}");
            }
            events.send(Event::MeetingsUpdated);
        });
        Ok(())
    }
}

#[cfg(test)]
pub(crate) mod tests {
    use super::*;
    use crate::{settings::StoredCredentials, transcription::TranscriptHandler};
    use std::sync::atomic::{AtomicBool, Ordering};
    #[derive(Default)]
    pub struct FakeCapture {
        pub handler: Mutex<Option<TranscriptHandler>>,
        active: AtomicBool,
        fail: AtomicBool,
        final_on_stop: Mutex<Option<String>>,
    }
    impl FakeCapture {
        pub fn speech(&self, text: &str, final_result: bool, speaker: &'static str) {
            if let Some(handler) = self.handler.lock().unwrap().clone() {
                handler(TranscriptEvent {
                    speaker,
                    text: text.into(),
                    final_result,
                });
            }
        }
    }
    impl Capture for FakeCapture {
        fn start(
            &self,
            _: Option<String>,
            _: Option<String>,
            _: TranscriptionConfig,
            handler: TranscriptHandler,
        ) -> Result<()> {
            *self.handler.lock().unwrap() = Some(handler);
            ensure!(!self.fail.load(Ordering::Relaxed), "capture failed");
            self.active.store(true, Ordering::Relaxed);
            Ok(())
        }
        fn stop(&self) -> Result<()> {
            self.active.store(false, Ordering::Relaxed);
            if let Some(text) = self.final_on_stop.lock().unwrap().take() {
                self.speech(&text, true, "interviewer");
            }
            Ok(())
        }
        fn active(&self) -> bool {
            self.active.load(Ordering::Relaxed)
        }
        fn set_muted(&self, _: &str, _: bool) -> Result<()> {
            Ok(())
        }
    }
    pub struct Harness {
        pub meeting: Arc<MeetingService>,
        pub capture: Arc<FakeCapture>,
        pub database: Arc<Mutex<Database>>,
        pub settings: Arc<Mutex<SettingsStore>>,
        pub credentials: CredentialService,
        pub intelligence: Arc<Intelligence>,
        pub events: EventSink,
        _directory: tempfile::TempDir,
    }
    impl Harness {
        pub fn new() -> Self {
            let directory = tempfile::tempdir().unwrap();
            let database = Arc::new(Mutex::new(
                Database::open(&directory.path().join("test.db")).unwrap(),
            ));
            let settings = Arc::new(Mutex::new(
                SettingsStore::load(directory.path().join("settings.json")).unwrap(),
            ));
            let credentials = CredentialService::in_memory(StoredCredentials::default());
            let intelligence = Arc::new(Intelligence::default());
            let events = EventSink::new(|_| {});
            let capture = Arc::new(FakeCapture::default());
            let meeting = MeetingService::new(
                database.clone(),
                settings.clone(),
                credentials.clone(),
                capture.clone(),
                intelligence.clone(),
                events.clone(),
            );
            Self {
                meeting,
                capture,
                database,
                settings,
                credentials,
                intelligence,
                events,
                _directory: directory,
            }
        }
    }
    #[tokio::test]
    async fn stop_drains_final_speech_and_saves_once() {
        let h = Harness::new();
        h.meeting.start(None).await.unwrap();
        assert!(h.meeting.start(None).await.is_err());
        h.capture.speech("First", true, "user");
        *h.capture.final_on_stop.lock().unwrap() = Some("Final words".into());
        let (a, b) = tokio::join!(h.meeting.end(), h.meeting.end());
        a.unwrap();
        b.unwrap();
        let rows = h.database.lock().unwrap().list_meetings().unwrap();
        assert_eq!(rows.len(), 1);
        assert_eq!(
            rows[0].transcript.as_deref(),
            Some("Me: First\nThem: Final words")
        );
        assert!(!h.meeting.snapshot().unwrap().active);
        assert!(!h.capture.active());
    }
    #[tokio::test]
    async fn failed_capture_cleans_up_and_old_callbacks_cannot_mutate_next_session() {
        let h = Harness::new();
        h.capture.fail.store(true, Ordering::Relaxed);
        assert!(h.meeting.start(None).await.is_err());
        assert!(!h.meeting.snapshot().unwrap().active);
        let stale = h.capture.handler.lock().unwrap().clone().unwrap();
        h.capture.fail.store(false, Ordering::Relaxed);
        h.meeting.start(None).await.unwrap();
        stale(TranscriptEvent {
            speaker: "user",
            text: "stale".into(),
            final_result: true,
        });
        assert!(h.meeting.snapshot().unwrap().transcript.is_empty());
        h.capture.speech("Discard this", true, "user");
        h.meeting.discard().await.unwrap();
        assert!(
            h.database
                .lock()
                .unwrap()
                .list_meetings()
                .unwrap()
                .is_empty()
        );
        assert!(h.meeting.snapshot().unwrap().transcript.is_empty());
    }
    #[tokio::test]
    async fn failed_save_retains_transcript_for_retry() {
        let h = Harness::new();
        h.meeting.start(None).await.unwrap();
        h.capture.speech("Keep this", true, "user");
        h.database.lock().unwrap().read_only_for_test(true);
        assert!(h.meeting.end().await.is_err());
        assert!(h.meeting.snapshot().unwrap().active);
        assert_eq!(
            h.meeting.snapshot().unwrap().transcript[0].text,
            "Keep this"
        );
        h.database.lock().unwrap().read_only_for_test(false);
        h.meeting.end().await.unwrap();
        h.meeting.end().await.unwrap();
        assert_eq!(h.database.lock().unwrap().list_meetings().unwrap().len(), 1);
    }
}
