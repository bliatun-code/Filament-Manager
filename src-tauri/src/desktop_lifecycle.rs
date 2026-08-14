use crate::companion_api;
use crate::state::AppState;
use serde::{Deserialize, Serialize};
use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, AtomicU8, Ordering};
use std::sync::Mutex;
use std::time::{Duration, Instant};
use tauri::menu::{Menu, MenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{App, AppHandle, Manager, RunEvent, Runtime, State, Window, WindowEvent};
#[cfg(target_os = "macos")]
use tauri_plugin_autostart::ManagerExt;

const PREFERENCES_FILE_NAME: &str = "desktop-lifecycle.json";
const TRAY_ID: &str = "filament-manager-tray";
const TRAY_OPEN_ID: &str = "desktop-lifecycle-open";
const TRAY_QUIT_ID: &str = "desktop-lifecycle-quit";
const TRAY_LABEL_MAX_CHARACTERS: usize = 80;
#[cfg(target_os = "macos")]
const APP_LOCATION_UNSTABLE_ERROR: &str = "APP_LOCATION_UNSTABLE";
#[cfg(target_os = "macos")]
const MACOS_QUIT_ID: &str = "desktop-lifecycle-macos-quit";
const AUTOSTART_ID: &str = "no.bliatun.filamentmanager";
const SHUTDOWN_PHASE_RUNNING: u8 = 0;
const SHUTDOWN_PHASE_STOPPING: u8 = 1;
const SHUTDOWN_PHASE_ALLOW_EXIT: u8 = 2;
const BACKGROUND_TASK_SHUTDOWN_TIMEOUT: Duration = Duration::from_secs(2);
const BACKGROUND_TASK_ABORT_TIMEOUT: Duration = Duration::from_millis(500);
// Includes reconcile-gate handoff, the HTTP deadline, and the blocking mDNS teardown deadline.
const COMPANION_SHUTDOWN_TIMEOUT: Duration = Duration::from_secs(10);
const VISUAL_QA_ENV_VAR: &str = "FILAMENT_MANAGER_VISUAL_QA";
static DEFERRED_SHOW_REQUESTED: AtomicBool = AtomicBool::new(false);

#[derive(Clone, Copy, Debug, Default, Deserialize, Serialize, PartialEq, Eq)]
#[serde(default, deny_unknown_fields)]
struct PersistedDesktopPreferences {
    continue_in_background: bool,
}

#[derive(Clone, Copy, Debug, Serialize, PartialEq, Eq)]
pub struct DesktopLifecycleSettings {
    continue_in_background: bool,
    launch_at_login: bool,
    tray_available: bool,
}

pub struct DesktopLifecycleState {
    continue_in_background: AtomicBool,
    tray_available: AtomicBool,
    visual_qa: bool,
    shutdown_phase: AtomicU8,
    shutdown_tx: tokio::sync::watch::Sender<bool>,
    background_tasks: Mutex<Vec<tauri::async_runtime::JoinHandle<()>>>,
    preferences_write_lock: Mutex<()>,
    preferences_path: PathBuf,
}

impl DesktopLifecycleState {
    fn load(preferences_path: PathBuf, visual_qa: bool) -> Self {
        let preferences = if visual_qa {
            PersistedDesktopPreferences::default()
        } else {
            load_preferences(&preferences_path).unwrap_or_else(|error| {
                eprintln!("Desktop lifecycle preferences could not be loaded: {error}");
                PersistedDesktopPreferences::default()
            })
        };
        let (shutdown_tx, _) = tokio::sync::watch::channel(false);
        Self {
            continue_in_background: AtomicBool::new(preferences.continue_in_background),
            tray_available: AtomicBool::new(false),
            visual_qa,
            shutdown_phase: AtomicU8::new(SHUTDOWN_PHASE_RUNNING),
            shutdown_tx,
            background_tasks: Mutex::new(Vec::new()),
            preferences_write_lock: Mutex::new(()),
            preferences_path,
        }
    }

    fn should_hide_on_close(&self) -> bool {
        self.continue_in_background.load(Ordering::Acquire)
            && self.tray_available.load(Ordering::Acquire)
    }

    fn ensure_background_mode_available(&self, enabled: bool) -> Result<(), String> {
        if enabled && !self.tray_available.load(Ordering::Acquire) {
            return Err(
                "Continue in background requires an available system tray or menu bar.".to_string(),
            );
        }
        Ok(())
    }

    fn set_continue_in_background(&self, enabled: bool) -> Result<(), String> {
        if self.visual_qa {
            return Ok(());
        }
        let _write_guard = self
            .preferences_write_lock
            .lock()
            .map_err(|_| "Desktop lifecycle preference lock is unavailable".to_string())?;
        save_preferences(
            &self.preferences_path,
            PersistedDesktopPreferences {
                continue_in_background: enabled,
            },
        )?;
        self.continue_in_background
            .store(enabled, Ordering::Release);
        Ok(())
    }

    fn register_background_task(
        &self,
        handle: tauri::async_runtime::JoinHandle<()>,
    ) -> Result<(), String> {
        self.background_tasks
            .lock()
            .map_err(|_| "Background task registry is unavailable".to_string())?
            .push(handle);
        Ok(())
    }

    fn take_background_tasks(&self) -> Result<Vec<tauri::async_runtime::JoinHandle<()>>, String> {
        Ok(std::mem::take(&mut *self.background_tasks.lock().map_err(
            |_| "Background task registry is unavailable".to_string(),
        )?))
    }

    fn try_begin_shutdown(&self) -> bool {
        self.shutdown_phase
            .compare_exchange(
                SHUTDOWN_PHASE_RUNNING,
                SHUTDOWN_PHASE_STOPPING,
                Ordering::AcqRel,
                Ordering::Acquire,
            )
            .is_ok()
    }

    fn allow_exit(&self) {
        self.shutdown_phase
            .store(SHUTDOWN_PHASE_ALLOW_EXIT, Ordering::Release);
    }

    fn exit_is_allowed(&self) -> bool {
        self.shutdown_phase.load(Ordering::Acquire) == SHUTDOWN_PHASE_ALLOW_EXIT
    }
}

fn load_preferences(path: &Path) -> Result<PersistedDesktopPreferences, String> {
    match fs::read(path) {
        Ok(bytes) => serde_json::from_slice(&bytes)
            .map_err(|error| format!("{} is invalid: {error}", path.display())),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
            Ok(PersistedDesktopPreferences::default())
        }
        Err(error) => Err(format!("Failed to read {}: {error}", path.display())),
    }
}

