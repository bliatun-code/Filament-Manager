use rusqlite::{params, Connection, OptionalExtension};
use serde::Deserialize;
use std::collections::HashMap;

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
        let color_name = normalize_seed_color_name(entry.color_name.trim());
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
        let color_name = color_name.as_str();

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

    dedupe_seeded_catalog_case_variants(&tx)?;
    tx.commit()?;
    Ok(stats)
}

#[derive(Debug, Clone)]
struct SeededCatalogRow {
    id: String,
    material: String,
    filament_name: String,
    color_name: String,
    product_url: Option<String>,
    is_discontinued: bool,
}

fn normalize_seed_color_name(value: &str) -> String {
    let trimmed = value.trim();
    if is_shouting_ascii_label(trimmed) {
        title_case_ascii_label(trimmed)
    } else {
        trimmed.to_string()
    }
}

fn is_shouting_ascii_label(value: &str) -> bool {
    let mut has_letter = false;
    for ch in value.chars().filter(|ch| ch.is_ascii_alphabetic()) {
        has_letter = true;
        if !ch.is_ascii_uppercase() {
            return false;
        }
    }
    has_letter
}

fn title_case_ascii_label(value: &str) -> String {
    let mut next_upper = true;
    value
        .chars()
        .map(|ch| {
            if ch.is_ascii_alphabetic() {
                let normalized = if next_upper {
                    ch.to_ascii_uppercase()
                } else {
                    ch.to_ascii_lowercase()
                };
                next_upper = false;
                normalized
            } else {
                next_upper =
                    ch.is_ascii_whitespace() || matches!(ch, '-' | '/' | '_' | '(' | '[' | '{');
                ch
            }
        })
        .collect()
}

fn seed_catalog_identity_key(material: &str, filament_name: &str, color_name: &str) -> String {
    [
        material.trim().to_lowercase(),
        filament_name.trim().to_lowercase(),
        color_name.trim().to_lowercase(),
    ]
    .join("\u{1f}")
}

fn preferred_seeded_catalog_row<'a>(
    left: &'a SeededCatalogRow,
    right: &'a SeededCatalogRow,
) -> &'a SeededCatalogRow {
    let left_rank = seed_catalog_preference_rank(left);
    let right_rank = seed_catalog_preference_rank(right);
    if right_rank < left_rank {
        right
    } else {
        left
    }
}

fn seed_catalog_preference_rank(row: &SeededCatalogRow) -> (i32, i32, i32, &str) {
    (
        if row.is_discontinued { 1 } else { 0 },
        if is_shouting_ascii_label(&row.color_name) {
            1
        } else {
            0
        },
        if row.product_url.as_deref().unwrap_or("").trim().is_empty() {
            1
        } else {
            0
        },
        row.id.as_str(),
    )
}

fn dedupe_seeded_catalog_case_variants(conn: &Connection) -> InventoryResult<i64> {
    let mut statement = conn.prepare(
        "SELECT id, material, filament_name, color_name, product_url, is_discontinued
         FROM filament_master_list
         WHERE catalog_source = 'seeded'
         ORDER BY material, filament_name, color_name, id",
    )?;
    let rows = statement
        .query_map([], |row| {
            Ok(SeededCatalogRow {
                id: row.get(0)?,
                material: row.get(1)?,
                filament_name: row.get(2)?,
                color_name: row.get(3)?,
                product_url: row.get(4)?,
                is_discontinued: row.get::<_, i64>(5)? != 0,
            })
        })?
        .collect::<Result<Vec<_>, _>>()?;

    let mut groups: HashMap<String, Vec<SeededCatalogRow>> = HashMap::new();
    for row in rows {
        groups
            .entry(seed_catalog_identity_key(
                &row.material,
                &row.filament_name,
                &row.color_name,
            ))
            .or_default()
            .push(row);
    }

    let mut removed_count = 0;
    for group in groups.values() {
        if group.len() < 2 {
            continue;
        }

        let keep = group
            .iter()
            .reduce(preferred_seeded_catalog_row)
            .expect("duplicate seed catalog groups are non-empty");

        for duplicate in group.iter().filter(|row| row.id != keep.id) {
            conn.execute(
                "UPDATE filament_spools
                 SET master_id = ?1,
                     updated_at = datetime('now')
                 WHERE master_id = ?2",
                params![keep.id, duplicate.id],
            )?;
            conn.execute(
                "UPDATE wishlist_items
                 SET master_id = ?1,
                     material = ?2,
                     filament_name = ?3,
                     color_name = ?4,
                     updated_at = datetime('now')
                 WHERE master_id = ?5",
                params![
                    keep.id,
                    keep.material,
                    keep.filament_name,
                    keep.color_name,
                    duplicate.id
                ],
            )?;
            conn.execute(
                "DELETE FROM filament_master_list
                 WHERE id = ?1
                   AND catalog_source = 'seeded'",
                params![duplicate.id],
            )?;
            removed_count += 1;
        }
    }

    Ok(removed_count)
}

#[cfg(test)]
mod tests {
    use super::{
        dedupe_seeded_catalog_case_variants, normalize_seed_color_name,
        preferred_seeded_catalog_row, SeededCatalogRow,
    };
    use rusqlite::{params, Connection};

