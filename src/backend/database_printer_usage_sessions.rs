use rusqlite::{params, Connection, OptionalExtension};

use super::database_ids::new_id;
use super::database_result::{InventoryError, InventoryResult};

pub(crate) const LIVE_USAGE_PROVISIONAL_SESSION_KEY: &str = "active-print";

pub struct LiveUsageDeltaInput<'a> {
    pub printer_id: &'a str,
    pub session_key: &'a str,
    pub job_name: Option<&'a str>,
    pub print_type: Option<&'a str>,
    pub spool_id: &'a str,
    pub used_grams: i64,
    pub observed_at: Option<&'a str>,
    pub defer_initial_delta: bool,
}

pub struct LiveUsageSessionInput<'a> {
    pub printer_id: &'a str,
    pub session_key: &'a str,
    pub job_name: Option<&'a str>,
    pub print_type: Option<&'a str>,
    pub observed_at: Option<&'a str>,
}

pub struct LiveUsageObservedWeightCorrectionInput<'a> {
    pub printer_id: &'a str,
    pub session_key: &'a str,
    pub spool_id: &'a str,
    pub observed_grams: i64,
    pub observed_at: Option<&'a str>,
    pub min_correction_grams: i64,
}

pub struct LiveUsageRecentCompletedDeltaInput<'a> {
    pub printer_id: &'a str,
    pub session_key: Option<&'a str>,
    pub spool_id: &'a str,
    pub used_grams: i64,
    pub observed_at: Option<&'a str>,
    pub max_age_seconds: i64,
}

pub struct LiveUsageRecentCompletedSessionInput<'a> {
    pub printer_id: &'a str,
    pub session_key: &'a str,
    pub observed_at: Option<&'a str>,
    pub max_age_seconds: i64,
}

#[derive(Clone, Debug, PartialEq)]
pub struct LiveUsageDeltaResult {
    pub session_id: String,
    pub recorded_used_grams: i64,
    pub deferred_initial_delta: bool,
}

#[derive(Clone, Debug, PartialEq)]
pub struct LiveUsageObservedWeightCorrectionResult {
    pub session_id: String,
    pub baseline_grams: i64,
    pub previous_used_grams: i64,
    pub corrected_used_grams: i64,
    pub correction_grams: i64,
}

pub(crate) fn record_live_usage_delta(
    conn: &Connection,
    input: LiveUsageDeltaInput<'_>,
) -> InventoryResult<LiveUsageDeltaResult> {
    let session = ensure_live_usage_session(
        conn,
        input.printer_id,
        input.session_key,
        input.job_name,
        input.print_type,
        input.observed_at,
    )?;

    let existing_spool_usage_id: Option<String> = conn
        .query_row(
            "SELECT id
             FROM printer_live_usage_session_spools
             WHERE session_id = ?1 AND spool_id = ?2",
            params![&session.id, input.spool_id],
            |row| row.get(0),
        )
        .optional()?;

    let should_defer_delta = input.defer_initial_delta && existing_spool_usage_id.is_none();
    let recorded_used_grams = if should_defer_delta {
        0
    } else {
        input.used_grams.max(0)
    };
    conn.execute(
        "UPDATE printer_live_usage_sessions
         SET total_used_g = total_used_g + ?2,
             last_seen_at = COALESCE(?3, datetime('now'))
         WHERE id = ?1",
        params![
            &session.id,
            recorded_used_grams,
            normalized_optional_text(input.observed_at)
        ],
    )?;

    if let Some(existing_spool_usage_id) = existing_spool_usage_id {
        conn.execute(
            "UPDATE printer_live_usage_session_spools
             SET used_g = used_g + ?2
             WHERE id = ?1",
            params![existing_spool_usage_id, recorded_used_grams],
        )?;
    } else {
        conn.execute(
            "INSERT INTO printer_live_usage_session_spools (id, session_id, spool_id, used_g)
             VALUES (?1, ?2, ?3, ?4)",
            params![new_id(), &session.id, input.spool_id, recorded_used_grams],
        )?;
    }

    Ok(LiveUsageDeltaResult {
        session_id: session.id,
        recorded_used_grams,
        deferred_initial_delta: should_defer_delta,
    })
}

