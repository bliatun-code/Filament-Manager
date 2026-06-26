import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";

export const DEFAULT_BASE_URLS = [
  "https://us.store.bambulab.com",
  "https://eu.store.bambulab.com",
  "https://store.bambulab.com",
];
export const DEFAULT_COLLECTION_HANDLE = "bambu-lab-3d-printer-filament";
export const DEFAULT_DB_PATH = "./filament-manager.db";
export const APP_DB_PATH_ENV_VAR = "FILAMENT_MANAGER_DB_PATH";
export const LEGACY_APP_DB_PATH_ENV_VAR = "BAMBU_DB_PATH";
const DEFAULT_WEIGHT_G = 1000;
const REQUEST_TIMEOUT_MS = Number.parseInt(process.env.BAMBU_TIMEOUT_MS ?? "20000", 10);
const MAX_FETCH_RETRIES = Number.parseInt(process.env.BAMBU_FETCH_RETRIES ?? "2", 10);
const PRODUCT_FETCH_RETRIES = Number.parseInt(
  process.env.BAMBU_PRODUCT_FETCH_RETRIES ?? "1",
  10,
);
const PRODUCT_REQUEST_DELAY_MS = Number.parseInt(
  process.env.BAMBU_PRODUCT_DELAY_MS ?? "750",
  10,
);
const PRODUCT_REQUEST_DELAY_JITTER_MS = Number.parseInt(
  process.env.BAMBU_PRODUCT_DELAY_JITTER_MS ?? "350",
  10,
);
const PRODUCT_ANTIBOT_COOLDOWN_MS = Number.parseInt(
  process.env.BAMBU_PRODUCT_ANTIBOT_COOLDOWN_MS ?? "3500",
  10,
);
const MAX_CONSECUTIVE_ANTIBOT = Number.parseInt(
  process.env.BAMBU_MAX_CONSECUTIVE_ANTIBOT ?? "4",
  10,
);

type ShopifyImage = {
  src?: string;
};

type ShopifyVariant = {
  id: number;
  option1?: string;
  option2?: string;
  option3?: string;
  featured_image?: ShopifyImage | null;
};

type ShopifyProduct = {
  id: number;
  title: string;
  handle: string;
  product_type?: string;
  options?: Array<{ name: string }>;
  images?: ShopifyImage[];
  image?: ShopifyImage | null;
  variants?: ShopifyVariant[];
};

type ColorEntry = {
  material: string;
  filamentName: string;
  colorName: string;
  hexColor: string | null;
  imageUrl: string | null;
  productUrl: string;
};

type DbWriter = {
  upsert: (entry: ColorEntry) => void;
  close: () => void;
};

export type ScrapeOptions = {
  baseUrls?: string[];
  collectionHandle?: string;
  dbPath?: string;
  verbose?: boolean;
  materialTypes?: string[];
};

function dbPathFromEnv(): string | undefined {
  const current = process.env[APP_DB_PATH_ENV_VAR]?.trim();
  if (current) {
    return current;
  }

  const legacy = process.env[LEGACY_APP_DB_PATH_ENV_VAR]?.trim();
  return legacy || undefined;
}

type FetchResult = {
  baseUrl: string;
  products: ShopifyProduct[];
  discoveredMaterials: string[];
  productsDiscovered: number;
};

type ProductsPageResult = {
  products: ShopifyProduct[];
  antiBotBlocked: boolean;
  requestFailed: boolean;
};

type ProductSummary = {
  name: string;
  seoCode: string;
  mediaFiles?: string[];
};

type NextStoreResult = {
  baseUrl: string;
  entries: ColorEntry[];
  discoveredMaterials: string[];
  warnings: string[];
  antiBotBlocks: number;
  productsDiscovered: number;
  productsDetailed: number;
  partial: boolean;
};

type FetchRetryOptions = {
  retries?: number;
  backoffBaseMs?: number;
  backoffCapMs?: number;
};

type FetchTextResult = {
  text: string | null;
  status: number | null;
};

type BambuMaterialFamily = {
  material: string;
  prefixes: string[];
};

const BAMBU_MATERIAL_FAMILIES = JSON.parse(
  fs.readFileSync(new URL("../data/bambu_material_families.json", import.meta.url), "utf8"),
) as BambuMaterialFamily[];

