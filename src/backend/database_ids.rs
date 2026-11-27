use std::time::{SystemTime, UNIX_EPOCH};

pub(crate) fn new_id() -> String {
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_nanos();
    id_at_timestamp(nanos)
}

fn id_at_timestamp(nanos: u128) -> String {
    // Keep the existing timestamp prefix for ordering. Coarse clocks and
    // separate processes can produce the same timestamp for different rows.
    format!("id_{nanos}_{:032x}", rand::random::<u128>())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashSet;

    #[test]
    fn generated_ids_are_distinct_within_a_single_clock_tick() {
        let ids: HashSet<_> = (0..1024).map(|_| id_at_timestamp(123)).collect();
        assert_eq!(ids.len(), 1024);
        assert!(ids.iter().all(|id| id.starts_with("id_123_")));
    }
}
