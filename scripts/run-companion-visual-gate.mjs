import { pathToFileURL } from "node:url";
import {
  formatVisualQaDatasetReport,
  prepareVisualQaDatabase,
} from "./visual-qa-db.mjs";

export const DEFAULT_COMPANION_VISUAL_MINIMUMS = {
  activeLoans: 1,
  consumptionRows: 1,
  loans: 1,
  printers: 1,
  spools: 1,
  swatchRows: 1,
  livePrinterSlots: 1,
  protectedDetail: 1,
  protectedLoadedSlots: 1,
  protectedLoans: 1,
  protectedPrinters: 1,
  protectedSlotCards: 1,
  protectedSpools: 1,
  protectedSwatchRows: 1,
  wishlistRows: 1,
};

function parseArgValue(argv, name) {
  const index = argv.indexOf(name);
  return index >= 0 ? argv[index + 1] : null;
}

function parseIntegerArg(argv, name, fallback) {
  const value = parseArgValue(argv, name);
  if (value == null) {
    return fallback;
  }
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

export function normalizeCompanionBaseUrl(raw) {
  const trimmed = String(raw ?? "").trim();
  if (!trimmed) {
    return null;
  }
  const url = new URL(trimmed);
  return url.origin;
}

export function normalizeCompanionQaLoopbackBaseUrl(raw) {
  const baseUrl = normalizeCompanionBaseUrl(raw);
  if (!baseUrl) {
    return null;
  }
  const url = new URL(baseUrl);
  if (url.protocol !== "http:" || url.hostname !== "127.0.0.1") {
    throw new Error(
      "Companion QA authentication is restricted to http://127.0.0.1 loopback URLs.",
    );
  }
  return baseUrl;
}

function routeUrl(baseUrl, route) {
  return new URL(route, `${baseUrl}/`).toString();
}

function setCookieHeaders(headers) {
  if (typeof headers.getSetCookie === "function") {
    return headers.getSetCookie();
  }
  const combined = headers.get("set-cookie");
  if (!combined) {
    return [];
  }
  return combined.split(/,(?=\s*[^;,=]+=[^;,]+)/).map((value) => value.trim());
}

function storeResponseCookies(cookieJar, headers) {
  if (!cookieJar) {
    return;
  }
  for (const setCookie of setCookieHeaders(headers)) {
    const cookiePair = setCookie.split(";")[0]?.trim();
    const separatorIndex = cookiePair?.indexOf("=") ?? -1;
    if (!cookiePair || separatorIndex <= 0) {
      continue;
    }
    const name = cookiePair.slice(0, separatorIndex);
    const value = cookiePair.slice(separatorIndex + 1);
    cookieJar.set(name, value);
  }
}

function cookieHeader(cookieJar) {
  if (!cookieJar || cookieJar.size === 0) {
    return null;
  }
  return [...cookieJar.entries()].map(([name, value]) => `${name}=${value}`).join("; ");
}

function createTimeoutSignal(timeoutMs) {
  if (typeof AbortSignal !== "undefined" && typeof AbortSignal.timeout === "function") {
    return AbortSignal.timeout(timeoutMs);
  }
  const controller = new AbortController();
  setTimeout(() => controller.abort(), timeoutMs).unref?.();
  return controller.signal;
}

async function fetchText(baseUrl, route, timeoutMs, options = {}) {
  const url = routeUrl(baseUrl, route);
  const headers = {
    accept: "text/html,application/json,text/css,application/javascript,*/*",
    ...(options.headers ?? {}),
  };
  const cookie = cookieHeader(options.cookieJar);
  if (cookie) {
    headers.cookie = cookie;
  }
  const response = await fetch(url, {
    headers,
    method: options.method ?? "GET",
    signal: createTimeoutSignal(timeoutMs),
  });
  storeResponseCookies(options.cookieJar, response.headers);
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`${route} returned HTTP ${response.status}: ${text.slice(0, 160)}`);
  }
  return text;
}

