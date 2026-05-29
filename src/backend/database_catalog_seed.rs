use rusqlite::{params, Connection, OptionalExtension};
use serde::Deserialize;

use super::database_catalog_schema::ensure_catalog_seed_columns;
use super::database_result::{InventoryError, InventoryResult};
use super::filament_master_models::CatalogSeedStats;

const SEED_CATALOG_JSON: &str = include_str!("../data/seed_filament_catalog.json");

#[derive(Debug, Deserialize)]
struct SeedCatalog {
    version: String,
    entries: Vec<SeedCatalogEntry>,
}

#[derive(Debug, Deserialize)]
struct SeedCatalogEntry {
    id: String,
    vendor: String,
    material: String,
    filament_name: String,
    color_name: String,
    hex_color: Option<String>,
    product_url: Option<String>,
    default_weight: i64,
    is_discontinued: bool,
}

pub(crate) fn apply_seed_catalog(conn: &Connection) -> InventoryResult<CatalogSeedStats> {
    ensure_catalog_seed_columns(conn)?;
    let seed: SeedCatalog = serde_json::from_str(SEED_CATALOG_JSON)
        .map_err(|error| InventoryError::Db(format!("invalid seed catalog: {error}")))?;

    let mut stats = CatalogSeedStats {
        scanned_count: seed.entries.len() as i64,
        inserted_count: 0,
        updated_count: 0,
        skipped_invalid_count: 0,
    };
    let tx = conn.unchecked_transaction()?;

    for entry in &seed.entries {
        let material = entry.material.trim();
        let filament_name = entry.filament_name.trim();
        let color_name = entry.color_name.trim();
        let vendor = entry.vendor.trim();
        if entry.id.trim().is_empty()
            || material.is_empty()
            || filament_name.is_empty()
            || color_name.is_empty()
            || vendor.is_empty()
        {
            stats.skipped_invalid_count += 1;
            continue;
        }

        let existing_id: Option<String> = tx
            .query_row(
                "SELECT id
                 FROM filament_master_list
                 WHERE material = ?1 AND filament_name = ?2 AND color_name = ?3
                 LIMIT 1",
                params![material, filament_name, color_name],
                |row| row.get(0),
            )
            .optional()?;

        tx.execute(
            "INSERT INTO filament_master_list (
                id, material, filament_name, color_name, hex_color, product_url,
                default_weight, vendor, is_discontinued, discontinued_at,
                catalog_source, catalog_seed_version, catalog_user_edited, last_seen_at
             ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9,
                       CASE WHEN ?9 != 0 THEN datetime('now') ELSE NULL END,
                       'seeded', ?10, 0, NULL)
             ON CONFLICT(material, filament_name, color_name) DO UPDATE SET
                hex_color = CASE
                    WHEN filament_master_list.catalog_user_edited = 0
                         THEN COALESCE(excluded.hex_color, filament_master_list.hex_color)
                    ELSE filament_master_list.hex_color
                END,
                product_url = CASE
                    WHEN filament_master_list.catalog_user_edited = 0
                         THEN COALESCE(excluded.product_url, filament_master_list.product_url)
                    ELSE filament_master_list.product_url
                END,
                default_weight = CASE
                    WHEN filament_master_list.catalog_user_edited = 0
                         THEN excluded.default_weight
                    ELSE filament_master_list.default_weight
                END,
                vendor = CASE
                    WHEN filament_master_list.catalog_user_edited = 0
                         THEN excluded.vendor
                    ELSE filament_master_list.vendor
                END,
                is_discontinued = CASE
                    WHEN filament_master_list.catalog_user_edited = 0
                         THEN excluded.is_discontinued
                    ELSE filament_master_list.is_discontinued
                END,
                discontinued_at = CASE
                    WHEN filament_master_list.catalog_user_edited = 0
                         AND excluded.is_discontinued != 0
                         THEN COALESCE(filament_master_list.discontinued_at, excluded.discontinued_at)
                    WHEN filament_master_list.catalog_user_edited = 0
                         THEN NULL
                    ELSE filament_master_list.discontinued_at
                END,
                catalog_source = CASE
                    WHEN filament_master_list.catalog_source IN ('unknown', 'scraped', 'seeded')
                         THEN 'seeded'
                    ELSE filament_master_list.catalog_source
                END,
                catalog_seed_version = excluded.catalog_seed_version,
                updated_at = CASE
                    WHEN filament_master_list.catalog_user_edited = 0
                         AND (
                            COALESCE(filament_master_list.hex_color, '') != COALESCE(excluded.hex_color, '')
                            OR COALESCE(filament_master_list.product_url, '') != COALESCE(excluded.product_url, '')
                            OR filament_master_list.default_weight != excluded.default_weight
                            OR filament_master_list.vendor != excluded.vendor
                            OR filament_master_list.is_discontinued != excluded.is_discontinued
                            OR COALESCE(filament_master_list.discontinued_at, '') != COALESCE(excluded.discontinued_at, '')
                         )
                         THEN datetime('now')
                    WHEN COALESCE(filament_master_list.catalog_seed_version, '') != excluded.catalog_seed_version
                         OR (
                            filament_master_list.catalog_source IN ('unknown', 'scraped')
                            AND filament_master_list.catalog_source != excluded.catalog_source
                         )
                         THEN datetime('now')
                    ELSE filament_master_list.updated_at
                END",
            params![
                entry.id.trim(),
                material,
                filament_name,
                color_name,
                entry.hex_color.as_deref().map(str::trim).filter(|value| !value.is_empty()),
                entry
                    .product_url
                    .as_deref()
                    .map(str::trim)
                    .filter(|value| !value.is_empty()),
                entry.default_weight.max(1),
                vendor,
                if entry.is_discontinued { 1 } else { 0 },
                seed.version.as_str(),
            ],
        )?;

        if existing_id.is_some() {
            stats.updated_count += 1;
        } else {
            stats.inserted_count += 1;
        }
    }

    tx.commit()?;
    Ok(stats)
}