    #[test]
    fn seed_color_normalization_title_cases_shouting_labels_only() {
        assert_eq!(normalize_seed_color_name("BLACK"), "Black");
        assert_eq!(normalize_seed_color_name("COLD WHITE"), "Cold White");
        assert_eq!(normalize_seed_color_name("Dark blue"), "Dark blue");
        assert_eq!(normalize_seed_color_name("PLA Silk"), "PLA Silk");
    }

    #[test]
    fn seeded_catalog_preference_favors_active_human_cased_rows() {
        let old = SeededCatalogRow {
            id: "old".to_string(),
            material: "PLA".to_string(),
            filament_name: "PLA+".to_string(),
            color_name: "BLACK".to_string(),
            product_url: Some("https://www.esun3d.com/pla-pro-product/".to_string()),
            is_discontinued: true,
        };
        let current = SeededCatalogRow {
            id: "current".to_string(),
            material: "PLA".to_string(),
            filament_name: "PLA+".to_string(),
            color_name: "Black".to_string(),
            product_url: Some("https://esun3dstore.com/products/pla-pro".to_string()),
            is_discontinued: false,
        };

        assert_eq!(preferred_seeded_catalog_row(&old, &current).id, "current");
    }

    #[test]
    fn dedupe_seeded_catalog_case_variants_moves_references_to_best_row() {
        let conn = Connection::open_in_memory().expect("open test database");
        conn.execute_batch(
            "
            PRAGMA foreign_keys = ON;
            CREATE TABLE filament_master_list (
              id TEXT PRIMARY KEY,
              material TEXT NOT NULL,
              filament_name TEXT NOT NULL,
              color_name TEXT NOT NULL,
              hex_color TEXT,
              product_url TEXT,
              default_weight INTEGER NOT NULL DEFAULT 1000,
              vendor TEXT NOT NULL DEFAULT 'Bambu',
              is_discontinued INTEGER NOT NULL DEFAULT 0,
              discontinued_at TEXT,
              catalog_source TEXT NOT NULL DEFAULT 'unknown',
              catalog_seed_version TEXT,
              catalog_user_edited INTEGER NOT NULL DEFAULT 0,
              last_seen_at TEXT,
              created_at TEXT NOT NULL DEFAULT (datetime('now')),
              updated_at TEXT NOT NULL DEFAULT (datetime('now')),
              UNIQUE(material, filament_name, color_name)
            );
            CREATE TABLE filament_spools (
              id TEXT PRIMARY KEY,
              master_id TEXT NOT NULL REFERENCES filament_master_list(id),
              updated_at TEXT NOT NULL DEFAULT (datetime('now'))
            );
            CREATE TABLE wishlist_items (
              id TEXT PRIMARY KEY,
              master_id TEXT REFERENCES filament_master_list(id),
              material TEXT NOT NULL,
              filament_name TEXT NOT NULL,
              color_name TEXT NOT NULL,
              vendor TEXT NOT NULL DEFAULT 'Manual',
              updated_at TEXT NOT NULL DEFAULT (datetime('now'))
            );
            ",
        )
        .expect("create seed dedupe schema");

        conn.execute(
            "INSERT INTO filament_master_list (
                id, material, filament_name, color_name, product_url, vendor,
                is_discontinued, catalog_source
             ) VALUES (?1, 'PLA', 'PLA+', ?2, ?3, 'eSUN', ?4, 'seeded')",
            params![
                "old_upper",
                "BLACK",
                "https://www.esun3d.com/pla-pro-product/",
                1
            ],
        )
        .expect("insert duplicate uppercase seed row");
        conn.execute(
            "INSERT INTO filament_master_list (
                id, material, filament_name, color_name, product_url, vendor,
                is_discontinued, catalog_source
             ) VALUES (?1, 'PLA', 'PLA+', ?2, ?3, 'eSUN', ?4, 'seeded')",
            params![
                "current_title",
                "Black",
                "https://esun3dstore.com/products/pla-pro",
                0
            ],
        )
        .expect("insert preferred title seed row");
        conn.execute(
            "INSERT INTO filament_spools (id, master_id) VALUES ('spool_1', 'old_upper')",
            [],
        )
        .expect("insert spool reference");
        conn.execute(
            "INSERT INTO wishlist_items (
                id, master_id, material, filament_name, color_name, vendor
             ) VALUES ('wish_1', 'old_upper', 'PLA', 'PLA+', 'BLACK', 'eSUN')",
            [],
        )
        .expect("insert wishlist reference");

        let removed = dedupe_seeded_catalog_case_variants(&conn).expect("dedupe seeded catalog");
        assert_eq!(removed, 1);

        let master_count: i64 = conn
            .query_row("SELECT COUNT(*) FROM filament_master_list", [], |row| {
                row.get(0)
            })
            .expect("count master rows");
        assert_eq!(master_count, 1);

        let spool_master: String = conn
            .query_row("SELECT master_id FROM filament_spools", [], |row| {
                row.get(0)
            })
            .expect("read spool master");
        assert_eq!(spool_master, "current_title");

        let wishlist: (String, String) = conn
            .query_row(
                "SELECT master_id, color_name FROM wishlist_items",
                [],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .expect("read wishlist master");
        assert_eq!(wishlist, ("current_title".to_string(), "Black".to_string()));
    }
}
