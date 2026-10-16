use crate::app_error::coded_command_error;
use sha2::{Digest, Sha256};
use std::collections::VecDeque;
use std::fs::File;
use std::io::{self, Read};
use std::path::{Path, PathBuf};
use std::sync::{Mutex, OnceLock};
use std::time::SystemTime;

const MAX_REGISTERED_LABEL_EXPORTS: usize = 32;

#[derive(Clone, Copy)]
pub(crate) enum SavedLabelKind {
    Png,
    Pdf,
}

impl SavedLabelKind {
    fn extension(self) -> &'static str {
        match self {
            Self::Png => "png",
            Self::Pdf => "pdf",
        }
    }
    fn matches_header(self, bytes: &[u8]) -> bool {
        match self {
            Self::Png => bytes.starts_with(b"\x89PNG\r\n\x1a\n"),
            Self::Pdf => bytes.starts_with(b"%PDF-"),
        }
    }
}

struct RegisteredExport {
    returned_path: PathBuf,
    canonical_path: PathBuf,
    downloads: PathBuf,
    identity: (u64, u64),
    modified: Option<SystemTime>,
    length: u64,
    digest: [u8; 32],
}

#[derive(Default)]
pub(crate) struct SavedLabelExports {
    exports: VecDeque<RegisteredExport>,
}

fn unavailable() -> String {
    coded_command_error("export.saved_file_unavailable")
}

fn regular_file(path: &Path, downloads: &Path) -> Result<(PathBuf, File), String> {
    let metadata = std::fs::symlink_metadata(path).map_err(|_| unavailable())?;
    if !path.is_absolute() || !metadata.is_file() || metadata.file_type().is_symlink() {
        return Err(unavailable());
    }
    let canonical = path.canonicalize().map_err(|_| unavailable())?;
    if canonical.parent() != Some(downloads) {
        return Err(unavailable());
    }
    let file = File::open(&canonical).map_err(|_| unavailable())?;
    if !file.metadata().map_err(|_| unavailable())?.is_file() {
        return Err(unavailable());
    }
    Ok((canonical, file))
}

#[cfg(unix)]
fn identity(file: &File) -> io::Result<(u64, u64)> {
    use std::os::unix::fs::MetadataExt;
    let metadata = file.metadata()?;
    Ok((metadata.dev(), metadata.ino()))
}

#[cfg(windows)]
fn identity(file: &File) -> io::Result<(u64, u64)> {
    use std::os::windows::io::AsRawHandle;
    use windows_sys::Win32::Storage::FileSystem::{
        GetFileInformationByHandle, BY_HANDLE_FILE_INFORMATION,
    };
    let mut info = std::mem::MaybeUninit::<BY_HANDLE_FILE_INFORMATION>::uninit();
    // The File owns this valid handle, and Windows initializes the output on success.
    if unsafe { GetFileInformationByHandle(file.as_raw_handle(), info.as_mut_ptr()) } == 0 {
        return Err(io::Error::last_os_error());
    }
    let info = unsafe { info.assume_init() };
    Ok((
        u64::from(info.dwVolumeSerialNumber),
        u64::from(info.nFileIndexHigh) << 32 | u64::from(info.nFileIndexLow),
    ))
}

impl SavedLabelExports {
    pub(crate) fn register(
        &mut self,
        downloads: &Path,
        path: &Path,
        contents: &[u8],
        kind: SavedLabelKind,
    ) -> Result<(), String> {
        if path.extension().and_then(|value| value.to_str()) != Some(kind.extension())
            || !kind.matches_header(contents)
        {
            return Err(unavailable());
        }
        let downloads = downloads.canonicalize().map_err(|_| unavailable())?;
        let (canonical_path, file) = regular_file(path, &downloads)?;
        let metadata = file.metadata().map_err(|_| unavailable())?;
        if metadata.len() != contents.len() as u64 {
            return Err(unavailable());
        }
        let record = RegisteredExport {
            returned_path: path.to_path_buf(),
            canonical_path,
            downloads,
            identity: identity(&file).map_err(|_| unavailable())?,
            modified: metadata.modified().ok(),
            length: metadata.len(),
            digest: Sha256::digest(contents).into(),
        };
        self.exports
            .retain(|previous| previous.returned_path != record.returned_path);
        self.exports.push_back(record);
        while self.exports.len() > MAX_REGISTERED_LABEL_EXPORTS {
            self.exports.pop_front();
        }
        Ok(())
    }

