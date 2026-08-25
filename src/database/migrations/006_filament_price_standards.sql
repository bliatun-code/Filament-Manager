ALTER TABLE filament_spools
ADD COLUMN purchase_price_batch_locked INTEGER NOT NULL DEFAULT 0
CHECK (purchase_price_batch_locked IN (0, 1));

ALTER TABLE filament_spools
ADD COLUMN purchase_price_source TEXT
CHECK (purchase_price_source IS NULL OR purchase_price_source IN ('MANUAL', 'STANDARD_BATCH'));

UPDATE filament_spools
SET purchase_price_source = 'MANUAL'
WHERE purchase_price IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_spools_price_standard_group
ON filament_spools(deleted_at, ownership_type, purchase_price_batch_locked, master_id);
