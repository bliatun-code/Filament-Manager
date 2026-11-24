use rusqlite::{functions::FunctionFlags, params};
use serde::{Deserialize, Serialize};

use super::{
    database_core::FilamentDatabase,
    database_result::InventoryResult,
    database_spool_queries::register_picker_order,
    loan_defaults::ACTIVE_LOAN_PREDICATE_SQL,
    spool_defaults::{normalize_spool_status, SPOOL_OWNERSHIP_SELECT_SQL_S},
};

#[derive(Debug, Serialize, Deserialize)]
pub struct LoanPickerQuery {
    pub locale: String,
    pub search: String,
    pub offset: u32,
    pub selected_id: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LoanCandidate {
    pub id: String,
    pub status: super::inventory_domain::SpoolStatus,
    pub vendor: String,
    pub material: String,
    pub filament_name: String,
    pub color_name: String,
    pub hex_color: Option<String>,
    pub remaining_grams: Option<i64>,
    pub spool_tare_weight_grams: Option<i64>,
    pub location: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct LoanPickerPage {
    pub rows: Vec<LoanCandidate>,
    // A still-eligible selection outside the requested page, even when the search hides it.
    pub selected: Option<LoanCandidate>,
    pub total: i64,
    pub matches: i64,
    pub revisions: [i64; 4],
}

impl FilamentDatabase {
    pub fn loan_picker_page(&self, query: &LoanPickerQuery) -> InventoryResult<LoanPickerPage> {
        let conn = self.connection();
        register_picker_order(conn, &query.locale)?;
        let terms: Vec<String> = query
            .search
            .split_whitespace()
            .map(str::to_lowercase)
            .collect();
        let searching = !terms.is_empty();
        let flags = FunctionFlags::SQLITE_UTF8 | FunctionFlags::SQLITE_DETERMINISTIC;
        conn.create_scalar_function("loan_picker_matches", 1, flags, move |ctx| {
            let text = ctx.get::<String>(0)?.to_lowercase();
            Ok(terms.iter().all(|term| text.contains(term)))
        })?;
        conn.create_scalar_function("loan_picker_in_stock", 1, flags, |ctx| {
            Ok(normalize_spool_status(ctx.get::<Option<String>>(0)?.as_deref()) == "IN_STOCK")
        })?;

        self.with_read_transaction(|db| {
            let revisions = db.library_domain_revisions()?;
            let sql = format!("WITH eligible AS MATERIALIZED (
                SELECT s.id, m.material, m.filament_name, m.color_name, m.vendor, s.updated_at,
                    CASE WHEN ?1 THEN loan_picker_matches(
                        s.id || ' #' || s.id || ' #' ||
                        substr(CASE WHEN substr(s.id, 1, 6) = 'spool_' THEN substr(s.id, 7) ELSE s.id END, -6) ||
                        ' ' || m.vendor || ' ' || m.material || ' ' ||
                        m.filament_name || ' ' || m.color_name || ' ' ||
                        coalesce(nullif(trim(loc.name), ''), s.location_id, '')) ELSE 1 END AS hit
                FROM filament_spools s JOIN filament_master_list m ON m.id = s.master_id
                LEFT JOIN inventory_locations loc ON loc.id = s.location_id
                WHERE s.deleted_at IS NULL AND (s.status = 'IN_STOCK' OR loan_picker_in_stock(s.status))
                    AND ({SPOOL_OWNERSHIP_SELECT_SQL_S}) = 'OWNED'
                    AND s.id NOT IN (SELECT spool_id FROM ams_slots WHERE spool_id IS NOT NULL)
                    AND s.id NOT IN (SELECT spool_id FROM spool_loans WHERE {ACTIVE_LOAN_PREDICATE_SQL} AND spool_id IS NOT NULL)
            ), page AS (
                SELECT id FROM eligible WHERE hit
                ORDER BY material COLLATE picker_order, filament_name COLLATE picker_order,
                    color_name COLLATE picker_order, vendor COLLATE picker_order, id COLLATE picker_order,
                    updated_at DESC, id DESC LIMIT 150 OFFSET ?2
            )
            SELECT count(*), coalesce(sum(hit), 0), (SELECT json_group_array(id) FROM page),
                   (SELECT id FROM eligible WHERE id = ?3 AND id NOT IN (SELECT id FROM page))
              FROM eligible");
            let (total, matches, ids, extra): (i64, i64, String, Option<String>) =
                conn.query_row(
                    &sql,
                    params![searching, query.offset, query.selected_id],
                    |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?)),
                )?;
            let mut stmt = conn.prepare("SELECT s.id, m.vendor, m.material, m.filament_name, m.color_name,
                    m.hex_color, coalesce(s.remaining_g, s.current_weight_g), s.spool_tare_weight_g,
                    coalesce(nullif(trim(loc.name), ''), s.location_id)
                FROM json_each(CASE WHEN ?2 IS NULL THEN ?1 ELSE json_insert(?1, '$[#]', ?2) END) page
                JOIN filament_spools s ON s.id = page.value JOIN filament_master_list m ON m.id = s.master_id
                LEFT JOIN inventory_locations loc ON loc.id = s.location_id ORDER BY page.key")?;
            let mut rows = stmt
                .query_map(params![ids, extra], |r| {
                    Ok(LoanCandidate {
                        id: r.get(0)?,
                        status: super::inventory_domain::SpoolStatus::InStock,
                        vendor: r.get(1)?,
                        material: r.get(2)?,
                        filament_name: r.get(3)?,
                        color_name: r.get(4)?,
                        hex_color: r.get(5)?,
                        remaining_grams: r.get(6)?,
                        spool_tare_weight_grams: r.get(7)?,
                        location: r.get(8)?,
                    })
                })?
                .collect::<Result<Vec<_>, _>>()?;
            let selected = extra.and_then(|_| rows.pop());
            Ok(LoanPickerPage {
                rows,
                selected,
                total,
                matches,
                revisions: [revisions.inventory, revisions.catalog, revisions.printers, revisions.loans],
            })
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::backend::filament_database::ManualMasterInput;

    #[test]
    fn loan_picker_pages_searches_and_pins_only_eligible_rolls() {
        let db = FilamentDatabase::open(":memory:").unwrap();
        db.apply_schema().unwrap();
        let mut q = LoanPickerQuery {
            locale: "nb-NO".into(),
            search: String::new(),
            offset: 0,
            selected_id: Some("roll-10000".into()),
        };
        assert_eq!(db.loan_picker_page(&q).unwrap().total, 0);
        let master = db
            .upsert_manual_master(ManualMasterInput {
                material: "PLA".into(),
                filament_name: "Satin".into(),
                color_name: "Blå".into(),
                vendor: Some("Store".into()),
                hex_color: None,
                product_url: None,
                default_weight: Some(1000),
            })
            .unwrap();
        let conn = db.connection();
        conn.execute("WITH RECURSIVE n(i) AS (VALUES(1) UNION ALL SELECT i+1 FROM n WHERE i<10000)
            INSERT INTO filament_spools(id,master_id,status) SELECT 'roll-'||i,?1,'IN_STOCK' FROM n", [&master]).unwrap();
        let first = db.loan_picker_page(&q).unwrap();
        assert_eq!(
            (first.total, first.matches, first.rows.len()),
            (10000, 10000, 150)
        );
        assert_eq!(first.rows[1].id, "roll-2");
        assert_eq!(first.selected.unwrap().id, "roll-10000");
        q.offset = 150;
        assert_eq!(db.loan_picker_page(&q).unwrap().rows[0].id, "roll-151");
        q.offset = 9900;
        let last = db.loan_picker_page(&q).unwrap();
        assert_eq!(last.rows.len(), 100);
        assert_eq!(last.rows.last().unwrap().id, "roll-10000");
        assert!(last.selected.is_none());
        db.upsert_printer_with_ams("p", "P1S", "Workshop", 1, 1)
            .unwrap();
        let shelf = db.ensure_location("Hylle øst").unwrap();
        conn.execute("UPDATE filament_spools SET location_id=?1, remaining_g=NULL, current_weight_g=450, spool_tare_weight_g=220 WHERE id='roll-10000'", [&shelf]).unwrap();
        conn.execute_batch("UPDATE filament_spools SET ownership_type='borrowed-in' WHERE id='roll-1';
            UPDATE filament_spools SET status='loaned out' WHERE id='roll-2';
            UPDATE ams_slots SET spool_id='roll-3' WHERE id='p_ams_1_slot_1';
            UPDATE filament_spools SET status='IN_USE' WHERE id='roll-4';
            UPDATE filament_spools SET status='EMPTY' WHERE id='roll-5';
            UPDATE filament_spools SET deleted_at='now' WHERE id='roll-6';
            INSERT INTO spool_loans(id,spool_id,borrower_name,grams_out) VALUES ('active','roll-7','Fixture',500);
            INSERT INTO spool_loans(id,spool_id,borrower_name,grams_out,returned_at) VALUES ('closed','roll-8','Fixture',500,'now');").unwrap();
        q.offset = 0;
        q.search = "ØST #ROLL-10000 blå".into();
        let found = db.loan_picker_page(&q).unwrap();
        assert_ne!(first.revisions, found.revisions);
        assert_eq!((found.total, found.matches, found.rows.len()), (9993, 1, 1));
        assert_eq!(found.rows[0].id, "roll-10000");
        assert_eq!(found.rows[0].remaining_grams, Some(450));
        assert_eq!(found.rows[0].spool_tare_weight_grams, Some(220));
        q.search = "#-10000".into();
        assert_eq!(db.loan_picker_page(&q).unwrap().matches, 1);
        for i in 1..=7 {
            q.selected_id = Some(format!("roll-{i}"));
            assert!(db.loan_picker_page(&q).unwrap().selected.is_none());
        }
        q.selected_id = Some("roll-8".into());
        q.search = "%_".into();
        let empty = db.loan_picker_page(&q).unwrap();
        assert_eq!((empty.total, empty.matches), (9993, 0));
        assert_eq!(empty.selected.unwrap().id, "roll-8");
    }
}
