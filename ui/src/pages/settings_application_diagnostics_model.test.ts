import assert from "node:assert/strict";
import test from "node:test";

import type { ApplicationDiagnostics } from "../lib/tauri_client";
import {
  applicationDiagnosticsHealth,
  formatDiagnosticBytes,
  initialSettingsApplicationDiagnosticsState,
  settingsApplicationDiagnosticsReducer,
} from "./settings_application_diagnostics_model";

const healthyDiagnostics: ApplicationDiagnostics = {
  generated_at_ms: 1,
  app_version: "0.21.2",
  database: {
    available: true,
    schema_version: 1,
    supported_schema_version: 1,
    quick_check: "ok",
    foreign_key_check: "ok",
    journal_mode: "wal",
    size_bytes: 1_572_864,
    local_db_path: "/local/filament-manager.db",
  },
};

test("diagnostics reducer preserves the last successful result when refresh fails", () => {
  const loaded = settingsApplicationDiagnosticsReducer(
    initialSettingsApplicationDiagnosticsState,
    { type: "refresh_succeeded", diagnostics: healthyDiagnostics },
  );
  const refreshing = settingsApplicationDiagnosticsReducer(loaded, {
    type: "refresh_started",
  });
  const failed = settingsApplicationDiagnosticsReducer(refreshing, {
    type: "refresh_failed",
    error: "offline",
  });

  assert.equal(refreshing.diagnostics, healthyDiagnostics);
  assert.equal(failed.diagnostics, healthyDiagnostics);
  assert.equal(failed.refreshStatus, "error");
  assert.equal(failed.refreshError, "offline");
});

test("diagnostics health distinguishes healthy, issue, and unavailable databases", () => {
  assert.equal(applicationDiagnosticsHealth(healthyDiagnostics), "healthy");
  assert.equal(
    applicationDiagnosticsHealth({
      ...healthyDiagnostics,
      database: { ...healthyDiagnostics.database, quick_check: "issues_found" },
    }),
    "issues",
  );
  assert.equal(
    applicationDiagnosticsHealth({
      ...healthyDiagnostics,
      database: { ...healthyDiagnostics.database, available: false },
    }),
    "unavailable",
  );
});

test("diagnostics byte formatting stays compact and handles missing data", () => {
  assert.equal(formatDiagnosticBytes(null), "—");
  assert.equal(formatDiagnosticBytes(512), "512 B");
  assert.equal(formatDiagnosticBytes(1536), "1.5 KB");
  assert.equal(formatDiagnosticBytes(1_572_864), "1.5 MB");
});