fn save_preferences(path: &Path, preferences: PersistedDesktopPreferences) -> Result<(), String> {
    let parent = path
        .parent()
        .ok_or_else(|| "Desktop lifecycle preferences path has no parent".to_string())?;
    fs::create_dir_all(parent)
        .map_err(|error| format!("Failed to create {}: {error}", parent.display()))?;
    let bytes = serde_json::to_vec_pretty(&preferences)
        .map_err(|error| format!("Failed to serialize desktop lifecycle preferences: {error}"))?;
    let temporary_path = path.with_extension("json.tmp");
    let mut temporary_file = fs::OpenOptions::new()
        .create(true)
        .truncate(true)
        .write(true)
        .open(&temporary_path)
        .map_err(|error| format!("Failed to open {}: {error}", temporary_path.display()))?;
    temporary_file
        .write_all(&bytes)
        .and_then(|_| temporary_file.sync_all())
        .map_err(|error| format!("Failed to write {}: {error}", temporary_path.display()))?;
    drop(temporary_file);
    replace_preferences_file(&temporary_path, path)
}

#[cfg(not(target_os = "windows"))]
fn replace_preferences_file(temporary_path: &Path, path: &Path) -> Result<(), String> {
    fs::rename(temporary_path, path).map_err(|error| {
        format!(
            "Failed to replace {} with {}: {error}",
            path.display(),
            temporary_path.display()
        )
    })?;
    let parent = path
        .parent()
        .ok_or_else(|| "Desktop lifecycle preferences path has no parent".to_string())?;
    fs::File::open(parent)
        .and_then(|directory| directory.sync_all())
        .map_err(|error| format!("Failed to synchronize {}: {error}", parent.display()))
}

#[cfg(target_os = "windows")]
fn replace_preferences_file(temporary_path: &Path, path: &Path) -> Result<(), String> {
    use std::iter::once;
    use std::os::windows::ffi::OsStrExt;
    use windows_sys::Win32::Storage::FileSystem::{
        MoveFileExW, MOVEFILE_REPLACE_EXISTING, MOVEFILE_WRITE_THROUGH,
    };

    let temporary_path_wide = temporary_path
        .as_os_str()
        .encode_wide()
        .chain(once(0))
        .collect::<Vec<_>>();
    let path_wide = path
        .as_os_str()
        .encode_wide()
        .chain(once(0))
        .collect::<Vec<_>>();
    let moved = unsafe {
        MoveFileExW(
            temporary_path_wide.as_ptr(),
            path_wide.as_ptr(),
            MOVEFILE_REPLACE_EXISTING | MOVEFILE_WRITE_THROUGH,
        )
    };
    if moved == 0 {
        return Err(format!(
            "Failed to replace {} with {}: {}",
            path.display(),
            temporary_path.display(),
            std::io::Error::last_os_error()
        ));
    }
    Ok(())
}

pub fn configure_builder(builder: tauri::Builder<tauri::Wry>) -> tauri::Builder<tauri::Wry> {
    let builder = builder.plugin(tauri_plugin_single_instance::init(|app, args, _cwd| {
        if second_instance_should_show_window(&args)
            && let Err(error) = show_main_window_or_defer(app)
        {
            eprintln!("Could not show the existing app instance: {error}");
        }
    }));

    #[cfg(target_os = "macos")]
    let builder = builder
        .menu(macos_menu)
        .on_menu_event(handle_menu_event)
        .plugin(
            tauri_plugin_autostart::Builder::new()
                .app_name(AUTOSTART_ID)
                .arg("--background")
                .build(),
        );

    builder.on_window_event(handle_window_event)
}

