use crate::backend::database_result::InventoryError;
use serde::Serialize;
use std::sync::atomic::{AtomicU64, Ordering};

pub(crate) mod application_diagnostics;
pub(crate) mod operational_log;

static NEXT_DIAGNOSTIC_ID: AtomicU64 = AtomicU64::new(1);

#[derive(Debug, Serialize)]
struct CommandErrorEnvelope {
    code: &'static str,
    safe_detail: Option<String>,
    diagnostic_id: Option<String>,
}

pub(crate) fn next_diagnostic_id() -> String {
    let sequence = NEXT_DIAGNOSTIC_ID.fetch_add(1, Ordering::Relaxed);
    let millis = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis();
    format!("fm-{millis:x}-{sequence:x}")
}

fn encode_envelope(envelope: &CommandErrorEnvelope) -> String {
    serde_json::to_string(envelope).unwrap_or_else(|_| {
        r#"{"code":"common.internal","safe_detail":null,"diagnostic_id":null}"#.to_string()
    })
}

pub(crate) fn coded_command_error(code: &'static str) -> String {
    encode_envelope(&CommandErrorEnvelope {
        code,
        safe_detail: None,
        diagnostic_id: None,
    })
}

pub(crate) fn internal_command_error(context: &str, diagnostic: impl std::fmt::Display) -> String {
    diagnostic_command_error(
        "common.internal",
        context,
        diagnostic,
        operational_log::OperationalLogContext::DesktopCommandFailure,
    )
}

pub(crate) fn document_command_error(
    code: &'static str,
    context: &str,
    diagnostic: impl std::fmt::Display,
) -> String {
    diagnostic_command_error(
        code,
        context,
        diagnostic,
        operational_log::OperationalLogContext::DocumentCommandFailure,
    )
}

fn diagnostic_command_error(
    code: &'static str,
    context: &str,
    diagnostic: impl std::fmt::Display,
    log_context: operational_log::OperationalLogContext,
) -> String {
    let diagnostic_id = next_diagnostic_id();
    let _ = operational_log::record_operational_event(
        operational_log::OperationalLogLevel::Error,
        log_context,
        Some(&diagnostic_id),
    );
    eprintln!("[{diagnostic_id}] {context}: {diagnostic}");
    encode_envelope(&CommandErrorEnvelope {
        code,
        safe_detail: None,
        diagnostic_id: Some(diagnostic_id),
    })
}

pub(crate) fn document_inventory_error_to_command_string(error: InventoryError) -> String {
    match error {
        InventoryError::NotFound => coded_command_error("common.not_found"),
        InventoryError::InvalidOperation { code, message } => {
            eprintln!("Document operation rejected ({code}): {message}");
            coded_command_error(code)
        }
        InventoryError::Db(message) => {
            document_command_error("common.internal", "Document database error", message)
        }
    }
}

pub(crate) fn inventory_error_to_command_string(error: InventoryError) -> String {
    match error {
        InventoryError::NotFound => coded_command_error("common.not_found"),
        InventoryError::InvalidOperation { code, message } => {
            eprintln!("Inventory operation rejected ({code}): {message}");
            coded_command_error(code)
        }
        InventoryError::Db(message) => internal_command_error("Inventory database error", message),
    }
}

#[cfg(test)]
mod tests {
    use super::{
        document_inventory_error_to_command_string, inventory_error_to_command_string,
        CommandErrorEnvelope,
    };
    use crate::backend::database_result::InventoryError;

    #[test]
    fn inventory_errors_use_stable_serialized_codes_without_raw_details() {
        let encoded = inventory_error_to_command_string(InventoryError::InvalidOperation {
            code: "inventory.spool.active_loan",
            message: "private diagnostic detail".to_string(),
        });
        let parsed: serde_json::Value = serde_json::from_str(&encoded).expect("valid envelope");
        assert_eq!(parsed["code"], "inventory.spool.active_loan");
        assert_eq!(parsed["safe_detail"], serde_json::Value::Null);
        assert!(!encoded.contains("private diagnostic detail"));

        let _type_check = std::mem::size_of::<CommandErrorEnvelope>();
    }

    #[test]
    fn returned_loan_conflicts_keep_the_stable_code_in_desktop_envelopes() {
        let encoded = inventory_error_to_command_string(InventoryError::InvalidOperation {
            code: "loans.already_returned",
            message: "loan already returned with different return details".to_string(),
        });
        let parsed: serde_json::Value = serde_json::from_str(&encoded).expect("valid envelope");
        assert_eq!(parsed["code"], "loans.already_returned");
        assert_eq!(parsed["safe_detail"], serde_json::Value::Null);
        assert_eq!(parsed["diagnostic_id"], serde_json::Value::Null);
        assert!(!encoded.contains("different return details"));
    }

    #[test]
    fn document_inventory_errors_keep_raw_database_details_out_of_the_envelope() {
        let encoded = document_inventory_error_to_command_string(InventoryError::Db(
            "private document database detail".to_string(),
        ));
        let parsed: serde_json::Value = serde_json::from_str(&encoded).expect("valid envelope");
        assert_eq!(parsed["code"], "common.internal");
        assert!(parsed["diagnostic_id"]
            .as_str()
            .is_some_and(|value| value.starts_with("fm-")));
        assert!(!encoded.contains("private document database detail"));
    }
}
