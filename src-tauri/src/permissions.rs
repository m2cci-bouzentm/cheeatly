use serde::Serialize;
use std::process::Command;

#[cfg(target_os = "macos")]
use core_graphics::access::ScreenCaptureAccess;
#[cfg(target_os = "macos")]
use objc2_av_foundation::{AVAuthorizationStatus, AVCaptureDevice, AVMediaTypeAudio};

#[derive(Serialize)]
pub struct PermissionStatus {
    microphone: &'static str,
    screen: &'static str,
    platform: &'static str,
}

#[cfg(target_os = "macos")]
fn microphone_permission() -> &'static str {
    let media_type = unsafe { AVMediaTypeAudio.expect("AVMediaTypeAudio unavailable") };
    let status = unsafe { AVCaptureDevice::authorizationStatusForMediaType(media_type) };
    match status {
        AVAuthorizationStatus::Authorized => "granted",
        AVAuthorizationStatus::Denied => "denied",
        AVAuthorizationStatus::Restricted => "restricted",
        _ => "not-determined",
    }
}

#[tauri::command]
pub fn check_permissions() -> PermissionStatus {
    #[cfg(target_os = "macos")]
    return PermissionStatus {
        microphone: microphone_permission(),
        screen: if ScreenCaptureAccess.preflight() {
            "granted"
        } else {
            "denied"
        },
        platform: "darwin",
    };

    #[cfg(not(target_os = "macos"))]
    PermissionStatus {
        microphone: "granted",
        screen: "granted",
        platform: std::env::consts::OS,
    }
}

#[tauri::command]
pub fn open_permission_settings(permission: String) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        let pane = match permission.as_str() {
            "microphone" => "Privacy_Microphone",
            "screen" => "Privacy_ScreenCapture",
            _ => return Err("Unsupported permission settings page".into()),
        };
        let url = format!("x-apple.systempreferences:com.apple.preference.security?{pane}");
        let status = Command::new("/usr/bin/open")
            .arg(url)
            .status()
            .map_err(|error| error.to_string())?;
        if status.success() {
            return Ok(());
        }
        Err(format!("System Settings exited with status {status}"))
    }

    #[cfg(not(target_os = "macos"))]
    Err("Permission settings navigation is only supported on macOS".into())
}

#[tauri::command]
pub fn repair_tcc_permissions() -> serde_json::Value {
    serde_json::json!({
        "ok": false,
        "message": "Open System Settings and change permissions manually. macOS does not allow applications to grant themselves privacy permissions."
    })
}
