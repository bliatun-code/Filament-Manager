use reqwest::header::{ACCEPT, CACHE_CONTROL, USER_AGENT};
use semver::Version;
use serde::{Deserialize, Serialize};
use std::io::Read;
use std::time::Duration;
use url::Url;

const GITHUB_RELEASES_URL: &str = "https://github.com/bliatun-code/Filament-Manager/releases";
const GITHUB_LATEST_RELEASE_PAGE_URL: &str =
    "https://github.com/bliatun-code/Filament-Manager/releases/latest";
const GITHUB_UPDATE_METADATA_URL: &str =
    "https://api.github.com/repos/bliatun-code/Filament-Manager/releases/latest";
const CONFIGURED_UPDATE_METADATA_URL: &str = env!("FILAMENT_MANAGER_UPDATE_METADATA_URL");
const UPDATE_CHECK_TIMEOUT: Duration = Duration::from_secs(5);
const UPDATE_RESPONSE_MAX_BYTES: u64 = 64 * 1024;

#[derive(Debug, Deserialize)]
struct LatestReleaseMetadata {
    tag_name: String,
}

#[derive(Debug, Deserialize)]
struct GitHubReleaseAssets {
    draft: Option<bool>,
    prerelease: Option<bool>,
    assets: Option<Vec<ReleaseAsset>>,
}

#[derive(Debug, Deserialize)]
struct ReleaseAsset {
    name: Option<String>,
    browser_download_url: Option<String>,
    state: Option<String>,
    size: Option<u64>,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "snake_case")]
enum InstallerPlatform {
    Macos,
    WindowsX64,
}

#[derive(Debug, Eq, PartialEq, Serialize)]
struct AppUpdateInstaller {
    platform: InstallerPlatform,
    url: String,
}

fn native_installer_platform() -> Option<InstallerPlatform> {
    if cfg!(target_os = "macos") {
        Some(InstallerPlatform::Macos)
    } else if cfg!(all(target_os = "windows", target_arch = "x86_64")) {
        Some(InstallerPlatform::WindowsX64)
    } else {
        None
    }
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
    installer: Option<AppUpdateInstaller>,
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
    latest: &Version,
) -> Result<AppUpdateCheckResult, String> {
    let current = parse_current_version(current_version)?;
    let status = if *latest > current {
        AppUpdateStatus::UpdateAvailable
    } else if *latest == current {
        AppUpdateStatus::UpToDate
    } else {
        AppUpdateStatus::DevelopmentBuild
    };

    Ok(AppUpdateCheckResult {
        current_version: current.to_string(),
        latest_version: Some(latest.to_string()),
        latest_tag: Some(latest_tag.trim().to_string()),
        release_url: GITHUB_LATEST_RELEASE_PAGE_URL.to_string(),
        installer: None,
        status,
        update_channel: AppUpdateChannel::PublicMetadata,
    })
}

fn official_installer(
    release: GitHubReleaseAssets,
    tag: &str,
    version: &Version,
    platform: InstallerPlatform,
) -> Option<AppUpdateInstaller> {
    if !version.pre.is_empty()
        || !version.build.is_empty()
        || tag != format!("v{version}")
        || release.draft != Some(false)
        || release.prerelease != Some(false)
    {
        return None;
    }
    let suffix = match platform {
        InstallerPlatform::Macos => "universal.dmg",
        InstallerPlatform::WindowsX64 => "x64-setup.exe",
    };
    let name = format!("Filament-Manager_{version}_{suffix}");
    let url = format!("{GITHUB_RELEASES_URL}/download/{tag}/{name}");
    let mut matches = release
        .assets
        .as_ref()?
        .iter()
        .filter(|asset| asset.name.as_deref() == Some(name.as_str()));
    let asset = matches.next()?;
    if matches.next().is_some()
        || asset.state.as_deref() != Some("uploaded")
        || asset.size.unwrap_or(0) == 0
        || asset.browser_download_url.as_deref() != Some(url.as_str())
    {
        return None;
    }
    Some(AppUpdateInstaller { platform, url })
}

