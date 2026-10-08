use tauri::{App, Manager, Runtime};

use crate::{
    database::Database,
    settings::{CredentialService, SettingsStore},
    shortcuts::ShortcutStore,
};

use crate::state::AppState;

pub fn initialize<R: Runtime>(app: &mut App<R>) -> anyhow::Result<()> {
    let data_dir = app.path().app_data_dir()?;
    let database = Database::open(&data_dir.join("cheatly.db"))?;
    let settings = SettingsStore::load(data_dir.join("settings.json"))?;
    let credentials = CredentialService::new();
    let shortcuts = ShortcutStore::load(data_dir.join("keybinds.json"));
    app.manage(AppState::new(database, settings, credentials, shortcuts));
    Ok(())
}
