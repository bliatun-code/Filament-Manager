use crate::app_error::{
    coded_command_error, document_command_error, document_inventory_error_to_command_string,
};
use crate::backend::filament_database::{BackupValidationStats, FilamentDatabase, ImportDataStats};
use crate::inventory_maintenance_commands::{
    clear_pending_credential_cleanup, persist_pending_credential_cleanup,
    retry_pending_credential_cleanup_under_gate, StoredCredentialScopes,
};
use crate::secure_credential_mutation::lock_secure_credential_mutation;
use crate::sqlite_recovery::{
    sanitize_app_recovery_snapshot_credentials, RecoveryReason, RecoverySnapshot,
};
use crate::state::AppState;
use crate::trusted_lan_runtime_commands::reload_trusted_lan_runtime_after_library_change;
use base64::Engine;
use serde::Serialize;
use std::fs::File;
use std::io::Write;
use std::path::Path;
use tauri::Manager;

#[derive(Serialize)]
pub(crate) struct ExportPayload {
    content: String,
}

#[tauri::command]
pub(crate) fn export_inventory_csv(
    state: tauri::State<'_, AppState>,
) -> Result<ExportPayload, String> {
    let content = with_document_db(&state, |db| db.export_spools_csv())?;
    Ok(ExportPayload { content })
}

#[tauri::command]
pub(crate) fn export_inventory_json(
    state: tauri::State<'_, AppState>,
) -> Result<ExportPayload, String> {
    let content = with_document_db(&state, |db| db.export_spools_json())?;
    Ok(ExportPayload { content })
}

#[tauri::command]
pub(crate) fn export_full_backup_json(
    state: tauri::State<'_, AppState>,
) -> Result<ExportPayload, String> {
    let content = with_document_db(&state, |db| db.export_full_backup_json())?;
    Ok(ExportPayload { content })
}

#[tauri::command]
pub(crate) fn import_full_backup_json(
    state: tauri::State<'_, AppState>,
    content: String,
) -> Result<(), String> {
    import_full_backup_json_inner(&state, content)
}

fn import_full_backup_json_inner(state: &AppState, content: String) -> Result<(), String> {
    let _credential_mutation = lock_secure_credential_mutation()?;
    retry_pending_full_restore_credential_cleanup(state)?;
    let db = open_exclusive_document_database(&state.db_path)?;
    db.validate_full_backup_json(&content)
        .map_err(document_inventory_error_to_command_string)?;
    let credential_scopes = StoredCredentialScopes::from_database(&db)
        .map_err(document_inventory_error_to_command_string)?;
    prepare_full_restore_credential_cleanup(state, &credential_scopes)?;
    let recovery_snapshot = create_full_restore_recovery_snapshot(Path::new(&state.db_path))
        .map_err(|error| {
            let _ = clear_pending_credential_cleanup(Path::new(&state.db_path));
            document_command_error(
                "common.internal",
                "Create recovery snapshot before full backup restore",
                error,
            )
        })?;
    let restore_result = db
        .import_full_backup_json(&content)
        .map_err(document_inventory_error_to_command_string);
    drop(db);
    finish_full_restore_and_purge_credentials(
        state,
        credential_scopes,
        recovery_snapshot,
        restore_result,
    )
}

#[tauri::command]
pub(crate) fn import_data_file(
    state: tauri::State<'_, AppState>,
    content: String,
) -> Result<ImportDataStats, String> {
    import_data_file_inner(&state, content)
}

fn import_data_file_inner(state: &AppState, content: String) -> Result<ImportDataStats, String> {
    if is_full_backup_candidate(&content) {
        let _credential_mutation = lock_secure_credential_mutation()?;
        retry_pending_full_restore_credential_cleanup(state)?;
        let db = open_exclusive_document_database(&state.db_path)?;
        db.validate_full_backup_json(&content)
            .map_err(document_inventory_error_to_command_string)?;
        let credential_scopes = StoredCredentialScopes::from_database(&db)
            .map_err(document_inventory_error_to_command_string)?;
        prepare_full_restore_credential_cleanup(state, &credential_scopes)?;
        let recovery_snapshot = create_full_restore_recovery_snapshot(Path::new(&state.db_path))
            .map_err(|error| {
                let _ = clear_pending_credential_cleanup(Path::new(&state.db_path));
                document_command_error(
                    "common.internal",
                    "Create recovery snapshot before data-file restore",
                    error,
                )
            })?;
        let restore_result = db
            .import_data_content(&content)
            .map_err(document_inventory_error_to_command_string);
        drop(db);
        finish_full_restore_and_purge_credentials(
            state,
            credential_scopes,
            recovery_snapshot,
            restore_result,
        )
    } else {
        with_document_db(state, |db| db.import_data_content(&content))
    }
}