type ColorOption = {
  colorName: string;
  imageUrl: string | null;
};

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, "");
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchWithRetry(
  url: string,
  init: RequestInit,
  verbose: boolean,
  options: FetchRetryOptions = {},
): Promise<Response | null> {
  const retries = Number.isFinite(options.retries) && (options.retries ?? 0) >= 0
    ? Math.trunc(options.retries as number)
    : Number.isFinite(MAX_FETCH_RETRIES) && MAX_FETCH_RETRIES >= 0
      ? MAX_FETCH_RETRIES
      : 2;
  const backoffBaseMs = Number.isFinite(options.backoffBaseMs) && (options.backoffBaseMs ?? 0) > 0
    ? Math.trunc(options.backoffBaseMs as number)
    : 700;
  const backoffCapMs = Number.isFinite(options.backoffCapMs) && (options.backoffCapMs ?? 0) > 0
    ? Math.trunc(options.backoffCapMs as number)
    : 15000;
  const timeoutMs = Number.isFinite(REQUEST_TIMEOUT_MS) && REQUEST_TIMEOUT_MS > 0
    ? REQUEST_TIMEOUT_MS
    : 20000;
  const jitterMs = Math.max(0, PRODUCT_REQUEST_DELAY_JITTER_MS);

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, { ...init, signal: controller.signal });
      clearTimeout(timeout);

      if ((response.status === 429 || response.status >= 500) && attempt < retries) {
        if (verbose) {
          console.warn(
            `Scraper: retrying ${url} after ${response.status} (attempt ${attempt + 1}/${retries + 1})`,
          );
        }
        const base =
          response.status === 429 ? Math.max(backoffBaseMs, 1800) : backoffBaseMs;
        const waitMs = Math.min(base * (attempt + 1), backoffCapMs) +
          Math.floor(Math.random() * (jitterMs + 1));
        await delay(waitMs);
        continue;
      }
      return response;
    } catch (error) {
      clearTimeout(timeout);
      if (attempt >= retries) {
        if (verbose) {
          console.warn(`Scraper: request failed ${url}: ${String(error)}`);
        }
        return null;
      }
      if (verbose) {
        console.warn(
          `Scraper: transient request error ${url} (attempt ${attempt + 1}/${retries + 1})`,
        );
      }
      const waitMs = Math.min(backoffBaseMs * (attempt + 1), backoffCapMs) +
        Math.floor(Math.random() * (jitterMs + 1));
      await delay(waitMs);
    }
  }

  return null;
}

function extractRawJsString(
  source: string,
  startIndex: number,
): { raw: string; endIndex: number } {
  let i = startIndex;
  while (i < source.length) {
    if (source[i] === "\"") {
      let backslashes = 0;
      let j = i - 1;
      while (j >= startIndex && source[j] === "\\") {
        backslashes += 1;
        j -= 1;
      }
      if (backslashes % 2 === 0) {
        return { raw: source.slice(startIndex, i), endIndex: i };
      }
    }
    i += 1;
  }
  return { raw: source.slice(startIndex), endIndex: source.length };
}

function decodeJsStringLiteral(value: string): string {
  let result = "";
  for (let i = 0; i < value.length; i += 1) {
    const ch = value[i];
    if (ch !== "\\") {
      result += ch;
      continue;
    }

    const next = value[i + 1];
    if (next === undefined) {
      result += "\\";
      continue;
    }

    if (next === "\n") {
      i += 1;
      continue;
    }
    if (next === "\r") {
      if (value[i + 2] === "\n") {
        i += 2;
      } else {
        i += 1;
      }
      continue;
    }

    switch (next) {
      case "n":
        result += "\n";
        i += 1;
        break;
      case "r":
        result += "\r";
        i += 1;
        break;
      case "t":
        result += "\t";
        i += 1;
        break;
      case "b":
        result += "\b";
        i += 1;
        break;
      case "f":
        result += "\f";
        i += 1;
        break;
      case "v":
        result += "\v";
        i += 1;
        break;
      case "\\":
        result += "\\";
        i += 1;
        break;
      case "\"":
        result += "\"";
        i += 1;
        break;
      case "'":
        result += "'";
        i += 1;
        break;
      case "0": {
        const nextNext = value[i + 2];
        if (nextNext && /[0-9]/.test(nextNext)) {
          result += "0";
        } else {
          result += "\0";
          i += 1;
        }
        break;
      }
      case "x": {
        const hex = value.slice(i + 2, i + 4);
        if (/^[0-9a-fA-F]{2}$/.test(hex)) {
          result += String.fromCharCode(parseInt(hex, 16));
          i += 3;
        } else {
          result += "x";
          i += 1;
        }
        break;
      }
      case "u": {
        const brace = value[i + 2];
        if (brace === "{") {
          const end = value.indexOf("}", i + 3);
          if (end !== -1) {
            const hex = value.slice(i + 3, end);
            if (/^[0-9a-fA-F]+$/.test(hex)) {
              result += String.fromCodePoint(parseInt(hex, 16));
              i = end;
              break;
            }
          }
          result += "u";
          i += 1;
          break;
        }
        const hex = value.slice(i + 2, i + 6);
        if (/^[0-9a-fA-F]{4}$/.test(hex)) {
          result += String.fromCharCode(parseInt(hex, 16));
          i += 5;
        } else {
          result += "u";
          i += 1;
        }
        break;
      }
      default:
        result += next;
        i += 1;
        break;
    }
  }
  return result;
}

function loadSchemaSql(): string | null {
  const schemaUrl = new URL("../database/schema.sql", import.meta.url);
  if (!fs.existsSync(schemaUrl)) {
    return null;
  }
  return fs.readFileSync(schemaUrl, "utf8");
}

