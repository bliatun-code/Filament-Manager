import type {
  BambuFilamentCodeBatchCreateState,
  BambuFilamentCodeBatchRow,
} from "../lib/bambu_filament_code_batch";
import type { I18nContextValue } from "../lib/i18n";
import { formatMasterDisplayTitle } from "../lib/inventory_list_model";

type Translate = I18nContextValue["t"];

type BambuBatchScanAppendSummary = {
  appendedCodeLines: string[];
  appendedReviewLines: string[];
  ignoredLines: string[];
};

export type BambuBatchCameraStatus =
  | "idle"
  | "starting"
  | "scanning"
  | "added"
  | "review"
  | "duplicate"
  | "ignored"
  | "unsupported"
  | "error";

export const bambuBatchCodeFieldClassName =
  "rounded-xl border border-slate-200 bg-white px-3 py-2 font-mono text-sm text-slate-800 outline-none transition placeholder:text-slate-400 focus-visible:border-sky-300 focus-visible:ring-2 focus-visible:ring-sky-100 dark:border-slate-700 dark:bg-slate-950/75 dark:text-slate-100 dark:placeholder:text-slate-500 dark:focus-visible:border-sky-400/60 dark:focus-visible:ring-sky-500/20";

export const bambuBatchPanelClassName =
  "rounded-2xl border border-slate-200/90 bg-white/72 shadow-sm shadow-slate-900/[0.03] dark:border-slate-700/80 dark:bg-slate-950/45";

export function bambuBatchWorkspaceClassName(cameraPanelVisible: boolean): string {
  const desktopColumns = cameraPanelVisible
    ? "min-[900px]:grid-cols-[minmax(0,1fr)_minmax(20rem,1fr)]"
    : "min-[900px]:grid-cols-[minmax(17rem,0.62fr)_minmax(0,1.38fr)]";
  return `grid min-h-0 grid-cols-1 gap-4 overflow-y-auto overscroll-contain min-[900px]:h-full min-[900px]:overflow-hidden xl:gap-5 ${desktopColumns}`;
}

export function bambuBatchRowStatusLabel(
  row: BambuFilamentCodeBatchRow,
  t: Translate,
): string {
  if (row.master) {
    return t("inventory.bambuBatchReady", "Ready");
  }
  if (row.lookup.status === "multiple_active") {
    return t("inventory.bambuBatchAmbiguous", "Choose manually");
  }
  if (row.lookup.status === "discontinued_only") {
    return row.lookup.discontinuedMatches.length > 1
      ? t("inventory.bambuBatchAmbiguous", "Choose manually")
      : t("common.discontinued", "Discontinued");
  }
  if (row.lookup.status === "no_match") {
    return t("inventory.bambuBatchNoMatch", "No match");
  }
  return t("inventory.bambuBatchNoCode", "No code");
}

export function bambuBatchRowPreview(row: BambuFilamentCodeBatchRow): string {
  if (row.master) {
    return formatMasterDisplayTitle(row.master);
  }
  const matches =
    row.lookup.activeMatches.length > 0
      ? row.lookup.activeMatches
      : row.lookup.discontinuedMatches;
  if (matches.length === 0) {
    return row.sourceText;
  }
  const preview = matches
    .slice(0, 2)
    .map((master) => formatMasterDisplayTitle(master))
    .join(", ");
  return matches.length > 2 ? `${preview} +${matches.length - 2}` : preview;
}

export function bambuBatchSelectionOptionLabel(
  master: BambuFilamentCodeBatchRow["selectionMatches"][number],
  t: Translate,
): string {
  const title = formatMasterDisplayTitle(master);
  return master.is_discontinued
    ? `${title} · ${t("common.discontinued", "Discontinued")}`
    : title;
}

export function bambuBatchCreateStateMessage(
  state: BambuFilamentCodeBatchCreateState,
  t: Translate,
): string | null {
  if (state.totalCount === 0) {
    return null;
  }
  if (state.reason === "borrowed_owner_required") {
    return t(
      "inventory.bambuBatchBorrowedOwnerRequired",
      "Enter who the spools are borrowed from before creating this borrowed-in batch.",
    );
  }
  if (state.reason === "invalid_weight") {
    return t("inventory.error.invalidWeight", "Weight value is invalid.");
  }
  if (state.reason === "no_ready_rows") {
    return t(
      "inventory.bambuBatchNoneReady",
      "No rows are ready yet. Review ambiguous, discontinued or missing codes manually.",
    );
  }
  if (state.partial) {
    return t(
      "inventory.bambuBatchPartialReady",
      "Only ready rows will be added; review rows are skipped.",
    );
  }
  if (state.readyCount > 0) {
    return t("inventory.bambuBatchAllReady", "All pasted codes are ready.");
  }
  return null;
}

