use std::sync::{Arc, Mutex};

use crate::{repositories::Database, services::SettingsService};

#[derive(Clone)]
pub struct AppState {
    pub database: Arc<Mutex<Database>>,
    pub settings: Arc<Mutex<SettingsService>>,
    pub meeting: Arc<Mutex<MeetingState>>,
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
    pub fn new(database: Database, settings: SettingsService) -> Self {
        Self {
            database: Arc::new(Mutex::new(database)),
            settings: Arc::new(Mutex::new(settings)),
            meeting: Arc::new(Mutex::new(MeetingState::default())),
        }
    }
}
