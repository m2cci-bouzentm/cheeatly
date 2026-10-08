use std::{collections::HashMap, fs, path::PathBuf, sync::Mutex};

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, ShortcutState};

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Keybind {
    id: String,
    label: String,
    accelerator: String,
    is_global: bool,
    default_accelerator: String,
}

pub struct ShortcutStore {
    path: PathBuf,
    values: Mutex<HashMap<String, Keybind>>,
}

impl ShortcutStore {
    pub fn load(path: PathBuf) -> Self {
        let values = fs::read(&path)
            .ok()
            .and_then(|bytes| serde_json::from_slice(&bytes).ok())
            .unwrap_or_else(|| {
                defaults()
                    .into_iter()
                    .map(|keybind| (keybind.id.clone(), keybind))
                    .collect()
            });
        Self {
            path,
            values: Mutex::new(values),
        }
    }
    fn save(&self, values: &HashMap<String, Keybind>) -> Result<(), String> {
        if let Some(parent) = self.path.parent() {
            fs::create_dir_all(parent).map_err(|error| error.to_string())?;
        }
        fs::write(
            &self.path,
            serde_json::to_vec_pretty(values).map_err(|error| error.to_string())?,
        )
        .map_err(|error| error.to_string())
    }
    pub fn list(&self) -> Result<Vec<Keybind>, String> {
        Ok(self
            .values
            .lock()
            .map_err(|error| error.to_string())?
            .values()
            .cloned()
            .collect())
    }
    pub fn set(&self, id: &str, accelerator: String) -> Result<bool, String> {
        let mut values = self.values.lock().map_err(|error| error.to_string())?;
        if values
            .values()
            .any(|value| value.id != id && value.accelerator.eq_ignore_ascii_case(&accelerator))
        {
            return Err("Shortcut already in use".into());
        }
        let keybind = values
            .get_mut(id)
            .ok_or_else(|| "Unknown shortcut".to_string())?;
        keybind.accelerator = accelerator;
        self.save(&values)?;
        Ok(true)
    }
    pub fn register(&self, app: &AppHandle) -> Result<(), String> {
        app.global_shortcut()
            .unregister_all()
            .map_err(|error| error.to_string())?;
        for keybind in self
            .list()?
            .into_iter()
            .filter(|keybind| keybind.is_global && !keybind.accelerator.is_empty())
        {
            let action = keybind.id.clone();
            app.global_shortcut()
                .on_shortcut(keybind.accelerator.as_str(), move |app, _, event| {
                    if event.state == ShortcutState::Pressed {
                        let _ =
                            app.emit("global-shortcut", serde_json::json!({ "action": action }));
                    }
                })
                .map_err(|error| error.to_string())?;
        }
        Ok(())
    }

    pub fn reset(&self) -> Result<Vec<Keybind>, String> {
        let values = defaults()
            .into_iter()
            .map(|keybind| (keybind.id.clone(), keybind))
            .collect::<HashMap<_, _>>();
        self.save(&values)?;
        *self.values.lock().map_err(|error| error.to_string())? = values;
        self.list()
    }
}

#[tauri::command]
pub fn get_keybinds(state: tauri::State<crate::state::AppState>) -> Result<Vec<Keybind>, String> {
    state.shortcuts.list()
}
#[tauri::command]
pub fn set_keybind(
    app: AppHandle,
    id: String,
    accelerator: String,
    state: tauri::State<crate::state::AppState>,
) -> Result<bool, String> {
    let result = state.shortcuts.set(&id, accelerator)?;
    state.shortcuts.register(&app)?;
    app.emit("keybinds-update", state.shortcuts.list()?)
        .map_err(|error| error.to_string())?;
    Ok(result)
}
#[tauri::command]
pub fn reset_keybinds(
    app: AppHandle,
    state: tauri::State<crate::state::AppState>,
) -> Result<Vec<Keybind>, String> {
    let values = state.shortcuts.reset()?;
    state.shortcuts.register(&app)?;
    app.emit("keybinds-update", &values)
        .map_err(|error| error.to_string())?;
    Ok(values)
}
#[tauri::command]
pub fn stealth_tap_available() -> bool {
    false
}
#[tauri::command]
pub fn stealth_tap_start() -> bool {
    false
}
#[tauri::command]
pub fn stealth_tap_stop(app: AppHandle) -> Result<(), String> {
    app.emit(
        "stealth-tap-state",
        serde_json::json!({ "active": false, "reason": "stopped" }),
    )
    .map_err(|error| error.to_string())
}
#[tauri::command]
pub fn stealth_tap_open_settings() -> Result<(), String> {
    std::process::Command::new("/usr/bin/open")
        .arg("x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility")
        .status()
        .map_err(|error| error.to_string())
        .map(|_| ())
}

fn defaults() -> Vec<Keybind> {
    [
        (
            "general:toggle-visibility",
            "Toggle Visibility",
            "CommandOrControl+B",
        ),
        (
            "general:process-screenshots",
            "Process Screenshots",
            "CommandOrControl+Enter",
        ),
        (
            "general:capture-and-process",
            "Capture Screen & Ask AI",
            "CommandOrControl+Shift+Enter",
        ),
        (
            "general:reset-cancel",
            "Reset / Cancel",
            "CommandOrControl+R",
        ),
        (
            "general:take-screenshot",
            "Take Screenshot",
            "CommandOrControl+H",
        ),
        ("chat:whatToAnswer", "What to Answer", "CommandOrControl+1"),
        ("chat:clarify", "Clarify", "CommandOrControl+2"),
        ("chat:dynamicAction4", "Recap", "CommandOrControl+3"),
        ("chat:followUp", "Follow Up", "CommandOrControl+4"),
        ("chat:scrollUp", "Scroll Up", "CommandOrControl+Up"),
        ("chat:scrollDown", "Scroll Down", "CommandOrControl+Down"),
        (
            "chat:scrollLeft",
            "Scroll Left",
            "CommandOrControl+Alt+Left",
        ),
        (
            "chat:scrollRight",
            "Scroll Right",
            "CommandOrControl+Alt+Right",
        ),
        (
            "chat:focusInput",
            "Toggle Stealth Typing",
            "CommandOrControl+Shift+Space",
        ),
        (
            "window:move-up",
            "Move Window Up",
            "CommandOrControl+Shift+Up",
        ),
        (
            "window:move-down",
            "Move Window Down",
            "CommandOrControl+Shift+Down",
        ),
        (
            "window:move-left",
            "Move Window Left",
            "CommandOrControl+Shift+Left",
        ),
        (
            "window:move-right",
            "Move Window Right",
            "CommandOrControl+Shift+Right",
        ),
    ]
    .into_iter()
    .map(|(id, label, accelerator)| Keybind {
        id: id.into(),
        label: label.into(),
        accelerator: accelerator.into(),
        is_global: true,
        default_accelerator: accelerator.into(),
    })
    .collect()
}
