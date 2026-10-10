pub mod commands;
mod credentials;
pub mod providers;
mod store;

pub use credentials::{CredentialService, StoredCredentials};
pub use store::SettingsStore;

// Migrate saved GPT-OSS and DeepSeek V4 Flash choices when loading credentials or scan settings.
fn deserialize_model<'de, D: serde::Deserializer<'de>>(
    deserializer: D,
) -> Result<Option<String>, D::Error> {
    use serde::Deserialize;
    Ok(Option::<String>::deserialize(deserializer)?.map(|model| {
        if model.starts_with("openai/gpt-oss-") {
            "qwen/qwen3.7-flash".to_owned()
        } else if model == "deepseek/deepseek-v4-flash" {
            "deepseek/deepseek-v4.1-flash".to_owned()
        } else {
            model
        }
    }))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn saved_retired_models_migrate_without_changing_other_preferences() {
        for (old, expected) in [
            (Some("openai/gpt-oss-120b"), Some("qwen/qwen3.7-flash")),
            (Some("openai/gpt-oss-20b:free"), Some("qwen/qwen3.7-flash")),
            (
                Some("deepseek/deepseek-v4-flash"),
                Some("deepseek/deepseek-v4.1-flash"),
            ),
            (Some("z-ai/glm-5.3-flash"), Some("z-ai/glm-5.3-flash")),
            (Some(""), Some("")),
            (None, None),
        ] {
            let credentials: StoredCredentials = serde_json::from_value(serde_json::json!({
                "defaultModel": old, "openRouterApiKey": "test-key", "sttProvider": "local-parakeet"
            }))
            .unwrap();
            assert_eq!(credentials.default_model.as_deref(), expected);
            assert_eq!(credentials.open_router_api_key.as_deref(), Some("test-key"));
            assert_eq!(credentials.stt_provider.as_deref(), Some("local-parakeet"));
            let settings: store::AppSettings = serde_json::from_value(serde_json::json!({
                "questionAnalysisModel": old, "questionAnalysisEnabled": true
            }))
            .unwrap();
            assert_eq!(settings.question_analysis_model.as_deref(), expected);
            assert_eq!(settings.question_analysis_enabled, Some(true));
        }
        assert!(
            serde_json::from_str::<StoredCredentials>("{}")
                .unwrap()
                .default_model
                .is_none()
        );
        assert!(
            serde_json::from_str::<store::AppSettings>("{}")
                .unwrap()
                .question_analysis_model
                .is_none()
        );
    }
}
