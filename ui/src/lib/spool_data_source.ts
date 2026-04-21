import {
  fetchLibrarySyncSpools,
  listSpools,
  type SpoolWithMasterRow,
} from "./tauri_client";

type SpoolDataSourceOptions = {
  clientReadOnly: boolean;
  clientHostBaseUrl?: string | null;
  clientLibraryId?: string | null;
};

export async function loadSpoolRowsPage(
  options: SpoolDataSourceOptions,
  limit = 1200,
  offset = 0,
): Promise<SpoolWithMasterRow[]> {
  const { clientReadOnly, clientHostBaseUrl, clientLibraryId } = options;
  if (clientReadOnly && clientHostBaseUrl && clientLibraryId) {
    return fetchLibrarySyncSpools(clientHostBaseUrl, clientLibraryId, limit, offset);
  }
  return listSpools(limit, offset);
}

export async function loadAllSpoolRows(
  options: SpoolDataSourceOptions,
  limit = 200,
): Promise<SpoolWithMasterRow[]> {
  const allRows: SpoolWithMasterRow[] = [];
  let offset = 0;
  while (true) {
    const page = await loadSpoolRowsPage(options, limit, offset);
    allRows.push(...page);
    if (page.length < limit) {
      break;
    }
    offset += page.length;
  }
  return allRows;
}
