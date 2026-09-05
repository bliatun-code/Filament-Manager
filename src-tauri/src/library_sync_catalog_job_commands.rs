use crate::app_error::coded_command_error;
use crate::backend::catalog_refresh_jobs::{CatalogRefreshJobInput, CatalogRefreshJobSnapshot};
use crate::companion_models::CATALOG_REFRESH_JOBS_CAPABILITY;
use crate::library_sync_blocking_executor::run_library_sync_blocking;
use crate::library_sync_command_support::{
    encode_library_sync_path_segment, library_sync_host_input, prepare_library_sync_host_read,
    prepare_library_sync_host_write,
};
use crate::library_sync_host_client::{
    get_library_sync_host_json_authenticated, perform_library_sync_host_write_and_parse,
};
use crate::library_sync_target_guard::ensure_library_sync_target_current;
use crate::state::AppState;
use serde::Deserialize;

#[derive(Deserialize)]
pub(crate) struct StartHostCatalogJobInput {
    base_url: String,
    expected_library_id: Option<String>,
    job_id: String,
    vendor: String,
    material: String,
}

#[derive(Deserialize)]
pub(crate) struct GetHostCatalogJobInput {
    base_url: String,
    expected_library_id: Option<String>,
    job_id: Option<String>,
}

fn require_capability(capabilities: &[String]) -> Result<(), String> {
    if capabilities
        .iter()
        .any(|value| value == CATALOG_REFRESH_JOBS_CAPABILITY)
    {
        Ok(())
    } else {
        // This code is emitted only before any job POST. The UI can safely
        // release a newly-created pending request when an older Host lacks it.
        Err(coded_command_error("catalog.refresh.host_unsupported"))
    }
}

#[tauri::command]
pub(crate) async fn start_library_sync_host_catalog_refresh_job(
    state: tauri::State<'_, AppState>,
    input: StartHostCatalogJobInput,
) -> Result<CatalogRefreshJobSnapshot, String> {
    let state = state.inner().clone();
    run_library_sync_blocking(move || start_host_job(&state, input)).await
}

fn start_host_job(
    state: &AppState,
    input: StartHostCatalogJobInput,
) -> Result<CatalogRefreshJobSnapshot, String> {
    let host = library_sync_host_input(&input.base_url, input.expected_library_id.as_deref());
    let (base_url, health, target) = prepare_library_sync_host_write(state, &host)?;
    require_capability(&health.capabilities)?;
    ensure_library_sync_target_current(state, &target)?;
    let job = perform_library_sync_host_write_and_parse(
        state,
        &base_url,
        "/api/v1/catalog/refresh-jobs",
        &CatalogRefreshJobInput {
            job_id: input.job_id,
            vendor: input.vendor,
            material: input.material,
        },
    )?;
    ensure_library_sync_target_current(state, &target)?;
    Ok(job)
}

#[tauri::command]
pub(crate) async fn get_library_sync_host_catalog_refresh_job(
    state: tauri::State<'_, AppState>,
    input: GetHostCatalogJobInput,
) -> Result<Option<CatalogRefreshJobSnapshot>, String> {
    let state = state.inner().clone();
    run_library_sync_blocking(move || get_host_job(&state, input)).await
}

