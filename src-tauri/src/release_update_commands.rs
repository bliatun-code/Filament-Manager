use reqwest::header::{ACCEPT, CACHE_CONTROL, USER_AGENT};
use reqwest::StatusCode;
use semver::Version;
use serde::{Deserialize, Serialize};
use std::io::Read;
use std::time::Duration;

const GITHUB_LATEST_RELEASE_API_URL: &str =
    "https://api.github.com/repos/bliatun-code/Filament-Manager/releases/latest";
const GITHUB_LATEST_RELEASE_PAGE_URL: &str =
    "https://github.com/bliatun-code/Filament-Manager/releases/latest";
const GITHUB_API_VERSION: &str = "2026-03-10";
const UPDATE_CHECK_TIMEOUT: Duration = Duration::from_secs(5);
const UPDATE_RESPONSE_MAX_BYTES: u64 = 64 * 1024;

#[derive(Debug, Deserialize)]
struct GithubLatestReleaseResponse {
    tag_name: String,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub(crate) enum AppUpdateStatus {
    UpdateAvailable,
    UpToDate,
    DevelopmentBuild,
    ReleaseInfoUnavailable,
}

#[derive(Debug, Eq, PartialEq, Serialize)]
pub(crate) struct AppUpdateCheckResult {
    current_version: String,
    latest_version: Option<String>,
    latest_tag: Option<String>,
    release_url: String,
    status: AppUpdateStatus,
}

fn parse_current_version(current_version: &str) -> Result<Version, String> {
    Version::parse(current_version.trim())
        .map_err(|_| "Installed application version is invalid.".to_string())
}

fn parse_release_version(tag: &str) -> Result<Version, String> {
    let trimmed = tag.trim();
    let version = trimmed
        .strip_prefix('v')
        .or_else(|| trimmed.strip_prefix('V'))
        .unwrap_or(trimmed);
    Version::parse(version).map_err(|_| "Latest release has an invalid version.".to_string())
}

fn build_update_check_result(
    current_version: &str,
    latest_tag: &str,
) -> Result<AppUpdateCheckResult, String> {
    let current = parse_current_version(current_version)?;
    let latest = parse_release_version(latest_tag)?;
    let status = if latest > current {
        AppUpdateStatus::UpdateAvailable
    } else if latest == current {
        AppUpdateStatus::UpToDate
    } else {
        AppUpdateStatus::DevelopmentBuild
    };

    Ok(AppUpdateCheckResult {
        current_version: current.to_string(),
        latest_version: Some(latest.to_string()),
        latest_tag: Some(latest_tag.trim().to_string()),
        release_url: GITHUB_LATEST_RELEASE_PAGE_URL.to_string(),
        status,
    })
}

fn build_release_info_unavailable_result(
    current_version: &str,
) -> Result<AppUpdateCheckResult, String> {
    let current = parse_current_version(current_version)?;
    Ok(AppUpdateCheckResult {
        current_version: current.to_string(),
        latest_version: None,
        latest_tag: None,
        release_url: GITHUB_LATEST_RELEASE_PAGE_URL.to_string(),
        status: AppUpdateStatus::ReleaseInfoUnavailable,
    })
}

fn check_for_app_update_blocking(current_version: &str) -> Result<AppUpdateCheckResult, String> {
    let client = reqwest::blocking::Client::builder()
        .timeout(UPDATE_CHECK_TIMEOUT)
        .redirect(reqwest::redirect::Policy::none())
        .build()
        .map_err(|_| "Update check could not be prepared.".to_string())?;
    let response = client
        .get(GITHUB_LATEST_RELEASE_API_URL)
        .header(ACCEPT, "application/vnd.github+json")
        .header(CACHE_CONTROL, "no-cache")
        .header(
            USER_AGENT,
            format!("Filament-Manager/{}", env!("CARGO_PKG_VERSION")),
        )
        .header("X-GitHub-Api-Version", GITHUB_API_VERSION)
        .send()
        .map_err(|_| "Latest release could not be reached.".to_string())?;

    if response.status() == StatusCode::NOT_FOUND {
        return build_release_info_unavailable_result(current_version);
    }
    if !response.status().is_success() {
        return Err("Latest release is not available.".to_string());
    }
    if response
        .content_length()
        .is_some_and(|length| length > UPDATE_RESPONSE_MAX_BYTES)
    {
        return Err("Latest release response is too large.".to_string());
    }

    let mut body = Vec::new();
    response
        .take(UPDATE_RESPONSE_MAX_BYTES + 1)
        .read_to_end(&mut body)
        .map_err(|_| "Latest release response could not be read.".to_string())?;
    if body.len() as u64 > UPDATE_RESPONSE_MAX_BYTES {
        return Err("Latest release response is too large.".to_string());
    }
    let release: GithubLatestReleaseResponse = serde_json::from_slice(&body)
        .map_err(|_| "Latest release response is invalid.".to_string())?;
    build_update_check_result(current_version, &release.tag_name)
}

#[tauri::command]
pub(crate) async fn check_for_app_update(
    app: tauri::AppHandle,
) -> Result<AppUpdateCheckResult, String> {
    let current_version = app.package_info().version.to_string();
    tauri::async_runtime::spawn_blocking(move || check_for_app_update_blocking(&current_version))
        .await
        .map_err(|_| "Update check did not complete.".to_string())?
}

#[cfg(test)]
mod tests {
    use super::{
        build_release_info_unavailable_result, build_update_check_result, parse_release_version,
        AppUpdateStatus,
    };

    #[test]
    fn release_versions_accept_v_prefix_and_semver_prereleases() {
        assert_eq!(
            parse_release_version("v1.2.3").unwrap().to_string(),
            "1.2.3"
        );
        assert_eq!(
            parse_release_version("V2.0.0-rc.1").unwrap().to_string(),
            "2.0.0-rc.1"
        );
        assert!(parse_release_version("release-1").is_err());
    }

    #[test]
    fn update_check_classifies_new_equal_and_older_releases() {
        assert_eq!(
            build_update_check_result("1.2.3", "v1.3.0").unwrap().status,
            AppUpdateStatus::UpdateAvailable
        );
        assert_eq!(
            build_update_check_result("1.2.3", "v1.2.3").unwrap().status,
            AppUpdateStatus::UpToDate
        );
        assert_eq!(
            build_update_check_result("1.3.0", "v1.2.3").unwrap().status,
            AppUpdateStatus::DevelopmentBuild
        );
    }

    #[test]
    fn update_check_uses_only_the_fixed_release_page() {
        let result = build_update_check_result("1.0.0", "v1.1.0").unwrap();
        assert_eq!(result.latest_tag.as_deref(), Some("v1.1.0"));
        assert_eq!(
            result.release_url,
            "https://github.com/bliatun-code/Filament-Manager/releases/latest"
        );
    }

    #[test]
    fn unavailable_release_metadata_is_a_safe_result_without_release_values() {
        let result = build_release_info_unavailable_result("0.21.2").unwrap();
        assert_eq!(result.current_version, "0.21.2");
        assert_eq!(result.latest_version, None);
        assert_eq!(result.latest_tag, None);
        assert_eq!(result.status, AppUpdateStatus::ReleaseInfoUnavailable);
    }
}
