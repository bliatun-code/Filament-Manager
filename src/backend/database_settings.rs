use rusqlite::{params, Connection, OptionalExtension};

use super::database_result::{InventoryError, InventoryResult};

pub const CREDENTIAL_STORE_PROFILE_ID_SETTING_KEY: &str = "credential_store_profile_id";
pub const CREDENTIAL_STORE_PROFILE_MIGRATION_SETTING_KEY: &str =
    "credential_store_profile_migration_v1";
const CREDENTIAL_STORE_PROFILE_MIGRATION_COMPLETE: &str = "complete";
const CREDENTIAL_STORE_PROFILE_ID_PREFIX: &str = "credential_profile_";

pub(crate) fn set_setting(conn: &Connection, key: &str, value: &str) -> InventoryResult<()> {
    conn.execute(
        "INSERT INTO settings (key, value)
         VALUES (?1, ?2)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        params![key, value],
    )?;
    Ok(())
}

pub(crate) fn delete_setting(conn: &Connection, key: &str) -> InventoryResult<()> {
    conn.execute("DELETE FROM settings WHERE key = ?1", params![key])?;
    Ok(())
}

pub(crate) fn get_setting(conn: &Connection, key: &str) -> InventoryResult<Option<String>> {
    let value = conn
        .query_row(
            "SELECT value FROM settings WHERE key = ?1 LIMIT 1",
            params![key],
            |row| row.get(0),
        )
        .optional()?;
    Ok(value)
}

pub(crate) fn get_or_create_credential_store_profile_id(
    conn: &Connection,
) -> InventoryResult<String> {
    let transaction = conn.unchecked_transaction()?;
    let profile_id = match get_setting(&transaction, CREDENTIAL_STORE_PROFILE_ID_SETTING_KEY)? {
        Some(profile_id) => validate_credential_store_profile_id(profile_id)?,
        None => {
            let profile_id = new_credential_store_profile_id();
            set_setting(
                &transaction,
                CREDENTIAL_STORE_PROFILE_ID_SETTING_KEY,
                &profile_id,
            )?;
            profile_id
        }
    };
    transaction.commit()?;
    Ok(profile_id)
}

pub(crate) fn credential_store_profile_migration_completed(
    conn: &Connection,
) -> InventoryResult<bool> {
    Ok(
        get_setting(conn, CREDENTIAL_STORE_PROFILE_MIGRATION_SETTING_KEY)?.as_deref()
            == Some(CREDENTIAL_STORE_PROFILE_MIGRATION_COMPLETE),
    )
}

pub(crate) fn mark_credential_store_profile_migration_completed(
    conn: &Connection,
) -> InventoryResult<()> {
    set_setting(
        conn,
        CREDENTIAL_STORE_PROFILE_MIGRATION_SETTING_KEY,
        CREDENTIAL_STORE_PROFILE_MIGRATION_COMPLETE,
    )
}

pub(crate) fn initialize_fresh_credential_store_profile(
    conn: &Connection,
) -> InventoryResult<String> {
    let transaction = conn.unchecked_transaction()?;
    let profile_id = new_credential_store_profile_id();
    set_setting(
        &transaction,
        CREDENTIAL_STORE_PROFILE_ID_SETTING_KEY,
        &profile_id,
    )?;
    mark_credential_store_profile_migration_completed(&transaction)?;
    transaction.commit()?;
    Ok(profile_id)
}

fn new_credential_store_profile_id() -> String {
    format!(
        "{CREDENTIAL_STORE_PROFILE_ID_PREFIX}{:032x}",
        rand::random::<u128>()
    )
}

fn validate_credential_store_profile_id(profile_id: String) -> InventoryResult<String> {
    let profile_id = profile_id.trim();
    let Some(random_part) = profile_id.strip_prefix(CREDENTIAL_STORE_PROFILE_ID_PREFIX) else {
        return Err(invalid_credential_store_profile_id());
    };
    if random_part.len() != 32 || !random_part.bytes().all(|byte| byte.is_ascii_hexdigit()) {
        return Err(invalid_credential_store_profile_id());
    }
    Ok(format!(
        "{CREDENTIAL_STORE_PROFILE_ID_PREFIX}{}",
        random_part.to_ascii_lowercase()
    ))
}

fn invalid_credential_store_profile_id() -> InventoryError {
    InventoryError::InvalidOperation {
        code: "credential_store_profile.invalid",
        message: "The local credential-store profile identity is invalid.".to_string(),
    }
}
