use crate::database::Database;
use std::{fs, path::Path, sync::Mutex};

pub fn save_description(database: &Mutex<Database>, content: &str) -> anyhow::Result<()> {
    let content: String = content.chars().take(4000).collect();
    database
        .lock()
        .map_err(|e| anyhow::anyhow!(e.to_string()))?
        .save_context_description(&content)
}
pub fn delete_file(database: &Mutex<Database>, id: &str) -> anyhow::Result<()> {
    if let Some(path) = database
        .lock()
        .map_err(|e| anyhow::anyhow!(e.to_string()))?
        .delete_context_file(id)?
    {
        let _ = fs::remove_file(path);
    }
    Ok(())
}
pub fn import_file(
    database: &Mutex<Database>,
    storage: &Path,
    source: &Path,
) -> anyhow::Result<serde_json::Value> {
    let filename = source
        .file_name()
        .and_then(|name| name.to_str())
        .ok_or_else(|| anyhow::anyhow!("Invalid filename"))?;
    let content = super::documents::read(source)?;
    fs::create_dir_all(storage)?;
    let destination = storage.join(format!("{}-{}", uuid::Uuid::new_v4(), filename));
    fs::write(&destination, content)?;
    let result = database
        .lock()
        .map_err(|e| anyhow::anyhow!(e.to_string()))?
        .create_context_file(filename, destination.to_string_lossy().as_ref());
    match result {
        Ok(file) => Ok(serde_json::to_value(file)?),
        Err(error) => {
            let _ = fs::remove_file(destination);
            Err(error)
        }
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn import_delete_and_unicode_description_limit() {
        let dir = tempfile::tempdir().unwrap();
        let db = Mutex::new(Database::open(&dir.path().join("db")).unwrap());
        save_description(&db, &"é".repeat(4001)).unwrap();
        assert_eq!(
            db.lock()
                .unwrap()
                .context_description()
                .unwrap()
                .chars()
                .count(),
            4000
        );
        let source = dir.path().join("note.txt");
        fs::write(&source, "Context").unwrap();
        let file = import_file(&db, &dir.path().join("files"), &source).unwrap();
        let row = db.lock().unwrap().list_context_files().unwrap().remove(0);
        assert_eq!(fs::read_to_string(&row.storage_path).unwrap(), "Context");
        delete_file(&db, file["id"].as_str().unwrap()).unwrap();
        assert!(!Path::new(&row.storage_path).exists());
        assert!(db.lock().unwrap().list_context_files().unwrap().is_empty());
    }
}