pub(crate) fn touch_live_usage_session(
    conn: &Connection,
    input: LiveUsageSessionInput<'_>,
) -> InventoryResult<String> {
    Ok(ensure_live_usage_session(
        conn,
        input.printer_id,
        input.session_key,
        input.job_name,
        input.print_type,
        input.observed_at,
    )?
    .id)
}

pub(crate) fn finish_live_usage_session(
    conn: &Connection,
    printer_id: &str,
    session_key: &str,
    observed_at: Option<&str>,
    success: bool,
) -> InventoryResult<()> {
    let status = if success { "COMPLETED" } else { "FAILED" };
    let printer_id = normalize_required_text(printer_id, "printer id")?;
    let session_key = normalize_required_text(session_key, "session key")?;
    let session_id = match find_active_live_usage_session(conn, &printer_id, &session_key)? {
        Some(session_id) => session_id,
        None => {
            let Some(session_id) = find_single_active_live_usage_session(conn, &printer_id)? else {
                return Ok(());
            };
            session_id
        }
    };
    conn.execute(
        "UPDATE printer_live_usage_sessions
         SET status = ?2,
             success = ?3,
             finished_at = COALESCE(?4, datetime('now')),
             last_seen_at = COALESCE(?4, datetime('now'))
         WHERE id = ?1
           AND status != ?2",
        params![
            session_id,
            status,
            if success { 1 } else { 0 },
            normalized_optional_text(observed_at),
        ],
    )?;
    Ok(())
}

pub(crate) fn live_usage_session_is_active(
    conn: &Connection,
    printer_id: &str,
    session_key: &str,
) -> InventoryResult<bool> {
    let printer_id = normalize_required_text(printer_id, "printer id")?;
    let session_key = normalize_required_text(session_key, "session key")?;
    Ok(find_active_live_usage_session(conn, &printer_id, &session_key)?.is_some())
}

pub(crate) fn live_usage_session_has_spool_usage(
    conn: &Connection,
    printer_id: &str,
    session_key: &str,
    spool_id: &str,
) -> InventoryResult<bool> {
    let printer_id = normalize_required_text(printer_id, "printer id")?;
    let session_key = normalize_required_text(session_key, "session key")?;
    let spool_id = normalize_required_text(spool_id, "spool id")?;
    let Some(session_id) = find_active_live_usage_session(conn, &printer_id, &session_key)? else {
        return Ok(false);
    };

    let count: i64 = conn.query_row(
        "SELECT COUNT(*)
         FROM printer_live_usage_session_spools
         WHERE session_id = ?1 AND spool_id = ?2",
        params![session_id, spool_id],
        |row| row.get(0),
    )?;
    Ok(count > 0)
}

pub(crate) fn live_usage_session_spool_used_g(
    conn: &Connection,
    printer_id: &str,
    session_key: &str,
    spool_id: &str,
) -> InventoryResult<Option<i64>> {
    let printer_id = normalize_required_text(printer_id, "printer id")?;
    let session_key = normalize_required_text(session_key, "session key")?;
    let spool_id = normalize_required_text(spool_id, "spool id")?;
    let Some(session_id) = find_active_live_usage_session(conn, &printer_id, &session_key)? else {
        return Ok(None);
    };

    Ok(conn
        .query_row(
            "SELECT used_g
             FROM printer_live_usage_session_spools
             WHERE session_id = ?1 AND spool_id = ?2",
            params![session_id, spool_id],
            |row| row.get(0),
        )
        .optional()?)
}

pub(crate) fn live_usage_session_recently_completed_successfully(
    conn: &Connection,
    input: LiveUsageRecentCompletedSessionInput<'_>,
) -> InventoryResult<bool> {
    let printer_id = normalize_required_text(input.printer_id, "printer id")?;
    let session_key = normalize_required_text(input.session_key, "session key")?;
    let Some(observed_at) = normalized_optional_text(input.observed_at) else {
        return Ok(false);
    };
    let session_key_prefix = live_usage_session_key_prefix(&session_key);
    let count: i64 = conn.query_row(
        "SELECT COUNT(*)
         FROM printer_live_usage_sessions
         WHERE printer_id = ?1
           AND status = 'COMPLETED'
           AND success = 1
           AND (session_key = ?2 OR session_key LIKE ?3 ESCAPE '\\')
           AND unixepoch(?4) - unixepoch(COALESCE(finished_at, last_seen_at)) BETWEEN 0 AND ?5",
        params![
            &printer_id,
            &session_key,
            &session_key_prefix,
            &observed_at,
            input.max_age_seconds.max(0),
        ],
        |row| row.get(0),
    )?;
    Ok(count > 0)
}

