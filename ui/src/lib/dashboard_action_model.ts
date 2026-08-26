import { parseDateTimeMs } from "./date_time";
import type { DashboardBambuLiveAttention } from "./dashboard_bambu_live_attention";
import { isSpoolLowStock, resolveSpoolStockGrams } from "./inventory_domain";
import {
  isLoanOverdue,
  normalizeLoanExpectedReturnDate,
} from "./loan_due_state";
import type { NormalizedLoanDetailsRow } from "./loan_row_normalization";
import { resolveSpoolLowStockThreshold } from "./low_stock_policy";
import type { NormalizedSpoolWithMasterRow } from "./spool_row_normalization";
import type { WishlistItemRow } from "./tauri_client";

const DAY_MS = 24 * 60 * 60 * 1_000;

export type DashboardActionAge =
  | {
      basis: "EXPECTED_RETURN_AT";
      elapsedDays: number;
      value: string;
    }
  | {
      basis: "UPDATED_AT" | "CREATED_AT";
      elapsedDays: number;
      value: string;
    }
  | {
      basis: "DETECTED_NOW";
      elapsedDays: null;
      value: null;
    };

export type DashboardPurchaseCandidate = {
  colorName: string;
  filamentName: string;
  masterId: string | null;
  material: string;
  productKey: string;
  vendor: string;
};

export type DashboardOpenPurchaseDuplicate = {
  itemId: string;
  match: "MASTER_ID" | "IDENTITY";
  status: "WISHLIST" | "ON_ORDER";
};

export type DashboardLowStockAction = {
  age: DashboardActionAge;
  candidate: DashboardPurchaseCandidate;
  duplicate: DashboardOpenPurchaseDuplicate | null;
  id: string;
  kind: "LOW_STOCK";
  lowestRemainingG: number;
  spoolCount: number;
  spoolIds: string[];
  thresholdG: number;
};

export type DashboardOverdueLoanAction = {
  age: Extract<DashboardActionAge, { basis: "EXPECTED_RETURN_AT" }>;
  borrowerName: string;
  colorName: string;
  filamentName: string;
  id: string;
  kind: "OVERDUE_LOAN";
  loanId: string;
  material: string;
  spoolId: string;
};

export type DashboardOnOrderAction = {
  age: DashboardActionAge;
  colorName: string;
  filamentName: string;
  id: string;
  itemId: string;
  kind: "ON_ORDER";
  material: string;
  quantity: number;
  vendor: string;
};

export type DashboardBambuTrustAction = {
  age: Extract<DashboardActionAge, { basis: "DETECTED_NOW" }>;
  id: string;
  kind: "BAMBU_TRUST";
  printerId: string;
  printerName: string;
  trustState: DashboardBambuLiveAttention["trustState"];
};

export type DashboardActionItem =
  | DashboardLowStockAction
  | DashboardOverdueLoanAction
  | DashboardOnOrderAction
  | DashboardBambuTrustAction;

export function normalizeDashboardProductToken(value?: string | null): string {
  return (value ?? "").trim().replace(/\s+/gu, " ").toUpperCase();
}

function normalizedMasterId(value?: string | null): string | null {
  const masterId = (value ?? "").trim();
  return masterId || null;
}

export function dashboardProductIdentityKey(
  product: Pick<
    DashboardPurchaseCandidate,
    "vendor" | "material" | "filamentName" | "colorName"
  >,
): string {
  return [product.vendor, product.material, product.filamentName, product.colorName]
    .map(normalizeDashboardProductToken)
    .join("\u001f");
}

export function dashboardPurchaseCandidateKey(
  candidate: Pick<
    DashboardPurchaseCandidate,
    "masterId" | "vendor" | "material" | "filamentName" | "colorName"
  >,
): string {
  const masterId = normalizedMasterId(candidate.masterId);
  return masterId
    ? `master:${masterId}`
    : `product:${dashboardProductIdentityKey(candidate)}`;
}

function openWishlistStatus(raw: string): "WISHLIST" | "ON_ORDER" | null {
  const status = raw.trim().toUpperCase();
  return status === "WISHLIST" || status === "ON_ORDER" ? status : null;
}

function compareOpenWishlistRows(left: WishlistItemRow, right: WishlistItemRow): number {
  const leftStatus = openWishlistStatus(left.status);
  const rightStatus = openWishlistStatus(right.status);
  const statusOrder = (status: "WISHLIST" | "ON_ORDER" | null) =>
    status === "ON_ORDER" ? 0 : 1;
  return (
    statusOrder(leftStatus) - statusOrder(rightStatus) ||
    left.id.localeCompare(right.id)
  );
}

