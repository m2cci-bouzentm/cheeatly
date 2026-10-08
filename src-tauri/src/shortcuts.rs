#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Keybind {
    id: String,
    label: String,
    accelerator: String,
    is_global: bool,
    default_accelerator: String,
}

#[tauri::command]
pub fn get_keybinds() -> Vec<Keybind> {
    vec![]
}
#[tauri::command]
pub fn set_keybind() -> bool {
    true
}
#[tauri::command]
pub fn reset_keybinds() -> Vec<Keybind> {
    vec![]
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
pub fn stealth_tap_stop() {}
#[tauri::command]
pub fn stealth_tap_open_settings() {}