fn with_document_db<Func, Output>(state: &AppState, func: Func) -> Result<Output, String>
where
    Func: FnOnce(&FilamentDatabase) -> crate::backend::database_result::InventoryResult<Output>,
{
    let db = FilamentDatabase::open(&state.db_path)
        .map_err(document_inventory_error_to_command_string)?;
    func(&db).map_err(document_inventory_error_to_command_string)
}

fn open_exclusive_document_database(path: &str) -> Result<FilamentDatabase, String> {
    FilamentDatabase::open_exclusive_maintenance(path)
        .map_err(document_inventory_error_to_command_string)
}

fn is_full_backup_candidate(content: &str) -> bool {
    serde_json::from_str::<serde_json::Value>(content.trim_start_matches('\u{feff}').trim())
        .ok()
        .is_some_and(|value| {
            value.get("format").and_then(|format| format.as_str())
                == Some("filament-manager-backup-v1")
        })
}

fn create_full_restore_recovery_snapshot(source_path: &Path) -> Result<RecoverySnapshot, String> {
    RecoverySnapshot::create(source_path, RecoveryReason::FullRestore)
}

fn prepare_full_restore_credential_cleanup(
    state: &AppState,
    credential_scopes: &StoredCredentialScopes,
) -> Result<(), String> {
    let db_path = Path::new(&state.db_path);
    persist_pending_credential_cleanup(db_path, &state.credentials, credential_scopes).map_err(
        |error| {
            document_command_error(
                "common.internal",
                "Persist secure credential cleanup before full restore",
                error,
            )
        },
    )
}

fn retry_pending_full_restore_credential_cleanup(state: &AppState) -> Result<(), String> {
    retry_pending_credential_cleanup_under_gate(
        Path::new(&state.db_path),
        &state.credentials,
        &state.library_sync_auth,
    )
    .map(|_| ())
    .map_err(|error| {
        document_command_error(
            "common.internal",
            "Retry pending secure credential cleanup before full restore",
            error,
        )
    })
}

fn finish_full_restore<T>(
    recovery_snapshot: RecoverySnapshot,
    result: Result<T, String>,
) -> Result<T, String> {
    match result {
        Ok(value) => {
            recovery_snapshot.mark_operation_succeeded();
            Ok(value)
        }
        Err(error) => {
            recovery_snapshot.mark_operation_failed();
            Err(error)
        }
    }
}

fn finish_full_restore_and_purge_credentials<T>(
    state: &AppState,
    _credential_scopes: StoredCredentialScopes,
    recovery_snapshot: RecoverySnapshot,
    result: Result<T, String>,
) -> Result<T, String> {
    let restore_result = finish_full_restore(recovery_snapshot, result);
    let snapshot_sanitize_result =
        sanitize_app_recovery_snapshot_credentials(Path::new(&state.db_path));

    match restore_result {
        Ok(value) => {
            let mut first_error = None;
            let purge_result = retry_pending_credential_cleanup_under_gate(
                Path::new(&state.db_path),
                &state.credentials,
                &state.library_sync_auth,
            );
            if let Err(error) = purge_result {
                first_error = Some(document_command_error(
                    "common.internal",
                    "Remove machine-local credentials after full restore",
                    error,
                ));
            }
            if let Err(error) = snapshot_sanitize_result {
                let error = document_command_error(
                    "common.internal",
                    "Sanitize recovery snapshots after full restore",
                    error,
                );
                first_error.get_or_insert(error);
            }
            if let Err(error) = reload_trusted_lan_runtime_after_library_change(state) {
                let error = document_command_error(
                    "common.internal",
                    "Reload local network state after full restore",
                    error,
                );
                first_error.get_or_insert(error);
            }
            first_error.map_or(Ok(value), Err)
        }
        Err(error) => {
            if let Err(cleanup_error) = clear_pending_credential_cleanup(Path::new(&state.db_path))
            {
                let _ = document_command_error(
                    "common.internal",
                    "Cancel secure credential cleanup after failed full restore",
                    cleanup_error,
                );
            }
            if let Err(snapshot_error) = snapshot_sanitize_result {
                let _ = document_command_error(
                    "common.internal",
                    "Sanitize failed full-restore recovery snapshot",
                    snapshot_error,
                );
            }
            Err(error)
        }
    }
}

