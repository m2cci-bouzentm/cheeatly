use tauri::{AppHandle, Manager};
pub fn sidecar_path(app: &AppHandle) -> anyhow::Result<std::path::PathBuf> {
    let resource = app
        .path()
        .resolve("speech-to-text", tauri::path::BaseDirectory::Resource)?;
    let executable = std::env::current_exe()?.with_file_name(if cfg!(target_os = "windows") {
        "speech-to-text.exe"
    } else {
        "speech-to-text"
    });
    // Resolve lazily: a missing sidecar must not prevent opening Settings or saved meetings.
    Ok(if resource.is_file() {
        resource
    } else {
        executable
    })
}