function escapeSql(value: string): string {
  return value.replace(/'/g, "''");
}

function toSqlValue(value: string | number | null): string {
  if (value === null || value === undefined) {
    return "NULL";
  }
  if (typeof value === "number") {
    return Number.isFinite(value) ? String(value) : "NULL";
  }
  return `'${escapeSql(value)}'`;
}

function buildUpsertSql(entry: ColorEntry): string {
  const id = buildId(entry.material, entry.filamentName, entry.colorName);
  return `INSERT INTO filament_master_list (\n      id, material, filament_name, color_name, hex_color, product_url,\n      default_weight, vendor, last_seen_at\n    ) VALUES (\n      ${toSqlValue(id)},\n      ${toSqlValue(entry.material)},\n      ${toSqlValue(entry.filamentName)},\n      ${toSqlValue(entry.colorName)},\n      ${toSqlValue(entry.hexColor)},\n      ${toSqlValue(entry.productUrl)},\n      ${DEFAULT_WEIGHT_G},\n      'Bambu',\n      datetime('now')\n    )\n    ON CONFLICT(material, filament_name, color_name) DO UPDATE SET\n      hex_color = excluded.hex_color,\n      product_url = excluded.product_url,\n      default_weight = excluded.default_weight,\n      vendor = 'Bambu',\n      last_seen_at = datetime('now'),\n      updated_at = datetime('now');`;
}

function createBetterSqliteWriter(
  DatabaseCtor: new (path: string) => {
    exec: (sql: string) => void;
    prepare: (sql: string) => { run: (...args: unknown[]) => void };
    close: () => void;
  },
  dbPath: string,
): DbWriter {
  const db = new DatabaseCtor(dbPath);
  db.exec("PRAGMA foreign_keys = ON;");
  const schema = loadSchemaSql();
  if (schema) {
    db.exec(schema);
  }
  const stmt = db.prepare(
    `INSERT INTO filament_master_list (
      id, material, filament_name, color_name, hex_color, product_url,
      default_weight, vendor, last_seen_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, 'Bambu', datetime('now'))
    ON CONFLICT(material, filament_name, color_name) DO UPDATE SET
      hex_color = excluded.hex_color,
      product_url = excluded.product_url,
      default_weight = excluded.default_weight,
      vendor = 'Bambu',
      last_seen_at = datetime('now'),
      updated_at = datetime('now')`,
  );

  return {
    upsert(entry) {
      const id = buildId(entry.material, entry.filamentName, entry.colorName);
      stmt.run(
        id,
        entry.material,
        entry.filamentName,
        entry.colorName,
        entry.hexColor,
        entry.productUrl,
        DEFAULT_WEIGHT_G,
      );
    },
    close() {
      db.close();
    },
  };
}

function createSqliteCliWriter(dbPath: string, verbose: boolean): DbWriter {
  const schema = loadSchemaSql();
  const statements: string[] = [];
  if (schema) {
    statements.push(schema.trim());
  }
  statements.push("BEGIN;");

  return {
    upsert(entry) {
      statements.push(buildUpsertSql(entry));
    },
    close() {
      statements.push("COMMIT;");
      const sql = `${statements.join("\n")}\n`;
      const result = spawnSync("sqlite3", [dbPath], {
        input: sql,
        encoding: "utf8",
      });
      if (result.status !== 0 || result.error) {
        const sqlPath = `${dbPath}.import.sql`;
        fs.writeFileSync(sqlPath, sql, "utf8");
        const reason =
          result.error?.message ??
          result.stderr ??
          "sqlite3 CLI failed to import data.";
        const message = `Scraper: sqlite3 CLI import failed. Wrote SQL to ${sqlPath}. ${reason}`;
        if (verbose) {
          console.warn(message);
        }
        throw new Error(message);
      }
    },
  };
}

function isNodeModuleVersionMismatch(message: string): boolean {
  return (
    message.includes("NODE_MODULE_VERSION") &&
    message.toLowerCase().includes("compiled against a different node.js version")
  );
}

function summarizeBetterSqliteImportError(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error);
  const compact = raw.replace(/\s+/g, " ").trim();
  if (isNodeModuleVersionMismatch(compact)) {
    return `${compact} Run \`npm rebuild better-sqlite3\` to rebuild native bindings for Node ${process.versions.node}.`;
  }
  return compact;
}

function ensureSqliteCliAvailable(): void {
  const probe = spawnSync("sqlite3", ["--version"], { encoding: "utf8" });
  if (probe.status !== 0 || probe.error) {
    const reason = probe.error?.message ?? probe.stderr?.trim() ?? "sqlite3 CLI unavailable";
    throw new Error(
      `sqlite3 CLI is required for fallback writes but is unavailable. ${reason}`,
    );
  }
}

async function createDbWriter(dbPath: string, verbose: boolean): Promise<DbWriter> {
  const forceSqliteCli = process.env.BAMBU_FORCE_SQLITE_CLI === "1";
  if (forceSqliteCli) {
    ensureSqliteCliAvailable();
    const directory = path.dirname(dbPath);
    if (!fs.existsSync(directory)) {
      fs.mkdirSync(directory, { recursive: true });
    }
    if (verbose) {
      console.warn("Scraper: using sqlite3 CLI writer (BAMBU_FORCE_SQLITE_CLI=1).");
    }
    return createSqliteCliWriter(dbPath, verbose);
  }

  try {
    const mod = await import("better-sqlite3");
    const DatabaseCtor = (mod.default ?? mod) as new (path: string) => {
      exec: (sql: string) => void;
      prepare: (sql: string) => { run: (...args: unknown[]) => void };
      close: () => void;
    };
    return createBetterSqliteWriter(DatabaseCtor, dbPath);
  } catch (error) {
    const reason = summarizeBetterSqliteImportError(error);
    if (verbose) {
      console.warn(
        `Scraper: falling back to sqlite3 CLI (better-sqlite3 unavailable). ${reason}`,
      );
    }
    const directory = path.dirname(dbPath);
    if (!fs.existsSync(directory)) {
      fs.mkdirSync(directory, { recursive: true });
    }
    ensureSqliteCliAvailable();
    return createSqliteCliWriter(dbPath, verbose);
  }
}

