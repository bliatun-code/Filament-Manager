use super::detect_bambu_skip_discontinued_reason;

#[test]
fn bambu_discontinued_is_applied_on_clean_refresh_output() {
    let output = "\
Detected store: https://eu.store.bambulab.com\n\
Detected collection: bambu-lab-3d-printer-filament\n\
Products discovered: 36\n\
Products detailed: 36\n\
Imported 256 entries.\n";
    let reason = detect_bambu_skip_discontinued_reason(output, 256);
    assert!(reason.is_none());
}

#[test]
fn bambu_discontinued_is_skipped_on_rate_limit_output() {
    let output = "\
Scraper: retrying https://eu.store.bambulab.com/products/pa6-cf after 429\n\
Scraper: 429 Too Many Requests https://eu.store.bambulab.com/products/pa6-cf\n\
Refresh quality: partial\n\
Imported 278 entries.\n";
    let reason = detect_bambu_skip_discontinued_reason(output, 278);
    assert_eq!(
        reason,
        Some("anti-bot/rate-limit responses detected".to_string())
    );
}

#[test]
fn bambu_discontinued_partial_without_antibot_uses_source_warning_reason() {
    let output = "\
Detected store: https://eu.store.bambulab.com\n\
Anti-bot blocks: 0\n\
Refresh quality: partial\n\
Imported 296 entries.\n\
Warnings:\n\
Some product detail pages could not be fetched.\n";
    let reason = detect_bambu_skip_discontinued_reason(output, 296);
    assert_eq!(
        reason,
        Some("refresh had warnings/errors from source".to_string())
    );
}

#[test]
fn bambu_discontinued_is_skipped_when_zero_imported() {
    let output = "Imported 0 entries.\n";
    let reason = detect_bambu_skip_discontinued_reason(output, 0);
    assert_eq!(reason, Some("no rows imported".to_string()));
}
