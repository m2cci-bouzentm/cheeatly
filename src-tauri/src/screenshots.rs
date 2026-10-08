use serde_json::{Value, json};

#[tauri::command]
pub fn take_screenshot() -> Result<Value, String> {
    Err("Screenshot capture is not enabled in this migration build".into())
}
#[tauri::command]
pub fn get_screenshots() -> Vec<Value> {
    vec![]
}
#[tauri::command]
pub fn delete_screenshot(_path: String) -> Value {
    json!({ "success": true })
}
