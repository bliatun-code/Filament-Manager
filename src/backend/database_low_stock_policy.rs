use rusqlite::{types::Type, Connection, OptionalExtension};

use super::database_result::{InventoryError, InventoryResult};
use super::database_settings::set_setting;
use super::low_stock_policy::LowStockPolicy;

const LOW_STOCK_POLICY_SETTING_KEY: &str = "low_stock_policy_json";

pub(crate) fn load_low_stock_policy(
    connection: &Connection,
) -> Result<LowStockPolicy, rusqlite::Error> {
    let raw = connection
        .query_row(
            "SELECT value FROM settings WHERE key = ?1 LIMIT 1",
            [LOW_STOCK_POLICY_SETTING_KEY],
            |row| row.get::<_, String>(0),
        )
        .optional()?;
    let Some(raw) = raw else {
        return Ok(LowStockPolicy::default());
    };

    serde_json::from_str::<LowStockPolicy>(&raw)
        .map_err(|error| rusqlite::Error::FromSqlConversionFailure(0, Type::Text, Box::new(error)))?
        .normalized()
        .map_err(|error| rusqlite::Error::FromSqlConversionFailure(0, Type::Text, Box::new(error)))
}

pub(crate) fn save_low_stock_policy(
    connection: &Connection,
    policy: LowStockPolicy,
) -> InventoryResult<LowStockPolicy> {
    let policy = policy
        .normalized()
        .map_err(|error| InventoryError::InvalidOperation {
            code: "low_stock_policy.invalid",
            message: error.to_string(),
        })?;
    let serialized = serde_json::to_string(&policy).map_err(|error| {
        InventoryError::Db(format!("Could not serialize low-stock policy: {error}"))
    })?;
    set_setting(connection, LOW_STOCK_POLICY_SETTING_KEY, &serialized)?;
    Ok(policy)
}

#[cfg(test)]
mod tests {
    use super::{load_low_stock_policy, save_low_stock_policy, LOW_STOCK_POLICY_SETTING_KEY};
    use crate::backend::inventory_domain::LOW_STOCK_THRESHOLD_G;
    use crate::backend::low_stock_policy::{LowStockMaterialOverride, LowStockPolicy};
    use rusqlite::Connection;

    fn settings_connection() -> Connection {
        let connection = Connection::open_in_memory().expect("open settings database");
        connection
            .execute_batch("CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);")
            .expect("create settings table");
        connection
    }

    #[test]
    fn missing_policy_uses_explicit_legacy_default_and_saved_policy_resolves_overrides() {
        let connection = settings_connection();
        let fallback = load_low_stock_policy(&connection).expect("load default policy");
        assert_eq!(fallback.default_threshold_g, LOW_STOCK_THRESHOLD_G);
        assert_eq!(
            fallback.threshold_for_material("PLA"),
            LOW_STOCK_THRESHOLD_G
        );

        save_low_stock_policy(
            &connection,
            LowStockPolicy {
                default_threshold_g: 225,
                material_overrides: vec![LowStockMaterialOverride {
                    material_key: String::new(),
                    material: "PETG".to_string(),
                    threshold_g: 375,
                }],
            },
        )
        .expect("save policy");
        let saved = load_low_stock_policy(&connection).expect("reload policy");
        assert_eq!(saved.threshold_for_material("PLA"), 225);
        assert_eq!(saved.threshold_for_material(" petg "), 375);
    }

    #[test]
    fn corrupt_or_invalid_persisted_policy_fails_closed() {
        let connection = settings_connection();
        for raw in [
            "not-json",
            r#"{"default_threshold_g":0,"material_overrides":[]}"#,
        ] {
            connection
                .execute(
                    "INSERT INTO settings (key, value) VALUES (?1, ?2)\n                     ON CONFLICT(key) DO UPDATE SET value = excluded.value",
                    [LOW_STOCK_POLICY_SETTING_KEY, raw],
                )
                .expect("store invalid policy");
            assert!(load_low_stock_policy(&connection).is_err());
        }
    }
}