pub fn initialize(app: &mut App) -> Result<(), String> {
    let preferences_path = app
        .path()
        .app_local_data_dir()
        .map_err(|error| format!("Desktop configuration directory is unavailable: {error}"))?
        .join(PREFERENCES_FILE_NAME);
    app.manage(DesktopLifecycleState::load(
        preferences_path,
        desktop_visual_qa_enabled(),
    ));

    match install_tray(app.handle()) {
        Ok(()) => {
            app.state::<DesktopLifecycleState>()
                .tray_available
                .store(true, Ordering::Release);
        }
        Err(error) => {
            eprintln!("System tray is unavailable: {error}");
            if launched_in_background() {
                show_main_window(app.handle())?;
            }
        }
    }

    if !launched_in_background() || DEFERRED_SHOW_REQUESTED.swap(false, Ordering::AcqRel) {
        show_main_window(app.handle())?;
    }
    Ok(())
}

pub fn subscribe_to_shutdown(app: &App) -> tokio::sync::watch::Receiver<bool> {
    app.state::<DesktopLifecycleState>().shutdown_tx.subscribe()
}

pub fn register_background_task(
    app: &App,
    handle: tauri::async_runtime::JoinHandle<()>,
) -> Result<(), String> {
    app.state::<DesktopLifecycleState>()
        .register_background_task(handle)
}

pub fn start_background_tasks(app: &App) -> Result<(), String> {
    let companion_state = app.state::<AppState>().inner().clone();
    register_background_task(
        app,
        tauri::async_runtime::spawn(async move {
            if let Err(error) = companion_api::reconcile_trusted_lan_server(companion_state).await {
                eprintln!("Trusted-LAN companion failed: {error}");
            }
        }),
    )?;

    let network_state = app.state::<AppState>().inner().clone();
    let network_shutdown = subscribe_to_shutdown(app);
    register_background_task(
        app,
        tauri::async_runtime::spawn(async move {
            crate::trusted_lan_network_watcher::run_trusted_lan_network_watcher(
                network_state,
                network_shutdown,
            )
            .await;
        }),
    )?;

    let live_state = app.state::<AppState>().inner().clone();
    let live_shutdown = subscribe_to_shutdown(app);
    register_background_task(
        app,
        tauri::async_runtime::spawn(async move {
            crate::bambu_live::run_live_observer(live_state, live_shutdown).await;
        }),
    )
}

fn install_tray(app: &AppHandle) -> Result<(), String> {
    let menu = build_tray_menu(app, "Open Filament Manager", "Quit Filament Manager")?;
    let mut builder = TrayIconBuilder::with_id(TRAY_ID)
        .menu(&menu)
        .tooltip("Filament Manager")
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id().as_ref() {
            TRAY_OPEN_ID => {
                if let Err(error) = show_main_window(app) {
                    eprintln!("Could not open the main window: {error}");
                }
            }
            TRAY_QUIT_ID => quit(app),
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if matches!(
                event,
                TrayIconEvent::Click {
                    button: MouseButton::Left,
                    button_state: MouseButtonState::Up,
                    ..
                }
            ) && let Err(error) = show_main_window(tray.app_handle())
            {
                eprintln!("Could not open the main window: {error}");
            }
        });
    if let Some(icon) = app.default_window_icon() {
        builder = builder.icon(icon.clone());
    }
    builder
        .build(app)
        .map(|_| ())
        .map_err(|error| format!("Failed to create tray icon: {error}"))
}

fn build_tray_menu(
    app: &AppHandle,
    open_label: &str,
    quit_label: &str,
) -> Result<Menu<tauri::Wry>, String> {
    let open_label = validate_tray_label(open_label)?;
    let quit_label = validate_tray_label(quit_label)?;
    let open = MenuItem::with_id(app, TRAY_OPEN_ID, open_label, true, None::<&str>)
        .map_err(|error| format!("Failed to create tray Open item: {error}"))?;
    let quit_item = MenuItem::with_id(app, TRAY_QUIT_ID, quit_label, true, None::<&str>)
        .map_err(|error| format!("Failed to create tray Quit item: {error}"))?;
    Menu::with_items(app, &[&open, &quit_item])
        .map_err(|error| format!("Failed to create tray menu: {error}"))
}

fn validate_tray_label(label: &str) -> Result<&str, String> {
    let label = label.trim();
    if label.is_empty()
        || label.chars().count() > TRAY_LABEL_MAX_CHARACTERS
        || label.chars().any(char::is_control)
    {
        return Err("Tray menu labels must be short, non-empty text.".to_string());
    }
    Ok(label)
}