pub(crate) fn correct_live_usage_for_observed_weight_increase(
    conn: &Connection,
    input: LiveUsageObservedWeightCorrectionInput<'_>,
) -> InventoryResult<Option<LiveUsageObservedWeightCorrectionResult>> {
    let printer_id = normalize_required_text(input.printer_id, "printer id")?;
    let session_key = normalize_required_text(input.session_key, "session key")?;
    let spool_id = normalize_required_text(input.spool_id, "spool id")?;

    let Some((session_id, total_used_g)) =
        find_latest_live_usage_session(conn, &printer_id, &session_key)?
    else {
        return Ok(None);
    };

    let Some((session_spool_id, previous_used_grams)) = conn
        .query_row(
            "SELECT id, used_g
             FROM printer_live_usage_session_spools
             WHERE session_id = ?1 AND spool_id = ?2",
            params![&session_id, &spool_id],
            |row| Ok((row.get::<_, String>(0)?, row.get::<_, i64>(1)?)),
        )
        .optional()?
    else {
        return Ok(None);
    };
    if previous_used_grams <= 0 {
        return Ok(None);
    }

    let Some(current_grams) = conn
        .query_row(
            "SELECT COALESCE(current_weight_g, remaining_g)
             FROM filament_spools
             WHERE id = ?1",
            params![&spool_id],
            |row| row.get::<_, Option<i64>>(0),
        )
        .optional()?
        .flatten()
    else {
        return Ok(None);
    };

    if input.observed_grams <= current_grams {
        return Ok(None);
    }

    let baseline_grams = current_grams + previous_used_grams;
    if input.observed_grams > baseline_grams {
        return Ok(None);
    }

    let corrected_used_grams = (baseline_grams - input.observed_grams).max(0);
    if corrected_used_grams >= previous_used_grams {
        return Ok(None);
    }
    if corrected_used_grams == 0 {
        return Ok(None);
    }
    // AMS remaining estimates can rebound by several percent during a long print. Use corrections to
    // trim obvious overcounts, but do not let a single late rebound wipe out most of an established run.
    if corrected_used_grams.saturating_mul(2) < previous_used_grams {
        return Ok(None);
    }

    let correction_grams = previous_used_grams - corrected_used_grams;
    if correction_grams < input.min_correction_grams.max(0) {
        return Ok(None);
    }

    conn.execute(
        "UPDATE printer_live_usage_session_spools
         SET used_g = ?2
         WHERE id = ?1",
        params![session_spool_id, corrected_used_grams],
    )?;
    conn.execute(
        "UPDATE printer_live_usage_sessions
         SET total_used_g = CASE
                WHEN total_used_g > ?2 THEN total_used_g - ?2
                ELSE 0
             END,
             last_seen_at = COALESCE(?3, last_seen_at)
         WHERE id = ?1",
        params![
            &session_id,
            correction_grams.min(total_used_g.max(0)),
            normalized_optional_text(input.observed_at),
        ],
    )?;

    Ok(Some(LiveUsageObservedWeightCorrectionResult {
        session_id,
        baseline_grams,
        previous_used_grams,
        corrected_used_grams,
        correction_grams,
    }))
}

