mod commands;
mod db;
mod error;
mod models;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            db::init(app.handle()).map_err(|err| {
                let message = err.to_string();
                Box::<dyn std::error::Error>::from(message)
            })?;
            Ok(())
        })
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            commands::save_conversation,
            commands::save_message,
            commands::list_conversations,
            commands::list_messages,
            commands::stream_chat,
            commands::cancel_chat_stream,
            commands::list_provider_models,
            commands::check_provider_health
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
