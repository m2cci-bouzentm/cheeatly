use serde::Deserialize;
use tauri::{AppHandle, Emitter, Manager, WebviewWindow};

fn error(error: impl std::fmt::Display) -> String {
    error.to_string()
}

fn main_window(app: &AppHandle) -> Result<WebviewWindow, String> {
    app.get_webview_window("main")
        .ok_or_else(|| "main window unavailable".into())
}

#[derive(Deserialize)]
pub struct Dimensions {
    width: f64,
    height: f64,
}

#[tauri::command]
pub fn update_content_dimensions(
    window: WebviewWindow,
    dimensions: Dimensions,
) -> Result<(), String> {
    if !dimensions.width.is_finite()
        || !dimensions.height.is_finite()
        || dimensions.width < 100.0
        || dimensions.height < 50.0
    {
        return Err("Invalid window dimensions".into());
    }
    window
        .set_size(tauri::LogicalSize::new(dimensions.width, dimensions.height))
        .map_err(error)
}

#[tauri::command]
pub fn show_window(app: AppHandle, inactive: Option<bool>) -> Result<(), String> {
    let window = main_window(&app)?;
    window.show().map_err(error)?;
    if inactive != Some(true) {
        window.set_focus().map_err(error)?;
    }
    Ok(())
}

#[tauri::command]
pub fn hide_window(app: AppHandle) -> Result<(), String> {
    app.state::<crate::state::AppState>().stealth.stop();
    main_window(&app)?.hide().map_err(error)
}

#[tauri::command]
pub fn toggle_window(app: AppHandle) -> Result<(), String> {
    let window = main_window(&app)?;
    if window.is_visible().map_err(error)? {
        app.state::<crate::state::AppState>().stealth.stop();
        window.hide().map_err(error)
    } else {
        window.show().map_err(error)?;
        window.set_focus().map_err(error)
    }
}

#[tauri::command]
pub fn show_overlay(app: AppHandle) -> Result<(), String> {
    show_window(app, Some(false))
}

#[tauri::command]
pub fn hide_overlay(app: AppHandle) -> Result<(), String> {
    hide_window(app)
}

#[tauri::command]
pub fn set_window_mode(app: AppHandle, mode: String, inactive: Option<bool>) -> Result<(), String> {
    let window = main_window(&app)?;
    match mode.as_str() {
        "launcher" => {
            window
                .set_size(tauri::LogicalSize::new(900.0, 680.0))
                .map_err(error)?;
            window.set_resizable(true).map_err(error)?;
            window
                .eval("window.dispatchEvent(new CustomEvent('cheatly-window-mode', {detail:'launcher'}))")
                .map_err(error)?;
        }
        "overlay" => {
            window
                .set_size(tauri::LogicalSize::new(520.0, 240.0))
                .map_err(error)?;
            window.set_resizable(false).map_err(error)?;
            window
                .eval("window.dispatchEvent(new CustomEvent('cheatly-window-mode', {detail:'overlay'}))")
                .map_err(error)?;
        }
        _ => return Err("Unsupported window mode".into()),
    }
    window.show().map_err(error)?;
    if inactive != Some(true) {
        window.set_focus().map_err(error)?;
    }
    Ok(())
}
#[tauri::command]
pub fn move_window_left(app: AppHandle) -> Result<(), String> {
    move_window(&app, -40, 0)
}
#[tauri::command]
pub fn move_window_right(app: AppHandle) -> Result<(), String> {
    move_window(&app, 40, 0)
}
#[tauri::command]
pub fn move_window_up(app: AppHandle) -> Result<(), String> {
    move_window(&app, 0, -40)
}
#[tauri::command]
pub fn move_window_down(app: AppHandle) -> Result<(), String> {
    move_window(&app, 0, 40)
}
#[tauri::command]
pub fn set_overlay_opacity(app: AppHandle, opacity: f64) -> Result<(), String> {
    let opacity = opacity.clamp(0.35, 1.0);
    app.emit("overlay-opacity-changed", opacity).map_err(error)
}
#[tauri::command]
pub async fn toggle_settings_window(app: AppHandle) -> Result<(), String> {
    toggle_surface(&app, "settings", "?window=settings", 360.0, 480.0)?;
    let visible = app
        .get_webview_window("settings")
        .is_some_and(|w| w.is_visible().unwrap_or(false));
    app.emit("settings-visibility-changed", visible)
        .map_err(error)
}
#[tauri::command]
pub fn close_settings_window(app: AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("settings") {
        window.hide().map_err(error)?;
    }
    app.emit("settings-visibility-changed", false)
        .map_err(error)
}
#[tauri::command]
pub async fn open_settings_tab(app: AppHandle, tab: String) -> Result<(), String> {
    if !matches!(
        tab.as_str(),
        "general" | "providers" | "ai" | "audio" | "context" | "skills" | "keybinds"
    ) {
        return Err("Unknown settings tab".into());
    }
    close_settings_window(app.clone())?;
    if let Some(window) = app.get_webview_window("preferences") {
        window.show().map_err(error)?;
        window.set_focus().map_err(error)?;
        window.emit("open-settings-tab", tab).map_err(error)?;
    } else {
        surface(
            &app,
            "preferences",
            &format!("?window=launcher&settingsTab={tab}"),
            900.0,
            680.0,
        )?;
    }
    Ok(())
}
#[tauri::command]
pub async fn toggle_model_selector(app: AppHandle) -> Result<(), String> {
    toggle_surface(
        &app,
        "model-selector",
        "?window=model-selector",
        380.0,
        460.0,
    )
}
#[tauri::command]
pub fn model_selector_close_if_open(app: AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("model-selector") {
        window.hide().map_err(error)?;
    }
    Ok(())
}

