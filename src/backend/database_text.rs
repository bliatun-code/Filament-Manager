pub(crate) fn escape_csv(value: &str) -> String {
    if value.contains(',')
        || value.contains('"')
        || value.contains('\n')
        || value.contains('\r')
        || value.trim() != value
    {
        format!("\"{}\"", value.replace('"', "\"\""))
    } else {
        value.to_string()
    }
}

pub(crate) fn normalize_optional_text(value: Option<&str>) -> Option<String> {
    value
        .map(str::trim)
        .filter(|text| !text.is_empty())
        .map(|text| text.to_string())
}