pub(crate) fn record_recent_completed_live_usage_delta(
    conn: &Connection,
    input: LiveUsageRecentCompletedDeltaInput<'_>,
) -> InventoryResult<Option<LiveUsageDeltaResult>> {
    if input.used_grams <= 0 {
        return Ok(None);
    }
    let printer_id = normalize_required_text(input.printer_id, "printer id")?;
    let spool_id = normalize_required_text(input.spool_id, "spool id")?;
    let Some(observed_at) = normalized_optional_text(input.observed_at) else {
        return Ok(None);
    };
    let max_age_seconds = input.max_age_seconds.max(0);
    let session_key = input
        .session_key
        .map(|value| normalize_required_text(value, "session key"))
        .transpose()?;
    let session_key_prefix = session_key
        .as_deref()
        .map(live_usage_session_key_prefix)
        .unwrap_or_default();

    let Some((session_id, session_spool_id)) = conn
        .query_row(
            "SELECT sessions.id, session_spools.id
             FROM printer_live_usage_sessions sessions
             JOIN printer_live_usage_session_spools session_spools
               ON session_spools.session_id = sessions.id
              AND session_spools.spool_id = ?2
             WHERE sessions.printer_id = ?1
               AND sessions.status = 'COMPLETED'
               AND sessions.success = 1
               AND (?3 IS NULL OR sessions.session_key = ?3 OR sessions.session_key LIKE ?4 ESCAPE '\\')
               AND unixepoch(?5) - unixepoch(COALESCE(sessions.finished_at, sessions.last_seen_at)) BETWEEN 0 AND ?6
             ORDER BY unixepoch(COALESCE(sessions.finished_at, sessions.last_seen_at)) DESC,
                      sessions.last_seen_at DESC,
                      sessions.started_at DESC,
                      sessions.id DESC
             LIMIT 1",
            params![
                &printer_id,
                &spool_id,
                session_key.as_deref(),
                &session_key_prefix,
                &observed_at,
                max_age_seconds,
            ],
            |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?)),
        )
        .optional()?
    else {
        return Ok(None);
    };

    let recorded_used_grams = input.used_grams.max(0);
    conn.execute(
        "UPDATE printer_live_usage_sessions
         SET total_used_g = total_used_g + ?2,
             last_seen_at = ?3
         WHERE id = ?1",
        params![&session_id, recorded_used_grams, &observed_at],
    )?;
    conn.execute(
        "UPDATE printer_live_usage_session_spools
         SET used_g = used_g + ?2
         WHERE id = ?1",
        params![session_spool_id, recorded_used_grams],
    )?;

    Ok(Some(LiveUsageDeltaResult {
        session_id,
        recorded_used_grams,
        deferred_initial_delta: false,
    }))
}

struct LiveUsageSessionRef {
    id: String,
}

fn ensure_live_usage_session(
    conn: &Connection,
    printer_id: &str,
    session_key: &str,
    job_name: Option<&str>,
    print_type: Option<&str>,
    observed_at: Option<&str>,
) -> InventoryResult<LiveUsageSessionRef> {
    let printer_id = normalize_required_text(printer_id, "printer id")?;
    let session_key = normalize_required_text(session_key, "session key")?;
    let job_name = normalized_optional_text(job_name);
    let print_type = normalized_optional_text(print_type);
    let observed_at = normalized_optional_text(observed_at);

    let existing = find_active_live_usage_session(conn, &printer_id, &session_key)?;
    if let Some(existing) = existing {
        conn.execute(
            "UPDATE printer_live_usage_sessions
             SET job_name = COALESCE(?2, job_name),
                 print_type = COALESCE(?3, print_type),
                 last_seen_at = COALESCE(?4, datetime('now')),
                 status = CASE
                    WHEN status IN ('COMPLETED', 'FAILED') THEN status
                    ELSE 'RUNNING'
                 END
             WHERE id = ?1",
            params![&existing, job_name, print_type, observed_at],
        )?;
        return Ok(LiveUsageSessionRef { id: existing });
    }

    if session_key != LIVE_USAGE_PROVISIONAL_SESSION_KEY {
        if let Some(provisional) =
            find_active_live_usage_session(conn, &printer_id, LIVE_USAGE_PROVISIONAL_SESSION_KEY)?
        {
            let stored_session_key = next_live_usage_session_key(conn, &printer_id, &session_key)?;
            conn.execute(
                "UPDATE printer_live_usage_sessions
                 SET session_key = ?2,
                     job_name = COALESCE(?3, job_name),
                     print_type = COALESCE(?4, print_type),
                     last_seen_at = COALESCE(?5, datetime('now')),
                     status = CASE
                        WHEN status IN ('COMPLETED', 'FAILED') THEN status
                        ELSE 'RUNNING'
                     END
                 WHERE id = ?1",
                params![
                    &provisional,
                    stored_session_key,
                    job_name,
                    print_type,
                    observed_at
                ],
            )?;
            return Ok(LiveUsageSessionRef { id: provisional });
        }
    }

    let id = new_id();
    let stored_session_key = next_live_usage_session_key(conn, &printer_id, &session_key)?;
    conn.execute(
        "INSERT INTO printer_live_usage_sessions (
            id, printer_id, session_key, job_name, print_type,
            started_at, last_seen_at, status, total_used_g, source
         )
         VALUES (
            ?1, ?2, ?3, ?4, ?5,
            COALESCE(?6, datetime('now')), COALESCE(?6, datetime('now')),
            'RUNNING', 0, 'BAMBU_LIVE'
         )",
        params![
            &id,
            printer_id,
            stored_session_key,
            job_name,
            print_type,
            observed_at
        ],
    )?;
    Ok(LiveUsageSessionRef { id })
}

