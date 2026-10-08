use serde::Serialize;
use tokio::sync::mpsc;

#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum AudioSource {
    Microphone,
    System,
}

#[derive(Clone, Debug)]
pub struct AudioChunk {
    pub source: AudioSource,
    pub pcm16: Vec<i16>,
    pub sample_rate: u32,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TranscriptEvent {
    pub source: AudioSource,
    pub text: String,
    pub final_result: bool,
}

#[derive(Clone, Debug)]
pub struct TranscriptionConfig {
    pub model: String,
    pub language: String,
    pub source: AudioSource,
}

pub fn filter_transcript(text: &str) -> String {
    let mut output = text.to_owned();
    for (open, close) in [('[', ']'), ('(', ')'), ('{', '}')] {
        while let Some(start) = output.find(open) {
            let Some(relative_end) = output[start..].find(close) else {
                break;
            };
            output.replace_range(start..=start + relative_end, "");
        }
    }
    let fillers = [
        "uh", "um", "uhm", "umm", "hmm", "hm", "mmm", "mm", "mhm", "eh", "ah", "oh", "er", "erm",
        "ahem",
    ];
    let words = output
        .split_whitespace()
        .filter(|word| {
            let normalized = word
                .trim_matches(|character: char| !character.is_alphanumeric())
                .to_lowercase();
            !fillers.contains(&normalized.as_str())
        })
        .collect::<Vec<_>>();
    output = words.join(" ").trim().to_owned();
    let normalized = output
        .to_lowercase()
        .trim_end_matches(['.', '!', '?', ',', ' '])
        .to_owned();
    if [
        "thank you",
        "thank you very much",
        "thanks for watching",
        "thank you for watching",
        "bye",
        "you",
    ]
    .contains(&normalized.as_str())
    {
        String::new()
    } else {
        output
    }
}

pub trait TranscriptionProvider: Send {
    fn start(
        &mut self,
        config: TranscriptionConfig,
        events: mpsc::UnboundedSender<TranscriptEvent>,
    ) -> anyhow::Result<()>;
    fn send_audio(&mut self, chunk: AudioChunk) -> anyhow::Result<()>;
    fn stop(&mut self) -> anyhow::Result<()>;
}

#[cfg(test)]
mod tests {
    use super::filter_transcript;

    #[test]
    fn drops_whole_segment_silence_artifacts() {
        for text in [
            "Thank you.",
            "thank you",
            "THANK YOU!",
            "Thanks for watching.",
            "Bye.",
            "you",
        ] {
            assert_eq!(filter_transcript(text), "");
        }
    }

    #[test]
    fn preserves_artifact_words_inside_real_speech() {
        assert_eq!(
            filter_transcript("Thank you for the quarterly update."),
            "Thank you for the quarterly update."
        );
        assert_eq!(
            filter_transcript("I will say bye on Friday."),
            "I will say bye on Friday."
        );
    }

    #[test]
    fn strips_fillers_before_artifact_detection() {
        assert_eq!(filter_transcript("um, thank you"), "");
        assert_eq!(
            filter_transcript("uh, the review is Friday"),
            "the review is Friday"
        );
    }
}