#[tauri::command]
pub(crate) fn validate_full_backup_json(
    state: tauri::State<'_, AppState>,
    content: String,
) -> Result<BackupValidationStats, String> {
    with_document_db(&state, |db| db.validate_full_backup_json(&content))
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
        document_command_error(
            "export.downloads_unavailable",
            "Locate Downloads folder for label export",
            error,
        )
    })?;
    std::fs::create_dir_all(&downloads_dir).map_err(|error| {
        document_command_error("export.write_failed", "Create Downloads folder", error)
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
        document_command_error(
            "export.downloads_unavailable",
            "Locate Downloads folder for PDF export",
            error,
        )
    })?;
    std::fs::create_dir_all(&downloads_dir).map_err(|error| {
        document_command_error("export.write_failed", "Create Downloads folder", error)
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
        document_command_error("export.write_failed", "Create temporary export file", error)
    })?;
    file.write_all(contents).map_err(|error| {
        document_command_error("export.write_failed", "Write temporary export file", error)
    })?;
    file.sync_all().map_err(|error| {
        document_command_error("export.write_failed", "Sync temporary export file", error)
    })?;
    drop(file);
    std::fs::rename(&temp_path, path).map_err(|error| {
        document_command_error("export.write_failed", "Finalize exported file", error)
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
        chrono_id, create_full_restore_recovery_snapshot, decode_pdf_payload, finish_full_restore,
        import_data_file_inner, import_full_backup_json_inner, is_full_backup_candidate,
        png_with_dpi, sanitize_generated_filename_stem, write_generated_file,
    };
    use crate::backend::filament_database::{BambuLiveIntegrationRow, FilamentDatabase};
    use crate::credential_store::{CredentialKey, CredentialStore, SecretValue};
    use crate::inventory_maintenance_commands::retry_pending_credential_cleanup;
    use crate::library_sync_runtime_auth::LibrarySyncRuntimeAuth;
    use crate::state::{
        AppState, CompanionRuntimeState, TrustedLanCompanionRuntime, TRUSTED_LAN_DEFAULT_PORT,
    };
    use base64::Engine;
    use std::path::Path;
    use std::sync::{mpsc, Arc, Barrier};
    use std::time::Duration;

    fn credential_test_state(label: &str) -> AppState {
        credential_test_state_with_store(label, CredentialStore::in_memory())
    }

    fn credential_test_state_with_store(label: &str, credentials: CredentialStore) -> AppState {
        let db_path = std::env::temp_dir().join(format!(
            "filament-manager-{label}-{}-{}.sqlite",
            std::process::id(),
            chrono_id()
        ));
        let db = FilamentDatabase::open(&db_path).expect("create test database");
        db.apply_schema().expect("apply schema");
        AppState {
            db_path: db_path.to_string_lossy().into_owned(),
            companion: CompanionRuntimeState::new(TrustedLanCompanionRuntime::new(
                TRUSTED_LAN_DEFAULT_PORT,
            )),
            credentials,
            library_sync_auth: LibrarySyncRuntimeAuth::new(),
        }
    }

    fn seed_machine_local_credentials(state: &AppState) -> (CredentialKey, CredentialKey) {
        let printer_id = "printer_1";
        let library_host = "http://library-host.local:4278";
        let db = FilamentDatabase::open(&state.db_path).expect("open test database");
        db.upsert_printer_with_ams(printer_id, "Bambu Lab P1S", "Printer", 1, 4)
            .expect("create printer");
        db.save_bambu_live_integration(
            printer_id,
            &BambuLiveIntegrationRow {
                enabled: true,
                host: Some("192.168.1.42".to_string()),
                access_code: None,
                access_code_configured: true,
                access_code_binding_id: Some("11111111111111111111111111111111".to_string()),
                access_code_stale_binding_ids: Vec::new(),
                printer_serial: Some("SERIAL".to_string()),
                last_error: None,
                tls_identity: None,
                observed_state: None,
            },
        )
        .expect("save Bambu integration");
        let mut settings = db
            .get_library_sync_settings()
            .expect("read library settings");
        settings.mode = "CLIENT".to_string();
        settings.host_base_url = Some(library_host.to_string());
        db.save_library_sync_settings(&settings)
            .expect("save library settings");
        drop(db);

        let bambu_key =
            CredentialKey::bambu_access_code(printer_id, "11111111111111111111111111111111")
                .expect("Bambu key");
        state
            .credentials
            .set(
                &bambu_key,
                &SecretValue::from_utf8("access-code".to_string()),
            )
            .expect("store Bambu credential");
        let library_key =
            CredentialKey::library_sync_client_device_token(library_host).expect("library key");
        state
            .credentials
            .set(
                &library_key,
                &SecretValue::from_utf8("device-token".to_string()),
            )
            .expect("store library credential");
        state
            .library_sync_auth
            .replace(library_host, "session", "csrf")
            .expect("store runtime auth");
        (bambu_key, library_key)
    }

    fn empty_full_backup() -> String {
        let path = std::env::temp_dir().join(format!(
            "filament-manager-empty-backup-{}-{}.sqlite",
            std::process::id(),
            chrono_id()
        ));
        let db = FilamentDatabase::open(&path).expect("create source database");
        db.apply_schema().expect("apply source schema");
        let content = db.export_full_backup_json().expect("export source backup");
        drop(db);
        let _ = std::fs::remove_file(path);
        content
    }

    fn remove_test_database_and_snapshots(state: &AppState) {
        let path = std::path::Path::new(&state.db_path);
        let base_name = path
            .file_name()
            .and_then(|value| value.to_str())
            .unwrap_or_default();
        if let Some(parent) = path.parent()
            && let Ok(entries) = std::fs::read_dir(parent)
        {
            for entry in entries.flatten() {
                if entry
                    .file_name()
                    .to_string_lossy()
                    .starts_with(&format!("{base_name}.recovery-"))
                {
                    let _ = std::fs::remove_file(entry.path());
                }
            }
        }
        let mut cleanup_manifest_name = path.file_name().map_or_else(
            || std::ffi::OsString::from("filament-manager.db"),
            std::ffi::OsString::from,
        );
        cleanup_manifest_name.push(".pending-credential-cleanup-v1.json");
        let _ = std::fs::remove_file(path.with_file_name(cleanup_manifest_name));
        let _ = std::fs::remove_file(path);
    }

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

            let snapshot_path =
                create_full_restore_recovery_snapshot(&source_path)?.mark_operation_succeeded();
            assert!(snapshot_path.exists());
            assert!(snapshot_path
                .file_name()
                .and_then(|value| value.to_str())
                .is_some_and(|value| value.contains("recovery-full-restore-successful-")));
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
    fn full_restore_maintenance_keeps_concurrent_writer_out_of_the_restore_gap() {
        let source_path = std::env::temp_dir().join(format!(
            "filament-manager-serialized-restore-source-{}.db",
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

            let maintenance = FilamentDatabase::open_exclusive_maintenance(&source_path)
                .map_err(|error| error.to_string())?;
            let snapshot = create_full_restore_recovery_snapshot(&source_path)?;

            let barrier = Arc::new(Barrier::new(2));
            let writer_barrier = Arc::clone(&barrier);
            let writer_path = source_path.clone();
            let (committed_tx, committed_rx) = mpsc::channel();
            let writer = std::thread::spawn(move || -> Result<(), String> {
                writer_barrier.wait();
                let db = FilamentDatabase::open(&writer_path).map_err(|error| error.to_string())?;
                db.connection()
                    .execute(
                        "INSERT INTO recovery_probe (value) VALUES ('concurrent writer')",
                        [],
                    )
                    .map_err(|error| error.to_string())?;
                committed_tx.send(()).map_err(|error| error.to_string())?;
                Ok(())
            });

            barrier.wait();
            assert!(
                committed_rx
                    .recv_timeout(Duration::from_millis(200))
                    .is_err(),
                "writer committed while the verified recovery point was being restored"
            );
            maintenance
                .connection()
                .execute("DELETE FROM recovery_probe", [])
                .map_err(|error| error.to_string())?;
            let snapshot_path = snapshot.mark_operation_succeeded();
            drop(maintenance);

            committed_rx
                .recv_timeout(Duration::from_secs(2))
                .map_err(|error| error.to_string())?;
            writer
                .join()
                .map_err(|_| "concurrent writer panicked".to_string())??;

            let restored =
                rusqlite::Connection::open(&source_path).map_err(|error| error.to_string())?;
            let values = restored
                .prepare("SELECT value FROM recovery_probe ORDER BY rowid")
                .map_err(|error| error.to_string())?
                .query_map([], |row| row.get::<_, String>(0))
                .map_err(|error| error.to_string())?
                .collect::<Result<Vec<_>, _>>()
                .map_err(|error| error.to_string())?;
            assert_eq!(values, vec!["concurrent writer"]);
            drop(restored);

            let recovery =
                rusqlite::Connection::open(&snapshot_path).map_err(|error| error.to_string())?;
            let recovery_value: String = recovery
                .query_row("SELECT value FROM recovery_probe", [], |row| row.get(0))
                .map_err(|error| error.to_string())?;
            assert_eq!(recovery_value, "before restore");
            drop(recovery);
            std::fs::remove_file(snapshot_path).map_err(|error| error.to_string())?;
            Ok(())
        })();

        let _ = std::fs::remove_file(&source_path);
        if let Err(error) = result {
            panic!("{error}");
        }
    }

    #[test]
    fn failed_full_restore_keeps_failed_recovery_snapshot() {
        let source_path = std::env::temp_dir().join(format!(
            "filament-manager-failed-restore-source-{}.db",
            chrono_id()
        ));
        let result = (|| -> Result<(), String> {
            let source =
                rusqlite::Connection::open(&source_path).map_err(|error| error.to_string())?;
            source
                .execute_batch("CREATE TABLE recovery_probe (value TEXT NOT NULL);")
                .map_err(|error| error.to_string())?;
            drop(source);

            let snapshot = create_full_restore_recovery_snapshot(&source_path)?;
            let error =
                finish_full_restore::<()>(snapshot, Err("restore failed".to_string())).unwrap_err();
            assert_eq!(error, "restore failed");
            let parent = source_path
                .parent()
                .ok_or_else(|| "temporary database has no parent".to_string())?;
            let base_name = source_path
                .file_name()
                .and_then(|value| value.to_str())
                .ok_or_else(|| "temporary database has no file name".to_string())?;
            let failed_snapshot = std::fs::read_dir(parent)
                .map_err(|error| error.to_string())?
                .filter_map(Result::ok)
                .find(|entry| {
                    entry
                        .file_name()
                        .to_string_lossy()
                        .starts_with(&format!("{base_name}.recovery-full-restore-failed-"))
                })
                .map(|entry| entry.path())
                .ok_or_else(|| "missing failed full-restore snapshot".to_string())?;
            std::fs::remove_file(failed_snapshot).map_err(|error| error.to_string())?;
            Ok(())
        })();

        let _ = std::fs::remove_file(&source_path);
        if let Err(error) = result {
            panic!("{error}");
        }
    }

    #[test]
    fn successful_full_restore_removes_machine_local_credentials() {
        let state = credential_test_state("restore-credential-cleanup");
        let (bambu_key, library_key) = seed_machine_local_credentials(&state);
        let result = (|| -> Result<(), String> {
            import_full_backup_json_inner(&state, empty_full_backup())?;

            assert!(state
                .credentials
                .get(&bambu_key)
                .map_err(|error| error.to_string())?
                .is_none());
            assert!(state
                .credentials
                .get(&library_key)
                .map_err(|error| error.to_string())?
                .is_none());
            assert!(state.library_sync_auth.current()?.is_none());
            let db = FilamentDatabase::open(&state.db_path).map_err(|error| error.to_string())?;
            assert!(db
                .list_bambu_live_integrations()
                .map_err(|error| error.to_string())?
                .is_empty());
            let runtime = state.companion.trusted_lan.snapshot();
            assert!(!runtime.enabled);
            assert!(runtime
                .advertised_hostname
                .as_deref()
                .is_some_and(|value| value.starts_with("fm-") && value.ends_with(".local")));
            Ok(())
        })();

        remove_test_database_and_snapshots(&state);
        if let Err(error) = result {
            panic!("{error}");
        }
    }

    #[test]
    fn successful_full_backup_import_through_data_file_removes_credentials() {
        let state = credential_test_state("data-file-credential-cleanup");
        let (bambu_key, library_key) = seed_machine_local_credentials(&state);
        let result = (|| -> Result<(), String> {
            let stats = import_data_file_inner(&state, empty_full_backup())?;
            assert_eq!(stats.detected_format, "FULL_BACKUP");
            assert!(state
                .credentials
                .get(&bambu_key)
                .map_err(|error| error.to_string())?
                .is_none());
            assert!(state
                .credentials
                .get(&library_key)
                .map_err(|error| error.to_string())?
                .is_none());
            assert!(state.library_sync_auth.current()?.is_none());
            Ok(())
        })();

        remove_test_database_and_snapshots(&state);
        if let Err(error) = result {
            panic!("{error}");
        }
    }

    #[test]
    fn failed_post_restore_purge_is_retained_and_retried_durably() {
        let state = credential_test_state_with_store(
            "restore-pending-credential-cleanup",
            CredentialStore::in_memory_with_delete_failures(1),
        );
        let (bambu_key, library_key) = seed_machine_local_credentials(&state);
        let result = (|| -> Result<(), String> {
            state.companion.trusted_lan.apply_loaded_config(
                true,
                Some(("Old interface".to_string(), "192.168.1.42".to_string())),
                TRUSTED_LAN_DEFAULT_PORT,
                "filament-manager-old-runtime.local",
            );
            import_full_backup_json_inner(&state, empty_full_backup())
                .expect_err("injected credential deletion must fail restore cleanup");

            let restored_db =
                FilamentDatabase::open(&state.db_path).map_err(|error| error.to_string())?;
            assert!(restored_db
                .list_printers()
                .map_err(|error| error.to_string())?
                .is_empty());
            drop(restored_db);

            let runtime = state.companion.trusted_lan.snapshot();
            assert!(!runtime.enabled);
            assert_ne!(
                runtime.advertised_hostname.as_deref(),
                Some("filament-manager-old-runtime.local")
            );

            assert!(retry_pending_credential_cleanup(
                Path::new(&state.db_path),
                &state.credentials,
                &state.library_sync_auth,
            )?);
            assert!(state
                .credentials
                .get(&bambu_key)
                .map_err(|error| error.to_string())?
                .is_none());
            assert!(state
                .credentials
                .get(&library_key)
                .map_err(|error| error.to_string())?
                .is_none());
            assert!(!retry_pending_credential_cleanup(
                Path::new(&state.db_path),
                &state.credentials,
                &state.library_sync_auth,
            )?);
            Ok(())
        })();

        remove_test_database_and_snapshots(&state);
        if let Err(error) = result {
            panic!("{error}");
        }
    }

    #[test]
    fn rejected_full_restore_keeps_existing_credentials_and_runtime_auth() {
        let state = credential_test_state("failed-restore-credential-preservation");
        let (bambu_key, library_key) = seed_machine_local_credentials(&state);
        let result = (|| -> Result<(), String> {
            let error = import_full_backup_json_inner(
                &state,
                r#"{"format":"filament-manager-backup-v1","tables":{}}"#.to_string(),
            )
            .expect_err("incomplete backup must be rejected");
            assert!(!error.is_empty());
            assert!(state
                .credentials
                .get(&bambu_key)
                .map_err(|error| error.to_string())?
                .is_some());
            assert!(state
                .credentials
                .get(&library_key)
                .map_err(|error| error.to_string())?
                .is_some());
            assert!(state.library_sync_auth.current()?.is_some());
            Ok(())
        })();

        remove_test_database_and_snapshots(&state);
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
