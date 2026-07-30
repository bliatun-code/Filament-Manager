import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const providerSource = readFileSync(
  new URL("./app_update_provider.tsx", import.meta.url),
  "utf8",
);
const hookSource = readFileSync(
  new URL("./use_app_update_check.ts", import.meta.url),
  "utf8",
);
const appSource = readFileSync(new URL("../App.tsx", import.meta.url), "utf8");
const mainSource = readFileSync(new URL("../main.tsx", import.meta.url), "utf8");

test("automatic update checks are delayed, throttled, and silent", () => {
  assert.match(providerSource, /isAutomaticAppUpdateCheckDue\(preferences\)/);
  assert.match(
    providerSource,
    /window\.setTimeout\(\(\) => \{[\s\S]*?recordAutomaticAppUpdateCheckAttempt[\s\S]*?check\(\{ silent: true \}\)[\s\S]*?APP_UPDATE_STARTUP_DELAY_MS/,
  );
  assert.match(
    hookSource,
    /\(!silent \|\| result\.status === "UPDATE_AVAILABLE"\)/,
  );
  assert.match(hookSource, /if \(!silent\) \{\s*setState\(\{ status: "CHECKING" \}\)/);
  assert.match(
    hookSource,
    /if \(!silent && mountedRef\.current && requestIdRef\.current === requestId\)/,
  );
});

test("manual checks remain explicit and share the daily attempt timestamp", () => {
  assert.match(
    providerSource,
    /const checkManually = useCallback\(async \(\) => \{[\s\S]*?recordAutomaticAppUpdateCheckAttempt[\s\S]*?return check\(\)/,
  );
});

test("the global provider renders a pinned release banner", () => {
  assert.match(mainSource, /<AppUpdateProvider>\s*<App \/>/);
  assert.match(appSource, /<AppUpdateBanner/);
  assert.match(
    appSource,
    /openExternalUrl\(trustedReleaseUrl\(availableUpdate\)\)/,
  );
});
