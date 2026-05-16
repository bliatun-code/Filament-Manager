use rusqlite::{params, Connection, OptionalExtension};

use super::database_ids::new_id;
use super::database_result::{require_rows, InventoryError, InventoryResult};
use super::database_rows::map_trusted_lan_paired_browser_row;
use super::database_trusted_lan_models::TrustedLanPairedBrowserRow;

pub(crate) fn create_trusted_lan_pairing(
    conn: &Connection,
    display_name: Option<&str>,
    pairing_token_hash: &str,
    expires_in_seconds: u64,
) -> InventoryResult<String> {
    let pairing_id = new_id();
    let expiry_modifier = format!("+{} seconds", expires_in_seconds.max(1));
    conn.execute(
        "INSERT INTO trusted_lan_pairings (
            id, display_name, pairing_token_hash, expires_at
        ) VALUES (?1, ?2, ?3, datetime('now', ?4))",
        params![
            pairing_id,
            display_name
                .map(str::trim)
                .filter(|value| !value.is_empty()),
            pairing_token_hash.trim(),
            expiry_modifier
        ],
    )?;
    Ok(pairing_id)
}

pub(crate) fn consume_trusted_lan_pairing(
    conn: &Connection,
    pairing_token_hash: &str,
) -> InventoryResult<Option<Option<String>>> {
    let pairing = conn
        .query_row(
            "SELECT id, display_name
             FROM trusted_lan_pairings
             WHERE pairing_token_hash = ?1
               AND used_at IS NULL
               AND expires_at >= datetime('now')
             LIMIT 1",
            params![pairing_token_hash.trim()],
            |row| Ok((row.get::<_, String>(0)?, row.get::<_, Option<String>>(1)?)),
        )
        .optional()?;

    let Some((pairing_id, display_name)) = pairing else {
        return Ok(None);
    };

    let updated = conn.execute(
        "UPDATE trusted_lan_pairings
         SET used_at = datetime('now')
         WHERE id = ?1
           AND used_at IS NULL
           AND expires_at >= datetime('now')",
        params![pairing_id],
    )?;
    if updated == 0 {
        return Ok(None);
    }

    Ok(Some(display_name))
}

pub(crate) fn create_trusted_lan_paired_browser(
    conn: &Connection,
    display_name: Option<&str>,
    device_token_hash: &str,
    last_origin: Option<&str>,
) -> InventoryResult<TrustedLanPairedBrowserRow> {
    let browser_id = new_id();
    conn.execute(
        "INSERT INTO trusted_lan_paired_browsers (
            id, display_name, device_token_hash, last_seen_at, last_origin
        ) VALUES (?1, ?2, ?3, datetime('now'), ?4)",
        params![
            browser_id,
            display_name
                .map(str::trim)
                .filter(|value| !value.is_empty()),
            device_token_hash.trim(),
            last_origin.map(str::trim).filter(|value| !value.is_empty())
        ],
    )?;
    get_trusted_lan_paired_browser_by_id(conn, &browser_id).and_then(|value| {
        value.ok_or_else(|| {
            InventoryError::Db(
                "Failed to resolve trusted-LAN paired browser after insert".to_string(),
            )
        })
    })
}

pub(crate) fn get_trusted_lan_paired_browser_by_id(
    conn: &Connection,
    browser_id: &str,
) -> InventoryResult<Option<TrustedLanPairedBrowserRow>> {
    conn.query_row(
        "SELECT id, display_name, paired_at, last_seen_at, last_origin, revoked_at
         FROM trusted_lan_paired_browsers
         WHERE id = ?1
         LIMIT 1",
        params![browser_id.trim()],
        map_trusted_lan_paired_browser_row,
    )
    .optional()
    .map_err(InventoryError::from)
}

pub(crate) fn get_active_trusted_lan_paired_browser_by_device_token_hash(
    conn: &Connection,
    device_token_hash: &str,
) -> InventoryResult<Option<TrustedLanPairedBrowserRow>> {
    conn.query_row(
        "SELECT id, display_name, paired_at, last_seen_at, last_origin, revoked_at
         FROM trusted_lan_paired_browsers
         WHERE device_token_hash = ?1
           AND revoked_at IS NULL
         LIMIT 1",
        params![device_token_hash.trim()],
        map_trusted_lan_paired_browser_row,
    )
    .optional()
    .map_err(InventoryError::from)
}

pub(crate) fn list_trusted_lan_paired_browsers(
    conn: &Connection,
) -> InventoryResult<Vec<TrustedLanPairedBrowserRow>> {
    let mut results = Vec::new();
    let mut stmt = conn.prepare(
        "SELECT id, display_name, paired_at, last_seen_at, last_origin, revoked_at
         FROM trusted_lan_paired_browsers
         ORDER BY revoked_at IS NULL DESC, COALESCE(last_seen_at, paired_at) DESC, paired_at DESC",
    )?;
    let rows = stmt.query_map([], map_trusted_lan_paired_browser_row)?;
    for row in rows {
        results.push(row?);
    }
    Ok(results)
}

pub(crate) fn touch_trusted_lan_paired_browser(
    conn: &Connection,
    browser_id: &str,
    last_origin: Option<&str>,
) -> InventoryResult<()> {
    let updated = conn.execute(
        "UPDATE trusted_lan_paired_browsers
         SET last_seen_at = datetime('now'),
             last_origin = COALESCE(?1, last_origin)
         WHERE id = ?2
           AND revoked_at IS NULL",
        params![
            last_origin.map(str::trim).filter(|value| !value.is_empty()),
            browser_id.trim()
        ],
    )?;
    require_rows(updated)
}

pub(crate) fn revoke_trusted_lan_paired_browser(
    conn: &Connection,
    browser_id: &str,
) -> InventoryResult<()> {
    let updated = conn.execute(
        "UPDATE trusted_lan_paired_browsers
         SET revoked_at = COALESCE(revoked_at, datetime('now'))
         WHERE id = ?1",
        params![browser_id.trim()],
    )?;
    require_rows(updated)
}

pub(crate) fn revoke_all_trusted_lan_paired_browsers(conn: &Connection) -> InventoryResult<usize> {
    let updated = conn.execute(
        "UPDATE trusted_lan_paired_browsers
         SET revoked_at = COALESCE(revoked_at, datetime('now'))
         WHERE revoked_at IS NULL",
        [],
    )?;
    Ok(updated)
}
