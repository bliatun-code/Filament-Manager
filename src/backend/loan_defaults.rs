use crate::backend::inventory_domain::LoanDirection;

pub(crate) fn normalize_loan_direction_filter(raw: Option<&str>) -> String {
    let token = raw
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .unwrap_or("OUTBOUND")
        .to_uppercase()
        .replace(['-', ' '], "_");
    match token.as_str() {
        "ALL" => "ALL".to_string(),
        _ => LoanDirection::from_raw(Some(&token)).as_str().to_string(),
    }
}
