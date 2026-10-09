mod application;
mod assistant;
mod command_response;
mod context;
mod database;
mod desktop_events;
mod events;
mod meetings;
mod permissions;
mod screenshots;
mod settings;
mod shortcuts;
mod skills;
mod startup;
mod state;
mod stealth;
mod transcription;
mod windows;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_os::init())
        .plugin(tauri_plugin_autostart::Builder::new().build())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .setup(|app| {
            startup::initialize(app)?;
            app.handle().plugin(
                tauri_plugin_log::Builder::default()
                    .level(log::LevelFilter::Info)
                    .targets([tauri_plugin_log::Target::new(
                        tauri_plugin_log::TargetKind::LogDir {
                            file_name: Some("cheatly".into()),
                        },
                    )])
                    .build(),
            )?;
            Ok(())
        })
        .on_window_event(|window, event| {
            use tauri::Manager;
            if let Some(state) = window.try_state::<state::AppState>() {
                match event {
                    tauri::WindowEvent::Moved(_) | tauri::WindowEvent::Resized(_) => {
                        state.stealth.update_bounds(window.app_handle())
                    }
                    tauri::WindowEvent::Destroyed | tauri::WindowEvent::CloseRequested { .. } => {
                        state.stealth.stop()
                    }
                    _ => {}
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            meetings::commands::get_meeting_active,
            meetings::commands::start_meeting,
            meetings::commands::abort_meeting,
            meetings::commands::end_meeting,
            meetings::commands::get_recent_meetings,
            meetings::commands::get_meeting_details,
            meetings::commands::update_meeting_title,
            meetings::commands::update_meeting_summary,
            meetings::commands::delete_meeting,
            meetings::commands::retry_meeting_summary,
            meetings::commands::flush_database,
            settings::commands::get_undetectable,
            settings::commands::set_undetectable,
            settings::commands::get_disguise,
            settings::commands::set_disguise,
            settings::commands::get_verbose_logging,
            settings::commands::set_verbose_logging,
            settings::commands::get_question_analysis_config,
            settings::commands::set_question_analysis_config,
            settings::commands::get_arch,
            settings::commands::get_os_version,
            settings::providers::get_current_llm_config,
            settings::providers::set_api_key,
            settings::providers::get_stored_credentials,
            settings::providers::get_default_model,
            settings::providers::set_model,
            settings::providers::set_provider_preferred_model,
            settings::providers::get_stt_provider,
            settings::providers::set_stt_provider,
            settings::providers::get_stt_language,
            settings::providers::set_recognition_language,
            settings::providers::test_llm_connection,
            context::commands::context_get_description,
            context::commands::context_save_description,
            context::commands::context_get_files,
            context::commands::context_delete_file,
            context::commands::context_upload_file,
            assistant::commands::get_intelligence_context,
            assistant::commands::reset_intelligence,
            skills::commands::skills_list,
            skills::commands::skills_get,
            skills::commands::skills_toggle,
            skills::commands::skills_update,
            skills::commands::skills_remove,
            skills::commands::skills_import,
            windows::update_content_dimensions,
            application::quit_app,
            windows::show_window,
            windows::hide_window,
            windows::toggle_window,
            windows::show_overlay,
            windows::hide_overlay,
            windows::set_window_mode,
            windows::move_window_left,
            windows::move_window_right,
            windows::move_window_up,
            windows::move_window_down,
            windows::set_overlay_opacity,
            application::open_external,
            application::get_open_at_login,
            application::set_open_at_login,
            permissions::check_permissions,
            permissions::repair_tcc_permissions,
            permissions::open_permission_settings,
            permissions::request_microphone_permission,
            application::get_log_file_path,
            application::open_log_file,
            screenshots::take_screenshot,
            windows::toggle_settings_window,
            windows::close_settings_window,
            windows::open_settings_tab,
            windows::toggle_model_selector,
            windows::model_selector_close_if_open,
            transcription::commands::get_input_devices,
            transcription::commands::get_output_devices,
            transcription::commands::get_recognition_languages,
            transcription::commands::set_channel_muted,
            transcription::commands::get_native_audio_status,
            transcription::commands::start_audio_test,
            transcription::commands::stop_audio_test,
            shortcuts::stealth_tap_available,
            shortcuts::stealth_tap_start,
            shortcuts::stealth_tap_stop,
            shortcuts::stealth_tap_open_settings,
            assistant::commands::analyze_transcript,
            assistant::commands::get_question_state,
            assistant::commands::scan_questions,
            assistant::commands::set_questions_paused,
            assistant::commands::dismiss_question,
            assistant::commands::reset_questions,
            shortcuts::get_keybinds,
            shortcuts::set_keybind,
            shortcuts::reset_keybinds,
            transcription::commands::local_parakeet_get_config,
            transcription::commands::local_parakeet_set_config,
            transcription::commands::local_parakeet_download_model,
            assistant::commands::chat_stream_start,
            assistant::commands::chat_stream_abort,
        ])
        .build(tauri::generate_context!())
        .expect("error while building Tauri application")
        .run(|app, event| {
            use tauri::Manager;
            #[cfg(target_os = "macos")]
            if let tauri::RunEvent::Reopen { .. } = event {
                let _ = windows::show_window(app.clone(), None);
            }
            if let tauri::RunEvent::ExitRequested { api, .. } = event {
                let state = app.state::<state::AppState>();
                if !state
                    .shutting_down
                    .swap(true, std::sync::atomic::Ordering::AcqRel)
                {
                    api.prevent_exit();
                    let app = app.clone();
                    tauri::async_runtime::spawn(async move {
                        let state = app.state::<state::AppState>();
                        state.stealth.stop();
                        state.questions.stop();
                        let _ = state.assistant.intelligence.reset();
                        if let Err(error) = state.meetings.end().await {
                            log::error!("Unable to save meeting on exit: {error}");
                        }
                        let audio_test = state.audio_test.clone();
                        let _ =
                            tauri::async_runtime::spawn_blocking(move || audio_test.stop()).await;
                        if let Ok(database) = state.database.lock() {
                            let _ = database.checkpoint();
                        }
                        app.exit(0);
                    });
                }
            }
        });
}
