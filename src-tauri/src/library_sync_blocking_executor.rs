use std::sync::{Arc, LazyLock};

use tokio::sync::{Semaphore, TryAcquireError};

const LIBRARY_SYNC_BLOCKING_CONCURRENCY_LIMIT: usize = 8;
const LIBRARY_SYNC_BLOCKING_ADMISSION_LIMIT: usize = 32;

const SATURATED_ERROR: &str = "Library sync is temporarily busy. Please try again.";
const UNAVAILABLE_ERROR: &str =
    "Library sync background worker is temporarily unavailable. Please try again.";
const FAILED_ERROR: &str = "Library sync background operation failed.";
const CANCELLED_ERROR: &str = "Library sync background operation was cancelled.";

static LIBRARY_SYNC_BLOCKING_EXECUTOR: LazyLock<LibrarySyncBlockingExecutor> =
    LazyLock::new(|| {
        LibrarySyncBlockingExecutor::with_capacity(
            LIBRARY_SYNC_BLOCKING_CONCURRENCY_LIMIT,
            LIBRARY_SYNC_BLOCKING_ADMISSION_LIMIT,
        )
    });

#[derive(Clone)]
struct LibrarySyncBlockingExecutor {
    permits: Arc<Semaphore>,
    admission: Arc<Semaphore>,
}

impl LibrarySyncBlockingExecutor {
    fn with_capacity(max_concurrency: usize, max_admitted: usize) -> Self {
        let max_concurrency = max_concurrency.max(1);
        Self {
            permits: Arc::new(Semaphore::new(max_concurrency)),
            admission: Arc::new(Semaphore::new(max_admitted.max(max_concurrency))),
        }
    }

    async fn run<T, F>(&self, task: F) -> Result<T, String>
    where
        T: Send + 'static,
        F: FnOnce() -> Result<T, String> + Send + 'static,
    {
        let admission = self
            .admission
            .clone()
            .try_acquire_owned()
            .map_err(map_admission_error)?;
        let permit = self
            .permits
            .clone()
            .acquire_owned()
            .await
            .map_err(|_| UNAVAILABLE_ERROR.to_string())?;

        tokio::task::spawn_blocking(move || {
            let _admission = admission;
            let _permit = permit;
            task()
        })
        .await
        .map_err(map_join_error)?
    }

    #[cfg(test)]
    fn close(&self) {
        self.permits.close();
        self.admission.close();
    }
}

fn map_admission_error(error: TryAcquireError) -> String {
    match error {
        TryAcquireError::NoPermits => SATURATED_ERROR.to_string(),
        TryAcquireError::Closed => UNAVAILABLE_ERROR.to_string(),
    }
}

fn map_join_error(error: tokio::task::JoinError) -> String {
    if error.is_cancelled() {
        CANCELLED_ERROR.to_string()
    } else {
        // Do not expose panic payloads or executor internals to the frontend.
        FAILED_ERROR.to_string()
    }
}

pub(crate) async fn run_library_sync_blocking<T, F>(task: F) -> Result<T, String>
where
    T: Send + 'static,
    F: FnOnce() -> Result<T, String> + Send + 'static,
{
    LIBRARY_SYNC_BLOCKING_EXECUTOR.run(task).await
}

#[cfg(test)]
mod tests {
    use super::{
        map_join_error, LibrarySyncBlockingExecutor, CANCELLED_ERROR, FAILED_ERROR,
        SATURATED_ERROR, UNAVAILABLE_ERROR,
    };
    use std::sync::atomic::{AtomicUsize, Ordering};
    use std::sync::Arc;
    use std::time::Duration;

    #[tokio::test(flavor = "multi_thread", worker_threads = 2)]
    async fn work_runs_outside_the_async_worker_thread() {
        let executor = LibrarySyncBlockingExecutor::with_capacity(1, 1);
        let async_thread = std::thread::current().id();

        let blocking_thread = executor
            .run(|| Ok(std::thread::current().id()))
            .await
            .expect("run blocking work");

        assert_ne!(blocking_thread, async_thread);
    }

    #[tokio::test(flavor = "multi_thread", worker_threads = 4)]
    async fn concurrency_is_bounded_by_capacity() {
        let executor = LibrarySyncBlockingExecutor::with_capacity(2, 8);
        let active = Arc::new(AtomicUsize::new(0));
        let peak = Arc::new(AtomicUsize::new(0));
        let mut tasks = Vec::new();

        for _ in 0..8 {
            let executor = executor.clone();
            let active = active.clone();
            let peak = peak.clone();
            tasks.push(tokio::spawn(async move {
                executor
                    .run(move || {
                        let current = active.fetch_add(1, Ordering::SeqCst) + 1;
                        peak.fetch_max(current, Ordering::SeqCst);
                        std::thread::sleep(Duration::from_millis(20));
                        active.fetch_sub(1, Ordering::SeqCst);
                        Ok(())
                    })
                    .await
            }));
        }

        for task in tasks {
            task.await
                .expect("join capacity test")
                .expect("run capacity test");
        }

        assert_eq!(peak.load(Ordering::SeqCst), 2);
    }

