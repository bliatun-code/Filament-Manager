use crate::app_error::{coded_command_error, diagnostic_command_error};
use crate::backend::filament_database::{BackupValidationStats, ImportDataStats};
use crate::state::AppState;
use crate::with_db;
use base64::Engine;
use serde::Serialize;
use std::fs::File;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::time::{Duration, Instant};
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
    with_db(&state, |db| db.validate_full_backup_json(&content))?;
    create_full_restore_recovery_snapshot(Path::new(&state.db_path)).map_err(|error| {
        diagnostic_command_error(
            "common.internal",
            "Create recovery snapshot before full backup restore",
            error,
        )
    })?;
    with_db(&state, |db| db.import_full_backup_json(&content))
}

#[tauri::command]
pub(crate) fn import_data_file(
    state: tauri::State<'_, AppState>,
    content: String,
) -> Result<ImportDataStats, String> {
    if is_full_backup_candidate(&content) {
        with_db(&state, |db| db.validate_full_backup_json(&content))?;
        create_full_restore_recovery_snapshot(Path::new(&state.db_path)).map_err(|error| {
            diagnostic_command_error(
                "common.internal",
                "Create recovery snapshot before data-file restore",
                error,
            )
        })?;
    }
    with_db(&state, |db| db.import_data_content(&content))
}

fn is_full_backup_candidate(content: &str) -> bool {
    serde_json::from_str::<serde_json::Value>(content.trim_start_matches('\u{feff}').trim())
        .ok()
        .is_some_and(|value| {
            value.get("format").and_then(|format| format.as_str())
                == Some("filament-manager-backup-v1")
        })
}

fn create_full_restore_recovery_snapshot(source_path: &Path) -> Result<PathBuf, String> {
    use rusqlite::backup::{Backup, StepResult};

    let parent = source_path.parent().ok_or_else(|| {
        format!(
            "database path has no parent directory: {}",
            source_path.display()
        )
    })?;
    let file_name = source_path
        .file_name()
        .and_then(|value| value.to_str())
        .filter(|value| !value.trim().is_empty())
        .unwrap_or("filament-manager.db");
    let destination_path = parent.join(format!(
        "{file_name}.recovery-before-full-restore-{}.sqlite",
        chrono_id()
    ));

    let result = (|| -> Result<(), String> {
        let source = rusqlite::Connection::open_with_flags(
            source_path,
            rusqlite::OpenFlags::SQLITE_OPEN_READ_ONLY,
        )
        .map_err(|error| format!("failed to open recovery source: {error}"))?;
        let mut destination = rusqlite::Connection::open(&destination_path)
            .map_err(|error| format!("failed to open recovery destination: {error}"))?;

        {
            let backup = Backup::new(&source, &mut destination)
                .map_err(|error| format!("failed to initialize recovery snapshot: {error}"))?;
            let deadline = Instant::now() + Duration::from_secs(5);
            loop {
                match backup
                    .step(128)
                    .map_err(|error| format!("recovery snapshot failed: {error}"))?
                {
                    StepResult::Done => break,
                    StepResult::More => {}
                    StepResult::Busy | StepResult::Locked if Instant::now() < deadline => {
                        std::thread::sleep(Duration::from_millis(25));
                    }
                    StepResult::Busy | StepResult::Locked => {
                        return Err("recovery snapshot remained locked".to_string());
                    }
                    _ => return Err("recovery snapshot returned an unsupported state".to_string()),
                }
            }
        }

        let quick_check = destination
            .query_row("PRAGMA quick_check", [], |row| row.get::<_, String>(0))
            .map_err(|error| format!("failed to validate recovery snapshot: {error}"))?;
        if quick_check != "ok" {
            return Err(format!(
                "recovery snapshot validation failed: {quick_check}"
            ));
        }
        Ok(())
    })();

    if let Err(error) = result {
        let _ = std::fs::remove_file(&destination_path);
        return Err(error);
    }

    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        if let Err(error) =
            std::fs::set_permissions(&destination_path, std::fs::Permissions::from_mode(0o600))
        {
            let _ = std::fs::remove_file(&destination_path);
            return Err(format!(
                "failed to secure recovery snapshot permissions: {error}"
            ));
        }
    }

    Ok(destination_path)
}

