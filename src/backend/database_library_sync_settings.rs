use rusqlite::Connection;

use super::database_ids::new_id;
use super::database_library_sync_auth::clear_library_sync_client_auth_state;
use super::database_library_sync_cache::{
    CACHED_ACTIVE_LOANS_KEY, DASHBOARD_SNAPSHOT_KEY, SNAPSHOT_CAPTURED_AT_KEY,
};
use super::database_library_sync_models::{
    LibrarySyncCacheDomain, LibrarySyncPageStatusRow, LibrarySyncSettingsRow,
};
use super::database_low_stock_policy::{load_low_stock_policy, save_low_stock_policy};
use super::database_result::InventoryResult;
use super::database_settings::{delete_setting, get_setting, set_setting};
use super::library_sync_defaults::{default_library_sync_device_name, normalize_library_sync_mode};

const LIBRARY_SYNC_HOST_CACHE_KEYS: &[&str] = &[
    "library_sync_cached_snapshot_json",
    super::database_loan_workspace::CACHED_COUNTS,
    SNAPSHOT_CAPTURED_AT_KEY,
    DASHBOARD_SNAPSHOT_KEY,
    "library_sync_cached_spools_json",
    "library_sync_cached_locations_json",
    "library_sync_cached_printers_json",
    "library_sync_cached_loans_json",
    CACHED_ACTIVE_LOANS_KEY,
    "library_sync_cached_consumption_json",
    "library_sync_cached_wishlist_json",
];

pub(crate) fn get_library_sync_page_status(
    conn: &Connection,
) -> InventoryResult<LibrarySyncPageStatusRow> {
    let mode = normalize_library_sync_mode(get_setting(conn, "library_sync_mode")?.as_deref());
    let library_id = get_library_sync_library_id(conn)?;
    let host_base_url = get_setting(conn, "library_sync_host_base_url")?
        .map(|value| value.trim().trim_end_matches('/').to_string())
        .filter(|value| !value.is_empty());
    let target_generation = library_sync_target_generation(conn)?;
    let host_device_name = trimmed_setting(conn, "library_sync_host_device_name")?;
    let client_auth_paired = trimmed_setting(conn, "library_sync_client_auth_configured")?
        .is_some()
        || trimmed_setting(conn, "library_sync_client_session_id")?.is_some();
    Ok(LibrarySyncPageStatusRow {
        mode,
        library_id,
        host_base_url,
        target_generation,
        host_device_name,
        client_auth_paired,
    })
}

pub(crate) fn get_library_sync_settings(
    conn: &Connection,
) -> InventoryResult<LibrarySyncSettingsRow> {
    read_library_sync_settings(conn, None, None, None)
}

