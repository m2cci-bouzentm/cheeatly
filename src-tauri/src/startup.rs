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
    let settings = SettingsStore::load(data_dir.join("settings.json"))?;
    let credentials = CredentialService::new();
    let shortcuts = ShortcutStore::load(data_dir.join("keybinds.json"));
    shortcuts
        .register(app.handle())
        .map_err(anyhow::Error::msg)?;
    app.manage(AppState::new(database, settings, credentials, shortcuts));
    Ok(())
}
