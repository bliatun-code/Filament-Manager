export type FilamentPriceBatchMode = "MISSING_ONLY" | "OVERWRITE";

export type FilamentDefaultsSpoolRow = Readonly<{
  spoolId: string;
  masterId: string;
  /** Authoritative backend key. Local grouping generates a deterministic legacy key when absent. */
  groupKey?: string | null;
  vendor: string | null;
  material: string;
  filamentName: string;
  colorName: string;
  nominalWeightG: number | null;
  purchasePrice: number | null;
  purchaseCurrency: string | null;
  purchasePriceSource?: string | null;
  batchPriceLocked: boolean;
  ownershipType?: string | null;
  status?: string | null;
}>;

export type CanonicalFilamentVendor = Readonly<{
  key: string;
  label: string;
  generic: boolean;
}>;

export type FilamentPriceGroupCounts = Readonly<{
  total: number;
  priced: number;
  missingPrice: number;
  batchLocked: number;
  borrowedIn: number;
  inactive: number;
  missingCurrency: number;
  manuallyPriced: number;
}>;

export type FilamentPriceGroup = Readonly<{
  key: string;
  vendorKey: string;
  vendorLabel: string;
  materialKey: string;
  materialLabel: string;
  filamentKey: string;
  filamentLabel: string;
  nominalWeightG: number | null;
  fallbackMasterId: string | null;
  spoolRows: readonly FilamentDefaultsSpoolRow[];
  counts: FilamentPriceGroupCounts;
}>;

export type FilamentPriceVendorCategory = Readonly<{
  key: string;
  label: string;
  spoolCount: number;
  groupCount: number;
  groups: readonly FilamentPriceGroup[];
}>;

export type FilamentPriceBatchPreview = Readonly<{
  mode: FilamentPriceBatchMode;
  selectedCount: number;
  eligibleCount: number;
  missingPriceCount: number;
  missingCurrencyCount: number;
  currencyOnlyCount: number;
  alreadyCompleteCount: number;
  manualUpdateCount: number;
  overwriteCount: number;
  manualOverwriteCount: number;
  lockedCount: number;
  borrowedInCount: number;
  inactiveCount: number;
  selectedSpoolIds: readonly string[];
  eligibleSpoolIds: readonly string[];
  lockedSpoolIds: readonly string[];
  borrowedInSpoolIds: readonly string[];
  inactiveSpoolIds: readonly string[];
  manualUpdateSpoolIds: readonly string[];
  alreadyCompleteSpoolIds: readonly string[];
}>;

export type FilamentPriceSelectionState = "ALL" | "SOME" | "NONE";

const GENERIC_VENDOR_KEYS = new Set([
  "",
  "generic",
  "manual",
  "other",
  "unknown",
  "unspecified",
]);

const GENERIC_SERIES_KEYS = new Set([
  "",
  "filament",
  "generic",
  "manual",
  "other",
  "standard",
  "unknown",
  "unspecified",
]);

function normalizeWhitespace(value: string | null | undefined): string {
  return (value ?? "").normalize("NFKC").trim().replace(/\s+/g, " ");
}

function canonicalTextKey(value: string | null | undefined): string {
  return normalizeWhitespace(value).toLocaleLowerCase("en-US");
}

function compactBrandKey(value: string): string {
  return value.replace(/[^a-z0-9]+/g, "");
}

function keySegment(value: string): string {
  return encodeURIComponent(value);
}

export function canonicalizeFilamentVendor(
  value: string | null | undefined,
): CanonicalFilamentVendor {
  const label = normalizeWhitespace(value);
  const lower = canonicalTextKey(label);
  const compact = compactBrandKey(lower);

  if (compact === "bambu" || compact === "bambulab") {
    return { key: "bambu-lab", label: "Bambu Lab", generic: false };
  }
  if (compact === "esun") {
    return { key: "esun", label: "eSUN", generic: false };
  }
  if (GENERIC_VENDOR_KEYS.has(lower)) {
    return { key: "generic", label: "Generic", generic: true };
  }

  return {
    key: lower,
    label,
    generic: false,
  };
}

export function normalizeFilamentDefaultCurrency(value: string): string | null {
  const currency = normalizeWhitespace(value).toLocaleUpperCase("en-US");
  return /^[A-Z]{3}$/.test(currency) ? currency : null;
}

export function parseFilamentGroupPrice(value: string): number | null {
  const normalized = value.trim().replace(",", ".");
  if (!normalized) {
    return null;
  }
  const price = Number(normalized);
  return Number.isFinite(price) && price >= 0 ? price : null;
}