fn find_active_live_usage_session(
    conn: &Connection,
    printer_id: &str,
    session_key: &str,
) -> InventoryResult<Option<String>> {
    let session_key_prefix = live_usage_session_key_prefix(session_key);
    Ok(conn
        .query_row(
            "SELECT id
             FROM printer_live_usage_sessions
             WHERE printer_id = ?1
               AND status NOT IN ('COMPLETED', 'FAILED')
               AND (session_key = ?2 OR session_key LIKE ?3 ESCAPE '\\')
             ORDER BY started_at DESC, id DESC
             LIMIT 1",
            params![printer_id, session_key, session_key_prefix],
            |row| row.get(0),
        )
        .optional()?)
}

fn find_single_active_live_usage_session(
    conn: &Connection,
    printer_id: &str,
) -> InventoryResult<Option<String>> {
    let mut statement = conn.prepare(
        "SELECT id
         FROM printer_live_usage_sessions
         WHERE printer_id = ?1
           AND status NOT IN ('COMPLETED', 'FAILED')
         ORDER BY last_seen_at DESC, started_at DESC, id DESC
         LIMIT 2",
    )?;
    let rows = statement
        .query_map(params![printer_id], |row| row.get::<_, String>(0))?
        .collect::<Result<Vec<_>, _>>()?;
    Ok(if rows.len() == 1 {
        rows.into_iter().next()
    } else {
        None
    })
}

fn find_latest_live_usage_session(
    conn: &Connection,
    printer_id: &str,
    session_key: &str,
) -> InventoryResult<Option<(String, i64)>> {
    let session_key_prefix = live_usage_session_key_prefix(session_key);
    Ok(conn
        .query_row(
            "SELECT id, total_used_g
             FROM printer_live_usage_sessions
             WHERE printer_id = ?1
               AND (session_key = ?2 OR session_key LIKE ?3 ESCAPE '\\')
             ORDER BY last_seen_at DESC, started_at DESC, id DESC
             LIMIT 1",
            params![printer_id, session_key, session_key_prefix],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .optional()?)
}

fn next_live_usage_session_key(
    conn: &Connection,
    printer_id: &str,
    session_key: &str,
) -> InventoryResult<String> {
    let existing_count: i64 = conn.query_row(
        "SELECT COUNT(*)
         FROM printer_live_usage_sessions
         WHERE printer_id = ?1
           AND (session_key = ?2 OR session_key LIKE ?3 ESCAPE '\\')",
        params![
            printer_id,
            session_key,
            live_usage_session_key_prefix(session_key)
        ],
        |row| row.get(0),
    )?;
    if existing_count == 0 {
        Ok(session_key.to_string())
    } else {
        Ok(format!("{session_key}#run{}", existing_count + 1))
    }
}

fn live_usage_session_key_prefix(session_key: &str) -> String {
    format!("{}#run%", escape_like(session_key))
}

fn escape_like(value: &str) -> String {
    value
        .replace('\\', "\\\\")
        .replace('%', "\\%")
        .replace('_', "\\_")
}

fn normalize_required_text(value: &str, label: &str) -> InventoryResult<String> {
    let normalized = value.trim();
    if normalized.is_empty() {
        return Err(InventoryError::Db(format!("{label} is required")));
    }
    Ok(normalized.to_string())
}

fn normalized_optional_text(value: Option<&str>) -> Option<String> {
    value
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string)
}
