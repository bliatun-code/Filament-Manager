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
use crate::state::AppState;
use native_tls::TlsConnector;
use std::io::Write;
use std::net::{SocketAddr, TcpStream, ToSocketAddrs};
use std::time::Duration;

const BAMBU_MQTT_PORT: u16 = 8883;
const OBSERVER_INTERVAL_SECS: u64 = 20;
const MAX_CONCURRENT_PRINTER_POLLS: usize = 3;

pub async fn run_live_observer(state: AppState) {
    loop {
        if let Err(error) = poll_enabled_integrations(&state.db_path).await {
            eprintln!("Bambu live observer error: {error}");
        }
        tokio::time::sleep(Duration::from_secs(OBSERVER_INTERVAL_SECS)).await;
    }
}

async fn poll_enabled_integrations(db_path: &str) -> Result<(), String> {
    let load_path = db_path.to_string();
    let integrations = tauri::async_runtime::spawn_blocking(move || {
        FilamentDatabase::open(&load_path)
            .and_then(|db| db.list_bambu_live_integrations())
            .map_err(|error| error.to_string())
    })
    .await
    .map_err(|join_error| format!("live integration list join failed: {join_error}"))??;
    let enabled_integrations = integrations
        .into_iter()
        .filter(|entry| entry.config.enabled)
        .collect::<Vec<_>>();
    let poll_path = db_path.to_string();
    let errors = run_bounded_blocking_polls(
        enabled_integrations,
        MAX_CONCURRENT_PRINTER_POLLS,
        move |entry| poll_single_integration(&poll_path, entry),
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
        polls.spawn_blocking(move || poll_task(entry));
    }

    let mut errors = Vec::new();
    while let Some(result) = polls.join_next().await {
        match result {
            Ok(Ok(())) => {}
            Ok(Err(error)) => errors.push(error),
            Err(join_error) => errors.push(format!("poll task failed: {join_error}")),
        }
        if let Some(entry) = pending.next() {
            let poll_task = poll.clone();
            polls.spawn_blocking(move || poll_task(entry));
        }
    }
    errors
}

