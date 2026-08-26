use rusqlite::{types::Type, Connection, OptionalExtension};

use super::database_result::{InventoryError, InventoryResult};
use super::database_revision::{bump_library_domain_revision, INVENTORY_REVISION_DOMAIN};
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
    let changed = match load_low_stock_policy(connection) {
        Ok(current) => current != policy,
        // A valid explicit save is also the supported repair path for a
        // malformed persisted policy. Replacing that unusable value changes
        // the effective inventory projection and must invalidate Clients.
        Err(rusqlite::Error::FromSqlConversionFailure(_, _, _)) => true,
        Err(error) => return Err(error.into()),
    };
    if !changed {
        return Ok(policy);
    }
    let serialized = serde_json::to_string(&policy).map_err(|error| {
        InventoryError::Db(format!("Could not serialize low-stock policy: {error}"))
    })?;
    set_setting(connection, LOW_STOCK_POLICY_SETTING_KEY, &serialized)?;
    bump_library_domain_revision(connection, INVENTORY_REVISION_DOMAIN)?;
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
            .execute_batch(
                "CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
                 CREATE TABLE library_domain_revisions (
                    domain TEXT PRIMARY KEY,
                    revision INTEGER NOT NULL DEFAULT 0,
                    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
                 );
                 INSERT INTO library_domain_revisions (domain) VALUES ('inventory');",
            )
            .expect("create settings table");
        connection
    }

    fn inventory_revision(connection: &Connection) -> i64 {
        connection
            .query_row(
                "SELECT revision FROM library_domain_revisions WHERE domain = 'inventory'",
                [],
                |row| row.get(0),
            )
            .expect("read inventory revision")
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

    #[test]
    fn normalized_policy_changes_bump_inventory_revision_once_and_noops_do_not() {
        let connection = settings_connection();
        assert_eq!(inventory_revision(&connection), 0);

        save_low_stock_policy(&connection, LowStockPolicy::default())
            .expect("saving the effective default is a no-op");
        assert_eq!(inventory_revision(&connection), 0);

        save_low_stock_policy(
            &connection,
            LowStockPolicy {
                default_threshold_g: 225,
                material_overrides: vec![
                    LowStockMaterialOverride {
                        material_key: "ignored".to_string(),
                        material: " TPU ".to_string(),
                        threshold_g: 450,
                    },
                    LowStockMaterialOverride {
                        material_key: String::new(),
                        material: " PETG   CF ".to_string(),
                        threshold_g: 375,
                    },
                ],
            },
        )
        .expect("save changed policy");
        assert_eq!(inventory_revision(&connection), 1);

        save_low_stock_policy(
            &connection,
            LowStockPolicy {
                default_threshold_g: 225,
                material_overrides: vec![
                    LowStockMaterialOverride {
                        material_key: "another ignored key".to_string(),
                        material: " PETG CF ".to_string(),
                        threshold_g: 375,
                    },
                    LowStockMaterialOverride {
                        material_key: "TPU".to_string(),
                        material: "TPU".to_string(),
                        threshold_g: 450,
                    },
                ],
            },
        )
        .expect("save equivalent normalized policy");
        assert_eq!(inventory_revision(&connection), 1);

        save_low_stock_policy(
            &connection,
            LowStockPolicy {
                default_threshold_g: 250,
                material_overrides: vec![],
            },
        )
        .expect("save second changed policy");
        assert_eq!(inventory_revision(&connection), 2);
    }

    #[test]
    fn repairing_corrupt_policy_bumps_inventory_revision() {
        let connection = settings_connection();
        connection
            .execute(
                "INSERT INTO settings (key, value) VALUES (?1, 'not-json')",
                [LOW_STOCK_POLICY_SETTING_KEY],
            )
            .expect("store corrupt policy");

        save_low_stock_policy(&connection, LowStockPolicy::default())
            .expect("repair corrupt policy");

        assert_eq!(inventory_revision(&connection), 1);
        assert_eq!(
            load_low_stock_policy(&connection).expect("load repaired policy"),
            LowStockPolicy::default()
        );
    }
}