    #[tokio::test(flavor = "multi_thread", worker_threads = 2)]
    async fn saturation_fails_fast_with_a_sanitized_error() {
        let executor = LibrarySyncBlockingExecutor::with_capacity(1, 2);
        let (started_tx, started_rx) = std::sync::mpsc::channel();
        let (release_tx, release_rx) = std::sync::mpsc::channel();
        let occupied_executor = executor.clone();
        let occupied = tokio::spawn(async move {
            occupied_executor
                .run(move || {
                    started_tx.send(()).expect("signal occupied task");
                    release_rx.recv().expect("release occupied task");
                    Ok(())
                })
                .await
        });
        started_rx
            .recv_timeout(Duration::from_secs(1))
            .expect("blocking operation admitted");

        let queued_executor = executor.clone();
        let queued = tokio::spawn(async move { queued_executor.run(|| Ok(())).await });
        tokio::time::timeout(Duration::from_secs(1), async {
            while executor.admission.available_permits() != 0 {
                tokio::task::yield_now().await;
            }
        })
        .await
        .expect("second operation queued");

        let rejected = tokio::time::timeout(Duration::from_secs(1), executor.run(|| Ok(()))).await;

        release_tx.send(()).expect("release occupied operation");
        occupied
            .await
            .expect("join occupied task")
            .expect("occupied task completes");
        queued
            .await
            .expect("join queued task")
            .expect("queued task completes");

        let error = rejected
            .expect("excess operation must fail without waiting for capacity")
            .expect_err("excess operation must fail fast");

        assert_eq!(error, SATURATED_ERROR);
    }

    #[tokio::test(flavor = "multi_thread", worker_threads = 2)]
    async fn panic_is_mapped_without_exposing_its_payload() {
        let executor = LibrarySyncBlockingExecutor::with_capacity(1, 1);

        let error = executor
            .run::<(), _>(|| panic!("sensitive panic payload"))
            .await
            .expect_err("panic must become a safe error");

        assert_eq!(error, FAILED_ERROR);
        assert!(!error.contains("sensitive"));
    }

    #[test]
    fn cancelled_join_is_mapped_to_a_safe_error() {
        let runtime = tokio::runtime::Builder::new_multi_thread()
            .worker_threads(1)
            .max_blocking_threads(1)
            .enable_all()
            .build()
            .expect("build cancellation test runtime");

        runtime.block_on(async {
            let (started_tx, started_rx) = std::sync::mpsc::channel();
            let (release_tx, release_rx) = std::sync::mpsc::channel();
            let blocker = tokio::task::spawn_blocking(move || {
                started_tx.send(()).expect("signal blocking task start");
                release_rx.recv().expect("release blocking task");
            });
            started_rx
                .recv_timeout(Duration::from_secs(1))
                .expect("blocking worker occupied");

            let queued = tokio::task::spawn_blocking(|| ());
            queued.abort();
            release_tx.send(()).expect("release blocking worker");
            blocker.await.expect("join blocking worker");
            let join_error = queued.await.expect_err("queued task must be cancelled");

            assert_eq!(map_join_error(join_error), CANCELLED_ERROR);
        });
    }

    #[tokio::test(flavor = "multi_thread", worker_threads = 2)]
    async fn closed_executor_is_reported_as_unavailable() {
        let executor = LibrarySyncBlockingExecutor::with_capacity(1, 1);
        executor.close();

        let error = executor
            .run(|| Ok(()))
            .await
            .expect_err("closed executor must reject work");

        assert_eq!(error, UNAVAILABLE_ERROR);
    }

