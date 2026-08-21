import { isBorrowedInOwnership } from "./inventory_domain";
import type { InventorySpool, OwnershipType } from "./inventory_list_model";
import {
  buildPurchaseReceiptMetadataDraft,
  purchaseReceiptMetadataDraftChanged,
  type PurchaseReceiptMetadataDraft,
} from "./purchase_receipt_metadata";
import { resolveSpoolTareWeight } from "./spool_weight";

export type InventorySpoolCommonDetailsDraft = {
  homeLocation: string;
  ownerContact: string;
  ownerName: string;
  ownershipNote: string;
  ownershipType: OwnershipType;
  purchaseMetadata: PurchaseReceiptMetadataDraft;
  tareWeight: string;
};

export type InventorySpoolMasterMetadataDraft = {
  colorName: string;
  filamentName: string;
  hexColor: string;
  material: string;
  vendor: string;
};

export type InventorySpoolDetailDraftBaseline = {
  common: InventorySpoolCommonDetailsDraft;
  master: InventorySpoolMasterMetadataDraft;
  spoolId: string;
};

export type ParsedInventorySpoolCommonDetailsDraft = {
  homeLocation: string | null;
  ownerContact: string | null;
  ownerName: string | null;
  ownershipNote: string | null;
  ownershipType: OwnershipType;
  tareWeightGrams: number;
};

export type InventorySpoolCommonDetailsParseResult =
  | { ok: true; value: ParsedInventorySpoolCommonDetailsDraft }
  | { ok: false; error: "borrowed-owner-required" | "invalid-tare-weight" };

function normalizedText(value: string | null | undefined): string {
  return (value ?? "").trim();
}

function normalizedHex(value: string | null | undefined): string {
  return normalizedText(value).toUpperCase();
}

export function buildInventorySpoolDetailDraftBaseline(
  spool: InventorySpool,
): InventorySpoolDetailDraftBaseline {
  const borrowedIn = isBorrowedInOwnership(spool.ownershipType);
  return {
    spoolId: spool.id,
    common: {
      homeLocation: spool.homeLocation ?? "",
      ownershipType: spool.ownershipType,
      ownerName: borrowedIn ? spool.ownerName ?? "" : "",
      ownerContact: borrowedIn ? spool.ownerContact ?? "" : "",
      ownershipNote: borrowedIn ? spool.ownershipNote ?? "" : "",
      purchaseMetadata: buildPurchaseReceiptMetadataDraft({
        purchase_price: spool.purchasePrice ?? null,
        purchase_currency: spool.purchaseCurrency ?? null,
        purchase_date: spool.purchaseDate ?? null,
        batch_code: spool.batchCode ?? null,
        supplier_reference: spool.supplierReference ?? null,
      }),
      tareWeight: String(
        resolveSpoolTareWeight(spool.spoolTareWeightGrams, spool.vendor),
      ),
    },
    master: {
      vendor: spool.vendor,
      material: spool.material,
      filamentName: spool.filamentName,
      colorName: spool.colorName,
      hexColor: spool.hexColor ?? "",
    },
  };
}

export function parseInventorySpoolCommonDetailsDraft(
  draft: InventorySpoolCommonDetailsDraft,
): InventorySpoolCommonDetailsParseResult {
  const parsedTare = Number(draft.tareWeight.trim());
  if (!Number.isInteger(parsedTare) || parsedTare < 0) {
    return { ok: false, error: "invalid-tare-weight" };
  }

  const borrowedIn = isBorrowedInOwnership(draft.ownershipType);
  const ownerName = normalizedText(draft.ownerName);
  if (borrowedIn && !ownerName) {
    return { ok: false, error: "borrowed-owner-required" };
  }

  return {
    ok: true,
    value: {
      homeLocation: normalizedText(draft.homeLocation) || null,
      ownershipType: draft.ownershipType,
      ownerName: borrowedIn ? ownerName : null,
      ownerContact: borrowedIn ? normalizedText(draft.ownerContact) || null : null,
      ownershipNote: borrowedIn ? normalizedText(draft.ownershipNote) || null : null,
      tareWeightGrams: parsedTare,
    },
  };
}

export function inventorySpoolCommonDetailsDraftChanged(
  baseline: InventorySpoolCommonDetailsDraft,
  draft: InventorySpoolCommonDetailsDraft,
): boolean {
  const left = parseInventorySpoolCommonDetailsDraft(baseline);
  const right = parseInventorySpoolCommonDetailsDraft(draft);
  if (!left.ok || !right.ok) {
    return (
      normalizedText(baseline.homeLocation) !== normalizedText(draft.homeLocation) ||
      baseline.ownershipType !== draft.ownershipType ||
      normalizedText(baseline.ownerName) !== normalizedText(draft.ownerName) ||
      normalizedText(baseline.ownerContact) !== normalizedText(draft.ownerContact) ||
      normalizedText(baseline.ownershipNote) !== normalizedText(draft.ownershipNote) ||
      purchaseReceiptMetadataDraftChanged(
        baseline.purchaseMetadata,
        draft.purchaseMetadata,
      ) ||
      normalizedText(baseline.tareWeight) !== normalizedText(draft.tareWeight)
    );
  }
  return (
    JSON.stringify(left.value) !== JSON.stringify(right.value) ||
    purchaseReceiptMetadataDraftChanged(
      baseline.purchaseMetadata,
      draft.purchaseMetadata,
    )
  );
}

export function inventorySpoolMasterMetadataDraftChanged(
  baseline: InventorySpoolMasterMetadataDraft,
  draft: InventorySpoolMasterMetadataDraft,
): boolean {
  return (
    normalizedText(baseline.vendor) !== normalizedText(draft.vendor) ||
    normalizedText(baseline.material) !== normalizedText(draft.material) ||
    normalizedText(baseline.filamentName) !== normalizedText(draft.filamentName) ||
    normalizedText(baseline.colorName) !== normalizedText(draft.colorName) ||
    normalizedHex(baseline.hexColor) !== normalizedHex(draft.hexColor)
  );
}