fn build_update_result_from_metadata(
    current_version: &str,
    metadata_url: &Url,
    body: &[u8],
    platform: Option<InstallerPlatform>,
) -> Result<AppUpdateCheckResult, String> {
    let Ok(release) = serde_json::from_slice::<LatestReleaseMetadata>(body) else {
        return build_release_info_unavailable_result(current_version);
    };
    let Ok(version) = parse_release_version(&release.tag_name) else {
        return build_release_info_unavailable_result(current_version);
    };
    let mut result = build_update_check_result(current_version, &release.tag_name, &version)?;
    // Asset metadata is an optional extension of the canonical feed. A missing or
    // malformed asset cannot change the version result or the fixed release page.
    if result.status == AppUpdateStatus::UpdateAvailable
        && metadata_url.as_str() == GITHUB_UPDATE_METADATA_URL
        && let Some(target) = platform
        && let Ok(assets) = serde_json::from_slice::<GitHubReleaseAssets>(body)
    {
        result.installer = official_installer(assets, &release.tag_name, &version, target);
    }
    Ok(result)
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
        installer: None,
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
        installer: None,
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
        .get(metadata_url.clone())
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
    build_update_result_from_metadata(
        current_version,
        &metadata_url,
        &body,
        native_installer_platform(),
    )
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
        build_update_result_from_metadata, check_for_app_update_blocking,
        native_installer_platform, parse_release_version, public_update_metadata_url,
        AppUpdateChannel, AppUpdateCheckResult, AppUpdateStatus, InstallerPlatform,
        GITHUB_UPDATE_METADATA_URL,
    };
    use serde_json::{json, Value};
    use url::Url;

    const MAC_URL: &str = "https://github.com/bliatun-code/Filament-Manager/releases/download/v0.36.1/Filament-Manager_0.36.1_universal.dmg";
    const WINDOWS_URL: &str = "https://github.com/bliatun-code/Filament-Manager/releases/download/v0.36.1/Filament-Manager_0.36.1_x64-setup.exe";

    fn release_metadata() -> Value {
        json!({
            "tag_name": "v0.36.1",
            "draft": false,
            "prerelease": false,
            "assets": [
                {
                    "name": "Filament-Manager_0.36.1_x64-setup.exe",
                    "browser_download_url": WINDOWS_URL,
                    "state": "uploaded",
                    "size": 25642810,
                },
                {
                    "name": "Filament-Manager_0.36.1_universal.dmg",
                    "browser_download_url": MAC_URL,
                    "state": "uploaded",
                    "size": 62614088,
                }
            ]
        })
    }

    fn update(
        current: &str,
        metadata_url: &str,
        metadata: &Value,
        platform: Option<InstallerPlatform>,
    ) -> AppUpdateCheckResult {
        build_update_result_from_metadata(
            current,
            &Url::parse(metadata_url).unwrap(),
            &serde_json::to_vec(metadata).unwrap(),
            platform,
        )
        .unwrap()
    }

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
        let metadata = release_metadata();
        for (current, expected) in [
            ("0.36.0", AppUpdateStatus::UpdateAvailable),
            ("0.36.1", AppUpdateStatus::UpToDate),
            ("0.36.2", AppUpdateStatus::DevelopmentBuild),
        ] {
            let result = update(
                current,
                GITHUB_UPDATE_METADATA_URL,
                &metadata,
                Some(InstallerPlatform::Macos),
            );
            assert_eq!(result.status, expected);
            assert_eq!(
                result.installer.is_some(),
                expected == AppUpdateStatus::UpdateAvailable
            );
        }
    }

    #[test]
    fn update_check_keeps_the_fixed_release_page() {
        let result = update(
            "0.36.0",
            GITHUB_UPDATE_METADATA_URL,
            &release_metadata(),
            None,
        );
        assert_eq!(result.latest_tag.as_deref(), Some("v0.36.1"));
        assert_eq!(
            result.release_url,
            "https://github.com/bliatun-code/Filament-Manager/releases/latest"
        );
        assert_eq!(result.update_channel, AppUpdateChannel::PublicMetadata);
        assert_eq!(result.installer, None);
    }

    #[test]
    fn selects_only_the_version_pinned_installer_for_each_supported_platform() {
        for (platform, expected_url) in [
            (InstallerPlatform::Macos, MAC_URL),
            (InstallerPlatform::WindowsX64, WINDOWS_URL),
        ] {
            let result = update(
                "0.36.0",
                GITHUB_UPDATE_METADATA_URL,
                &release_metadata(),
                Some(platform),
            );
            let installer = result.installer.unwrap();
            assert_eq!(installer.platform, platform);
            assert_eq!(installer.url, expected_url);
        }
    }

    #[test]
    fn native_build_selects_its_own_platform_package() {
        let expected_url = match (std::env::consts::OS, std::env::consts::ARCH) {
            ("macos", _) => Some(MAC_URL),
            ("windows", "x86_64") => Some(WINDOWS_URL),
            _ => None,
        };
        let result = update(
            "0.36.0",
            GITHUB_UPDATE_METADATA_URL,
            &release_metadata(),
            native_installer_platform(),
        );
        assert_eq!(
            result.installer.as_ref().map(|asset| asset.url.as_str()),
            expected_url
        );
    }

    #[test]
    fn falls_back_to_the_release_page_when_an_asset_cannot_be_trusted() {
        let metadata = release_metadata();
        let mut duplicate = metadata.clone();
        duplicate["assets"]
            .as_array_mut()
            .unwrap()
            .push(metadata["assets"][1].clone());
        let mut missing = metadata.clone();
        missing["assets"].as_array_mut().unwrap().pop();
        for fallback in [
            json!({ "tag_name": "v0.36.1" }),
            duplicate,
            missing,
            json!({ "tag_name": "v0.36.1", "assets": "malformed" }),
        ] {
            let result = update(
                "0.36.0",
                GITHUB_UPDATE_METADATA_URL,
                &fallback,
                Some(InstallerPlatform::Macos),
            );
            assert_eq!(result.status, AppUpdateStatus::UpdateAvailable);
            assert_eq!(result.installer, None);
        }

        for (field, value) in [
            ("name", json!("OtherApp_0.36.1_universal.dmg")),
            ("size", json!(0)),
            ("state", json!("new")),
            (
                "browser_download_url",
                json!(MAC_URL.replace("github.com", "example.invalid")),
            ),
            (
                "browser_download_url",
                json!(MAC_URL.replace("v0.36.1", "v0.36.0")),
            ),
            (
                "browser_download_url",
                json!(MAC_URL.replace("bliatun-code", "other-owner")),
            ),
            (
                "browser_download_url",
                json!(format!("{MAC_URL}?redirect=example.invalid")),
            ),
        ] {
            let mut altered = metadata.clone();
            altered["assets"][1][field] = value;
            let result = update(
                "0.36.0",
                GITHUB_UPDATE_METADATA_URL,
                &altered,
                Some(InstallerPlatform::Macos),
            );
            assert_eq!(result.status, AppUpdateStatus::UpdateAvailable);
            assert_eq!(result.installer, None, "unexpected installer for {field}");
        }
    }

    #[test]
    fn only_the_public_stable_canonical_release_can_advertise_installers() {
        let metadata = release_metadata();
        let result = update(
            "0.36.0",
            "https://updates.example/latest.json",
            &metadata,
            Some(InstallerPlatform::Macos),
        );
        assert_eq!(result.status, AppUpdateStatus::UpdateAvailable);
        assert_eq!(result.installer, None);
        for (field, value) in [
            ("draft", json!(true)),
            ("prerelease", json!(true)),
            ("tag_name", json!("v0.36.1-rc.1")),
            ("tag_name", json!("v0.36.1+ci")),
            ("tag_name", json!(" v0.36.1 ")),
            ("tag_name", json!("V0.36.1")),
        ] {
            let mut altered = metadata.clone();
            altered[field] = value;
            let result = update(
                "0.36.0",
                GITHUB_UPDATE_METADATA_URL,
                &altered,
                Some(InstallerPlatform::Macos),
            );
            assert_eq!(result.status, AppUpdateStatus::UpdateAvailable);
            assert_eq!(result.installer, None, "unexpected installer for {field}");
        }
    }

    #[test]
    fn unavailable_release_metadata_is_a_safe_result_without_release_values() {
        let result = build_release_info_unavailable_result("0.21.2").unwrap();
        assert_eq!(result.current_version, "0.21.2");
        assert_eq!(result.latest_version, None);
        assert_eq!(result.latest_tag, None);
        assert_eq!(result.installer, None);
        assert_eq!(result.status, AppUpdateStatus::ReleaseInfoUnavailable);
        assert_eq!(result.update_channel, AppUpdateChannel::PublicMetadata);
    }

    #[test]
    fn invalid_release_version_is_reported_as_unavailable_metadata() {
        let result = update(
            "0.22.0",
            GITHUB_UPDATE_METADATA_URL,
            &json!({"tag_name": "release-current"}),
            Some(InstallerPlatform::Macos),
        );
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
