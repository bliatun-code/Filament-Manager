use crate::backend::database_result::InventoryError;
use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use axum::Json;
use serde::Serialize;

#[derive(Debug)]
pub(crate) enum CompanionApiError {
    BadRequest(String),
    CodedBadRequest(&'static str),
    Unauthorized(String),
    Forbidden(String),
    NotFound(String),
    Internal(String),
}

#[derive(Serialize)]
struct ErrorResponse {
    ok: bool,
    code: &'static str,
    message: String,
    safe_detail: Option<String>,
    diagnostic_id: Option<String>,
}

impl From<InventoryError> for CompanionApiError {
    fn from(error: InventoryError) -> Self {
        match error {
            InventoryError::NotFound => CompanionApiError::NotFound("Record not found".to_string()),
            InventoryError::InvalidOperation { code, .. } => {
                CompanionApiError::CodedBadRequest(code)
            }
            InventoryError::Db(message) => CompanionApiError::Internal(message),
        }
    }
}

impl IntoResponse for CompanionApiError {
    fn into_response(self) -> Response {
        let (status, code, message, diagnostic_id) = match self {
            CompanionApiError::BadRequest(detail) => {
                let code = match detail.as_str() {
                    "Loaded spools use printer-slot actions instead of manual status/location edits" => {
                        "inventory.spool.loaded_edit_blocked"
                    }
                    "Loaned-out spools use the companion loan return flow instead of manual status/location edits" => {
                        "inventory.spool.loaned_edit_blocked"
                    }
                    "Browser status/location edits are limited to IN_STOCK, EMPTY, or LOST" => {
                        "inventory.spool.status_edit_limited"
                    }
                    _ => "common.invalid_request",
                };
                (
                    StatusCode::BAD_REQUEST,
                    code,
                    "The request could not be completed.".to_string(),
                    None,
                )
            }
            CompanionApiError::CodedBadRequest(code) => (
                StatusCode::BAD_REQUEST,
                code,
                "The request could not be completed.".to_string(),
                None,
            ),
            CompanionApiError::Unauthorized(detail) => {
                drop(detail);
                (
                    StatusCode::UNAUTHORIZED,
                    "common.unauthorized",
                    "Authentication is required.".to_string(),
                    None,
                )
            }
            CompanionApiError::Forbidden(detail) => {
                drop(detail);
                (
                    StatusCode::FORBIDDEN,
                    "common.forbidden",
                    "This action is not allowed.".to_string(),
                    None,
                )
            }
            CompanionApiError::NotFound(detail) => {
                drop(detail);
                (
                    StatusCode::NOT_FOUND,
                    "common.not_found",
                    "The requested record was not found.".to_string(),
                    None,
                )
            }
            CompanionApiError::Internal(detail) => {
                let diagnostic_id = crate::app_error::next_diagnostic_id();
                let _ = crate::app_error::operational_log::record_operational_event(
                    crate::app_error::operational_log::OperationalLogLevel::Error,
                    crate::app_error::operational_log::OperationalLogContext::CompanionApiFailure,
                    Some(&diagnostic_id),
                );
                eprintln!("[{diagnostic_id}] Companion API internal error: {detail}");
                (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    "common.internal",
                    "An internal error occurred.".to_string(),
                    Some(diagnostic_id),
                )
            }
        };
        (
            status,
            Json(ErrorResponse {
                ok: false,
                code,
                message,
                safe_detail: None,
                diagnostic_id,
            }),
        )
            .into_response()
    }
}
