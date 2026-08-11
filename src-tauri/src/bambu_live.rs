use crate::backend::filament_database::{
    BambuLiveIntegrationEntryRow, BambuLiveObservedStateRow, FilamentDatabase,
};
use crate::bambu_live_observation::{
    annotate_capture_poll_metadata, default_offline_state, merge_idle_observation,
    merge_print_payload, now_iso_string, MQTT_BURST_SETTLE_MS, MQTT_TIMEOUT_SECS,
};
use crate::bambu_live_persistence::persist_observation;
use crate::bambu_live_sync::enrich_with_match_status;
use crate::bambu_mqtt::{
    build_connect_packet, build_subscribe_packet, parse_publish_payload, read_mqtt_packet,
};
use crate::credential_store::{CredentialKey, CredentialStore};
use crate::printer_bambu_discovery_commands::try_auto_recover_bambu_live_host;
use crate::state::AppState;
use std::collections::HashMap;
use std::io::Write;
use std::net::{SocketAddr, TcpStream, ToSocketAddrs};
use std::sync::{Mutex, OnceLock};
use std::time::{Duration, Instant};
use zeroize::Zeroize;

const BAMBU_MQTT_PORT: u16 = 8883;
const OBSERVER_INTERVAL_SECS: u64 = 20;
const MAX_CONCURRENT_PRINTER_POLLS: usize = 3;
const AUTO_RECOVERY_COOLDOWN: Duration = Duration::from_secs(5 * 60);

static AUTO_RECOVERY_ATTEMPTS: OnceLock<Mutex<HashMap<String, Instant>>> = OnceLock::new();

#[path = "bambu_tls_identity.rs"]
pub(crate) mod tls_identity;

#[path = "bambu_live_security.rs"]
mod live_security;
#[cfg(test)]
pub(crate) use live_security::format_mqtt_connect_errors_for_platform;
use live_security::{
    format_mqtt_connect_errors, has_live_observation, identity_probe_tls_connector,
    is_mqtt_read_timeout, record_observed_tls_identity, run_after_trusted_identity,
    BambuLivePollError,
};
pub(crate) use live_security::{probe_printer_tls_identity, trusted_pin_from_config};

pub async fn run_live_observer(state: AppState) {
    loop {
        if let Err(error) = poll_enabled_integrations(&state).await {
            eprintln!("Bambu live observer error: {error}");
        }
        tokio::time::sleep(Duration::from_secs(OBSERVER_INTERVAL_SECS)).await;
    }
}

async fn poll_enabled_integrations(state: &AppState) -> Result<(), String> {
    let load_path = state.db_path.clone();
    let (credential_profile_id, integrations) = tauri::async_runtime::spawn_blocking(move || {
        let db = FilamentDatabase::open(&load_path).map_err(|error| error.to_string())?;
        let credential_profile_id = db
            .get_or_create_credential_store_profile_id()
            .map_err(|error| error.to_string())?;
        let integrations = db
            .list_bambu_live_integrations()
            .map_err(|error| error.to_string())?;
        Ok::<_, String>((credential_profile_id, integrations))
    })
    .await
    .map_err(|join_error| format!("live integration list join failed: {join_error}"))??;
    let enabled_integrations = integrations
        .into_iter()
        .filter(|entry| entry.config.enabled)
        .collect::<Vec<_>>();
    let poll_path = state.db_path.clone();
    // Keep the credential namespace immutable for this poll batch. A restore or
    // reset may switch the app to another library profile while an older TLS
    // connection is still in flight; that connection must never follow the
    // mutable app-level profile to a newer secret.
    let poll_credentials = state
        .credentials
        .scoped_to_profile_id(&credential_profile_id)
        .map_err(|error| error.to_string())?;
    let errors = run_bounded_blocking_polls(
        enabled_integrations,
        MAX_CONCURRENT_PRINTER_POLLS,
        move |entry| poll_single_integration(&poll_path, &poll_credentials, entry),
    )
    .await;
    for error in errors {
        eprintln!("Bambu live integration poll failed: {error}");
    }
    Ok(())
}

