import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(
  new URL("./settings_printer_card_header.tsx", import.meta.url),
  "utf8",
);

test("settings printer card header uses shared settings action buttons", () => {
  const observedToggleSource = readFileSync(
    new URL("./settings_printer_observed_details_toggle.tsx", import.meta.url),
    "utf8",
  );

  assert.match(observedToggleSource, /settingsActionButtonClass\("neutral", "compact"\)/);
  assert.match(source, /settingsActionButtonClass\("neutral", "compact"\)/);
  assert.match(
    source,
    /settingsActionButtonClass\(\s*confirmDelete \? "danger" : "dangerQuiet",\s*"compact",\s*\)/,
  );
  assert.match(source, /hasLiveIntegration && !isEditing/);
  assert.match(source, /!isEditing \? \(/);
  assert.match(source, /disabled=\{!tauri \|\| busy \|\| actionsLocked\}/);
  assert.doesNotMatch(source, /rounded border px-2 py-1/);
  assert.doesNotMatch(source, /rounded border border-slate-300 px-2 py-1/);
});
