use serde_json::Value;

#[tauri::command]
pub fn take_screenshot() -> Result<Value, String> {
    Err("Screenshot capture is not enabled in this migration build".into())
}