async fn run_bounded_blocking_polls<T, F>(
    entries: Vec<T>,
    concurrency_limit: usize,
    poll: F,
) -> Vec<String>
where
    T: Send + 'static,
    F: Fn(T) -> Result<(), String> + Clone + Send + 'static,
{
    let mut pending = entries.into_iter();
    let mut polls = tokio::task::JoinSet::new();
    let concurrency_limit = concurrency_limit.max(1);

    for _ in 0..concurrency_limit {
        let Some(entry) = pending.next() else {
            break;
        };
        let poll_task = poll.clone();
        drop(polls.spawn_blocking(move || poll_task(entry)));
    }

    let mut errors = Vec::new();
    loop {
        let next_result = polls.join_next().await;
        let Some(result) = next_result else {
            break;
        };
        match result {
            Ok(Ok(())) => {}
            Ok(Err(error)) => errors.push(error),
            Err(join_error) => errors.push(format!("poll task failed: {join_error}")),
        }
        let next_entry = pending.next();
        if let Some(entry) = next_entry {
            let poll_task = poll.clone();
            drop(polls.spawn_blocking(move || poll_task(entry)));
        }
    }
    errors
}

fn poll_single_integration(
    db_path: &str,
    credentials: &CredentialStore,
    mut entry: BambuLiveIntegrationEntryRow,
) -> Result<(), String> {
    let host = entry
        .config
        .host
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .ok_or_else(|| "missing host".to_string())?;
    let printer_serial = entry
        .config
        .printer_serial
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .ok_or_else(|| "missing printer serial".to_string())?;
    let trusted_pin = trusted_pin_from_config(printer_serial, entry.config.tls_identity.as_ref())?;

    let previous_state = entry.config.observed_state.clone();
    let observed = match observe_printer_state(
        host,
        printer_serial,
        trusted_pin.as_ref(),
        credentials,
        &entry.printer_id,
        entry.config.access_code_binding_id.as_deref(),
    ) {
        Ok((raw, tls_identity)) => {
            record_observed_tls_identity(&mut entry, &tls_identity);
            let db = FilamentDatabase::open(db_path).map_err(|error| error.to_string())?;
            let merged = merge_idle_observation(previous_state.as_ref(), raw);
            enrich_with_match_status(&db, &entry.printer_id, merged)
                .map_err(|error| error.to_string())?
        }
        Err(error) => {
            if error.observed_identity.is_none()
                && trusted_pin.is_some()
                && claim_auto_recovery_attempt(&entry.printer_id, Instant::now())
            {
                match try_auto_recover_bambu_live_host(db_path, &entry.printer_id, printer_serial) {
                    Ok(Some(recovered_host)) => {
                        eprintln!(
                            "Automatically recovered Bambu printer {} at {recovered_host}",
                            entry.printer_id
                        );
                        return Ok(());
                    }
                    Ok(None) => {}
                    Err(recovery_error) => eprintln!(
                        "Automatic Bambu address recovery failed for {}: {recovery_error}",
                        entry.printer_id
                    ),
                }
            }
            let observed_tls_identity = if let Some(tls_identity) = error.observed_identity.as_ref()
            {
                record_observed_tls_identity(&mut entry, tls_identity);
                entry.config.tls_identity.as_ref()
            } else {
                None
            };
            let mut next = previous_state.unwrap_or_else(default_offline_state);
            next.online = false;
            next.mqtt_connected = false;
            next.raw_status_note = Some(error.message.clone());
            persist_observation(
                db_path,
                &entry,
                Some(next.clone()),
                Some(error.message),
                observed_tls_identity,
                Some(&next),
                None,
            )?;
            return Ok(());
        }
    };

    persist_observation(
        db_path,
        &entry,
        Some(observed.clone()),
        None,
        entry.config.tls_identity.as_ref(),
        previous_state.as_ref(),
        Some(&observed),
    )?;
    Ok(())
}

fn claim_auto_recovery_attempt(printer_id: &str, now: Instant) -> bool {
    let attempts = AUTO_RECOVERY_ATTEMPTS.get_or_init(|| Mutex::new(HashMap::new()));
    let Ok(mut attempts) = attempts.lock() else {
        return false;
    };
    if attempts.get(printer_id).is_some_and(|last_attempt| {
        now.saturating_duration_since(*last_attempt) < AUTO_RECOVERY_COOLDOWN
    }) {
        return false;
    }
    attempts.insert(printer_id.to_string(), now);
    true
}

