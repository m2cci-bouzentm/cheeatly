mod commands;
mod repositories;
mod services;
mod state;

use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_os::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .setup(|app| {
            let data_dir = app.path().app_data_dir()?;
            let database = repositories::Database::open(&data_dir.join("cheatly.db"))?;
            let settings = services::SettingsService::load(data_dir.join("settings.json"))?;
            app.manage(state::AppState::new(database, settings));
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::get_meeting_active,
            commands::start_meeting,
            commands::abort_meeting,
            commands::end_meeting,
            commands::get_recent_meetings,
            commands::get_meeting_details,
            commands::update_meeting_title,
            commands::update_meeting_summary,
            commands::delete_meeting,
            commands::retry_meeting_summary,
            commands::flush_database,
            commands::get_undetectable,
            commands::set_undetectable,
            commands::get_disguise,
            commands::set_disguise,
            commands::get_verbose_logging,
            commands::set_verbose_logging,
            commands::get_question_analysis_config,
            commands::set_question_analysis_config,
            commands::get_arch,
            commands::get_os_version,
            commands::get_current_llm_config,
            commands::set_api_key,
            commands::get_stored_credentials,
            commands::get_default_model,
            commands::set_model,
            commands::set_provider_preferred_model,
            commands::get_stt_provider,
            commands::set_stt_provider,
            commands::get_stt_language,
            commands::set_recognition_language,
            commands::test_llm_connection,
            commands::context_get_description,
            commands::context_save_description,
            commands::context_get_files,
            commands::context_delete_file,
            commands::context_upload_file,
            commands::get_intelligence_context,
            commands::reset_intelligence,
            commands::skills_list,
            commands::skills_get,
            commands::skills_toggle,
            commands::skills_update,
            commands::skills_remove,
            commands::skills_import,
            commands::update_content_dimensions,
            commands::window_minimize,
            commands::window_maximize,
            commands::window_close,
            commands::window_is_maximized,
            commands::quit_app,
            commands::show_window,
            commands::hide_window,
            commands::toggle_window,
            commands::show_overlay,
            commands::hide_overlay,
            commands::set_window_mode,
            commands::move_window_left,
            commands::move_window_right,
            commands::move_window_up,
            commands::move_window_down,
            commands::set_overlay_opacity,
            commands::open_external,
            commands::get_open_at_login,
            commands::set_open_at_login,
            commands::check_permissions,
            commands::repair_tcc_permissions,
            commands::get_log_file_path,
            commands::open_log_file,
            commands::take_screenshot,
            commands::get_screenshots,
            commands::delete_screenshot,
            commands::toggle_settings_window,
            commands::close_settings_window,
            commands::open_settings_tab,
            commands::toggle_model_selector,
            commands::model_selector_close_if_open,
            commands::get_input_devices,
            commands::get_output_devices,
            commands::get_recognition_languages,
            commands::set_channel_muted,
            commands::get_native_audio_status,
            commands::start_audio_test,
            commands::stop_audio_test,
            commands::stealth_tap_available,
            commands::stealth_tap_start,
            commands::stealth_tap_stop,
            commands::stealth_tap_open_settings,
            commands::analyze_transcript,
            commands::get_keybinds,
            commands::set_keybind,
            commands::reset_keybinds,
            commands::local_parakeet_get_config,
            commands::local_parakeet_set_config,
            commands::local_parakeet_download_model,
            commands::chat_stream_start,
            commands::chat_stream_abort,
            commands::extract_emails_from_transcript,
            commands::open_mailto
        ])
        .run(tauri::generate_context!())
        .expect("error while building Tauri application");
}