async function fetchTextDetailed(
  url: string,
  verbose: boolean,
  retryOptions: FetchRetryOptions = {},
): Promise<FetchTextResult> {
  const response = await fetchWithRetry(
    url,
    {
      headers: {
        "User-Agent": "BambuFilamentManager/1.0",
        Accept: "text/html,application/json",
      },
    },
    verbose,
    retryOptions,
  );

  if (!response) {
    return { text: null, status: null };
  }

  if (!response.ok) {
    if (verbose) {
      console.warn(`Scraper: ${response.status} ${response.statusText} ${url}`);
    }
    return { text: null, status: response.status };
  }

  return { text: await response.text(), status: response.status };
}

async function fetchText(url: string, verbose: boolean): Promise<string | null> {
  const result = await fetchTextDetailed(url, verbose);
  return result.text;
}

function extractNextDataPayload(html: string): string {
  const marker = '<script id="__NEXT_DATA__" type="application/json">';
  const start = html.indexOf(marker);
  if (start === -1) {
    return "";
  }
  const jsonStart = start + marker.length;
  const end = html.indexOf("</script>", jsonStart);
  if (end === -1) {
    return "";
  }
  const raw = html.slice(jsonStart, end).trim();
  if (!raw) {
    return "";
  }
  try {
    return JSON.stringify(JSON.parse(raw));
  } catch {
    return raw;
  }
}

function decodeNextPayload(html: string, verbose = false): string {
  const parts: string[] = [];
  let found = 0;
  let parsed = 0;
  const marker = 'self.__next_f.push([1,"';
  let index = 0;
  while (true) {
    const start = html.indexOf(marker, index);
    if (start === -1) {
      break;
    }
    found += 1;
    const { raw, endIndex } = extractRawJsString(html, start + marker.length);
    const decoded = decodeJsStringLiteral(raw);
    parts.push(decoded);
    parsed += 1;
    index = endIndex + 1;
  }

  let combined = parts.join("");
  if (!combined.includes("\"productList\"")) {
    const nextData = extractNextDataPayload(html);
    if (nextData) {
      combined += nextData;
      if (verbose) {
        console.log("Scraper: __NEXT_DATA__ fallback payload appended");
      }
    }
  }

  if (verbose) {
    console.log(`Scraper: next payload chunks found=${found}, parsed=${parsed}`);
  }
  return combined;
}

function findMatchingBracket(
  text: string,
  start: number,
  openChar: string,
  closeChar: string,
): number | null {
  let level = 0;
  let inString = false;
  let escaped = false;

  for (let i = start; i < text.length; i += 1) {
    const ch = text[i];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (ch === "\\") {
      escaped = true;
      continue;
    }
    if (ch === "\"") {
      inString = !inString;
      continue;
    }
    if (inString) {
      continue;
    }
    if (ch === openChar) {
      level += 1;
    } else if (ch === closeChar) {
      level -= 1;
      if (level === 0) {
        return i;
      }
    }
  }

  return null;
}

function extractProductList(decoded: string): ProductSummary[] {
  const index = decoded.indexOf("\"productList\"");
  if (index === -1) {
    return [];
  }
  const listStart = decoded.indexOf("[", index);
  if (listStart === -1) {
    return [];
  }
  const listEnd = findMatchingBracket(decoded, listStart, "[", "]");
  if (listEnd === null) {
    return [];
  }

  const listJson = decoded.slice(listStart, listEnd + 1);
  try {
    const raw = JSON.parse(listJson) as Array<{
      name?: string;
      seoCode?: string;
      mediaFiles?: string[];
    }>;
    return raw
      .filter((item) => item.name && item.seoCode)
      .map((item) => ({
        name: item.name as string,
        seoCode: item.seoCode as string,
        mediaFiles: item.mediaFiles,
      }));
  } catch {
    return [];
  }
}

function extractColorOptions(decoded: string): ColorOption[] {
  const needle = "{\"propertyKey\":\"Color\"";
  const options = new Map<string, string | null>();
  let index = 0;

  while (true) {
    const start = decoded.indexOf(needle, index);
    if (start === -1) {
      break;
    }
    const end = findMatchingBracket(decoded, start, "{", "}");
    if (end === null) {
      break;
    }
    const objText = decoded.slice(start, end + 1);
    try {
      const obj = JSON.parse(objText) as {
        propertyValue?: string;
        colorUrl?: string | null;
      };
      if (obj.propertyValue) {
        options.set(obj.propertyValue, obj.colorUrl ?? null);
      }
    } catch {
      // ignore
    }
    index = end + 1;
  }

  return Array.from(options.entries()).map(([colorName, imageUrl]) => ({
    colorName,
    imageUrl,
  }));
}

