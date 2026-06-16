use serde::Deserialize;

const SUPPORTED_PRINTER_MODELS_JSON: &str =
    include_str!("../../src/data/supported_printer_models.json");

#[derive(Deserialize)]
struct SupportedPrinterModel {
    model: String,
}

pub(crate) fn supported_printer_models() -> Vec<String> {
    serde_json::from_str::<Vec<SupportedPrinterModel>>(SUPPORTED_PRINTER_MODELS_JSON)
        .expect("supported printer model catalog must be valid JSON")
        .into_iter()
        .map(|entry| entry.model)
        .collect()
}

#[cfg(test)]
mod tests {
    use super::supported_printer_models;
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
}