pub fn show_main_window<R: Runtime>(app: &AppHandle<R>) -> Result<(), String> {
    if app
        .try_state::<DesktopLifecycleState>()
        .is_some_and(|state| state.shutdown_phase.load(Ordering::Acquire) != SHUTDOWN_PHASE_RUNNING)
    {
        return Ok(());
    }
    let window = app
        .get_webview_window("main")
        .ok_or_else(|| "Main window is unavailable".to_string())?;
    window
        .unminimize()
        .map_err(|error| format!("Failed to restore the main window: {error}"))?;
    window
        .show()
        .map_err(|error| format!("Failed to show the main window: {error}"))?;
    window
        .set_focus()
        .map_err(|error| format!("Failed to focus the main window: {error}"))
}

pub fn show_main_window_or_defer<R: Runtime>(app: &AppHandle<R>) -> Result<(), String> {
    DEFERRED_SHOW_REQUESTED.store(true, Ordering::Release);
    if app.get_webview_window("main").is_none() {
        return Ok(());
    }
    let result = show_main_window(app);
    if result.is_ok() {
        DEFERRED_SHOW_REQUESTED.store(false, Ordering::Release);
    }
    result
}

pub fn second_instance_should_show_window(arguments: &[String]) -> bool {
    !arguments.iter().any(|argument| argument == "--background")
}

pub fn handle_window_event(window: &Window, event: &WindowEvent) {
    if window.label() != "main" {
        return;
    }
    let WindowEvent::CloseRequested { api, .. } = event else {
        return;
    };
    let state = window.state::<DesktopLifecycleState>();
    if state.shutdown_phase.load(Ordering::Acquire) != SHUTDOWN_PHASE_RUNNING {
        api.prevent_close();
        return;
    }
    if state.should_hide_on_close() {
        match window.hide() {
            Ok(()) => api.prevent_close(),
            Err(error) => {
                eprintln!("Could not hide the main window; the app will quit instead: {error}");
                api.prevent_close();
                begin_shutdown(window.app_handle());
            }
        }
    } else {
        api.prevent_close();
        if let Err(error) = window.hide() {
            eprintln!("Could not hide the main window while quitting: {error}");
        }
        begin_shutdown(window.app_handle());
    }
}

pub fn handle_run_event(app: &AppHandle, event: RunEvent) {
    if let RunEvent::ExitRequested { api, .. } = &event
        && let Some(state) = app.try_state::<DesktopLifecycleState>()
        && !state.exit_is_allowed()
    {
        api.prevent_exit();
        begin_shutdown(app);
    }

    #[cfg(target_os = "macos")]
    if matches!(
        &event,
        RunEvent::Reopen {
            has_visible_windows: false,
            ..
        }
    ) && let Err(error) = show_main_window(app)
    {
        eprintln!("Could not reopen the main window: {error}");
    }

    #[cfg(not(target_os = "macos"))]
    let _ = (app, event);
}

pub fn quit<R: Runtime>(app: &AppHandle<R>) {
    begin_shutdown(app);
}

fn begin_shutdown<R: Runtime>(app: &AppHandle<R>) {
    let Some(state) = app.try_state::<DesktopLifecycleState>() else {
        app.exit(0);
        return;
    };
    if !state.try_begin_shutdown() {
        return;
    }

    if let Some(window) = app.get_webview_window("main")
        && let Err(error) = window.hide()
    {
        eprintln!("Could not hide the main window during shutdown: {error}");
    }
    state.shutdown_tx.send_replace(true);
    let background_tasks = state.take_background_tasks().unwrap_or_else(|error| {
        eprintln!("Could not take ownership of background tasks: {error}");
        Vec::new()
    });
    let app_state = app
        .try_state::<AppState>()
        .map(|state| state.inner().clone());
    if let Some(app_state) = app_state.as_ref() {
        app_state.companion.trusted_lan.mark_shutdown_started();
    }
    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        stop_background_tasks(background_tasks).await;
        if let Some(app_state) = app_state
            && tokio::time::timeout(
                COMPANION_SHUTDOWN_TIMEOUT,
                companion_api::shutdown_trusted_lan_server(&app_state),
            )
            .await
            .is_err()
        {
            eprintln!("Companion shutdown timed out; forcing application exit.");
        }
        if let Some(state) = app.try_state::<DesktopLifecycleState>() {
            state.allow_exit();
        }
        app.exit(0);
    });
}

async fn stop_background_tasks(mut tasks: Vec<tauri::async_runtime::JoinHandle<()>>) {
    let deadline = Instant::now() + BACKGROUND_TASK_SHUTDOWN_TIMEOUT;
    let mut unfinished = Vec::new();
    let mut tasks = tasks.drain(..);
    while let Some(mut task) = tasks.next() {
        let remaining = deadline.saturating_duration_since(Instant::now());
        if remaining.is_zero() {
            unfinished.push(task);
            unfinished.extend(tasks);
            break;
        }
        if tokio::time::timeout(remaining, &mut task).await.is_err() {
            unfinished.push(task);
            unfinished.extend(tasks);
            break;
        }
    }
    for mut task in unfinished {
        task.abort();
        let _ = tokio::time::timeout(BACKGROUND_TASK_ABORT_TIMEOUT, &mut task).await;
    }
}

