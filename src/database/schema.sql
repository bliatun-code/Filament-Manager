PRAGMA foreign_keys = ON;

-- Master catalog from scraper
CREATE TABLE IF NOT EXISTS filament_master_list (
  id TEXT PRIMARY KEY,
  material TEXT NOT NULL,
  filament_name TEXT NOT NULL,
  color_name TEXT NOT NULL,
  hex_color TEXT,
  product_url TEXT,
  default_weight INTEGER NOT NULL DEFAULT 1000,
  vendor TEXT NOT NULL DEFAULT 'Bambu',
  is_discontinued INTEGER NOT NULL DEFAULT 0,
  discontinued_at TEXT,
  last_seen_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(material, filament_name, color_name)
);

CREATE TABLE IF NOT EXISTS filament_spools (
  id TEXT PRIMARY KEY,
  master_id TEXT NOT NULL REFERENCES filament_master_list(id),
  qr_code TEXT UNIQUE,
  rfid_tag TEXT,
  rfid_observed_at TEXT,
  status TEXT NOT NULL,
  ownership_type TEXT NOT NULL DEFAULT 'OWNED',
  owner_name TEXT,
  owner_contact TEXT,
  ownership_note TEXT,
  initial_weight_g INTEGER,
  current_weight_g INTEGER,
  remaining_g INTEGER,
  spool_tare_weight_g INTEGER,
  location_id TEXT REFERENCES inventory_locations(id),
  purchase_date TEXT,
  purchase_price REAL,
  batch_code TEXT,
  last_used_at TEXT,
  deleted_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS spool_history_events (
  id TEXT PRIMARY KEY,
  spool_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS spool_loans (
  id TEXT PRIMARY KEY,
  spool_id TEXT NOT NULL REFERENCES filament_spools(id),
  borrower_name TEXT NOT NULL,
  loan_direction TEXT NOT NULL DEFAULT 'OUTBOUND',
  loan_status TEXT NOT NULL DEFAULT 'ACTIVE',
  counterparty_name TEXT,
  counterparty_contact TEXT,
  counterparty_note TEXT,
  grams_out INTEGER NOT NULL,
  lent_note TEXT,
  lent_at TEXT NOT NULL DEFAULT (datetime('now')),
  expected_return_at TEXT,
  returned_at TEXT,
  returned_grams INTEGER,
  consumed_grams INTEGER,
  return_note TEXT
);

CREATE TABLE IF NOT EXISTS inventory_locations (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  parent_id TEXT REFERENCES inventory_locations(id),
  x REAL,
  y REAL,
  z REAL
);

CREATE TABLE IF NOT EXISTS printers (
  id TEXT PRIMARY KEY,
  model TEXT NOT NULL,
  name TEXT NOT NULL,
  ip_address TEXT,
  access_token TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS ams_units (
  id TEXT PRIMARY KEY,
  printer_id TEXT NOT NULL REFERENCES printers(id),
  slot_count INTEGER NOT NULL DEFAULT 4,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS ams_slots (
  id TEXT PRIMARY KEY,
  ams_id TEXT NOT NULL REFERENCES ams_units(id),
  slot_index INTEGER NOT NULL,
  spool_id TEXT REFERENCES filament_spools(id),
  last_seen_at TEXT
);

CREATE TABLE IF NOT EXISTS print_jobs (
  id TEXT PRIMARY KEY,
  printer_id TEXT REFERENCES printers(id),
  spool_id TEXT REFERENCES filament_spools(id),
  job_name TEXT,
  started_at TEXT,
  ended_at TEXT,
  material_used_g INTEGER,
  success INTEGER
);

CREATE TABLE IF NOT EXISTS printer_live_events (
  id TEXT PRIMARY KEY,
  printer_id TEXT NOT NULL REFERENCES printers(id),
  event_type TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS scales (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  protocol TEXT NOT NULL,
  device_id TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS weight_readings (
  id TEXT PRIMARY KEY,
  scale_id TEXT NOT NULL REFERENCES scales(id),
  spool_id TEXT REFERENCES filament_spools(id),
  grams INTEGER NOT NULL,
  captured_at TEXT NOT NULL,
  source TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS scan_events (
  id TEXT PRIMARY KEY,
  spool_id TEXT REFERENCES filament_spools(id),
  qr_code TEXT,
  source TEXT NOT NULL,
  detected_color_hex TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS label_templates (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  layout_json TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS label_print_jobs (
  id TEXT PRIMARY KEY,
  template_id TEXT REFERENCES label_templates(id),
  spool_id TEXT REFERENCES filament_spools(id),
  status TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS purchase_recommendations (
  id TEXT PRIMARY KEY,
  material TEXT,
  color_name TEXT,
  reason TEXT,
  confidence REAL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS wishlist_items (
  id TEXT PRIMARY KEY,
  master_id TEXT REFERENCES filament_master_list(id),
  material TEXT NOT NULL,
  filament_name TEXT NOT NULL,
  color_name TEXT NOT NULL,
  vendor TEXT NOT NULL DEFAULT 'Manual',
  status TEXT NOT NULL DEFAULT 'WISHLIST',
  quantity INTEGER NOT NULL DEFAULT 1,
  note TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS alerts (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  resolved_at TEXT
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS trusted_lan_pairings (
  id TEXT PRIMARY KEY,
  display_name TEXT,
  pairing_token_hash TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at TEXT NOT NULL,
  used_at TEXT
);

CREATE TABLE IF NOT EXISTS trusted_lan_paired_browsers (
  id TEXT PRIMARY KEY,
  display_name TEXT,
  device_token_hash TEXT NOT NULL UNIQUE,
  paired_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_seen_at TEXT,
  last_origin TEXT,
  revoked_at TEXT
);

CREATE TABLE IF NOT EXISTS sync_queue (
  id TEXT PRIMARY KEY,
  action_type TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'PENDING',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  sent_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_master_material ON filament_master_list(material);
CREATE INDEX IF NOT EXISTS idx_master_color ON filament_master_list(color_name);
CREATE INDEX IF NOT EXISTS idx_spools_status ON filament_spools(status);
CREATE INDEX IF NOT EXISTS idx_spools_qr ON filament_spools(qr_code);
CREATE INDEX IF NOT EXISTS idx_spools_location ON filament_spools(location_id);
CREATE INDEX IF NOT EXISTS idx_ams_slot_spool ON ams_slots(spool_id);
CREATE INDEX IF NOT EXISTS idx_weight_spool_time ON weight_readings(spool_id, captured_at);
CREATE INDEX IF NOT EXISTS idx_print_jobs_printer_time ON print_jobs(printer_id, started_at);
CREATE INDEX IF NOT EXISTS idx_printer_live_events_printer_time ON printer_live_events(printer_id, created_at);
CREATE INDEX IF NOT EXISTS idx_sync_queue_status ON sync_queue(status, created_at);
CREATE INDEX IF NOT EXISTS idx_spool_history_spool_time ON spool_history_events(spool_id, created_at);
CREATE INDEX IF NOT EXISTS idx_wishlist_status ON wishlist_items(status, updated_at);
CREATE INDEX IF NOT EXISTS idx_spool_loans_spool_active ON spool_loans(spool_id, returned_at);
CREATE INDEX IF NOT EXISTS idx_spool_loans_borrower_time ON spool_loans(borrower_name, lent_at);
CREATE INDEX IF NOT EXISTS idx_trusted_lan_pairings_expires ON trusted_lan_pairings(expires_at, used_at);
CREATE INDEX IF NOT EXISTS idx_trusted_lan_paired_browsers_active ON trusted_lan_paired_browsers(revoked_at, paired_at);
CREATE UNIQUE INDEX IF NOT EXISTS idx_spool_loans_active_unique
  ON spool_loans(spool_id) WHERE returned_at IS NULL;
