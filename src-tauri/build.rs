use std::env;

const BUILD_COMMIT_ENV: &str = "FILAMENT_MANAGER_BUILD_COMMIT";
const BUILD_TARGET_ENV: &str = "FILAMENT_MANAGER_BUILD_TARGET";
const DISTRIBUTION_CHANNEL_ENV: &str = "FILAMENT_MANAGER_DISTRIBUTION_CHANNEL";
const UPDATE_METADATA_URL_ENV: &str = "FILAMENT_MANAGER_UPDATE_METADATA_URL";

fn sanitized_build_commit() -> String {
    [env::var(BUILD_COMMIT_ENV).ok(), env::var("GITHUB_SHA").ok()]
        .into_iter()
        .flatten()
        .map(|value| value.trim().to_ascii_lowercase())
        .find(|value| {
            (7..=64).contains(&value.len()) && value.bytes().all(|byte| byte.is_ascii_hexdigit())
        })
        .unwrap_or_else(|| "unknown".to_string())
}

fn sanitized_identifier(value: Option<String>, fallback: &str) -> String {
    let Some(value) = value.map(|value| value.trim().to_string()) else {
        return fallback.to_string();
    };
    if value.is_empty()
        || value.len() > 128
        || !value
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'_' | b'.'))
    {
        return fallback.to_string();
    }
    value
}

fn distribution_channel() -> String {
    if let Ok(value) = env::var(DISTRIBUTION_CHANNEL_ENV) {
        return sanitized_identifier(Some(value), "unknown");
    }
    if env::var("GITHUB_REF_TYPE").is_ok_and(|value| value == "tag") {
        return "github-release".to_string();
    }
    if env::var("GITHUB_ACTIONS").is_ok_and(|value| value == "true") {
        return "ci-artifact".to_string();
    }
    "development".to_string()
}

fn public_update_metadata_url() -> String {
    let value = env::var(UPDATE_METADATA_URL_ENV).unwrap_or_default();
    let value = value.trim();
    if value.is_empty()
        || value.len() > 2_048
        || value.chars().any(char::is_control)
        || !value.starts_with("https://")
    {
        return String::new();
    }
    value.to_string()
}

fn emit_build_metadata() {
    for variable in [
        BUILD_COMMIT_ENV,
        BUILD_TARGET_ENV,
        DISTRIBUTION_CHANNEL_ENV,
        UPDATE_METADATA_URL_ENV,
        "GITHUB_ACTIONS",
        "GITHUB_REF_TYPE",
        "GITHUB_SHA",
        "TARGET",
    ] {
        println!("cargo:rerun-if-env-changed={variable}");
    }

    let target = sanitized_identifier(
        env::var(BUILD_TARGET_ENV)
            .ok()
            .or_else(|| env::var("TARGET").ok()),
        "unknown",
    );
    println!(
        "cargo:rustc-env=FILAMENT_MANAGER_BUILD_COMMIT={}",
        sanitized_build_commit()
    );
    println!("cargo:rustc-env=FILAMENT_MANAGER_BUILD_TARGET={target}");
    println!(
        "cargo:rustc-env=FILAMENT_MANAGER_DISTRIBUTION_CHANNEL={}",
        distribution_channel()
    );
    println!(
        "cargo:rustc-env=FILAMENT_MANAGER_UPDATE_METADATA_URL={}",
        public_update_metadata_url()
    );
}

fn main() {
    emit_build_metadata();
    tauri_build::build()
}
