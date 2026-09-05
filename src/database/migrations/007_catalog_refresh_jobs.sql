CREATE TABLE catalog_refresh_jobs (
    job_id TEXT PRIMARY KEY NOT NULL,
    authority_key TEXT NOT NULL,
    owner_id TEXT NOT NULL,
    vendor TEXT NOT NULL CHECK (vendor IN ('Bambu', 'eSUN')),
    material TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('RUNNING', 'SUCCEEDED', 'FAILED', 'INTERRUPTED')),
    started_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
    finished_at TEXT,
    result_json TEXT CHECK (result_json IS NULL OR json_valid(result_json)),
    error TEXT,
    CHECK ((status = 'RUNNING' AND finished_at IS NULL AND result_json IS NULL AND error IS NULL)
        OR (status = 'SUCCEEDED' AND finished_at IS NOT NULL AND result_json IS NOT NULL AND error IS NULL)
        OR (status IN ('FAILED', 'INTERRUPTED') AND finished_at IS NOT NULL AND result_json IS NULL AND error IS NOT NULL))
);

-- Every entry point shares one library database, including other app windows
-- and clients. An active job must never become a queue of duplicate refreshes.
CREATE UNIQUE INDEX idx_catalog_refresh_jobs_single_running
ON catalog_refresh_jobs ((1)) WHERE status = 'RUNNING';
