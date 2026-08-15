import test from "node:test";
import assert from "node:assert/strict";

import { formatInventoryHistoryEventDetails } from "./inventory_history";

test("accepted AMS weight history uses a localized source label", () => {
  const details = formatInventoryHistoryEventDetails(
    {
      id: "history-1",
      spool_id: "spool-1",
      event_type: "WEIGHT_UPDATED",
      payload_json: {
        grams: 843,
        source: "BAMBU_AMS_ACCEPTED",
      },
      created_at: "2026-08-15T10:00:00Z",
    },
    {
      t: (key, fallback) =>
        key === "settings.bambuLiveAmsWeightEstimate" ? "AMS-estimat" : fallback,
      formatDateTime: (raw) => raw,
      formatStatusLabel: (status) => status,
      locale: "nb",
      printerNameById: new Map(),
      slotLabelById: new Map(),
    },
  );

  assert.match(details, /AMS-estimat/);
  assert.doesNotMatch(details, /BAMBU_AMS_ACCEPTED|BAMBU AMS ACCEPTED/);
});
