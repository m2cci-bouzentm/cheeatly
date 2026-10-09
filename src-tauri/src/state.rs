use std::sync::{Arc, Mutex};

use crate::{
    database::Database,
    settings::{CredentialService, SettingsStore},
    shortcuts::ShortcutStore,
    transcription::{AudioTestSession, TranscriptionSession},
};

pub struct AppState {
    pub shutting_down: std::sync::atomic::AtomicBool,
    pub database: Arc<Mutex<Database>>,
    pub settings: Arc<Mutex<SettingsStore>>,
    pub meeting: Arc<Mutex<MeetingState>>,
    pub meeting_lifecycle: tokio::sync::Mutex<()>,
    pub credentials: CredentialService,
    pub transcription: TranscriptionSession,
    pub shortcuts: ShortcutStore,
    pub audio_test: AudioTestSession,
    pub intelligence: crate::assistant::intelligence::Intelligence,
    pub summaries: crate::meetings::summary::SummaryService,
    pub stealth: crate::stealth::StealthInput,
    pub llm: crate::assistant::openrouter::OpenRouter,
}

#[derive(Default)]
pub struct MeetingState {
    pub active: bool,
    pub transcript: Vec<TranscriptTurn>,
}

#[derive(Clone, serde::Serialize)]
pub struct TranscriptTurn {
    pub speaker: String,
    pub text: String,
}

impl AppState {
    pub fn new(
        database: Database,
        settings: SettingsStore,
        credentials: CredentialService,
        shortcuts: ShortcutStore,
    ) -> Self {
        Self {
            shutting_down: std::sync::atomic::AtomicBool::new(false),
            database: Arc::new(Mutex::new(database)),
            settings: Arc::new(Mutex::new(settings)),
            meeting: Arc::new(Mutex::new(MeetingState::default())),
            meeting_lifecycle: tokio::sync::Mutex::new(()),
            credentials,
            transcription: TranscriptionSession::new(),
            shortcuts,
            audio_test: AudioTestSession::new(),
            intelligence: Default::default(),
            summaries: Default::default(),
            stealth: Default::default(),
            llm: crate::assistant::openrouter::OpenRouter::new(),
        }
    }
}
