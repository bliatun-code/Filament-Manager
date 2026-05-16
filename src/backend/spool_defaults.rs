pub(crate) fn normalize_spool_status(raw: Option<&str>) -> String {
    let status = raw
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .unwrap_or("IN_STOCK")
        .to_uppercase();
    match status.as_str() {
        "LOANED_OUT" | "BORROWED" | "LOANED" => "BORROWED".to_string(),
        "IN_STOCK" | "IN_USE" | "ASSIGNED" | "EMPTY" | "ARCHIVED" | "LOST" | "DELETED" => {
            if status == "IN_USE" {
                "ASSIGNED".to_string()
            } else {
                status
            }
        }
        _ => "IN_STOCK".to_string(),
    }
}
