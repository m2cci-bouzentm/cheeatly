use anyhow::{Result, anyhow, bail};
use serde::Serialize;
use std::{collections::HashMap, sync::Mutex};
use tokio_util::sync::CancellationToken;

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct IntelligenceSnapshot {
    pub context: String,
    pub last_assistant_message: Option<String>,
    pub active_mode: String,
}

impl Default for IntelligenceSnapshot {
    fn default() -> Self {
        Self {
            context: String::new(),
            last_assistant_message: None,
            active_mode: "default".into(),
        }
    }
}

#[derive(Default)]
struct Session {
    snapshot: IntelligenceSnapshot,
    generation: u64,
    latest_request: Option<String>,
    requests: HashMap<String, CancellationToken>,
}

#[derive(Default)]
pub struct Intelligence {
    session: Mutex<Session>,
}

impl Intelligence {
    pub fn begin(&self, id: &str, context: String) -> Result<(u64, CancellationToken)> {
        let mut session = self
            .session
            .lock()
            .map_err(|_| anyhow!("Intelligence lock poisoned"))?;
        if session.requests.contains_key(id) {
            bail!("Chat stream already active");
        }
        let token = CancellationToken::new();
        session.requests.insert(id.to_owned(), token.clone());
        session.latest_request = Some(id.to_owned());
        session.snapshot.context = context;
        session.snapshot.active_mode = "default".into();
        Ok((session.generation, token))
    }

    pub fn finish(&self, id: &str, generation: u64, answer: Option<String>) -> Result<()> {
        let mut session = self
            .session
            .lock()
            .map_err(|_| anyhow!("Intelligence lock poisoned"))?;
        if session.generation != generation {
            return Ok(());
        }
        let token = session.requests.remove(id);
        if session.latest_request.as_deref() == Some(id)
            && token.is_some_and(|token| !token.is_cancelled())
            && let Some(answer) = answer
        {
            session.snapshot.last_assistant_message = Some(answer);
        }
        Ok(())
    }

    pub fn abort(&self, id: &str) -> Result<()> {
        let session = self
            .session
            .lock()
            .map_err(|_| anyhow!("Intelligence lock poisoned"))?;
        if let Some(token) = session.requests.get(id) {
            token.cancel();
        }
        Ok(())
    }

    pub fn snapshot(&self) -> Result<IntelligenceSnapshot> {
        Ok(self
            .session
            .lock()
            .map_err(|_| anyhow!("Intelligence lock poisoned"))?
            .snapshot
            .clone())
    }

    pub fn reset(&self) -> Result<()> {
        let mut session = self
            .session
            .lock()
            .map_err(|_| anyhow!("Intelligence lock poisoned"))?;
        for (_, token) in session.requests.drain() {
            token.cancel();
        }
        session.generation = session.generation.wrapping_add(1);
        session.latest_request = None;
        session.snapshot = IntelligenceSnapshot {
            active_mode: "default".into(),
            ..Default::default()
        };
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn context_roundtrip_and_reset_cancel_inflight_work() {
        let state = Intelligence::default();
        let (generation, token) = state
            .begin("one", "LIVE MEETING TRANSCRIPT: Hello".into())
            .unwrap();
        state
            .finish("one", generation, Some("Reply".into()))
            .unwrap();
        assert_eq!(
            state.snapshot().unwrap().last_assistant_message.as_deref(),
            Some("Reply")
        );
        assert!(!token.is_cancelled());
        let (generation, token) = state.begin("two", "new context".into()).unwrap();
        state.reset().unwrap();
        assert!(token.is_cancelled());
        state
            .finish("two", generation, Some("stale reply".into()))
            .unwrap();
        assert!(state.snapshot().unwrap().context.is_empty());
        assert!(state.snapshot().unwrap().last_assistant_message.is_none());
    }
    #[test]
    fn duplicate_ids_and_cancelled_answers_cannot_overwrite_state() {
        let state = Intelligence::default();
        let (generation, token) = state.begin("one", "context".into()).unwrap();
        assert!(state.begin("one", "other".into()).is_err());
        state.abort("one").unwrap();
        assert!(token.is_cancelled());
        state
            .finish("one", generation, Some("cancelled reply".into()))
            .unwrap();
        assert!(state.snapshot().unwrap().last_assistant_message.is_none());
    }
}
