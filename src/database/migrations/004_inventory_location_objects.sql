ALTER TABLE inventory_locations ADD COLUMN archived_at TEXT;
ALTER TABLE inventory_locations ADD COLUMN created_at TEXT;
ALTER TABLE inventory_locations ADD COLUMN updated_at TEXT;

-- SHELF was the legacy user-managed storage type. Canonicalize it without
-- changing any immutable IDs or spool references so generic CRUD and choices
-- keep working after the upgrade.
UPDATE inventory_locations
SET type = 'GENERIC'
WHERE UPPER(TRIM(type)) = 'SHELF';

UPDATE inventory_locations
SET created_at = COALESCE(created_at, datetime('now')),
    updated_at = COALESCE(updated_at, datetime('now'));

CREATE INDEX IF NOT EXISTS idx_inventory_locations_active_name
ON inventory_locations(archived_at, name COLLATE NOCASE, id);
