import {
  buildBambuFilamentCodeLookup,
  extractBambuFilamentCodes,
  type BambuFilamentCodeLookup,
} from "./bambu_filament_code_lookup";
import type { MasterCatalogRow } from "./tauri_client";

export type BambuFilamentCodeBatchRow = {
  key: string;
  sourceText: string;
  code: string | null;
  lookup: BambuFilamentCodeLookup;
  master: MasterCatalogRow | null;
};

export type BambuFilamentCodeBatch = {
  rows: BambuFilamentCodeBatchRow[];
  creatableRows: BambuFilamentCodeBatchRow[];
  blockedRows: BambuFilamentCodeBatchRow[];
};

type ParsedBatchEntry = {
  sourceText: string;
  code: string | null;
};

function parseBambuFilamentCodeBatchEntries(rawInput: string): ParsedBatchEntry[] {
  return rawInput
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .flatMap((line): ParsedBatchEntry[] => {
      const codes = extractBambuFilamentCodes(line);
      if (codes.length === 0) {
        return [{ sourceText: line, code: null }];
      }
      if (codes.length === 1) {
        return [{ sourceText: line, code: codes[0] }];
      }
      return codes.map((code) => ({ sourceText: code, code }));
    });
}

export function buildBambuFilamentCodeBatch(input: {
  masters: MasterCatalogRow[];
  rawInput: string;
}): BambuFilamentCodeBatch {
  const rows = parseBambuFilamentCodeBatchEntries(input.rawInput).map((entry, index) => {
    const lookup = buildBambuFilamentCodeLookup(
      input.masters,
      entry.code ?? entry.sourceText,
    );
    const master =
      lookup.status === "single_active" ? lookup.activeMatches[0] ?? null : null;
    return {
      key: `${index}-${entry.code ?? entry.sourceText}`,
      sourceText: entry.sourceText,
      code: entry.code,
      lookup,
      master,
    };
  });
  const creatableRows = rows.filter((row) => row.master);

  return {
    rows,
    creatableRows,
    blockedRows: rows.filter((row) => !row.master),
  };
}