function dedupeEntries(entries: ColorEntry[]): ColorEntry[] {
  const unique = new Map<string, ColorEntry>();
  for (const entry of entries) {
    const key = `${entry.material}::${entry.filamentName}::${entry.colorName}`;
    unique.set(key, entry);
  }
  return Array.from(unique.values());
}

function normalizeMaybeUrl(url: string | null, baseUrl: string): string | null {
  if (!url) {
    return null;
  }
  try {
    return new URL(url, baseUrl).toString();
  } catch {
    return url;
  }
}

async function fetchProductsPage(
  baseUrl: string,
  collectionHandle: string,
  page: number,
  verbose: boolean,
): Promise<ProductsPageResult> {
  const endpoints = [
    `${baseUrl}/collections/${collectionHandle}/products.json?limit=250&page=${page}`,
    `${baseUrl}/collections/${collectionHandle}/products.json?limit=250`,
  ];
  let antiBotBlocked = false;
  let requestFailed = false;

  for (const url of endpoints) {
    const response = await fetchWithRetry(
      url,
      {
        headers: {
          "User-Agent": "BambuFilamentManager/1.0",
          Accept: "application/json",
        },
      },
      verbose,
      {
        retries: MAX_FETCH_RETRIES,
        backoffBaseMs: 800,
        backoffCapMs: 12000,
      },
    );

    if (!response) {
      requestFailed = true;
      continue;
    }

    if (!response.ok) {
      if (isAntiBotOrRateLimitStatus(response.status)) {
        antiBotBlocked = true;
      }
      if (verbose) {
        console.warn(`Scraper: ${response.status} ${response.statusText} ${url}`);
      }
      continue;
    }

    const json = (await response.json()) as { products?: ShopifyProduct[] };
    if (verbose) {
      console.log(`Scraper: fetched ${json.products?.length ?? 0} from ${url}`);
    }
    return {
      products: json.products ?? [],
      antiBotBlocked,
      requestFailed,
    };
  }

  return {
    products: [],
    antiBotBlocked,
    requestFailed,
  };
}

async function fetchAllProducts(
  baseUrls: string[],
  collectionHandle: string,
  verbose: boolean,
  materialFilters: string[],
): Promise<FetchResult | null> {
  for (const baseUrl of baseUrls) {
    const products: ShopifyProduct[] = [];
    const discoveredMaterialNames: string[] = [];
    let page = 1;
    let hasPageFailureSignals = false;
    let antiBotSeen = false;

    if (verbose) {
      console.log(`Scraper: trying base ${baseUrl}`);
    }

    while (true) {
      const pageResult = await fetchProductsPage(
        baseUrl,
        collectionHandle,
        page,
        verbose,
      );
      if (pageResult.products.length === 0) {
        if (pageResult.requestFailed || pageResult.antiBotBlocked) {
          hasPageFailureSignals = true;
          if (pageResult.antiBotBlocked) {
            antiBotSeen = true;
          }
        }
        break;
      }

      for (const product of pageResult.products) {
        discoveredMaterialNames.push(product.title);
        if (matchesMaterialFilter(inferMaterial(product.title), materialFilters)) {
          products.push(product);
        }
      }
      page += 1;
    }

    if (products.length > 0 && !hasPageFailureSignals) {
      return {
        baseUrl,
        products,
        discoveredMaterials: discoveredMaterialsFromNames(discoveredMaterialNames),
        productsDiscovered: discoveredMaterialNames.length,
      };
    }
    if (products.length > 0 && hasPageFailureSignals) {
      if (verbose) {
        if (antiBotSeen) {
          console.warn(
            `Scraper warning: product JSON pagination looked incomplete for ${baseUrl} due to anti-bot/rate-limit responses; falling back to HTML extraction.`,
          );
        } else {
          console.warn(
            `Scraper warning: product JSON pagination looked incomplete for ${baseUrl}; falling back to HTML extraction.`,
          );
        }
      }
      continue;
    }
  }

  return null;
}

function isAntiBotOrRateLimitStatus(status: number | null): boolean {
  if (status == null) {
    return false;
  }
  return status === 429 || status === 403 || status === 503;
}

function buildFallbackEntry(product: ProductSummary, baseUrl: string): ColorEntry {
  return {
    material: inferMaterial(product.name),
    filamentName: product.name,
    colorName: "Standard",
    hexColor: resolveBambuHex(product.name, "Standard"),
    imageUrl: normalizeMaybeUrl(product.mediaFiles?.[0] ?? null, baseUrl),
    productUrl: `${baseUrl}/products/${product.seoCode}`,
  };
}

