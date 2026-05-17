import { strict as assert } from "node:assert";
import test from "node:test";
import {
  buildDiagnosticCaptureSession,
  exportDiagnosticCaptureSessionCsv,
  updateDiagnosticCaptureSessionFromPayload,
} from "./diagnostic_capture";

test("updateDiagnosticCaptureSessionFromPayload records first, refresh, and changed samples", () => {
  const first = updateDiagnosticCaptureSessionFromPayload({
    session: null,
    rawPayload: { print: { progress: 10 }, ams: { tray: [{ tray_type: "PLA" }] } },
    observedAt: "2026-05-15T10:00:00Z",
  });

  assert.ok(first);
  assert.equal(first.fields.length, 2);
  assert.equal(first.samples[0]?.changeKind, "first_seen");

  const refreshed = updateDiagnosticCaptureSessionFromPayload({
    session: first,
    rawPayload: { print: { progress: 10 }, ams: { tray: [{ tray_type: "PLA" }] } },
    observedAt: "2026-05-15T10:00:05Z",
  });

  assert.ok(refreshed);
  assert.equal(refreshed.fields.find((field) => field.path === "print.progress")?.receiveCount, 2);
  assert.equal(refreshed.samples.at(-1)?.changeKind, "refresh");

  const changed = updateDiagnosticCaptureSessionFromPayload({
    session: refreshed,
    rawPayload: { print: { progress: 20 }, ams: { tray: [{ tray_type: "PETG" }] } },
    observedAt: "2026-05-15T10:00:10Z",
  });

  assert.ok(changed);
  const progress = changed.fields.find((field) => field.path === "print.progress");
  assert.equal(progress?.valueText, "20");
  assert.equal(progress?.changeCount, 2);
  assert.equal(changed.samples.at(-1)?.changeKind, "changed");
});

test("updateDiagnosticCaptureSessionFromPayload preserves seeded sessions as changed additions", () => {
  const seeded = buildDiagnosticCaptureSession({
    last_seen_at: "2026-05-15T10:00:00Z",
    raw_payload_json: { print: { progress: 10 } },
  } as never);

  const updated = updateDiagnosticCaptureSessionFromPayload({
    session: seeded,
    rawPayload: { print: { progress: 10 }, new_field: "ready" },
    observedAt: "2026-05-15T10:00:05Z",
  });

  assert.ok(updated);
  assert.equal(updated.fields.find((field) => field.path === "new_field")?.valueText, "ready");
  assert.equal(updated.samples.at(-1)?.changeKind, "changed");
});

test("exportDiagnosticCaptureSessionCsv writes summary and sample rows with escaping", () => {
  const session = updateDiagnosticCaptureSessionFromPayload({
    session: null,
    rawPayload: {
      msg: 'hello, "printer"',
      print: {
        note: "line\nbreak",
      },
    },
    observedAt: "2026-05-15T10:00:00Z",
  });

  assert.ok(session);
  const csv = exportDiagnosticCaptureSessionCsv(session);

  assert.match(csv, /^section,session_started_at,/);
  assert.match(csv, /field_summary,.*?,print,print\.note,,"line\nbreak"/);
  assert.match(csv, /field_summary,.*?,print,msg,,"hello, ""printer"""/);
  assert.match(csv, /sample_log,.*?,print,msg,2026-05-15T10:00:00Z,"hello, ""printer""",first_seen/);
});
