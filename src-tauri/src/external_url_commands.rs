fn validate_external_url(url: &str) -> Result<String, String> {
    let trimmed = url.trim();
    if trimmed.len() > 2048 {
        return Err("External URL is too long".to_string());
    }
    if trimmed.chars().any(char::is_control) || trimmed.chars().any(char::is_whitespace) {
        return Err("External URL contains invalid characters".to_string());
    }
    if !(trimmed.starts_with("https://") || trimmed.starts_with("http://")) {
        return Err("Only http and https URLs can be opened externally".to_string());
    }
    Ok(trimmed.to_string())
}

#[tauri::command]
pub(crate) fn open_external_url(url: String) -> Result<(), String> {
    let validated_url = validate_external_url(&url)?;
    open::that(validated_url).map_err(|error| format!("Failed to open external URL: {error}"))
}

#[cfg(test)]
mod tests {
    use super::validate_external_url;

    #[test]
    fn external_url_validation_accepts_http_and_https() {
        assert_eq!(
            validate_external_url(" https://github.com/bliatun-code/Filament-Manager ").as_deref(),
            Ok("https://github.com/bliatun-code/Filament-Manager"),
        );
        assert_eq!(
            validate_external_url("http://localhost:4278/companion").as_deref(),
            Ok("http://localhost:4278/companion"),
        );
    }

    #[test]
    fn external_url_validation_rejects_non_web_targets() {
        assert!(validate_external_url("file:///etc/passwd").is_err());
        assert!(validate_external_url("mailto:test@example.com").is_err());
        assert!(validate_external_url("https://github.com/example repo").is_err());
    }
}
