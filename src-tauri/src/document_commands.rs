use crate::backend::filament_database::{BackupValidationStats, ImportDataStats};
use crate::state::AppState;
use crate::with_db;
#[cfg(target_os = "windows")]
use crate::{APP_DB_FILE_NAME, LEGACY_APP_DB_FILE_NAME};
use base64::Engine;
use serde::Serialize;
use std::fs::File;
use std::io::Write;
use std::path::{Path, PathBuf};
use tauri::Manager;

#[derive(Serialize)]
pub(crate) struct ExportPayload {
    content: String,
}

#[tauri::command]
pub(crate) fn export_inventory_csv(
    state: tauri::State<'_, AppState>,
) -> Result<ExportPayload, String> {
    let content = with_db(&state, |db| db.export_spools_csv())?;
    Ok(ExportPayload { content })
}

#[tauri::command]
pub(crate) fn export_inventory_json(
    state: tauri::State<'_, AppState>,
) -> Result<ExportPayload, String> {
    let content = with_db(&state, |db| db.export_spools_json())?;
    Ok(ExportPayload { content })
}

#[tauri::command]
pub(crate) fn export_full_backup_json(
    state: tauri::State<'_, AppState>,
) -> Result<ExportPayload, String> {
    let content = with_db(&state, |db| db.export_full_backup_json())?;
    Ok(ExportPayload { content })
}

#[tauri::command]
pub(crate) fn import_full_backup_json(
    state: tauri::State<'_, AppState>,
    content: String,
) -> Result<(), String> {
    with_db(&state, |db| db.import_full_backup_json(&content))
}

#[tauri::command]
pub(crate) fn import_data_file(
    state: tauri::State<'_, AppState>,
    content: String,
) -> Result<ImportDataStats, String> {
    with_db(&state, |db| db.import_data_content(&content))
}

#[tauri::command]
pub(crate) fn validate_full_backup_json(
    state: tauri::State<'_, AppState>,
    content: String,
) -> Result<BackupValidationStats, String> {
    with_db(&state, |db| db.validate_full_backup_json(&content))
}

#[tauri::command]
pub(crate) fn print_label_html(
    app: tauri::AppHandle,
    html: String,
    printer_name: Option<String>,
    copies: Option<u32>,
) -> Result<(), String> {
    let path = write_label_to_disk(&app, &html)?;
    let _ = printer_name;
    let _ = copies;

    open_generated_document(&path)?;
    Ok(())
}

#[tauri::command]
pub(crate) fn print_label_pdf(
    app: tauri::AppHandle,
    pdf_base64: String,
    printer_name: Option<String>,
    copies: Option<u32>,
) -> Result<(), String> {
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(pdf_base64.trim())
        .map_err(|error| format!("Invalid PDF payload: {error}"))?;
    let path = write_pdf_to_disk(&app, &bytes)?;
    let _ = printer_name;
    let _ = copies;

    open_generated_document(&path)?;
    Ok(())
}

fn write_label_to_disk(app: &tauri::AppHandle, html: &str) -> Result<PathBuf, String> {
    let app_dir = resolve_app_storage_dir_for_handle(app)?;
    let label_dir = app_dir.join("labels");
    std::fs::create_dir_all(&label_dir).map_err(|error| error.to_string())?;
    let filename = format!("label_{}.html", chrono_id());
    let path = label_dir.join(filename);
    write_generated_file(&path, html.as_bytes())?;
    Ok(path)
}

fn write_pdf_to_disk(app: &tauri::AppHandle, bytes: &[u8]) -> Result<PathBuf, String> {
    let app_dir = resolve_app_storage_dir_for_handle(app)?;
    let label_dir = app_dir.join("labels");
    std::fs::create_dir_all(&label_dir).map_err(|error| error.to_string())?;
    let filename = format!("label_{}.pdf", chrono_id());
    let path = label_dir.join(filename);
    write_generated_file(&path, bytes)?;
    Ok(path)
}

fn resolve_app_storage_dir_for_handle(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|error| error.to_string())?;
    #[cfg(target_os = "windows")]
    {
        let app_local_data_dir = app
            .path()
            .app_local_data_dir()
            .map_err(|error| error.to_string())?;
        Ok(resolve_windows_storage_dir(
            app_data_dir,
            app_local_data_dir,
        ))
    }

    #[cfg(not(target_os = "windows"))]
    {
        Ok(app_data_dir)
    }
}

#[cfg(target_os = "windows")]
fn resolve_windows_storage_dir(roaming_dir: PathBuf, local_dir: PathBuf) -> PathBuf {
    if storage_dir_has_database(&local_dir) {
        return local_dir;
    }
    if storage_dir_has_database(&roaming_dir) {
        return roaming_dir;
    }
    local_dir
}

#[cfg(target_os = "windows")]
fn storage_dir_has_database(dir: &Path) -> bool {
    [APP_DB_FILE_NAME, LEGACY_APP_DB_FILE_NAME]
        .iter()
        .any(|file_name| dir.join(file_name).exists())
}

fn write_generated_file(path: &Path, contents: &[u8]) -> Result<(), String> {
    let temp_path = path.with_extension(format!("{}.tmp", chrono_id()));
    let mut file = File::create(&temp_path).map_err(|error| error.to_string())?;
    file.write_all(contents)
        .map_err(|error| error.to_string())?;
    file.sync_all().map_err(|error| error.to_string())?;
    drop(file);
    std::fs::rename(&temp_path, path).map_err(|error| error.to_string())?;
    Ok(())
}

fn open_generated_document(path: &Path) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        open::that(path).map_err(|error| {
            format!("Failed to open generated file in the default Windows handler: {error}")
        })?;
        Ok(())
    }

    #[cfg(not(target_os = "windows"))]
    {
        open::that(path).map_err(|error| error.to_string())?;
        Ok(())
    }
}

pub(crate) fn chrono_id() -> String {
    let nanos = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_nanos();
    nanos.to_string()
}

#[cfg(test)]
mod tests {
    use super::{chrono_id, write_generated_file};

    #[test]
    fn generated_file_write_persists_contents() {
        let path = std::env::temp_dir().join(format!("filament-manager-write-{}.txt", chrono_id()));
        let result = (|| -> Result<(), String> {
            write_generated_file(&path, b"hello windows rc")?;
            let contents = std::fs::read_to_string(&path).map_err(|error| error.to_string())?;
            assert_eq!(contents, "hello windows rc");
            Ok(())
        })();

        let _ = std::fs::remove_file(&path);
        if let Err(error) = result {
            panic!("{error}");
        }
    }
}
