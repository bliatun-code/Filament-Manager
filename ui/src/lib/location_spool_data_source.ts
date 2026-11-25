import { createAppError } from "./error_text";
import { mapSpoolRowToInventorySpool } from "./inventory_data_source";
import { searchableInventoryText, type InventorySpool } from "./inventory_list_model";
import { loadSpoolSnapshot } from "./spool_data_source";
import {
  getCachedLocationSpoolPage, getLocationSpoolPage, isLocationSpoolTargetCurrent,
  type LocationSpoolQuery, type LocationSpoolTarget,
} from "./tauri_location_client";

export type LinkedSpoolPage = {
  rows: InventorySpool[];
  total: number;
  matches: number;
  revisions: number[];
  source: "LIVE" | "CACHED" | "OFFLINE";
  capturedAt: string | null;
};

export class LocationSpoolTargetChanged extends Error {}

// One reader belongs to an open location. Only an older Host needs a full
// snapshot, and its filtered rows can serve subsequent searches and pages.
export function createLocationSpoolReader(target: LocationSpoolTarget, locationId: string) {
  const options = {
    clientReadOnly: target.base_url !== null,
    clientHostBaseUrl: target.base_url,
    clientLibraryId: target.expected_library_id,
    clientTargetGeneration: target.target_generation,
  };
  let legacyRows: Promise<InventorySpool[]> | undefined;
  async function checkTarget() {
    if (!await isLocationSpoolTargetCurrent(target)) throw new LocationSpoolTargetChanged();
  }
  async function read(search: string, offset: number): Promise<LinkedSpoolPage> {
    const query: LocationSpoolQuery = { location_id: locationId, search, offset };
    try {
      if (!legacyRows) {
        const page = await getLocationSpoolPage(query, target);
        if (page) {
          await checkTarget();
          return { ...page, rows: page.rows.map(mapSpoolRowToInventorySpool), source: "LIVE", capturedAt: null };
        }
        if (!options.clientReadOnly) throw createAppError("common.invalid_request");
        legacyRows ??= loadSpoolSnapshot(options).then(({ rows }) => rows
          .filter(({ spool }) => spool.location_id === locationId || spool.home_location_id === locationId)
          .map(mapSpoolRowToInventorySpool)
          .sort((left, right) => left.id < right.id ? 1 : left.id > right.id ? -1 : 0));
      }
      const rows = await legacyRows;
      await checkTarget();
      const terms = search.toLowerCase().split(/\s+/).filter(Boolean);
      const matches = terms.length ? rows.filter(row => {
        const text = searchableInventoryText(row) + " " + row.status.toLowerCase();
        return terms.every(term => text.includes(term));
      }) : rows;
      return { rows: matches.slice(offset, offset + 100), total: rows.length, matches: matches.length,
        revisions: [], source: "LIVE", capturedAt: null };
    } catch (error) {
      if (error instanceof LocationSpoolTargetChanged) throw error;
      await checkTarget();
      if (!options.clientReadOnly) throw error;
      legacyRows = undefined;
      const cached = await getCachedLocationSpoolPage(query, target).catch(async error => {
        await checkTarget();
        throw error;
      });
      await checkTarget();
      if (cached) return { ...cached, rows: cached.rows.map(mapSpoolRowToInventorySpool),
        source: "CACHED", capturedAt: cached.captured_at };
      return { rows: [], total: 0, matches: 0, revisions: [], source: "OFFLINE", capturedAt: null };
    }
  }
  // StrictMode and overlapping searches can ask for the same page before
  // the first read settles. Keep only in-flight requests for this exact view.
  const pending = new Map<string, Promise<LinkedSpoolPage>>();
  return (search: string, offset: number) => {
    const key = JSON.stringify([search, offset]);
    const existing = pending.get(key);
    if (existing) return existing;
    const request = read(search, offset).finally(() => pending.delete(key));
    pending.set(key, request);
    return request;
  };
}
