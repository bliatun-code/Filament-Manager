use crate::app_services::CompanionService;
use crate::backend::filament_database::{FilamentDatabase, PrinterAmsSlotRow};
use crate::companion_error::CompanionApiError;
use crate::companion_session::{new_companion_session_store, CompanionSessionStore};
use crate::credential_store::CredentialStore;
use crate::state::TrustedLanCompanionRuntime;
use std::sync::Arc;
use tokio::sync::Semaphore;

const COMPANION_BLOCKING_OPERATION_LIMIT: usize = 8;

#[derive(Clone)]
struct CompanionBlockingExecutor {
    permits: Arc<Semaphore>,
    admission: Arc<Semaphore>,
}

impl CompanionBlockingExecutor {
    fn new(max_concurrency: usize) -> Self {
        Self::with_capacity(max_concurrency, max_concurrency.saturating_mul(4))
    }

    fn with_capacity(max_concurrency: usize, max_admitted: usize) -> Self {
        let max_concurrency = max_concurrency.max(1);
        Self {
            permits: Arc::new(Semaphore::new(max_concurrency)),
            admission: Arc::new(Semaphore::new(max_admitted.max(max_concurrency))),
        }
    }

    async fn run<T, F>(&self, operation: &'static str, task: F) -> Result<T, CompanionApiError>
    where
        T: Send + 'static,
        F: FnOnce() -> Result<T, CompanionApiError> + Send + 'static,
    {
        let admission = self
            .admission
            .clone()
            .try_acquire_owned()
            .map_err(|error| {
                if matches!(error, tokio::sync::TryAcquireError::Closed) {
                    CompanionApiError::Internal(format!(
                        "Companion blocking executor is unavailable during {operation}"
                    ))
                } else {
                    CompanionApiError::ServiceUnavailable(format!(
                        "Companion blocking executor is saturated during {operation}"
                    ))
                }
            })?;
        let permit = self.permits.clone().acquire_owned().await.map_err(|_| {
            CompanionApiError::Internal(format!(
                "Companion blocking executor is unavailable during {operation}"
            ))
        })?;
        tokio::task::spawn_blocking(move || {
            let _admission = admission;
            let _permit = permit;
            task()
        })
        .await
        .map_err(|error| map_blocking_join_error(operation, error))?
    }

    #[cfg(test)]
    fn close(&self) {
        self.permits.close();
        self.admission.close();
    }
}

fn map_blocking_join_error(
    operation: &'static str,
    error: tokio::task::JoinError,
) -> CompanionApiError {
    let reason = if error.is_panic() {
        "panicked"
    } else if error.is_cancelled() {
        "was cancelled"
    } else {
        "failed"
    };
    CompanionApiError::Internal(format!("Companion blocking operation {operation} {reason}"))
}

#[derive(Clone)]
pub(crate) struct CompanionApiState {
    pub(crate) service: CompanionService,
    pub(crate) db_path: String,
    pub(crate) runtime: TrustedLanCompanionRuntime,
    pub(crate) sessions: CompanionSessionStore,
    pub(crate) credentials: CredentialStore,
    blocking: CompanionBlockingExecutor,
}

impl CompanionApiState {
    pub(crate) fn new(
        db_path: String,
        runtime: TrustedLanCompanionRuntime,
        credentials: CredentialStore,
    ) -> Self {
        Self {
            service: CompanionService::new(db_path.clone()),
            db_path,
            runtime,
            sessions: new_companion_session_store(),
            credentials,
            blocking: CompanionBlockingExecutor::new(COMPANION_BLOCKING_OPERATION_LIMIT),
        }
    }

    pub(crate) async fn run_blocking<T, F>(
        &self,
        operation: &'static str,
        task: F,
    ) -> Result<T, CompanionApiError>
    where
        T: Send + 'static,
        F: FnOnce(Self) -> Result<T, CompanionApiError> + Send + 'static,
    {
        let state = self.clone();
        self.blocking.run(operation, move || task(state)).await
    }

    pub(crate) fn open_db(&self) -> Result<FilamentDatabase, CompanionApiError> {
        FilamentDatabase::open(&self.db_path).map_err(|error| {
            CompanionApiError::Internal(format!("Failed to open companion database: {error}"))
        })
    }

    pub(crate) fn find_printer_slot(
        &self,
        printer_id: &str,
        slot_id: &str,
    ) -> Result<PrinterAmsSlotRow, CompanionApiError> {
        self.service
            .list_printer_overview()
            .map_err(CompanionApiError::from)?
            .into_iter()
            .find(|printer| printer.printer.id == printer_id)
            .and_then(|printer| {
                printer
                    .slots
                    .into_iter()
                    .find(|slot| slot.slot_id == slot_id)
            })
            .ok_or_else(|| CompanionApiError::NotFound("Record not found".to_string()))
    }

