import { createInventorySpoolFromMaster, updateInventorySpoolRfidTag } from "./spool_writes";
import { buildSlotCatalogOnboardingPostCreateWrites } from "./printer_slot_model";
import {
  acceptBambuLiveWeightEstimate,
  acceptLibrarySyncHostBambuLiveWeightEstimate,
  assignLibrarySyncHostPrinterSlot,
  assignPrinterSlot,
  operateLibrarySyncHostPrinterSlot,
  operatePrinterSlot,
  recordLibrarySyncHostPrintUsage,
  recordPrintUsage,
  updateLibrarySyncHostSpoolWeight,
  updateSpoolWeight,
  type AssignPrinterSlotInput,
  type CreateSpoolInput,
  type PrinterAmsSlotRow,
  type AcceptBambuLiveWeightEstimateInput,
  type PrinterSlotOperationInput,
} from "./tauri_client";
import type {
  PreparedMeasuredWeightUpdate,
  PreparedPrinterSlotAssignment,
} from "./printer_slot_model";
import { requireClientHostWriteTarget, resolveClientHostCacheTarget } from "./host_write_target";
import { createAppError } from "./error_text";

export type PrinterSlotWriteTarget = {
  clientReadOnly: boolean;
  clientHostBaseUrl: string | null;
  clientLibraryId: string | null;
  clientTargetGeneration?: number | null;
};

type PrinterSlotWriteDependencies = {
  operateHostPrinterSlot?: typeof operateLibrarySyncHostPrinterSlot;
  operateLocalPrinterSlot?: typeof operatePrinterSlot;
  acceptHostAmsWeightEstimate?: typeof acceptLibrarySyncHostBambuLiveWeightEstimate;
  acceptLocalAmsWeightEstimate?: typeof acceptBambuLiveWeightEstimate;
  assignHostPrinterSlot?: typeof assignLibrarySyncHostPrinterSlot;
  assignLocalPrinterSlot?: typeof assignPrinterSlot;
  recordHostPrintUsage?: typeof recordLibrarySyncHostPrintUsage;
  recordLocalPrintUsage?: typeof recordPrintUsage;
  updateHostSpoolWeight?: typeof updateLibrarySyncHostSpoolWeight;
  updateLocalSpoolWeight?: typeof updateSpoolWeight;
};

function reviewedLibrary(target: PrinterSlotWriteTarget) {
  const libraryId = target.clientLibraryId?.trim();
  const generation = target.clientTargetGeneration;
  if (!libraryId || generation == null || !Number.isSafeInteger(generation) || generation < 0) {
    throw createAppError("common.invalid_request");
  }
  return { libraryId, generation };
}

export async function writePrinterSlotOperation(
  target: PrinterSlotWriteTarget & { clientTargetGeneration: number | null },
  operation: PrinterSlotOperationInput,
  dependencies: PrinterSlotWriteDependencies = {},
) {
  if (target.clientReadOnly) {
    const hostTarget = resolveClientHostCacheTarget(target);
    if (!hostTarget) {
      throw createAppError("common.invalid_request");
    }
    const operateHost = dependencies.operateHostPrinterSlot ?? operateLibrarySyncHostPrinterSlot;
    await operateHost(
      hostTarget.baseUrl, hostTarget.libraryId, hostTarget.targetGeneration, operation,
    );
    return;
  }
  const operateLocal = dependencies.operateLocalPrinterSlot ?? operatePrinterSlot;
  const { libraryId, generation } = reviewedLibrary(target);
  await operateLocal(operation, libraryId, generation);
}

export async function writeAcceptedBambuLiveWeightEstimate(
  target: PrinterSlotWriteTarget,
  input: AcceptBambuLiveWeightEstimateInput,
  dependencies: PrinterSlotWriteDependencies = {},
) {
  const acceptHost =
    dependencies.acceptHostAmsWeightEstimate ?? acceptLibrarySyncHostBambuLiveWeightEstimate;
  const acceptLocal = dependencies.acceptLocalAmsWeightEstimate ?? acceptBambuLiveWeightEstimate;

  const { libraryId, generation } = reviewedLibrary(target);
  if (target.clientReadOnly) {
    const hostTarget = requireClientHostWriteTarget(target, "Host connection details are missing for this printer action.");
    await acceptHost(hostTarget.baseUrl, libraryId, input, generation);
    return;
  }
  await acceptLocal(input, libraryId, generation);
}

