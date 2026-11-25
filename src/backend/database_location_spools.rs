use std::{
    collections::HashMap,
    hash::{DefaultHasher, Hash, Hasher},
};

use rusqlite::{functions::FunctionFlags, params, OptionalExtension};
use serde::{Deserialize, Serialize};

use super::{
    database_core::FilamentDatabase,
    database_library_sync_cache::LOAN_SPOOL_PREFIX,
    database_result::{InventoryError, InventoryResult},
    database_rows::map_spool_with_master_row,
    database_spool_facade::apply_low_stock_thresholds,
    database_spool_models::SpoolWithMasterRow,
    database_spool_queries::SPOOL_WITH_MASTER_SELECT,
    inventory_domain::OwnershipType,
    spool_defaults::normalize_spool_status,
};

const PAGE_SIZE: usize = 100;

#[derive(Debug, Serialize, Deserialize)]
pub struct LocationSpoolQuery {
    pub location_id: String,
    pub search: String,
    pub offset: u32,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct LocationSpoolPage {
    pub rows: Vec<SpoolWithMasterRow>,
    pub total: i64,
    pub matches: i64,
    pub revisions: [i64; 2],
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub captured_at: Option<String>,
}

impl LocationSpoolQuery {
    fn location_id(&self) -> InventoryResult<&str> {
        let id = self.location_id.trim();
        if id.is_empty() {
            return Err(InventoryError::InvalidOperation {
                code: "common.invalid_request",
                message: "Select a location to read its linked spools.".into(),
            });
        }
        Ok(id)
    }

    fn search_terms(&self) -> Vec<String> {
        self.search
            .split_whitespace()
            .map(str::to_lowercase)
            .collect()
    }
}

fn search_matches(
    id: &str,
    fields: &str,
    status: Option<&str>,
    ownership: Option<&str>,
    terms: &[String],
) -> bool {
    let reference = id.strip_prefix("spool_").unwrap_or(id);
    let suffix = reference.char_indices().rev().nth(5).map_or(0, |(i, _)| i);
    let status = normalize_spool_status(status);
    let ownership = if OwnershipType::from_raw(ownership).is_borrowed_in() {
        "borrowed in"
    } else {
        "owned"
    };
    let text = format!(
        "{id} #{} {fields} {status} {ownership}",
        &reference[suffix..]
    )
    .to_lowercase();
    terms.iter().all(|term| text.contains(term))
}

impl FilamentDatabase {
    pub fn location_spool_page(
        &self,
        query: &LocationSpoolQuery,
    ) -> InventoryResult<LocationSpoolPage> {
        let id = query.location_id()?;
        let terms = query.search_terms();
        let searching = !terms.is_empty();
        self.connection().create_scalar_function(
            "location_spool_matches",
            4,
            FunctionFlags::SQLITE_UTF8 | FunctionFlags::SQLITE_DETERMINISTIC,
            move |ctx| {
                Ok(search_matches(
                    &ctx.get::<String>(0)?,
                    &ctx.get::<String>(1)?,
                    ctx.get::<Option<String>>(2)?.as_deref(),
                    ctx.get::<Option<String>>(3)?.as_deref(),
                    &terms,
                ))
            },
        )?;
        self.with_read_transaction(|db| db.read_linked_page(id, query.offset, searching))
    }

