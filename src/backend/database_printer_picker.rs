use std::{collections::HashMap, sync::LazyLock};

use icu_collator::{
    options::{CollatorOptions, Strength},
    preferences::CollationNumericOrdering,
    Collator, CollatorPreferences,
};
use icu_locale_core::Locale;
use regex::Regex;
use rusqlite::OptionalExtension;
use rusqlite::{functions::FunctionFlags, params};
use serde::{Deserialize, Serialize};

use super::{
    database_core::FilamentDatabase,
    database_low_stock_policy::load_low_stock_policy,
    database_result::{InventoryError, InventoryResult},
    database_rows::map_spool_with_master_row,
    database_spool_models::SpoolWithMasterRow,
    database_spool_queries::SPOOL_WITH_MASTER_SELECT,
};

const ELIGIBLE_PAGE: &str = "WITH candidates AS MATERIALIZED (
    SELECT s.id, m.material, m.filament_name, m.color_name, m.vendor, s.updated_at
    FROM filament_spools s
    JOIN filament_master_list m ON m.id = s.master_id
    LEFT JOIN inventory_locations loc ON loc.id = s.location_id
    WHERE s.deleted_at IS NULL
      AND CASE replace(replace(upper(trim(s.status)), '-', '_'), ' ', '_')
          WHEN 'ASSIGNED' THEN s.id = ?1 WHEN 'IN_USE' THEN s.id = ?1
          WHEN 'LOANED_OUT' THEN 0 WHEN 'LOANED' THEN 0 WHEN 'BORROWED' THEN 0
          WHEN 'EMPTY' THEN 0 WHEN 'LOST' THEN 0 WHEN 'MISSING' THEN 0 WHEN 'DELETED' THEN 0
          ELSE 1 END
      AND (?2 = '' OR instr(picker_search(
          m.vendor || ' ' || m.material || ' ' || m.filament_name || ' ' || m.color_name || ' ' || s.id,
          coalesce(s.location_id, ''), coalesce(loc.name, '')), ?2) > 0)
), page AS (
    SELECT id FROM candidates
    ORDER BY material COLLATE picker_order, filament_name COLLATE picker_order,
             color_name COLLATE picker_order, vendor COLLATE picker_order, id COLLATE picker_order,
             updated_at DESC, id DESC
    LIMIT ?3 OFFSET ?4
)
SELECT (SELECT count(*) FROM candidates),
       (SELECT json_group_array(id) FROM page),
       (SELECT id FROM candidates WHERE id = ?1)";

const PAGE_SIZE: i64 = 120;

#[derive(Debug, Deserialize, Serialize)]
pub struct PrinterPickerQuery {
    pub slot_id: String,
    pub locale: String,
    pub search: String,
    pub offset: u32,
    #[serde(default)]
    pub placements: Option<PickerPlacements>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct PickerPlacements {
    pub slots: HashMap<String, String>,
    pub unassigned: String,
    pub loaned_to: String,
    pub ext: String,
    pub slot: String,
    pub channel: String,
    pub toolhead: String,
}

impl PickerPlacements {
    // Mirror the desktop placement label for imported locations as well as current slots.
    fn token(&self, id: &str) -> String {
        static TOKEN: LazyLock<Regex> = LazyLock::new(|| {
            Regex::new(concat!(
                r"(?i)(?:^|_)(?:",
                r"(?:ext|external)(?:_slot(?:_(?P<ext>[0-9]+))?)?|",
                r"ams[_-](?P<ams>[0-9]+)[_-]slot[_-](?P<slot>[0-9]+)|",
                r"mmu3?[_-](?:channel|slot)[_-](?P<channel>[0-9]+)|",
                r"toolhead[_-](?P<toolhead>[0-9]+))$"
            ))
            .unwrap()
        });
        let Some(parts) = TOKEN.captures(id) else {
            return id.to_owned();
        };
        if let Some(channel) = parts.name("channel") {
            return format!("MMU3 · {} {}", self.channel, channel.as_str());
        }
        if let Some(toolhead) = parts.name("toolhead") {
            return format!("{} {}", self.toolhead, toolhead.as_str());
        }
        if let Some(ams) = parts.name("ams") {
            return format!("AMS {} · {} {}", ams.as_str(), self.slot, &parts["slot"]);
        }
        match parts
            .name("ext")
            .and_then(|n| n.as_str().parse::<u64>().ok())
        {
            Some(n) => format!("{} {n}", self.ext),
            None => self.ext.clone(),
        }
    }

