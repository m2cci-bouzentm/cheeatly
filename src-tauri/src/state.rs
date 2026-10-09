//! Desktop composition root. Workflow state lives in its owning service.
use crate::{
    assistant::{
        intelligence::Intelligence, questions::QuestionService, service::AssistantService,
    },
    database::Database,
    events::EventSink,
    meetings::service::MeetingService,
    settings::{CredentialService, SettingsStore},
    shortcuts::ShortcutStore,
    transcription::{
        AudioTestSession,
        service::{Capture, TranscriptionService},
    },
};
use std::sync::{Arc, Mutex};

pub struct AppState {
    pub shutting_down: std::sync::atomic::AtomicBool,
    pub database: Arc<Mutex<Database>>,
    pub settings: Arc<Mutex<SettingsStore>>,
    pub credentials: CredentialService,
    pub transcription: Arc<dyn Capture>,
    pub meetings: Arc<MeetingService>,
    pub assistant: Arc<AssistantService>,
    pub questions: Arc<QuestionService>,
    pub shortcuts: ShortcutStore,
    pub audio_test: AudioTestSession,
    pub stealth: crate::stealth::StealthInput,
}
impl AppState {
    pub fn new(
        database: Database,
        settings: SettingsStore,
        credentials: CredentialService,
        shortcuts: ShortcutStore,
        binary: std::path::PathBuf,
        events: EventSink,
    ) -> Self {
        let database = Arc::new(Mutex::new(database));
        let settings = Arc::new(Mutex::new(settings));
        let transcription = TranscriptionService::new(binary, events.clone());
        let intelligence = Arc::new(Intelligence::default());
        let meetings = MeetingService::new(
            database.clone(),
            settings.clone(),
            credentials.clone(),
            transcription.clone(),
            intelligence.clone(),
            events.clone(),
        );
        let assistant = AssistantService::new(
            database.clone(),
            settings.clone(),
            credentials.clone(),
            meetings.clone(),
            intelligence,
            events.clone(),
        );
        let questions = QuestionService::new(
            assistant.clone(),
            meetings.clone(),
            settings.clone(),
            events,
        );
        Self {
            shutting_down: Default::default(),
            database,
            settings,
            credentials,
            transcription,
            meetings,
            assistant,
            questions,
            shortcuts,
            audio_test: AudioTestSession::new(),
            stealth: Default::default(),
        }
    }
}
