#[cfg(debug_assertions)]
fn normalize_brand_accent(value: &str) -> Option<&'static str> {
    let normalized = value.trim().to_ascii_lowercase().replace(' ', "");
    match normalized.as_str() {
        "#00ae42" | "rgb(0,174,66)" => Some("#00AE42"),
        "#fd5000" | "rgb(253,80,0)" => Some("#FD5000"),
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
            "bambu" => "bambu",
            "prusa" => "prusa",
            _ => return Err("Unknown desktop visual QA brand theme".to_string()),
        };
        if !resolved_theme.trim().eq_ignore_ascii_case("dark") {
            return Err("Desktop visual QA brand themes must resolve to dark".to_string());
        }
        let accent = normalize_brand_accent(&accent)
            .ok_or_else(|| "Unknown desktop visual QA brand accent".to_string())?;
        let expected_accent = if selected_theme == "bambu" {
            "#00AE42"
        } else {
            "#FD5000"
        };
        if accent != expected_accent {
            return Err("Desktop visual QA brand accent does not match the theme".to_string());
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
    use super::normalize_brand_accent;

    #[test]
    fn brand_accent_normalizer_accepts_only_official_theme_accents() {
        assert_eq!(normalize_brand_accent(" rgb(0, 174, 66) "), Some("#00AE42"));
        assert_eq!(normalize_brand_accent("#fd5000"), Some("#FD5000"));
        assert_eq!(normalize_brand_accent("#f3f7fb"), None);
    }
}
