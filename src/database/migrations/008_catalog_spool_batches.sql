-- Operational receipts belong to this library installation. They intentionally
-- have no spool foreign keys: deleting a roll must not make its request replayable.
CREATE TABLE catalog_spool_batches (
    batch_id TEXT PRIMARY KEY NOT NULL,
    library_id TEXT NOT NULL,
    request_json TEXT NOT NULL CHECK (json_valid(request_json)),
    receipt_json TEXT NOT NULL CHECK (json_valid(receipt_json)),
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);