#[cfg(target_os = "macos")]
pub fn macos_menu(app: &AppHandle) -> tauri::Result<Menu<tauri::Wry>> {
    // Tauri's predefined Quit item calls Cocoa `terminate:` directly and does not
    // emit a preventable ExitRequested event. Preserve the standard menu, but
    // replace that one item so Cmd+Q enters the coordinated shutdown path.
    let menu = Menu::default(app)?;
    let top_level_items = menu.items()?;
    let app_menu = top_level_items
        .first()
        .and_then(|item| item.as_submenu())
        .ok_or_else(|| tauri::Error::AssetNotFound("macOS application menu".into()))?;
    let app_menu_items = app_menu.items()?;
    let quit_position = app_menu_items
        .len()
        .checked_sub(1)
        .ok_or_else(|| tauri::Error::AssetNotFound("macOS Quit menu item".into()))?;
    let native_quit = app_menu_items[quit_position]
        .as_predefined_menuitem()
        .ok_or_else(|| tauri::Error::AssetNotFound("macOS Quit menu item".into()))?;
    let quit_text = native_quit.text()?;
    if quit_text != "Quit" && !quit_text.starts_with("Quit ") {
        return Err(tauri::Error::AssetNotFound("macOS Quit menu item".into()));
    }
    let _ = app_menu.remove_at(quit_position)?;
    let quit_item = MenuItem::with_id(app, MACOS_QUIT_ID, quit_text, true, Some("CmdOrCtrl+Q"))?;
    app_menu.append(&quit_item)?;
    Ok(menu)
}

#[cfg(target_os = "macos")]
pub fn handle_menu_event(app: &AppHandle, event: tauri::menu::MenuEvent) {
    if event.id().as_ref() == MACOS_QUIT_ID {
        quit(app);
    }
}

pub fn launched_in_background() -> bool {
    std::env::args().any(|argument| argument == "--background")
}

fn desktop_visual_qa_enabled() -> bool {
    visual_qa_value_enabled(std::env::var(VISUAL_QA_ENV_VAR).ok().as_deref())
}

fn visual_qa_value_enabled(value: Option<&str>) -> bool {
    matches!(
        value
            .unwrap_or_default()
            .trim()
            .to_ascii_lowercase()
            .as_str(),
        "1" | "true" | "yes" | "on"
    )
}

fn settings_with_launch_status(
    state: &DesktopLifecycleState,
    launch_at_login: bool,
) -> DesktopLifecycleSettings {
    DesktopLifecycleSettings {
        continue_in_background: !state.visual_qa
            && state.continue_in_background.load(Ordering::Acquire),
        launch_at_login: !state.visual_qa && launch_at_login,
        tray_available: state.tray_available.load(Ordering::Acquire),
    }
}

fn current_settings(
    app: &AppHandle,
    state: &DesktopLifecycleState,
) -> Result<DesktopLifecycleSettings, String> {
    let launch_at_login = if state.visual_qa {
        false
    } else {
        launch_at_login_enabled(app)?
    };
    Ok(settings_with_launch_status(state, launch_at_login))
}

#[tauri::command]
pub fn get_desktop_lifecycle_settings(
    app: AppHandle,
    state: State<'_, DesktopLifecycleState>,
) -> Result<DesktopLifecycleSettings, String> {
    current_settings(&app, state.inner())
}

#[tauri::command]
pub fn set_continue_in_background(
    app: AppHandle,
    state: State<'_, DesktopLifecycleState>,
    enabled: bool,
) -> Result<DesktopLifecycleSettings, String> {
    if state.visual_qa {
        return Ok(settings_with_launch_status(state.inner(), false));
    }
    state.ensure_background_mode_available(enabled)?;
    let launch_at_login = launch_at_login_enabled(&app)?;
    state.set_continue_in_background(enabled)?;
    Ok(settings_with_launch_status(state.inner(), launch_at_login))
}

#[tauri::command]
pub fn set_launch_at_login(
    app: AppHandle,
    state: State<'_, DesktopLifecycleState>,
    enabled: bool,
) -> Result<DesktopLifecycleSettings, String> {
    if state.visual_qa {
        return Ok(settings_with_launch_status(state.inner(), false));
    }
    update_launch_at_login(&app, enabled)?;
    Ok(settings_with_launch_status(state.inner(), enabled))
}

#[tauri::command]
pub fn set_desktop_tray_menu_labels(
    app: AppHandle,
    open_label: String,
    quit_label: String,
) -> Result<(), String> {
    let menu = build_tray_menu(&app, &open_label, &quit_label)?;
    let tray = app
        .tray_by_id(TRAY_ID)
        .ok_or_else(|| "The system tray or menu bar icon is unavailable.".to_string())?;
    tray.set_menu(Some(menu))
        .map_err(|error| format!("Could not update tray menu labels: {error}"))?;
    #[cfg(target_os = "macos")]
    if let Err(error) = set_macos_quit_label(&app, &quit_label) {
        eprintln!("Could not localize the macOS application Quit item: {error}");
    }
    Ok(())
}

