pub(crate) fn normalize_loan_direction_filter(raw: Option<&str>) -> String {
    let direction = raw
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .unwrap_or("OUTBOUND")
        .to_uppercase()
        .replace(['-', ' '], "_");
    match direction.as_str() {
        "ALL" => "ALL".to_string(),
        "INBOUND" => "INBOUND".to_string(),
        _ => "OUTBOUND".to_string(),
    }
}