#[tauri::command]
pub(crate) fn validate_full_backup_json(
    state: tauri::State<'_, AppState>,
    content: String,
) -> Result<BackupValidationStats, String> {
    with_db(&state, |db| db.validate_full_backup_json(&content))
}

#[tauri::command]
pub(crate) fn export_label_png(
    app: tauri::AppHandle,
    png_base64: String,
    filename_stem: String,
) -> Result<String, String> {
    let encoded = png_base64
        .trim()
        .strip_prefix("data:image/png;base64,")
        .unwrap_or(png_base64.trim());
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(encoded)
        .map_err(|_| coded_command_error("export.invalid_payload"))?;
    if !bytes.starts_with(b"\x89PNG\r\n\x1a\n") {
        return Err(coded_command_error("export.invalid_payload"));
    }

    let downloads_dir = app.path().download_dir().map_err(|error| {
        diagnostic_command_error(
            "export.downloads_unavailable",
            "Locate Downloads folder for label export",
            error,
        )
    })?;
    std::fs::create_dir_all(&downloads_dir).map_err(|error| {
        diagnostic_command_error("export.write_failed", "Create Downloads folder", error)
    })?;
    let safe_stem = sanitize_generated_filename_stem(&filename_stem, "filament-label");
    let path = downloads_dir.join(format!("{safe_stem}-{}.png", chrono_id()));
    let bytes = png_with_dpi(&bytes, 300)?;
    write_generated_file(&path, &bytes)?;
    Ok(path.to_string_lossy().into_owned())
}

#[tauri::command]
pub(crate) fn export_inventory_label_sheet_pdf(
    app: tauri::AppHandle,
    pdf_base64: String,
    filename_stem: String,
) -> Result<String, String> {
    let bytes = decode_pdf_payload(&pdf_base64)?;
    let downloads_dir = app.path().download_dir().map_err(|error| {
        diagnostic_command_error(
            "export.downloads_unavailable",
            "Locate Downloads folder for PDF export",
            error,
        )
    })?;
    std::fs::create_dir_all(&downloads_dir).map_err(|error| {
        diagnostic_command_error("export.write_failed", "Create Downloads folder", error)
    })?;
    let safe_stem =
        sanitize_generated_filename_stem(&filename_stem, "filament-inventory-label-sheet");
    let path = downloads_dir.join(format!("{safe_stem}-{}.pdf", chrono_id()));
    write_generated_file(&path, &bytes)?;
    Ok(path.to_string_lossy().into_owned())
}

fn decode_pdf_payload(pdf_base64: &str) -> Result<Vec<u8>, String> {
    let encoded = pdf_base64
        .trim()
        .strip_prefix("data:application/pdf;base64,")
        .unwrap_or(pdf_base64.trim());
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(encoded)
        .map_err(|_| coded_command_error("export.invalid_payload"))?;
    if !bytes.starts_with(b"%PDF-") {
        return Err(coded_command_error("export.invalid_payload"));
    }
    Ok(bytes)
}

fn write_generated_file(path: &Path, contents: &[u8]) -> Result<(), String> {
    let temp_path = path.with_extension(format!("{}.tmp", chrono_id()));
    let mut file = File::create(&temp_path).map_err(|error| {
        diagnostic_command_error("export.write_failed", "Create temporary export file", error)
    })?;
    file.write_all(contents).map_err(|error| {
        diagnostic_command_error("export.write_failed", "Write temporary export file", error)
    })?;
    file.sync_all().map_err(|error| {
        diagnostic_command_error("export.write_failed", "Sync temporary export file", error)
    })?;
    drop(file);
    std::fs::rename(&temp_path, path).map_err(|error| {
        diagnostic_command_error("export.write_failed", "Finalize exported file", error)
    })?;
    Ok(())
}