#[cfg(target_os = "macos")]
fn set_macos_quit_label(app: &AppHandle, quit_label: &str) -> Result<(), String> {
    let quit_label = validate_tray_label(quit_label)?;
    let menu = app
        .menu()
        .ok_or_else(|| "macOS application menu is unavailable".to_string())?;
    let app_menu = menu
        .items()
        .map_err(|error| error.to_string())?
        .into_iter()
        .next()
        .and_then(|item| item.as_submenu().cloned())
        .ok_or_else(|| "macOS application submenu is unavailable".to_string())?;
    let quit_item = app_menu
        .get(MACOS_QUIT_ID)
        .and_then(|item| item.as_menuitem().cloned())
        .ok_or_else(|| "macOS application Quit item is unavailable".to_string())?;
    quit_item
        .set_text(quit_label)
        .map_err(|error| error.to_string())
}

#[cfg(target_os = "macos")]
fn launch_at_login_enabled(app: &AppHandle) -> Result<bool, String> {
    app.autolaunch()
        .is_enabled()
        .map_err(|error| error.to_string())
}

#[cfg(target_os = "macos")]
fn update_launch_at_login(app: &AppHandle, enabled: bool) -> Result<(), String> {
    if enabled {
        let executable = std::env::current_exe()
            .map_err(|error| format!("Could not resolve the application path: {error}"))?;
        let executable_path = executable.to_string_lossy();
        if executable_path.starts_with("/Volumes/")
            || executable_path.contains("/AppTranslocation/")
        {
            return Err(APP_LOCATION_UNSTABLE_ERROR.to_string());
        }
        app.autolaunch()
            .enable()
            .map_err(|error| format!("Could not enable launch at login: {error}"))
    } else {
        app.autolaunch()
            .disable()
            .map_err(|error| format!("Could not disable launch at login: {error}"))
    }
}

#[cfg(target_os = "windows")]
fn launch_at_login_enabled(_app: &AppHandle) -> Result<bool, String> {
    windows_autostart::is_enabled()
}

#[cfg(target_os = "windows")]
fn update_launch_at_login(_app: &AppHandle, enabled: bool) -> Result<(), String> {
    if enabled {
        windows_autostart::enable()
    } else {
        windows_autostart::disable()
    }
}

#[cfg(not(any(target_os = "macos", target_os = "windows")))]
fn launch_at_login_enabled(_app: &AppHandle) -> Result<bool, String> {
    Ok(false)
}

#[cfg(not(any(target_os = "macos", target_os = "windows")))]
fn update_launch_at_login(_app: &AppHandle, _enabled: bool) -> Result<(), String> {
    Err("Launch at login is supported only on macOS and Windows.".to_string())
}

#[cfg(any(target_os = "windows", test))]
fn windows_autostart_command(executable: &Path) -> String {
    format!("\"{}\" --background", executable.display())
}

#[cfg(any(target_os = "windows", test))]
fn windows_startup_approved_allows_launch(value: &[u8]) -> Option<bool> {
    if value.len() < 8 {
        return None;
    }
    // Windows records a disable timestamp in the final eight bytes. Enabled/default entries keep
    // those bytes at zero, independently of the leading state byte used by different versions.
    Some(value.iter().rev().take(8).all(|byte| *byte == 0))
}

#[cfg(target_os = "windows")]
mod windows_autostart {
    use super::{windows_autostart_command, windows_startup_approved_allows_launch, AUTOSTART_ID};
    use std::io;
    use winreg::enums::{RegType, HKEY_CURRENT_USER, KEY_READ, KEY_WRITE};
    use winreg::RegKey;

    const RUN_KEY: &str = r"Software\Microsoft\Windows\CurrentVersion\Run";
    const STARTUP_APPROVED_KEY: &str =
        r"Software\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\Run";
    const LEGACY_AUTOSTART_ID: &str = "Filament Manager";

    pub(super) fn enable() -> Result<(), String> {
        let command = expected_command()?;
        let current_user = RegKey::predef(HKEY_CURRENT_USER);
        let (run, _) = current_user
            .create_subkey_with_flags(RUN_KEY, KEY_WRITE)
            .map_err(|error| format!("Could not open the Windows startup registry: {error}"))?;
        run.set_value(AUTOSTART_ID, &command)
            .map_err(|error| format!("Could not enable launch at login: {error}"))?;
        delete_value_if_present(&run, LEGACY_AUTOSTART_ID)?;
        clear_startup_approval_overrides(&current_user)
    }

    pub(super) fn disable() -> Result<(), String> {
        let current_user = RegKey::predef(HKEY_CURRENT_USER);
        match current_user.open_subkey_with_flags(RUN_KEY, KEY_WRITE) {
            Ok(run) => {
                delete_value_if_present(&run, AUTOSTART_ID)?;
                delete_value_if_present(&run, LEGACY_AUTOSTART_ID)?;
            }
            Err(error) if error.kind() == io::ErrorKind::NotFound => {}
            Err(error) => {
                return Err(format!(
                    "Could not open the Windows startup registry: {error}"
                ));
            }
        }
        clear_startup_approval_overrides(&current_user)
    }

