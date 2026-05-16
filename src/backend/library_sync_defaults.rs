pub(crate) fn normalize_library_sync_mode(raw: Option<&str>) -> String {
    match raw
        .unwrap_or("STANDALONE")
        .trim()
        .to_ascii_uppercase()
        .as_str()
    {
        "HOST" => "HOST".to_string(),
        "CLIENT" => "CLIENT".to_string(),
        _ => "STANDALONE".to_string(),
    }
}

pub(crate) fn default_library_sync_device_name() -> String {
    std::env::var("COMPUTERNAME")
        .ok()
        .or_else(|| std::env::var("HOSTNAME").ok())
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
        .unwrap_or_else(|| "This device".to_string())
}
