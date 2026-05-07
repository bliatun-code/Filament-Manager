use crate::backend::filament_database::InventoryError;
use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use axum::Json;
use serde::Serialize;

#[derive(Debug)]
pub(crate) enum CompanionApiError {
    BadRequest(String),
    Unauthorized(String),
    Forbidden(String),
    NotFound(String),
    Internal(String),
}

#[derive(Serialize)]
struct ErrorResponse {
    ok: bool,
    message: String,
}

impl From<InventoryError> for CompanionApiError {
    fn from(error: InventoryError) -> Self {
        match error {
            InventoryError::NotFound => CompanionApiError::NotFound("Record not found".to_string()),
            InventoryError::InvalidOperation(message) => CompanionApiError::BadRequest(message),
            InventoryError::Db(message) => CompanionApiError::Internal(message),
        }
    }
}

impl IntoResponse for CompanionApiError {
    fn into_response(self) -> Response {
        let (status, message) = match self {
            CompanionApiError::BadRequest(message) => (StatusCode::BAD_REQUEST, message),
            CompanionApiError::Unauthorized(message) => (StatusCode::UNAUTHORIZED, message),
            CompanionApiError::Forbidden(message) => (StatusCode::FORBIDDEN, message),
            CompanionApiError::NotFound(message) => (StatusCode::NOT_FOUND, message),
            CompanionApiError::Internal(message) => (StatusCode::INTERNAL_SERVER_ERROR, message),
        };
        (status, Json(ErrorResponse { ok: false, message })).into_response()
    }
}
