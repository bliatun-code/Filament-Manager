use crate::companion_access_recovery::Redemption;
use crate::companion_error::CompanionApiError;
use crate::companion_http::{
    cookie_value_from_headers, require_allowed_host, require_allowed_origin,
};
use crate::companion_session::{build_authenticated_session_response, random_hex_token};
use crate::companion_state::CompanionApiState;
use crate::security::hash_secret;
use axum::{
    extract::State,
    http::{
        header::{ORIGIN, SET_COOKIE, USER_AGENT},
        HeaderMap, HeaderValue,
    },
    response::{IntoResponse, Response},
    Json,
};
use serde::Deserialize;
use std::time::Instant;

const COOKIE: &str = "bfm_companion_access_request";
const COOKIE_ATTRIBUTES: &str = "HttpOnly; SameSite=Strict; Path=/api/v1/auth/recovery";

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub(crate) struct CreateAccessRequest {
    device_name: String,
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub(crate) struct ConfirmAccessRequest {
    code: String,
}

fn validate(state: &CompanionApiState, headers: &HeaderMap) -> Result<(), CompanionApiError> {
    require_allowed_host(headers, &state.runtime)?;
    require_allowed_origin(headers, &state.runtime)?;
    if headers
        .get("x-bfm-access-request")
        .and_then(|v| v.to_str().ok())
        != Some("1")
    {
        return Err(CompanionApiError::Forbidden(
            "Missing access request header".into(),
        ));
    }
    Ok(())
}
fn credential(headers: &HeaderMap) -> Result<String, CompanionApiError> {
    cookie_value_from_headers(headers, COOKIE)
        .ok_or_else(|| CompanionApiError::Unauthorized("Missing access request".into()))
}
fn with_cookie(
    mut response: Response,
    value: &str,
    max_age: u64,
) -> Result<Response, CompanionApiError> {
    response.headers_mut().append(
        SET_COOKIE,
        HeaderValue::from_str(&format!(
            "{COOKIE}={value}; Max-Age={max_age}; {COOKIE_ATTRIBUTES}"
        ))
        .map_err(|_| CompanionApiError::Internal("Invalid access request cookie".into()))?,
    );
    Ok(response)
}
pub(crate) fn access_request_scope(db_path: &str, library_id: &str) -> String {
    format!("{db_path}\n{library_id}")
}
fn browser_hint(headers: &HeaderMap) -> String {
    let ua = headers
        .get(USER_AGENT)
        .and_then(|v| v.to_str().ok())
        .unwrap_or("");
    let browser = if ua.contains("Edg/") {
        "Edge"
    } else if ua.contains("Firefox/") || ua.contains("FxiOS/") {
        "Firefox"
    } else if ua.contains("Chrome/") || ua.contains("CriOS/") {
        "Chrome"
    } else if ua.contains("Safari/") {
        "Safari"
    } else {
        "Browser"
    };
    let platform = if ua.contains("iPhone") {
        "iPhone"
    } else if ua.contains("iPad") {
        "iPad"
    } else if ua.contains("Android") {
        "Android"
    } else if ua.contains("Macintosh") {
        "Mac"
    } else if ua.contains("Windows") {
        "Windows"
    } else {
        ""
    };
    format!("{browser} {platform}").trim().to_string()
}

pub(crate) async fn handle_create_access_request(
    State(state): State<CompanionApiState>,
    headers: HeaderMap,
    Json(payload): Json<CreateAccessRequest>,
) -> Result<Response, CompanionApiError> {
    state
        .run_blocking("create browser access request", move |state| {
            validate(&state, &headers)?;
            state.with_authoritative_db(|db| {
                let scope =
                    access_request_scope(&state.db_path, &db.get_library_sync_library_id()?);
                let existing = cookie_value_from_headers(&headers, COOKIE);
                let (status, new_credential) = state.runtime.access_recovery.create(
                    &scope,
                    existing.as_deref(),
                    &payload.device_name,
                    &browser_hint(&headers),
                    Instant::now(),
                )?;
                let response = Json(status).into_response();
                if let Some(secret) = new_credential {
                    with_cookie(response, &secret, 1200)
                } else {
                    Ok(response)
                }
            })
        })
        .await
}

pub(crate) async fn handle_access_request_status(
    State(state): State<CompanionApiState>,
    headers: HeaderMap,
) -> Result<Response, CompanionApiError> {
    state
        .run_blocking("browser access request status", move |state| {
            validate(&state, &headers)?;
            let secret = credential(&headers)?;
            state.with_authoritative_db(|db| {
                let scope =
                    access_request_scope(&state.db_path, &db.get_library_sync_library_id()?);
                Ok(Json(
                    state
                        .runtime
                        .access_recovery
                        .status(&scope, &secret, Instant::now())?,
                )
                .into_response())
            })
        })
        .await
}

pub(crate) async fn handle_cancel_access_request(
    State(state): State<CompanionApiState>,
    headers: HeaderMap,
) -> Result<Response, CompanionApiError> {
    state
        .run_blocking("cancel browser access request", move |state| {
            validate(&state, &headers)?;
            let secret = credential(&headers)?;
            state.with_authoritative_db(|db| {
                let scope =
                    access_request_scope(&state.db_path, &db.get_library_sync_library_id()?);
                let status =
                    state
                        .runtime
                        .access_recovery
                        .cancel(&scope, &secret, Instant::now())?;
                with_cookie(Json(status).into_response(), "", 0)
            })
        })
        .await
}

pub(crate) async fn handle_confirm_access_request(
    State(state): State<CompanionApiState>,
    headers: HeaderMap,
    Json(payload): Json<ConfirmAccessRequest>,
) -> Result<Response, CompanionApiError> {
    state
        .run_blocking("confirm browser access request", move |state| {
            validate(&state, &headers)?;
            let secret = credential(&headers)?;
            state.with_authoritative_db(|db| {
                let scope =
                    access_request_scope(&state.db_path, &db.get_library_sync_library_id()?);
                let origin = headers.get(ORIGIN).and_then(|v| v.to_str().ok());
                match state.runtime.access_recovery.redeem(
                    &scope,
                    &secret,
                    &payload.code,
                    Instant::now(),
                    |name| {
                        let token = random_hex_token(32);
                        // Always a newly approved credential. Revoked browser records remain revoked.
                        let browser = db.create_trusted_lan_paired_browser(
                            Some(name),
                            &hash_secret(&token),
                            origin,
                        )?;
                        build_authenticated_session_response(
                            &state.sessions,
                            &state.db_path,
                            Some(browser.id),
                            Some(&token),
                            origin,
                        )
                    },
                )? {
                    Redemption::Granted(response) => with_cookie(response, "", 0),
                    Redemption::Waiting(status) => Ok(Json(status).into_response()),
                }
            })
        })
        .await
}
