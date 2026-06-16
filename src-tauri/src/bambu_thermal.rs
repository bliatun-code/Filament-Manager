pub(crate) const MIN_EXTRUSION_NOZZLE_TEMP_C: f64 = 180.0;
pub(crate) const PRINT_CAPABLE_NOZZLE_TEMP_C: f64 = 200.0;

pub(crate) fn is_below_extrusion_temp(nozzle_temp_c: f64) -> bool {
    nozzle_temp_c < MIN_EXTRUSION_NOZZLE_TEMP_C
}

pub(crate) fn is_print_capable_temp(nozzle_temp_c: f64) -> bool {
    nozzle_temp_c >= PRINT_CAPABLE_NOZZLE_TEMP_C
}

pub(crate) fn nozzle_thermal_state_name(nozzle_temp_c: Option<f64>) -> Option<&'static str> {
    nozzle_temp_c.map(|temp| {
        if is_below_extrusion_temp(temp) {
            "below_extrusion_temp"
        } else if is_print_capable_temp(temp) {
            "print_capable"
        } else {
            "transition"
        }
    })
}

#[cfg(test)]
mod tests {
    use super::nozzle_thermal_state_name;

    #[test]
    fn nozzle_thermal_state_name_classifies_thresholds() {
        assert_eq!(
            nozzle_thermal_state_name(Some(179.9)),
            Some("below_extrusion_temp")
        );
        assert_eq!(nozzle_thermal_state_name(Some(180.0)), Some("transition"));
        assert_eq!(nozzle_thermal_state_name(Some(199.9)), Some("transition"));
        assert_eq!(
            nozzle_thermal_state_name(Some(200.0)),
            Some("print_capable")
        );
        assert_eq!(nozzle_thermal_state_name(None), None);
    }
}
