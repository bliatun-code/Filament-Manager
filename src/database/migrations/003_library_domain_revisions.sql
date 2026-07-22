CREATE TABLE IF NOT EXISTS library_domain_revisions (
  domain TEXT PRIMARY KEY,
  revision INTEGER NOT NULL DEFAULT 0 CHECK (revision >= 0),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT OR IGNORE INTO library_domain_revisions (domain) VALUES
  ('inventory'),
  ('catalog'),
  ('loans'),
  ('printers'),
  ('jobs'),
  ('wishlist');

CREATE INDEX IF NOT EXISTS idx_spools_active_updated_id
  ON filament_spools(deleted_at, updated_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_filament_spools_rfid_tag_normalized
  ON filament_spools(trim(rfid_tag) COLLATE NOCASE)
  WHERE deleted_at IS NULL AND rfid_tag IS NOT NULL;

CREATE TRIGGER IF NOT EXISTS revision_inventory_spools_insert
AFTER INSERT ON filament_spools BEGIN
  UPDATE library_domain_revisions
  SET revision = revision + 1, updated_at = datetime('now')
  WHERE domain = 'inventory';
END;
CREATE TRIGGER IF NOT EXISTS revision_inventory_spools_update
AFTER UPDATE ON filament_spools BEGIN
  UPDATE library_domain_revisions
  SET revision = revision + 1, updated_at = datetime('now')
  WHERE domain = 'inventory';
END;
CREATE TRIGGER IF NOT EXISTS revision_inventory_spools_delete
AFTER DELETE ON filament_spools BEGIN
  UPDATE library_domain_revisions
  SET revision = revision + 1, updated_at = datetime('now')
  WHERE domain = 'inventory';
END;

CREATE TRIGGER IF NOT EXISTS revision_inventory_locations_insert
AFTER INSERT ON inventory_locations BEGIN
  UPDATE library_domain_revisions
  SET revision = revision + 1, updated_at = datetime('now')
  WHERE domain = 'inventory';
END;
CREATE TRIGGER IF NOT EXISTS revision_inventory_locations_update
AFTER UPDATE ON inventory_locations BEGIN
  UPDATE library_domain_revisions
  SET revision = revision + 1, updated_at = datetime('now')
  WHERE domain = 'inventory';
END;
CREATE TRIGGER IF NOT EXISTS revision_inventory_locations_delete
AFTER DELETE ON inventory_locations BEGIN
  UPDATE library_domain_revisions
  SET revision = revision + 1, updated_at = datetime('now')
  WHERE domain = 'inventory';
END;

CREATE TRIGGER IF NOT EXISTS revision_inventory_weights_insert
AFTER INSERT ON weight_readings BEGIN
  UPDATE library_domain_revisions
  SET revision = revision + 1, updated_at = datetime('now')
  WHERE domain = 'inventory';
END;
CREATE TRIGGER IF NOT EXISTS revision_inventory_weights_update
AFTER UPDATE ON weight_readings BEGIN
  UPDATE library_domain_revisions
  SET revision = revision + 1, updated_at = datetime('now')
  WHERE domain = 'inventory';
END;
CREATE TRIGGER IF NOT EXISTS revision_inventory_weights_delete
AFTER DELETE ON weight_readings BEGIN
  UPDATE library_domain_revisions
  SET revision = revision + 1, updated_at = datetime('now')
  WHERE domain = 'inventory';
END;

CREATE TRIGGER IF NOT EXISTS revision_catalog_insert
AFTER INSERT ON filament_master_list BEGIN
  UPDATE library_domain_revisions
  SET revision = revision + 1, updated_at = datetime('now')
  WHERE domain = 'catalog';
END;
CREATE TRIGGER IF NOT EXISTS revision_catalog_update
AFTER UPDATE ON filament_master_list
WHEN OLD.material IS NOT NEW.material
  OR OLD.filament_name IS NOT NEW.filament_name
  OR OLD.color_name IS NOT NEW.color_name
  OR OLD.hex_color IS NOT NEW.hex_color
  OR OLD.product_url IS NOT NEW.product_url
  OR OLD.default_weight IS NOT NEW.default_weight
  OR OLD.vendor IS NOT NEW.vendor
  OR OLD.is_discontinued IS NOT NEW.is_discontinued
  OR OLD.discontinued_at IS NOT NEW.discontinued_at
  OR OLD.catalog_source IS NOT NEW.catalog_source
  OR OLD.catalog_seed_version IS NOT NEW.catalog_seed_version
  OR OLD.catalog_user_edited IS NOT NEW.catalog_user_edited
  OR OLD.last_seen_at IS NOT NEW.last_seen_at
BEGIN
  UPDATE library_domain_revisions
  SET revision = revision + 1, updated_at = datetime('now')
  WHERE domain = 'catalog';
END;
CREATE TRIGGER IF NOT EXISTS revision_catalog_delete
AFTER DELETE ON filament_master_list BEGIN
  UPDATE library_domain_revisions
  SET revision = revision + 1, updated_at = datetime('now')
  WHERE domain = 'catalog';
END;

CREATE TRIGGER IF NOT EXISTS revision_loans_insert
AFTER INSERT ON spool_loans BEGIN
  UPDATE library_domain_revisions
  SET revision = revision + 1, updated_at = datetime('now')
  WHERE domain = 'loans';
END;
CREATE TRIGGER IF NOT EXISTS revision_loans_update
AFTER UPDATE ON spool_loans BEGIN
  UPDATE library_domain_revisions
  SET revision = revision + 1, updated_at = datetime('now')
  WHERE domain = 'loans';
END;
CREATE TRIGGER IF NOT EXISTS revision_loans_delete
AFTER DELETE ON spool_loans BEGIN
  UPDATE library_domain_revisions
  SET revision = revision + 1, updated_at = datetime('now')
  WHERE domain = 'loans';
END;

CREATE TRIGGER IF NOT EXISTS revision_printers_insert
AFTER INSERT ON printers BEGIN
  UPDATE library_domain_revisions
  SET revision = revision + 1, updated_at = datetime('now')
  WHERE domain = 'printers';
END;
CREATE TRIGGER IF NOT EXISTS revision_printers_update
AFTER UPDATE ON printers BEGIN
  UPDATE library_domain_revisions
  SET revision = revision + 1, updated_at = datetime('now')
  WHERE domain = 'printers';
END;
CREATE TRIGGER IF NOT EXISTS revision_printers_delete
AFTER DELETE ON printers BEGIN
  UPDATE library_domain_revisions
  SET revision = revision + 1, updated_at = datetime('now')
  WHERE domain = 'printers';
END;

CREATE TRIGGER IF NOT EXISTS revision_ams_units_insert
AFTER INSERT ON ams_units BEGIN
  UPDATE library_domain_revisions
  SET revision = revision + 1, updated_at = datetime('now')
  WHERE domain = 'printers';
END;
CREATE TRIGGER IF NOT EXISTS revision_ams_units_update
AFTER UPDATE ON ams_units BEGIN
  UPDATE library_domain_revisions
  SET revision = revision + 1, updated_at = datetime('now')
  WHERE domain = 'printers';
END;
CREATE TRIGGER IF NOT EXISTS revision_ams_units_delete
AFTER DELETE ON ams_units BEGIN
  UPDATE library_domain_revisions
  SET revision = revision + 1, updated_at = datetime('now')
  WHERE domain = 'printers';
END;

CREATE TRIGGER IF NOT EXISTS revision_ams_slots_insert
AFTER INSERT ON ams_slots BEGIN
  UPDATE library_domain_revisions
  SET revision = revision + 1, updated_at = datetime('now')
  WHERE domain = 'printers';
END;
CREATE TRIGGER IF NOT EXISTS revision_ams_slots_update
AFTER UPDATE ON ams_slots BEGIN
  UPDATE library_domain_revisions
  SET revision = revision + 1, updated_at = datetime('now')
  WHERE domain = 'printers';
END;
CREATE TRIGGER IF NOT EXISTS revision_ams_slots_delete
AFTER DELETE ON ams_slots BEGIN
  UPDATE library_domain_revisions
  SET revision = revision + 1, updated_at = datetime('now')
  WHERE domain = 'printers';
END;

CREATE TRIGGER IF NOT EXISTS revision_jobs_insert
AFTER INSERT ON print_jobs BEGIN
  UPDATE library_domain_revisions
  SET revision = revision + 1, updated_at = datetime('now')
  WHERE domain = 'jobs';
END;
CREATE TRIGGER IF NOT EXISTS revision_jobs_update
AFTER UPDATE ON print_jobs BEGIN
  UPDATE library_domain_revisions
  SET revision = revision + 1, updated_at = datetime('now')
  WHERE domain = 'jobs';
END;
CREATE TRIGGER IF NOT EXISTS revision_jobs_delete
AFTER DELETE ON print_jobs BEGIN
  UPDATE library_domain_revisions
  SET revision = revision + 1, updated_at = datetime('now')
  WHERE domain = 'jobs';
END;

CREATE TRIGGER IF NOT EXISTS revision_live_jobs_insert
AFTER INSERT ON printer_live_usage_sessions BEGIN
  UPDATE library_domain_revisions
  SET revision = revision + 1, updated_at = datetime('now')
  WHERE domain = 'jobs';
END;
CREATE TRIGGER IF NOT EXISTS revision_live_jobs_update
AFTER UPDATE ON printer_live_usage_sessions BEGIN
  UPDATE library_domain_revisions
  SET revision = revision + 1, updated_at = datetime('now')
  WHERE domain = 'jobs';
END;
CREATE TRIGGER IF NOT EXISTS revision_live_jobs_delete
AFTER DELETE ON printer_live_usage_sessions BEGIN
  UPDATE library_domain_revisions
  SET revision = revision + 1, updated_at = datetime('now')
  WHERE domain = 'jobs';
END;

CREATE TRIGGER IF NOT EXISTS revision_live_job_spools_insert
AFTER INSERT ON printer_live_usage_session_spools BEGIN
  UPDATE library_domain_revisions
  SET revision = revision + 1, updated_at = datetime('now')
  WHERE domain = 'jobs';
END;
CREATE TRIGGER IF NOT EXISTS revision_live_job_spools_update
AFTER UPDATE ON printer_live_usage_session_spools BEGIN
  UPDATE library_domain_revisions
  SET revision = revision + 1, updated_at = datetime('now')
  WHERE domain = 'jobs';
END;
CREATE TRIGGER IF NOT EXISTS revision_live_job_spools_delete
AFTER DELETE ON printer_live_usage_session_spools BEGIN
  UPDATE library_domain_revisions
  SET revision = revision + 1, updated_at = datetime('now')
  WHERE domain = 'jobs';
END;

CREATE TRIGGER IF NOT EXISTS revision_wishlist_insert
AFTER INSERT ON wishlist_items BEGIN
  UPDATE library_domain_revisions
  SET revision = revision + 1, updated_at = datetime('now')
  WHERE domain = 'wishlist';
END;
CREATE TRIGGER IF NOT EXISTS revision_wishlist_update
AFTER UPDATE ON wishlist_items BEGIN
  UPDATE library_domain_revisions
  SET revision = revision + 1, updated_at = datetime('now')
  WHERE domain = 'wishlist';
END;
CREATE TRIGGER IF NOT EXISTS revision_wishlist_delete
AFTER DELETE ON wishlist_items BEGIN
  UPDATE library_domain_revisions
  SET revision = revision + 1, updated_at = datetime('now')
  WHERE domain = 'wishlist';
END;