fn observe_printer_state(
    host: &str,
    printer_serial: &str,
    trusted_pin: Option<&tls_identity::BambuTlsPin>,
    credentials: &CredentialStore,
    printer_id: &str,
    access_code_binding_id: Option<&str>,
) -> Result<(BambuLiveObservedStateRow, tls_identity::BambuTlsIdentity), BambuLivePollError> {
    let tcp_stream =
        connect_printer_mqtt_tcp(host).map_err(BambuLivePollError::without_identity)?;
    tcp_stream
        .set_read_timeout(Some(Duration::from_secs(MQTT_TIMEOUT_SECS)))
        .map_err(|error| {
            BambuLivePollError::without_identity(format!(
                "failed to set MQTT read timeout: {error}"
            ))
        })?;
    tcp_stream
        .set_write_timeout(Some(Duration::from_secs(MQTT_TIMEOUT_SECS)))
        .map_err(|error| {
            BambuLivePollError::without_identity(format!(
                "failed to set MQTT write timeout: {error}"
            ))
        })?;

    let connector = identity_probe_tls_connector().map_err(BambuLivePollError::without_identity)?;
    let mut stream = connector.connect(host, tcp_stream).map_err(|error| {
        BambuLivePollError::without_identity(format!("failed to establish TLS session: {error}"))
    })?;
    let peer_certificate = stream.peer_certificate().map_err(|error| {
        BambuLivePollError::without_identity(format!(
            "failed to read printer TLS certificate: {error}"
        ))
    })?;
    let peer_certificate = peer_certificate.ok_or_else(|| {
        BambuLivePollError::without_identity(
            "printer TLS session did not provide a leaf certificate".to_string(),
        )
    })?;
    let peer_leaf_der = peer_certificate.to_der().map_err(|error| {
        BambuLivePollError::without_identity(format!(
            "failed to read printer TLS certificate: {error}"
        ))
    })?;
    let observed_identity =
        tls_identity::identity_from_leaf_der(&peer_leaf_der).map_err(|error| {
            BambuLivePollError::without_identity(format!(
                "failed to inspect printer TLS identity: {error}"
            ))
        })?;

    // The access code is intentionally loaded only after this exact TLS
    // connection has passed the saved SPKI and printer-serial checks.
    let trust_decision =
        tls_identity::assess_trust(printer_serial, trusted_pin, &observed_identity)
            .map_err(BambuLivePollError::without_identity)?;
    let (access_code, observed_identity) = run_after_trusted_identity(trust_decision, || {
        let access_code_binding_id = access_code_binding_id.ok_or_else(|| {
            "Printer access code has no secure credential binding; re-enter it in Settings."
                .to_string()
        })?;
        let credential_key =
            CredentialKey::bambu_access_code(printer_id, access_code_binding_id)
                .map_err(|error| format!("failed to identify the printer credential: {error}"))?;
        credentials
            .get(&credential_key)
            .map_err(|error| format!("failed to read the printer access code: {error}"))?
            .ok_or_else(|| "Printer access code is not configured in secure storage.".to_string())
    })?;
    let access_code_text = access_code.expose_utf8().map_err(|error| {
        BambuLivePollError::with_identity(
            format!("printer access code could not be decoded: {error}"),
            observed_identity.clone(),
        )
    })?;

    let client_id = format!("bfm-{}", std::process::id());
    let mut connect_packet = build_connect_packet(&client_id, "bblp", access_code_text);
    drop(access_code);
    let connect_result = tls_identity::write_connect_after_trust(
        &mut stream,
        printer_serial,
        trusted_pin,
        &peer_leaf_der,
        &connect_packet,
    );
    connect_packet.zeroize();
    connect_result.map_err(|error| {
        BambuLivePollError::with_identity(error.to_string(), observed_identity.clone())
    })?;
    let (packet_type, packet_payload) = read_mqtt_packet(&mut stream)
        .map_err(|error| BambuLivePollError::with_identity(error, observed_identity.clone()))?;
    if packet_type != 0x20 || packet_payload.len() < 2 || packet_payload[1] != 0x00 {
        return Err(BambuLivePollError::with_identity(
            "printer rejected MQTT connection",
            observed_identity,
        ));
    }

    let topic = format!("device/{printer_serial}/report");
    let subscribe_packet = build_subscribe_packet(&topic);
    stream.write_all(&subscribe_packet).map_err(|error| {
        BambuLivePollError::with_identity(
            format!("failed to send MQTT subscribe packet: {error}"),
            observed_identity.clone(),
        )
    })?;
    let (packet_type, _) = read_mqtt_packet(&mut stream)
        .map_err(|error| BambuLivePollError::with_identity(error, observed_identity.clone()))?;
    if packet_type != 0x90 {
        return Err(BambuLivePollError::with_identity(
            "printer rejected MQTT subscription",
            observed_identity,
        ));
    }

    let started = std::time::Instant::now();
    let mut merged = default_offline_state();
    merged.online = true;
    merged.mqtt_connected = true;
    let mut received_live_payload = false;
    let mut supported_message_count = 0_i64;
    let mut first_payload_at: Option<String> = None;
    let mut last_payload_at: Option<String> = None;

    while started.elapsed() < Duration::from_secs(MQTT_TIMEOUT_SECS) {
        let (packet_type, payload) = match read_mqtt_packet(&mut stream) {
            Ok(packet) => packet,
            Err(error) if is_mqtt_read_timeout(&error) => {
                if !received_live_payload {
                    merged.raw_status_note =
                        Some("Connected, waiting for the next MQTT status burst.".to_string());
                }
                break;
            }
            Err(error) => {
                return Err(BambuLivePollError::with_identity(error, observed_identity));
            }
        };
        if packet_type >> 4 != 3 {
            continue;
        }
        if let Some(message) = parse_publish_payload(&payload)
            .map_err(|error| BambuLivePollError::with_identity(error, observed_identity.clone()))?
        {
            let received_at = now_iso_string();
            let previous_last_seen_at = merged.last_seen_at.clone();
            merged.last_seen_at = Some(received_at.clone());
            if merge_print_payload(&mut merged, &message) {
                supported_message_count += 1;
                if first_payload_at.is_none() {
                    first_payload_at = Some(received_at.clone());
                }
                last_payload_at = Some(received_at);
                if has_live_observation(&merged) && !received_live_payload {
                    received_live_payload = true;
                    stream
                        .get_ref()
                        .set_read_timeout(Some(Duration::from_millis(MQTT_BURST_SETTLE_MS)))
                        .map_err(|error| {
                            BambuLivePollError::with_identity(
                                format!("failed to set MQTT burst settle timeout: {error}"),
                                observed_identity.clone(),
                            )
                        })?;
                }
            } else {
                merged.last_seen_at = previous_last_seen_at;
            }
        }
    }

    if merged.last_seen_at.is_none() {
        merged.raw_status_note =
            Some("Connected, but no live MQTT status arrived during this poll.".to_string());
    }
    annotate_capture_poll_metadata(
        &mut merged,
        supported_message_count,
        first_payload_at.as_deref(),
        last_payload_at.as_deref(),
        started.elapsed().as_millis().min(i64::MAX as u128) as i64,
    );
    Ok((merged, observed_identity))
}

