use icu_collator::{Collator, CollatorPreferences};
use icu_locale_core::Locale;
use rusqlite::{functions::FunctionFlags, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};

use super::{
    database_core::FilamentDatabase,
    database_low_stock_policy::load_low_stock_policy,
    database_result::{InventoryError, InventoryResult},
    database_rows::map_spool_with_master_row,
    database_spool_models::SpoolWithMasterRow,
    database_spool_queries::SPOOL_WITH_MASTER_SELECT,
};

#[derive(Debug, Deserialize, Serialize)]
pub struct StockCardQuery {
    pub filters: Option<StockCardFilters>,
    #[serde(default)]
    pub search: String,
    pub locale: Option<String>,
    pub offset: u32,
    pub member_of: Option<String>,
}

#[derive(Clone, Debug, Default, Deserialize, Serialize)]
#[serde(default)]
pub struct StockCardFilters {
    pub list_rows: bool,
    pub status: Option<String>,
    pub ownership: Option<String>,
    pub material: Option<String>,
    pub vendor: Option<String>,
    pub location_id: Option<String>,
    pub low_stock: bool,
    pub include_options: bool,
}

#[derive(Debug, Default, Deserialize, Serialize)]
pub struct StockFilterOptions {
    materials: std::collections::BTreeSet<String>,
    vendors: std::collections::BTreeSet<String>,
}

#[derive(Debug, Deserialize, Serialize)]
pub struct StockCard {
    pub count: i64,
    pub remaining: f64,
    pub rows: Vec<SpoolWithMasterRow>,
}

#[derive(Debug, Deserialize, Serialize)]
pub struct StockCardPage {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub options: Option<StockFilterOptions>,
    pub cards: Vec<StockCard>,
    pub groups: i64,
    pub visible: i64,
    pub total: i64,
    pub borrowed: i64,
    pub revisions: [i64; 2],
}

const FILTERED_STOCK: &str = "
    WITH stock AS (
        SELECT s.id, m.material, m.filament_name, m.color_name, s.updated_at, s.remaining_g,
               json_array(m.vendor, m.material, m.filament_name, m.color_name, coalesce(m.hex_color, ''),
                          CASE WHEN replace(replace(upper(trim(s.ownership_type)), '-', '_'), ' ', '_') = 'BORROWED_IN'
                               THEN 'BORROWED_IN' ELSE 'OWNED' END, coalesce(s.owner_name, '')) AS product
        FROM filament_spools s JOIN filament_master_list m ON s.master_id = m.id
        LEFT JOIN inventory_locations l ON l.id=s.location_id
        LEFT JOIN inventory_locations h ON h.id=s.home_location_id
        WHERE (?5=0 OR stock_matches(concat_ws(' ',s.id,
            '#' || substr(CASE WHEN substr(s.id,1,6)='spool_' THEN substr(s.id,7) ELSE s.id END,-6),
            m.vendor,m.material,m.filament_name,m.color_name,l.name,h.name,s.location_id,s.home_location_id,
            s.qr_code,s.rfid_tag,s.owner_name,s.owner_contact,
            CASE WHEN replace(replace(upper(trim(s.ownership_type)), '-', '_'), ' ', '_')='BORROWED_IN'
                 THEN 'borrowed in' ELSE 'owned' END)))
          AND s.deleted_at IS NULL
          AND CASE WHEN ?6 IS NULL THEN coalesce(upper(trim(s.status)), '') <> 'EMPTY'
                   ELSE stock_status(s.status)=?6 END
          AND (?7 IS NULL OR ?7=CASE WHEN replace(replace(upper(trim(s.ownership_type)), '-', '_'), ' ', '_')='BORROWED_IN'
                                    THEN 'BORROWED_IN' ELSE 'OWNED' END)
          AND (?8 IS NULL OR m.material=?8) AND (?9 IS NULL OR m.vendor=?9)
          AND (?10 IS NULL OR ?10=s.location_id OR ?10=s.home_location_id)
          AND (NOT ?11 OR (stock_status(s.status) IN ('IN_STOCK','ASSIGNED') AND
               stock_is_low(m.material,coalesce(s.remaining_g,CASE WHEN s.initial_weight_g>0 THEN s.initial_weight_g WHEN m.default_weight>0 THEN m.default_weight ELSE 1000 END))))
    )";