async function fetchNextStoreEntries(
  baseUrls: string[],
  collectionHandle: string,
  verbose: boolean,
  materialFilters: string[],
): Promise<NextStoreResult | null> {
  for (const baseUrl of baseUrls) {
    if (verbose) {
      console.log(`Scraper: trying HTML base ${baseUrl}`);
    }
    const collectionUrl = `${baseUrl}/collections/${collectionHandle}`;
    const html = await fetchText(collectionUrl, verbose);
    if (!html) {
      continue;
    }
    if (verbose) {
      console.log(`Scraper: HTML length ${html.length} for ${collectionUrl}`);
    }

    const decoded = decodeNextPayload(html, verbose);
    if (verbose) {
      console.log(
        `Scraper: decoded length ${decoded.length}, productList=${decoded.includes("\"productList\"")}`,
      );
    }
    const products = extractProductList(decoded);
    if (verbose) {
      console.log(`Scraper: extracted ${products.length} products from HTML`);
    }
    if (products.length === 0) {
      if (verbose) {
        console.warn(`Scraper: no products found in HTML ${collectionUrl}`);
      }
      continue;
    }
    const discoveredMaterials = discoveredMaterialsFromNames(
      products.map((product) => product.name),
    );

    const entries: ColorEntry[] = [];
    const warnings = new Set<string>();
    let antiBotBlocks = 0;
    let productsDetailed = 0;
    let stopDetailedFetch = false;
    let consecutiveAntiBotBlocks = 0;

    for (let productIndex = 0; productIndex < products.length; productIndex += 1) {
      const product = products[productIndex];
      const material = inferMaterial(product.name);
      if (!matchesMaterialFilter(material, materialFilters)) {
        continue;
      }
      if (productIndex > 0 && PRODUCT_REQUEST_DELAY_MS > 0) {
        await delay(
          PRODUCT_REQUEST_DELAY_MS + Math.floor(Math.random() * (PRODUCT_REQUEST_DELAY_JITTER_MS + 1)),
        );
      }
      if (stopDetailedFetch) {
        entries.push(buildFallbackEntry(product, baseUrl));
        continue;
      }
      const productUrl = `${baseUrl}/products/${product.seoCode}`;
      const productResult = await fetchTextDetailed(productUrl, verbose, {
        retries: PRODUCT_FETCH_RETRIES,
        backoffBaseMs: 1800,
        backoffCapMs: 18000,
      });
      if (!productResult.text) {
        if (isAntiBotOrRateLimitStatus(productResult.status)) {
          antiBotBlocks += 1;
          consecutiveAntiBotBlocks += 1;
          warnings.add("Product detail lookups hit anti-bot/rate-limit responses.");
          await delay(
            PRODUCT_ANTIBOT_COOLDOWN_MS +
              Math.floor(Math.random() * (PRODUCT_REQUEST_DELAY_JITTER_MS + 1)),
          );
          if (consecutiveAntiBotBlocks >= MAX_CONSECUTIVE_ANTIBOT) {
            stopDetailedFetch = true;
            warnings.add(
              `Stopped detailed product lookup early after ${MAX_CONSECUTIVE_ANTIBOT} consecutive anti-bot responses.`,
            );
          }
        } else {
          consecutiveAntiBotBlocks = 0;
          warnings.add("Some product detail pages could not be fetched.");
        }
        entries.push(buildFallbackEntry(product, baseUrl));
        continue;
      }
      const productHtml = productResult.text;
      productsDetailed += 1;
      consecutiveAntiBotBlocks = 0;
      const productDecoded = decodeNextPayload(productHtml, verbose);
      const colors = extractColorOptions(productDecoded);

      if (colors.length === 0) {
        entries.push({
          material,
          filamentName: product.name,
          colorName: "Standard",
          hexColor: resolveBambuHex(product.name, "Standard"),
          imageUrl: normalizeMaybeUrl(product.mediaFiles?.[0] ?? null, baseUrl),
          productUrl,
        });
        continue;
      }

      for (const color of colors) {
        const imageUrl = normalizeMaybeUrl(
          color.imageUrl ?? product.mediaFiles?.[0] ?? null,
          baseUrl,
        );
        entries.push({
          material,
          filamentName: product.name,
          colorName: color.colorName,
          hexColor: resolveBambuHex(product.name, color.colorName),
          imageUrl,
          productUrl,
        });
      }
    }

    const uniqueEntries = dedupeEntries(entries);
    if (uniqueEntries.length > 0) {
      const warningList = Array.from(warnings.values());
      if (verbose) {
        for (const warning of warningList) {
          console.warn(`Scraper warning: ${warning}`);
        }
      }
      return {
        baseUrl,
        entries: uniqueEntries,
        discoveredMaterials,
        warnings: warningList,
        antiBotBlocks,
        productsDiscovered: products.length,
        productsDetailed,
        partial: warningList.length > 0,
      };
    }
  }

  return null;
}

function extractColors(product: ShopifyProduct, baseUrl: string): ColorEntry[] {
  const direct = parseTitleColor(product.title);
  if (direct) {
    const hexColor = resolveBambuHex(direct.filamentName, direct.colorName);
    const imageUrl = selectImage(product, null);
    return [
      {
        material: direct.material,
        filamentName: direct.filamentName,
        colorName: direct.colorName,
        hexColor,
        imageUrl,
        productUrl: buildProductUrl(baseUrl, product.handle),
      },
    ];
  }

  const colorOption = (product.options ?? []).find((opt) =>
    /color|colour/i.test(opt.name),
  );

  if (!colorOption || !product.variants || product.variants.length === 0) {
    return [];
  }

  const filamentName = product.title.trim();
  const material = inferMaterial(filamentName);

  return product.variants
    .map((variant) => {
      const colorName = variant.option1?.trim();
      if (!colorName) {
        return null;
      }
      const hexColor = resolveBambuHex(filamentName, colorName);
      const imageUrl = selectImage(product, variant);
      return {
        material,
        filamentName,
        colorName,
        hexColor,
        imageUrl,
        productUrl: buildProductUrl(baseUrl, product.handle, variant.id),
      };
    })
    .filter((entry): entry is ColorEntry => Boolean(entry));
}

