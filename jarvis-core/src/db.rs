use std::fs;
use std::path::PathBuf;

use rusqlite::{params, Connection};

use crate::error::AppError;
use crate::models::{Conversation, Message, UserProfile};

pub fn get_db_path(app_data_dir: &PathBuf) -> Result<PathBuf, AppError> {
    if !app_data_dir.exists() {
        fs::create_dir_all(app_data_dir).map_err(|err| AppError::Database(err.to_string()))?;
    }
    Ok(app_data_dir.join("jarvis.db"))
}

pub fn connect(app_data_dir: &PathBuf) -> Result<Connection, AppError> {
    let path = get_db_path(app_data_dir)?;
    let conn = Connection::open(path)?;
    conn.pragma_update(None, "foreign_keys", "ON")?;
    Ok(conn)
}

pub fn init(app_data_dir: &PathBuf) -> Result<(), AppError> {
    let conn = connect(app_data_dir)?;

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

            CREATE TABLE IF NOT EXISTS user_profiles (
                id TEXT PRIMARY KEY,
                first_name TEXT NOT NULL DEFAULT '',
                last_name TEXT NOT NULL DEFAULT '',
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );
            ",
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
            ",
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

    let profile_version: i64 = conn.pragma_query_value(None, "user_version", |row| row.get(0))?;
    if profile_version < 3 {
        conn.execute_batch(
            "
            CREATE TABLE IF NOT EXISTS user_profiles (
                id TEXT PRIMARY KEY,
                first_name TEXT NOT NULL DEFAULT '',
                last_name TEXT NOT NULL DEFAULT '',
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );
            ",
        )?;

        conn.execute(
            "
            INSERT OR IGNORE INTO user_profiles (id, first_name, last_name, created_at, updated_at)
            VALUES ('default', '', '', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
            ",
            [],
        )?;

        conn.pragma_update(None, "user_version", 3)?;
    }

    Ok(())
}

pub fn save_conversation(app_data_dir: &PathBuf, convo: Conversation) -> Result<(), AppError> {
    let conn = connect(app_data_dir)?;
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

pub fn save_message(app_data_dir: &PathBuf, message: Message) -> Result<(), AppError> {
    let conn = connect(app_data_dir)?;
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

pub fn list_conversations(app_data_dir: &PathBuf) -> Result<Vec<Conversation>, AppError> {
    let conn = connect(app_data_dir)?;
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

pub fn delete_conversation(app_data_dir: &PathBuf, conversation_id: &str) -> Result<(), AppError> {
    let conn = connect(app_data_dir)?;
    conn.execute(
        "DELETE FROM messages WHERE conversation_id = ?1",
        params![conversation_id],
    )?;
    conn.execute(
        "DELETE FROM conversations WHERE id = ?1",
        params![conversation_id],
    )?;
    conn.close().ok();
    Ok(())
}

pub fn wipe_all(app_data_dir: &PathBuf) -> Result<(), AppError> {
    let conn = connect(app_data_dir)?;
    conn.execute_batch(
        "
        DELETE FROM messages;
        DELETE FROM conversations;
        ",
    )?;
    Ok(())
}

pub fn list_messages(
    app_data_dir: &PathBuf,
    conversation_id: String,
) -> Result<Vec<Message>, AppError> {
    let conn = connect(app_data_dir)?;
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

pub fn save_user_profile(app_data_dir: &PathBuf, profile: UserProfile) -> Result<(), AppError> {
    let conn = connect(app_data_dir)?;
    conn.execute(
        "
        INSERT INTO user_profiles (id, first_name, last_name, created_at, updated_at)
        VALUES (?1, ?2, ?3, ?4, ?5)
        ON CONFLICT(id) DO UPDATE SET
            first_name=excluded.first_name,
            last_name=excluded.last_name,
            updated_at=excluded.updated_at
        ",
        params![
            profile.id,
            profile.first_name,
            profile.last_name,
            profile.created_at,
            profile.updated_at
        ],
    )?;
    Ok(())
}

pub fn load_user_profile(app_data_dir: &PathBuf) -> Result<Option<UserProfile>, AppError> {
    let conn = connect(app_data_dir)?;
    let mut stmt = conn.prepare(
        "
        SELECT id, first_name, last_name, created_at, updated_at
        FROM user_profiles
        WHERE id = 'default'
        LIMIT 1
        ",
    )?;

    let mut rows = stmt.query([])?;
    if let Some(row) = rows.next()? {
        return Ok(Some(UserProfile {
            id: row.get(0)?,
            first_name: row.get(1)?,
            last_name: row.get(2)?,
            created_at: row.get(3)?,
            updated_at: row.get(4)?,
        }));
    }

    Ok(None)
}

pub fn reset_database(app_data_dir: &PathBuf) -> Result<(), AppError> {
    let db_path = get_db_path(app_data_dir)?;
    let cfg = app_data_dir.join("config.json");
    if cfg.exists() {
        fs::remove_file(cfg).map_err(|err| AppError::Io(err.to_string()))?;
    }
    if db_path.exists() {
        fs::remove_file(db_path).map_err(|err| AppError::Database(err.to_string()))?;
    }
    Ok(())
}
