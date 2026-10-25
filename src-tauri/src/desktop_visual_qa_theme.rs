#[cfg(debug_assertions)]
fn normalize_theme_accent(value: &str) -> Option<&'static str> {
    let normalized = value.trim().to_ascii_lowercase().replace(' ', "");
    match normalized.as_str() {
        "#60aeff" | "rgb(96,174,255)" => Some("#60AEFF"),
        _ => None,
    }
}

#[tauri::command]
pub(crate) fn signal_desktop_visual_qa_theme(
    selected_theme: String,
    resolved_theme: String,
    accent: String,
) -> Result<(), String> {
    #[cfg(debug_assertions)]
    {
        let selected_theme = match selected_theme.trim().to_ascii_lowercase().as_str() {
            "dark-deep" => "dark-deep",
            "blue" => "blue",
            _ => return Err("Unknown desktop visual QA theme".to_string()),
        };
        if !resolved_theme.trim().eq_ignore_ascii_case("dark") {
            return Err("Desktop visual QA themes must resolve to dark".to_string());
        }
        let accent = normalize_theme_accent(&accent)
            .ok_or_else(|| "Unknown desktop visual QA theme accent".to_string())?;
        let expected_accent = "#60AEFF";
        if accent != expected_accent {
            return Err("Desktop visual QA theme accent does not match the theme".to_string());
        }
        eprintln!("FILAMENT_MANAGER_VISUAL_QA_THEME:{selected_theme}:dark:{accent}");
        Ok(())
    }

    #[cfg(not(debug_assertions))]
    {
        let _ = (selected_theme, resolved_theme, accent);
        Err("Desktop visual QA theme reporting is unavailable in release builds".to_string())
    }
}

#[cfg(all(test, debug_assertions))]
mod tests {
    use super::normalize_theme_accent;

    #[test]
    fn theme_accent_normalizer_accepts_only_configured_theme_accents() {
        assert_eq!(
            normalize_theme_accent(" rgb(96, 174, 255) "),
            Some("#60AEFF")
        );
        assert_eq!(normalize_theme_accent("#60aeff"), Some("#60AEFF"));
        assert_eq!(normalize_theme_accent("#f3f7fb"), None);
    }
}