fn surface(
    app: &AppHandle,
    label: &str,
    query: &str,
    width: f64,
    height: f64,
) -> Result<WebviewWindow, String> {
    let protected = app
        .state::<crate::state::AppState>()
        .settings
        .lock()
        .map_err(error)?
        .values()
        .is_undetectable
        .unwrap_or(false);
    tauri::WebviewWindowBuilder::new(
        app,
        label,
        tauri::WebviewUrl::App(format!("index.html{query}").into()),
    )
    .title("Cheatly")
    .inner_size(width, height)
    .always_on_top(true)
    .content_protected(protected)
    .build()
    .map_err(error)
}

fn toggle_surface(
    app: &AppHandle,
    label: &str,
    query: &str,
    width: f64,
    height: f64,
) -> Result<(), String> {
    app.state::<crate::state::AppState>().stealth.stop();
    if let Some(window) = app.get_webview_window(label) {
        if window.is_visible().map_err(error)? {
            window.hide().map_err(error)?;
        } else {
            window.show().map_err(error)?;
            window.set_focus().map_err(error)?;
        }
    } else {
        surface(app, label, query, width, height)?;
    }
    Ok(())
}

pub fn apply_protection(app: &AppHandle, enabled: bool) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    app.set_activation_policy(if enabled {
        tauri::ActivationPolicy::Accessory
    } else {
        tauri::ActivationPolicy::Regular
    })
    .map_err(error)?;
    if let Some(tray) = app.tray_by_id("cheatly") {
        tray.set_visible(!enabled).map_err(error)?;
    }
    // Activation-policy changes can reset macOS window sharing flags.
    for window in app.webview_windows().values() {
        window.set_content_protected(enabled).map_err(error)?;
    }
    Ok(())
}

pub fn apply_disguise(app: &AppHandle, mode: &str) -> Result<(), String> {
    let title = match mode {
        "none" => "Cheatly",
        "terminal" => "Terminal",
        "settings" => "System Settings",
        "activity" => "Activity Monitor",
        _ => return Err("Unknown disguise".into()),
    };
    for window in app.webview_windows().values() {
        window.set_title(title).map_err(error)?;
    }
    #[cfg(target_os = "macos")]
    {
        let icon = if mode == "none" {
            std::env::current_exe()
                .map_err(error)?
                .parent()
                .ok_or("Executable directory unavailable")?
                .join("../Resources/icon.icns")
        } else {
            app.path()
                .resource_dir()
                .map_err(error)?
                .join(format!("fakeicon/mac/{mode}.png"))
        };
        app.run_on_main_thread(move || unsafe {
            use objc2::{class, msg_send, rc::Retained, runtime::AnyObject};
            use objc2_foundation::NSString;
            let process: *mut AnyObject = msg_send![class!(NSProcessInfo), processInfo];
            let _: () = msg_send![process, setProcessName: &*NSString::from_str(title)];
            let allocated: *mut AnyObject = msg_send![class!(NSImage), alloc];
            let image: *mut AnyObject = msg_send![allocated,
                initWithContentsOfFile: &*NSString::from_str(&icon.to_string_lossy())];
            if let Some(image) = Retained::from_raw(image) {
                let application: *mut AnyObject =
                    msg_send![class!(NSApplication), sharedApplication];
                let _: () = msg_send![application, setApplicationIconImage: &*image];
            }
        })
        .map_err(error)?;
    }
    Ok(())
}

fn move_window(app: &AppHandle, x: i32, y: i32) -> Result<(), String> {
    let window = main_window(app)?;
    let position = window.outer_position().map_err(error)?;
    window
        .set_position(tauri::PhysicalPosition::new(position.x + x, position.y + y))
        .map_err(error)
}

pub fn create_tray(app: &AppHandle) -> tauri::Result<()> {
    use tauri::{
        menu::{Menu, MenuItem},
        tray::TrayIconBuilder,
    };
    let show = MenuItem::with_id(app, "show", "Show Cheatly", true, None::<&str>)?;
    let toggle = MenuItem::with_id(app, "toggle", "Toggle Window", true, None::<&str>)?;
    let screenshot = MenuItem::with_id(app, "screenshot", "Take Screenshot", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&show, &toggle, &screenshot, &quit])?;
    TrayIconBuilder::with_id("cheatly")
        .icon(tauri::image::Image::from_bytes(include_bytes!(
            "../../assets/iconTemplate.png"
        ))?)
        .icon_as_template(true)
        .tooltip("Cheatly")
        .menu(&menu)
        .on_menu_event(|app, event| {
            let result = match event.id.as_ref() {
                "show" => show_window(app.clone(), None),
                "toggle" => toggle_window(app.clone()),
                "screenshot" => {
                    let app = app.clone();
                    tauri::async_runtime::spawn_blocking(move || {
                        match crate::screenshots::take_screenshot(app.clone()) {
                            Ok(value) => {
                                let _ = app.emit_to("main", "screenshot-taken", value);
                            }
                            Err(error) => log::error!("Screenshot failed: {error}"),
                        }
                    });
                    Ok(())
                }
                "quit" => {
                    app.exit(0);
                    Ok(())
                }
                _ => Ok(()),
            };
            if let Err(error) = result {
                log::error!("Tray action failed: {error}");
            }
        })
        .build(app)?;
    Ok(())
}
