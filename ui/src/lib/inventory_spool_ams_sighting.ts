import { parseDateTimeMs } from "./date_time";
import type { InventorySpool } from "./inventory_list_model";

export type InventorySpoolAmsSightingSource =
  | "saved_rfid"
  | "live_identity"
  | "live_activity";

export type InventorySpoolAmsSighting = {
  observedAt: string;
  source: InventorySpoolAmsSightingSource;
};

export type InventorySpoolAmsSightingSlot = {
  liveIsActive?: boolean | null;
  liveLoaded?: boolean | null;
  liveMatchedInventorySpoolId?: string | null;
  liveObservedRfidTag?: string | null;
  liveLastIdentitySeenAt?: string | null;
  livePrinterLastSeenAt?: string | null;
  liveTrayUuid?: string | null;
};

type Candidate = InventorySpoolAmsSighting & {
  priority: number;
};

function normalizedIdentity(value: string | null | undefined): string | null {
  return value?.trim().toUpperCase() || null;
}

function normalizedTimestamp(value: string | null | undefined): string | null {
  return value?.trim() || null;
}

function liveIdentityMatchesSpool(
  spool: Pick<InventorySpool, "id" | "rfidTag">,
  slot: InventorySpoolAmsSightingSlot,
): boolean {
  const matchedSpoolId = slot.liveMatchedInventorySpoolId?.trim();
  if (matchedSpoolId) {
    return matchedSpoolId === spool.id;
  }

  const savedRfid = normalizedIdentity(spool.rfidTag);
  if (!savedRfid) {
    return false;
  }

  return [slot.liveTrayUuid, slot.liveObservedRfidTag].some(
    (identity) => normalizedIdentity(identity) === savedRfid,
  );
}

function liveIdentityContradictsSpool(
  spool: Pick<InventorySpool, "id" | "rfidTag">,
  slot: InventorySpoolAmsSightingSlot,
): boolean {
  const matchedSpoolId = slot.liveMatchedInventorySpoolId?.trim();
  if (matchedSpoolId) {
    return matchedSpoolId !== spool.id;
  }

  const savedRfid = normalizedIdentity(spool.rfidTag);
  const liveTrayUuid = normalizedIdentity(slot.liveTrayUuid);
  return Boolean(savedRfid && liveTrayUuid && liveTrayUuid !== savedRfid);
}

function isBetterCandidate(next: Candidate, current: Candidate | null): boolean {
  if (!current) {
    return true;
  }

  const nextMs = parseDateTimeMs(next.observedAt);
  const currentMs = parseDateTimeMs(current.observedAt);
  if (nextMs != null && currentMs != null) {
    return nextMs > currentMs || (nextMs === currentMs && next.priority > current.priority);
  }
  if (nextMs != null) {
    return true;
  }
  if (currentMs != null) {
    return false;
  }
  return next.priority > current.priority;
}

function selectBestCandidate(candidates: Candidate[]): InventorySpoolAmsSighting | null {
  let best: Candidate | null = null;
  for (const candidate of candidates) {
    if (isBetterCandidate(candidate, best)) {
      best = candidate;
    }
  }
  return best ? { observedAt: best.observedAt, source: best.source } : null;
}

export function buildInventorySpoolAmsSighting(
  spool: Pick<InventorySpool, "id" | "rfidObservedAt" | "rfidTag">,
  assignedSlot: InventorySpoolAmsSightingSlot | null | undefined,
): InventorySpoolAmsSighting | null {
  const candidates: Candidate[] = [];
  const savedObservedAt = normalizedTimestamp(spool.rfidObservedAt);
  if (savedObservedAt) {
    candidates.push({
      observedAt: savedObservedAt,
      source: "saved_rfid",
      priority: 0,
    });
  }

  if (assignedSlot) {
    const liveIdentitySeenAt = normalizedTimestamp(assignedSlot.liveLastIdentitySeenAt);
    if (liveIdentitySeenAt && liveIdentityMatchesSpool(spool, assignedSlot)) {
      candidates.push({
        observedAt: liveIdentitySeenAt,
        source: "live_identity",
        priority: 1,
      });
    }

    const liveActivitySeenAt = normalizedTimestamp(assignedSlot.livePrinterLastSeenAt);
    const slotLoadedOrActive =
      assignedSlot.liveLoaded === true || assignedSlot.liveIsActive === true;
    if (
      liveActivitySeenAt &&
      slotLoadedOrActive &&
      !liveIdentityContradictsSpool(spool, assignedSlot)
    ) {
      candidates.push({
        observedAt: liveActivitySeenAt,
        source: "live_activity",
        priority: 2,
      });
    }
  }

  return selectBestCandidate(candidates);
}