fn sanitize_generated_filename_stem(value: &str, fallback: &str) -> String {
    let normalized = value
        .trim()
        .chars()
        .map(|character| {
            if character.is_ascii_alphanumeric() || matches!(character, '-' | '_') {
                character
            } else {
                '-'
            }
        })
        .collect::<String>();
    let compact = normalized
        .split('-')
        .filter(|part| !part.is_empty())
        .collect::<Vec<_>>()
        .join("-");
    if compact.is_empty() {
        fallback.to_string()
    } else {
        compact
    }
}

fn png_with_dpi(bytes: &[u8], dpi: u32) -> Result<Vec<u8>, String> {
    const PNG_SIGNATURE: &[u8; 8] = b"\x89PNG\r\n\x1a\n";
    if !bytes.starts_with(PNG_SIGNATURE) {
        return Err("Label export payload is not a PNG image.".to_string());
    }

    let pixels_per_meter = ((dpi as f64) / 0.0254).round() as u32;
    let mut phys_data = Vec::with_capacity(9);
    phys_data.extend_from_slice(&pixels_per_meter.to_be_bytes());
    phys_data.extend_from_slice(&pixels_per_meter.to_be_bytes());
    phys_data.push(1);
    let phys_chunk = png_chunk(*b"pHYs", &phys_data);

    let mut output = Vec::with_capacity(bytes.len() + phys_chunk.len());
    output.extend_from_slice(PNG_SIGNATURE);
    let mut offset = PNG_SIGNATURE.len();
    let mut inserted = false;
    while offset + 12 <= bytes.len() {
        let length = u32::from_be_bytes(
            bytes[offset..offset + 4]
                .try_into()
                .map_err(|_| coded_command_error("export.invalid_payload"))?,
        ) as usize;
        let chunk_end = offset
            .checked_add(12 + length)
            .filter(|end| *end <= bytes.len())
            .ok_or_else(|| coded_command_error("export.invalid_payload"))?;
        let chunk_type = &bytes[offset + 4..offset + 8];
        if chunk_type != b"pHYs" {
            output.extend_from_slice(&bytes[offset..chunk_end]);
        }
        if chunk_type == b"IHDR" && !inserted {
            output.extend_from_slice(&phys_chunk);
            inserted = true;
        }
        offset = chunk_end;
        if chunk_type == b"IEND" {
            break;
        }
    }
    if !inserted {
        return Err(coded_command_error("export.invalid_payload"));
    }
    Ok(output)
}

fn png_chunk(chunk_type: [u8; 4], data: &[u8]) -> Vec<u8> {
    let mut chunk = Vec::with_capacity(data.len() + 12);
    chunk.extend_from_slice(&(data.len() as u32).to_be_bytes());
    chunk.extend_from_slice(&chunk_type);
    chunk.extend_from_slice(data);
    let mut crc_input = Vec::with_capacity(data.len() + 4);
    crc_input.extend_from_slice(&chunk_type);
    crc_input.extend_from_slice(data);
    chunk.extend_from_slice(&png_crc32(&crc_input).to_be_bytes());
    chunk
}

