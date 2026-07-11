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
        .map_err(|error| format!("Invalid PNG payload: {error}"))?;
    if !bytes.starts_with(b"\x89PNG\r\n\x1a\n") {
        return Err("Label export payload is not a PNG image.".to_string());
    }

    let downloads_dir = app
        .path()
        .download_dir()
        .map_err(|error| format!("Could not locate the Downloads folder: {error}"))?;
    std::fs::create_dir_all(&downloads_dir).map_err(|error| error.to_string())?;
    let safe_stem = sanitize_generated_filename_stem(&filename_stem);
    let path = downloads_dir.join(format!("{safe_stem}-{}.png", chrono_id()));
    let bytes = png_with_dpi(&bytes, 300)?;
    write_generated_file(&path, &bytes)?;
    Ok(path.to_string_lossy().into_owned())
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

fn sanitize_generated_filename_stem(value: &str) -> String {
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
        "filament-label".to_string()
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
                .map_err(|_| "Invalid PNG chunk length.".to_string())?,
        ) as usize;
        let chunk_end = offset
            .checked_add(12 + length)
            .filter(|end| *end <= bytes.len())
            .ok_or_else(|| "Invalid PNG chunk bounds.".to_string())?;
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
        return Err("PNG image is missing its IHDR chunk.".to_string());
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
    use super::{chrono_id, png_with_dpi, sanitize_generated_filename_stem, write_generated_file};

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
            sanitize_generated_filename_stem(" filament label #248216 / 24 mm "),
            "filament-label-248216-24-mm"
        );
        assert_eq!(sanitize_generated_filename_stem("..."), "filament-label");
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