    fn label(&self, id: &str, name: &str) -> String {
        fn slot_pair(raw: &str) -> Option<(&str, &str)> {
            let (printer, slot) = raw.strip_prefix("Printer:")?.rsplit_once(':')?;
            let (printer, slot) = (printer.trim(), slot.trim());
            (!printer.is_empty() && !slot.is_empty()).then_some((printer, slot))
        }
        let id = id.trim();
        if let Some(label) = self.slots.get(slot_pair(id).map_or(id, |(_, slot)| slot)) {
            return label.clone();
        }
        let raw = if name.trim().is_empty() {
            id
        } else {
            name.trim()
        };
        if raw.is_empty() {
            return self.unassigned.clone();
        }
        if let Some((printer, slot)) = slot_pair(raw) {
            return self
                .slots
                .get(slot)
                .cloned()
                .unwrap_or_else(|| format!("{printer} · {}", self.token(slot)));
        }
        let raw = raw.strip_prefix("Printer:").unwrap_or(raw);
        if let Some(owner) = raw
            .get(..10)
            .filter(|s| s.eq_ignore_ascii_case("Loaned to:"))
            .and_then(|_| raw.get(10..))
            .map(str::trim)
            .filter(|s| !s.is_empty())
        {
            return format!("{}: {owner}", self.loaned_to);
        }
        static RAW_SLOT: LazyLock<Regex> = LazyLock::new(|| {
            Regex::new(r"(?i)printer_[a-z0-9_]+(?:_ams_\d+_slot_\d+|(?:_ext|_external)(?:_slot(?:_\d+)?)?|_mmu3?_(?:channel|slot)_\d+|_toolhead_\d+)").unwrap()
        });
        if let Some(found) = RAW_SLOT.find(raw) {
            return format!(
                "{}{}{}",
                &raw[..found.start()],
                self.token(found.as_str()),
                &raw[found.end()..]
            );
        }
        raw.to_owned()
    }
}

#[derive(Debug, Deserialize, Serialize)]
pub struct PrinterPickerPage {
    pub rows: Vec<SpoolWithMasterRow>,
    pub total: i64,
    pub current_match: Option<String>,
    pub revisions: [i64; 3],
}

impl FilamentDatabase {
    pub fn printer_picker_page(
        &self,
        query: &PrinterPickerQuery,
    ) -> InventoryResult<PrinterPickerPage> {
        let mut prefs = query
            .locale
            .parse::<Locale>()
            .map(CollatorPreferences::from)
            .unwrap_or_default();
        prefs.numeric_ordering = Some(CollationNumericOrdering::True);
        let mut options = CollatorOptions::default();
        options.strength = Some(Strength::Primary);
        let collator =
            Collator::try_new(prefs, options).map_err(|e| InventoryError::Db(e.to_string()))?;
        let conn = self.connection();
        conn.create_collation("picker_order", move |a, b| {
            if a == b {
                std::cmp::Ordering::Equal
            } else {
                collator.compare(a.trim(), b.trim())
            }
        })?;
        let placements = query.placements.clone();
        conn.create_scalar_function(
            "picker_search",
            3,
            FunctionFlags::SQLITE_UTF8 | FunctionFlags::SQLITE_DETERMINISTIC,
            move |ctx| {
                let prefix = ctx.get::<String>(0)?;
                let id = ctx.get::<String>(1)?;
                let name = ctx.get::<String>(2)?;
                let label = placements
                    .as_ref()
                    .map_or_else(|| name.clone(), |p| p.label(&id, &name));
                Ok(format!("{prefix} {label} {id}").to_lowercase())
            },
        )?;

        self.with_read_transaction(|db| {
            let current: Option<String> = conn
                .query_row(
                    "SELECT spool_id FROM ams_slots WHERE id = ?1",
                    [&query.slot_id],
                    |row| row.get(0),
                )
                .optional()?
                .ok_or(InventoryError::NotFound)?;
            let revisions = db.library_domain_revisions()?;
            // Keep the count, eligible IDs and resolved weights in the same SQLite snapshot.
            let (total, ids, current_match): (i64, String, Option<String>) = conn.query_row(
                ELIGIBLE_PAGE,
                params![current, query.search.trim().to_lowercase(), PAGE_SIZE, query.offset],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
            )?;
            let mut stmt = conn.prepare(&format!(
                "{SPOOL_WITH_MASTER_SELECT} JOIN json_each(?1) page ON page.value = s.id ORDER BY page.key"
            ))?;
            let policy = load_low_stock_policy(conn)?;
            let mut rows = stmt.query_map([ids], map_spool_with_master_row)?.collect::<Result<Vec<_>, _>>()?;
            for row in &mut rows {
                row.low_stock_threshold_g = Some(policy.threshold_for_material(&row.master.material));
            }
            Ok(PrinterPickerPage {
                rows, total, current_match, revisions: [revisions.inventory, revisions.catalog, revisions.printers],
            })
        })
    }
}