    pub(super) fn is_enabled() -> Result<bool, String> {
        let current_user = RegKey::predef(HKEY_CURRENT_USER);
        let run = match current_user.open_subkey_with_flags(RUN_KEY, KEY_READ) {
            Ok(run) => run,
            Err(error) if error.kind() == io::ErrorKind::NotFound => return Ok(false),
            Err(error) => {
                return Err(format!(
                    "Could not open the Windows startup registry: {error}"
                ));
            }
        };
        let value = match run.get_value::<String, _>(AUTOSTART_ID) {
            Ok(value) => value,
            Err(error) if error.kind() == io::ErrorKind::NotFound => return Ok(false),
            Err(error) => return Err(format!("Could not read launch-at-login setting: {error}")),
        };
        if value != expected_command()? {
            return Ok(false);
        }

        let approved = match current_user.open_subkey_with_flags(STARTUP_APPROVED_KEY, KEY_READ) {
            Ok(approved) => approved,
            Err(error) if error.kind() == io::ErrorKind::NotFound => return Ok(true),
            Err(error) => {
                return Err(format!(
                    "Could not read Windows startup approval settings: {error}"
                ));
            }
        };
        let override_value = match approved.get_raw_value(AUTOSTART_ID) {
            Ok(value) => value,
            Err(error) if error.kind() == io::ErrorKind::NotFound => return Ok(true),
            Err(error) => {
                return Err(format!(
                    "Could not read Windows startup approval status: {error}"
                ));
            }
        };
        if override_value.vtype != RegType::REG_BINARY {
            return Err("Windows startup approval status has an unexpected type.".to_string());
        }
        windows_startup_approved_allows_launch(&override_value.bytes)
            .ok_or_else(|| "Windows startup approval status is invalid.".to_string())
    }

    fn expected_command() -> Result<String, String> {
        let executable = std::env::current_exe()
            .map_err(|error| format!("Could not resolve the application path: {error}"))?;
        Ok(windows_autostart_command(&executable))
    }

    fn clear_startup_approval_overrides(current_user: &RegKey) -> Result<(), String> {
        let approved = match current_user.open_subkey_with_flags(STARTUP_APPROVED_KEY, KEY_WRITE) {
            Ok(approved) => approved,
            Err(error) if error.kind() == io::ErrorKind::NotFound => return Ok(()),
            Err(error) => {
                return Err(format!(
                    "Could not open Windows startup approval settings: {error}"
                ));
            }
        };
        delete_value_if_present(&approved, AUTOSTART_ID)?;
        delete_value_if_present(&approved, LEGACY_AUTOSTART_ID)
    }