export async function writePrinterSlotAssignment(
  target: PrinterSlotWriteTarget,
  input: AssignPrinterSlotInput,
  dependencies: PrinterSlotWriteDependencies = {},
) {
  const assignHostPrinterSlot =
    dependencies.assignHostPrinterSlot ?? assignLibrarySyncHostPrinterSlot;
  const assignLocalPrinterSlot = dependencies.assignLocalPrinterSlot ?? assignPrinterSlot;

  if (target.clientReadOnly) {
    const hostTarget = requireClientHostWriteTarget(
      target,
      "Host connection details are missing for this printer action.",
    );
    await assignHostPrinterSlot(hostTarget.baseUrl, hostTarget.libraryId, input, target.clientTargetGeneration ?? undefined);
    return;
  }

  await assignLocalPrinterSlot(input);
}

export async function registerPrinterSlotCatalogSpool(
  target: PrinterSlotWriteTarget & { clientTargetGeneration: number | null },
  spool: CreateSpoolInput,
  observation: { printerId: string; slot: PrinterAmsSlotRow; observedRfid: string; rfidObservedAt: string },
) {
  const createdSpoolId = await createInventorySpoolFromMaster(spool, target);
  const { rfidInput, assignInput } = buildSlotCatalogOnboardingPostCreateWrites({
    ...observation, createdSpoolId,
  });
  await updateInventorySpoolRfidTag(rfidInput, target);
  await writePrinterSlotAssignment(target, assignInput);
}

export async function writePreparedMeasuredWeightUpdate(
  target: PrinterSlotWriteTarget,
  printerId: string,
  spoolId: string,
  preparedWeight: PreparedMeasuredWeightUpdate,
  dependencies: PrinterSlotWriteDependencies = {},
) {
  const recordHostPrintUsage =
    dependencies.recordHostPrintUsage ?? recordLibrarySyncHostPrintUsage;
  const recordLocalPrintUsage = dependencies.recordLocalPrintUsage ?? recordPrintUsage;
  const updateHostSpoolWeight =
    dependencies.updateHostSpoolWeight ?? updateLibrarySyncHostSpoolWeight;
  const updateLocalSpoolWeight = dependencies.updateLocalSpoolWeight ?? updateSpoolWeight;

  if (target.clientReadOnly) {
    const hostTarget = requireClientHostWriteTarget(
      target,
      "Host connection details are missing for this printer action.",
    );
    if (preparedWeight.clientAction === "record_usage") {
      await recordHostPrintUsage(hostTarget.baseUrl, hostTarget.libraryId, {
        printer_id: printerId,
        spool_id: spoolId,
        grams: preparedWeight.usedGrams,
        job_name: null,
        success: true,
      });
      return;
    }
    await updateHostSpoolWeight(
      hostTarget.baseUrl,
      hostTarget.libraryId,
      spoolId,
      preparedWeight.safeMeasuredTotal,
    );
    return;
  }

  if (preparedWeight.localAction === "record_usage") {
    await recordLocalPrintUsage({
      printer_id: printerId,
      spool_id: spoolId,
      grams: preparedWeight.usedGrams,
      job_name: null,
      success: true,
    });
    return;
  }

  if (preparedWeight.localAction === "update_weight") {
    await updateLocalSpoolWeight(spoolId, preparedWeight.safeMeasuredTotal);
  }
}

export async function writePreparedPrinterSlotAssignment(
  target: PrinterSlotWriteTarget,
  preparedAssignment: PreparedPrinterSlotAssignment,
  dependencies: PrinterSlotWriteDependencies = {},
) {
  await writePrinterSlotAssignment(target, preparedAssignment.assignInput, dependencies);
}

export async function writeSpoolMeasuredWeight(
  target: PrinterSlotWriteTarget,
  spoolId: string,
  grams: number,
) {
  if (target.clientReadOnly) {
    const hostTarget = requireClientHostWriteTarget(
      target,
      "Host connection details are missing for this printer action.",
    );
    await updateLibrarySyncHostSpoolWeight(hostTarget.baseUrl, hostTarget.libraryId, spoolId, grams);
    return;
  }

  await updateSpoolWeight(spoolId, grams);
}
