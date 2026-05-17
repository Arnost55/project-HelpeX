mod commands;
mod tray;
mod hotkeys;
mod notifications;

use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().with_handler(|app, shortcut, _event| {
            hotkeys::on_hotkey_pressed(app, shortcut);
        }).build())
        .setup(|app| {
            let app_handle = app.handle().clone();

            let app_data_dir = app.path().app_data_dir()
                .map_err(|err| Box::<dyn std::error::Error>::from(err.to_string()))?;

            jarvis_core::db::init(&app_data_dir)
                .map_err(|err| Box::<dyn std::error::Error>::from(err.to_string()))?;

            tray::create_tray(&app_handle)
                .map_err(|err| Box::<dyn std::error::Error>::from(err.to_string()))?;

            hotkeys::register_hotkeys(&app_handle)
                .map_err(|err| Box::<dyn std::error::Error>::from(err.to_string()))?;

            notifications::notify_info(&app_handle, "JARVIS AI", "Application started successfully");

            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                let _ = window.hide();
                api.prevent_close();
            }
        })
        .invoke_handler(tauri::generate_handler![
            commands::save_conversation,
            commands::save_message,
            commands::list_conversations,
            commands::list_messages,
            commands::delete_conversation,
            commands::hard_delete_session,
            commands::delete_chat,
            commands::wipe_incognito_session,
            commands::stream_chat,
            commands::cancel_chat_stream,
            commands::list_provider_models,
            commands::check_provider_health,
            commands::save_app_settings,
            commands::load_app_settings,
            commands::run_jarvis_task,
            commands::wipe_all_data,
            commands::list_available_themes,
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application");

    app.run(|_app_handle, event| {
        if let tauri::RunEvent::Exit = event {
        }
    });
}