    #[test]
    fn library_sync_command_wrappers_use_the_bounded_executor() {
        fn assert_async_blocking_wrapper(source: &str, command: &str) {
            let async_marker = format!("pub(crate) async fn {command}");
            let blocking_marker = format!("\nfn {command}_blocking(");
            let (_, after_async_marker) = source
                .split_once(&async_marker)
                .unwrap_or_else(|| panic!("{command} must be an async Tauri command"));
            let (wrapper, _) = after_async_marker
                .split_once(&blocking_marker)
                .unwrap_or_else(|| panic!("{command} must delegate to its own blocking function"));

            assert!(
                wrapper.contains("let state = state.inner().clone();"),
                "{command} must clone AppState before moving the work"
            );
            assert!(
                wrapper.contains("run_library_sync_blocking(move ||"),
                "{command} must move its blocking body onto the bounded executor"
            );
            assert!(
                !wrapper.contains("get_library_sync_host_json_authenticated")
                    && !wrapper.contains("perform_library_sync_host_write")
                    && !wrapper.contains("prepare_library_sync_host")
                    && !wrapper.contains("refresh_library_sync_spool_cache(")
                    && !wrapper.contains("refresh_library_sync_printer_cache(")
                    && !wrapper.contains("refresh_library_sync_loan_cache(")
                    && !wrapper.contains("refresh_library_sync_wishlist_cache(")
                    && !wrapper.contains("save_library_sync_success")
                    && !wrapper.contains("with_inventory(")
                    && !wrapper.contains("lock_secure_credential_mutation"),
                "{command} must keep network and database work inside its blocking function"
            );
        }

        for (command, source) in [
            (
                "validate_library_sync_host",
                include_str!("library_sync_validation_commands.rs"),
            ),
            (
                "fetch_library_sync_snapshot",
                include_str!("library_sync_snapshot_commands.rs"),
            ),
            (
                "fetch_library_sync_domain_revisions",
                include_str!("library_revision_commands.rs"),
            ),
        ] {
            assert_async_blocking_wrapper(source, command);
        }

        let read_commands = include_str!("library_sync_read_commands.rs");
        for command in [
            "fetch_library_sync_spool_detail",
            "fetch_library_sync_spools",
            "fetch_library_sync_printer_overview",
            "fetch_library_sync_printer_settings",
            "fetch_library_sync_loans",
            "fetch_library_sync_filament_consumption",
            "fetch_library_sync_catalog_masters",
            "fetch_library_sync_wishlist_items",
            "fetch_library_sync_full_backup_json",
        ] {
            assert_async_blocking_wrapper(read_commands, command);
        }

        assert_async_blocking_wrapper(
            include_str!("library_sync_pairing_commands.rs"),
            "pair_library_sync_host",
        );

        let location_commands = include_str!("library_sync_location_commands.rs");
        for command in [
            "fetch_library_sync_locations",
            "create_library_sync_host_location",
            "rename_library_sync_host_location",
            "archive_library_sync_host_location",
            "restore_library_sync_host_location",
            "merge_library_sync_host_locations",
        ] {
            assert_async_blocking_wrapper(location_commands, command);
        }

        let settings_commands = include_str!("library_sync_settings_commands.rs");
        for command in [
            "get_library_sync_settings",
            "save_library_sync_settings",
            "clear_library_sync_client_auth",
        ] {
            assert_async_blocking_wrapper(settings_commands, command);
        }

        for (source, commands) in [
            (
                include_str!("library_sync_spool_write_commands.rs"),
                &[
                    "update_library_sync_host_spool_weight",
                    "update_library_sync_host_spool_tare_weight",
                    "update_library_sync_host_spool_details",
                    "update_library_sync_host_spool_ownership",
                    "update_library_sync_host_spool_rfid_tag",
                    "create_library_sync_host_spool",
                ][..],
            ),
            (
                include_str!("library_sync_printer_write_commands.rs"),
                &[
                    "assign_library_sync_host_printer_slot",
                    "record_library_sync_host_print_usage",
                    "accept_library_sync_host_bambu_live_weight_estimate",
                    "create_library_sync_host_printer",
                    "update_library_sync_host_master_catalog_entry",
                    "refresh_library_sync_host_vendor_catalog",
                    "delete_library_sync_host_printer",
                ][..],
            ),
            (
                include_str!("library_sync_loan_write_commands.rs"),
                &[
                    "return_library_sync_host_loan",
                    "lend_library_sync_host_spool",
                ][..],
            ),
            (
                include_str!("library_sync_wishlist_write_commands.rs"),
                &[
                    "create_library_sync_host_wishlist_item",
                    "update_library_sync_host_wishlist_item_status",
                    "receive_library_sync_host_wishlist_item",
                    "delete_library_sync_host_wishlist_item",
                ][..],
            ),
            (
                include_str!("library_sync_danger_zone_commands.rs"),
                &[
                    "delete_library_sync_host_spool",
                    "purge_library_sync_host_spool",
                ][..],
            ),
        ] {
            for command in commands {
                assert_async_blocking_wrapper(source, command);
            }
        }

        let revisions = include_str!("library_revision_commands.rs");
        assert!(revisions.contains("pub(crate) fn get_library_domain_revisions"));
        assert!(!revisions.contains("pub(crate) async fn get_library_domain_revisions"));
    }
}
