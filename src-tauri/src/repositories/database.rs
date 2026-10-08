use std::{fs, path::Path};

use anyhow::Context;
use chrono::{DateTime, Utc};
use rusqlite::{Connection, OptionalExtension, params};
use serde::Serialize;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MeetingRow {
    pub id: String,
    pub title: Option<String>,
    pub transcript: Option<String>,
    pub summary: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ContextFileRow {
    pub id: String,
    pub filename: String,
    pub storage_path: String,
    pub created_at: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SkillRow {
    pub id: String,
    pub name: String,
    pub description: String,
    pub content: String,
    pub enabled: bool,
    pub bundled: bool,
}

pub struct Database {
    connection: Connection,
}

impl Database {
    pub fn open(path: &Path) -> anyhow::Result<Self> {
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent)?;
        }
        let connection = Connection::open(path)
            .with_context(|| format!("failed to open database at {}", path.display()))?;
        connection.execute_batch("PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL;")?;
        let database = Self { connection };
        database.migrate()?;
        Ok(database)
    }

    fn migrate(&self) -> anyhow::Result<()> {
        self.connection.execute_batch(
            r#"
            CREATE TABLE IF NOT EXISTS Meeting (
              id TEXT PRIMARY KEY NOT NULL,
              title TEXT,
              transcript TEXT,
              summary TEXT,
              createdAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
              updatedAt TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS Chunk (
              id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
              meetingId TEXT NOT NULL,
              content TEXT NOT NULL,
              FOREIGN KEY (meetingId) REFERENCES Meeting(id) ON DELETE CASCADE
            );
            CREATE TABLE IF NOT EXISTS Context (
              id TEXT PRIMARY KEY NOT NULL,
              description TEXT,
              updatedAt TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS File (
              id TEXT PRIMARY KEY NOT NULL,
              filename TEXT NOT NULL,
              storagePath TEXT NOT NULL,
              attachableType TEXT NOT NULL,
              attachableId TEXT NOT NULL,
              createdAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            );
            CREATE INDEX IF NOT EXISTS File_attachableType_attachableId_idx
              ON File(attachableType, attachableId);
            CREATE TABLE IF NOT EXISTS Skill (
              id TEXT PRIMARY KEY NOT NULL,
              name TEXT NOT NULL UNIQUE,
              description TEXT NOT NULL DEFAULT '',
              content TEXT NOT NULL,
              enabled INTEGER NOT NULL DEFAULT 1,
              bundled INTEGER NOT NULL DEFAULT 0,
              createdAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
              updatedAt TEXT NOT NULL
            );
            "#,
        )?;
        Ok(())
    }

    pub fn list_meetings(&self) -> anyhow::Result<Vec<MeetingRow>> {
        let mut statement = self.connection.prepare(
            "SELECT id, title, transcript, summary, createdAt, updatedAt FROM Meeting ORDER BY createdAt DESC LIMIT 50",
        )?;
        let rows = statement.query_map([], |row| {
            Ok(MeetingRow {
                id: row.get(0)?,
                title: row.get(1)?,
                transcript: row.get(2)?,
                summary: row.get(3)?,
                created_at: row.get(4)?,
                updated_at: row.get(5)?,
            })
        })?;
        Ok(rows.collect::<Result<Vec<_>, _>>()?)
    }

    pub fn get_meeting(&self, id: &str) -> anyhow::Result<MeetingRow> {
        Ok(self.connection.query_row(
            "SELECT id, title, transcript, summary, createdAt, updatedAt FROM Meeting WHERE id = ?1",
            [id],
            |row| Ok(MeetingRow { id: row.get(0)?, title: row.get(1)?, transcript: row.get(2)?, summary: row.get(3)?, created_at: row.get(4)?, updated_at: row.get(5)? }),
        )?)
    }

    pub fn create_meeting(&self, id: &str, transcript: &str) -> anyhow::Result<()> {
        let now: DateTime<Utc> = Utc::now();
        self.connection.execute(
            "INSERT INTO Meeting(id, transcript, createdAt, updatedAt) VALUES (?1, ?2, ?3, ?3)",
            params![id, transcript, now.to_rfc3339()],
        )?;
        Ok(())
    }

    pub fn update_meeting_title(&self, id: &str, title: &str) -> anyhow::Result<()> {
        self.connection.execute(
            "UPDATE Meeting SET title = ?1, updatedAt = ?2 WHERE id = ?3",
            params![title, Utc::now().to_rfc3339(), id],
        )?;
        Ok(())
    }

    pub fn update_meeting_summary(&self, id: &str, summary: &str) -> anyhow::Result<()> {
        self.connection.execute(
            "UPDATE Meeting SET summary = ?1, updatedAt = ?2 WHERE id = ?3",
            params![summary, Utc::now().to_rfc3339(), id],
        )?;
        Ok(())
    }

    pub fn delete_meeting(&self, id: &str) -> anyhow::Result<()> {
        self.connection
            .execute("DELETE FROM Meeting WHERE id = ?1", [id])?;
        Ok(())
    }

    pub fn context_description(&self) -> anyhow::Result<String> {
        Ok(self
            .connection
            .query_row("SELECT description FROM Context LIMIT 1", [], |row| {
                row.get::<_, Option<String>>(0)
            })
            .optional()?
            .flatten()
            .unwrap_or_default())
    }

    pub fn save_context_description(&self, content: &str) -> anyhow::Result<()> {
        let id = "default";
        self.connection.execute(
            "INSERT INTO Context(id, description, updatedAt) VALUES (?1, ?2, ?3) ON CONFLICT(id) DO UPDATE SET description = excluded.description, updatedAt = excluded.updatedAt",
            params![id, content, Utc::now().to_rfc3339()],
        )?;
        Ok(())
    }

    pub fn list_context_files(&self) -> anyhow::Result<Vec<ContextFileRow>> {
        let mut statement = self.connection.prepare("SELECT id, filename, storagePath, createdAt FROM File WHERE attachableType = 'context' ORDER BY createdAt DESC")?;
        let rows = statement.query_map([], |row| {
            Ok(ContextFileRow {
                id: row.get(0)?,
                filename: row.get(1)?,
                storage_path: row.get(2)?,
                created_at: row.get(3)?,
            })
        })?;
        Ok(rows.collect::<Result<Vec<_>, _>>()?)
    }

    pub fn delete_context_file(&self, id: &str) -> anyhow::Result<Option<String>> {
        let path = self
            .connection
            .query_row("SELECT storagePath FROM File WHERE id = ?1", [id], |row| {
                row.get(0)
            })
            .optional()?;
        self.connection
            .execute("DELETE FROM File WHERE id = ?1", [id])?;
        Ok(path)
    }

    pub fn list_skills(&self) -> anyhow::Result<Vec<SkillRow>> {
        let mut statement = self.connection.prepare(
            "SELECT id, name, description, content, enabled, bundled FROM Skill ORDER BY name",
        )?;
        let rows = statement.query_map([], |row| {
            Ok(SkillRow {
                id: row.get(0)?,
                name: row.get(1)?,
                description: row.get(2)?,
                content: row.get(3)?,
                enabled: row.get(4)?,
                bundled: row.get(5)?,
            })
        })?;
        Ok(rows.collect::<Result<Vec<_>, _>>()?)
    }

    pub fn get_skill_content(&self, name: &str) -> anyhow::Result<Option<String>> {
        Ok(self
            .connection
            .query_row("SELECT content FROM Skill WHERE name = ?1", [name], |row| {
                row.get(0)
            })
            .optional()?)
    }

    pub fn toggle_skill(&self, name: &str, enabled: bool) -> anyhow::Result<()> {
        self.connection.execute(
            "UPDATE Skill SET enabled = ?1, updatedAt = ?2 WHERE name = ?3",
            params![enabled, Utc::now().to_rfc3339(), name],
        )?;
        Ok(())
    }

    pub fn remove_skill(&self, name: &str) -> anyhow::Result<()> {
        self.connection
            .execute("DELETE FROM Skill WHERE name = ?1 AND bundled = 0", [name])?;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::Database;

    #[test]
    fn migrates_and_persists_meetings() {
        let directory = tempfile::tempdir().unwrap();
        let database = Database::open(&directory.path().join("cheatly.db")).unwrap();
        database
            .create_meeting("meeting-1", "Me: Hello\nThem: Hi")
            .unwrap();
        database.update_meeting_title("meeting-1", "Demo").unwrap();

        let meeting = database.get_meeting("meeting-1").unwrap();
        assert_eq!(meeting.title.as_deref(), Some("Demo"));
        assert_eq!(meeting.transcript.as_deref(), Some("Me: Hello\nThem: Hi"));
    }

    #[test]
    fn persists_context_description() {
        let directory = tempfile::tempdir().unwrap();
        let database = Database::open(&directory.path().join("cheatly.db")).unwrap();
        database.save_context_description("Sales context").unwrap();

        assert_eq!(database.context_description().unwrap(), "Sales context");
    }
}