fn poll_single_integration(
    db_path: &str,
    entry: BambuLiveIntegrationEntryRow,
) -> Result<(), String> {
    let host = entry
        .config
        .host
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .ok_or_else(|| "missing host".to_string())?;
    let access_code = entry
        .config
        .access_code
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .ok_or_else(|| "missing access code".to_string())?;
    let printer_serial = entry
        .config
        .printer_serial
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .ok_or_else(|| "missing printer serial".to_string())?;

    let previous_state = entry.config.observed_state.clone();
    let observed = match observe_printer_state(host, access_code, printer_serial) {
        Ok(raw) => {
            let db = FilamentDatabase::open(db_path).map_err(|error| error.to_string())?;
            let merged = merge_idle_observation(previous_state.as_ref(), raw);
            enrich_with_match_status(&db, &entry.printer_id, merged)
                .map_err(|error| error.to_string())?
        }
        Err(error) => {
            let mut next = previous_state.unwrap_or_else(default_offline_state);
            next.online = false;
            next.mqtt_connected = false;
            next.raw_status_note = Some(error.clone());
            persist_observation(
                db_path,
                &entry,
                Some(next.clone()),
                Some(error),
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
        previous_state.as_ref(),
        Some(&observed),
    )?;
    Ok(())
}

fn observe_printer_state(
    host: &str,
    access_code: &str,
    printer_serial: &str,
) -> Result<BambuLiveObservedStateRow, String> {
    let tcp_stream = connect_printer_mqtt_tcp(host)?;
    tcp_stream
        .set_read_timeout(Some(Duration::from_secs(MQTT_TIMEOUT_SECS)))
        .map_err(|error| format!("failed to set MQTT read timeout: {error}"))?;
    tcp_stream
        .set_write_timeout(Some(Duration::from_secs(MQTT_TIMEOUT_SECS)))
        .map_err(|error| format!("failed to set MQTT write timeout: {error}"))?;

    let connector = TlsConnector::builder()
        .danger_accept_invalid_certs(true)
        .build()
        .map_err(|error| format!("failed to prepare TLS connector: {error}"))?;
    let mut stream = connector
        .connect(host, tcp_stream)
        .map_err(|error| format!("failed to establish TLS session: {error}"))?;

    let client_id = format!("bfm-{}", std::process::id());
    let connect_packet = build_connect_packet(&client_id, "bblp", access_code);
    stream
        .write_all(&connect_packet)
        .map_err(|error| format!("failed to send MQTT connect packet: {error}"))?;
    let (packet_type, packet_payload) = read_mqtt_packet(&mut stream)?;
    if packet_type != 0x20 || packet_payload.len() < 2 || packet_payload[1] != 0x00 {
        return Err("printer rejected MQTT connection".to_string());
    }

    let topic = format!("device/{printer_serial}/report");
    let subscribe_packet = build_subscribe_packet(&topic);
    stream
        .write_all(&subscribe_packet)
        .map_err(|error| format!("failed to send MQTT subscribe packet: {error}"))?;
    let (packet_type, _) = read_mqtt_packet(&mut stream)?;
    if packet_type != 0x90 {
        return Err("printer rejected MQTT subscription".to_string());
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
            Err(error) => return Err(error),
        };
        if packet_type >> 4 != 3 {
            continue;
        }
        if let Some(message) = parse_publish_payload(&payload)? {
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
                            format!("failed to set MQTT burst settle timeout: {error}")
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
    Ok(merged)
}

fn connect_printer_mqtt_tcp(host: &str) -> Result<TcpStream, String> {
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

fn format_mqtt_connect_errors(attempts: &[(SocketAddr, std::io::Error)]) -> String {
    format_mqtt_connect_errors_for_platform(attempts, cfg!(target_os = "macos"))
}

fn format_mqtt_connect_errors_for_platform(
    attempts: &[(SocketAddr, std::io::Error)],
    is_macos: bool,
) -> String {
    let base = match attempts {
        [] => "failed to connect to printer MQTT: no printer address resolved".to_string(),
        [(address, error)] => format!("failed to connect to printer MQTT at {address}: {error}"),
        _ => {
            let details = attempts
                .iter()
                .map(|(address, error)| format!("{address}: {error}"))
                .collect::<Vec<_>>()
                .join("; ");
            format!(
                "failed to connect to printer MQTT on all {} resolved addresses: {details}",
                attempts.len()
            )
        }
    };

    if is_macos
        && !attempts.is_empty()
        && attempts
            .iter()
            .all(|(_, error)| looks_like_macos_local_network_block(error))
    {
        return format!(
            "{base}. macOS may be blocking Filament Manager's Local Network access. Allow Filament Manager in System Settings > Privacy & Security > Local Network, then restart the app. If it is not listed, launch the app from Applications and retry the printer connection."
        );
    }
    base
}

fn looks_like_macos_local_network_block(error: &std::io::Error) -> bool {
    matches!(error.raw_os_error(), Some(51 | 65))
        || error
            .to_string()
            .to_lowercase()
            .contains("no route to host")
}

fn has_live_observation(state: &BambuLiveObservedStateRow) -> bool {
    !state.trays.is_empty()
        || state.gcode_state.is_some()
        || state.print_type.is_some()
        || state.subtask_id.is_some()
        || state.subtask_name.is_some()
        || state.progress_percent.is_some()
        || state.remaining_minutes.is_some()
        || state.prepare_percent.is_some()
        || state.print_stage.is_some()
        || state.print_error_code.is_some()
        || state.job_state_code.is_some()
        || state.nozzle_temp_c.is_some()
        || state.bed_temp_c.is_some()
        || state.active_ams_index.is_some()
        || state.active_tray_index.is_some()
        || state.ams_reading_bits.is_some()
        || state.ams_exist_bits.is_some()
        || state.ams_read_done_bits.is_some()
        || state.ams_bambu_bits.is_some()
        || state.ams_status_code.is_some()
}

fn is_mqtt_read_timeout(error: &str) -> bool {
    error.contains("os error 35")
        || error.contains("timed out")
        || error.contains("Resource temporarily unavailable")
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
#[path = "bambu_live_tests.rs"]
mod tests;