export function hasFilamentPurchasePrice(value: number | null | undefined): boolean {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

export function hasFilamentPurchaseCurrency(value: string | null | undefined): boolean {
  return normalizeFilamentDefaultCurrency(value ?? "") != null;
}

export function filamentDefaultsSpoolLabel(row: FilamentDefaultsSpoolRow): string {
  const filament = normalizeWhitespace(row.filamentName);
  const color = normalizeWhitespace(row.colorName);
  const parts = [filament, color].filter(Boolean);
  return parts.length > 0 ? parts.join(" · ") : row.spoolId;
}

function normalizedNominalWeight(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? Math.round(value)
    : null;
}

function isGenericSeries(value: string | null | undefined): boolean {
  return GENERIC_SERIES_KEYS.has(canonicalTextKey(value));
}

function buildGroupIdentity(row: FilamentDefaultsSpoolRow) {
  const vendor = canonicalizeFilamentVendor(row.vendor);
  const materialLabel = normalizeWhitespace(row.material).toLocaleUpperCase("en-US") || "Unknown";
  const materialKey = canonicalTextKey(materialLabel);
  const filamentLabel = normalizeWhitespace(row.filamentName) || "Generic";
  const canonicalFilamentKey = canonicalTextKey(filamentLabel);
  const useMasterFallback = vendor.generic && isGenericSeries(row.filamentName);
  const fallbackMasterId = useMasterFallback
    ? normalizeWhitespace(row.masterId) || normalizeWhitespace(row.spoolId)
    : null;
  const filamentKey = fallbackMasterId
    ? `master:${fallbackMasterId}`
    : canonicalFilamentKey;
  const nominalWeightG = normalizedNominalWeight(row.nominalWeightG);
  const generatedKey = [
    `vendor:${keySegment(vendor.key)}`,
    `material:${keySegment(materialKey)}`,
    `filament:${keySegment(filamentKey)}`,
    `weight:${nominalWeightG ?? "unknown"}`,
  ].join("|");
  const key = normalizeWhitespace(row.groupKey) || generatedKey;

  return {
    key,
    vendor,
    materialKey,
    materialLabel,
    filamentKey,
    filamentLabel,
    nominalWeightG,
    fallbackMasterId,
  };
}

function isBorrowedIn(row: FilamentDefaultsSpoolRow): boolean {
  return canonicalTextKey(row.ownershipType).replace(/[\s-]+/g, "_") === "borrowed_in";
}

function normalizedSpoolStatus(row: FilamentDefaultsSpoolRow): string {
  return canonicalTextKey(row.status).replace(/[\s-]+/g, "_");
}

export function isFilamentPriceBatchSelectable(
  row: FilamentDefaultsSpoolRow,
): boolean {
  if (isBorrowedIn(row)) {
    return false;
  }
  return !new Set(["empty", "lost", "missing", "deleted"]).has(
    normalizedSpoolStatus(row),
  );
}

function isManuallyPriced(row: FilamentDefaultsSpoolRow): boolean {
  if (!hasFilamentPurchasePrice(row.purchasePrice)) {
    return false;
  }
  const source = canonicalTextKey(row.purchasePriceSource).replace(/[\s-]+/g, "_");
  return (
    source !== "group_standard" &&
    source !== "batch_standard" &&
    source !== "standard_batch"
  );
}

function buildCounts(rows: readonly FilamentDefaultsSpoolRow[]): FilamentPriceGroupCounts {
  return {
    total: rows.length,
    priced: rows.filter((row) => hasFilamentPurchasePrice(row.purchasePrice)).length,
    missingPrice: rows.filter((row) => !hasFilamentPurchasePrice(row.purchasePrice)).length,
    batchLocked: rows.filter((row) => row.batchPriceLocked).length,
    borrowedIn: rows.filter(isBorrowedIn).length,
    inactive: rows.filter((row) => !isBorrowedIn(row) && !isFilamentPriceBatchSelectable(row)).length,
    missingCurrency: rows.filter(
      (row) => !hasFilamentPurchaseCurrency(row.purchaseCurrency),
    ).length,
    manuallyPriced: rows.filter(isManuallyPriced).length,
  };
}

function compareLabels(left: string, right: string): number {
  return left.localeCompare(right, undefined, { numeric: true, sensitivity: "base" });
}

export function buildFilamentPriceGroups(
  spoolRows: readonly FilamentDefaultsSpoolRow[],
): FilamentPriceVendorCategory[] {
  const groupsByKey = new Map<
    string,
    { identity: ReturnType<typeof buildGroupIdentity>; rows: FilamentDefaultsSpoolRow[] }
  >();

  for (const row of spoolRows) {
    if (normalizedSpoolStatus(row) === "deleted") {
      continue;
    }
    const identity = buildGroupIdentity(row);
    const existing = groupsByKey.get(identity.key);
    if (existing) {
      existing.rows.push(row);
    } else {
      groupsByKey.set(identity.key, { identity, rows: [row] });
    }
  }

  const groups: FilamentPriceGroup[] = Array.from(groupsByKey.values(), ({ identity, rows }) => {
    const sortedRows = [...rows].sort((left, right) => {
      const labelOrder = compareLabels(
        filamentDefaultsSpoolLabel(left),
        filamentDefaultsSpoolLabel(right),
      );
      return labelOrder || compareLabels(left.spoolId, right.spoolId);
    });
    return {
      key: identity.key,
      vendorKey: identity.vendor.key,
      vendorLabel: identity.vendor.label,
      materialKey: identity.materialKey,
      materialLabel: identity.materialLabel,
      filamentKey: identity.filamentKey,
      filamentLabel: identity.filamentLabel,
      nominalWeightG: identity.nominalWeightG,
      fallbackMasterId: identity.fallbackMasterId,
      spoolRows: sortedRows,
      counts: buildCounts(sortedRows),
    };
  }).sort((left, right) => {
    return (
      compareLabels(left.vendorLabel, right.vendorLabel) ||
      compareLabels(left.materialLabel, right.materialLabel) ||
      compareLabels(left.filamentLabel, right.filamentLabel) ||
      (left.nominalWeightG ?? Number.MAX_SAFE_INTEGER) -
        (right.nominalWeightG ?? Number.MAX_SAFE_INTEGER) ||
      compareLabels(left.key, right.key)
    );
  });

  const vendors = new Map<string, FilamentPriceGroup[]>();
  for (const group of groups) {
    const current = vendors.get(group.vendorKey) ?? [];
    current.push(group);
    vendors.set(group.vendorKey, current);
  }

  return Array.from(vendors, ([key, vendorGroups]) => ({
    key,
    label: vendorGroups[0]?.vendorLabel ?? key,
    spoolCount: vendorGroups.reduce((total, group) => total + group.counts.total, 0),
    groupCount: vendorGroups.length,
    groups: vendorGroups,
  })).sort((left, right) => compareLabels(left.label, right.label));
}

export function allFilamentPriceGroups(
  categories: readonly FilamentPriceVendorCategory[],
): FilamentPriceGroup[] {
  return categories.flatMap((category) => category.groups);
}

export function createDefaultFilamentPriceSelection(
  groups: readonly FilamentPriceGroup[],
): Set<string> {
  return new Set(
    groups.flatMap((group) =>
      group.spoolRows
        .filter(isFilamentPriceBatchSelectable)
        .map((row) => row.spoolId),
    ),
  );
}

export function filamentPriceSelectionState(
  rows: readonly FilamentDefaultsSpoolRow[],
  selectedSpoolIds: ReadonlySet<string>,
): FilamentPriceSelectionState {
  const selectedCount = rows.filter((row) => selectedSpoolIds.has(row.spoolId)).length;
  if (selectedCount === 0) {
    return "NONE";
  }
  return selectedCount === rows.length ? "ALL" : "SOME";
}

export function updateFilamentPriceGroupSelection({
  rows,
  selectedSpoolIds,
  selected,
}: {
  rows: readonly FilamentDefaultsSpoolRow[];
  selectedSpoolIds: ReadonlySet<string>;
  selected: boolean;
}): Set<string> {
  const next = new Set(selectedSpoolIds);
  for (const row of rows) {
    if (selected) {
      next.add(row.spoolId);
    } else {
      next.delete(row.spoolId);
    }
  }
  return next;
}

export function buildFilamentPriceBatchPreview({
  currency,
  group,
  mode,
  selectedSpoolIds,
}: {
  group: FilamentPriceGroup;
  mode: FilamentPriceBatchMode;
  selectedSpoolIds: ReadonlySet<string>;
  currency?: string | null;
}): FilamentPriceBatchPreview {
  const selected = group.spoolRows.filter((row) => selectedSpoolIds.has(row.spoolId));
  const locked = selected.filter((row) => row.batchPriceLocked);
  const unlocked = selected.filter((row) => !row.batchPriceLocked);
  const borrowed = unlocked.filter(isBorrowedIn);
  const inactive = unlocked.filter(
    (row) => !isBorrowedIn(row) && !isFilamentPriceBatchSelectable(row),
  );
  const candidates = unlocked.filter(isFilamentPriceBatchSelectable);
  const normalizedCurrency = normalizeFilamentDefaultCurrency(currency ?? "");
  const missingPriceWithOtherCurrency =
    mode === "MISSING_ONLY"
      ? candidates.filter((row) => {
          if (hasFilamentPurchasePrice(row.purchasePrice)) {
            return false;
          }
          const rawCurrency = normalizeWhitespace(row.purchaseCurrency);
          if (!rawCurrency) {
            return false;
          }
          const current = normalizeFilamentDefaultCurrency(row.purchaseCurrency ?? "");
          return current == null || current !== normalizedCurrency;
        })
      : [];
  const missingPriceWithOtherCurrencyIds = new Set(
    missingPriceWithOtherCurrency.map((row) => row.spoolId),
  );
  const alreadyComplete =
    mode === "MISSING_ONLY"
      ? candidates.filter(
          (row) =>
            hasFilamentPurchasePrice(row.purchasePrice) &&
            hasFilamentPurchaseCurrency(row.purchaseCurrency),
        )
      : [];
  const eligible =
    mode === "MISSING_ONLY"
      ? candidates.filter(
          (row) =>
            (!hasFilamentPurchasePrice(row.purchasePrice) ||
              !hasFilamentPurchaseCurrency(row.purchaseCurrency)) &&
            !missingPriceWithOtherCurrencyIds.has(row.spoolId),
        )
      : candidates;
  const overwritten =
    mode === "OVERWRITE"
      ? eligible.filter((row) => hasFilamentPurchasePrice(row.purchasePrice))
      : [];

  return {
    mode,
    selectedCount: selected.length,
    eligibleCount: eligible.length,
    missingPriceCount: eligible.filter(
      (row) => !hasFilamentPurchasePrice(row.purchasePrice),
    ).length,
    missingCurrencyCount: eligible.filter(
      (row) => !hasFilamentPurchaseCurrency(row.purchaseCurrency),
    ).length,
    currencyOnlyCount: eligible.filter(
      (row) =>
        hasFilamentPurchasePrice(row.purchasePrice) &&
        !hasFilamentPurchaseCurrency(row.purchaseCurrency),
    ).length,
    alreadyCompleteCount: alreadyComplete.length,
    manualUpdateCount: missingPriceWithOtherCurrency.length,
    overwriteCount: overwritten.length,
    manualOverwriteCount: overwritten.filter(isManuallyPriced).length,
    lockedCount: locked.length,
    borrowedInCount: borrowed.length,
    inactiveCount: inactive.length,
    selectedSpoolIds: selected.map((row) => row.spoolId),
    eligibleSpoolIds: eligible.map((row) => row.spoolId),
    lockedSpoolIds: locked.map((row) => row.spoolId),
    borrowedInSpoolIds: borrowed.map((row) => row.spoolId),
    inactiveSpoolIds: inactive.map((row) => row.spoolId),
    manualUpdateSpoolIds: missingPriceWithOtherCurrency.map((row) => row.spoolId),
    alreadyCompleteSpoolIds: alreadyComplete.map((row) => row.spoolId),
  };
}

export type FilamentPriceBatchSkipReason =
  | "ALREADY_COMPLETE"
  | "ALREADY_PRICED"
  | "BATCH_LOCKED"
  | "BATCH_PRICE_LOCKED"
  | "BORROWED_IN"
  | "INACTIVE"
  | "MANUAL_UPDATE_REQUIRED"
  | (string & {});

export type FilamentPriceBatchReceiptEntry = Readonly<{
  spoolId: string;
  spoolLabel: string;
  reason?: FilamentPriceBatchSkipReason;
  detail?: string | null;
}>;

export type FilamentPriceBatchReceipt = Readonly<{
  batchId?: string | null;
  groupKey: string;
  mode: FilamentPriceBatchMode;
  price: number;
  currency: string;
  committed: boolean;
  updated: readonly FilamentPriceBatchReceiptEntry[];
  skipped: readonly FilamentPriceBatchReceiptEntry[];
  completedAt?: string | null;
}>;

export type FilamentPriceBatchRequest = Readonly<{
  mode: FilamentPriceBatchMode;
  currency: string;
  price: number;
  groupKey: string;
  spoolIds: readonly string[];
}>;

export type FilamentGroupPriceDefault = Readonly<{
  groupKey: string;
  price: number;
  currency: string;
}>;

export type SaveFilamentGroupPriceDefaultRequest = FilamentGroupPriceDefault;

export type FilamentPriceSkipPresentation = Readonly<{
  label: string;
  requiresManualUpdate: boolean;
}>;

export function filamentPriceSkipPresentation(
  reason: FilamentPriceBatchSkipReason | undefined,
): FilamentPriceSkipPresentation {
  switch (reason) {
    case "BATCH_LOCKED":
    case "BATCH_PRICE_LOCKED":
      return { label: "Batch price lock", requiresManualUpdate: true };
    case "MANUAL_UPDATE_REQUIRED":
      return { label: "Manual update required", requiresManualUpdate: true };
    case "BORROWED_IN":
      return { label: "Borrowed spool", requiresManualUpdate: false };
    case "ALREADY_COMPLETE":
    case "ALREADY_PRICED":
      return { label: "Already priced", requiresManualUpdate: false };
    default:
      return { label: reason || "Not updated", requiresManualUpdate: false };
  }
}