pub(crate) fn read_library_sync_settings(
    conn: &Connection,
    domains: Option<&[LibrarySyncCacheDomain]>,
    expected_generation: Option<u64>,
    fetched_snapshot_at: Option<&str>,
) -> InventoryResult<LibrarySyncSettingsRow> {
    use LibrarySyncCacheDomain::*;
    let LibrarySyncPageStatusRow {
        mode,
        library_id,
        host_base_url,
        target_generation,
        host_device_name,
        client_auth_paired,
    } = get_library_sync_page_status(conn)?;
    // The identity and selected caches share a SQLite read transaction.
    // On a target switch, return only the replacement settings so the UI can retry.
    let target_matches = expected_generation.is_none_or(|expected| expected == target_generation);
    let domains = if !target_matches {
        Some(&[][..])
    } else {
        domains
    };
    let includes = |domain| domains.is_none_or(|selected| selected.contains(&domain));
    let device_name = trimmed_setting(conn, "library_sync_device_name")?
        .unwrap_or_else(default_library_sync_device_name);
    let client_auth_paired_at = trimmed_setting(conn, "library_sync_client_auth_paired_at")?;
    let client_auth_expires_at = trimmed_setting(conn, "library_sync_client_auth_expires_at")?;
    let last_checked_at = trimmed_setting(conn, "library_sync_last_checked_at")?;
    let last_reachable_at = trimmed_setting(conn, "library_sync_last_reachable_at")?;
    let last_validation_message = trimmed_setting(conn, "library_sync_last_validation_message")?;
    let (low_stock_policy, low_stock_policy_valid) = match load_low_stock_policy(conn) {
        Ok(policy) => (policy, true),
        Err(rusqlite::Error::FromSqlConversionFailure(_, _, _)) => (Default::default(), false),
        Err(error) => return Err(error.into()),
    };
    // Overlapping Host reads can commit a newer summary before the page paints.
    // Compare the small timestamp and only recover the payload for a stale reply.
    let newer_snapshot = match fetched_snapshot_at {
        Some(fetched) if target_matches => get_setting(conn, SNAPSHOT_CAPTURED_AT_KEY)?
            .is_some_and(|saved| saved.as_str() > fetched),
        _ => false,
    };
    let dashboard = domains.is_some_and(|selected| selected.contains(&DashboardStock));
    let compact = selected_cache(conn, dashboard, DASHBOARD_SNAPSHOT_KEY)?;
    let legacy_dashboard = dashboard && compact.is_none();
    let cached_snapshot = match compact {
        Some(snapshot) => Some(snapshot),
        None => selected_cache(
            conn,
            includes(Snapshot) || newer_snapshot || legacy_dashboard,
            "library_sync_cached_snapshot_json",
        )?,
    };
    let cached_spools = selected_cache(
        conn,
        includes(Spools) || legacy_dashboard,
        "library_sync_cached_spools_json",
    )?;
    let cached_printers = selected_cache(
        conn,
        includes(Printers),
        "library_sync_cached_printers_json",
    )?;
    let cached_active_loans = selected_cache(conn, includes(ActiveLoans), CACHED_ACTIVE_LOANS_KEY)?;
    // Older clients may only have the full loan history.
    let read_history =
        includes(LoanHistory) || (includes(ActiveLoans) && cached_active_loans.is_none());
    let cached_loans = selected_cache(conn, read_history, "library_sync_cached_loans_json")?;
    let cached_consumption = selected_cache(
        conn,
        domains.is_none(),
        "library_sync_cached_consumption_json",
    )?;
    let cached_wishlist = selected_cache(
        conn,
        includes(Wishlist),
        "library_sync_cached_wishlist_json",
    )?;

    Ok(LibrarySyncSettingsRow {
        mode,
        device_name,
        library_id,
        host_base_url,
        target_generation,
        host_device_name,
        client_auth_paired,
        client_auth_paired_at,
        client_auth_expires_at,
        last_checked_at,
        last_reachable_at,
        last_validation_message,
        low_stock_policy,
        low_stock_policy_valid,
        cached_snapshot,
        cached_spools,
        cached_printers,
        cached_loans,
        cached_active_loans,
        cached_consumption,
        cached_wishlist,
    })
}

pub(crate) fn get_library_sync_library_id(conn: &Connection) -> InventoryResult<String> {
    match trimmed_setting(conn, "library_sync_library_id")? {
        Some(value) => Ok(value),
        None => {
            let next = new_id();
            set_setting(conn, "library_sync_library_id", &next)?;
            Ok(next)
        }
    }
}

