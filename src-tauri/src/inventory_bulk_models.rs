use crate::backend::inventory_engine::InventoryBulkMutationInput;
use serde::Deserialize;

#[derive(Clone, Debug, Deserialize)]
pub(crate) struct LibrarySyncInventoryBulkMutationInput {
    pub(crate) base_url: String,
    pub(crate) expected_library_id: Option<String>,
    pub(crate) mutation: InventoryBulkMutationInput,
}

#[cfg(test)]
mod tests {
    use crate::backend::inventory_domain::SpoolStatus;
    use crate::backend::inventory_engine::InventoryBulkMutationInput;

    use super::LibrarySyncInventoryBulkMutationInput;

    #[test]
    fn host_wrapper_deserializes_one_nested_tagged_mutation() {
        let input: LibrarySyncInventoryBulkMutationInput =
            serde_json::from_value(serde_json::json!({
                "base_url": "http://host.local:4278",
                "expected_library_id": "library-1",
                "mutation": {
                    "action": "STATUS",
                    "expected_affected_count": 1,
                    "spools": [{
                        "spool_id": "spool-a",
                        "expected_status": "IN_STOCK",
                        "expected_location_id": "location-a",
                        "expected_home_location_id": "location-a",
                        "expected_active_loan": false,
                        "expected_assigned_to_printer": false
                    }],
                    "target_status": "EMPTY"
                }
            }))
            .expect("valid host bulk wrapper");

        assert_eq!(input.base_url, "http://host.local:4278");
        assert_eq!(input.expected_library_id.as_deref(), Some("library-1"));
        assert!(matches!(
            input.mutation,
            InventoryBulkMutationInput::Status {
                expected_affected_count: 1,
                target_status: SpoolStatus::Empty,
                ref spools,
            } if spools.len() == 1 && spools[0].spool_id == "spool-a"
        ));
    }
}
