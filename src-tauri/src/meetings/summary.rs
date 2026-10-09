use crate::{
    assistant::openrouter::OpenRouter,
    database::{Database, MeetingRow},
    settings::CredentialService,
};
use anyhow::{Context, Result, anyhow, bail};
use serde::Serialize;
use serde_json::json;
use std::{
    collections::HashSet,
    sync::{Arc, Mutex},
};

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum SummaryStatus {
    Pending,
    Failed,
    Done,
}

#[derive(Default)]
pub struct SummaryService {
    pending: Arc<Mutex<HashSet<String>>>,
}

pub struct SummaryJob {
    id: String,
    transcript: String,
    revision: String,
    pending: Arc<Mutex<HashSet<String>>>,
}
impl Drop for SummaryJob {
    fn drop(&mut self) {
        if let Ok(mut pending) = self.pending.lock() {
            pending.remove(&self.id);
        }
    }
}

impl SummaryService {
    pub fn status(&self, meeting: &MeetingRow) -> Result<SummaryStatus> {
        // Match the original core API: saved summaries win; empty ones are retryable after restart.
        if meeting
            .summary
            .as_ref()
            .is_some_and(|text| !text.trim().is_empty())
        {
            return Ok(SummaryStatus::Done);
        }
        let pending = self
            .pending
            .lock()
            .map_err(|_| anyhow!("Summary lock poisoned"))?;
        Ok(if pending.contains(&meeting.id) {
            SummaryStatus::Pending
        } else {
            SummaryStatus::Failed
        })
    }

    pub fn prepare(&self, meeting: MeetingRow) -> Result<SummaryJob> {
        let transcript = meeting
            .transcript
            .filter(|text| !text.trim().is_empty())
            .context("Meeting has no transcript")?;
        let mut pending = self
            .pending
            .lock()
            .map_err(|_| anyhow!("Summary lock poisoned"))?;
        if !pending.insert(meeting.id.clone()) {
            bail!("Summary generation already running");
        }
        Ok(SummaryJob {
            id: meeting.id,
            transcript,
            revision: meeting.updated_at,
            pending: self.pending.clone(),
        })
    }
}

impl SummaryJob {
    pub async fn generate(
        self,
        llm: OpenRouter,
        credentials: CredentialService,
        database: Arc<Mutex<Database>>,
    ) -> Result<()> {
        let credentials = tokio::task::spawn_blocking(move || credentials.load()).await??;
        let title_prompt = include_str!("../../resources/prompts/title.md").replace(
            "{{transcript}}",
            &self.transcript.chars().take(2000).collect::<String>(),
        );
        let title = llm
            .complete(
                &credentials,
                vec![json!({"role":"user", "content":title_prompt})],
            )
            .await?;
        let prompt = include_str!("../../resources/prompts/summary.md")
            .replace("{{transcript}}", &self.transcript);
        let summary = llm
            .complete(&credentials, vec![json!({"role":"user", "content":prompt})])
            .await?;
        database
            .lock()
            .map_err(|_| anyhow!("Database lock poisoned"))?
            .save_generated_summary(&self.id, &self.revision, &clean_title(&title), &summary)?;
        Ok(())
    }
}

fn clean_title(text: &str) -> String {
    text.trim()
        .trim_matches(['\"', '\''])
        .trim()
        .chars()
        .take(80)
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn blank_transcripts_do_not_claim_a_pending_job_and_saved_summary_wins() {
        let (_directory, database) = database();
        let service = SummaryService::default();
        let mut row = database.get_meeting("one").unwrap();
        row.transcript = Some(" ".into());
        assert!(service.prepare(row).is_err());
        let job = service
            .prepare(database.get_meeting("one").unwrap())
            .unwrap();
        database
            .update_meeting_summary("one", "Manually written summary")
            .unwrap();
        assert_eq!(
            service
                .status(&database.get_meeting("one").unwrap())
                .unwrap(),
            SummaryStatus::Done
        );
        drop(job);
    }

    #[test]
    fn dropping_one_job_does_not_release_another_meetings_job() {
        let (_directory, database) = database();
        database
            .create_meeting("two", "Them: Another question")
            .unwrap();
        let service = SummaryService::default();
        let first = service
            .prepare(database.get_meeting("one").unwrap())
            .unwrap();
        let second = service
            .prepare(database.get_meeting("two").unwrap())
            .unwrap();
        drop(first);
        assert_eq!(
            service
                .status(&database.get_meeting("one").unwrap())
                .unwrap(),
            SummaryStatus::Failed
        );
        assert_eq!(
            service
                .status(&database.get_meeting("two").unwrap())
                .unwrap(),
            SummaryStatus::Pending
        );
        drop(second);
    }

    fn database() -> (tempfile::TempDir, Database) {
        let directory = tempfile::tempdir().unwrap();
        let database = Database::open(&directory.path().join("test.db")).unwrap();
        database
            .create_meeting("one", "Me: Budget meeting")
            .unwrap();
        (directory, database)
    }
    #[test]
    fn status_retry_and_drop_match_original_core() {
        let (_directory, database) = database();
        let service = SummaryService::default();
        assert_eq!(
            service
                .status(&database.get_meeting("one").unwrap())
                .unwrap(),
            SummaryStatus::Failed
        );
        let job = service
            .prepare(database.get_meeting("one").unwrap())
            .unwrap();
        assert_eq!(
            service
                .status(&database.get_meeting("one").unwrap())
                .unwrap(),
            SummaryStatus::Pending
        );
        assert!(
            service
                .prepare(database.get_meeting("one").unwrap())
                .is_err()
        );
        drop(job);
        assert_eq!(
            service
                .status(&database.get_meeting("one").unwrap())
                .unwrap(),
            SummaryStatus::Failed
        );
        let job = service
            .prepare(database.get_meeting("one").unwrap())
            .unwrap();
        database
            .save_generated_summary("one", &job.revision, "Budget", "Discussed spending.")
            .unwrap();
        drop(job);
        assert_eq!(
            service
                .status(&database.get_meeting("one").unwrap())
                .unwrap(),
            SummaryStatus::Done
        );
    }
    #[test]
    fn stale_generation_cannot_overwrite_edits_or_resurrect_deleted_meetings() {
        let (_directory, database) = database();
        let revision = database.get_meeting("one").unwrap().updated_at;
        database.update_meeting_title("one", "User title").unwrap();
        assert!(
            database
                .save_generated_summary("one", &revision, "AI title", "AI summary")
                .is_err()
        );
        assert_eq!(
            database.get_meeting("one").unwrap().title.as_deref(),
            Some("User title")
        );
        database.delete_meeting("one").unwrap();
        assert!(
            database
                .save_generated_summary("one", &revision, "AI title", "AI summary")
                .is_err()
        );
    }
    #[test]
    fn strips_quotes_and_bounds_unicode_titles() {
        assert_eq!(clean_title("  \"Budget review\"  "), "Budget review");
        assert_eq!(clean_title(&"é".repeat(90)).chars().count(), 80);
    }
}
