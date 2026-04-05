PRAGMA foreign_keys = ON;
BEGIN;

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
  status TEXT NOT NULL,
  initial_weight_g INTEGER,
  current_weight_g INTEGER,
  remaining_g INTEGER,
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

CREATE INDEX IF NOT EXISTS idx_master_material ON filament_master_list(material);
CREATE INDEX IF NOT EXISTS idx_master_color ON filament_master_list(color_name);
CREATE INDEX IF NOT EXISTS idx_spools_status ON filament_spools(status);
CREATE INDEX IF NOT EXISTS idx_spools_qr ON filament_spools(qr_code);
CREATE INDEX IF NOT EXISTS idx_spools_location ON filament_spools(location_id);
CREATE INDEX IF NOT EXISTS idx_ams_slot_spool ON ams_slots(spool_id);
CREATE INDEX IF NOT EXISTS idx_weight_spool_time ON weight_readings(spool_id, captured_at);
CREATE INDEX IF NOT EXISTS idx_print_jobs_printer_time ON print_jobs(printer_id, started_at);
CREATE INDEX IF NOT EXISTS idx_spool_history_spool_time ON spool_history_events(spool_id, created_at);
CREATE INDEX IF NOT EXISTS idx_wishlist_status ON wishlist_items(status, updated_at);

COMMIT;
