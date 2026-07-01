import assert from "node:assert/strict";
import { createServer } from "node:http";
import { test } from "node:test";
import {
  formatCompanionVisualGateReport,
  normalizeCompanionBaseUrl,
  runCompanionVisualGate,
} from "./run-companion-visual-gate.mjs";

function jsonResponse(response, value, headers = {}) {
  response.writeHead(200, { "content-type": "application/json", ...headers });
  response.end(JSON.stringify(value));
}

async function withFixtureServer(handler, callback) {
  const server = createServer(handler);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const address = server.address();
    const baseUrl = `http://127.0.0.1:${address.port}`;
    return await callback(baseUrl);
  } finally {
    await new Promise((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
}

function companionFixtureHandler(request, response) {
  const url = new URL(request.url ?? "/", "http://127.0.0.1");
  const authenticated = request.headers.cookie?.includes("bfm_companion_session=test-session");
  if (url.pathname === "/companion") {
    response.writeHead(200, { "content-type": "text/html" });
    response.end(
      '<div id="app"></div><link rel="stylesheet" href="/companion/app.css"><script type="module" src="/companion/app.js"></script>',
    );
    return;
  }
  if (url.pathname === "/companion/app.css") {
    response.writeHead(200, { "content-type": "text/css" });
    response.end(".companion-shell{} .swatch-surface{} .list-row{}");
    return;
  }
  if (url.pathname === "/companion/app.js") {
    response.writeHead(200, { "content-type": "application/javascript" });
    response.end("function createCompanionAppShellRenderer(){} function refreshOverview(){}");
    return;
  }
  if (url.pathname === "/api/v1/health") {
    jsonResponse(response, {
      ok: true,
      access_mode: "trusted-lan",
      auth_mode: "trusted-lan",
      sync_mode: "STANDALONE",
    });
    return;
  }
  if (url.pathname === "/api/v1/library/snapshot") {
    jsonResponse(response, {
      ok: true,
      active_loans: 1,
      printers: 1,
      inventory: { total_spools: 2 },
    });
    return;
  }
  if (url.pathname === "/api/v1/library/spools") {
    jsonResponse(response, [
      { spool: { id: "spool_1" }, master: { hex_color: "#12AB34" } },
      { spool: { id: "spool_2" }, master: { hex_color: "#000000" } },
    ]);
    return;
  }
  if (url.pathname === "/api/v1/library/printers") {
    jsonResponse(response, [
      {
        printer: { id: "printer_1", name: "Brutus" },
        slots: [{ slot_id: "slot_1", live_loaded: true }],
      },
    ]);
    return;
  }
  if (url.pathname === "/api/v1/library/loans") {
    jsonResponse(response, [{ loan: { id: "loan_1" }, hex_color: "#ABCDEF" }]);
    return;
  }
  if (url.pathname === "/api/v1/library/statistics/filament-consumption") {
    jsonResponse(response, [{ used_grams: 42, hex_color: "#123456" }]);
    return;
  }
  if (url.pathname === "/api/v1/library/wishlist") {
    jsonResponse(response, [{ id: "wish_1" }]);
    return;
  }
  if (url.pathname === "/api/v1/qa/session") {
    jsonResponse(
      response,
      { ok: true, csrf_token: "csrf-token", expires_in_seconds: 28800 },
      {
        "set-cookie":
          "bfm_companion_session=test-session; HttpOnly; SameSite=Strict; Max-Age=28800; Path=/api/v1",
      },
    );
    return;
  }
  if (url.pathname === "/api/v1/auth/session") {
    jsonResponse(response, {
      ok: true,
      auth_mode: "trusted-lan",
      access_mode: "trusted-lan",
      authenticated,
      csrf_token: authenticated ? "csrf-token" : null,
      can_renew: false,
    });
    return;
  }
  if (!authenticated && url.pathname.startsWith("/api/v1/")) {
    response.writeHead(401, { "content-type": "application/json" });
    response.end(JSON.stringify({ error: "Missing or invalid companion session" }));
    return;
  }
  if (url.pathname === "/api/v1/inventory/spools") {
    jsonResponse(response, [
      { spool: { id: "spool_1" }, master: { hex_color: "#12AB34" } },
      { spool: { id: "spool_2" }, master: { hex_color: "#000000" } },
    ]);
    return;
  }
  if (url.pathname === "/api/v1/printers/overview") {
    jsonResponse(response, [
      {
        printer: { id: "printer_1", name: "Brutus" },
        slots: [{ slot_id: "slot_1", live_loaded: true }],
      },
    ]);
    return;
  }
  if (url.pathname === "/api/v1/loans") {
    jsonResponse(response, [{ loan: { id: "loan_1" }, spool: { id: "spool_1" } }]);
    return;
  }
  if (url.pathname === "/api/v1/wishlist") {
    jsonResponse(response, [{ id: "wish_1" }]);
    return;
  }
  if (url.pathname === "/api/v1/spools/spool_1") {
    jsonResponse(response, {
      spool: { spool: { id: "spool_1" }, master: { hex_color: "#12AB34" } },
      history: [{ id: "history_1" }],
      usage: [{ used_grams: 42 }],
      active_loan: null,
    });
    return;
  }
  response.writeHead(404);
  response.end();
}

test("normalizeCompanionBaseUrl accepts companion URLs and strips paths", () => {
  assert.equal(
    normalizeCompanionBaseUrl("http://192.168.1.50:4278/companion"),
    "http://192.168.1.50:4278",
  );
  assert.equal(normalizeCompanionBaseUrl("  "), null);
});

test("companion visual gate passes data-rich fixture responses", async () => {
  await withFixtureServer(companionFixtureHandler, async (baseUrl) => {
    const result = await runCompanionVisualGate({ baseUrl, timeoutMs: 1_000 });
    assert.deepEqual(result.errors, []);
    assert.equal(result.counts.snapshotSpools, 2);
    assert.equal(result.counts.livePrinterSlots, 1);
    assert.equal(result.session.authenticated, true);
    assert.equal(result.counts.protectedSpools, 2);
    assert.match(formatCompanionVisualGateReport(result), /Companion visual gate ok/);
  });
});

test("companion visual gate reports sparse live-printer data", async () => {
  await withFixtureServer((request, response) => {
    const url = new URL(request.url ?? "/", "http://127.0.0.1");
    if (url.pathname === "/api/v1/library/printers") {
      jsonResponse(response, [{ printer: { id: "printer_1" }, slots: [] }]);
      return;
    }
    companionFixtureHandler(request, response);
  }, async (baseUrl) => {
    const result = await runCompanionVisualGate({ baseUrl, timeoutMs: 1_000 });
    assert.ok(result.errors.some((error) => error.includes("live printer slots")));
  });
});

test("companion visual gate reports missing QA session bootstrap", async () => {
  await withFixtureServer((request, response) => {
    const url = new URL(request.url ?? "/", "http://127.0.0.1");
    if (url.pathname === "/api/v1/qa/session") {
      response.writeHead(404);
      response.end("not found");
      return;
    }
    companionFixtureHandler(request, response);
  }, async (baseUrl) => {
    const result = await runCompanionVisualGate({ baseUrl, timeoutMs: 1_000 });
    assert.ok(
      result.errors.some((error) =>
        error.includes("QA authenticated companion session failed"),
      ),
    );
  });
});