pub(crate) fn save_library_sync_settings(
    conn: &Connection,
    settings: &LibrarySyncSettingsRow,
) -> InventoryResult<LibrarySyncSettingsRow> {
    let low_stock_policy = if settings.low_stock_policy_valid {
        Some(
            settings
                .low_stock_policy
                .clone()
                .normalized()
                .map_err(
                    |error| super::database_result::InventoryError::InvalidOperation {
                        code: "low_stock_policy.invalid",
                        message: error.to_string(),
                    },
                )?,
        )
    } else {
        None
    };
    let mode = normalize_library_sync_mode(Some(settings.mode.as_str()));
    let device_name = settings
        .device_name
        .trim()
        .to_string()
        .chars()
        .take(120)
        .collect::<String>();
    let safe_device_name = if device_name.is_empty() {
        default_library_sync_device_name()
    } else {
        device_name
    };
    let library_id = settings
        .library_id
        .trim()
        .to_string()
        .chars()
        .take(160)
        .collect::<String>();
    let safe_library_id = if library_id.is_empty() {
        new_id()
    } else {
        library_id
    };
    let host_base_url = settings
        .host_base_url
        .as_deref()
        .map(str::trim)
        .map(|value| value.trim_end_matches('/'))
        .filter(|value| !value.is_empty())
        .map(|value| value.to_string());
    let host_device_name = settings
        .host_device_name
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(|value| value.chars().take(120).collect::<String>());
    let previous_host_base_url = get_setting(conn, "library_sync_host_base_url")?
        .map(|value| value.trim().trim_end_matches('/').to_string())
        .filter(|value| !value.is_empty());
    let previous_library_id = trimmed_setting(conn, "library_sync_library_id")?;
    let previous_mode =
        normalize_library_sync_mode(get_setting(conn, "library_sync_mode")?.as_deref());
    let previous_target_generation = library_sync_target_generation(conn)?;
    let target_changed = previous_mode != mode
        || previous_host_base_url != host_base_url
        || previous_library_id.as_deref() != Some(safe_library_id.as_str());

    if target_changed {
        let next_generation = previous_target_generation.checked_add(1).ok_or_else(|| {
            super::database_result::InventoryError::Db(
                "Library sync target generation is exhausted.".to_string(),
            )
        })?;
        set_setting(
            conn,
            "library_sync_target_generation",
            &next_generation.to_string(),
        )?;
    }

    set_setting(conn, "library_sync_mode", &mode)?;
    set_setting(conn, "library_sync_device_name", &safe_device_name)?;
    set_setting(conn, "library_sync_library_id", &safe_library_id)?;
    if let Some(low_stock_policy) = low_stock_policy {
        save_low_stock_policy(conn, low_stock_policy)?;
    }

    if mode == "CLIENT" {
        save_optional_setting(conn, "library_sync_host_base_url", host_base_url.as_deref())?;
        save_optional_setting(
            conn,
            "library_sync_host_device_name",
            host_device_name.as_deref(),
        )?;
        if target_changed {
            clear_library_sync_client_auth_state(conn)?;
            // Every cached read is scoped to exactly one Host library. The
            // enclosing settings transaction clears them together with auth so
            // an offline replacement target can never inherit Host A's data.
            clear_library_sync_host_caches(conn)?;
        }
    } else {
        delete_setting(conn, "library_sync_host_base_url")?;
        delete_setting(conn, "library_sync_host_device_name")?;
        delete_setting(conn, "library_sync_last_checked_at")?;
        delete_setting(conn, "library_sync_last_reachable_at")?;
        delete_setting(conn, "library_sync_last_validation_message")?;
        clear_library_sync_host_caches(conn)?;
        clear_library_sync_client_auth_state(conn)?;
    }

    get_library_sync_settings(conn)
}

fn library_sync_target_generation(conn: &Connection) -> InventoryResult<u64> {
    match trimmed_setting(conn, "library_sync_target_generation")? {
        Some(value) => value.parse::<u64>().map_err(|_| {
            super::database_result::InventoryError::Db(
                "Library sync target generation is invalid.".to_string(),
            )
        }),
        None => Ok(0),
    }
}

fn clear_library_sync_host_caches(conn: &Connection) -> InventoryResult<()> {
    for key in LIBRARY_SYNC_HOST_CACHE_KEYS {
        delete_setting(conn, key)?;
    }
    Ok(())
}

fn trimmed_setting(conn: &Connection, key: &str) -> InventoryResult<Option<String>> {
    Ok(get_setting(conn, key)?
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty()))
}

