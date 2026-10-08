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
}

pub struct SettingsService {
    path: PathBuf,
    values: AppSettings,
}

impl SettingsService {
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
        update(&mut self.values);
        let parent = self.path.parent().context("settings path has no parent")?;
        fs::create_dir_all(parent)?;
        let temporary = self.path.with_extension("json.tmp");
        fs::write(&temporary, serde_json::to_vec_pretty(&self.values)?)?;
        fs::rename(temporary, &self.path)?;
        Ok(())
    }
}
