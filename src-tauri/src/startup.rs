use tauri::{App, Manager};

use crate::{
    database::Database,
    settings::{CredentialService, SettingsStore},
    shortcuts::ShortcutStore,
};

use crate::state::AppState;

pub fn initialize(app: &mut App) -> anyhow::Result<()> {
    let data_dir = app.path().app_data_dir()?;
    let database = Database::open(&data_dir.join("cheatly.db"))?;
    let skill_dir = app.path().resource_dir()?.join("skills");
    if skill_dir.is_dir() {
        for file in std::fs::read_dir(skill_dir)? {
            let path = file?.path();
            if path.extension().and_then(|s| s.to_str()) != Some("md") {
                continue;
            }
            let content = std::fs::read_to_string(&path)?;
            if let Some(name) = crate::skills::service::frontmatter_value(&content, "name") {
                database.seed_skill(
                    name,
                    crate::skills::service::frontmatter_value(&content, "description")
                        .unwrap_or(""),
                    &content,
                )?;
            }
        }
    }
    let settings = SettingsStore::load(data_dir.join("settings.json"))?;
    let credentials = CredentialService::new();
    let shortcuts = ShortcutStore::load(data_dir.join("keybinds.json"));
    shortcuts
        .register(app.handle())
        .map_err(anyhow::Error::msg)?;
    let protected = settings.values().is_undetectable.unwrap_or(false);
    let mode = settings
        .values()
        .disguise_mode
        .clone()
        .unwrap_or_else(|| "none".into());
    let binary = crate::transcription::paths::sidecar_path(app.handle())?;
    let events = crate::desktop_events::sink(app.handle().clone());
    app.manage(AppState::new(
        database,
        settings,
        credentials,
        shortcuts,
        binary,
        events,
    ));
    let questions = app.state::<AppState>().questions.clone();
    tauri::async_runtime::spawn(async move {
        crate::assistant::questions::QuestionService::run(&questions);
    });
    crate::windows::create_tray(app.handle())?;
    crate::windows::apply_protection(app.handle(), protected).map_err(anyhow::Error::msg)?;
    crate::windows::apply_disguise(app.handle(), if protected { &mode } else { "none" })
        .map_err(anyhow::Error::msg)?;
    Ok(())
}
