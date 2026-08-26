ALTER TABLE inventory_locations ADD COLUMN archived_at TEXT;
ALTER TABLE inventory_locations ADD COLUMN created_at TEXT;
ALTER TABLE inventory_locations ADD COLUMN updated_at TEXT;

-- Preserve the legacy SHELF value. The application treats SHELF and GENERIC
-- as user-managed storage types, so upgrading does not need to rewrite domain
-- data in order to expose the newer location-management features.

UPDATE inventory_locations
SET created_at = COALESCE(created_at, datetime('now')),
    updated_at = COALESCE(updated_at, datetime('now'));

CREATE INDEX IF NOT EXISTS idx_inventory_locations_active_name
ON inventory_locations(archived_at, name COLLATE NOCASE, id);
