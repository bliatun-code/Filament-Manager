use std::collections::HashSet;

pub(super) fn find_matching_bracket(
    text: &str,
    start: usize,
    open: char,
    close: char,
) -> Option<usize> {
    let bytes = text.as_bytes();
    if start >= bytes.len() || bytes[start] as char != open {
        return None;
    }

    let mut depth = 0usize;
    let mut in_string = false;
    let mut escaped = false;

    for (index, byte) in bytes.iter().enumerate().skip(start) {
        let ch = *byte as char;
        if in_string {
            if escaped {
                escaped = false;
            } else if ch == '\\' {
                escaped = true;
            } else if ch == '"' {
                in_string = false;
            }
            continue;
        }
        if ch == '"' {
            in_string = true;
            continue;
        }
        if ch == open {
            depth += 1;
            continue;
        }
        if ch == close {
            depth = depth.saturating_sub(1);
            if depth == 0 {
                return Some(index);
            }
        }
    }

    None
}

pub(super) fn sanitize_handle(raw: &str) -> String {
    raw.trim()
        .trim_start_matches("/products/")
        .split(['?', '#', '/', '\"'])
        .next()
        .unwrap_or_default()
        .trim()
        .to_string()
}

pub(super) fn extract_attr_value(tag: &str, attr: &str) -> Option<String> {
    let needle = format!("{attr}=\"");
    let start = tag.find(&needle)? + needle.len();
    let end = tag[start..].find('\"')?;
    Some(tag[start..start + end].to_string())
}

pub(super) fn extract_tag_content(html: &str, tag: &str) -> Option<String> {
    let open_token = format!("<{tag}");
    let open_index = find_ascii_case_insensitive(html, &open_token)?;
    let content_start = open_index + html[open_index..].find('>')? + 1;
    let close_token = format!("</{tag}>");
    let content_end =
        content_start + find_ascii_case_insensitive(&html[content_start..], &close_token)?;
    Some(html[content_start..content_end].to_string())
}

pub(super) fn find_ascii_case_insensitive(haystack: &str, needle: &str) -> Option<usize> {
    if needle.is_empty() || haystack.len() < needle.len() {
        return None;
    }
    haystack
        .as_bytes()
        .windows(needle.len())
        .position(|window| window.eq_ignore_ascii_case(needle.as_bytes()))
}

pub(super) fn extract_meta_content(html: &str, property: &str) -> Option<String> {
    let needle = format!("property=\"{property}\"");
    let index = html.find(&needle)?;
    let end = clamp_to_char_boundary(html, (index + 600).min(html.len()));
    extract_attr_value(&html[index..end], "content")
}

pub(super) fn strip_tags(value: &str) -> String {
    let mut output = String::with_capacity(value.len());
    let mut in_tag = false;
    for ch in value.chars() {
        match ch {
            '<' => in_tag = true,
            '>' => in_tag = false,
            _ if !in_tag => output.push(ch),
            _ => {}
        }
    }
    output
}

pub(super) fn decode_html_entities(value: &str) -> String {
    value
        .replace("&amp;", "&")
        .replace("&quot;", "\"")
        .replace("&#34;", "\"")
        .replace("&#39;", "'")
        .replace("&#x27;", "'")
        .replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&nbsp;", " ")
}

pub(super) fn normalize_whitespace(value: &str) -> String {
    value.split_whitespace().collect::<Vec<_>>().join(" ")
}

pub(super) fn looks_like_filament(title_lower: &str) -> bool {
    if title_lower.contains("swatch") || title_lower.contains("sample book") {
        return false;
    }
    title_lower.contains("filament") || title_lower.contains("refilament")
}

pub(super) fn infer_material(title: &str) -> String {
    let rules = [
        ("PLA", "PLA"),
        ("PETG", "PETG"),
        ("ABS", "ABS"),
        ("TPU", "TPU"),
        ("ASA", "ASA"),
        ("PA12", "PA12"),
        ("PAHT", "PAHT"),
        ("PA", "PA"),
        ("PET", "PET"),
        ("PC", "PC"),
        ("PVA", "PVA"),
        ("HIPS", "HIPS"),
    ];
    let upper = title.to_uppercase();
    for (needle, material) in rules {
        if upper.contains(needle) {
            return material.to_string();
        }
    }
    "UNKNOWN".to_string()
}

pub(super) fn infer_filament_name(title: &str) -> String {
    let mut name = title.trim().to_string();
    if name.to_lowercase().starts_with("esun ") {
        name = name[5..].trim().to_string();
    }

    for marker in [" 1.75mm", " 2.85mm", " 3.00mm", " 3d filament", " filament"] {
        if let Some(index) = find_ascii_case_insensitive(&name, marker) {
            name = name[..index].trim().to_string();
            break;
        }
    }

    if name.is_empty() {
        title.trim().to_string()
    } else {
        name
    }
}

