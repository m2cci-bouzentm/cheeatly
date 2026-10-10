use serde_json::{Value, json};
#[derive(Clone, Debug, serde::Serialize, PartialEq, Eq)]
pub struct TranscriptTurn {
    pub speaker: String,
    pub text: String,
}

#[derive(Clone, Default)]
pub struct MeetingSnapshot {
    pub active: bool,
    pub generation: u64,
    pub transcript: Vec<TranscriptTurn>,
    pub partials: [Option<String>; 2],
    pub started_at_ms: Option<i64>,
}
impl MeetingSnapshot {
    pub fn scan_text(&self, window: usize) -> String {
        let mut turns = self.transcript.clone();
        for (index, speaker) in ["Me", "Them"].into_iter().enumerate() {
            if let Some(text) = self.partials[index]
                .as_ref()
                .filter(|text| !text.trim().is_empty())
            {
                turns.push(TranscriptTurn {
                    speaker: speaker.into(),
                    text: text.clone(),
                });
            }
        }
        turns
            .iter()
            .skip(turns.len().saturating_sub(window))
            .map(|turn| format!("{}: {}", turn.speaker, turn.text))
            .collect::<Vec<_>>()
            .join("\n")
    }
}

pub fn map_meeting(
    row: crate::database::MeetingRow,
    summary_status: super::summary::SummaryStatus,
) -> Value {
    let transcript = row
        .transcript
        .unwrap_or_default()
        .lines()
        .enumerate()
        .map(|(index, line)| {
            let (speaker, text) = line.split_once(':').unwrap_or(("Unknown", line));
            let speaker = match speaker.trim() {
                "Me" => "user",
                "Them" => "interviewer",
                value => value,
            };
            json!({ "speaker": speaker, "text": text.trim(), "timestamp": index })
        })
        .collect::<Vec<_>>();
    let summary = row.summary.unwrap_or_default();
    json!({
        "id": row.id,
        "title": row.title.unwrap_or_else(|| "Untitled Session".into()),
        "summaryStatus": summary_status,
        "date": row.created_at,
        "duration": "0:00",
        "summary": summary,
        "detailedSummary": { "overview": summary, "actionItems": [], "keyPoints": [] },
        "transcript": transcript
    })
}

#[cfg(test)]
mod contract_tests {
    use super::*;

    #[test]
    fn saved_meetings_keep_the_frontend_response_shape_and_speaker_mapping() {
        let directory = tempfile::tempdir().unwrap();
        let db = crate::database::Database::open(&directory.path().join("contract.db")).unwrap();
        db.create_meeting(
            "one",
            "Me: Budget: €50\nThem: Tomorrow?\nGuest: Yes\nUnlabeled line",
        )
        .unwrap();
        let mapped = map_meeting(
            db.get_meeting("one").unwrap(),
            crate::meetings::summary::SummaryStatus::Failed,
        );
        assert_eq!(mapped["id"], "one");
        assert_eq!(mapped["title"], "Untitled Session");
        assert_eq!(mapped["summaryStatus"], "failed");
        assert_eq!(mapped["summary"], "");
        assert_eq!(
            mapped["detailedSummary"],
            json!({"overview":"","actionItems":[],"keyPoints":[]})
        );
        assert_eq!(
            mapped["transcript"],
            json!([
                {"speaker":"user","text":"Budget: €50","timestamp":0},
                {"speaker":"interviewer","text":"Tomorrow?","timestamp":1},
                {"speaker":"Guest","text":"Yes","timestamp":2},
                {"speaker":"Unknown","text":"Unlabeled line","timestamp":3}
            ])
        );
    }
}