    fn read_linked_page(
        &self,
        id: &str,
        offset: u32,
        searching: bool,
    ) -> InventoryResult<LocationSpoolPage> {
        let conn = self.connection();
        let revisions = self.library_domain_revisions()?;
        // Each branch probes its location index. UNION deduplicates a spool on its home
        // shelf before we join the selected IDs to the much larger inventory table.
        let (total, matches, ids): (i64, i64, String) = conn.query_row(
                "WITH linked_ids AS MATERIALIZED (
                    SELECT id FROM filament_spools INDEXED BY idx_spools_location WHERE location_id=?1 AND deleted_at IS NULL
                    UNION
                    SELECT id FROM filament_spools INDEXED BY idx_spools_home_location WHERE home_location_id=?1 AND deleted_at IS NULL
                 ), linked AS MATERIALIZED (
                    SELECT s.id, CASE WHEN ?2 THEN location_spool_matches(s.id,
                        concat_ws(' ',m.vendor,m.material,m.filament_name,m.color_name,s.status,
                                  coalesce(l.name,s.location_id),coalesce(h.name,s.home_location_id),
                                  s.location_id,s.home_location_id,s.qr_code,s.rfid_tag,s.owner_name,s.owner_contact,
                                  s.ownership_type), s.status, s.ownership_type) ELSE 1 END AS hit
                    FROM linked_ids JOIN filament_spools s ON s.id=linked_ids.id
                    JOIN filament_master_list m ON m.id=s.master_id
                    LEFT JOIN inventory_locations l ON l.id=s.location_id
                    LEFT JOIN inventory_locations h ON h.id=s.home_location_id
                 ), page AS (SELECT id FROM linked WHERE hit ORDER BY id DESC LIMIT ?3 OFFSET ?4)
                 SELECT count(*),coalesce(sum(hit),0),(SELECT json_group_array(id) FROM page) FROM linked",
                params![id, searching, PAGE_SIZE as i64, offset], |row| Ok((row.get(0)?,row.get(1)?,row.get(2)?)),
            )?;
        let mut stmt = conn.prepare(&format!(
                "{SPOOL_WITH_MASTER_SELECT} JOIN json_each(?1) page ON page.value=s.id ORDER BY page.key"
            ))?;
        let mut rows = stmt
            .query_map([ids], map_spool_with_master_row)?
            .collect::<Result<Vec<_>, _>>()?;
        apply_low_stock_thresholds(conn, &mut rows)?;
        Ok(LocationSpoolPage {
            rows,
            total,
            matches,
            revisions: [revisions.inventory, revisions.catalog],
            captured_at: None,
        })
    }

    pub fn cached_location_spool_page(
        &self,
        query: &LocationSpoolQuery,
    ) -> InventoryResult<Option<LocationSpoolPage>> {
        let id = query.location_id()?;
        let terms = query.search_terms();
        self.with_read_transaction(|db| db.read_cached_linked_page(id, query.offset, &terms))
    }

    fn read_cached_linked_page(
        &self,
        id: &str,
        offset: u32,
        terms: &[String],
    ) -> InventoryResult<Option<LocationSpoolPage>> {
        let conn = self.connection();
        let captured_at: Option<String> = conn.query_row(
                "SELECT value ->> '$.captured_at' FROM settings WHERE key='library_sync_cached_spools_json'
                 AND json_valid(value) AND json_type(value,'$.rows')='array' AND json_type(value,'$.captured_at')='text'",
                [], |row| row.get(0),
            ).optional()?;
        let Some(captured_at) = captured_at else {
            return Ok(None);
        };
        // A legacy client can have only the spool capture. Malformed or older optional
        // location metadata must also leave that usable capture intact.
        let mut stmt = conn.prepare(
            "SELECT j.value ->> '$.id', j.value ->> '$.name'
             FROM settings c, json_each(
                 CASE WHEN json_valid(c.value) THEN c.value END,'$.rows'
             ) j WHERE c.key='library_sync_cached_locations_json'
               AND json_extract(CASE WHEN json_valid(c.value) THEN c.value END,'$.captured_at') >= ?1
               AND j.type='object' AND json_type(j.value,'$.id')='text'
               AND json_type(j.value,'$.name')='text'"
        )?;
        let names = stmt
            .query_map([&captured_at], |r| {
                Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?))
            })?
            .collect::<Result<HashMap<_, _>, _>>()?;

        // Select linked rows inside SQLite. Acknowledged loan overlays supersede full-capture
        // rows by spool ID and can move, introduce, or remove a spool independently of capture time.
        let mut stmt = conn.prepare(
                "WITH linked(data) AS (
                    SELECT j.value FROM settings cache, json_each(cache.value,'$.rows') j
                    WHERE cache.key='library_sync_cached_spools_json'
                      AND (j.value ->> '$.spool.location_id'=?1 OR j.value ->> '$.spool.home_location_id'=?1)
                      AND NOT EXISTS (SELECT 1 FROM settings WHERE key=?2 || (j.value ->> '$.spool.id'))
                    UNION ALL
                    SELECT value -> '$.spool' FROM settings WHERE key GLOB ?3
                      AND (value ->> '$.spool.spool.location_id'=?1 OR value ->> '$.spool.spool.home_location_id'=?1)
                 ) SELECT data FROM linked ORDER BY data ->> '$.spool.id' DESC"
            )?;
        let mut cursor = stmt.query(params![
            id,
            LOAN_SPOOL_PREFIX,
            format!("{LOAN_SPOOL_PREFIX}*")
        ])?;
        let mut page = LocationSpoolPage {
            rows: Vec::new(),
            total: 0,
            matches: 0,
            revisions: [0, 0],
            captured_at: Some(captured_at),
        };
        // The complete capture's timestamp has one-second resolution and deliberately
        // survives loan overlays. Fingerprint the ordered linked rows and effective names
        // so a later page can detect replacements and renames within the same second.
        let mut version = DefaultHasher::new();
        while let Some(record) = cursor.next()? {
            let json = record
                .get_ref(0)?
                .as_str()
                .map_err(|e| InventoryError::Db(e.to_string()))?;
            let mut row: SpoolWithMasterRow =
                serde_json::from_str(json).map_err(|e| InventoryError::Db(e.to_string()))?;
            json.hash(&mut version);
            for (location_id, name) in [
                (&row.spool.location_id, &mut row.location_name),
                (&row.spool.home_location_id, &mut row.home_location_name),
            ] {
                if let Some(new_name) = location_id.as_deref().and_then(|id| names.get(id)) {
                    new_name.hash(&mut version);
                    *name = Some(new_name.clone());
                }
            }
            page.total += 1;
            if !terms.is_empty() && !cached_search_matches(&row, terms) {
                continue;
            }
            if page.matches >= i64::from(offset) && page.rows.len() < PAGE_SIZE {
                page.rows.push(row);
            }
            page.matches += 1;
        }
        let hash = version.finish();
        page.revisions = [i64::from((hash >> 32) as u32), i64::from(hash as u32)];
        Ok(Some(page))
    }
}