fn selected_cache<T>(conn: &Connection, selected: bool, key: &str) -> InventoryResult<Option<T>>
where
    T: serde::de::DeserializeOwned,
{
    if !selected {
        return Ok(None);
    }
    Ok(get_setting(conn, key)?.and_then(|value| serde_json::from_str::<T>(&value).ok()))
}

fn save_optional_setting(conn: &Connection, key: &str, value: Option<&str>) -> InventoryResult<()> {
    match value {
        Some(value) => set_setting(conn, key, value),
        None => delete_setting(conn, key),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::backend::filament_database::FilamentDatabase;

    #[test]
    fn dashboard_cache_selection_only_reads_requested_domains_and_legacy_fallback() {
        use LibrarySyncCacheDomain::*;
        let db = FilamentDatabase::open(":memory:").unwrap();
        db.apply_schema().unwrap();
        let conn = db.connection();
        for key in LIBRARY_SYNC_HOST_CACHE_KEYS {
            conn.execute(
                "INSERT OR REPLACE INTO settings (key, value) VALUES (?1, X'FF')",
                [key],
            )
            .unwrap();
        }
        assert!(db.get_library_sync_settings_for_domains(&[]).is_ok());
        assert!(db.get_library_sync_settings_for_domains(&[Spools]).is_err());
        let rows = r#"{"captured_at":"cached","rows":[]}"#;
        set_setting(conn, CACHED_ACTIVE_LOANS_KEY, rows).unwrap();
        let active = db
            .get_library_sync_settings_for_domains(&[ActiveLoans])
            .unwrap();
        assert!(active.cached_active_loans.is_some());
        assert!(active.cached_loans.is_none());
        delete_setting(conn, CACHED_ACTIVE_LOANS_KEY).unwrap();
        set_setting(conn, "library_sync_cached_loans_json", rows).unwrap();
        let historical = db
            .get_library_sync_settings_for_domains(&[ActiveLoans])
            .unwrap();
        assert!(historical.cached_active_loans.is_none());
        assert!(historical.cached_loans.is_some());
    }

    #[test]
    fn compact_dashboard_cache_survives_other_summary_reads_and_is_scoped_to_the_target() {
        use super::super::database_library_sync_models::LibrarySyncCachedSnapshotRow;
        let db = FilamentDatabase::open(":memory:").unwrap();
        db.apply_schema().unwrap();
        let mut target = db.get_library_sync_settings().unwrap();
        target.mode = "CLIENT".into();
        target.host_base_url = Some("http://a.local".into());
        let generation = db
            .save_library_sync_settings(&target)
            .unwrap()
            .target_generation;
        let mut summary = LibrarySyncCachedSnapshotRow {
            captured_at: "time-a".into(),
            app_version: None,
            library_id: target.library_id.clone(),
            device_name: "A".into(),
            sync_mode: "HOST".into(),
            inventory: db.inventory_overview().unwrap(),
            total_spools: 0,
            in_use: 0,
            low_stock: 0,
            active_loans: 0,
            printers: 0,
            dashboard_stock: Some(Default::default()),
        };
        db.save_library_sync_host_snapshot(summary.clone(), true)
            .unwrap();
        summary.dashboard_stock = None;
        summary.captured_at = "time-b".into();
        db.save_library_sync_cached_snapshot(&summary).unwrap();
        db.connection().execute("INSERT OR REPLACE INTO settings(key,value) VALUES ('library_sync_cached_spools_json', X'FF')", []).unwrap();
        let read = || {
            db.get_library_sync_settings_at_generation(
                &[LibrarySyncCacheDomain::DashboardStock],
                Some(generation),
                None,
            )
        };
        let stats = db
            .get_library_sync_settings_at_generation(
                &[LibrarySyncCacheDomain::Snapshot],
                Some(generation),
                None,
            )
            .unwrap();
        assert!(stats.cached_spools.is_none());
        assert_eq!(
            stats.cached_snapshot.unwrap().inventory.owned_on_hand_grams,
            Some(0)
        );
        let cached = read().unwrap();
        assert!(cached.cached_spools.is_none());
        let compact = cached.cached_snapshot.unwrap();
        assert_eq!(compact.captured_at, "time-a");
        db.save_library_sync_host_snapshot(summary, true).unwrap();
        assert!(read().is_err(), "an older Host uses the legacy spool cache");
        db.save_library_sync_host_snapshot(compact, true).unwrap();
        target.host_base_url = Some("http://b.local".into());
        db.save_library_sync_settings(&target).unwrap();
        assert!(read().unwrap().cached_snapshot.is_none());
        target.host_base_url = Some("http://a.local".into());
        db.save_library_sync_settings(&target).unwrap();
        let current = db
            .get_library_sync_settings_for_domains(&[LibrarySyncCacheDomain::DashboardStock])
            .unwrap();
        assert_ne!(current.target_generation, generation);
        assert!(current.cached_snapshot.is_none() && current.cached_spools.is_none());
        assert!(get_setting(db.connection(), DASHBOARD_SNAPSHOT_KEY)
            .unwrap()
            .is_none());
    }

    #[test]
    fn settings_refresh_skips_unneeded_payloads_and_rejects_old_generations() {
        use LibrarySyncCacheDomain::{Printers, Spools};
        let db = FilamentDatabase::open(":memory:").unwrap();
        db.apply_schema().unwrap();
        let conn = db.connection();
        let mut target = db.get_library_sync_settings().unwrap();
        target.mode = "CLIENT".into();
        target.host_base_url = Some("http://a.local".into());
        let generation = db
            .save_library_sync_settings(&target)
            .unwrap()
            .target_generation;
        for key in [
            "library_sync_cached_snapshot_json",
            "library_sync_cached_spools_json",
        ] {
            conn.execute(
                "INSERT OR REPLACE INTO settings (key, value) VALUES (?1, X'FF')",
                [key],
            )
            .unwrap();
        }
        set_setting(conn, SNAPSHOT_CAPTURED_AT_KEY, "2026-11-01 12:00:00").unwrap();
        let read = |domains: &[LibrarySyncCacheDomain], expected, fetched| {
            db.get_library_sync_settings_at_generation(domains, Some(expected), fetched)
        };
        assert!(read(&[], generation, Some("2026-11-01 12:00:00")).is_ok());
        assert!(read(&[Printers], generation, None).is_ok());
        assert!(read(&[Spools], generation, None).is_err());
        // A stale Host summary is the only successful read that needs the saved summary.
        assert!(read(&[], generation, Some("2026-11-01 11:59:59")).is_err());
        let replacement = read(&[Spools], generation - 1, Some("older")).unwrap();
        assert_eq!(replacement.target_generation, generation);
        assert!(replacement.cached_spools.is_none());
        target.host_base_url = Some("http://b.local".into());
        db.save_library_sync_settings(&target).unwrap();
        assert!(get_setting(conn, SNAPSHOT_CAPTURED_AT_KEY)
            .unwrap()
            .is_none());
    }

    #[test]
    fn page_status_never_reads_a_host_cache_setting() {
        let db = FilamentDatabase::open(":memory:").unwrap();
        db.apply_schema().unwrap();
        for key in LIBRARY_SYNC_HOST_CACHE_KEYS {
            // Reading this as a settings string fails before JSON decoding.
            db.connection()
                .execute(
                    "INSERT OR REPLACE INTO settings (key, value) VALUES (?1, X'FF')",
                    [key],
                )
                .unwrap();
            assert!(get_setting(db.connection(), key).is_err());
        }
        assert!(db.get_library_sync_settings().is_err());
        assert_eq!(
            db.get_library_sync_page_status().unwrap().mode,
            "STANDALONE"
        );
    }
}
