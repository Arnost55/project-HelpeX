mod agent;
mod commands;
mod hotkeys;
mod mcp;
mod notifications;
mod tray;

use mcp::McpSystemState;
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(|app, shortcut, _event| {
                    hotkeys::on_hotkey_pressed(app, shortcut);
                })
                .build(),
        )
        .manage(McpSystemState::default())
        .setup(|app| {
            let app_handle = app.handle().clone();

            let app_data_dir = app
                .path()
                .app_data_dir()
                .map_err(|error| Box::<dyn std::error::Error>::from(error.to_string()))?;

            jarvis_core::db::init(&app_data_dir)
                .map_err(|error| Box::<dyn std::error::Error>::from(error.to_string()))?;

            tray::create_tray(&app_handle)
                .map_err(|error| Box::<dyn std::error::Error>::from(error.to_string()))?;

            hotkeys::register_hotkeys(&app_handle)
                .map_err(|error| Box::<dyn std::error::Error>::from(error.to_string()))?;

            notifications::notify_info(
                &app_handle,
                "JARVIS AI",
                "Application started successfully",
            );

            if let Ok(configs) = mcp::load_persisted_servers(&app_handle) {
                for cfg in configs {
                    if cfg.cmd.is_empty() {
                        continue;
                    }

                    let handle = app_handle.clone();
                    tauri::async_runtime::spawn(async move {
                        if let Err(error) =
                            mcp::auto_spawn_and_register(&handle, &cfg.name, &cfg.cmd, &cfg.args)
                                .await
                        {
                            eprintln!("[MCP] Failed to auto-restore '{}': {}", cfg.name, error);
                        }
                    });
                }
            }

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
            commands::save_user_profile,
            commands::load_user_profile,
            commands::stream_chat,
            commands::cancel_chat_stream,
            commands::list_provider_models,
            commands::check_provider_health,
            commands::save_app_settings,
            commands::load_app_settings,
            commands::run_jarvis_task,
            commands::wipe_all_data,
            commands::reset_database,
            commands::restart_application,
            commands::list_available_themes,
            mcp::mcp_spawn_and_initialize,
            mcp::mcp_get_active_tools,
            mcp::mcp_execute_tool,
            mcp::mcp_disconnect_server,
            mcp::mcp_hydrate_saved_servers,
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application");

    app.run(|_app_handle, event| if let tauri::RunEvent::Exit = event {});
}
