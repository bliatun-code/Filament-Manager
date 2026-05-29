import { pathToFileURL } from "node:url";

import {
  DEFAULT_BASE_URLS,
  DEFAULT_COLLECTION_HANDLE,
  runScrape,
} from "./bambu_filament_scraper.js";

type ShopifyCollection = {
  handle: string;
  title: string;
};

const VERBOSE = process.env.BAMBU_VERBOSE === "1";
const USER_AGENT = "BambuFilamentManager/1.0";
const REQUEST_TIMEOUT_MS = Number.parseInt(process.env.BAMBU_TIMEOUT_MS ?? "20000", 10);
const MAX_FETCH_RETRIES = Number.parseInt(process.env.BAMBU_FETCH_RETRIES ?? "2", 10);
const MAX_DETECT_PROBES = Number.parseInt(process.env.BAMBU_MAX_DETECT_PROBES ?? "3", 10);
const DETECT_RETRY_JITTER_MS = Number.parseInt(process.env.BAMBU_DETECT_JITTER_MS ?? "250", 10);
const SAFE_MAX_DETECT_PROBES =
  Number.isFinite(MAX_DETECT_PROBES) && MAX_DETECT_PROBES > 0 ? MAX_DETECT_PROBES : 3;

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, "");
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchWithRetry(url: string, init: RequestInit): Promise<Response | null> {
  const retries = Number.isFinite(MAX_FETCH_RETRIES) && MAX_FETCH_RETRIES >= 0
    ? MAX_FETCH_RETRIES
    : 2;
  const timeoutMs = Number.isFinite(REQUEST_TIMEOUT_MS) && REQUEST_TIMEOUT_MS > 0
    ? REQUEST_TIMEOUT_MS
    : 20000;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, { ...init, signal: controller.signal });
      clearTimeout(timeout);
      if ((response.status === 429 || response.status >= 500) && attempt < retries) {
        warnVerbose(
          `Detect: retrying ${url} after ${response.status} (attempt ${attempt + 1}/${retries + 1})`,
        );
        const baseBackoff = response.status === 429 ? 1800 : 700;
        const jitter = Number.isFinite(DETECT_RETRY_JITTER_MS) && DETECT_RETRY_JITTER_MS > 0
          ? Math.floor(Math.random() * (DETECT_RETRY_JITTER_MS + 1))
          : 0;
        await delay(Math.min(baseBackoff * (attempt + 1), 8000) + jitter);
        continue;
      }
      return response;
    } catch (error) {
      clearTimeout(timeout);
      if (attempt >= retries) {
        warnVerbose(`Detect: request failed ${url}: ${String(error)}`);
        return null;
      }
      warnVerbose(
        `Detect: transient request error ${url} (attempt ${attempt + 1}/${retries + 1})`,
      );
      const jitter = Number.isFinite(DETECT_RETRY_JITTER_MS) && DETECT_RETRY_JITTER_MS > 0
        ? Math.floor(Math.random() * (DETECT_RETRY_JITTER_MS + 1))
        : 0;
      await delay(Math.min(700 * (attempt + 1), 4000) + jitter);
    }
  }

  return null;
}

async function fetchText(url: string): Promise<string | null> {
  const response = await fetchWithRetry(url, {
    headers: {
      "User-Agent": USER_AGENT,
      Accept: "text/html,application/json",
    },
  });
  if (!response) {
    return null;
  }

  if (!response.ok) {
    warnVerbose(`Detect: ${response.status} ${response.statusText} ${url}`);
    return null;
  }

  return response.text();
}

function logVerbose(message: string): void {
  if (VERBOSE) {
    console.log(message);
  }
}

function warnVerbose(message: string): void {
  if (VERBOSE) {
    console.warn(message);
  }
}