    pub(crate) fn spool_assigned_to_printer(
        &self,
        spool_id: &str,
    ) -> Result<bool, CompanionApiError> {
        Ok(self
            .service
            .list_printer_overview()
            .map_err(CompanionApiError::from)?
            .into_iter()
            .flat_map(|printer| printer.slots.into_iter())
            .any(|slot| slot.spool_id.as_deref() == Some(spool_id)))
    }
}

#[cfg(test)]
mod tests {
    use super::{map_blocking_join_error, CompanionBlockingExecutor};
    use crate::companion_error::CompanionApiError;
    use std::sync::atomic::{AtomicUsize, Ordering};
    use std::sync::Arc;
    use std::time::Duration;

    #[tokio::test(flavor = "multi_thread", worker_threads = 2)]
    async fn blocking_work_runs_outside_the_async_worker_thread() {
        let executor = CompanionBlockingExecutor::new(1);
        let async_thread = std::thread::current().id();
        let blocking_thread = executor
            .run("thread identity test", move || {
                Ok::<_, CompanionApiError>(std::thread::current().id())
            })
            .await
            .expect("run blocking work");

        assert_ne!(blocking_thread, async_thread);
    }

    #[tokio::test(flavor = "multi_thread", worker_threads = 2)]
    async fn blocking_panics_are_reported_without_panicking_the_async_task() {
        let error = CompanionBlockingExecutor::new(1)
            .run::<(), _>("panic test", || panic!("intentional test panic"))
            .await
            .expect_err("panic must become API error");

        assert!(matches!(
            error,
            CompanionApiError::Internal(message) if message.contains("panic test panicked")
        ));
    }

    #[tokio::test(flavor = "multi_thread", worker_threads = 2)]
    async fn closed_executor_reports_cancellation_before_work_starts() {
        let executor = CompanionBlockingExecutor::new(1);
        executor.close();
        let error = executor
            .run("closed executor test", || Ok::<_, CompanionApiError>(()))
            .await
            .expect_err("closed executor must reject work");

        assert!(matches!(
            error,
            CompanionApiError::Internal(message)
                if message.contains("blocking executor is unavailable")
        ));
    }

    #[tokio::test(flavor = "multi_thread", worker_threads = 2)]
    async fn blocking_operation_errors_are_preserved() {
        let error = CompanionBlockingExecutor::new(1)
            .run("error test", || {
                Err::<(), _>(CompanionApiError::BadRequest(
                    "expected test error".to_string(),
                ))
            })
            .await
            .expect_err("operation error must be returned");

        assert!(matches!(
            error,
            CompanionApiError::BadRequest(message) if message == "expected test error"
        ));
    }

    #[tokio::test(flavor = "multi_thread", worker_threads = 2)]
    async fn saturated_executor_rejects_excess_work_without_an_unbounded_queue() {
        let executor = CompanionBlockingExecutor::with_capacity(1, 1);
        let (started_tx, started_rx) = std::sync::mpsc::channel();
        let (release_tx, release_rx) = std::sync::mpsc::channel();
        let occupied_executor = executor.clone();
        let occupied = tokio::spawn(async move {
            occupied_executor
                .run("occupied test", move || {
                    started_tx.send(()).expect("signal occupied task");
                    release_rx.recv().expect("release occupied task");
                    Ok::<_, CompanionApiError>(())
                })
                .await
        });
        started_rx
            .recv_timeout(Duration::from_secs(1))
            .expect("blocking operation admitted");

        let error = executor
            .run("overload test", || Ok::<_, CompanionApiError>(()))
            .await
            .expect_err("excess operation must fail fast");
        assert!(matches!(
            error,
            CompanionApiError::ServiceUnavailable(message)
                if message.contains("overload test")
        ));

        release_tx.send(()).expect("release occupied operation");
        occupied
            .await
            .expect("join occupied task")
            .expect("occupied task completes");
    }

    #[test]
    fn cancelled_blocking_join_is_mapped_without_losing_context() {
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

            let error = map_blocking_join_error("cancel test", join_error);
            assert!(matches!(
                error,
                CompanionApiError::Internal(message)
                    if message.contains("cancel test was cancelled")
            ));
        });
    }

    #[tokio::test(flavor = "multi_thread", worker_threads = 4)]
    async fn blocking_work_is_bounded_by_the_configured_capacity() {
        let executor = CompanionBlockingExecutor::new(2);
        let active = Arc::new(AtomicUsize::new(0));
        let peak = Arc::new(AtomicUsize::new(0));
        let mut tasks = Vec::new();

        for _ in 0..8 {
            let executor = executor.clone();
            let active = active.clone();
            let peak = peak.clone();
            tasks.push(tokio::spawn(async move {
                executor
                    .run("capacity test", move || {
                        let current = active.fetch_add(1, Ordering::SeqCst) + 1;
                        peak.fetch_max(current, Ordering::SeqCst);
                        std::thread::sleep(Duration::from_millis(20));
                        active.fetch_sub(1, Ordering::SeqCst);
                        Ok::<_, CompanionApiError>(())
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
}
