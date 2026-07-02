import { LOW_STOCK_GRAMS } from "./inventory_constants";
import {
  formatFilamentDisplayTitle,
  formatSpoolReference,
  normalizeDisplayToken as normalizeSharedDisplayToken,
} from "./display_format";
import {
  isSpoolStatusEmpty,
  isSpoolStatusEmptyOrLost,
  isBorrowedInOwnership,
  normalizeOwnershipType,
  normalizeSpoolStatus,
  type ActiveSpoolStatus,
  type OwnershipType,
  type SpoolStatus,
} from "./inventory_domain";

export type StatusFilter = "ALL" | ActiveSpoolStatus;
export type OwnershipFilter = "ALL" | OwnershipType;
export type InventorySemanticTone = "neutral" | "info" | "success" | "warning" | "danger";
export { normalizeOwnershipType, type OwnershipType, type SpoolStatus };

type TranslateFn = (key: string, fallback?: string) => string;

export type InventorySpool = {
  id: string;
  masterId: string;
  vendor: string;
  material: string;
  filamentName: string;
  colorName: string;
  hexColor?: string | null;
  initialWeightGrams: number;
  status: SpoolStatus;
  ownershipType: OwnershipType;
  ownerName?: string | null;
  ownerContact?: string | null;
  ownershipNote?: string | null;
  remainingGrams?: number | null;
  spoolTareWeightGrams?: number | null;
  location?: string | null;
  homeLocation?: string | null;
  qrCode?: string | null;
  rfidTag?: string | null;
  rfidObservedAt?: string | null;
};

export type SpoolGroup = {
  key: string;
  vendor: string;
  material: string;
  filamentName: string;
  colorName: string;
  hexColor?: string | null;
  ownershipType: OwnershipType;
  ownerName?: string | null;
  totalRemaining: number;
  rolls: InventorySpool[];
};

export function normalizeStatus(status: string): SpoolStatus {
  return normalizeSpoolStatus(status);
}

export function formatInventoryStatusLabel(t: TranslateFn, statusRaw: string): string {
  const status = normalizeStatus(statusRaw);
  if (status === "IN_STOCK") {
    return t("inventory.statusInStock", "In stock");
  }
  if (status === "ASSIGNED") {
    return t("inventory.statusAssigned", "Assigned");
  }
  if (status === "BORROWED") {
    return t("inventory.statusBorrowed", "Loaned out");
  }
  if (status === "EMPTY") {
    return t("inventory.statusEmpty", "Empty");
  }
  if (status === "LOST") {
    return t("inventory.statusLost", "Lost");
  }
  if (status === "MISSING") {
    return t("inventory.statusMissing", "Missing");
  }
  return t("inventory.statusDeleted", "Deleted");
}

export function inventoryStatusTone(statusRaw: string): InventorySemanticTone {
  const status = normalizeStatus(statusRaw);
  if (status === "IN_STOCK") {
    return "success";
  }
  if (status === "ASSIGNED") {
    return "info";
  }
  if (status === "BORROWED") {
    return "warning";
  }
  if (status === "EMPTY") {
    return "neutral";
  }
  return "danger";
}

export function formatInventoryOwnershipLabel(
  t: TranslateFn,
  ownershipRaw?: string | null,
): string {
  const ownership = normalizeOwnershipType(ownershipRaw);
  return ownership === "BORROWED_IN"
    ? t("inventory.borrowedIn", "Borrowed in")
    : t("inventory.ownedByUs", "Owned");
}

export function inventoryOwnershipTone(ownershipRaw?: string | null): InventorySemanticTone {
  const ownership = normalizeOwnershipType(ownershipRaw);
  return ownership === "BORROWED_IN" ? "warning" : "neutral";
}

export function formatInventoryOwnershipSummary(t: TranslateFn, spool: InventorySpool): string {
  if (isBorrowedInOwnership(spool.ownershipType)) {
    return spool.ownerName?.trim()
      ? `${t("inventory.borrowedFrom", "Borrowed from")}: ${spool.ownerName.trim()}`
      : t("inventory.borrowedIn", "Borrowed in");
  }
  return t("inventory.ownedByUsDetail", "Owned by us");
}

export function formatRollReference(spool: Pick<InventorySpool, "id">): string {
  return formatSpoolReference(spool.id);
}

export function formatMasterDisplayTitle(master: {
  material: string;
  filament_name: string;
  color_name: string;
}): string {
  return formatInventoryDisplayTitle(
    master.material,
    master.filament_name,
    master.color_name,
  );
}

export function normalizeDisplayToken(value?: string | null): string | null {
  return normalizeSharedDisplayToken(value);
}

export function formatInventoryDisplayTitle(
  materialRaw?: string | null,
  filamentRaw?: string | null,
  colorRaw?: string | null,
): string {
  return formatFilamentDisplayTitle(materialRaw, filamentRaw, colorRaw);
}

export function buildVendorOptions(spools: InventorySpool[]): string[] {
  const values = new Set<string>();
  for (const spool of spools) {
    const vendor = (spool.vendor || "").trim();
    if (vendor) {
      values.add(vendor);
    }
  }
  return ["ALL", ...Array.from(values).sort((a, b) => a.localeCompare(b))];
}

