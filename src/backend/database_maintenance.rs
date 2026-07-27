use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Condvar, Mutex, MutexGuard, OnceLock, Weak};

#[derive(Default)]
struct MaintenanceState {
    active_readers: usize,
    writer_active: bool,
    waiting_writers: usize,
}

#[derive(Default)]
struct MaintenanceGate {
    state: Mutex<MaintenanceState>,
    changed: Condvar,
}

pub(crate) struct DatabaseMaintenanceGuard {
    gate: Arc<MaintenanceGate>,
    exclusive: bool,
}

impl DatabaseMaintenanceGuard {
    pub(crate) fn shared(path: &Path) -> Self {
        let gate = gate_for_path(path);
        let mut state = lock_state(&gate);
        while state.writer_active || state.waiting_writers > 0 {
            state = wait_for_change(&gate, state);
        }
        state.active_readers += 1;
        drop(state);
        Self {
            gate,
            exclusive: false,
        }
    }

    pub(crate) fn exclusive(path: &Path) -> Self {
        let gate = gate_for_path(path);
        let mut state = lock_state(&gate);
        state.waiting_writers += 1;
        while state.writer_active || state.active_readers > 0 {
            state = wait_for_change(&gate, state);
        }
        state.waiting_writers -= 1;
        state.writer_active = true;
        drop(state);
        Self {
            gate,
            exclusive: true,
        }
    }
}

impl Drop for DatabaseMaintenanceGuard {
    fn drop(&mut self) {
        let mut state = lock_state(&self.gate);
        if self.exclusive {
            debug_assert!(state.writer_active);
            state.writer_active = false;
        } else {
            debug_assert!(state.active_readers > 0);
            state.active_readers = state.active_readers.saturating_sub(1);
        }
        self.gate.changed.notify_all();
    }
}

fn lock_state(gate: &MaintenanceGate) -> MutexGuard<'_, MaintenanceState> {
    gate.state
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner())
}

fn wait_for_change<'a>(
    gate: &MaintenanceGate,
    state: MutexGuard<'a, MaintenanceState>,
) -> MutexGuard<'a, MaintenanceState> {
    gate.changed
        .wait(state)
        .unwrap_or_else(|poisoned| poisoned.into_inner())
}

fn gate_for_path(path: &Path) -> Arc<MaintenanceGate> {
    static REGISTRY: OnceLock<Mutex<HashMap<PathBuf, Weak<MaintenanceGate>>>> = OnceLock::new();

    let key = normalized_database_path(path);
    let registry = REGISTRY.get_or_init(|| Mutex::new(HashMap::new()));
    let mut gates = registry
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
    if let Some(gate) = gates.get(&key).and_then(Weak::upgrade) {
        return gate;
    }

    let gate = Arc::new(MaintenanceGate::default());
    gates.insert(key, Arc::downgrade(&gate));
    gate
}

fn normalized_database_path(path: &Path) -> PathBuf {
    if let Ok(canonical) = std::fs::canonicalize(path) {
        return canonical;
    }

    let absolute = if path.is_absolute() {
        path.to_path_buf()
    } else {
        std::env::current_dir()
            .unwrap_or_else(|_| PathBuf::from("."))
            .join(path)
    };
    let Some(file_name) = absolute.file_name() else {
        return absolute;
    };
    absolute
        .parent()
        .and_then(|parent| std::fs::canonicalize(parent).ok())
        .map_or(absolute.clone(), |parent| parent.join(file_name))
}

#[cfg(test)]
mod tests {
    use super::{normalized_database_path, DatabaseMaintenanceGuard};
    use std::sync::mpsc;
    use std::time::Duration;

    #[test]
    fn exclusive_maintenance_blocks_new_database_readers() {
        let path = std::env::temp_dir().join("filament-manager-maintenance-lock.db");
        let exclusive = DatabaseMaintenanceGuard::exclusive(&path);
        let (started_tx, started_rx) = mpsc::channel();
        let (acquired_tx, acquired_rx) = mpsc::channel();
        let thread_path = path.clone();
        let worker = std::thread::spawn(move || {
            started_tx.send(()).expect("signal lock attempt");
            let _shared = DatabaseMaintenanceGuard::shared(&thread_path);
            acquired_tx.send(()).expect("signal acquired lock");
        });

        started_rx
            .recv_timeout(Duration::from_secs(1))
            .expect("worker should attempt shared maintenance access");
        assert!(acquired_rx
            .recv_timeout(Duration::from_millis(100))
            .is_err());
        drop(exclusive);
        acquired_rx
            .recv_timeout(Duration::from_secs(1))
            .expect("shared access should resume after maintenance");
        worker.join().expect("join lock worker");

        assert!(normalized_database_path(&path).is_absolute());
    }
}