const STOCK_CARD_GROUPS: &str = ", numbered AS (
        SELECT *, row_number() OVER (PARTITION BY product ORDER BY updated_at DESC, id DESC) AS n
        FROM stock
        WHERE ?2 IS NULL OR product = (SELECT product FROM stock WHERE id = ?2)
    ), grouped AS (
        SELECT product, material, filament_name, color_name, count(*) AS size,
               coalesce(sum(remaining_g), 0.0) AS grams,
               json_group_array(id ORDER BY n) FILTER (WHERE n > ?3 AND n <= ?4) AS ids,
               max(updated_at) AS newest, max(CASE WHEN n = 1 THEN id END) AS first_id
        FROM numbered GROUP BY product
    )
    SELECT size, grams, ids, count(*) OVER (), sum(size) OVER () FROM grouped
    ORDER BY material COLLATE stock_card_order, filament_name COLLATE stock_card_order,
             color_name COLLATE stock_card_order, newest DESC, first_id DESC, product
    LIMIT 96 OFFSET ?1";

fn stock_filter_options(conn: &Connection) -> InventoryResult<StockFilterOptions> {
    let mut options = StockFilterOptions::default();
    let mut stmt = conn.prepare("SELECT DISTINCT m.material,m.vendor FROM filament_master_list m
                WHERE m.id IN (SELECT DISTINCT master_id FROM filament_spools WHERE deleted_at IS NULL)")?;
    let mut pairs = stmt.query([])?;
    while let Some(row) = pairs.next()? {
        let material: String = row.get(0)?;
        let vendor: String = row.get(1)?;
        if !material.trim().is_empty() {
            options.materials.insert(material.trim().to_owned());
        }
        if !vendor.trim().is_empty() {
            options.vendors.insert(vendor.trim().to_owned());
        }
    }
    Ok(options)
}

impl FilamentDatabase {
    pub fn has_complete_stock_capture(&self) -> InventoryResult<bool> {
        Ok(self.connection().query_row(
            "SELECT EXISTS(SELECT 1 FROM settings WHERE key='library_sync_cached_spools_json')",
            [],
            |row| row.get(0),
        )?)
    }

    pub fn stock_card_page(&self, query: &StockCardQuery) -> InventoryResult<StockCardPage> {
        self.with_read_transaction(|db| db.read_stock_cards(query))
    }

    fn read_stock_cards(&self, query: &StockCardQuery) -> InventoryResult<StockCardPage> {
        let conn = self.connection();
        let terms: Vec<_> = query
            .search
            .split_whitespace()
            .map(str::to_lowercase)
            .collect();
        let searching = !terms.is_empty();
        conn.create_scalar_function(
            "stock_matches",
            1,
            FunctionFlags::SQLITE_UTF8 | FunctionFlags::SQLITE_DETERMINISTIC,
            move |ctx| {
                let text = ctx.get::<String>(0)?.to_lowercase();
                Ok(terms.iter().all(|term| text.contains(term)))
            },
        )?;
        let revisions = self.library_domain_revisions()?;
        let (total, borrowed) = conn.query_row(
                "SELECT count(*), count(*) FILTER (WHERE replace(replace(upper(trim(ownership_type)),'-','_'),' ','_')='BORROWED_IN')
                 FROM filament_spools WHERE deleted_at IS NULL", [], |r| Ok((r.get(0)?,r.get(1)?))
            )?;
        let policy = load_low_stock_policy(conn)?;
        let filters = query.filters.as_ref();
        let options = filters
            .filter(|f| f.include_options)
            .map(|_| stock_filter_options(conn))
            .transpose()?;
        let flags = FunctionFlags::SQLITE_UTF8 | FunctionFlags::SQLITE_DETERMINISTIC;
        conn.create_scalar_function("stock_status", 1, flags, |ctx| {
            Ok(super::inventory_domain::SpoolStatus::from_raw(
                ctx.get::<Option<String>>(0)?.as_deref(),
            )
            .as_str()
            .to_owned())
        })?;
        let thresholds = policy.clone();
        conn.create_scalar_function("stock_is_low", 2, flags, move |ctx| {
            let grams: f64 = ctx.get(1)?;
            Ok(grams > 0.0
                && grams <= thresholds.threshold_for_material(&ctx.get::<String>(0)?) as f64)
        })?;
        let mut page = StockCardPage {
            options,
            cards: Vec::new(),
            groups: 0,
            visible: 0,
            total,
            borrowed,
            revisions: [revisions.inventory, revisions.catalog],
        };
        let parameters = |offset: i64, start: i64, end: i64| {
            (
                offset,
                &query.member_of,
                start,
                end,
                searching,
                filters.and_then(|f| f.status.as_deref()),
                filters.and_then(|f| f.ownership.as_deref()),
                filters.and_then(|f| f.material.as_deref()),
                filters.and_then(|f| f.vendor.as_deref()),
                filters.and_then(|f| f.location_id.as_deref()),
                filters.is_some_and(|f| f.low_stock),
            )
        };
        let mut select = conn.prepare(&format!("{SPOOL_WITH_MASTER_SELECT} JOIN json_each(?1) page ON page.value=s.id ORDER BY page.key"))?;
        if filters.is_some_and(|f| f.list_rows) {
            // Count the entire filtered list, but hydrate only the visible window.
            let (visible, ids): (i64, String) = conn.query_row(
                &format!("{FILTERED_STOCK}
                    SELECT (SELECT count(*) FROM stock),
                           (SELECT json_group_array(id) FROM
                              (SELECT id FROM stock ORDER BY updated_at DESC, id DESC LIMIT 200 OFFSET ?1))"),
                parameters(query.offset.into(), 0, 0), |row| Ok((row.get(0)?, row.get(1)?)),
            )?;
            page.visible = visible;
            page.groups = visible;
            for row in select.query_map([ids], map_spool_with_master_row)? {
                let mut row = row?;
                row.low_stock_threshold_g =
                    Some(policy.threshold_for_material(&row.master.material));
                page.cards.push(StockCard {
                    count: 1,
                    remaining: row.spool.remaining_g.unwrap_or_default() as f64,
                    rows: vec![row],
                });
            }
            return Ok(page);
        }
        let locale = query
            .locale
            .as_deref()
            .and_then(|locale| locale.parse::<Locale>().ok());
        let collator = Collator::try_new(
            locale.map(CollatorPreferences::from).unwrap_or_default(),
            Default::default(),
        )
        .map_err(|err| InventoryError::Db(err.to_string()))?;
        conn.create_collation("stock_card_order", move |left, right| {
            collator.compare(left, right)
        })?;
        let mut stmt = conn.prepare(&format!("{FILTERED_STOCK}{STOCK_CARD_GROUPS}"))?;
        let (offset, member_offset, limit) = if query.member_of.is_some() {
            (0, i64::from(query.offset), 100)
        } else {
            (query.offset, 0, 3)
        };
        let mut groups = stmt.query(parameters(
            i64::from(offset),
            member_offset,
            member_offset + limit,
        ))?;
        while let Some(group) = groups.next()? {
            let ids: String = group.get(2)?;
            let mut rows = select
                .query_map([ids], map_spool_with_master_row)?
                .collect::<Result<Vec<_>, _>>()?;
            for row in &mut rows {
                row.low_stock_threshold_g =
                    Some(policy.threshold_for_material(&row.master.material));
            }
            page.groups = group.get(3)?;
            page.visible = group.get(4)?;
            page.cards.push(StockCard {
                count: group.get(0)?,
                remaining: group.get(1)?,
                rows,
            });
        }
        drop(groups);
        if offset > 0 && page.cards.is_empty() {
            // An out-of-range offset has no result row to carry the window totals.
            if let Some((groups, visible)) = stmt
                .query_row(parameters(0, 0, 0), |row| Ok((row.get(3)?, row.get(4)?)))
                .optional()?
            {
                page.groups = groups;
                page.visible = visible;
            }
        }
        Ok(page)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn list_pages_preserve_roll_order_and_search_beyond_the_first_window() {
        let db = FilamentDatabase::open(":memory:").unwrap();
        db.apply_schema().unwrap();
        let mut query = StockCardQuery {
            filters: Some(StockCardFilters {
                list_rows: true,
                ..Default::default()
            }),
            search: String::new(),
            locale: None,
            offset: 0,
            member_of: None,
        };
        assert_eq!(db.stock_card_page(&query).unwrap().total, 0);
        db.connection().execute_batch("INSERT INTO filament_master_list(id,material,filament_name,color_name,vendor)
            VALUES ('product','PLA','Basic','Blue','Vendor');
            WITH RECURSIVE n(i) AS (VALUES(0) UNION ALL SELECT i+1 FROM n WHERE i<202)
            INSERT INTO filament_spools(id,master_id,status,remaining_g,updated_at)
            SELECT printf('roll-%03d',i),'product',CASE WHEN i=202 THEN 'EMPTY' ELSE 'IN_STOCK' END,400,
                   CASE WHEN i=0 THEN '2026-02-01' ELSE '2026-01-01' END FROM n;").unwrap();
        let first = db.stock_card_page(&query).unwrap();
        assert_eq!(
            (first.total, first.visible, first.cards.len()),
            (203, 202, 200)
        );
        assert_eq!(first.cards[0].rows[0].spool.id, "roll-000");
        assert_eq!(first.cards[199].rows[0].spool.id, "roll-003");
        query.offset = 200;
        let tail = db.stock_card_page(&query).unwrap();
        assert_eq!(tail.cards.len(), 2);
        assert_eq!(tail.cards[1].rows[0].spool.id, "roll-001");
        query.offset = 400;
        let past = db.stock_card_page(&query).unwrap();
        assert_eq!((past.visible, past.cards.len()), (202, 0));
        query.offset = 0;
        query.search = "roll-001".into();
        let hit = db.stock_card_page(&query).unwrap();
        assert_eq!(
            (hit.visible, hit.cards[0].rows[0].spool.id.as_str()),
            (1, "roll-001")
        );
    }

    #[test]
    fn filters_cover_the_whole_library_before_grouping_and_keep_global_options() {
        let db = FilamentDatabase::open(":memory:").unwrap();
        db.apply_schema().unwrap();
        db.connection().execute_batch("WITH RECURSIVE n(i) AS (VALUES(1) UNION ALL SELECT i+1 FROM n WHERE i<97)
            INSERT INTO filament_master_list(id,material,filament_name,color_name,vendor)
            SELECT printf('m%03d',i),'PLA','Basic',printf('Color %03d',i),'V' FROM n;
            INSERT INTO filament_spools(id,master_id,status,remaining_g)
            SELECT id,id,'IN_STOCK',400 FROM filament_master_list WHERE id GLOB 'm[0-9][0-9][0-9]';
            INSERT INTO filament_master_list(id,material,filament_name,color_name,vendor)
            VALUES ('special','TPU','Flex','Blue','Rare'), ('unused','Nylon','Unused','Blue','Unused');
            INSERT INTO filament_spools(id,master_id,status,remaining_g,ownership_type)
            VALUES ('low','special','IN_USE',50,'BORROWED_IN'), ('high','special','ASSIGNED',600,'BORROWED_IN'),
            ('empty','special','EMPTY',0,'OWNED');
            INSERT INTO inventory_locations(id,name,type) VALUES ('home','Shelf','SHELF');
            UPDATE filament_spools SET home_location_id='home' WHERE id='low';").unwrap();
        let mut query = StockCardQuery {
            locale: None,
            offset: 0,
            member_of: None,
            search: String::new(),
            filters: Some(StockCardFilters {
                include_options: true,
                ..Default::default()
            }),
        };
        let first = db.stock_card_page(&query).unwrap();
        assert_eq!(first.cards.len(), 96);
        assert!(first
            .cards
            .iter()
            .all(|card| card.rows[0].master.material == "PLA"));
        let options = first.options.unwrap();
        assert!(options.materials.contains("TPU") && options.vendors.contains("Rare"));
        assert!(!options.vendors.contains("Unused"));
        query.search = "flex blue".into();
        query.filters = Some(StockCardFilters {
            list_rows: false,
            status: Some("ASSIGNED".into()),
            ownership: Some("BORROWED_IN".into()),
            material: Some("TPU".into()),
            vendor: Some("Rare".into()),
            low_stock: true,
            include_options: true,
            location_id: Some("home".into()),
        });
        let hit = db.stock_card_page(&query).unwrap();
        assert_eq!(
            (hit.total, hit.visible, hit.groups, hit.cards[0].remaining),
            (100, 1, 1, 50.0)
        );
        assert_eq!(hit.cards[0].rows[0].spool.id, "low");
        assert!(hit.options.unwrap().materials.contains("PLA"));
        query.filters = Some(StockCardFilters {
            status: Some("EMPTY".into()),
            ..Default::default()
        });
        assert_eq!(
            db.stock_card_page(&query).unwrap().cards[0].rows[0]
                .spool
                .id,
            "empty"
        );
    }

    #[test]
    fn stock_card_totals_cover_members_outside_the_preview() {
        let db = FilamentDatabase::open(":memory:").unwrap();
        db.apply_schema().unwrap();
        let read = || {
            db.stock_card_page(&StockCardQuery {
                filters: None,
                search: String::new(),
                locale: None,
                offset: 0,
                member_of: None,
            })
            .unwrap()
        };
        assert_eq!(read().total, 0);
        db.connection().execute_batch("INSERT INTO filament_master_list(id,vendor,material,filament_name,color_name) VALUES('m','Vendor','PLA','Basic','Blue');
          WITH RECURSIVE n(i) AS (VALUES(1) UNION ALL SELECT i+1 FROM n WHERE i<10000)
          INSERT INTO filament_spools(id,master_id,remaining_g,status) SELECT printf('s%05d',i),'m',50,'IN_STOCK' FROM n;
          UPDATE filament_spools SET status='EMPTY' WHERE id='s00001';
          UPDATE filament_spools SET ownership_type='BORROWED_IN', owner_name='B' WHERE id='s00002'").unwrap();
        let p = read();
        assert_eq!(
            (p.total, p.visible, p.groups, p.borrowed),
            (10000, 9999, 2, 1)
        );
        let card = p.cards.iter().find(|c| c.count > 1).unwrap();
        assert_eq!(
            (card.count, card.remaining, card.rows.len()),
            (9998, 499900.0, 3)
        );
        let more = db
            .stock_card_page(&StockCardQuery {
                filters: None,
                search: String::new(),
                locale: None,
                offset: 3,
                member_of: Some(card.rows[0].spool.id.clone()),
            })
            .unwrap();
        assert_eq!(more.cards.len(), 1);
        assert_eq!(more.cards[0].rows.len(), 100);
        assert!(more.cards[0]
            .rows
            .iter()
            .all(|row| card.rows.iter().all(|first| first.spool.id != row.spool.id)));
    }
    #[test]
    fn stock_cards_page_groups_after_aggregating_the_complete_library() {
        let db = FilamentDatabase::open(":memory:").unwrap();
        db.apply_schema().unwrap();
        db.connection().execute_batch(
            "WITH RECURSIVE numbers(i) AS (VALUES(1) UNION ALL SELECT i+1 FROM numbers WHERE i<98)
             INSERT INTO filament_master_list(id,vendor,material,filament_name,color_name)
             SELECT printf('m%03d',i),'V','PLA','Basic',printf('Colour %03d',i) FROM numbers;
             INSERT INTO filament_spools(id,master_id,status,remaining_g)
             SELECT id||'-a',id,'IN_STOCK',100 FROM filament_master_list WHERE id GLOB 'm[0-9][0-9][0-9]';
             INSERT INTO filament_spools(id,master_id,status,remaining_g)
             SELECT id||'-b',id,'IN_STOCK',50 FROM filament_master_list WHERE id GLOB 'm[0-9][0-9][0-9]';"
        ).unwrap();
        let read = |offset| {
            db.stock_card_page(&StockCardQuery {
                filters: None,
                offset,
                search: String::new(),
                locale: Some("en-US".into()),
                member_of: None,
            })
            .unwrap()
        };
        let first = read(0);
        let second = read(96);
        assert_eq!((first.cards.len(), second.cards.len()), (96, 2));
        assert_eq!((first.groups, second.visible, second.total), (98, 196, 196));
        let search = |terms: &str| {
            db.stock_card_page(&StockCardQuery {
                filters: None,
                offset: 0,
                locale: None,
                member_of: None,
                search: terms.to_string(),
            })
            .unwrap()
        };
        let hits = search("098  PLA");
        assert_eq!(
            (
                hits.total,
                hits.visible,
                hits.groups,
                hits.cards[0].remaining
            ),
            (196, 2, 1, 150.0)
        );
        let one = search("#m098-b");
        assert_eq!((one.visible, one.cards[0].remaining), (1, 50.0));
        assert_eq!(search("%").groups, 0);
        let past_end = read(200);
        assert!(past_end.cards.is_empty());
        assert_eq!((past_end.groups, past_end.visible), (98, 196));
        assert_eq!(first.revisions, second.revisions);
        assert_eq!(first.cards[95].rows[0].spool.master_id, "m096");
        assert_eq!(second.cards[0].rows[0].spool.master_id, "m097");
        assert!(second
            .cards
            .iter()
            .all(|card| card.remaining == 150.0 && card.count == 2));
    }
}
