use icu_collator::{Collator, CollatorPreferences};
use icu_locale_core::Locale;
use rusqlite::{params, OptionalExtension};
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
    pub locale: Option<String>,
    pub offset: u32,
    pub member_of: Option<String>,
}

#[derive(Debug, Deserialize, Serialize)]
pub struct StockCard {
    pub count: i64,
    pub remaining: f64,
    pub rows: Vec<SpoolWithMasterRow>,
}

#[derive(Debug, Deserialize, Serialize)]
pub struct StockCardPage {
    pub cards: Vec<StockCard>,
    pub groups: i64,
    pub visible: i64,
    pub total: i64,
    pub borrowed: i64,
    pub revisions: [i64; 2],
}

const STOCK_CARD_GROUPS: &str = "
    WITH stock AS (
        SELECT s.id, m.material, m.filament_name, m.color_name, s.updated_at, s.remaining_g,
               json_array(m.vendor, m.material, m.filament_name, m.color_name, coalesce(m.hex_color, ''),
                          CASE WHEN replace(replace(upper(trim(s.ownership_type)), '-', '_'), ' ', '_') = 'BORROWED_IN'
                               THEN 'BORROWED_IN' ELSE 'OWNED' END, coalesce(s.owner_name, '')) AS product
        FROM filament_spools s JOIN filament_master_list m ON s.master_id = m.id
        WHERE s.deleted_at IS NULL AND coalesce(upper(trim(s.status)), '') <> 'EMPTY'
    ), numbered AS (
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
        let revisions = self.library_domain_revisions()?;
        let (total, borrowed) = conn.query_row(
                "SELECT count(*), count(*) FILTER (WHERE replace(replace(upper(trim(ownership_type)),'-','_'),' ','_')='BORROWED_IN')
                 FROM filament_spools WHERE deleted_at IS NULL", [], |r| Ok((r.get(0)?,r.get(1)?))
            )?;
        let policy = load_low_stock_policy(conn)?;
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
        let mut stmt = conn.prepare(STOCK_CARD_GROUPS)?;

        let mut select = conn.prepare(&format!("{SPOOL_WITH_MASTER_SELECT} JOIN json_each(?1) page ON page.value=s.id ORDER BY page.key"))?;
        let mut page = StockCardPage {
            cards: Vec::new(),
            groups: 0,
            visible: 0,
            total,
            borrowed,
            revisions: [revisions.inventory, revisions.catalog],
        };
        let (offset, member_offset, limit) = if query.member_of.is_some() {
            (0, i64::from(query.offset), 100)
        } else {
            (query.offset, 0, 3)
        };
        let mut groups = stmt.query(params![
            offset,
            query.member_of,
            member_offset,
            member_offset + limit
        ])?;
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
                .query_row(params![0, query.member_of, 0, 0], |row| {
                    Ok((row.get(3)?, row.get(4)?))
                })
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
    fn stock_card_totals_cover_members_outside_the_preview() {
        let db = FilamentDatabase::open(":memory:").unwrap();
        db.apply_schema().unwrap();
        let read = || {
            db.stock_card_page(&StockCardQuery {
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
                offset,
                locale: Some("en-US".into()),
                member_of: None,
            })
            .unwrap()
        };
        let first = read(0);
        let second = read(96);
        assert_eq!((first.cards.len(), second.cards.len()), (96, 2));
        assert_eq!((first.groups, second.visible, second.total), (98, 196, 196));
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