    pub(crate) fn open_with(
        &self,
        downloads: &Path,
        path: &Path,
        opener: impl FnOnce(&Path) -> io::Result<()>,
    ) -> Result<(), String> {
        let record = self
            .exports
            .iter()
            .find(|record| record.returned_path == path)
            .ok_or_else(unavailable)?;
        let downloads = downloads.canonicalize().map_err(|_| unavailable())?;
        if downloads != record.downloads {
            return Err(unavailable());
        }
        let (canonical, mut file) = regular_file(path, &downloads)?;
        let metadata = file.metadata().map_err(|_| unavailable())?;
        if canonical != record.canonical_path
            || identity(&file).map_err(|_| unavailable())? != record.identity
            || metadata.len() != record.length
            || metadata.modified().ok() != record.modified
        {
            return Err(unavailable());
        }
        let mut digest = Sha256::new();
        let mut bytes_read = 0u64;
        let mut bounded = (&mut file).take(record.length.saturating_add(1));
        let mut buffer = [0u8; 32 * 1024];
        loop {
            let read = bounded.read(&mut buffer).map_err(|_| unavailable())?;
            if read == 0 {
                break;
            }
            bytes_read += read as u64;
            digest.update(&buffer[..read]);
        }
        if bytes_read != record.length || <[u8; 32]>::from(digest.finalize()) != record.digest {
            return Err(unavailable());
        }
        // Check the named file again immediately before handing a path to the OS.
        // Native viewers take a path rather than this verified file descriptor.
        let (final_path, final_file) = regular_file(path, &downloads)?;
        let final_metadata = final_file.metadata().map_err(|_| unavailable())?;
        if final_path != canonical
            || identity(&final_file).map_err(|_| unavailable())? != record.identity
            || final_metadata.len() != record.length
            || final_metadata.modified().ok() != record.modified
        {
            return Err(unavailable());
        }
        opener(&canonical).map_err(|_| coded_command_error("export.open_failed"))
    }
}

pub(crate) fn registry() -> &'static Mutex<SavedLabelExports> {
    static REGISTRY: OnceLock<Mutex<SavedLabelExports>> = OnceLock::new();
    REGISTRY.get_or_init(|| Mutex::new(SavedLabelExports::default()))
}

#[cfg(test)]
mod tests {
    use super::*;
    struct Fixture(PathBuf);
    impl Fixture {
        fn new() -> Self {
            let path = std::env::temp_dir().join(format!(
                "filament-label-open-{}-{}",
                std::process::id(),
                crate::document_commands::chrono_id()
            ));
            std::fs::create_dir_all(&path).unwrap();
            Self(path)
        }
        fn save(&self, name: &str, contents: &[u8]) -> PathBuf {
            let path = self.0.join(name);
            std::fs::write(&path, contents).unwrap();
            path
        }
    }
    impl Drop for Fixture {
        fn drop(&mut self) {
            let _ = std::fs::remove_dir_all(&self.0);
        }
    }
    const PDF: &[u8] = b"%PDF-1.7\nsynthetic label";
    const PNG: &[u8] = b"\x89PNG\r\n\x1a\nsynthetic label";

