use serde::Deserialize;
#[cfg(target_os = "macos")]
use tauri::TitleBarStyle;
use tauri::{window::Color, Manager, Theme};

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct NativeWindowThemeInput {
    appearance: Option<String>,
    background_color: Option<[u8; 4]>,
}

fn normalize_native_appearance(value: Option<&str>) -> Result<Option<Theme>, String> {
    match value.map(str::trim).filter(|value| !value.is_empty()) {
        None => Ok(None),
        Some(value) if value.eq_ignore_ascii_case("light") => Ok(Some(Theme::Light)),
        Some(value) if value.eq_ignore_ascii_case("dark") => Ok(Some(Theme::Dark)),
        Some(_) => Err("Unknown native window appearance".to_string()),
    }
}

#[cfg(any(target_os = "macos", test))]
fn uses_transparent_title_bar(background_color: Option<[u8; 4]>) -> bool {
    background_color.is_some()
}

#[tauri::command]
pub(crate) fn set_native_window_theme(
    app: tauri::AppHandle,
    input: NativeWindowThemeInput,
) -> Result<(), String> {
    let appearance = normalize_native_appearance(input.appearance.as_deref())?;
    if input
        .background_color
        .is_some_and(|[_red, _green, _blue, alpha]| alpha != 255)
    {
        return Err("Native window theme backgrounds must be opaque".to_string());
    }

    let window = app
        .get_webview_window("main")
        .ok_or_else(|| "Main desktop window is unavailable".to_string())?;
    window
        .set_theme(appearance)
        .map_err(|error| error.to_string())?;
    window
        .set_background_color(
            input
                .background_color
                .map(|[red, green, blue, alpha]| Color(red, green, blue, alpha)),
        )
        .map_err(|error| error.to_string())?;

    #[cfg(target_os = "macos")]
    window
        .set_title_bar_style(if uses_transparent_title_bar(input.background_color) {
            TitleBarStyle::Transparent
        } else {
            TitleBarStyle::Visible
        })
        .map_err(|error| error.to_string())?;

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::{normalize_native_appearance, uses_transparent_title_bar};
    use tauri::Theme;

    #[test]
    fn native_appearance_accepts_system_light_and_dark_only() {
        assert!(normalize_native_appearance(None).unwrap().is_none());
        assert!(matches!(
            normalize_native_appearance(Some(" light ")).unwrap(),
            Some(Theme::Light)
        ));
        assert!(matches!(
            normalize_native_appearance(Some("DARK")).unwrap(),
            Some(Theme::Dark)
        ));
        assert!(normalize_native_appearance(Some("bambu")).is_err());
    }

    #[test]
    fn branded_backgrounds_enable_the_transparent_native_title_bar() {
        assert!(!uses_transparent_title_bar(None));
        assert!(uses_transparent_title_bar(Some([3, 18, 18, 255])));
    }
}
