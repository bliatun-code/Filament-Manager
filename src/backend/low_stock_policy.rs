use std::collections::BTreeMap;
use std::fmt;

use serde::{Deserialize, Serialize};

use super::inventory_domain::LOW_STOCK_THRESHOLD_G;

pub const LOW_STOCK_THRESHOLD_MIN_G: i64 = 1;
pub const LOW_STOCK_THRESHOLD_MAX_G: i64 = 100_000;

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
pub struct LowStockMaterialOverride {
    #[serde(default)]
    pub material_key: String,
    pub material: String,
    pub threshold_g: i64,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
pub struct LowStockPolicy {
    pub default_threshold_g: i64,
    #[serde(default)]
    pub material_overrides: Vec<LowStockMaterialOverride>,
}

impl Default for LowStockPolicy {
    fn default() -> Self {
        Self {
            default_threshold_g: LOW_STOCK_THRESHOLD_G,
            material_overrides: Vec::new(),
        }
    }
}

impl LowStockPolicy {
    pub fn normalized(self) -> Result<Self, LowStockPolicyError> {
        validate_threshold("Default low-stock threshold", self.default_threshold_g)?;

        let mut overrides = BTreeMap::new();
        for item in self.material_overrides {
            let material = normalize_material_display_name(&item.material);
            if material.is_empty() {
                return Err(LowStockPolicyError::new(
                    "A material override must include a material name.",
                ));
            }
            if material.chars().count() > 120 {
                return Err(LowStockPolicyError::new(
                    "A low-stock material name cannot exceed 120 characters.",
                ));
            }
            validate_threshold(
                &format!("Low-stock threshold for {material}"),
                item.threshold_g,
            )?;
            let material_key = normalize_material_key(&material);
            let normalized = LowStockMaterialOverride {
                material_key: material_key.clone(),
                material,
                threshold_g: item.threshold_g,
            };
            if overrides.insert(material_key.clone(), normalized).is_some() {
                return Err(LowStockPolicyError::new(format!(
                    "Low-stock policy contains more than one override for {material_key}."
                )));
            }
        }

        Ok(Self {
            default_threshold_g: self.default_threshold_g,
            material_overrides: overrides.into_values().collect(),
        })
    }

    pub fn threshold_for_material(&self, material: &str) -> i64 {
        let material_key = normalize_material_key(material);
        self.material_overrides
            .iter()
            .find(|item| item.material_key == material_key)
            .map(|item| item.threshold_g)
            .unwrap_or(self.default_threshold_g)
    }
}

pub fn normalize_material_key(material: &str) -> String {
    normalize_material_display_name(material).to_uppercase()
}

fn normalize_material_display_name(material: &str) -> String {
    material.split_whitespace().collect::<Vec<_>>().join(" ")
}

fn validate_threshold(label: &str, threshold_g: i64) -> Result<(), LowStockPolicyError> {
    if !(LOW_STOCK_THRESHOLD_MIN_G..=LOW_STOCK_THRESHOLD_MAX_G).contains(&threshold_g) {
        return Err(LowStockPolicyError::new(format!(
            "{label} must be between {LOW_STOCK_THRESHOLD_MIN_G} and {LOW_STOCK_THRESHOLD_MAX_G} grams."
        )));
    }
    Ok(())
}

#[derive(Debug)]
pub struct LowStockPolicyError {
    message: String,
}

impl LowStockPolicyError {
    fn new(message: impl Into<String>) -> Self {
        Self {
            message: message.into(),
        }
    }
}

impl fmt::Display for LowStockPolicyError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str(&self.message)
    }
}

impl std::error::Error for LowStockPolicyError {}

#[cfg(test)]
mod tests {
    use super::{
        normalize_material_key, LowStockMaterialOverride, LowStockPolicy, LOW_STOCK_THRESHOLD_MAX_G,
    };

    #[test]
    fn policy_normalizes_keys_without_losing_material_display_names() {
        let policy = LowStockPolicy {
            default_threshold_g: 240,
            material_overrides: vec![LowStockMaterialOverride {
                material_key: "ignored-input-key".to_string(),
                material: "  PETG   CF  ".to_string(),
                threshold_g: 350,
            }],
        }
        .normalized()
        .expect("policy should normalize");

        assert_eq!(normalize_material_key(" petg cf "), "PETG CF");
        assert_eq!(policy.material_overrides[0].material_key, "PETG CF");
        assert_eq!(policy.material_overrides[0].material, "PETG CF");
        assert_eq!(policy.threshold_for_material("petg   cf"), 350);
        assert_eq!(policy.threshold_for_material("PLA"), 240);
    }

    #[test]
    fn policy_rejects_invalid_thresholds_and_duplicate_normalized_materials() {
        for threshold_g in [0, LOW_STOCK_THRESHOLD_MAX_G + 1] {
            assert!(LowStockPolicy {
                default_threshold_g: threshold_g,
                material_overrides: Vec::new(),
            }
            .normalized()
            .is_err());
        }

        let duplicate = LowStockPolicy {
            default_threshold_g: 200,
            material_overrides: vec![
                LowStockMaterialOverride {
                    material_key: String::new(),
                    material: "PLA".to_string(),
                    threshold_g: 150,
                },
                LowStockMaterialOverride {
                    material_key: String::new(),
                    material: " pla ".to_string(),
                    threshold_g: 250,
                },
            ],
        };
        assert!(duplicate.normalized().is_err());
    }
}