function parseTitleColor(title: string):
  | { material: string; filamentName: string; colorName: string }
  | null {
  const parts = title.split(" - ");
  if (parts.length < 2) {
    return null;
  }
  const colorName = parts[parts.length - 1].trim();
  const filamentName = parts.slice(0, -1).join(" - ").trim();
  if (!colorName || !filamentName) {
    return null;
  }
  const material = inferMaterial(filamentName);
  return { material, filamentName, colorName };
}

export function inferMaterial(filamentName: string): string {
  const upper = filamentName.trim().toUpperCase();
  for (const family of BAMBU_MATERIAL_FAMILIES) {
    for (const prefix of family.prefixes) {
      if (upper.startsWith(prefix.toUpperCase())) {
        return family.material;
      }
    }
  }

  const first = filamentName.split(" ")[0];
  return first ? first.toUpperCase() : "UNKNOWN";
}

function normalizeMaterialFilters(materialTypes?: string[]): string[] {
  if (!materialTypes || materialTypes.length === 0) {
    return [];
  }
  return Array.from(
    new Set(
      materialTypes
        .map((value) => value.trim().toUpperCase())
        .filter((value) => value.length > 0),
    ),
  );
}

function matchesMaterialFilter(material: string, materialFilters: string[]): boolean {
  if (materialFilters.length === 0) {
    return true;
  }
  return materialFilters.includes(material.trim().toUpperCase());
}

export function discoveredMaterialsFromNames(names: Iterable<string>): string[] {
  return Array.from(new Set(Array.from(names, inferMaterial))).sort((left, right) =>
    left.localeCompare(right),
  );
}

type OfficialBambuHexCode = {
  filament: string;
  color: string;
  hex: string;
  kind?: "multi" | "gradient";
  colors?: string[];
};

const OFFICIAL_BAMBU_HEX_CODES = JSON.parse(
  fs.readFileSync(new URL("../data/bambu_official_hex_codes.json", import.meta.url), "utf8"),
) as OfficialBambuHexCode[];

function officialKey(value: string): string {
  return value
    .replace(/\+/g, " plus ")
    .replace(/[^a-z0-9]+/gi, "")
    .toLowerCase()
    .replace(/colour/g, "color");
}

function colorNameWithoutCode(colorName: string): string {
  return colorName.trim().replace(/\s*\([^)]*\)\s*$/, "").trim();
}

function officialColorKey(filamentName: string, colorName: string): string {
  const filamentKey = officialKey(filamentName);
  let color = stripLeadingLabel(colorNameWithoutCode(colorName), filamentName);
  if (filamentKey === "plamatte") {
    color = color.replace(/^matte\s+/i, "").trim();
  }
  return officialKey(color);
}

function stripLeadingLabel(value: string, label: string): string {
  const trimmed = value.trim();
  const normalizedLabel = label.trim();
  if (
    !normalizedLabel ||
    trimmed.length <= normalizedLabel.length ||
    trimmed.slice(0, normalizedLabel.length).toLowerCase() !== normalizedLabel.toLowerCase()
  ) {
    return trimmed;
  }
  const rest = trimmed
    .slice(normalizedLabel.length)
    .trimStart()
    .replace(/^[-·:]\s*/, "")
    .trimStart();
  return rest || trimmed;
}

function officialFilamentKeyCandidates(filamentName: string): string[] {
  const filamentKey = officialKey(filamentName);
  if (filamentKey === "tpu85atpu90a") {
    return [filamentKey, "tpu85a", "tpu90a"];
  }
  return [filamentKey];
}

function officialBambuHex(filamentName: string, colorName: string): string | null {
  const filamentKeys = officialFilamentKeyCandidates(filamentName);
  const colorKey = officialColorKey(filamentName, colorName);
  const entry = OFFICIAL_BAMBU_HEX_CODES.find(
    ({ filament, color }) => filamentKeys.includes(filament) && color === colorKey,
  );
  if (!entry) {
    return null;
  }
  if (entry.colors && entry.colors.length > 1) {
    return `${entry.kind ?? "gradient"}(${entry.colors.join(",")})`;
  }
  return entry.hex;
}

function resolveBambuHex(filamentName: string, colorName: string): string | null {
  return officialBambuHex(filamentName, colorName) ?? estimateHex(colorName);
}

function estimateHex(colorName: string): string | null {
  const rules: Array<[RegExp, string]> = [
    [/black|carbon|charcoal/i, "#111111"],
    [/white|ivory|cream/i, "#f5f5f5"],
    [/gray|grey/i, "#8a8a8a"],
    [/red|crimson|maroon/i, "#b00020"],
    [/orange|amber/i, "#f57c00"],
    [/yellow|gold/i, "#f9c74f"],
    [/green|emerald|olive|jade/i, "#2e7d32"],
    [/blue|navy|azure/i, "#1976d2"],
    [/purple|violet/i, "#7b1fa2"],
    [/pink|magenta/i, "#d81b60"],
    [/brown|chocolate|copper/i, "#8d6e63"],
    [/silver|metal|steel/i, "#b0bec5"],
    [/transparent|translucent|clear/i, "#e0f7fa"],
  ];

  for (const [pattern, hex] of rules) {
    if (pattern.test(colorName)) {
      return hex;
    }
  }

  return "#777777";
}