export function findOpenPurchaseDuplicate(
  candidate: Pick<
    DashboardPurchaseCandidate,
    "masterId" | "vendor" | "material" | "filamentName" | "colorName"
  >,
  wishlist: WishlistItemRow[],
): DashboardOpenPurchaseDuplicate | null {
  const openRows = wishlist
    .filter((item) => openWishlistStatus(item.status) !== null)
    .sort(compareOpenWishlistRows);
  const masterId = normalizedMasterId(candidate.masterId);
  const masterMatch = masterId
    ? openRows.find((item) => normalizedMasterId(item.master_id) === masterId)
    : undefined;
  if (masterMatch) {
    return {
      itemId: masterMatch.id,
      match: "MASTER_ID",
      status: openWishlistStatus(masterMatch.status)!,
    };
  }

  const identity = dashboardProductIdentityKey(candidate);
  const identityMatch = openRows.find(
    (item) =>
      dashboardProductIdentityKey({
        colorName: item.color_name,
        filamentName: item.filament_name,
        material: item.material,
        vendor: item.vendor,
      }) === identity,
  );
  if (!identityMatch) {
    return null;
  }
  return {
    itemId: identityMatch.id,
    match: "IDENTITY",
    status: openWishlistStatus(identityMatch.status)!,
  };
}

function calendarDayNumber(value: string): number | null {
  const normalized = normalizeLoanExpectedReturnDate(value);
  if (!normalized) {
    return null;
  }
  const [year, month, day] = normalized.split("-").map(Number);
  return Math.trunc(Date.UTC(year!, month! - 1, day!) / DAY_MS);
}

function calendarElapsedDays(earlier: string, later: string): number {
  const earlierDay = calendarDayNumber(earlier);
  const laterDay = calendarDayNumber(later);
  if (earlierDay == null || laterDay == null) {
    return 0;
  }
  return Math.max(0, laterDay - earlierDay);
}

function timestampAge(
  updatedAt: string,
  createdAt: string,
  now: Date,
): DashboardActionAge {
  const updatedMs = parseDateTimeMs(updatedAt);
  if (updatedMs != null) {
    return {
      basis: "UPDATED_AT",
      elapsedDays: Math.max(0, Math.floor((now.getTime() - updatedMs) / DAY_MS)),
      value: updatedAt,
    };
  }
  const createdMs = parseDateTimeMs(createdAt);
  if (createdMs != null) {
    return {
      basis: "CREATED_AT",
      elapsedDays: Math.max(0, Math.floor((now.getTime() - createdMs) / DAY_MS)),
      value: createdAt,
    };
  }
  return { basis: "DETECTED_NOW", elapsedDays: null, value: null };
}

type LowStockGroup = {
  candidate: DashboardPurchaseCandidate;
  lowestRemainingG: number;
  spoolIds: string[];
  thresholdG: number;
};

function buildLowStockActions(
  spoolRows: NormalizedSpoolWithMasterRow[],
  wishlist: WishlistItemRow[],
): DashboardLowStockAction[] {
  const groups = new Map<string, LowStockGroup>();
  for (const row of spoolRows) {
    const thresholdG = resolveSpoolLowStockThreshold(row).thresholdGrams;
    const remainingG = resolveSpoolStockGrams({
      currentWeightGrams: row.spool.current_weight_g,
      initialWeightGrams: row.spool.initial_weight_g,
      remainingGrams: row.spool.remaining_g,
      status: row.spool.normalized_status,
    });
    if (
      !isSpoolLowStock(
        { remainingGrams: remainingG, status: row.spool.normalized_status },
        thresholdG,
      )
    ) {
      continue;
    }
    const candidate: DashboardPurchaseCandidate = {
      colorName: row.master.color_name,
      filamentName: row.master.filament_name,
      masterId: normalizedMasterId(row.spool.master_id || row.master.id),
      material: row.master.material,
      productKey: "",
      vendor: row.master.vendor,
    };
    candidate.productKey = dashboardPurchaseCandidateKey(candidate);
    const existing = groups.get(candidate.productKey);
    if (existing) {
      existing.lowestRemainingG = Math.min(existing.lowestRemainingG, remainingG);
      existing.spoolIds.push(row.spool.id);
      existing.thresholdG = Math.max(existing.thresholdG, thresholdG);
      continue;
    }
    groups.set(candidate.productKey, {
      candidate,
      lowestRemainingG: remainingG,
      spoolIds: [row.spool.id],
      thresholdG,
    });
  }

  return [...groups.values()]
    .flatMap((group): DashboardLowStockAction[] => {
      const spoolIds = [...group.spoolIds].sort();
      const duplicate = findOpenPurchaseDuplicate(group.candidate, wishlist);
      if (duplicate) {
        return [];
      }
      return [{
        age: { basis: "DETECTED_NOW", elapsedDays: null, value: null },
        candidate: group.candidate,
        duplicate: null,
        id: `low-stock:${group.candidate.productKey}`,
        kind: "LOW_STOCK",
        lowestRemainingG: group.lowestRemainingG,
        spoolCount: spoolIds.length,
        spoolIds,
        thresholdG: group.thresholdG,
      }];
    })
    .sort(
      (left, right) =>
        left.lowestRemainingG - right.lowestRemainingG ||
        left.candidate.productKey.localeCompare(right.candidate.productKey),
    );
}

