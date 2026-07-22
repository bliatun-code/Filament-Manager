const TAURI_MAIN_SOURCE: &str = include_str!("../src-tauri/src/main.rs");
const CORE_BACKEND_MODULE_SOURCE: &str = include_str!("backend/mod.rs");

#[test]
fn tauri_uses_the_core_crate_without_cross_tree_backend_paths() {
    assert!(
        TAURI_MAIN_SOURCE.contains("use filament_manager_core::backend;"),
        "the Tauri crate should import the workspace core backend"
    );
    assert!(
        !TAURI_MAIN_SOURCE.contains("mod backend;"),
        "the Tauri crate must not compile a second backend module tree"
    );
    assert!(
        !CORE_BACKEND_MODULE_SOURCE.contains("#[path"),
        "the core backend should use normal colocated Rust modules"
    );
}
