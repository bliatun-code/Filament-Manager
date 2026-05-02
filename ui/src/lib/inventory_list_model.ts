import { LOW_STOCK_GRAMS } from "./inventory_constants";

export type SpoolStatus = "IN_STOCK" | "ASSIGNED" | "BORROWED" | "EMPTY" | "LOST";
export type StatusFilter = "ALL" | SpoolStatus;
export type OwnershipType = "OWNED" | "BORROWED_IN";
export type OwnershipFilter = "ALL" | OwnershipType;

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
  const upper = status.toUpperCase();
  if (upper === "IN_USE" || upper === "ASSIGNED") {
    return "ASSIGNED";
  }
  if (upper === "BORROWED" || upper === "EMPTY" || upper === "LOST") {
    return upper;
  }
  return "IN_STOCK";
}

export function normalizeOwnershipType(raw?: string | null): OwnershipType {
  const normalized = (raw ?? "").trim().toUpperCase().replaceAll("-", "_");
  if (normalized === "BORROWED_IN") {
    return "BORROWED_IN";
  }
  return "OWNED";
}

export function formatRollReference(spool: Pick<InventorySpool, "id">): string {
  const normalizedId = spool.id.replace(/^spool_/, "");
  return `#${normalizedId.slice(-6)}`;
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
  const trimmed = (value ?? "").trim();
  return trimmed.length > 0 ? trimmed : null;
}

function splitDisplayTokens(value?: string | null): string[] {
  const normalized = normalizeDisplayToken(value);
  if (!normalized) {
    return [];
  }
  return normalized
    .split("·")
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}

function tokenStartsWithToken(baseToken: string, nextToken: string): boolean {
  const base = baseToken.trim().toLowerCase();
  const next = nextToken.trim().toLowerCase();
  if (!base || !next) {
    return false;
  }
  return (
    next === base ||
    next.startsWith(`${base} `) ||
    next.startsWith(`${base}-`) ||
    next.startsWith(`${base}+`) ||
    next.startsWith(`${base}/`)
  );
}

export function formatInventoryDisplayTitle(
  materialRaw?: string | null,
  filamentRaw?: string | null,
  colorRaw?: string | null,
): string {
  const tokens = [
    ...splitDisplayTokens(materialRaw),
    ...splitDisplayTokens(filamentRaw),
    ...splitDisplayTokens(colorRaw),
  ].filter((token, index, allTokens) => {
    if (index === 0) {
      return true;
    }
    return allTokens[index - 1].toLowerCase() !== token.toLowerCase();
  });

  if (tokens.length >= 2 && tokenStartsWithToken(tokens[0], tokens[1])) {
    tokens.shift();
  }

  return tokens.length > 0 ? tokens.join(" · ") : "—";
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
    const normalizedStatus = normalizeStatus(spool.status);
    const remaining = Math.max(0, spool.remainingGrams ?? spool.initialWeightGrams ?? 0);
    const statusMatch =
      statusFilter === "ALL" ? normalizedStatus !== "EMPTY" : normalizedStatus === statusFilter;
    const ownershipMatch = ownershipFilter === "ALL" ? true : spool.ownershipType === ownershipFilter;
    const materialMatch = materialFilter === "ALL" ? true : spool.material === materialFilter;
    const vendorMatch = vendorFilter === "ALL" ? true : spool.vendor === vendorFilter;
    const lowStockMatch = lowStockOnly
      ? normalizedStatus !== "EMPTY" &&
        normalizedStatus !== "LOST" &&
        remaining > 0 &&
        remaining <= LOW_STOCK_GRAMS
      : true;
    const searchMatch =
      term.length === 0
        ? true
        : `${spool.id} ${formatRollReference(spool)} ${spool.material} ${spool.filamentName} ${
            spool.colorName
          } ${spool.location ?? ""} ${spool.qrCode ?? ""} ${spool.rfidTag ?? ""} ${
            spool.ownerName ?? ""
          } ${spool.ownerContact ?? ""} ${
            spool.ownershipType === "BORROWED_IN" ? "borrowed in" : "owned"
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
