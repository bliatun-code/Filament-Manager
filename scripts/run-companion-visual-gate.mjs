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

function routeUrl(baseUrl, route) {
  return new URL(route, `${baseUrl}/`).toString();
}

function createTimeoutSignal(timeoutMs) {
  if (typeof AbortSignal !== "undefined" && typeof AbortSignal.timeout === "function") {
    return AbortSignal.timeout(timeoutMs);
  }
  const controller = new AbortController();
  setTimeout(() => controller.abort(), timeoutMs).unref?.();
  return controller.signal;
}

async function fetchText(baseUrl, route, timeoutMs) {
  const url = routeUrl(baseUrl, route);
  const response = await fetch(url, {
    headers: { accept: "text/html,application/json,text/css,application/javascript,*/*" },
    signal: createTimeoutSignal(timeoutMs),
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`${route} returned HTTP ${response.status}: ${text.slice(0, 160)}`);
  }
  return text;
}

async function fetchJson(baseUrl, route, timeoutMs) {
  const text = await fetchText(baseUrl, route, timeoutMs);
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
  const baseUrl = normalizeCompanionBaseUrl(options.baseUrl);
  if (!baseUrl) {
    throw new Error("Companion visual gate needs a companion base URL.");
  }
  const timeoutMs = options.timeoutMs ?? 4_000;
  const minimums = {
    ...DEFAULT_COMPANION_VISUAL_MINIMUMS,
    ...(options.minimums ?? {}),
  };

  const [shellHtml, css, js, health, snapshot, spools, printers, loans, consumption, wishlist] =
    await Promise.all([
      fetchText(baseUrl, "/companion", timeoutMs),
      fetchText(baseUrl, "/companion/app.css", timeoutMs),
      fetchText(baseUrl, "/companion/app.js", timeoutMs),
      fetchJson(baseUrl, "/api/v1/health", timeoutMs),
      fetchJson(baseUrl, "/api/v1/library/snapshot", timeoutMs),
      fetchJson(baseUrl, "/api/v1/library/spools?limit=24", timeoutMs),
      fetchJson(baseUrl, "/api/v1/library/printers", timeoutMs),
      fetchJson(baseUrl, "/api/v1/library/loans?limit=24", timeoutMs),
      fetchJson(baseUrl, "/api/v1/library/statistics/filament-consumption?limit=24", timeoutMs),
      fetchJson(baseUrl, "/api/v1/library/wishlist?limit=24", timeoutMs),
    ]);

  const errors = [];
  assertIncludes(errors, "companion shell", shellHtml, [
    'id="app"',
    "/companion/app.css",
    "/companion/app.js",
  ]);
  assertIncludes(errors, "companion CSS", css, [
    ".companion-shell",
    ".swatch-surface",
    ".list-row",
  ]);
  assertIncludes(errors, "companion JS", js, [
    "createCompanionAppShellRenderer",
    "refreshOverview",
  ]);

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
  if (snapshot?.ok !== true) {
    errors.push("library snapshot did not report ok=true");
  }

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

  return {
    baseUrl,
    counts: {
      activeLoans,
      consumptionRows: consumptionCount,
      livePrinterSlots,
      loans: loanCount,
      printers: printerCount,
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
  const dbResult = await prepareVisualQaDatabase({
    live: true,
    profile,
    sourcePath,
  });
  const baseUrl = normalizeCompanionBaseUrl(
    urlArg || dbResult.inspection.details?.trustedLanCompanionUrl,
  );

  console.log(formatVisualQaDatasetReport(dbResult));
  const result = await runCompanionVisualGate({ baseUrl, timeoutMs });
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
