use reqwest::header::{ACCEPT, CACHE_CONTROL, USER_AGENT};
use semver::Version;
use serde::{Deserialize, Serialize};
use std::io::Read;
use std::time::Duration;
use url::Url;

const GITHUB_LATEST_RELEASE_PAGE_URL: &str =
    "https://github.com/bliatun-code/Filament-Manager/releases/latest";
const CONFIGURED_UPDATE_METADATA_URL: &str = env!("FILAMENT_MANAGER_UPDATE_METADATA_URL");
const UPDATE_CHECK_TIMEOUT: Duration = Duration::from_secs(5);
const UPDATE_RESPONSE_MAX_BYTES: u64 = 64 * 1024;

#[derive(Debug, Deserialize)]
struct LatestReleaseMetadata {
    tag_name: String,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub(crate) enum AppUpdateChannel {
    Disabled,
    PublicMetadata,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub(crate) enum AppUpdateStatus {
    UpdateAvailable,
    UpToDate,
    DevelopmentBuild,
    ReleaseInfoUnavailable,
    UpdateChannelDisabled,
}

#[derive(Debug, Eq, PartialEq, Serialize)]
pub(crate) struct AppUpdateCheckResult {
    current_version: String,
    latest_version: Option<String>,
    latest_tag: Option<String>,
    release_url: String,
    status: AppUpdateStatus,
    update_channel: AppUpdateChannel,
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
        update_channel: AppUpdateChannel::PublicMetadata,
    })
}

fn build_update_check_result_or_unavailable(
    current_version: &str,
    latest_tag: &str,
) -> Result<AppUpdateCheckResult, String> {
    match build_update_check_result(current_version, latest_tag) {
        Ok(result) => Ok(result),
        Err(_) => build_release_info_unavailable_result(current_version),
    }
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
        update_channel: AppUpdateChannel::PublicMetadata,
    })
}

fn build_update_channel_disabled_result(
    current_version: &str,
) -> Result<AppUpdateCheckResult, String> {
    let current = parse_current_version(current_version)?;
    Ok(AppUpdateCheckResult {
        current_version: current.to_string(),
        latest_version: None,
        latest_tag: None,
        release_url: GITHUB_LATEST_RELEASE_PAGE_URL.to_string(),
        status: AppUpdateStatus::UpdateChannelDisabled,
        update_channel: AppUpdateChannel::Disabled,
    })
}

fn public_update_metadata_url(configured_url: &str) -> Option<Url> {
    let configured_url = configured_url.trim();
    if configured_url.is_empty() {
        return None;
    }
    let url = Url::parse(configured_url).ok()?;
    if url.scheme() != "https"
        || url.host_str().is_none()
        || !url.username().is_empty()
        || url.password().is_some()
        || url.query().is_some()
        || url.fragment().is_some()
    {
        return None;
    }
    Some(url)
}

fn check_for_app_update_blocking(
    current_version: &str,
    configured_metadata_url: &str,
) -> Result<AppUpdateCheckResult, String> {
    let Some(metadata_url) = public_update_metadata_url(configured_metadata_url) else {
        return build_update_channel_disabled_result(current_version);
    };
    let client = match reqwest::blocking::Client::builder()
        .timeout(UPDATE_CHECK_TIMEOUT)
        .redirect(reqwest::redirect::Policy::none())
        .build()
    {
        Ok(client) => client,
        Err(_) => return build_release_info_unavailable_result(current_version),
    };
    let response = match client
        .get(metadata_url)
        .header(ACCEPT, "application/json")
        .header(CACHE_CONTROL, "no-cache")
        .header(
            USER_AGENT,
            format!("Filament-Manager/{}", env!("CARGO_PKG_VERSION")),
        )
        .send()
    {
        Ok(response) => response,
        Err(_) => return build_release_info_unavailable_result(current_version),
    };

    if !response.status().is_success() {
        return build_release_info_unavailable_result(current_version);
    }
    if response
        .content_length()
        .is_some_and(|length| length > UPDATE_RESPONSE_MAX_BYTES)
    {
        return build_release_info_unavailable_result(current_version);
    }

    let mut body = Vec::new();
    if response
        .take(UPDATE_RESPONSE_MAX_BYTES + 1)
        .read_to_end(&mut body)
        .is_err()
    {
        return build_release_info_unavailable_result(current_version);
    }
    if body.len() as u64 > UPDATE_RESPONSE_MAX_BYTES {
        return build_release_info_unavailable_result(current_version);
    }
    let release: LatestReleaseMetadata = match serde_json::from_slice(&body) {
        Ok(release) => release,
        Err(_) => return build_release_info_unavailable_result(current_version),
    };
    build_update_check_result_or_unavailable(current_version, &release.tag_name)
}