export function bambuBatchImageScanMessage(
  append: BambuBatchScanAppendSummary,
  t: Translate,
): string {
  const codeCount = append.appendedCodeLines.length;
  const reviewCount = append.appendedReviewLines.length;
  const ignoredCount = append.ignoredLines.length;
  if (codeCount > 0 && reviewCount > 0) {
    return t(
      "inventory.bambuBatchImageAddedMixed",
      "{codeCount} filament code(s) and {reviewCount} barcode value(s) for review were added to the batch.",
      { codeCount, reviewCount },
    );
  }
  if (codeCount > 0) {
    return t(
      "inventory.bambuBatchImageAddedCodes",
      "{count} filament code(s) added to the batch.",
      { count: codeCount },
    );
  }
  if (ignoredCount > 0) {
    return t(
      "inventory.bambuBatchImageIgnored",
      "Ignored {count} Bambu instruction QR value(s).",
      { count: ignoredCount },
    );
  }
  return t(
    "inventory.bambuBatchImageAddedReview",
    "{count} barcode value(s) added for review.",
    { count: reviewCount },
  );
}

function formatBambuBatchScanLinePreview(lines: string[]): string {
  const preview = lines.slice(0, 3).join(", ");
  const remainingCount = Math.max(0, lines.length - 3);
  return remainingCount > 0 ? `${preview} +${remainingCount}` : preview;
}

export function bambuBatchCameraScanMessage(
  append: BambuBatchScanAppendSummary,
  t: Translate,
): string {
  const codeCount = append.appendedCodeLines.length;
  const reviewCount = append.appendedReviewLines.length;
  const ignoredCount = append.ignoredLines.length;
  const codePreview = formatBambuBatchScanLinePreview(append.appendedCodeLines);
  const reviewPreview = formatBambuBatchScanLinePreview(append.appendedReviewLines);
  if (codeCount > 0 && reviewCount > 0) {
    return t(
      "inventory.bambuBatchCameraAddedMixedValues",
      "Added {codes}; {reviewCount} barcode value(s) for review.",
      { codes: codePreview, reviewCount },
    );
  }
  if (codeCount > 0) {
    return t("inventory.bambuBatchCameraAddedCodeValues", "Added {codes}.", {
      codes: codePreview,
    });
  }
  if (ignoredCount > 0) {
    return t(
      "inventory.bambuBatchCameraIgnoredQr",
      "Ignored a Bambu instruction QR. Keep showing the Filament Code label.",
    );
  }
  return t(
    "inventory.bambuBatchCameraAddedReviewValues",
    "Added for review: {values}.",
    { values: reviewPreview },
  );
}

export function bambuBatchCameraStatusLabel(
  status: BambuBatchCameraStatus,
  t: Translate,
): string {
  if (status === "starting") {
    return t("inventory.bambuBatchCameraStarting", "Starting camera");
  }
  if (status === "added") {
    return t("inventory.bambuBatchCameraAdded", "Added");
  }
  if (status === "review") {
    return t("inventory.bambuBatchCameraReview", "Review");
  }
  if (status === "duplicate") {
    return t("inventory.bambuBatchCameraDuplicate", "Already added");
  }
  if (status === "ignored") {
    return t("inventory.bambuBatchCameraIgnored", "Ignored");
  }
  if (status === "unsupported") {
    return t("inventory.bambuBatchCameraUnavailable", "Camera unavailable");
  }
  if (status === "error") {
    return t("inventory.bambuBatchCameraErrorShort", "Camera error");
  }
  return t("inventory.bambuBatchCameraScanning", "Scanning");
}

export function bambuBatchCameraOverlayClassName(
  status: BambuBatchCameraStatus,
): string {
  if (status === "added" || status === "review") {
    return "border-emerald-300/50 bg-emerald-500/15 text-emerald-50";
  }
  if (status === "duplicate") {
    return "border-amber-300/50 bg-amber-500/15 text-amber-50";
  }
  if (status === "ignored") {
    return "border-white/20 bg-slate-950/60 text-slate-100";
  }
  if (status === "unsupported" || status === "error") {
    return "border-rose-300/50 bg-rose-500/15 text-rose-50";
  }
  return "border-white/20 bg-slate-950/45 text-white";
}