export function buildMaterialOptions(spools: InventorySpool[]): string[] {
  const values = new Set<string>();
  for (const spool of spools) {
    const material = spool.material.trim();
    if (material) {
      values.add(material);
    }
  }
  return ["ALL", ...Array.from(values).sort((a, b) => a.localeCompare(b))];
}

export function filterInventorySpools(
  spools: InventorySpool[],
  options: {
    search: string;
    statusFilter: StatusFilter;
    ownershipFilter: OwnershipFilter;
    materialFilter: string;
    vendorFilter: string;
    lowStockOnly: boolean;
  },
): InventorySpool[] {
  const { search, statusFilter, ownershipFilter, materialFilter, vendorFilter, lowStockOnly } = options;
  const term = search.trim().toLowerCase();
  return spools.filter((spool) => {
    const statusMatch = isInventorySpoolVisibleForStatusFilter(spool, statusFilter);
    const ownershipMatch = ownershipFilter === "ALL" ? true : spool.ownershipType === ownershipFilter;
    const materialMatch = materialFilter === "ALL" ? true : spool.material === materialFilter;
    const vendorMatch = vendorFilter === "ALL" ? true : spool.vendor === vendorFilter;
    const lowStockMatch = lowStockOnly ? isInventorySpoolLowStockCandidate(spool) : true;
    const searchMatch =
      term.length === 0
        ? true
        : `${spool.id} ${formatRollReference(spool)} ${spool.material} ${spool.filamentName} ${
            spool.colorName
          } ${spool.location ?? ""} ${spool.qrCode ?? ""} ${spool.rfidTag ?? ""} ${
            spool.ownerName ?? ""
          } ${spool.ownerContact ?? ""} ${
            isBorrowedInOwnership(spool.ownershipType) ? "borrowed in" : "owned"
          }`
            .toLowerCase()
            .includes(term);
    return (
      statusMatch &&
      ownershipMatch &&
      materialMatch &&
      vendorMatch &&
      lowStockMatch &&
      searchMatch
    );
  });
}

export function isInventorySpoolVisibleForStatusFilter(
  spool: Pick<InventorySpool, "status">,
  statusFilter: StatusFilter,
): boolean {
  const normalizedStatus = normalizeStatus(spool.status);
  return statusFilter === "ALL"
    ? !isSpoolStatusEmpty(normalizedStatus)
    : normalizedStatus === statusFilter;
}

export function isInventorySpoolLowStockCandidate(
  spool: Pick<InventorySpool, "initialWeightGrams" | "remainingGrams" | "status">,
): boolean {
  const normalizedStatus = normalizeStatus(spool.status);
  const remaining = Math.max(0, spool.remainingGrams ?? spool.initialWeightGrams ?? 0);
  return (
    !isSpoolStatusEmptyOrLost(normalizedStatus) &&
    remaining > 0 &&
    remaining <= LOW_STOCK_GRAMS
  );
}

export function isInventorySpoolLoanTrackingCandidate(
  spool: Pick<InventorySpool, "id" | "ownershipType" | "status">,
  activeLoanSpoolIds: ReadonlySet<string>,
): boolean {
  return (
    normalizeOwnershipType(spool.ownershipType) !== "BORROWED_IN" &&
    !isSpoolStatusEmptyOrLost(spool.status) &&
    !activeLoanSpoolIds.has(spool.id)
  );
}

export function spoolRemainingRatio(
  spool: Pick<InventorySpool, "initialWeightGrams" | "remainingGrams">,
): number {
  const initial = Math.max(1, spool.initialWeightGrams || 0);
  const remaining = Math.max(0, spool.remainingGrams ?? 0);
  return Math.min(1, remaining / initial);
}

export function remainingBarClass(ratio: number): string {
  if (ratio <= 0.2) {
    return "bg-rose-500 dark:bg-rose-300";
  }
  if (ratio <= 0.45) {
    return "bg-amber-500 dark:bg-amber-300";
  }
  return "bg-emerald-500 dark:bg-emerald-300";
}

export function groupInventorySpools(filteredSpools: InventorySpool[]): SpoolGroup[] {
  const index = new Map<string, SpoolGroup>();
  for (const spool of filteredSpools) {
    const key = `${spool.vendor}|${spool.material}|${spool.filamentName}|${spool.colorName}|${
      spool.hexColor ?? ""
    }|${spool.ownershipType}|${spool.ownerName ?? ""}`;
    if (!index.has(key)) {
      index.set(key, {
        key,
        vendor: spool.vendor,
        material: spool.material,
        filamentName: spool.filamentName,
        colorName: spool.colorName,
        hexColor: spool.hexColor,
        ownershipType: spool.ownershipType,
        ownerName: spool.ownerName ?? null,
        totalRemaining: 0,
        rolls: [],
      });
    }
    const group = index.get(key);
    if (!group) {
      continue;
    }
    group.rolls.push(spool);
    group.totalRemaining += spool.remainingGrams ?? 0;
  }
  return Array.from(index.values()).sort((left, right) => {
    if (left.material !== right.material) {
      return left.material.localeCompare(right.material);
    }
    if (left.filamentName !== right.filamentName) {
      return left.filamentName.localeCompare(right.filamentName);
    }
    return left.colorName.localeCompare(right.colorName);
  });
}
