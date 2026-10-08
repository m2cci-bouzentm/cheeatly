use std::sync::{Arc, Mutex};

use crate::{
    database::Database,
    settings::{CredentialService, SettingsStore},
    shortcuts::ShortcutStore,
    transcription::{AudioTestSession, TranscriptionSession},
};

pub struct AppState {
    pub database: Arc<Mutex<Database>>,
    pub settings: Arc<Mutex<SettingsStore>>,
    pub meeting: Arc<Mutex<MeetingState>>,
    pub credentials: CredentialService,
    pub transcription: TranscriptionSession,
    pub shortcuts: ShortcutStore,
    pub audio_test: AudioTestSession,
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
        shortcuts: ShortcutStore,
    ) -> Self {
        Self {
            database: Arc::new(Mutex::new(database)),
            settings: Arc::new(Mutex::new(settings)),
            meeting: Arc::new(Mutex::new(MeetingState::default())),
            credentials,
            transcription: TranscriptionSession::new(),
            shortcuts,
            audio_test: AudioTestSession::new(),
        }
    }
}