    fn delete_value_if_present(key: &RegKey, name: &str) -> Result<(), String> {
        match key.delete_value(name) {
            Ok(()) => Ok(()),
            Err(error) if error.kind() == io::ErrorKind::NotFound => Ok(()),
            Err(error) => Err(format!(
                "Could not remove Windows startup value {name}: {error}"
            )),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn missing_preferences_default_to_normal_close() {
        let path = std::env::temp_dir().join(format!(
            "filament-manager-missing-desktop-preferences-{}",
            std::process::id()
        ));
        let _ = fs::remove_file(&path);
        assert_eq!(
            load_preferences(&path).expect("missing preferences should be valid"),
            PersistedDesktopPreferences::default()
        );
    }

    #[test]
    fn malformed_preferences_are_rejected() {
        let error = serde_json::from_str::<PersistedDesktopPreferences>(
            r#"{"continue_in_background":true,"unexpected":true}"#,
        )
        .expect_err("unknown fields must be rejected");
        assert!(error.to_string().contains("unknown field"));
    }

    #[test]
    fn visual_qa_values_are_recognized_without_mutating_the_process_environment() {
        for enabled in ["1", " true ", "YES", "On"] {
            assert!(visual_qa_value_enabled(Some(enabled)));
        }
        for disabled in ["", "0", "false", "off", "unexpected"] {
            assert!(!visual_qa_value_enabled(Some(disabled)));
        }
        assert!(!visual_qa_value_enabled(None));
    }

    #[test]
    fn visual_qa_ignores_and_does_not_write_desktop_preferences() {
        let test_directory = std::env::temp_dir().join(format!(
            "filament-manager-visual-qa-desktop-preferences-{}-{:?}",
            std::process::id(),
            std::thread::current().id()
        ));
        fs::create_dir_all(&test_directory).expect("test directory should be created");
        let path = test_directory.join(PREFERENCES_FILE_NAME);
        let original = br#"{"continue_in_background":true}"#;
        fs::write(&path, original).expect("test preferences should be written");

        let state = DesktopLifecycleState::load(path.clone(), true);
        state.tray_available.store(true, Ordering::Release);
        assert_eq!(
            settings_with_launch_status(&state, true),
            DesktopLifecycleSettings {
                continue_in_background: false,
                launch_at_login: false,
                tray_available: true,
            }
        );

        state
            .set_continue_in_background(true)
            .expect("visual QA preference changes should be isolated");
        assert_eq!(
            fs::read(&path).expect("test preferences should remain readable"),
            original
        );
        fs::remove_dir_all(test_directory).expect("test directory should be removed");
    }

    #[test]
    fn close_to_tray_requires_both_the_preference_and_a_tray() {
        let (shutdown_tx, _) = tokio::sync::watch::channel(false);
        let state = DesktopLifecycleState {
            continue_in_background: AtomicBool::new(true),
            tray_available: AtomicBool::new(false),
            visual_qa: false,
            shutdown_phase: AtomicU8::new(SHUTDOWN_PHASE_RUNNING),
            shutdown_tx,
            background_tasks: Mutex::new(Vec::new()),
            preferences_write_lock: Mutex::new(()),
            preferences_path: PathBuf::new(),
        };
        assert!(!state.should_hide_on_close());
        assert!(state.ensure_background_mode_available(true).is_err());
        assert!(state.ensure_background_mode_available(false).is_ok());
        state.tray_available.store(true, Ordering::Release);
        assert!(state.ensure_background_mode_available(true).is_ok());
        assert!(state.should_hide_on_close());
        state.continue_in_background.store(false, Ordering::Release);
        assert!(!state.should_hide_on_close());
    }

    #[test]
    fn shutdown_phase_starts_once_and_allows_only_the_final_exit() {
        let (shutdown_tx, _) = tokio::sync::watch::channel(false);
        let state = DesktopLifecycleState {
            continue_in_background: AtomicBool::new(false),
            tray_available: AtomicBool::new(true),
            visual_qa: false,
            shutdown_phase: AtomicU8::new(SHUTDOWN_PHASE_RUNNING),
            shutdown_tx,
            background_tasks: Mutex::new(Vec::new()),
            preferences_write_lock: Mutex::new(()),
            preferences_path: PathBuf::new(),
        };

        assert!(!state.exit_is_allowed());
        assert!(state.try_begin_shutdown());
        assert!(!state.try_begin_shutdown());
        assert!(!state.exit_is_allowed());
        state.allow_exit();
        assert!(state.exit_is_allowed());
        assert!(!state.try_begin_shutdown());
    }

    #[test]
    fn background_second_instance_does_not_reveal_the_window() {
        assert!(!second_instance_should_show_window(&[
            "filament-manager".to_string(),
            "--background".to_string(),
        ]));
        assert!(second_instance_should_show_window(&[
            "filament-manager".to_string(),
        ]));
    }

    #[test]
    fn windows_autostart_quotes_executable_paths() {
        let executable =
            Path::new(r"C:\Users\Bjorn Liatun\AppData\Local\Filament Manager\filament-manager.exe");
        assert_eq!(
            windows_autostart_command(executable),
            r#""C:\Users\Bjorn Liatun\AppData\Local\Filament Manager\filament-manager.exe" --background"#
        );
    }

    #[test]
    fn tray_menu_labels_reject_empty_long_and_control_text() {
        assert_eq!(
            validate_tray_label("  Open Filament Manager  "),
            Ok("Open Filament Manager")
        );
        assert!(validate_tray_label("").is_err());
        assert!(validate_tray_label("Open\nFilament Manager").is_err());
        assert!(validate_tray_label(&"x".repeat(TRAY_LABEL_MAX_CHARACTERS + 1)).is_err());
    }

    #[test]
    fn windows_startup_approval_parser_honors_task_manager_overrides() {
        let enabled = [
            0x02, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
        ];
        let disabled = [
            0x03, 0x00, 0x00, 0x00, 0xa5, 0x20, 0xf6, 0x4a, 0x95, 0xd7, 0xd9, 0x01,
        ];

        assert_eq!(windows_startup_approved_allows_launch(&enabled), Some(true));
        assert_eq!(
            windows_startup_approved_allows_launch(&disabled),
            Some(false)
        );
        assert_eq!(windows_startup_approved_allows_launch(&[0; 7]), None);
    }

    #[test]
    fn saved_preferences_replace_the_previous_file() {
        let test_directory = std::env::temp_dir().join(format!(
            "filament-manager-desktop-preferences-{}-{:?}",
            std::process::id(),
            std::thread::current().id()
        ));
        fs::create_dir_all(&test_directory).expect("test directory should be created");
        let path = test_directory.join(PREFERENCES_FILE_NAME);

        save_preferences(
            &path,
            PersistedDesktopPreferences {
                continue_in_background: false,
            },
        )
        .expect("initial preferences should be saved");
        save_preferences(
            &path,
            PersistedDesktopPreferences {
                continue_in_background: true,
            },
        )
        .expect("updated preferences should replace the previous file");

        assert_eq!(
            load_preferences(&path).expect("saved preferences should load"),
            PersistedDesktopPreferences {
                continue_in_background: true,
            }
        );
        fs::remove_dir_all(test_directory).expect("test directory should be removed");
    }
}