async function fetchJson(baseUrl, route, timeoutMs, options = {}) {
  const text = await fetchText(baseUrl, route, timeoutMs, options);
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error(`${route} did not return JSON: ${error.message}`);
  }
}

function countHexValues(value) {
  if (typeof value === "string") {
    return /^#[0-9a-fA-F]{6}$/.test(value.trim()) ? 1 : 0;
  }
  if (Array.isArray(value)) {
    return value.reduce((total, entry) => total + countHexValues(entry), 0);
  }
  if (value && typeof value === "object") {
    return Object.values(value).reduce((total, entry) => total + countHexValues(entry), 0);
  }
  return 0;
}

function countLivePrinterSlots(printers) {
  if (!Array.isArray(printers)) {
    return 0;
  }
  return printers.reduce((total, printer) => {
    const slots = Array.isArray(printer?.slots) ? printer.slots : [];
    return (
      total +
      slots.filter((slot) =>
        Boolean(
          slot?.live_loaded ||
            slot?.live_mqtt_connected ||
            slot?.live_printer_last_seen_at ||
            slot?.live_observed_rfid_tag,
        ),
      ).length
    );
  }, 0);
}

function countPrinterSlots(printers) {
  if (!Array.isArray(printers)) {
    return 0;
  }
  return printers.reduce((total, printer) => {
    const slots = Array.isArray(printer?.slots) ? printer.slots : [];
    return total + slots.length;
  }, 0);
}

function countLoadedPrinterSlots(printers) {
  if (!Array.isArray(printers)) {
    return 0;
  }
  return printers.reduce((total, printer) => {
    const slots = Array.isArray(printer?.slots) ? printer.slots : [];
    return (
      total +
      slots.filter((slot) => Boolean(slot?.spool_id || slot?.live_loaded)).length
    );
  }, 0);
}

function firstSpoolId(spools) {
  if (!Array.isArray(spools)) {
    return null;
  }
  for (const entry of spools) {
    const id = entry?.spool?.id ?? entry?.id;
    if (typeof id === "string" && id.trim()) {
      return id.trim();
    }
  }
  return null;
}

async function readAuthenticatedCompanionData(baseUrl, timeoutMs) {
  const cookieJar = new Map();
  const qaSession = await fetchJson(baseUrl, "/api/v1/qa/session", timeoutMs, { cookieJar });
  const session = await fetchJson(baseUrl, "/api/v1/auth/session", timeoutMs, { cookieJar });
  const [
    snapshot,
    spools,
    printers,
    loans,
    consumption,
    wishlist,
    inventorySpools,
    printerOverview,
    protectedLoans,
    protectedWishlist,
  ] = await Promise.all([
    fetchJson(baseUrl, "/api/v1/library/snapshot", timeoutMs, { cookieJar }),
    fetchJson(baseUrl, "/api/v1/library/spools?limit=24", timeoutMs, { cookieJar }),
    fetchJson(baseUrl, "/api/v1/library/printers", timeoutMs, { cookieJar }),
    fetchJson(baseUrl, "/api/v1/library/loans?limit=24", timeoutMs, { cookieJar }),
    fetchJson(baseUrl, "/api/v1/library/statistics/filament-consumption?limit=24", timeoutMs, {
      cookieJar,
    }),
    fetchJson(baseUrl, "/api/v1/library/wishlist?limit=24", timeoutMs, { cookieJar }),
    fetchJson(baseUrl, "/api/v1/inventory/spools?limit=24&offset=0", timeoutMs, { cookieJar }),
    fetchJson(baseUrl, "/api/v1/printers/overview", timeoutMs, { cookieJar }),
    fetchJson(baseUrl, "/api/v1/loans?limit=24&include_returned=true", timeoutMs, { cookieJar }),
    fetchJson(baseUrl, "/api/v1/wishlist?limit=24", timeoutMs, { cookieJar }),
  ]);

  const detailSpoolId = firstSpoolId(inventorySpools);
  const detail = detailSpoolId
    ? await fetchJson(
        baseUrl,
        `/api/v1/spools/${encodeURIComponent(detailSpoolId)}?history_limit=12&usage_limit=12`,
        timeoutMs,
        { cookieJar },
      )
    : null;

  return {
    cookieCount: cookieJar.size,
    consumption,
    detail,
    detailSpoolId,
    inventorySpools,
    loans,
    printers,
    printerOverview,
    protectedLoans,
    protectedWishlist,
    qaSession,
    session,
    snapshot,
    spools,
    wishlist,
  };
}

