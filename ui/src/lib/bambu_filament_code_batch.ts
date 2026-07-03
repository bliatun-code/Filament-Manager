import {
  buildBambuFilamentCodeLookup,
  extractBambuFilamentCodes,
  resolveBambuFilamentCodes,
  type BambuFilamentCodeLookup,
} from "./bambu_filament_code_lookup";
import type { MasterCatalogRow } from "./tauri_client";

export type BambuFilamentCodeBatchRow = {
  key: string;
  sourceText: string;
  code: string | null;
  lookup: BambuFilamentCodeLookup;
  master: MasterCatalogRow | null;
  selectionMatches: MasterCatalogRow[];
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
  ignoredLines: string[];
};

export type BambuFilamentCodeBatchScanValuesInput = {
  currentInput: string;
  scanValues: string[];
};

export type BambuFilamentCodeBatchScanAppendOnceResult =
  BambuFilamentCodeBatchScanAppendResult & {
    status: "appended" | "duplicate" | "ignored" | "empty";
    appendedKeys: string[];
    skippedKeys: string[];
    skippedLines: string[];
    nextSeenKeys: Set<string>;
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
        return [{ sourceText: line, code: resolveBambuFilamentCodes(line)[0] ?? null }];
      }
      if (codes.length === 1) {
        return [{ sourceText: line, code: codes[0] }];
      }
      return codes.map((code) => ({ sourceText: code, code }));
    });
}

export function isIgnoredBambuFilamentBatchScanValue(value: string): boolean {
  if (resolveBambuFilamentCodes(value).length > 0) {
    return false;
  }

  try {
    const url = new URL(value);
    return (
      ["http:", "https:"].includes(url.protocol) &&
      (url.hostname.toLowerCase().includes("bambu") ||
        url.href.toLowerCase().includes("bambulab"))
    );
  } catch {
    return /^https?:\/\/\S*bambu/i.test(value);
  }
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
      ignoredLines: [],
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
      ignoredLines: [],
    };
  }

  const appendedCodeLines: string[] = [];
  const appendedReviewLines: string[] = [];
  const ignoredLines: string[] = [];
  scanValues.forEach((value) => {
    const detectedCodes = resolveBambuFilamentCodes(value);
    if (detectedCodes.length > 0) {
      appendedCodeLines.push(...detectedCodes);
    } else if (isIgnoredBambuFilamentBatchScanValue(value)) {
      ignoredLines.push(value);
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
    ignoredLines,
  };
}

export function appendBambuFilamentCodeBatchScanValuesOnce(input: {
  currentInput: string;
  scanValues: string[];
  seenKeys?: ReadonlySet<string>;
}): BambuFilamentCodeBatchScanAppendOnceResult {
  const nextSeenKeys = new Set(input.seenKeys ?? []);
  const appendedKeys: string[] = [];
  const skippedKeys: string[] = [];
  const skippedLines: string[] = [];
  const ignoredLines: string[] = [];
  const scanValues = input.scanValues.map((value) => value.trim()).filter(Boolean);

  const freshLines = scanValues.flatMap((value) => {
    const detectedCodes = resolveBambuFilamentCodes(value);
    if (detectedCodes.length === 0 && isIgnoredBambuFilamentBatchScanValue(value)) {
      ignoredLines.push(value);
      return [];
    }
    const entries =
      detectedCodes.length > 0
        ? detectedCodes.map((code) => ({ key: `code:${code}`, line: code }))
        : [{ key: `review:${value.toLowerCase()}`, line: value }];

    return entries.flatMap((entry) => {
      if (nextSeenKeys.has(entry.key)) {
        skippedKeys.push(entry.key);
        skippedLines.push(entry.line);
        return [];
      }
      nextSeenKeys.add(entry.key);
      appendedKeys.push(entry.key);
      return [entry.line];
    });
  });

  const append = appendBambuFilamentCodeBatchScanValues({
    currentInput: input.currentInput,
    scanValues: freshLines,
  });

  return {
    ...append,
    status:
      appendedKeys.length > 0
        ? "appended"
        : skippedKeys.length > 0
          ? "duplicate"
          : ignoredLines.length > 0
            ? "ignored"
            : "empty",
    appendedKeys,
    skippedKeys,
    skippedLines,
    ignoredLines,
    nextSeenKeys,
  };
}

export function buildBambuFilamentCodeBatch(input: {
  masters: MasterCatalogRow[];
  rawInput: string;
  selectedMasterIds?: Readonly<Record<string, string>>;
}): BambuFilamentCodeBatch {
  const rows = parseBambuFilamentCodeBatchEntries(input.rawInput).map((entry, index) => {
    const lookup = buildBambuFilamentCodeLookup(
      input.masters,
      entry.code ?? entry.sourceText,
    );
    const key = `${index}-${entry.code ?? entry.sourceText}`;
    const selectedMasterId = input.selectedMasterIds?.[key] ?? null;
    const selectedMaster = selectedMasterId
      ? lookup.matches.find((master) => master.id === selectedMasterId) ?? null
      : null;
    const master =
      selectedMaster ??
      (lookup.status === "single_active"
        ? lookup.activeMatches[0] ?? null
        : lookup.status === "discontinued_only" &&
            lookup.discontinuedMatches.length === 1
          ? lookup.discontinuedMatches[0] ?? null
          : null);
    return {
      key,
      sourceText: entry.sourceText,
      code: entry.code,
      lookup,
      master,
      selectionMatches: lookup.matches.length > 1 ? lookup.matches : [],
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
