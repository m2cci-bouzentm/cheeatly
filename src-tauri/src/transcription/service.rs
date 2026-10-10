//! Blocking capture boundary. The native worker and test capture implement it.
use super::{TranscriptHandler, TranscriptionSession, provider::TranscriptionConfig};
use crate::events::EventSink;
use std::{path::PathBuf, sync::Arc};

pub trait Capture: Send + Sync {
    fn start(
        &self,
        input: Option<String>,
        output: Option<String>,
        config: TranscriptionConfig,
        transcript: TranscriptHandler,
    ) -> anyhow::Result<()>;
    fn stop(&self) -> anyhow::Result<()>;
    fn active(&self) -> bool;
    fn set_muted(&self, channel: &str, muted: bool) -> anyhow::Result<()>;
}

pub struct TranscriptionService {
    session: TranscriptionSession,
    binary: PathBuf,
    events: EventSink,
}
impl TranscriptionService {
    pub fn new(binary: PathBuf, events: EventSink) -> Arc<Self> {
        Arc::new(Self {
            session: TranscriptionSession::new(),
            binary,
            events,
        })
    }
}
impl Capture for TranscriptionService {
    fn start(
        &self,
        input: Option<String>,
        output: Option<String>,
        config: TranscriptionConfig,
        transcript: TranscriptHandler,
    ) -> anyhow::Result<()> {
        self.session.start_local(
            self.binary.clone(),
            self.events.clone(),
            input,
            output,
            config,
            transcript,
        )
    }
    fn stop(&self) -> anyhow::Result<()> {
        self.session.stop()
    }
    fn active(&self) -> bool {
        self.session.active()
    }
    fn set_muted(&self, channel: &str, muted: bool) -> anyhow::Result<()> {
        self.session.set_muted(channel, muted)
    }
}
