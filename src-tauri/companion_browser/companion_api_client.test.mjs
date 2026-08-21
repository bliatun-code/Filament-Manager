import test from "node:test";
import assert from "node:assert/strict";

import {
  cloneInitWithFreshSession,
  createCompanionApiClient,
  createCompanionRequestError,
  normalizeHeaders,
  readJsonResponse,
} from "./companion_api_client.js";
import { createInitialCompanionState } from "./session_state.js";

function jsonResponse(status, payload) {
  return new Response(payload == null ? "" : JSON.stringify(payload), {
    status,
    headers: {
      "content-type": "application/json",
    },
  });
}

test("normalizeHeaders accepts browser header inputs", () => {
  assert.deepEqual(normalizeHeaders(), {});
  assert.deepEqual(normalizeHeaders([["x-test", "1"]]), { "x-test": "1" });
  assert.deepEqual(normalizeHeaders(new Headers({ "x-test": "2" })), { "x-test": "2" });
});

test("cloneInitWithFreshSession refreshes csrf only for mutating requests", () => {
  const postInit = cloneInitWithFreshSession(
    {
      method: "POST",
      headers: [["content-type", "application/json"]],
      body: "{}",
    },
    "fresh-csrf",
  );
  assert.deepEqual(postInit.headers, {
    "content-type": "application/json",
    "x-csrf-token": "fresh-csrf",
  });

  const getInit = cloneInitWithFreshSession(
    {
      method: "GET",
      headers: { accept: "application/json" },
    },
    "fresh-csrf",
  );
  assert.deepEqual(getInit.headers, { accept: "application/json" });
});

test("readJsonResponse falls back cleanly for non-json failures", async () => {
  const response = new Response("not-json", { status: 502 });
  const result = await readJsonResponse(response);
  assert.equal(result.parsed, null);
  assert.equal(result.message, "Request failed with status 502");
});

test("structured API errors use localized safe copy and retain only diagnostic ids", () => {
  const error = createCompanionRequestError(
    {
      parsed: {
        code: "inventory.spool.active_loan",
        message: "raw server detail that must not be shown",
        safe_detail: null,
        diagnostic_id: "fm-api-1",
      },
    },
    400,
    "nb",
  );
  assert.equal(error.message, "Returner det aktive utlånet før du fjerner denne rullen.");
  assert.equal(error.code, "inventory.spool.active_loan");
  assert.equal(error.diagnostic_id, "fm-api-1");
  assert.doesNotMatch(error.message, /raw server detail/);
});

test("purchase metadata capability errors tell the user to upgrade the Host", () => {
  const error = createCompanionRequestError(
    {
      parsed: {
        code: "purchase_metadata.host_unsupported",
        message: "unsupported internal command shape",
        diagnostic_id: "fm-api-receipt-1",
      },
    },
    400,
    "nb",
  );

  assert.equal(error.message, "Oppdater verten før du lagrer innkjøpsdetaljer.");
  assert.equal(error.code, "purchase_metadata.host_unsupported");
  assert.equal(error.diagnostic_id, "fm-api-receipt-1");
  assert.doesNotMatch(error.message, /unsupported internal command shape/);
});

test("companion api client retries a mutating request after session restore", async () => {
  const session = createInitialCompanionState();
  session.accessMode = "trusted-lan";
  session.authMode = "pairing-session";
  session.csrfToken = "stale-csrf";

  const seenRequests = [];
  const statusUpdates = [];
  let renderCount = 0;

  const client = createCompanionApiClient({
    session,
    setStatus(message, tone) {
      statusUpdates.push({ message, tone });
    },
    render() {
      renderCount += 1;
    },
    fetchImpl: async (url, init = {}) => {
      seenRequests.push({
        url,
        method: init.method || "GET",
        headers: { ...(init.headers || {}) },
      });

      if (url === "/api/v1/spools/spool-1/weight" && seenRequests.length === 1) {
        return jsonResponse(401, { ok: false, message: "Missing companion session" });
      }
      if (url === "/api/v1/auth/renew") {
        assert.equal(init.method, "POST");
        return jsonResponse(200, { ok: true, csrf_token: "fresh-csrf" });
      }
      if (url === "/api/v1/spools/spool-1/weight") {
        assert.equal(init.headers["x-csrf-token"], "fresh-csrf");
        return jsonResponse(200, { ok: true, message: "Weight updated." });
      }

      throw new Error(`Unexpected fetch call: ${url}`);
    },
  });

  const result = await client.fetchJson("/api/v1/spools/spool-1/weight", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-csrf-token": "stale-csrf",
    },
    body: JSON.stringify({ grams: 900 }),
  });

  assert.deepEqual(result, { ok: true, message: "Weight updated." });
  assert.equal(session.csrfToken, "fresh-csrf");
  assert.equal(session.reauthPromise, null);
  assert.deepEqual(statusUpdates, [
    {
      message: "Trusted-LAN session expired. Trying paired browser renewal...",
      tone: "default",
    },
    {
      message: "Trusted-LAN session restored.",
      tone: "success",
    },
  ]);
  assert.equal(renderCount, 1);
  assert.deepEqual(
    seenRequests.map((request) => request.url),
    ["/api/v1/spools/spool-1/weight", "/api/v1/auth/renew", "/api/v1/spools/spool-1/weight"],
  );
});

test("pairSession stores trusted-LAN session mode and csrf state", async () => {
  const session = createInitialCompanionState();
  const client = createCompanionApiClient({
    session,
    fetchImpl: async (url) => {
      assert.equal(url, "/api/v1/auth/pair");
      return jsonResponse(200, {
        ok: true,
        csrf_token: "csrf-token",
        access_mode: "trusted-lan",
        auth_mode: "pairing-session",
      });
    },
  });

  await client.pairSession(" pairing-token ");

  assert.equal(session.apiReady, true);
  assert.equal(session.csrfToken, "csrf-token");
  assert.equal(session.accessMode, "trusted-lan");
  assert.equal(session.authMode, "pairing-session");
});