    #[test]
    fn exact_registered_png_and_pdf_open_as_canonical_native_paths() {
        let fixture = Fixture::new();
        let mut exports = SavedLabelExports::default();
        for (name, contents, kind) in [
            ("label with spaces.png", PNG, SavedLabelKind::Png),
            ("etikett-blå.pdf", PDF, SavedLabelKind::Pdf),
        ] {
            let path = fixture.save(name, contents);
            exports.register(&fixture.0, &path, contents, kind).unwrap();
            let mut called = false;
            exports
                .open_with(&fixture.0, &path, |actual| {
                    called = true;
                    assert_eq!(actual, path.canonicalize().unwrap());
                    Ok(())
                })
                .unwrap();
            assert!(called);
        }
    }
    #[test]
    fn arbitrary_paths_urls_unsupported_extensions_and_unregistered_files_are_rejected() {
        let fixture = Fixture::new();
        let mut exports = SavedLabelExports::default();
        let unknown = fixture.save("unregistered.pdf", PDF);
        for path in [
            unknown,
            PathBuf::from(format!("file://{}", fixture.0.join("label.pdf").display())),
            PathBuf::from("https://example.com/label.pdf"),
            PathBuf::from("label.pdf"),
        ] {
            assert!(exports
                .open_with(&fixture.0, &path, |_| panic!("must not invoke OS"))
                .is_err());
        }
        let executable = fixture.save("label.exe", PDF);
        assert!(exports
            .register(&fixture.0, &executable, PDF, SavedLabelKind::Pdf)
            .is_err());
        let invalid = fixture.save("label.pdf", PNG);
        assert!(exports
            .register(&fixture.0, &invalid, PNG, SavedLabelKind::Pdf)
            .is_err());
        let outside = Fixture::new();
        let outside_path = outside.save("label.pdf", PDF);
        assert!(exports
            .register(&fixture.0, &outside_path, PDF, SavedLabelKind::Pdf)
            .is_err());
    }
    #[test]
    fn missing_changed_replaced_and_relocated_exports_fail_without_launching() {
        let fixture = Fixture::new();
        let mut exports = SavedLabelExports::default();
        for (name, change) in [("deleted.pdf", 0), ("changed.pdf", 1), ("replaced.pdf", 2)] {
            let path = fixture.save(name, PDF);
            exports
                .register(&fixture.0, &path, PDF, SavedLabelKind::Pdf)
                .unwrap();
            match change {
                0 => std::fs::remove_file(&path).unwrap(),
                1 => std::fs::write(&path, b"%PDF-1.7\nchanged contents").unwrap(),
                _ => {
                    std::fs::rename(&path, fixture.0.join("old.pdf")).unwrap();
                    std::fs::write(&path, PDF).unwrap();
                }
            }
            assert!(exports
                .open_with(&fixture.0, &path, |_| panic!("must not invoke OS"))
                .is_err());
        }
        let path = fixture.save("valid.pdf", PDF);
        exports
            .register(&fixture.0, &path, PDF, SavedLabelKind::Pdf)
            .unwrap();
        let elsewhere = Fixture::new();
        assert!(exports
            .open_with(&elsewhere.0, &path, |_| panic!("must not invoke OS"))
            .is_err());
        assert!(exports
            .open_with(
                &fixture.0,
                &fixture.0.join("subdir/../valid.pdf"),
                |_| panic!("must not invoke OS")
            )
            .is_err());
    }
    #[cfg(unix)]
    #[test]
    fn symlinks_cannot_be_registered_or_substituted_for_a_saved_label() {
        use std::os::unix::fs::symlink;
        let fixture = Fixture::new();
        let mut exports = SavedLabelExports::default();
        let target = fixture.save("target.pdf", PDF);
        let link = fixture.0.join("link.pdf");
        symlink(&target, &link).unwrap();
        assert!(exports
            .register(&fixture.0, &link, PDF, SavedLabelKind::Pdf)
            .is_err());
        exports
            .register(&fixture.0, &target, PDF, SavedLabelKind::Pdf)
            .unwrap();
        std::fs::remove_file(&target).unwrap();
        symlink(&link, &target).unwrap();
        assert!(exports
            .open_with(&fixture.0, &target, |_| panic!("must not invoke OS"))
            .is_err());
    }
    #[test]
    fn registry_is_bounded_and_opener_errors_are_safe_codes() {
        let fixture = Fixture::new();
        let mut exports = SavedLabelExports::default();
        let mut first = None;
        for index in 0..=MAX_REGISTERED_LABEL_EXPORTS {
            let path = fixture.save(&format!("label-{index}.pdf"), PDF);
            first.get_or_insert_with(|| path.clone());
            exports
                .register(&fixture.0, &path, PDF, SavedLabelKind::Pdf)
                .unwrap();
        }
        assert_eq!(exports.exports.len(), MAX_REGISTERED_LABEL_EXPORTS);
        assert!(exports
            .open_with(&fixture.0, &first.unwrap(), |_| panic!("expired export"))
            .is_err());
        let last = &exports.exports.back().unwrap().returned_path;
        let error = exports
            .open_with(&fixture.0, last, |_| {
                Err(io::Error::other("private path must not leak"))
            })
            .unwrap_err();
        assert!(error.contains("export.open_failed"));
        assert!(!error.contains("private path"));
    }
}
