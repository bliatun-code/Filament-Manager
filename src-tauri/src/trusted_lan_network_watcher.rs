use crate::companion_api;
use crate::state::AppState;
use crate::trusted_lan_interfaces::current_trusted_lan_interface_selection;
use crate::with_db;
use std::time::Duration;

const TRUSTED_LAN_NETWORK_REFRESH_SECONDS: u64 = 5;
const TRUSTED_LAN_LOCAL_NAME_RETRY_TICKS: u8 = 6;

pub(crate) async fn run_trusted_lan_network_watcher(
    state: AppState,
    mut shutdown: tokio::sync::watch::Receiver<bool>,
) {
    let mut local_name_retry_tick = 0_u8;
    loop {
        if *shutdown.borrow() {
            return;
        }
        tokio::select! {
            _ = tokio::time::sleep(Duration::from_secs(TRUSTED_LAN_NETWORK_REFRESH_SECONDS)) => {}
            changed = shutdown.changed() => {
                if changed.is_err() || *shutdown.borrow() {
                    return;
                }
            }
        }
        if *shutdown.borrow() {
            return;
        }
        if let Err(error) = refresh_trusted_lan_binding_once(&state).await {
            eprintln!("Trusted-LAN network refresh failed: {error}");
        }
        if *shutdown.borrow() {
            return;
        }
        local_name_retry_tick = local_name_retry_tick.saturating_add(1);
        if local_name_retry_tick >= TRUSTED_LAN_LOCAL_NAME_RETRY_TICKS {
            local_name_retry_tick = 0;
            if state.companion.trusted_lan.enabled() && !state.companion.trusted_lan.running() {
                if let Err(error) = companion_api::reconcile_trusted_lan_server(state.clone()).await
                {
                    eprintln!("Trusted-LAN server retry failed: {error}");
                }
                continue;
            }
            if let Err(error) =
                companion_api::retry_trusted_lan_local_service_advertisement(&state).await
            {
                eprintln!("Companion stable local address retry failed: {error}");
            }
        }
    }
}

pub(crate) async fn refresh_trusted_lan_binding_once(state: &AppState) -> Result<bool, String> {
    if !state.companion.trusted_lan.enabled() {
        return Ok(false);
    }

    let Some((interface_name, previous_address)) = state.companion.trusted_lan.selected_interface()
    else {
        return Ok(false);
    };
    let observed_name = interface_name.clone();
    let observed_address = previous_address.clone();
    let Some((current_name, current_address)) = tauri::async_runtime::spawn_blocking(move || {
        current_trusted_lan_interface_selection(&observed_name, &observed_address)
    })
    .await
    .map_err(|_| "Trusted-LAN interface refresh did not complete.".to_string())?
    else {
        return Ok(false);
    };
    if current_address == previous_address {
        return Ok(false);
    }

    let _reconcile_guard = state.companion.trusted_lan.lock_reconcile().await;

    let current_runtime_selection = state.companion.trusted_lan.selected_interface();
    if current_runtime_selection.as_ref()
        != Some(&(interface_name.clone(), previous_address.clone()))
    {
        return Ok(false);
    }

    let database_state = state.clone();
    let persisted_name = current_name.clone();
    let persisted_address = current_address.clone();
    let settings = tauri::async_runtime::spawn_blocking(move || {
        with_db(&database_state, |db| {
            let mut settings = db.get_trusted_lan_settings()?;
            let matches_observed_config = settings.enabled
                && settings.selected_interface_name.as_deref() == Some(interface_name.as_str())
                && settings.selected_interface_address.as_deref()
                    == Some(previous_address.as_str());
            if !matches_observed_config {
                return Ok(None);
            }
            settings.selected_interface_name = Some(persisted_name);
            settings.selected_interface_address = Some(persisted_address);
            db.save_trusted_lan_settings(&settings)?;
            Ok(Some(settings))
        })
    })
    .await
    .map_err(|_| "Trusted-LAN database refresh did not complete.".to_string())??;
    let Some(settings) = settings else {
        return Ok(false);
    };

    state.companion.trusted_lan.apply_config(
        settings.enabled,
        Some((current_name, current_address)),
        settings.listen_port,
    );
    companion_api::reconcile_trusted_lan_server_locked(state).await?;
    Ok(true)
}
