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

    pub fn save_generated_summary(
        &self,
        id: &str,
        revision: &str,
        title: &str,
        summary: &str,
    ) -> anyhow::Result<()> {
        let changed = self.connection.execute(
            "UPDATE Meeting SET title = ?1, summary = ?2, updatedAt = ?3 WHERE id = ?4 AND updatedAt = ?5",
            params![title, summary, Utc::now().to_rfc3339(), id, revision],
        )?;
        anyhow::ensure!(
            changed == 1,
            "Meeting changed or was removed while generating summary"
        );
        Ok(())
    }

    pub fn checkpoint(&self) -> anyhow::Result<()> {
        let (busy, _, _): (i32, i32, i32) =
            self.connection
                .query_row("PRAGMA wal_checkpoint(TRUNCATE)", [], |row| {
                    Ok((row.get(0)?, row.get(1)?, row.get(2)?))
                })?;
        anyhow::ensure!(busy == 0, "Database checkpoint blocked by an active reader");
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

    pub fn create_context_file(
        &self,
        filename: &str,
        storage_path: &str,
    ) -> anyhow::Result<ContextFileRow> {
        let id = uuid::Uuid::new_v4().to_string();
        let created_at = Utc::now().to_rfc3339();
        self.connection.execute(
            "INSERT INTO File(id, filename, storagePath, attachableType, attachableId, createdAt) VALUES (?1, ?2, ?3, 'context', 'default', ?4)",
            params![id, filename, storage_path, created_at],
        )?;
        Ok(ContextFileRow {
            id,
            filename: filename.to_owned(),
            storage_path: storage_path.to_owned(),
            created_at,
        })
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

    pub fn seed_skill(&self, name: &str, description: &str, content: &str) -> anyhow::Result<()> {
        self.connection.execute("INSERT OR IGNORE INTO Skill(id,name,description,content,enabled,bundled,createdAt,updatedAt) VALUES (?1,?2,?3,?4,1,1,?5,?5)", params![uuid::Uuid::new_v4().to_string(), name, description, content, Utc::now().to_rfc3339()])?;
        Ok(())
    }

    pub fn create_skill(&self, name: &str, description: &str, content: &str) -> anyhow::Result<()> {
        let now = Utc::now().to_rfc3339();
        self.connection.execute(
            "INSERT INTO Skill(id, name, description, content, enabled, bundled, createdAt, updatedAt) VALUES (?1, ?2, ?3, ?4, 1, 0, ?5, ?5)",
            params![uuid::Uuid::new_v4().to_string(), name, description, content, now],
        )?;
        Ok(())
    }

    pub fn update_skill(
        &self,
        name: &str,
        description: Option<&str>,
        content: Option<&str>,
        enabled: Option<bool>,
    ) -> anyhow::Result<()> {
        if let Some(description) = description {
            self.connection.execute(
                "UPDATE Skill SET description = ?1, updatedAt = ?2 WHERE name = ?3",
                params![description, Utc::now().to_rfc3339(), name],
            )?;
        }
        if let Some(content) = content {
            self.connection.execute(
                "UPDATE Skill SET content = ?1, updatedAt = ?2 WHERE name = ?3",
                params![content, Utc::now().to_rfc3339(), name],
            )?;
        }
        if let Some(enabled) = enabled {
            self.toggle_skill(name, enabled)?;
        }
        Ok(())
    }

    pub fn toggle_skill(&self, name: &str, enabled: bool) -> anyhow::Result<()> {
        self.connection.execute(
            "UPDATE Skill SET enabled = ?1, updatedAt = ?2 WHERE name = ?3",
            params![enabled, Utc::now().to_rfc3339(), name],
        )?;
        Ok(())
    }

    pub fn remove_skill(&self, name: &str) -> anyhow::Result<()> {
        let bundled: bool = self.connection.query_row(
            "SELECT bundled FROM Skill WHERE name = ?1",
            [name],
            |row| row.get(0),
        )?;
        anyhow::ensure!(!bundled, "Bundled skills cannot be deleted");
        self.connection
            .execute("DELETE FROM Skill WHERE name = ?1 AND bundled = 0", [name])?;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::Database;
    #[test]
    fn meeting_edits_survive_reopen_and_delete_is_isolated() {
        let directory = tempfile::tempdir().unwrap();
        let path = directory.path().join("meetings.db");
        let db = Database::open(&path).unwrap();
        let transcript = "Me: Bonjour: budget €50\nThem: 明日ですか？";
        db.create_meeting("one", transcript).unwrap();
        db.create_meeting("two", "Them: Keep me").unwrap();
        db.update_meeting_title("one", "User title").unwrap();
        db.update_meeting_summary("one", "User summary").unwrap();
        drop(db);
        let db = Database::open(&path).unwrap();
        let row = db.get_meeting("one").unwrap();
        assert_eq!(row.transcript.as_deref(), Some(transcript));
        assert_eq!(row.title.as_deref(), Some("User title"));
        assert_eq!(row.summary.as_deref(), Some("User summary"));
        assert!(db.create_meeting("one", "overwrite attempt").is_err());
        assert_eq!(
            db.get_meeting("one").unwrap().transcript.as_deref(),
            Some(transcript)
        );
        db.delete_meeting("one").unwrap();
        db.delete_meeting("one").unwrap();
        assert!(db.get_meeting("one").is_err());
        assert_eq!(db.list_meetings().unwrap().len(), 1);
        assert_eq!(
            db.get_meeting("two").unwrap().transcript.as_deref(),
            Some("Them: Keep me")
        );
    }

    #[test]
    fn reseeding_preserves_skill_edits_and_bundled_skills_cannot_be_deleted() {
        let directory = tempfile::tempdir().unwrap();
        let db = Database::open(&directory.path().join("skills.db")).unwrap();
        db.seed_skill("bundled", "Original", "Original content")
            .unwrap();
        db.update_skill(
            "bundled",
            Some("Edited"),
            Some("Edited content"),
            Some(false),
        )
        .unwrap();
        db.seed_skill("bundled", "New default", "New default content")
            .unwrap();
        let skills = db.list_skills().unwrap();
        assert_eq!(skills.len(), 1);
        assert_eq!(skills[0].description, "Edited");
        assert!(!skills[0].enabled);
        assert!(skills[0].bundled);
        assert_eq!(
            db.get_skill_content("bundled").unwrap().as_deref(),
            Some("Edited content")
        );
        assert!(db.remove_skill("bundled").is_err());
        db.create_skill("custom", "Imported", "Custom content")
            .unwrap();
        db.remove_skill("custom").unwrap();
        assert!(db.get_skill_content("custom").unwrap().is_none());
        assert_eq!(db.list_skills().unwrap().len(), 1);
    }

    #[test]
    fn context_updates_replace_description_and_file_deletion_returns_path() {
        let directory = tempfile::tempdir().unwrap();
        let db = Database::open(&directory.path().join("context.db")).unwrap();
        assert_eq!(db.context_description().unwrap(), "");
        db.save_context_description("First").unwrap();
        db.save_context_description("Updated 世界").unwrap();
        let first = db.create_context_file("one.txt", "/test/one.txt").unwrap();
        let second = db.create_context_file("two.txt", "/test/two.txt").unwrap();
        assert_eq!(db.context_description().unwrap(), "Updated 世界");
        assert_eq!(
            db.delete_context_file(&first.id).unwrap().as_deref(),
            Some("/test/one.txt")
        );
        assert!(db.delete_context_file(&first.id).unwrap().is_none());
        let remaining = db.list_context_files().unwrap();
        assert_eq!(remaining.len(), 1);
        assert_eq!(remaining[0].id, second.id);
    }

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
    #[test]
    fn checkpoint_preserves_data_on_reopen() {
        let directory = tempfile::tempdir().unwrap();
        let path = directory.path().join("check.db");
        let database = Database::open(&path).unwrap();
        database.create_meeting("one", "Me: Still here").unwrap();
        database.checkpoint().unwrap();
        database.checkpoint().unwrap();
        drop(database);
        assert_eq!(
            Database::open(&path)
                .unwrap()
                .get_meeting("one")
                .unwrap()
                .transcript
                .as_deref(),
            Some("Me: Still here")
        );
    }
}
