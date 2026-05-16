pub(crate) fn supported_printer_models() -> Vec<String> {
    vec![
        "Bambu Lab X1 Carbon",
        "Bambu Lab X1E",
        "Bambu Lab P1S",
        "Bambu Lab P1P",
        "Bambu Lab A1",
        "Bambu Lab A1 mini",
        "Bambu Lab H2D",
        "Prusa CORE One",
        "Prusa CORE One+",
        "Prusa XL",
        "Prusa XL (Single Toolhead)",
        "Prusa XL (Dual Toolhead)",
        "Prusa XL (Five Toolhead)",
        "Prusa MK4S",
        "Prusa MK4",
        "Prusa MK3.9S",
        "Prusa MK3.9",
        "Prusa MK3.5S",
        "Prusa MK3.5",
        "Prusa MINI+",
        "Prusa i3 MK3S+",
        "Creality K1",
        "Creality K1 Max",
        "Anycubic Kobra 2",
        "Custom model",
    ]
    .into_iter()
    .map(String::from)
    .collect()
}
