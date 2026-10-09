use std::{fs, path::PathBuf};

use anyhow::Context;
use serde::{Deserialize, Serialize};

#[derive(Clone, Default, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppSettings {
    pub is_undetectable: Option<bool>,
    pub disguise_mode: Option<String>,
    pub verbose_logging: Option<bool>,
    pub parakeet_model: Option<String>,
    pub parakeet_language: Option<String>,
    pub question_analysis_enabled: Option<bool>,
    pub question_analysis_interval: Option<u32>,
    pub question_analysis_model: Option<String>,
    pub question_analysis_window: Option<u32>,
    pub mic_muted: Option<bool>,
    pub system_muted: Option<bool>,
}

pub struct SettingsStore {
    path: PathBuf,
    values: AppSettings,
}

impl SettingsStore {
    pub fn load(path: PathBuf) -> anyhow::Result<Self> {
        let values = if path.exists() {
            serde_json::from_slice(&fs::read(&path)?)
                .with_context(|| format!("failed to parse {}", path.display()))?
        } else {
            AppSettings::default()
        };
        Ok(Self { path, values })
    }

    pub fn values(&self) -> &AppSettings {
        &self.values
    }

    pub fn update(&mut self, update: impl FnOnce(&mut AppSettings)) -> anyhow::Result<()> {
        let mut values = self.values.clone();
        update(&mut values);
        let parent = self.path.parent().context("settings path has no parent")?;
        fs::create_dir_all(parent)?;
        let temporary = self.path.with_extension("json.tmp");
        fs::write(&temporary, serde_json::to_vec_pretty(&values)?)?;
        fs::rename(temporary, &self.path)?;
        self.values = values;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn partial_updates_preserve_other_settings_after_reopen() {
        let directory = tempfile::tempdir().unwrap();
        let path = directory.path().join("nested/settings.json");
        let mut store = SettingsStore::load(path.clone()).unwrap();
        assert!(store.values().is_undetectable.is_none());
        store
            .update(|s| {
                s.is_undetectable = Some(true);
                s.parakeet_language = Some("fr".into());
                s.question_analysis_window = Some(40);
            })
            .unwrap();
        store.update(|s| s.mic_muted = Some(true)).unwrap();
        let reopened = SettingsStore::load(path.clone()).unwrap();
        assert_eq!(reopened.values().is_undetectable, Some(true));
        assert_eq!(reopened.values().parakeet_language.as_deref(), Some("fr"));
        assert_eq!(reopened.values().question_analysis_window, Some(40));
        assert_eq!(reopened.values().mic_muted, Some(true));
        let json: serde_json::Value = serde_json::from_slice(&fs::read(&path).unwrap()).unwrap();
        assert_eq!(json["isUndetectable"], true);
        assert_eq!(json["questionAnalysisWindow"], 40);
        assert!(!path.with_extension("json.tmp").exists());
    }

    #[test]
    fn failed_write_does_not_change_in_memory_settings() {
        let directory = tempfile::tempdir().unwrap();
        let parent = directory.path().join("blocked");
        let mut store = SettingsStore::load(parent.join("settings.json")).unwrap();
        fs::write(&parent, "not a directory").unwrap();
        assert!(store.update(|s| s.is_undetectable = Some(true)).is_err());
        assert!(store.values().is_undetectable.is_none());
        assert_eq!(fs::read_to_string(parent).unwrap(), "not a directory");
    }

    #[test]
    fn malformed_existing_settings_are_reported_without_overwriting() {
        let directory = tempfile::tempdir().unwrap();
        let path = directory.path().join("settings.json");
        fs::write(&path, "{broken").unwrap();
        assert!(SettingsStore::load(path.clone()).is_err());
        assert_eq!(fs::read_to_string(path).unwrap(), "{broken");
    }
}
