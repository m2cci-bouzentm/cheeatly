use std::sync::{Arc, Mutex};

use crate::{
    database::Database,
    settings::{CredentialService, SettingsStore},
    transcription::TranscriptionSession,
};

#[derive(Clone)]
pub struct AppState {
    pub database: Arc<Mutex<Database>>,
    pub settings: Arc<Mutex<SettingsStore>>,
    pub meeting: Arc<Mutex<MeetingState>>,
    pub credentials: CredentialService,
    pub transcription: TranscriptionSession,
}

#[derive(Default)]
pub struct MeetingState {
    pub active: bool,
    pub transcript: Vec<TranscriptTurn>,
}

#[derive(Clone)]
pub struct TranscriptTurn {
    pub speaker: String,
    pub text: String,
}

impl AppState {
    pub fn new(
        database: Database,
        settings: SettingsStore,
        credentials: CredentialService,
    ) -> Self {
        Self {
            database: Arc::new(Mutex::new(database)),
            settings: Arc::new(Mutex::new(settings)),
            meeting: Arc::new(Mutex::new(MeetingState::default())),
            credentials,
            transcription: TranscriptionSession::new(),
        }
    }
}
