use url::Url;

fn validate_external_url(url: &str) -> Result<String, String> {
    if url.len() > 2048 {
        return Err("External URL is too long".to_string());
    }
    if url.chars().any(char::is_control) || url.chars().any(char::is_whitespace) {
        return Err("External URL contains invalid characters".to_string());
    }
    if url.contains('\\') {
        return Err("External URL contains invalid characters".to_string());
    }

    let (raw_scheme, authority_and_path) = url
        .split_once("://")
        .ok_or_else(|| "External URL is malformed".to_string())?;
    if authority_and_path.is_empty()
        || authority_and_path.starts_with('/')
        || authority_and_path.starts_with('?')
        || authority_and_path.starts_with('#')
    {
        return Err("External URL must include a valid host".to_string());
    }
    if !raw_scheme.eq_ignore_ascii_case("http") && !raw_scheme.eq_ignore_ascii_case("https") {
        return Err("Only http and https URLs can be opened externally".to_string());
    }
    let raw_authority = authority_and_path
        .split(['/', '?', '#'])
        .next()
        .unwrap_or_default();
    if raw_authority.contains('@') {
        return Err("External URL must not include user information".to_string());
    }

    let parsed = Url::parse(url).map_err(|_| "External URL is malformed".to_string())?;
    if !matches!(parsed.scheme(), "http" | "https") {
        return Err("Only http and https URLs can be opened externally".to_string());
    }
    if parsed.host().is_none() {
        return Err("External URL must include a valid host".to_string());
    }
    if !parsed.username().is_empty() || parsed.password().is_some() {
        return Err("External URL must not include user information".to_string());
    }

    Ok(parsed.into())
}

#[tauri::command]
pub(crate) fn open_external_url(url: String) -> Result<(), String> {
    let validated_url = validate_external_url(&url)?;
    open::that_detached(validated_url)
        .map_err(|error| format!("Failed to open external URL: {error}"))
}

#[cfg(test)]
mod tests {
    use super::validate_external_url;

    #[test]
    fn external_url_validation_accepts_and_normalizes_http_and_https() {
        assert_eq!(
            validate_external_url("HTTPS://GitHub.COM/bliatun-code/Filament-Manager").as_deref(),
            Ok("https://github.com/bliatun-code/Filament-Manager"),
        );
        assert_eq!(
            validate_external_url("http://localhost:4278/companion").as_deref(),
            Ok("http://localhost:4278/companion"),
        );
        assert_eq!(
            validate_external_url("https://example.com/search?first=a&second=b").as_deref(),
            Ok("https://example.com/search?first=a&second=b"),
        );
    }

    #[test]
    fn external_url_validation_rejects_non_web_targets() {
        assert!(validate_external_url("file:///etc/passwd").is_err());
        assert!(validate_external_url("mailto:test@example.com").is_err());
        assert!(validate_external_url("javascript:alert(1)").is_err());
        assert!(validate_external_url("https://@example.com/path").is_err());
        assert!(validate_external_url("https://user@example.com/path").is_err());
        assert!(validate_external_url("https://user:secret@example.com/path").is_err());
    }

    #[test]
    fn external_url_validation_rejects_missing_or_malformed_hosts() {
        assert!(validate_external_url("https://").is_err());
        assert!(validate_external_url("https:///only-a-path").is_err());
        assert!(validate_external_url("https://example.com:99999/path").is_err());
        assert!(validate_external_url("https://[not-an-ipv6-address]/path").is_err());
    }

    #[test]
    fn external_url_validation_rejects_whitespace_and_control_characters() {
        assert!(validate_external_url(" https://github.com/example").is_err());
        assert!(validate_external_url("https://github.com/example ").is_err());
        assert!(validate_external_url("https://github.com/example repo").is_err());
        assert!(validate_external_url("https://github.com/example\nnext").is_err());
        assert!(validate_external_url("https://github.com/example\0next").is_err());
    }

    #[test]
    fn external_url_validation_encodes_the_previous_windows_shell_payload() {
        assert_eq!(
            validate_external_url("https://x/\"&calc&\"").as_deref(),
            Ok("https://x/%22&calc&%22"),
        );
    }
}