async function fetchCollections(baseUrl: string): Promise<ShopifyCollection[] | null> {
  const url = `${baseUrl}/collections.json?limit=250`;
  const response = await fetchWithRetry(url, {
    headers: {
      "User-Agent": USER_AGENT,
      Accept: "application/json",
    },
  });
  if (!response) {
    return null;
  }

  if (!response.ok) {
    warnVerbose(`Detect: ${response.status} ${response.statusText} ${url}`);
    return null;
  }

  const json = (await response.json()) as {
    collections?: Array<{ handle?: string; title?: string }>;
  };

  return (json.collections ?? [])
    .filter((collection) => collection.handle && collection.title)
    .map((collection) => ({
      handle: collection.handle as string,
      title: collection.title as string,
    }));
}

function extractLocs(xml: string): string[] {
  const locs: string[] = [];
  const regex = /<loc>([^<]+)<\/loc>/g;
  let match: RegExpExecArray | null = null;
  while ((match = regex.exec(xml)) !== null) {
    locs.push(match[1]);
  }
  return locs;
}

async function fetchSitemapCollectionCandidates(
  baseUrl: string,
): Promise<Array<{ baseUrl: string; handle: string }> | null> {
  const sitemapIndex = await fetchText(`${baseUrl}/sitemap.xml`);
  if (!sitemapIndex) {
    return null;
  }

  const indexLocs = extractLocs(sitemapIndex);
  const collectionsSitemap = indexLocs.find((loc) =>
    loc.includes("sitemap_collections"),
  );
  if (!collectionsSitemap) {
    return null;
  }

  const collectionsXml = await fetchText(collectionsSitemap);
  if (!collectionsXml) {
    return null;
  }

  const collectionLocs = extractLocs(collectionsXml);
  const candidates: Array<{ baseUrl: string; handle: string }> = [];

  for (const loc of collectionLocs) {
    try {
      const url = new URL(loc);
      const segments = url.pathname.split("/").filter(Boolean);
      const index = segments.indexOf("collections");
      if (index === -1 || index + 1 >= segments.length) {
        continue;
      }
      const handle = segments[index + 1];
      if (!handle) {
        continue;
      }
      candidates.push({ baseUrl: `${url.protocol}//${url.host}`, handle });
    } catch {
      // ignore malformed URL
    }
  }

  return candidates.length > 0 ? candidates : null;
}

function scoreCollection(collection: ShopifyCollection): number {
  const handle = collection.handle.toLowerCase();
  const title = collection.title.toLowerCase();
  let score = 0;

  if (handle.includes(DEFAULT_COLLECTION_HANDLE)) {
    score += 10;
  }
  if (handle.includes("filament")) {
    score += 6;
  }
  if (title.includes("filament")) {
    score += 4;
  }
  if (handle.includes("bambu")) {
    score += 2;
  }
  if (title.includes("bambu")) {
    score += 2;
  }
  if (title.includes("spool")) {
    score += 1;
  }

  return score;
}

function scoreHandle(handle: string): number {
  const value = handle.toLowerCase();
  if (value.includes(DEFAULT_COLLECTION_HANDLE)) {
    return 10;
  }
  if (value.includes("filament")) {
    return 6;
  }
  if (value.includes("bambu")) {
    return 2;
  }
  return 0;
}

function uniqueHandles(handles: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const handle of handles) {
    if (!seen.has(handle)) {
      seen.add(handle);
      result.push(handle);
    }
  }
  return result;
}

