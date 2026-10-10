use anyhow::{Context, Result};
use std::{fs, path::Path};

pub fn read(path: &Path) -> Result<String> {
    anyhow::ensure!(
        fs::metadata(path)?.len() <= 20 * 1024 * 1024,
        "Document exceeds 20 MB"
    );
    match path
        .extension()
        .and_then(|s| s.to_str())
        .unwrap_or("")
        .to_ascii_lowercase()
        .as_str()
    {
        "pdf" => read_pdf(path),
        "docx" => read_docx(path),
        "txt" | "md" | "json" | "csv" | "xml" | "html" => Ok(fs::read_to_string(path)?),
        _ => anyhow::bail!("Unsupported document type"),
    }
}

#[cfg(target_os = "macos")]
fn read_pdf(path: &Path) -> Result<String> {
    use objc2::{class, msg_send, rc::Retained, runtime::AnyObject};
    use objc2_foundation::{NSString, NSURL};
    // PDFKit supplies native text extraction without shipping another PDF engine.
    unsafe {
        let url =
            NSURL::fileURLWithPath(&NSString::from_str(path.to_str().context("Invalid path")?));
        let allocated: *mut AnyObject = msg_send![class!(PDFDocument), alloc];
        let document: *mut AnyObject = msg_send![allocated, initWithURL: &*url];
        let document = Retained::from_raw(document).context("Unable to open PDF")?;
        let text: Option<Retained<NSString>> = msg_send![&*document, string];
        let text = text.context("PDF has no extractable text")?.to_string();
        anyhow::ensure!(!text.trim().is_empty(), "PDF has no extractable text");
        Ok(text)
    }
}

#[cfg(target_os = "macos")]
#[link(name = "PDFKit", kind = "framework")]
unsafe extern "C" {}

#[cfg(target_os = "macos")]
fn read_docx(path: &Path) -> Result<String> {
    let output = std::process::Command::new("/usr/bin/textutil")
        .args(["-convert", "txt", "-stdout"])
        .arg(path)
        .output()?;
    anyhow::ensure!(output.status.success(), "Unable to extract DOCX text");
    Ok(String::from_utf8(output.stdout)?)
}

#[cfg(not(target_os = "macos"))]
fn read_pdf(_path: &Path) -> Result<String> {
    anyhow::bail!("PDF import is currently supported on macOS")
}
#[cfg(not(target_os = "macos"))]
fn read_docx(_path: &Path) -> Result<String> {
    anyhow::bail!("DOCX import is currently supported on macOS")
}

#[cfg(test)]
mod tests {
    use super::*;
    #[cfg(target_os = "macos")]
    #[test]
    fn native_document_extractors_read_pdf_and_docx() {
        let root = Path::new(env!("CARGO_MANIFEST_DIR")).join("../tests/native/fixtures");
        assert!(
            read(&root.join("context.pdf"))
                .unwrap()
                .contains("Cobalt Lantern")
        );
        assert!(
            read(&root.join("context.docx"))
                .unwrap()
                .contains("Cobalt Lantern")
        );
    }

    #[test]
    fn imports_text_and_rejects_unknown_types() {
        let directory = tempfile::tempdir().unwrap();
        let path = directory.path().join("context.md");
        fs::write(&path, "Quarterly budget").unwrap();
        assert_eq!(read(&path).unwrap(), "Quarterly budget");
        let path = directory.path().join("binary.exe");
        fs::write(&path, [0, 255]).unwrap();
        assert!(read(&path).is_err());
    }
}