pub(super) fn parse_weight_grams(title: &str) -> Option<i64> {
    for token in title.split_whitespace().rev() {
        let clean = token
            .trim_matches(|ch: char| !(ch.is_ascii_alphanumeric() || ch == '.'))
            .to_uppercase();
        if let Some(value) = clean.strip_suffix("KG")
            && let Ok(number) = value.parse::<f64>()
        {
            return Some((number * 1000.0).round() as i64);
        }
        if let Some(value) = clean.strip_suffix('G')
            && let Ok(number) = value.parse::<f64>()
        {
            return Some(number.round() as i64);
        }
    }
    None
}

pub(super) fn normalize_hex(value: &str) -> Option<String> {
    let value = value.trim();
    if value.is_empty() {
        return None;
    }
    let mut hex = if value.starts_with('#') {
        value.to_string()
    } else {
        format!("#{value}")
    };
    let digits = &hex[1..];
    if (digits.len() == 3 || digits.len() == 6) && digits.chars().all(|ch| ch.is_ascii_hexdigit()) {
        hex.make_ascii_uppercase();
        Some(hex)
    } else {
        None
    }
}

pub(super) fn normalize_esun_swatch_value(value: &str) -> Option<String> {
    normalize_hex(value).or_else(|| format_esun_swatch_colors(extract_css_hex_tokens(value)))
}

pub(super) fn extract_esun_swatch_color(value: &str) -> Option<String> {
    let inline_colors = extract_inline_hex_colors(value);
    if !inline_colors.is_empty() {
        return format_esun_swatch_colors(inline_colors);
    }
    format_esun_swatch_colors(extract_class_hex_colors(value))
}

fn extract_inline_hex_colors(value: &str) -> Vec<String> {
    let mut colors = Vec::new();
    for marker in ["background-color:", "background:"] {
        let mut cursor = 0usize;
        while let Some(marker_index_rel) = value[cursor..].find(marker) {
            let marker_index = cursor + marker_index_rel;
            let rest = &value[marker_index + marker.len()..];
            let fragment_end = rest
                .find(['"', '\'', '<', '>'])
                .unwrap_or(rest.len())
                .min(160);
            colors.extend(extract_css_hex_tokens(&rest[..fragment_end]));
            cursor = marker_index + marker.len();
        }
    }
    dedupe_hex_colors(colors)
}

fn extract_class_hex_colors(value: &str) -> Vec<String> {
    let marker = "item-color-";
    let mut colors = Vec::new();
    let mut cursor = 0usize;
    while let Some(marker_index_rel) = value[cursor..].find(marker) {
        let start = cursor + marker_index_rel + marker.len();
        let rest = &value[start..];
        let fragment_end = rest
            .find(['"', '\'', '<', '>', ' '])
            .unwrap_or(rest.len())
            .min(120);
        colors.extend(extract_css_hex_tokens(&rest[..fragment_end]));
        cursor = start;
    }
    dedupe_hex_colors(colors)
}

fn extract_css_hex_tokens(value: &str) -> Vec<String> {
    value
        .split(|ch: char| !(ch.is_ascii_hexdigit() || ch == '#'))
        .filter_map(normalize_hex)
        .collect()
}

fn format_esun_swatch_colors(colors: Vec<String>) -> Option<String> {
    let colors = dedupe_hex_colors(colors);
    match colors.len() {
        0 => None,
        1 => colors.into_iter().next(),
        _ => Some(format!("multi({})", colors.join(","))),
    }
}

fn dedupe_hex_colors(colors: Vec<String>) -> Vec<String> {
    let mut seen = HashSet::new();
    let mut deduped = Vec::new();
    for color in colors {
        if seen.insert(color.to_ascii_uppercase()) {
            deduped.push(color);
        }
    }
    deduped
}

pub(super) fn is_esun_bundle_color_option(color_name: &str, block: &str) -> bool {
    color_name.contains('+') || block.to_ascii_lowercase().contains("bundle-package")
}

pub(super) fn normalize_url(url: &str) -> String {
    if url.starts_with("//") {
        format!("https:{url}")
    } else {
        url.to_string()
    }
}

pub(super) fn clamp_to_char_boundary(text: &str, mut index: usize) -> usize {
    index = index.min(text.len());
    while index > 0 && !text.is_char_boundary(index) {
        index -= 1;
    }
    index
}

#[cfg(test)]
mod tests {
    use super::{find_matching_bracket, parse_weight_grams};

    #[test]
    fn matching_bracket_ignores_nested_tokens_inside_json_strings() {
        let json = r#"[{"label": "not ] done", "items": [1, 2]}] trailing"#;
        assert_eq!(
            find_matching_bracket(json, 0, '[', ']'),
            Some(r#"[{"label": "not ] done", "items": [1, 2]}]"#.len() - 1)
        );
    }

    #[test]
    fn weight_parser_preserves_kg_and_gram_inputs() {
        assert_eq!(parse_weight_grams("eSUN PLA+ 1KG"), Some(1_000));
        assert_eq!(parse_weight_grams("eSUN sample 250g"), Some(250));
    }
}