#[tauri::command]
pub(crate) async fn check_for_app_update(
    app: tauri::AppHandle,
) -> Result<AppUpdateCheckResult, String> {
    let current_version = app.package_info().version.to_string();
    tauri::async_runtime::spawn_blocking(move || {
        check_for_app_update_blocking(&current_version, CONFIGURED_UPDATE_METADATA_URL)
    })
    .await
    .map_err(|_| "Update check did not complete.".to_string())?
}

#[cfg(test)]
mod tests {
    use super::{
        build_release_info_unavailable_result, build_update_channel_disabled_result,
        build_update_check_result, build_update_check_result_or_unavailable,
        check_for_app_update_blocking, parse_release_version, public_update_metadata_url,
        AppUpdateChannel, AppUpdateStatus,
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
        assert_eq!(result.update_channel, AppUpdateChannel::PublicMetadata);
    }

    #[test]
    fn unavailable_release_metadata_is_a_safe_result_without_release_values() {
        let result = build_release_info_unavailable_result("0.21.2").unwrap();
        assert_eq!(result.current_version, "0.21.2");
        assert_eq!(result.latest_version, None);
        assert_eq!(result.latest_tag, None);
        assert_eq!(result.status, AppUpdateStatus::ReleaseInfoUnavailable);
        assert_eq!(result.update_channel, AppUpdateChannel::PublicMetadata);
    }

    #[test]
    fn invalid_release_version_is_reported_as_unavailable_metadata() {
        let result = build_update_check_result_or_unavailable("0.22.0", "release-current").unwrap();
        assert_eq!(result.current_version, "0.22.0");
        assert_eq!(result.latest_version, None);
        assert_eq!(result.latest_tag, None);
        assert_eq!(result.status, AppUpdateStatus::ReleaseInfoUnavailable);
        assert_eq!(result.update_channel, AppUpdateChannel::PublicMetadata);
    }

    #[test]
    fn update_channel_is_disabled_without_explicit_public_metadata() {
        let result = build_update_channel_disabled_result("0.21.2").unwrap();
        assert_eq!(result.current_version, "0.21.2");
        assert_eq!(result.latest_version, None);
        assert_eq!(result.latest_tag, None);
        assert_eq!(result.status, AppUpdateStatus::UpdateChannelDisabled);
        assert_eq!(result.update_channel, AppUpdateChannel::Disabled);

        assert_eq!(check_for_app_update_blocking("0.21.2", "").unwrap(), result);
        assert_eq!(
            check_for_app_update_blocking("0.21.2", "http://updates.example/latest").unwrap(),
            result
        );
        let serialized = serde_json::to_value(&result).expect("serialize update result");
        assert_eq!(serialized["status"], "UPDATE_CHANNEL_DISABLED");
        assert_eq!(serialized["update_channel"], "DISABLED");
    }

    #[test]
    fn public_metadata_url_requires_plain_https_without_embedded_secrets() {
        assert_eq!(
            public_update_metadata_url("https://updates.example/latest.json")
                .map(|url| url.to_string()),
            Some("https://updates.example/latest.json".to_string())
        );
        for invalid in [
            "",
            "http://updates.example/latest.json",
            "https://user:token@updates.example/latest.json",
            "https://updates.example/latest.json?token=secret",
            "https://updates.example/latest.json#latest",
            "not a URL",
        ] {
            assert_eq!(
                public_update_metadata_url(invalid),
                None,
                "unexpected accepted metadata URL: {invalid}"
            );
        }
    }
}
