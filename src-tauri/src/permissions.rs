use serde::Serialize;
use std::process::Command;

#[cfg(target_os = "macos")]
use block2::RcBlock;

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
pub fn request_microphone_permission() -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        let media_type = unsafe { AVMediaTypeAudio.expect("AVMediaTypeAudio unavailable") };
        let handler = RcBlock::new(|_granted| {});
        unsafe {
            AVCaptureDevice::requestAccessForMediaType_completionHandler(media_type, &handler);
        }
        Ok(())
    }

    #[cfg(not(target_os = "macos"))]
    Ok(())
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

pub fn ensure_screen_capture_permission() -> Result<(), String> {
    #[cfg(target_os = "macos")]
    if !ScreenCaptureAccess.preflight() && !ScreenCaptureAccess.request() {
        // macOS only offers the initial consent prompt once. After denial, take
        // the user directly to the matching pane instead of making them find it.
        open_permission_settings("screen".into())?;
        return Err("Allow Cheatly in macOS Screen Recording, then try again. If macOS asks you to restart Cheatly, reopen it first.".into());
    }
    Ok(())
}

pub fn capture_start_error(error: impl std::fmt::Display) -> String {
    let message = error.to_string();
    log::warn!("Capture startup failed: {message}");
    if is_screen_consent_error(&message) {
        if let Err(error) = open_permission_settings("screen".into()) {
            log::warn!("Unable to open Screen Recording settings: {error}");
        }
        return "macOS denied Screen Recording access. Enable Cheatly in the permission pane, then quit and reopen Cheatly. If Cheatly is already enabled, remove its old entry and add /Applications/Cheatly.app again.".into();
    }
    message
}

fn is_screen_consent_error(message: &str) -> bool {
    message.contains("SCStreamErrorDomain Code=-3801")
        || message.contains("ScreenCaptureKit content callback never fired")
}

#[cfg(test)]
mod tests {
    use super::is_screen_consent_error;

    #[test]
    fn recognizes_screen_consent_denial_without_mislabeling_device_errors() {
        assert!(is_screen_consent_error(
            "Error Domain=com.apple.ScreenCaptureKit.SCStreamErrorDomain Code=-3801"
        ));
        assert!(is_screen_consent_error(
            "ScreenCaptureKit content callback never fired (10s)"
        ));
        assert!(!is_screen_consent_error(
            "ScreenCaptureKit access denied: no display available"
        ));
        assert!(!is_screen_consent_error("Microphone device disconnected"));
    }
}
