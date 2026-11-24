use super::{fake_health, fake_host_state, spawn_fake_host_with, FakeHostResponse};
use crate::backend::filament_database::FilamentDatabase;
use crate::library_sync_loan_write_commands::{
    lend_library_sync_host_spool_blocking, return_library_sync_host_loan_blocking,
};
use crate::library_sync_models::{LibrarySyncLendSpoolInput, LibrarySyncReturnLoanInput};
use crate::state::AppState;
use serde_json::json;
use std::net::TcpListener;

#[derive(Clone, Copy)]
enum LoanAction {
    Lend,
    Return,
    HandBack,
}

impl LoanAction {
    fn post(self) -> &'static str {
        match self {
            Self::Lend => "POST /api/v1/spools/roll/lend ",
            Self::Return => "POST /api/v1/loans/loan/return ",
            Self::HandBack => "POST /api/v1/loans/loan/hand-back ",
        }
    }

    fn submit(
        self,
        state: &AppState,
        url: &str,
        library_id: &str,
        generation: u64,
    ) -> Result<(), String> {
        match self {
            Self::Lend => lend_library_sync_host_spool_blocking(
                state,
                LibrarySyncLendSpoolInput {
                    base_url: url.into(),
                    expected_library_id: library_id.into(),
                    expected_target_generation: generation,
                    spool_id: "roll".into(),
                    borrower_name: "Fixture".into(),
                    grams_out: 500,
                    counterparty_contact: None,
                    note: None,
                    expected_return_at: None,
                },
            ),
            Self::Return | Self::HandBack => return_library_sync_host_loan_blocking(
                state,
                LibrarySyncReturnLoanInput {
                    base_url: url.into(),
                    expected_library_id: library_id.into(),
                    expected_target_generation: generation,
                    loan_id: "loan".into(),
                    returned_grams: 400,
                    note: None,
                    inbound: matches!(self, Self::HandBack),
                },
            ),
        }
    }
}

fn switch_away_and_back(db: &FilamentDatabase) {
    let original = db.get_library_sync_settings().unwrap();
    let mut other = original.clone();
    other.library_id = "library-b".into();
    other.host_base_url = Some("http://other.local:4278".into());
    db.save_library_sync_settings(&other).unwrap();
    db.save_library_sync_settings(&original).unwrap();
}

#[test]
fn loan_dialogs_reject_a_b_a_and_wrong_library_before_network() {
    let listener = TcpListener::bind("127.0.0.1:0").unwrap();
    listener.set_nonblocking(true).unwrap();
    let url = format!("http://{}", listener.local_addr().unwrap());
    let (state, path) = fake_host_state(&url);
    let db = FilamentDatabase::open(&path).unwrap();
    let original = db.get_library_sync_page_status().unwrap();
    switch_away_and_back(&db);
    let current = db.get_library_sync_page_status().unwrap();
    assert!(current.target_generation > original.target_generation);
    for action in [LoanAction::Lend, LoanAction::Return, LoanAction::HandBack] {
        for (library, generation) in [
            ("library-test", original.target_generation),
            ("other", current.target_generation),
            (" ", current.target_generation),
        ] {
            let error = action
                .submit(&state, &url, library, generation)
                .unwrap_err();
            assert!(error.contains("common.invalid_request"), "{error}");
        }
    }
    assert_eq!(
        listener.accept().unwrap_err().kind(),
        std::io::ErrorKind::WouldBlock
    );
    drop(db);
    std::fs::remove_file(path).unwrap();
}

#[test]
fn loan_dialogs_require_the_reviewed_generation_in_the_native_input() {
    let complete = json!({"base_url":"http://host", "expected_library_id":"library", "expected_target_generation":0,
        "spool_id":"roll", "borrower_name":"Fixture", "grams_out":500, "loan_id":"loan", "returned_grams":400, "inbound":false});
    for field in ["expected_target_generation", "expected_library_id"] {
        let mut missing = complete.clone();
        missing.as_object_mut().unwrap().remove(field);
        assert!(serde_json::from_value::<LibrarySyncLendSpoolInput>(missing.clone()).is_err());
        assert!(serde_json::from_value::<LibrarySyncReturnLoanInput>(missing).is_err());
    }
}

#[test]
fn loan_dialogs_send_one_post_each_on_a_stable_host_and_none_after_health_switch() {
    let response = |expected_request_prefix, body| FakeHostResponse {
        expected_request_prefix,
        status: "200 OK",
        body,
    };
    for action in [LoanAction::Lend, LoanAction::Return, LoanAction::HandBack] {
        for change_during_health in [false, true] {
            let mut replies = vec![response("GET /api/v1/health ", fake_health())];
            if !change_during_health {
                replies.push(response(action.post(), "{}".into()));
                replies.push(response(
                    "GET /api/v1/library/loans?include_returned=false",
                    "[]".into(),
                ));
                replies.push(response(
                    "GET /api/v1/library/loans?include_returned=true",
                    "[]".into(),
                ));
                if matches!(action, LoanAction::Lend) {
                    replies.push(response("GET /api/v1/library/printers", "[]".into()));
                }
                replies.push(response("GET /api/v1/library/spools?", "[]".into()));
            }
            let (tx, rx) = std::sync::mpsc::channel::<std::path::PathBuf>();
            let (url, server) = spawn_fake_host_with(replies, move |request| {
                if change_during_health && request.starts_with("GET /api/v1/health ") {
                    switch_away_and_back(&FilamentDatabase::open(rx.recv().unwrap()).unwrap());
                }
            });
            let (state, path) = fake_host_state(&url);
            let original = FilamentDatabase::open(&path)
                .unwrap()
                .get_library_sync_page_status()
                .unwrap();
            tx.send(path.clone()).unwrap();
            let result = action.submit(
                &state,
                &url,
                &original.library_id,
                original.target_generation,
            );
            if change_during_health {
                assert!(result.unwrap_err().contains("common.invalid_request"));
            } else {
                result.unwrap();
            }
            server.join().unwrap();
            std::fs::remove_file(path).unwrap();
        }
    }
}
