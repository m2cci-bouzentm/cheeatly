use crate::database::Database;
use std::{fs, path::PathBuf, sync::Mutex};
pub fn import_files(
    database: &Mutex<Database>,
    files: Vec<PathBuf>,
) -> anyhow::Result<Vec<String>> {
    let mut imported = Vec::new();
    for file in files {
        let path = file;
        let content = fs::read_to_string(&path).map_err(|e| anyhow::anyhow!(e.to_string()))?;
        let fallback = path
            .file_stem()
            .and_then(|name| name.to_str())
            .unwrap_or("skill");
        let name = frontmatter_value(&content, "name").unwrap_or(fallback);
        let description = frontmatter_value(&content, "description").unwrap_or("");
        database
            .lock()
            .map_err(|e| anyhow::anyhow!(e.to_string()))?
            .create_skill(name, description, &content)
            .map_err(|e| anyhow::anyhow!(e.to_string()))?;
        imported.push(name.to_owned());
    }
    Ok(imported)
}

pub(crate) fn frontmatter_value<'a>(content: &'a str, key: &str) -> Option<&'a str> {
    let frontmatter = content.strip_prefix("---\n")?.split_once("\n---")?.0;
    frontmatter.lines().find_map(|line| {
        let (name, value) = line.split_once(':')?;
        (name.trim() == key).then(|| value.trim())
    })
}
