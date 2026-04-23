use tauri::AppHandle;

use crate::db;
use crate::models::{Conversation, Message};

#[tauri::command]
pub fn save_conversation(app: AppHandle, conversation: Conversation) -> Result<(), String> {
    db::save_conversation(&app, conversation).map_err(|err| err.to_string())
}

#[tauri::command]
pub fn save_message(app: AppHandle, message: Message) -> Result<(), String> {
    db::save_message(&app, message).map_err(|err| err.to_string())
}

#[tauri::command]
pub fn list_conversations(app: AppHandle) -> Result<Vec<Conversation>, String> {
    db::list_conversations(&app).map_err(|err| err.to_string())
}

#[tauri::command]
pub fn list_messages(app: AppHandle, conversation_id: String) -> Result<Vec<Message>, String> {
    db::list_messages(&app, conversation_id).map_err(|err| err.to_string())
}