fn png_crc32(bytes: &[u8]) -> u32 {
    let mut crc = 0xffff_ffff_u32;
    for byte in bytes {
        crc ^= u32::from(*byte);
        for _ in 0..8 {
            let mask = 0_u32.wrapping_sub(crc & 1);
            crc = (crc >> 1) ^ (0xedb8_8320 & mask);
        }
    }
    !crc
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
    use super::{
        chrono_id, create_full_restore_recovery_snapshot, decode_pdf_payload,
        is_full_backup_candidate, png_with_dpi, sanitize_generated_filename_stem,
        write_generated_file,
    };
    use base64::Engine;

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

    #[test]
    fn generated_label_filename_stays_portable() {
        assert_eq!(
            sanitize_generated_filename_stem(" filament label #248216 / 24 mm ", "filament-label",),
            "filament-label-248216-24-mm"
        );
        assert_eq!(
            sanitize_generated_filename_stem("...", "filament-label"),
            "filament-label"
        );
        assert_eq!(
            sanitize_generated_filename_stem("...", "filament-inventory-label-sheet"),
            "filament-inventory-label-sheet"
        );
    }

    #[test]
    fn full_backup_candidate_detection_is_format_specific() {
        assert!(is_full_backup_candidate(
            r#"{"format":"filament-manager-backup-v1","tables":{}}"#
        ));
        assert!(is_full_backup_candidate(
            "\u{feff}  {\"format\":\"filament-manager-backup-v1\",\"tables\":{}}"
        ));
        assert!(!is_full_backup_candidate(r#"{"spools":[]}"#));
        assert!(!is_full_backup_candidate("spool_id,material\nspool-1,PLA"));
        assert!(!is_full_backup_candidate(
            r#"{"format":"filament-manager-backup-v2","tables":{}}"#
        ));
    }

    #[test]
    fn full_restore_recovery_snapshot_is_complete_and_valid() {
        let source_path = std::env::temp_dir().join(format!(
            "filament-manager-recovery-source-{}.db",
            chrono_id()
        ));
        let result = (|| -> Result<(), String> {
            let source =
                rusqlite::Connection::open(&source_path).map_err(|error| error.to_string())?;
            source
                .execute_batch(
                    "CREATE TABLE recovery_probe (value TEXT NOT NULL);\n\
                     INSERT INTO recovery_probe (value) VALUES ('before restore');",
                )
                .map_err(|error| error.to_string())?;
            drop(source);

            let snapshot_path = create_full_restore_recovery_snapshot(&source_path)?;
            assert!(snapshot_path.exists());
            let snapshot =
                rusqlite::Connection::open(&snapshot_path).map_err(|error| error.to_string())?;
            let value: String = snapshot
                .query_row("SELECT value FROM recovery_probe", [], |row| row.get(0))
                .map_err(|error| error.to_string())?;
            assert_eq!(value, "before restore");
            let quick_check: String = snapshot
                .query_row("PRAGMA quick_check", [], |row| row.get(0))
                .map_err(|error| error.to_string())?;
            assert_eq!(quick_check, "ok");
            drop(snapshot);
            std::fs::remove_file(snapshot_path).map_err(|error| error.to_string())?;
            Ok(())
        })();

        let _ = std::fs::remove_file(&source_path);
        if let Err(error) = result {
            panic!("{error}");
        }
    }

    #[test]
    fn inventory_label_sheet_pdf_requires_pdf_magic() {
        let valid = base64::engine::general_purpose::STANDARD.encode(b"%PDF-1.7\ncontent");
        assert_eq!(
            decode_pdf_payload(&valid).expect("valid PDF payload should decode"),
            b"%PDF-1.7\ncontent"
        );

        let invalid = base64::engine::general_purpose::STANDARD.encode(b"not a pdf");
        let error = decode_pdf_payload(&invalid).expect_err("non-PDF payload should fail");
        let parsed: serde_json::Value =
            serde_json::from_str(&error).expect("structured export error");
        assert_eq!(parsed["code"], "export.invalid_payload");
        assert!(!error.contains("not a PDF"));
    }

    #[test]
    fn label_png_gets_300_dpi_physical_resolution() {
        let mut png = b"\x89PNG\r\n\x1a\n".to_vec();
        png.extend_from_slice(&super::png_chunk(*b"IHDR", &[0; 13]));
        png.extend_from_slice(&super::png_chunk(*b"IEND", &[]));
        let result = png_with_dpi(&png, 300).expect("PNG metadata should be written");
        let position = result
            .windows(4)
            .position(|window| window == b"pHYs")
            .expect("pHYs chunk should exist");
        assert_eq!(
            &result[position + 4..position + 8],
            &11_811_u32.to_be_bytes()
        );
        assert_eq!(
            &result[position + 8..position + 12],
            &11_811_u32.to_be_bytes()
        );
        assert_eq!(result[position + 12], 1);
    }
}