function assertAtLeast(errors, label, actual, minimum) {
  if (actual < minimum) {
    errors.push(`${label} expected at least ${minimum}, found ${actual}`);
  }
}

function assertIncludes(errors, label, content, requiredParts) {
  for (const part of requiredParts) {
    if (!content.includes(part)) {
      errors.push(`${label} is missing ${part}`);
    }
  }
}

export async function runCompanionVisualGate(options = {}) {
  const baseUrl = normalizeCompanionQaLoopbackBaseUrl(options.baseUrl);
  if (!baseUrl) {
    throw new Error("Companion visual gate needs a companion base URL.");
  }
  const timeoutMs = options.timeoutMs ?? 4_000;
  const authenticate = options.authenticate !== false;
  const minimums = {
    ...DEFAULT_COMPANION_VISUAL_MINIMUMS,
    ...(options.minimums ?? {}),
  };

  const [shellHtml, css, workspaceCss, js, health] = await Promise.all([
    fetchText(baseUrl, "/companion", timeoutMs),
    fetchText(baseUrl, "/companion/app.css", timeoutMs),
    fetchText(baseUrl, "/companion/workspace.css", timeoutMs),
    fetchText(baseUrl, "/companion/app.js", timeoutMs),
    fetchJson(baseUrl, "/api/v1/health", timeoutMs),
  ]);

  const errors = [];
  let authenticatedData = null;
  if (!authenticate) {
    errors.push(
      "Companion library data requires an authenticated QA session; rerun without --skip-auth.",
    );
  }
  assertIncludes(errors, "companion shell", shellHtml, [
    'id="app"',
    "/companion/app.css",
    "/companion/workspace.css",
    "/companion/app.js",
  ]);
  assertIncludes(errors, "companion CSS", css, [
    ".companion-shell",
    ".swatch-surface",
    ".list-row",
  ]);
  assertIncludes(errors, "companion workspace CSS", workspaceCss, [
    ".shell-main",
    ".workflow-stage",
    ".detail-panel",
  ]);
  assertIncludes(errors, "companion JS", js, [
    "createCompanionAppShellRenderer",
    "refreshOverview",
  ]);

  if (authenticate) {
    try {
      authenticatedData = await readAuthenticatedCompanionData(baseUrl, timeoutMs);
    } catch (error) {
      errors.push(`QA authenticated companion session failed: ${error.message}`);
    }
  }

  const snapshot = authenticatedData?.snapshot ?? null;
  const spools = authenticatedData?.spools ?? [];
  const printers = authenticatedData?.printers ?? [];
  const loans = authenticatedData?.loans ?? [];
  const consumption = authenticatedData?.consumption ?? [];
  const wishlist = authenticatedData?.wishlist ?? [];

  const spoolCount = Array.isArray(spools) ? spools.length : 0;
  const printerCount = Array.isArray(printers) ? printers.length : 0;
  const loanCount = Array.isArray(loans) ? loans.length : 0;
  const consumptionCount = Array.isArray(consumption) ? consumption.length : 0;
  const wishlistCount = Array.isArray(wishlist) ? wishlist.length : 0;
  const swatchRows = countHexValues(spools) + countHexValues(loans) + countHexValues(consumption);
  const livePrinterSlots = countLivePrinterSlots(printers);
  const activeLoans = Number(snapshot?.active_loans ?? 0);
  const snapshotSpools = Number(snapshot?.inventory?.total_spools ?? 0);
  const snapshotPrinters = Number(snapshot?.printers ?? 0);

  if (health?.ok !== true) {
    errors.push("health endpoint did not report ok=true");
  }
  if (authenticate && snapshot?.ok !== true) {
    errors.push("library snapshot did not report ok=true");
  }

  const protectedSpoolCount = Array.isArray(authenticatedData?.inventorySpools)
    ? authenticatedData.inventorySpools.length
    : 0;
  const protectedPrinterCount = Array.isArray(authenticatedData?.printerOverview)
    ? authenticatedData.printerOverview.length
    : 0;
  const protectedLoanCount = Array.isArray(authenticatedData?.protectedLoans)
    ? authenticatedData.protectedLoans.length
    : 0;
  const protectedWishlistCount = Array.isArray(authenticatedData?.protectedWishlist)
    ? authenticatedData.protectedWishlist.length
    : 0;
  const detailLoaded = authenticatedData?.detail?.spool ? 1 : 0;
  const detailHistoryRows = Array.isArray(authenticatedData?.detail?.history)
    ? authenticatedData.detail.history.length
    : 0;
  const detailUsageRows = Array.isArray(authenticatedData?.detail?.usage)
    ? authenticatedData.detail.usage.length
    : 0;
  const protectedSlotCards = countPrinterSlots(authenticatedData?.printerOverview);
  const protectedLoadedSlots = countLoadedPrinterSlots(authenticatedData?.printerOverview);
  const protectedSwatchRows =
    countHexValues(authenticatedData?.inventorySpools) +
    countHexValues(authenticatedData?.protectedLoans) +
    countHexValues(authenticatedData?.printerOverview) +
    countHexValues(authenticatedData?.detail);

  if (authenticate && authenticatedData?.session?.authenticated !== true) {
    errors.push("QA authenticated companion session did not become authenticated");
  }

  if (authenticate) {
    assertAtLeast(errors, "snapshot inventory spools", snapshotSpools, minimums.spools);
    assertAtLeast(errors, "snapshot printers", snapshotPrinters, minimums.printers);
    assertAtLeast(errors, "active loans", activeLoans, minimums.activeLoans);
    assertAtLeast(errors, "spool rows", spoolCount, minimums.spools);
    assertAtLeast(errors, "printer rows", printerCount, minimums.printers);
    assertAtLeast(errors, "loan rows", loanCount, minimums.loans);
    assertAtLeast(errors, "consumption rows", consumptionCount, minimums.consumptionRows);
    assertAtLeast(errors, "wishlist rows", wishlistCount, minimums.wishlistRows);
    assertAtLeast(errors, "swatch-colored rows", swatchRows, minimums.swatchRows);
    assertAtLeast(errors, "live printer slots", livePrinterSlots, minimums.livePrinterSlots);
    assertAtLeast(errors, "protected spool rows", protectedSpoolCount, minimums.protectedSpools);
    assertAtLeast(
      errors,
      "protected printer rows",
      protectedPrinterCount,
      minimums.protectedPrinters,
    );
    assertAtLeast(
      errors,
      "protected printer slot cards",
      protectedSlotCards,
      minimums.protectedSlotCards,
    );
    assertAtLeast(
      errors,
      "protected loaded slots",
      protectedLoadedSlots,
      minimums.protectedLoadedSlots,
    );
    assertAtLeast(errors, "protected loan rows", protectedLoanCount, minimums.protectedLoans);
    assertAtLeast(errors, "protected spool detail", detailLoaded, minimums.protectedDetail);
    assertAtLeast(
      errors,
      "protected swatch-colored data",
      protectedSwatchRows,
      minimums.protectedSwatchRows,
    );
  }

  return {
    baseUrl,
    counts: {
      activeLoans,
      consumptionRows: consumptionCount,
      livePrinterSlots,
      loans: loanCount,
      printers: printerCount,
      protectedDetail: detailLoaded,
      protectedDetailHistoryRows: detailHistoryRows,
      protectedDetailUsageRows: detailUsageRows,
      protectedLoadedSlots,
      protectedLoans: protectedLoanCount,
      protectedPrinters: protectedPrinterCount,
      protectedSlotCards,
      protectedSpools: protectedSpoolCount,
      protectedSwatchRows,
      protectedWishlistRows: protectedWishlistCount,
      snapshotPrinters,
      snapshotSpools,
      spools: spoolCount,
      swatchRows,
      wishlistRows: wishlistCount,
    },
    errors,
    health: {
      accessMode: health?.access_mode ?? null,
      authMode: health?.auth_mode ?? null,
      syncMode: health?.sync_mode ?? null,
    },
    session: {
      attempted: authenticate,
      authenticated: authenticatedData?.session?.authenticated === true,
      cookieCount: authenticatedData?.cookieCount ?? 0,
      detailSpoolId: authenticatedData?.detailSpoolId ?? null,
      ok: authenticatedData?.qaSession?.ok === true,
    },
  };
}