function selectImage(product: ShopifyProduct, variant: ShopifyVariant | null): string | null {
  if (variant?.featured_image?.src) {
    return variant.featured_image.src;
  }
  if (product.image?.src) {
    return product.image.src;
  }
  if (product.images && product.images.length > 0) {
    return product.images[0].src ?? null;
  }
  return null;
}

function buildProductUrl(baseUrl: string, handle: string, variantId?: number): string {
  const url = `${baseUrl}/products/${handle}`;
  if (!variantId) {
    return url;
  }
  return `${url}?variant=${variantId}`;
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function buildId(material: string, filamentName: string, colorName: string): string {
  const key = [material, filamentName, colorName].map(slugify).join("-");
  return `bambu_${key}`;
}

export async function runScrape(
  options: ScrapeOptions = {},
): Promise<{
  imported: number;
  baseUrl?: string;
  collectionHandle: string;
  warnings: string[];
  antiBotBlocks: number;
  discoveredMaterials: string[];
  productsDiscovered: number;
  productsDetailed: number;
  partial: boolean;
}> {
  const baseUrls = (options.baseUrls?.length
    ? options.baseUrls
    : process.env.BAMBU_BASE_URL
      ? [process.env.BAMBU_BASE_URL]
      : DEFAULT_BASE_URLS
  ).map(normalizeBaseUrl);
  const collectionHandle =
    options.collectionHandle ??
    process.env.BAMBU_COLLECTION ??
    DEFAULT_COLLECTION_HANDLE;
  const dbPath = options.dbPath ?? dbPathFromEnv() ?? DEFAULT_DB_PATH;
  const verbose = options.verbose ?? process.env.BAMBU_VERBOSE === "1";
  const materialFilters = normalizeMaterialFilters(
    options.materialTypes ??
      (process.env.BAMBU_MATERIAL_TYPES ?? "")
        .split(",")
        .map((value) => value.trim())
        .filter((value) => value.length > 0),
  );
  const writer = await createDbWriter(dbPath, verbose);

  let imported = 0;
  let usedBaseUrl: string | undefined;
  let warnings: string[] = [];
  let antiBotBlocks = 0;
  let discoveredMaterials: string[] = [];
  let productsDiscovered = 0;
  let productsDetailed = 0;
  let partial = false;

  const result = await fetchAllProducts(
    baseUrls,
    collectionHandle,
    verbose,
    materialFilters,
  );

  if (result) {
    usedBaseUrl = result.baseUrl;
    discoveredMaterials = result.discoveredMaterials;
    productsDiscovered = result.productsDiscovered;
    for (const product of result.products) {
      const colors = extractColors(product, result.baseUrl);
      for (const entry of colors) {
        writer.upsert(entry);
        imported += 1;
      }
    }
  } else {
    const nextResult = await fetchNextStoreEntries(
      baseUrls,
      collectionHandle,
      verbose,
      materialFilters,
    );
    if (nextResult) {
      usedBaseUrl = nextResult.baseUrl;
      warnings = nextResult.warnings;
      antiBotBlocks = nextResult.antiBotBlocks;
      discoveredMaterials = nextResult.discoveredMaterials;
      productsDiscovered = nextResult.productsDiscovered;
      productsDetailed = nextResult.productsDetailed;
      partial = nextResult.partial;
      for (const entry of nextResult.entries) {
        writer.upsert(entry);
        imported += 1;
      }
    } else if (verbose) {
      console.warn("Scraper: no products found for any base URL.");
    }
  }

  writer.close();
  return {
    imported,
    baseUrl: usedBaseUrl,
    collectionHandle,
    warnings,
    antiBotBlocks,
    discoveredMaterials,
    productsDiscovered,
    productsDetailed,
    partial,
  };
}

const isDirectRun =
  process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url;

if (isDirectRun) {
  runScrape()
    .then((result) => {
      if (result.productsDiscovered > 0) {
        process.stdout.write(`Products discovered: ${result.productsDiscovered}\n`);
      }
      if (result.productsDetailed > 0) {
        process.stdout.write(`Products detailed: ${result.productsDetailed}\n`);
      }
      if (result.antiBotBlocks > 0) {
        process.stdout.write(`Anti-bot blocks: ${result.antiBotBlocks}\n`);
      }
      if (result.discoveredMaterials.length > 0) {
        process.stdout.write(`Discovered materials: ${result.discoveredMaterials.join(", ")}\n`);
      }
      if (result.partial) {
        process.stdout.write("Refresh quality: partial\n");
      }
      if (result.warnings.length > 0) {
        process.stdout.write("Warnings:\n");
        for (const warning of result.warnings) {
          process.stdout.write(`- ${warning}\n`);
        }
      }
      process.stdout.write(`Imported ${result.imported} entries.\n`);
    })
    .catch((error) => {
      process.stderr.write(`Scraper failed: ${String(error)}\n`);
      process.exit(1);
    });
}
