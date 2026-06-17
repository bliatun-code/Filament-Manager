use serde::Deserialize;

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
}

fn parse_supported_printer_model_catalog(raw: &str) -> Result<Vec<SupportedPrinterModel>, String> {
    let entries = serde_json::from_str::<Vec<SupportedPrinterModel>>(raw)
        .map_err(|error| format!("supported printer model catalog must be valid JSON: {error}"))?;
    for (index, entry) in entries.iter().enumerate() {
        if entry.model.trim().is_empty() {
            return Err(format!(
                "supported printer model catalog entry {} has an empty model",
                index + 1
            ));
        }
        let _ = entry.profile.as_catalog_key();
    }
    Ok(entries)
}

pub(crate) fn supported_printer_models() -> Vec<String> {
    parse_supported_printer_model_catalog(SUPPORTED_PRINTER_MODELS_JSON)
        .expect("supported printer model catalog must be valid")
        .into_iter()
        .map(|entry| {
            let SupportedPrinterModel { model, profile: _ } = entry;
            model
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::{parse_supported_printer_model_catalog, supported_printer_models};
    use std::collections::HashSet;

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
        assert_eq!(HashSet::<_>::from_iter(models.iter()).len(), models.len());
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
}