fn cached_search_matches(row: &SpoolWithMasterRow, terms: &[String]) -> bool {
    let spool = &row.spool;
    let fields = [
        Some(row.master.vendor.as_str()),
        Some(&row.master.material),
        Some(&row.master.filament_name),
        Some(&row.master.color_name),
        Some(&spool.status),
        row.location_name
            .as_deref()
            .or(spool.location_id.as_deref()),
        row.home_location_name
            .as_deref()
            .or(spool.home_location_id.as_deref()),
        spool.location_id.as_deref(),
        spool.home_location_id.as_deref(),
        spool.qr_code.as_deref(),
        spool.rfid_tag.as_deref(),
        spool.owner_name.as_deref(),
        spool.owner_contact.as_deref(),
        Some(&spool.ownership_type),
    ]
    .into_iter()
    .flatten()
    .collect::<Vec<_>>()
    .join(" ");
    search_matches(
        &spool.id,
        &fields,
        Some(&spool.status),
        Some(&spool.ownership_type),
        terms,
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    fn seeded_library() -> (FilamentDatabase, LocationSpoolQuery) {
        let db = FilamentDatabase::open(":memory:").unwrap();
        db.apply_schema().unwrap();
        db.connection().execute_batch(
            "INSERT INTO filament_master_list(id,vendor,material,filament_name,color_name)
               VALUES ('m','Leverandør','PLA','Basic','Blå');
             INSERT INTO inventory_locations(id,name,type) VALUES ('a','Hylle','SHELF'),('b','Skuff','SHELF');
             WITH RECURSIVE n(i) AS (VALUES(1) UNION ALL SELECT i+1 FROM n WHERE i<104)
             INSERT INTO filament_spools(id, master_id, status,location_id,home_location_id)
               SELECT printf('spool_%06d',i),'m','IN_STOCK',CASE WHEN i IN (2,104) THEN 'b' ELSE 'a' END,
                      CASE WHEN i IN (3,104) THEN 'b' ELSE 'a' END FROM n;
             UPDATE filament_spools SET deleted_at='yesterday' WHERE id='spool_000103';
             UPDATE filament_spools SET status='EMPTY',ownership_type='BORROWED_IN', owner_name='Ola',
                qr_code='QR-A',rfid_tag='RFID-B' WHERE id='spool_000001';"
        ).unwrap();
        (
            db,
            LocationSpoolQuery {
                location_id: "a".into(),
                search: String::new(),
                offset: 0,
            },
        )
    }

    #[test]
    fn location_spools_page_deduplicates_links_and_searches_beyond_the_first_hundred() {
        let (db, mut q) = seeded_library();
        let first = db.location_spool_page(&q).unwrap();
        assert_eq!((first.total, first.matches), (102, 102));
        assert_eq!(first.rows.len(), PAGE_SIZE);
        assert_eq!(first.rows[0].spool.id, "spool_000102");
        assert!(first.rows[0].low_stock_threshold_g.is_some());
        q.offset = PAGE_SIZE as u32;
        let second = db.location_spool_page(&q).unwrap();
        assert_eq!(first.revisions, second.revisions);
        assert_eq!(
            second
                .rows
                .iter()
                .map(|r| r.spool.id.as_str())
                .collect::<Vec<_>>(),
            ["spool_000002", "spool_000001"]
        );
        q.offset = 0;
        q.search = "lå HYLLE #000001 rfid-b QR-A Ola borrowed in empty".into();
        let found = db.location_spool_page(&q).unwrap();
        assert_eq!((found.total, found.matches, found.rows.len()), (102, 1, 1));
        assert_eq!(found.rows[0].spool.id, "spool_000001");
        db.rename_inventory_location("a", "Nytt navn").unwrap();
        let renamed = db.location_spool_page(&q).unwrap();
        assert_eq!(renamed.matches, 0);
        assert_ne!(first.revisions, renamed.revisions);
        q.location_id = "missing".into();
        assert_eq!(db.location_spool_page(&q).unwrap().total, 0);
        q.location_id = " ".into();
        assert!(db.location_spool_page(&q).is_err());
    }

    #[test]
    fn cached_location_spools_reduce_the_saved_capture_and_apply_moves_and_removals() {
        let (db, mut q) = seeded_library();
        assert!(db.cached_location_spool_page(&q).unwrap().is_none());
        db.save_library_sync_cached_spools(&[]).unwrap();
        assert_eq!(db.cached_location_spool_page(&q).unwrap().unwrap().total, 0);
        let all = db.list_all_spools_with_master().unwrap();
        let capture = db.save_library_sync_cached_spools(&all).unwrap();
        // A damaged optional location cache can still use the names captured with the spools.
        db.connection().execute("INSERT OR REPLACE INTO settings(key,value) VALUES ('library_sync_cached_locations_json',X'FF')",[]).unwrap();
        let first = db.cached_location_spool_page(&q).unwrap().unwrap();
        assert_eq!(
            (first.matches, first.total, first.rows.len()),
            (102, 102, 100)
        );
        q.search = "lå #000001 rfid-b QR-A Ola borrowed in empty".into();
        let found = db.cached_location_spool_page(&q).unwrap().unwrap();
        assert_eq!(found.matches, 1);
        assert_eq!(found.rows[0].spool.id, "spool_000001");

        let changes = super::super::database_library_sync_cache::save_cached_loan_spool_change;
        let mut moved = db
            .get_spool_with_master_by_id("spool_000104")
            .unwrap()
            .unwrap();
        moved.spool.home_location_id = Some("a".into());
        changes(db.connection(), &moved.spool.id, Some(&moved), None).unwrap();
        changes(db.connection(), "spool_000102", None, None).unwrap();
        moved.spool.id = "newly-borrowed".into();
        changes(db.connection(), &moved.spool.id, Some(&moved), None).unwrap();

        q.search.clear();
        let page = db.cached_location_spool_page(&q).unwrap().unwrap();
        assert_eq!(page.captured_at.as_deref(), Some(capture.as_str()));
        assert_eq!((page.total, page.matches), (103, 103));
        assert_ne!(first.revisions, page.revisions);
        assert_eq!(page.rows[0].spool.id, "spool_000104");
        assert!(page.rows.iter().all(|r| r.spool.id != "spool_000102"));
        q.offset = 100;
        let second = db.cached_location_spool_page(&q).unwrap().unwrap();
        assert_eq!(second.revisions, page.revisions);
        assert_eq!(second.rows.last().unwrap().spool.id, "newly-borrowed");
    }

    #[test]
    fn offline_location_search_applies_only_names_as_recent_as_the_spool_capture() {
        let (db, mut q) = seeded_library();
        db.save_library_sync_cached_spools(&db.list_all_spools_with_master().unwrap())
            .unwrap();
        db.rename_inventory_location("a", "Nytt navn").unwrap();
        db.save_library_sync_cached_locations(&db.list_inventory_locations(true).unwrap())
            .unwrap();
        q.search = "nytt navn".into();
        for (time, matches, expected) in
            [("1900-01-01", 0, "Hylle"), ("2999-01-01", 102, "Nytt navn")]
        {
            db.connection().execute(
                "UPDATE settings SET value=json_set(value,'$.captured_at',?1) WHERE key='library_sync_cached_locations_json'",[time]).unwrap();
            assert_eq!(
                db.cached_location_spool_page(&q).unwrap().unwrap().matches,
                matches
            );
            let query = LocationSpoolQuery {
                location_id: "a".into(),
                search: "#000001".into(),
                offset: 0,
            };
            let page = db.cached_location_spool_page(&query).unwrap().unwrap();
            assert_eq!(page.rows[0].location_name.as_deref(), Some(expected));
            assert_eq!(page.rows[0].home_location_name.as_deref(), Some(expected));
        }
    }
}
