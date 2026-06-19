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

export type BambuFilamentCodeBatchCreateBlockReason =
  | "busy"
  | "wrong_mode"
  | "missing_runtime"
  | "no_ready_rows"
  | "borrowed_owner_required";

export type BambuFilamentCodeBatchCreateState = {
  disabled: boolean;
  reason: BambuFilamentCodeBatchCreateBlockReason | null;
  readyCount: number;
  reviewCount: number;
  totalCount: number;
  partial: boolean;
};

export type BambuFilamentCodeBatchScanAppendResult = {
  input: string;
  appendedLines: string[];
  appendedCodeLines: string[];
  appendedReviewLines: string[];
};

export type BambuFilamentCodeBatchScanValuesInput = {
  currentInput: string;
  scanValues: string[];
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

export function appendBambuFilamentCodeBatchScanInput(input: {
  currentInput: string;
  scanText: string | null | undefined;
}): BambuFilamentCodeBatchScanAppendResult {
  const trimmedScanText = String(input.scanText ?? "").trim();
  if (!trimmedScanText) {
    return {
      input: input.currentInput,
      appendedLines: [],
      appendedCodeLines: [],
      appendedReviewLines: [],
    };
  }

  return appendBambuFilamentCodeBatchScanValues({
    currentInput: input.currentInput,
    scanValues: [trimmedScanText],
  });
}

export function appendBambuFilamentCodeBatchScanValues(
  input: BambuFilamentCodeBatchScanValuesInput,
): BambuFilamentCodeBatchScanAppendResult {
  const scanValues = input.scanValues.map((value) => value.trim()).filter(Boolean);
  if (scanValues.length === 0) {
    return {
      input: input.currentInput,
      appendedLines: [],
      appendedCodeLines: [],
      appendedReviewLines: [],
    };
  }

  const appendedCodeLines: string[] = [];
  const appendedReviewLines: string[] = [];
  scanValues.forEach((value) => {
    const detectedCodes = extractBambuFilamentCodes(value);
    if (detectedCodes.length > 0) {
      appendedCodeLines.push(...detectedCodes);
    } else {
      appendedReviewLines.push(value);
    }
  });
  const appendedLines = [...appendedCodeLines, ...appendedReviewLines];
  const currentInput = input.currentInput.trimEnd();
  const appendedInput = appendedLines.join("\n");

  return {
    input: currentInput ? `${currentInput}\n${appendedInput}` : appendedInput,
    appendedLines,
    appendedCodeLines,
    appendedReviewLines,
  };
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

export function buildBambuFilamentCodeBatchCreateState(input: {
  batch: BambuFilamentCodeBatch;
  tauriAvailable: boolean;
  busy: boolean;
  isBambuMode: boolean;
  borrowedOwnerRequired: boolean;
}): BambuFilamentCodeBatchCreateState {
  const readyCount = input.batch.creatableRows.length;
  const reviewCount = input.batch.blockedRows.length;
  const totalCount = input.batch.rows.length;
  let reason: BambuFilamentCodeBatchCreateBlockReason | null = null;
  if (!input.tauriAvailable) {
    reason = "missing_runtime";
  } else if (input.busy) {
    reason = "busy";
  } else if (!input.isBambuMode) {
    reason = "wrong_mode";
  } else if (readyCount === 0) {
    reason = "no_ready_rows";
  } else if (input.borrowedOwnerRequired) {
    reason = "borrowed_owner_required";
  }

  return {
    disabled: Boolean(reason),
    reason,
    readyCount,
    reviewCount,
    totalCount,
    partial: readyCount > 0 && reviewCount > 0,
  };
}