fn get_host_job(
    state: &AppState,
    input: GetHostCatalogJobInput,
) -> Result<Option<CatalogRefreshJobSnapshot>, String> {
    let host = library_sync_host_input(&input.base_url, input.expected_library_id.as_deref());
    let (base_url, health, target) = prepare_library_sync_host_read(state, &host)?;
    require_capability(&health.capabilities)?;
    let path = match input.job_id {
        Some(job_id) => format!(
            "/api/v1/catalog/refresh-jobs/{}",
            encode_library_sync_path_segment(&job_id)
        ),
        None => "/api/v1/catalog/refresh-jobs/active".to_string(),
    };
    let job = get_library_sync_host_json_authenticated(state, &base_url, &path)?;
    ensure_library_sync_target_current(state, &target)?;
    Ok(job)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::backend::filament_database::FilamentDatabase;
    use crate::companion_session::random_hex_token;
    use crate::credential_store::CredentialStore;
    use crate::library_sync_runtime_auth::LibrarySyncRuntimeAuth;
    use crate::state::{
        CompanionRuntimeState, TrustedLanCompanionRuntime, TRUSTED_LAN_DEFAULT_PORT,
    };
    use std::io::{BufRead, BufReader, Write};
    use std::net::TcpListener;
    use std::path::PathBuf;
    use std::sync::{
        atomic::{AtomicBool, Ordering},
        Arc,
    };
    use std::time::Duration;

    struct TestDirectory(PathBuf);

    impl Drop for TestDirectory {
        fn drop(&mut self) {
            let _ = std::fs::remove_dir_all(&self.0);
        }
    }

    struct OlderHost {
        base_url: String,
        stopped: Arc<AtomicBool>,
        server: Option<std::thread::JoinHandle<Vec<String>>>,
    }

    impl OlderHost {
        fn start() -> Self {
            let listener = TcpListener::bind("127.0.0.1:0").expect("bind synthetic older Host");
            listener.set_nonblocking(true).unwrap();
            let base_url = format!("http://{}", listener.local_addr().unwrap());
            let stopped = Arc::new(AtomicBool::new(false));
            let stop = Arc::clone(&stopped);
            let server = std::thread::spawn(move || {
                let mut requests = Vec::new();
                while !stop.load(Ordering::Acquire) {
                    let mut stream = match listener.accept() {
                        Ok((stream, _)) => stream,
                        Err(error) if error.kind() == std::io::ErrorKind::WouldBlock => {
                            std::thread::sleep(Duration::from_millis(5));
                            continue;
                        }
                        Err(error) => panic!("synthetic Host accept failed: {error}"),
                    };
                    stream
                        .set_read_timeout(Some(Duration::from_secs(5)))
                        .unwrap();
                    {
                        let mut reader = BufReader::new(&mut stream);
                        let mut line = String::new();
                        reader.read_line(&mut line).unwrap();
                        requests.push(line.trim().to_string());
                        loop {
                            line.clear();
                            if reader.read_line(&mut line).unwrap() == 0 || line == "\r\n" {
                                break;
                            }
                        }
                    }
                    let body = r#"{"ok":true,"api_version":"v1","capabilities":[],"auth_mode":"pairing-session","access_mode":"trusted-lan","library_id":"catalog-old-host-library","device_name":"Synthetic older Host","sync_mode":"HOST"}"#;
                    write!(stream, "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}", body.len()).unwrap();
                    stream.flush().unwrap();
                }
                requests
            });
            Self {
                base_url,
                stopped,
                server: Some(server),
            }
        }

        fn finish(&mut self) -> Vec<String> {
            self.stopped.store(true, Ordering::Release);
            self.server
                .take()
                .unwrap()
                .join()
                .expect("join synthetic older Host")
        }
    }

    impl Drop for OlderHost {
        fn drop(&mut self) {
            self.stopped.store(true, Ordering::Release);
            if let Some(server) = self.server.take() {
                let _ = server.join();
            }
        }
    }

    #[test]
    fn older_host_preflight_rejects_start_and_status_before_authentication_or_post() {
        let directory = TestDirectory(
            std::env::temp_dir().join(format!("catalog-old-host-{}", random_hex_token(16))),
        );
        std::fs::create_dir(&directory.0).unwrap();
        let path = directory.0.join("client.db");
        let mut host = OlderHost::start();
        let db = FilamentDatabase::open(&path).unwrap();
        db.apply_schema().unwrap();
        let mut settings = db.get_library_sync_settings().unwrap();
        settings.mode = "CLIENT".to_string();
        settings.library_id = "catalog-old-host-library".to_string();
        settings.host_base_url = Some(host.base_url.clone());
        db.save_library_sync_settings(&settings).unwrap();
        drop(db);
        let state = AppState {
            db_path: path.to_string_lossy().into_owned(),
            companion: CompanionRuntimeState::new(TrustedLanCompanionRuntime::new(
                TRUSTED_LAN_DEFAULT_PORT,
            )),
            credentials: CredentialStore::in_memory(),
            library_sync_auth: LibrarySyncRuntimeAuth::new(),
        };
        let start_error = start_host_job(
            &state,
            StartHostCatalogJobInput {
                base_url: host.base_url.clone(),
                expected_library_id: Some("catalog-old-host-library".to_string()),
                job_id: "never-submitted-job".to_string(),
                vendor: "eSUN".to_string(),
                material: "PLA".to_string(),
            },
        )
        .expect_err("unsupported Host must reject before starting authentication or import");
        let get_error = get_host_job(
            &state,
            GetHostCatalogJobInput {
                base_url: host.base_url.clone(),
                expected_library_id: Some("catalog-old-host-library".to_string()),
                job_id: Some("never-submitted-job".to_string()),
            },
        )
        .expect_err("unsupported Host must reject receipt lookup before authentication");
        let active_error = get_host_job(
            &state,
            GetHostCatalogJobInput {
                base_url: host.base_url.clone(),
                expected_library_id: Some("catalog-old-host-library".to_string()),
                job_id: None,
            },
        )
        .expect_err("unsupported Host must reject active lookup before authentication");
        let requests = host.finish();
        for error in [start_error, get_error, active_error] {
            let envelope: serde_json::Value = serde_json::from_str(&error).unwrap();
            assert_eq!(envelope["code"], "catalog.refresh.host_unsupported");
        }
        assert_eq!(requests, vec!["GET /api/v1/health HTTP/1.1"; 3]);
        assert!(
            !FilamentDatabase::open(&path)
                .unwrap()
                .get_library_sync_settings()
                .unwrap()
                .client_auth_paired
        );
    }

    #[test]
    fn catalog_job_support_is_required_before_a_start_can_be_sent() {
        assert!(require_capability(&[]).is_err());
        assert!(require_capability(&["vendor-catalog-discovery-v1".into()]).is_err());
        assert!(require_capability(&[CATALOG_REFRESH_JOBS_CAPABILITY.into()]).is_ok());
    }
}