export function formatCompanionVisualGateReport(result) {
  const lines = [
    `Companion visual gate target: ${result.baseUrl}/companion`,
    `Companion access: ${result.health.accessMode ?? "unknown"} / ${
      result.health.authMode ?? "unknown"
    } / ${result.health.syncMode ?? "unknown"}`,
    "Companion visual gate counts:",
    `  - snapshot spools: ${result.counts.snapshotSpools}`,
    `  - snapshot printers: ${result.counts.snapshotPrinters}`,
    `  - active loans: ${result.counts.activeLoans}`,
    `  - spool rows sampled: ${result.counts.spools}`,
    `  - printer rows: ${result.counts.printers}`,
    `  - live printer slots: ${result.counts.livePrinterSlots}`,
    `  - loan rows sampled: ${result.counts.loans}`,
    `  - usage/stat rows sampled: ${result.counts.consumptionRows}`,
    `  - wishlist rows sampled: ${result.counts.wishlistRows}`,
    `  - swatch-colored data points: ${result.counts.swatchRows}`,
  ];
  if (result.session.attempted) {
    lines.push(
      `Companion QA session: ${
        result.session.authenticated ? "authenticated" : "not authenticated"
      }`,
      `  - protected spool rows sampled: ${result.counts.protectedSpools}`,
      `  - protected printer rows: ${result.counts.protectedPrinters}`,
      `  - protected printer slot cards: ${result.counts.protectedSlotCards}`,
      `  - protected loaded slots: ${result.counts.protectedLoadedSlots}`,
      `  - protected loan rows sampled: ${result.counts.protectedLoans}`,
      `  - protected wishlist rows sampled: ${result.counts.protectedWishlistRows}`,
      `  - protected swatch-colored data points: ${result.counts.protectedSwatchRows}`,
      `  - detail loaded for: ${result.session.detailSpoolId ?? "none"}`,
      `  - detail history/usage rows: ${result.counts.protectedDetailHistoryRows}/${result.counts.protectedDetailUsageRows}`,
    );
  }
  if (result.errors.length > 0) {
    lines.push("Companion visual gate errors:");
    for (const error of result.errors) {
      lines.push(`  - ${error}`);
    }
  } else {
    lines.push("Companion visual gate ok.");
  }
  return lines.join("\n");
}

async function runCli() {
  const argv = process.argv.slice(2);
  const urlArg = parseArgValue(argv, "--url");
  const sourcePath = parseArgValue(argv, "--source");
  const profile = parseArgValue(argv, "--profile");
  const timeoutMs = parseIntegerArg(argv, "--timeout-ms", 4_000);
  const authenticate = !argv.includes("--skip-auth");
  const dbResult = await prepareVisualQaDatabase({
    live: true,
    profile,
    sourcePath,
  });
  const baseUrl = normalizeCompanionBaseUrl(
    urlArg || dbResult.inspection.details?.trustedLanCompanionUrl,
  );

  console.log(formatVisualQaDatasetReport(dbResult));
  const result = await runCompanionVisualGate({ authenticate, baseUrl, timeoutMs });
  console.log(formatCompanionVisualGateReport(result));
  if (result.errors.length > 0) {
    process.exit(1);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runCli().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}
