-- Keeping the receipt independent of the order and rolls allows replay after deletion.
CREATE TABLE wishlist_receipt_requests (
    request_id TEXT PRIMARY KEY NOT NULL,
    library_id TEXT NOT NULL,
    request_json TEXT NOT NULL CHECK (json_valid(request_json)),
    receipt_json TEXT NOT NULL CHECK (json_valid(receipt_json))
);