pub(crate) fn connect_printer_mqtt_tcp(host: &str) -> Result<TcpStream, String> {
    let addresses = resolve_printer_mqtt_addresses(host)?;
    let mut attempts = Vec::new();

    for address in addresses {
        match TcpStream::connect_timeout(&address, Duration::from_secs(5)) {
            Ok(stream) => return Ok(stream),
            Err(error) => attempts.push((address, error)),
        }
    }

    Err(format_mqtt_connect_errors(&attempts))
}

fn resolve_printer_mqtt_addresses(host: &str) -> Result<Vec<SocketAddr>, String> {
    let addresses = (host, BAMBU_MQTT_PORT)
        .to_socket_addrs()
        .map_err(|error| format!("failed to resolve printer host: {error}"))?
        .collect::<Vec<_>>();

    if addresses.is_empty() {
        return Err("no printer address resolved".to_string());
    }

    Ok(addresses)
}

#[cfg(test)]
use crate::bambu_live_observation::{
    is_live_print_running, merge_tray_payload, merge_tray_snapshots,
};
#[cfg(test)]
use crate::bambu_live_persistence::log_state_changes;

#[cfg(test)]
#[path = "bambu_live_architecture_tests.rs"]
mod architecture_tests;

#[cfg(test)]
#[path = "bambu_live_tls_identity_tests.rs"]
mod tls_identity_tests;

#[cfg(test)]
#[path = "bambu_live_tests.rs"]
mod tests;
