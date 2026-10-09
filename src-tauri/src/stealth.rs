//! Opt-in keyboard capture, ported from the old CGEventTap bridge.
use std::sync::{
    Arc, Mutex,
    atomic::{AtomicBool, Ordering},
};
use tauri::{AppHandle, Emitter, Manager};

type OverlayBounds = (f64, f64, f64, f64);

#[derive(Default)]
pub struct StealthInput {
    active: Arc<AtomicBool>,
    worker: Mutex<Option<std::thread::JoinHandle<()>>>,
    bounds: Arc<Mutex<Option<OverlayBounds>>>,
}

impl StealthInput {
    pub fn update_bounds(&self, app: &AppHandle) {
        if let Some(window) = app.get_webview_window("main")
            && let (Ok(position), Ok(size), Ok(scale)) = (
                window.outer_position(),
                window.outer_size(),
                window.scale_factor(),
            )
            && let Ok(mut bounds) = self.bounds.lock()
        {
            *bounds = Some((
                position.x as f64 / scale,
                position.y as f64 / scale,
                size.width as f64 / scale,
                size.height as f64 / scale,
            ));
        }
    }

    pub fn is_active(&self) -> bool {
        self.active.load(Ordering::Acquire)
    }

    pub fn stop(&self) {
        self.active.store(false, Ordering::Release);
        if let Ok(mut worker) = self.worker.lock()
            && let Some(worker) = worker.take()
        {
            let _ = worker.join();
        }
    }

    #[cfg(target_os = "macos")]
    pub fn start(&self, app: AppHandle) -> Result<bool, String> {
        use core_foundation::runloop::{CFRunLoop, kCFRunLoopDefaultMode};
        use core_graphics::event::{
            CGEventTap, CGEventTapLocation, CGEventTapOptions, CGEventTapPlacement, CGEventType,
            CallbackResult, EventField,
        };
        use foreign_types::ForeignType;
        use std::{
            sync::mpsc,
            time::{Duration, Instant},
        };

        let mut worker = self.worker.lock().map_err(|e| e.to_string())?;
        if self.active.load(Ordering::Acquire) {
            return Ok(true);
        }
        if let Some(previous) = worker.take() {
            let _ = previous.join();
        }
        let window = app
            .get_webview_window("main")
            .ok_or("Main window unavailable")?;
        if !window.is_visible().map_err(|e| e.to_string())? {
            return Ok(false);
        }
        self.update_bounds(&app);
        let active = self.active.clone();
        let bounds = self.bounds.clone();
        let (tx, rx) = mpsc::sync_channel(1);
        *worker = Some(std::thread::spawn(move || {
            let last_input = Arc::new(Mutex::new(Instant::now()));
            let callback_time = last_input.clone();
            let callback_active = active.clone();
            let callback_app = app.clone();
            let tap = CGEventTap::new(
                CGEventTapLocation::Session,
                CGEventTapPlacement::HeadInsertEventTap,
                CGEventTapOptions::Default,
                vec![
                    CGEventType::KeyDown,
                    CGEventType::KeyUp,
                    CGEventType::FlagsChanged,
                    CGEventType::LeftMouseDown,
                    CGEventType::RightMouseDown,
                    CGEventType::OtherMouseDown,
                ],
                move |_, kind, event| {
                    if matches!(
                        kind,
                        CGEventType::TapDisabledByTimeout | CGEventType::TapDisabledByUserInput
                    ) {
                        callback_active.store(false, Ordering::Release);
                        return CallbackResult::Keep;
                    }
                    if !callback_active.load(Ordering::Acquire) {
                        return CallbackResult::Keep;
                    }
                    if matches!(
                        kind,
                        CGEventType::LeftMouseDown
                            | CGEventType::RightMouseDown
                            | CGEventType::OtherMouseDown
                    ) {
                        let point = event.location();
                        let inside =
                            bounds
                                .lock()
                                .ok()
                                .and_then(|b| *b)
                                .is_some_and(|(x, y, w, h)| {
                                    point.x >= x
                                        && point.x <= x + w
                                        && point.y >= y
                                        && point.y <= y + h
                                });
                        if !inside {
                            callback_active.store(false, Ordering::Release);
                        }
                        return CallbackResult::Keep;
                    }
                    if let Ok(mut time) = callback_time.lock() {
                        *time = Instant::now();
                    }
                    let key = event.get_integer_value_field(EventField::KEYBOARD_EVENT_KEYCODE);
                    let mut chars = [0u16; 64];
                    let mut count = 0;
                    // CoreGraphics owns this event for the callback's duration.
                    unsafe {
                        CGEventKeyboardGetUnicodeString(
                            event.as_ptr().cast(),
                            chars.len(),
                            &mut count,
                            chars.as_mut_ptr(),
                        );
                    }
                    let captured = serde_json::json!({"keyCode":key,"chars":String::from_utf16_lossy(&chars[..count.min(chars.len())]),"flags":event.get_flags().bits(),"isKeyDown":matches!(kind, CGEventType::KeyDown)});
                    // Keystrokes only go to the overlay, never helper windows or logs.
                    if callback_app
                        .emit_to("main", "stealth-key-captured", captured)
                        .is_err()
                    {
                        callback_active.store(false, Ordering::Release);
                    }
                    if matches!(kind, CGEventType::KeyDown) && key == 53 {
                        callback_active.store(false, Ordering::Release);
                    }
                    CallbackResult::Drop
                },
            );
            let Ok(tap) = tap else {
                let _ = app.emit(
                    "stealth-tap-state",
                    serde_json::json!({"active":false,"reason":"permission"}),
                );
                let _ = tx.send(false);
                return;
            };
            let Ok(source) = tap.mach_port().create_runloop_source(0) else {
                let _ = tx.send(false);
                return;
            };
            let runloop = CFRunLoop::get_current();
            runloop.add_source(&source, unsafe { kCFRunLoopDefaultMode });
            active.store(true, Ordering::Release);
            let _ = app.emit("stealth-tap-state", serde_json::json!({"active":true}));
            tap.enable();
            let _ = tx.send(true);
            while active.load(Ordering::Acquire) {
                CFRunLoop::run_in_mode(
                    unsafe { kCFRunLoopDefaultMode },
                    Duration::from_millis(50),
                    true,
                );
                if last_input
                    .lock()
                    .map_or(true, |time| time.elapsed() >= Duration::from_secs(10))
                {
                    active.store(false, Ordering::Release);
                }
            }
            runloop.remove_source(&source, unsafe { kCFRunLoopDefaultMode });
            drop(tap);
            let _ = app.emit("stealth-tap-state", serde_json::json!({"active":false}));
        }));
        rx.recv().map_err(|e| e.to_string())
    }

    #[cfg(not(target_os = "macos"))]
    pub fn start(&self, _app: AppHandle) -> Result<bool, String> {
        Ok(false)
    }
}

impl Drop for StealthInput {
    fn drop(&mut self) {
        self.stop();
    }
}

#[cfg(target_os = "macos")]
#[link(name = "CoreGraphics", kind = "framework")]
unsafe extern "C" {
    fn CGEventKeyboardGetUnicodeString(
        event: *mut std::ffi::c_void,
        max: usize,
        count: *mut usize,
        chars: *mut u16,
    );
}
