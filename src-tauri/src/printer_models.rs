use serde::Deserialize;
use std::collections::HashSet;

const SUPPORTED_PRINTER_MODELS_JSON: &str =
    include_str!("../../src/data/supported_printer_models.json");

#[derive(Debug, Deserialize)]
#[serde(rename_all = "snake_case")]
enum PrinterProfileKey {
    BambuMulti,
    BambuA1,
    PrusaMmu,
    PrusaMini,
    PrusaXl,
    PrusaXlSingle,
    PrusaXlDual,
    PrusaXlFive,
    Generic,
}

impl PrinterProfileKey {
    fn as_catalog_key(&self) -> &'static str {
        match self {
            Self::BambuMulti => "bambu_multi",
            Self::BambuA1 => "bambu_a1",
            Self::PrusaMmu => "prusa_mmu",
            Self::PrusaMini => "prusa_mini",
            Self::PrusaXl => "prusa_xl",
            Self::PrusaXlSingle => "prusa_xl_single",
            Self::PrusaXlDual => "prusa_xl_dual",
            Self::PrusaXlFive => "prusa_xl_five",
            Self::Generic => "generic",
        }
    }
}

#[derive(Debug, Deserialize)]
struct SupportedPrinterModel {
    model: String,
    profile: PrinterProfileKey,
    bambu_studio_code: Option<String>,
}

fn parse_supported_printer_model_catalog(raw: &str) -> Result<Vec<SupportedPrinterModel>, String> {
    let entries = serde_json::from_str::<Vec<SupportedPrinterModel>>(raw)
        .map_err(|error| format!("supported printer model catalog must be valid JSON: {error}"))?;
    let mut seen_bambu_studio_codes = HashSet::new();
    for (index, entry) in entries.iter().enumerate() {
        if entry.model.trim().is_empty() {
            return Err(format!(
                "supported printer model catalog entry {} has an empty model",
                index + 1
            ));
        }
        let _ = entry.profile.as_catalog_key();
        if let Some(code) = entry.bambu_studio_code.as_deref() {
            let normalized_code = code.trim();
            if normalized_code.is_empty() {
                return Err(format!(
                    "supported printer model catalog entry {} has an empty Bambu Studio code",
                    index + 1
                ));
            }
            if !entry.model.trim().starts_with("Bambu Lab ") {
                return Err(format!(
                    "supported printer model catalog entry {} has a Bambu Studio code on a non-Bambu model",
                    index + 1
                ));
            }
            if !seen_bambu_studio_codes.insert(normalized_code.to_ascii_uppercase()) {
                return Err(format!(
                    "supported printer model catalog entry {} duplicates Bambu Studio code {normalized_code}",
                    index + 1
                ));
            }
        }
    }
    Ok(entries)
}

pub(crate) fn supported_printer_models() -> Vec<String> {
    parse_supported_printer_model_catalog(SUPPORTED_PRINTER_MODELS_JSON)
        .expect("supported printer model catalog must be valid")
        .into_iter()
        .map(|entry| {
            let SupportedPrinterModel {
                model,
                profile: _,
                bambu_studio_code: _,
            } = entry;
            model
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::{
        parse_supported_printer_model_catalog, supported_printer_models,
        SUPPORTED_PRINTER_MODELS_JSON,
    };
    use std::collections::HashSet as TestHashSet;

    #[test]
    fn supported_printer_models_include_current_bambu_studio_models() {
        let models = supported_printer_models();
        for expected in [
            "Bambu Lab X1 Carbon",
            "Bambu Lab X1",
            "Bambu Lab X1E",
            "Bambu Lab P1P",
            "Bambu Lab P1S",
            "Bambu Lab A1 mini",
            "Bambu Lab A1",
            "Bambu Lab A2L",
            "Bambu Lab H2D",
            "Bambu Lab H2D Pro",
            "Bambu Lab H2S",
            "Bambu Lab H2C",
            "Bambu Lab P2S",
            "Bambu Lab X2D",
        ] {
            assert!(models.iter().any(|model| model == expected), "{expected}");
        }
        assert_eq!(
            TestHashSet::<_>::from_iter(models.iter()).len(),
            models.len()
        );
    }

    #[test]
    fn supported_printer_model_catalog_includes_unique_bambu_studio_codes() {
        let entries = parse_supported_printer_model_catalog(SUPPORTED_PRINTER_MODELS_JSON)
            .expect("supported printer model catalog should parse");
        let codes: TestHashSet<_> = entries
            .iter()
            .filter_map(|entry| entry.bambu_studio_code.as_deref())
            .collect();

        for expected in [
            "X1C", "X1", "X1E", "P1S", "P1P", "A1", "A1M", "A2L", "H2D", "H2DP", "H2S", "H2C",
            "P2S", "X2D",
        ] {
            assert!(codes.contains(expected), "{expected}");
        }
        assert_eq!(codes.len(), 14);
    }

    #[test]
    fn supported_printer_model_catalog_rejects_unknown_profiles() {
        let error =
            parse_supported_printer_model_catalog(r#"[{"model":"Mystery","profile":"bogus"}]"#)
                .expect_err("unknown profile keys should fail catalog validation");

        assert!(error.contains("bogus"));
    }

    #[test]
    fn supported_printer_model_catalog_rejects_empty_models() {
        let error =
            parse_supported_printer_model_catalog(r#"[{"model":"  ","profile":"generic"}]"#)
                .expect_err("empty model names should fail catalog validation");

        assert!(error.contains("empty model"));
    }

    #[test]
    fn supported_printer_model_catalog_rejects_invalid_bambu_studio_codes() {
        let empty_code = parse_supported_printer_model_catalog(
            r#"[{"model":"Bambu Lab A1","profile":"bambu_a1","bambu_studio_code":"  "}]"#,
        )
        .expect_err("empty Bambu Studio codes should fail catalog validation");
        assert!(empty_code.contains("empty Bambu Studio code"));

        let duplicate_code = parse_supported_printer_model_catalog(
            r#"[
                {"model":"Bambu Lab A1","profile":"bambu_a1","bambu_studio_code":"A1"},
                {"model":"Bambu Lab A2L","profile":"bambu_a1","bambu_studio_code":"a1"}
            ]"#,
        )
        .expect_err("duplicate Bambu Studio codes should fail catalog validation");
        assert!(duplicate_code.contains("duplicates Bambu Studio code"));

        let non_bambu_code = parse_supported_printer_model_catalog(
            r#"[{"model":"Prusa MK4","profile":"prusa_mmu","bambu_studio_code":"MK4"}]"#,
        )
        .expect_err("non-Bambu Studio codes should fail catalog validation");
        assert!(non_bambu_code.contains("non-Bambu model"));
    }
}