function buildOverdueLoanActions(
  loans: NormalizedLoanDetailsRow[],
  today: string,
): DashboardOverdueLoanAction[] {
  return loans
    .filter((loan) => isLoanOverdue(loan, today))
    .map((row): DashboardOverdueLoanAction => {
      const expectedReturnAt = normalizeLoanExpectedReturnDate(
        row.loan.expected_return_at,
      )!;
      return {
        age: {
          basis: "EXPECTED_RETURN_AT",
          elapsedDays: calendarElapsedDays(expectedReturnAt, today),
          value: expectedReturnAt,
        },
        borrowerName:
          row.loan.counterparty_name?.trim() || row.loan.borrower_name.trim(),
        colorName: row.color_name?.trim() ?? "",
        filamentName: row.filament_name?.trim() || row.loan.spool_id,
        id: `overdue-loan:${row.loan.id}`,
        kind: "OVERDUE_LOAN",
        loanId: row.loan.id,
        material: row.material?.trim() ?? "",
        spoolId: row.loan.spool_id,
      };
    })
    .sort(
      (left, right) =>
        left.age.value.localeCompare(right.age.value) ||
        left.loanId.localeCompare(right.loanId),
    );
}

function buildOnOrderActions(
  wishlist: WishlistItemRow[],
  now: Date,
): DashboardOnOrderAction[] {
  return wishlist
    .filter((item) => openWishlistStatus(item.status) === "ON_ORDER")
    .map((item): DashboardOnOrderAction => ({
      age: timestampAge(item.updated_at, item.created_at, now),
      colorName: item.color_name,
      filamentName: item.filament_name,
      id: `on-order:${item.id}`,
      itemId: item.id,
      kind: "ON_ORDER",
      material: item.material,
      quantity: Math.max(1, Math.trunc(item.quantity || 1)),
      vendor: item.vendor,
    }))
    .sort((left, right) => {
      const leftMs = left.age.value ? parseDateTimeMs(left.age.value) : null;
      const rightMs = right.age.value ? parseDateTimeMs(right.age.value) : null;
      return (
        (leftMs ?? Number.POSITIVE_INFINITY) -
          (rightMs ?? Number.POSITIVE_INFINITY) ||
        left.itemId.localeCompare(right.itemId)
      );
    });
}

function buildBambuTrustActions(
  attention: DashboardBambuLiveAttention[],
): DashboardBambuTrustAction[] {
  return [...attention]
    .sort(
      (left, right) =>
        left.printerName.localeCompare(right.printerName) ||
        left.printerId.localeCompare(right.printerId),
    )
    .map((item) => ({
      age: { basis: "DETECTED_NOW", elapsedDays: null, value: null },
      id: `bambu-trust:${item.printerId}`,
      kind: "BAMBU_TRUST",
      printerId: item.printerId,
      printerName: item.printerName,
      trustState: item.trustState,
    }));
}

export function buildDashboardActionItems(params: {
  bambuLiveAttention: DashboardBambuLiveAttention[];
  loans: NormalizedLoanDetailsRow[];
  now: Date;
  spoolRows: NormalizedSpoolWithMasterRow[];
  today: string;
  wishlist: WishlistItemRow[];
}): DashboardActionItem[] {
  return [
    ...buildOverdueLoanActions(params.loans, params.today),
    ...buildLowStockActions(params.spoolRows, params.wishlist),
    ...buildOnOrderActions(params.wishlist, params.now),
    ...buildBambuTrustActions(params.bambuLiveAttention),
  ];
}