function selectHandles(collections: ShopifyCollection[]): string[] {
  const scored = collections
    .map((collection) => ({ handle: collection.handle, score: scoreCollection(collection) }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score);

  const handles = scored.map((entry) => entry.handle);
  handles.push(DEFAULT_COLLECTION_HANDLE);
  return uniqueHandles(handles);
}

async function probeCollection(baseUrl: string, handle: string): Promise<boolean> {
  const url = `${baseUrl}/collections/${handle}/products.json?limit=1`;
  const response = await fetchWithRetry(url, {
    headers: {
      "User-Agent": USER_AGENT,
      Accept: "application/json",
    },
  });
  if (!response) {
    return false;
  }

  if (response.ok) {
    const json = (await response.json()) as { products?: unknown };
    return Array.isArray(json.products);
  }

  warnVerbose(`Detect: ${response.status} ${response.statusText} ${url}`);
  const html = await fetchText(`${baseUrl}/collections/${handle}`);
  return html ? html.includes("productList") : false;
}

async function detectStore(): Promise<{ baseUrl: string; handle: string }> {
  const explicitBase = process.env.BAMBU_BASE_URL
    ? normalizeBaseUrl(process.env.BAMBU_BASE_URL)
    : null;
  const explicitHandle = process.env.BAMBU_COLLECTION ?? null;
  const baseUrls = explicitBase
    ? [explicitBase, ...DEFAULT_BASE_URLS.map(normalizeBaseUrl).filter((url) => url !== explicitBase)]
    : DEFAULT_BASE_URLS.map(normalizeBaseUrl);

  for (const baseUrl of baseUrls) {
    logVerbose(`Detect: trying base ${baseUrl}`);

    if (explicitHandle) {
      const ok = await probeCollection(baseUrl, explicitHandle);
      if (ok) {
        return { baseUrl, handle: explicitHandle };
      }
    }

    const collections = await fetchCollections(baseUrl);
    if (collections) {
      let probeCount = 0;
      for (const handle of selectHandles(collections)) {
        if (probeCount >= SAFE_MAX_DETECT_PROBES) {
          warnVerbose(
            `Detect: probe limit reached for ${baseUrl}. Using best-scored handle from discovered collections.`,
          );
          return { baseUrl, handle };
        }
        probeCount += 1;
        if (await probeCollection(baseUrl, handle)) {
          return { baseUrl, handle };
        }
      }
    } else {
      const sitemapCandidates = await fetchSitemapCollectionCandidates(baseUrl);
      if (!sitemapCandidates) {
        continue;
      }
      const scored = sitemapCandidates
        .map((candidate) => ({
          ...candidate,
          score: scoreHandle(candidate.handle),
        }))
        .filter((candidate) => candidate.score > 0)
        .sort((a, b) => b.score - a.score);

      if (scored.length > 0) {
        return { baseUrl: scored[0].baseUrl, handle: scored[0].handle };
      }
    }
  }

  const fallbackBase =
    explicitBase ??
    baseUrls.find((url) => url.includes("eu.store.bambulab.com")) ??
    baseUrls[0];
  const fallbackHandle = explicitHandle ?? DEFAULT_COLLECTION_HANDLE;
  warnVerbose(
    `Detect: using fallback ${fallbackBase}/collections/${fallbackHandle} after detection failures`,
  );
  return { baseUrl: fallbackBase, handle: fallbackHandle };
}

async function main(): Promise<void> {
  const detected = await detectStore();
  console.log(`Detected store: ${detected.baseUrl}`);
  console.log(`Detected collection: ${detected.handle}`);

  const result = await runScrape({
    baseUrls: [detected.baseUrl],
    collectionHandle: detected.handle,
    verbose: VERBOSE,
  });

  if (result.productsDiscovered > 0) {
    process.stdout.write(`Products discovered: ${result.productsDiscovered}\n`);
  }
  if (result.productsDetailed > 0) {
    process.stdout.write(`Products detailed: ${result.productsDetailed}\n`);
  }
  if (result.discoveredMaterials.length > 0) {
    process.stdout.write(`Discovered materials: ${result.discoveredMaterials.join(", ")}\n`);
  }
  if (result.antiBotBlocks > 0) {
    process.stdout.write(`Anti-bot blocks: ${result.antiBotBlocks}\n`);
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
}

const isDirectRun =
  process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url;

if (isDirectRun) {
  main().catch((error) => {
    process.stderr.write(`Auto-scrape failed: ${String(error)}\n`);
    process.exit(1);
  });
}
