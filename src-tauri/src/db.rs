use std::fs;
use std::path::PathBuf;

use rusqlite::{params, Connection};
use tauri::Manager;

use crate::error::AppError;
use crate::models::{Conversation, Message};

fn get_db_path(app: &tauri::AppHandle) -> Result<PathBuf, AppError> {
    let base_dir = app
        .path()
        .app_data_dir()
        .map_err(|err| AppError::Database(err.to_string()))?;

    if !base_dir.exists() {
        fs::create_dir_all(&base_dir).map_err(|err| AppError::Database(err.to_string()))?;
    }

    Ok(base_dir.join("jarvis.db"))
}

fn connect(app: &tauri::AppHandle) -> Result<Connection, AppError> {
    let path = get_db_path(app)?;
    let conn = Connection::open(path)?;
    conn.pragma_update(None, "foreign_keys", "ON")?;
    Ok(conn)
}

pub fn init(app: &tauri::AppHandle) -> Result<(), AppError> {
    let conn = connect(app)?;

    let current_version: i64 = conn.pragma_query_value(None, "user_version", |row| row.get(0))?;

    if current_version < 1 {
        conn.execute_batch(
            "
            CREATE TABLE IF NOT EXISTS conversations (
                id TEXT PRIMARY KEY,
                title TEXT NOT NULL,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS messages (
                id TEXT PRIMARY KEY,
                conversation_id TEXT NOT NULL,
                role TEXT NOT NULL,
                content TEXT NOT NULL,
                created_at TEXT NOT NULL,
                FOREIGN KEY(conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
            );
            "
        )?;
        conn.pragma_update(None, "user_version", 1)?;
    }

    let upgraded_version: i64 = conn.pragma_query_value(None, "user_version", |row| row.get(0))?;
    if upgraded_version < 2 {
        conn.execute_batch(
            "
            ALTER TABLE conversations ADD COLUMN message_count INTEGER DEFAULT 0;
            ALTER TABLE messages ADD COLUMN model TEXT;
            ALTER TABLE messages ADD COLUMN tokens_est INTEGER DEFAULT 0;
            "
        )
        .ok();

        conn.execute(
            "
            UPDATE conversations
            SET message_count = (
                SELECT COUNT(*) FROM messages WHERE messages.conversation_id = conversations.id
            )
            ",
            [],
        )?;

        conn.pragma_update(None, "user_version", 2)?;
    }

    Ok(())
}

pub fn save_conversation(app: &tauri::AppHandle, convo: Conversation) -> Result<(), AppError> {
    let conn = connect(app)?;
    conn.execute(
        "
        INSERT INTO conversations (id, title, created_at, updated_at)
        VALUES (?1, ?2, ?3, ?4)
        ON CONFLICT(id) DO UPDATE SET
            title=excluded.title,
            updated_at=excluded.updated_at
        ",
        params![convo.id, convo.title, convo.created_at, convo.updated_at],
    )?;
    Ok(())
}

pub fn save_message(app: &tauri::AppHandle, message: Message) -> Result<(), AppError> {
    let conn = connect(app)?;
    let conversation_id = message.conversation_id.clone();
    conn.execute(
        "
        INSERT INTO messages (id, conversation_id, role, content, created_at)
        VALUES (?1, ?2, ?3, ?4, ?5)
        ON CONFLICT(id) DO UPDATE SET
            role=excluded.role,
            content=excluded.content,
            created_at=excluded.created_at
        ",
        params![
            message.id,
            message.conversation_id,
            message.role,
            message.content,
            message.created_at
        ],
    )?;

    conn.execute(
        "
        UPDATE conversations
        SET
            message_count = (
                SELECT COUNT(*)
                FROM messages
                WHERE messages.conversation_id = conversations.id
            ),
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?1
        ",
        [conversation_id],
    )?;

    Ok(())
}

pub fn list_conversations(app: &tauri::AppHandle) -> Result<Vec<Conversation>, AppError> {
    let conn = connect(app)?;
    let mut stmt = conn.prepare(
        "
        SELECT id, title, created_at, updated_at
        FROM conversations
        ORDER BY updated_at DESC
        ",
    )?;

    let rows = stmt.query_map([], |row| {
        Ok(Conversation {
            id: row.get(0)?,
            title: row.get(1)?,
            created_at: row.get(2)?,
            updated_at: row.get(3)?,
        })
    })?;

    let mut out = Vec::new();
    for row in rows {
        out.push(row?);
    }
    Ok(out)
}

pub fn list_messages(app: &tauri::AppHandle, conversation_id: String) -> Result<Vec<Message>, AppError> {
    let conn = connect(app)?;
    let mut stmt = conn.prepare(
        "
        SELECT id, conversation_id, role, content, created_at
        FROM messages
        WHERE conversation_id = ?1
        ORDER BY created_at ASC
        ",
    )?;

    let rows = stmt.query_map([conversation_id], |row| {
        Ok(Message {
            id: row.get(0)?,
            conversation_id: row.get(1)?,
            role: row.get(2)?,
            content: row.get(3)?,
            created_at: row.get(4)?,
        })
    })?;

    let mut out = Vec::new();
    for row in rows {
        out.push(row?);
    }
    Ok(out)
}
