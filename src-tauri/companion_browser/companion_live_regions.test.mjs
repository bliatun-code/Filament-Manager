import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import {
  COMPANION_ASSERTIVE_LIVE_REGION_ID,
  COMPANION_POLITE_LIVE_REGION_ID,
  createCompanionLiveRegionAnnouncer,
} from "./companion_live_regions.js";

test("live-region announcer routes ordinary status and errors to separate persistent regions", () => {
  const politeWrites = [];
  const polite = {
    value: "",
    get textContent() {
      return this.value;
    },
    set textContent(value) {
      this.value = value;
      politeWrites.push(value);
    },
  };
  const assertive = { textContent: "" };
  const announcer = createCompanionLiveRegionAnnouncer({
    documentRef: {
      getElementById(id) {
        return {
          [COMPANION_POLITE_LIVE_REGION_ID]: polite,
          [COMPANION_ASSERTIVE_LIVE_REGION_ID]: assertive,
        }[id] || null;
      },
    },
  });

  assert.equal(announcer.announceRuntimeStatus("Spool saved.", "success"), true);
  assert.equal(announcer.announceRuntimeStatus("Spool saved.", "success"), true);
  assert.equal(announcer.announceRuntimeStatus("Could not save spool.", "error"), true);
  assert.equal(polite.textContent, "Spool saved.");
  assert.deepEqual(politeWrites, ["Spool saved.", "", "Spool saved."]);
  assert.equal(assertive.textContent, "Could not save spool.");
  assert.equal(announcer.announce("   "), false);
});

test("Companion document keeps polite and assertive live regions outside the rerendered app root", async () => {
  const html = await readFile(new URL("./index.html", import.meta.url), "utf8");
  const appPosition = html.indexOf('<div id="app"></div>');
  const politePosition = html.indexOf(`id="${COMPANION_POLITE_LIVE_REGION_ID}"`);
  const assertivePosition = html.indexOf(`id="${COMPANION_ASSERTIVE_LIVE_REGION_ID}"`);

  assert.ok(appPosition >= 0);
  assert.ok(politePosition > appPosition);
  assert.ok(assertivePosition > politePosition);
  assert.match(html, /role="status"[\s\S]*aria-live="polite"[\s\S]*aria-atomic="true"/);
  assert.match(html, /role="alert"[\s\S]*aria-live="assertive"[\s\S]*aria-atomic="true"/);
});
